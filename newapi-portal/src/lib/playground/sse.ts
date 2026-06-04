"use client";

/**
 * OpenAI 兼容 SSE 流解析器（客户端纯函数）。
 *
 * 从 `ReadableStreamDefaultReader` 增量消费字节，按 SSE 空行边界切分事件，
 * 拼接同一事件内的多行 `data:`，识别 `[DONE]`，输出标准化分片：
 * - `{ type: "delta", content }`  增量文本
 * - `{ type: "usage", usage }`    末块用量统计
 * - `{ type: "done" }`            收到 [DONE] 或流结束
 */

export type SSEUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type SSEChunk =
  | { type: "delta"; content: string }
  | { type: "usage"; usage: SSEUsage }
  | { type: "done" };

export async function* parseSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<SSEChunk> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      for (const chunk of parseEvent(rawEvent)) {
        if (chunk.type === "done") {
          yield chunk;
          return;
        }
        yield chunk;
      }

      boundary = buffer.indexOf("\n\n");
    }
  }

  // 处理收尾残留（无终止 \n\n 的情况）
  if (buffer.trim()) {
    for (const chunk of parseEvent(buffer)) {
      yield chunk;
      if (chunk.type === "done") return;
    }
  }

  yield { type: "done" };
}

function* parseEvent(rawEvent: string): Generator<SSEChunk> {
  const dataLines: string[] = [];

  for (const line of rawEvent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    dataLines.push(trimmed.slice(5).trim());
  }

  const data = dataLines.join("\n").trim();
  if (!data) return;
  if (data === "[DONE]") {
    yield { type: "done" };
    return;
  }

  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return;
  }

  if (!isRecord(json)) return;

  const choices = json.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0];
    if (isRecord(first) && isRecord(first.delta)) {
      const content = first.delta.content;
      if (typeof content === "string" && content) {
        yield { type: "delta", content };
      }
    }
  }

  if (isRecord(json.usage)) {
    yield { type: "usage", usage: json.usage as SSEUsage };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
