import "server-only";

import { getToken, revealTokenKey } from "./tokens";
import type { NewApiAuth } from "./types";

/**
 * 解析某个令牌对应的真实 `sk-` 密钥。
 *
 * 安全约束：
 * - 仅用「当前用户」的 auth 去查 / 取 key，绝不使用管理员 auth 替别人取。
 * - 先 `getToken` 校验令牌存在，并核对返回的 `user_id` 与 `auth.userId` 一致，
 *   防止越权使用他人令牌。
 * - 返回的 key 仅供 Route Handler 内部注入 `Authorization` 头，绝不回传前端 / 写日志。
 */
export async function resolvePlaygroundKey(
  auth: NewApiAuth,
  tokenId: number,
): Promise<string> {
  await assertPlaygroundTokenAccess(auth, tokenId);

  return revealTokenKey(auth, tokenId);
}

export async function assertPlaygroundTokenAccess(
  auth: NewApiAuth,
  tokenId: number,
): Promise<void> {
  const token = await getToken(auth, tokenId);

  if (!token || typeof token.id !== "number") {
    throw new PlaygroundError("令牌不存在", 404);
  }

  if (
    token.user_id !== undefined &&
    String(token.user_id) !== String(auth.userId)
  ) {
    throw new PlaygroundError("无权使用该令牌", 403);
  }
}

export class PlaygroundError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PlaygroundError";
    this.status = status;
  }
}

/**
 * 透传上游 OpenAI 兼容 `/v1/chat/completions`（流式）。
 *
 * - 不走 `newApiRequest`（那只覆盖 `/api/*` 管理面、用 accessToken）。
 * - 不设超时（流式长连接，交由 `signal` / 客户端 abort 控制）。
 * - 直接返回原始 `Response`，调用方透传 `body`（SSE）。
 */
export async function streamChatCompletion(
  baseUrl: string,
  key: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
    cache: "no-store",
  });
}

/**
 * 透传上游 OpenAI 兼容 `/v1/images/generations`。
 *
 * 调用方必须先通过 `resolvePlaygroundKey` 校验令牌归属并解析真实 key。
 * 这里仅负责把真实 key 注入上游 Authorization，不返回 / 记录该 key。
 */
export async function createImageGeneration(
  baseUrl: string,
  key: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${baseUrl}/v1/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
  });
}

/**
 * 拉取上游可用模型列表（OpenAI 兼容 `/v1/models`）。
 * 返回 `{ id }[]`。上游不可用时由调用方兜底。
 */
export async function listUpstreamModels(
  baseUrl: string,
  key: string,
): Promise<{ id: string }[]> {
  const response = await fetch(`${baseUrl}/v1/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new PlaygroundError("上游模型列表不可用", response.status);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const list = extractModelList(payload);

  return list;
}

function extractModelList(payload: unknown): { id: string }[] {
  const data =
    isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];

  const ids = new Set<string>();
  for (const item of data) {
    if (isRecord(item) && typeof item.id === "string" && item.id) {
      ids.add(item.id);
    } else if (typeof item === "string" && item) {
      ids.add(item);
    }
  }

  return [...ids].map((id) => ({ id }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
