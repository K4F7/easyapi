#!/usr/bin/env python3
"""
OpenAI-compatible chat completions stress tester.

Usage examples:
  python web/test.py --total 200 --concurrency 20 --model gpt-5.5

  python web/test.py --api-key sk-... --duration 60 --concurrency 50 --message "hello"
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from typing import Any


# =========================
# 全局可调参数：日常调试优先改这里；命令行参数仍可覆盖这些默认值。
# =========================

# 接口地址：OpenAI 兼容的 chat completions endpoint。
DEFAULT_URL = "https://easyapi.work/v1/chat/completions"

# API Key
DEFAULT_API_KEY = "sk-"

# 模型名称。
DEFAULT_MODEL = "gpt-5.5"

# 请求内容：system 可为空，message 是用户输入。
DEFAULT_SYSTEM = ""
DEFAULT_MESSAGE = "请用一句话介绍你自己。"

# 压测规模：DURATION_SECONDS > 0 时按持续时间压测，否则按 TOTAL_REQUESTS 压测。
DEFAULT_TOTAL_REQUESTS = 100
DEFAULT_DURATION_SECONDS = 0.0
DEFAULT_CONCURRENCY = 20
DEFAULT_TIMEOUT_SECONDS = 120.0

# OpenAI 请求参数：None 表示不发送该字段。
DEFAULT_STREAM = False
DEFAULT_TEMPERATURE = 0.7
DEFAULT_TOP_P = None
DEFAULT_MAX_TOKENS = 128
DEFAULT_PRESENCE_PENALTY = None
DEFAULT_FREQUENCY_PENALTY = None
DEFAULT_SEED = None
DEFAULT_USER = None

# 额外请求字段，格式示例：["response_format={\"type\":\"json_object\"}", "stop=[\"END\"]"]。
DEFAULT_EXTRA_FIELDS: list[str] = []

# 是否禁用首批请求同步起跑；False 更适合模拟瞬时并发。
DEFAULT_NO_SYNC_START = False


UNSUPPORTED_PARAMS = {"reasoning", "reasoning_content"}


@dataclass
class Result:
    ok: bool
    status: int | None
    latency: float
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    output: str = ""
    error: str = ""


def extract_non_stream_output(data: dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        return ""

    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
            elif isinstance(item, str):
                parts.append(item)
        return "".join(parts)

    text = choices[0].get("text")
    return text if isinstance(text, str) else ""


def extract_stream_output(body: bytes) -> str:
    parts: list[str] = []
    for raw_line in body.decode("utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line.startswith("data:"):
            continue
        data_text = line[5:].strip()
        if not data_text or data_text == "[DONE]":
            continue
        try:
            data = json.loads(data_text)
        except json.JSONDecodeError:
            continue
        choices = data.get("choices") or []
        if not choices:
            continue
        delta = choices[0].get("delta") or {}
        content = delta.get("content")
        if isinstance(content, str):
            parts.append(content)
    return "".join(parts)


def print_result_output(index: int, result: Result) -> None:
    print(f"\n--- Request #{index} | status={result.status or 'ERR'} | latency={result.latency:.3f}s ---")
    if result.output:
        print(result.output)
    elif result.error:
        print(f"ERROR: {result.error}")
    else:
        print("<empty output>")



def remove_unsupported_parameters(data: Any) -> Any:
    if isinstance(data, dict):
        return {
            key: remove_unsupported_parameters(value)
            for key, value in data.items()
            if key not in UNSUPPORTED_PARAMS
        }
    if isinstance(data, list):
        return [remove_unsupported_parameters(item) for item in data]
    return data


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    messages: list[dict[str, str]] = []
    if args.system:
        messages.append({"role": "system", "content": args.system})
    messages.append({"role": "user", "content": args.message})

    payload: dict[str, Any] = {
        "model": args.model,
        "messages": messages,
        "stream": args.stream,
    }

    optional_fields = {
        "temperature": args.temperature,
        "top_p": args.top_p,
        "max_tokens": args.max_tokens,
        "presence_penalty": args.presence_penalty,
        "frequency_penalty": args.frequency_penalty,
        "seed": args.seed,
        "user": args.user,
    }
    for key, value in optional_fields.items():
        if value is not None:
            payload[key] = value

    if args.extra:
        for item in args.extra:
            key, raw_value = item.split("=", 1)
            try:
                payload[key] = json.loads(raw_value)
            except json.JSONDecodeError:
                payload[key] = raw_value

    return payload


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    index = int((len(sorted_values) - 1) * p)
    return sorted_values[index]


def request_once(args: argparse.Namespace, payload_bytes: bytes, start_barrier: threading.Barrier | None) -> Result:
    if start_barrier is not None:
        try:
            start_barrier.wait()
        except threading.BrokenBarrierError:
            pass

    request_id = uuid.uuid4().hex
    headers = {
        "Authorization": f"Bearer {args.api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream" if args.stream else "application/json",
        "User-Agent": "python-requests/2.32.3",
        "X-Request-ID": request_id,
    }
    req = urllib.request.Request(args.url, data=payload_bytes, headers=headers, method="POST")

    started = time.perf_counter()
    status: int | None = None
    try:
        with urllib.request.urlopen(req, timeout=args.timeout) as resp:
            status = resp.status
            body = resp.read()
        latency = time.perf_counter() - started

        usage = {}
        output = ""
        if body:
            if args.stream:
                output = extract_stream_output(body)
            else:
                try:
                    data = json.loads(body.decode("utf-8", errors="replace"))
                    usage = data.get("usage") or {}
                    output = extract_non_stream_output(data)
                except json.JSONDecodeError:
                    output = body.decode("utf-8", errors="replace")

        return Result(
            ok=200 <= (status or 0) < 300,
            status=status,
            latency=latency,
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
            total_tokens=int(usage.get("total_tokens") or 0),
            output=output,
        )
    except urllib.error.HTTPError as exc:
        latency = time.perf_counter() - started
        status = exc.code
        body = exc.read().decode("utf-8", errors="replace")[:500]
        return Result(False, status, latency, error=f"HTTP {status}: {body}")
    except Exception as exc:
        latency = time.perf_counter() - started
        return Result(False, status, latency, error=f"{type(exc).__name__}: {exc}")


def print_summary(results: list[Result], elapsed: float) -> None:
    total = len(results)
    ok = sum(1 for item in results if item.ok)
    failed = total - ok
    latencies = [item.latency for item in results]
    ok_latencies = [item.latency for item in results if item.ok]
    status_counts: dict[str, int] = {}
    errors: dict[str, int] = {}

    for item in results:
        status_counts[str(item.status or "ERR")] = status_counts.get(str(item.status or "ERR"), 0) + 1
        if item.error:
            errors[item.error] = errors.get(item.error, 0) + 1

    total_tokens = sum(item.total_tokens for item in results)
    prompt_tokens = sum(item.prompt_tokens for item in results)
    completion_tokens = sum(item.completion_tokens for item in results)

    print("\n=== Stress Test Summary ===")
    print(f"Total requests : {total}")
    print(f"Succeeded      : {ok}")
    print(f"Failed         : {failed}")
    print(f"Elapsed        : {elapsed:.2f}s")
    print(f"QPS            : {(total / elapsed) if elapsed > 0 else 0:.2f}")
    print(f"Success QPS    : {(ok / elapsed) if elapsed > 0 else 0:.2f}")
    print(f"Status counts  : {status_counts}")

    if latencies:
        print("\nLatency all requests:")
        print(f"  avg={statistics.mean(latencies):.3f}s min={min(latencies):.3f}s max={max(latencies):.3f}s")
        print(f"  p50={percentile(latencies, 0.50):.3f}s p90={percentile(latencies, 0.90):.3f}s p95={percentile(latencies, 0.95):.3f}s p99={percentile(latencies, 0.99):.3f}s")

    if ok_latencies:
        print("\nLatency successful requests:")
        print(f"  avg={statistics.mean(ok_latencies):.3f}s min={min(ok_latencies):.3f}s max={max(ok_latencies):.3f}s")
        print(f"  p50={percentile(ok_latencies, 0.50):.3f}s p90={percentile(ok_latencies, 0.90):.3f}s p95={percentile(ok_latencies, 0.95):.3f}s p99={percentile(ok_latencies, 0.99):.3f}s")

    if total_tokens:
        print("\nToken usage:")
        print(f"  prompt={prompt_tokens} completion={completion_tokens} total={total_tokens}")
        print(f"  tokens/s={(total_tokens / elapsed) if elapsed > 0 else 0:.2f}")

    if errors:
        print("\nTop errors:")
        for error, count in sorted(errors.items(), key=lambda kv: kv[1], reverse=True)[:10]:
            print(f"  [{count}] {error}")


def parse_args() -> argparse.Namespace:
    # 命令行参数只用于临时覆盖全局默认值；不传参数时完全使用上面的全局配置。
    parser = argparse.ArgumentParser(description="OpenAI-compatible chat completions concurrent stress tester")
    parser.add_argument("--url", default=DEFAULT_URL, help="接口地址，默认读取 DEFAULT_URL")
    parser.add_argument("--api-key", default=DEFAULT_API_KEY, help="API Key，默认读取 DEFAULT_API_KEY")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="模型名称，默认读取 DEFAULT_MODEL")
    parser.add_argument("--message", default=DEFAULT_MESSAGE, help="用户消息，默认读取 DEFAULT_MESSAGE")
    parser.add_argument("--system", default=DEFAULT_SYSTEM, help="系统提示词，默认读取 DEFAULT_SYSTEM")
    parser.add_argument("--total", type=int, default=DEFAULT_TOTAL_REQUESTS, help="总请求数；当 --duration > 0 时忽略")
    parser.add_argument("--duration", type=float, default=DEFAULT_DURATION_SECONDS, help="持续压测秒数；0 表示使用 --total")
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY, help="并发 worker 数")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS, help="单次请求超时时间，单位秒")
    parser.add_argument("--stream", action="store_true", default=DEFAULT_STREAM, help="启用 OpenAI stream 模式")
    parser.add_argument("--temperature", type=float, default=DEFAULT_TEMPERATURE, help="采样温度")
    parser.add_argument("--top-p", dest="top_p", type=float, default=DEFAULT_TOP_P, help="top_p 采样参数")
    parser.add_argument("--max-tokens", dest="max_tokens", type=int, default=DEFAULT_MAX_TOKENS, help="最大输出 token 数")
    parser.add_argument("--presence-penalty", dest="presence_penalty", type=float, default=DEFAULT_PRESENCE_PENALTY, help="presence_penalty 参数")
    parser.add_argument("--frequency-penalty", dest="frequency_penalty", type=float, default=DEFAULT_FREQUENCY_PENALTY, help="frequency_penalty 参数")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="随机种子")
    parser.add_argument("--user", default=DEFAULT_USER, help="OpenAI user 字段")
    parser.add_argument("--extra", action="append", default=list(DEFAULT_EXTRA_FIELDS), help="额外 JSON 字段，格式 key=value，value 可为 JSON")
    parser.add_argument("--no-sync-start", action="store_true", default=DEFAULT_NO_SYNC_START, help="不让首批请求同步起跑")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.api_key:
        print("Missing API key. Set DEFAULT_API_KEY in source code or pass --api-key.", file=sys.stderr)
        return 2
    if args.concurrency <= 0:
        print("--concurrency must be > 0", file=sys.stderr)
        return 2
    if args.total <= 0 and args.duration <= 0:
        print("--total must be > 0 when --duration is 0", file=sys.stderr)
        return 2

    payload = remove_unsupported_parameters(build_payload(args))
    payload_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    results: list[Result] = []
    started = time.perf_counter()

    print(f"Endpoint    : {args.url}")
    print(f"Model       : {args.model}")
    print(f"Concurrency : {args.concurrency}")
    print(f"Mode        : {'duration ' + str(args.duration) + 's' if args.duration > 0 else 'total ' + str(args.total)}")
    print(f"Stream      : {args.stream}")

    if args.duration > 0:
        stop_at = started + args.duration
        submitted = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
            pending: set[concurrent.futures.Future[Result]] = set()
            while time.perf_counter() < stop_at or pending:
                while time.perf_counter() < stop_at and len(pending) < args.concurrency:
                    pending.add(executor.submit(request_once, args, payload_bytes, None))
                    submitted += 1
                done, pending = concurrent.futures.wait(pending, timeout=0.1, return_when=concurrent.futures.FIRST_COMPLETED)
                for future in done:
                    result = future.result()
                    results.append(result)
                    print_result_output(len(results), result)
                    if len(results) % max(1, args.concurrency) == 0:
                        print(f"completed={len(results)} submitted={submitted}", end="\r")
    else:
        first_wave = min(args.concurrency, args.total)
        barrier = None if args.no_sync_start or first_wave <= 1 else threading.Barrier(first_wave)
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
            futures = [executor.submit(request_once, args, payload_bytes, barrier if i < first_wave else None) for i in range(args.total)]
            for idx, future in enumerate(concurrent.futures.as_completed(futures), 1):
                result = future.result()
                results.append(result)
                print_result_output(idx, result)
                if idx % max(1, args.concurrency) == 0 or idx == args.total:
                    print(f"completed={idx}/{args.total}", end="\r")

    elapsed = time.perf_counter() - started
    print_summary(results, elapsed)
    return 0 if all(item.ok for item in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
