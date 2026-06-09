import "server-only";

import { getToken, revealTokenKey } from "@/lib/newapi/tokens";
import type { NewApiAuth } from "@/lib/newapi/types";

function isInlinePlaygroundKey(key: string): boolean {
  return key.length > 0 && !key.includes("...");
}

export class PlaygroundError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PlaygroundError";
    this.status = status;
  }
}

export async function assertPlaygroundTokenAccess(
  auth: NewApiAuth,
  tokenId: number,
) {
  await resolvePlaygroundKey(auth, tokenId);
}

export async function resolvePlaygroundKey(
  auth: NewApiAuth,
  tokenId: number,
): Promise<string> {
  const token = await getToken(auth, tokenId);

  if (token.status !== undefined && token.status !== 1) {
    throw new PlaygroundError("所选令牌不可用", 403);
  }

  if (typeof token.key === "string" && isInlinePlaygroundKey(token.key)) {
    return token.key;
  }

  try {
    return await revealTokenKey(auth, tokenId);
  } catch {
    throw new PlaygroundError("所选令牌无法用于 Playground", 409);
  }
}

export async function listUpstreamModels(baseUrl: string, key: string) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/models`, {
    headers: {
      Authorization: `Bearer ${key}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new PlaygroundError("无法获取模型列表", 502);
  }

  const payload = await response.json().catch(() => ({}));
  const data = Array.isArray(payload?.data) ? payload.data : [];

  return data
    .map((item: unknown) => {
      if (
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        typeof (item as { id?: unknown }).id === "string"
      ) {
        return { id: (item as { id: string }).id };
      }
      return null;
    })
    .filter((item: { id: string } | null): item is { id: string } => Boolean(item));
}

export function streamChatCompletion(
  baseUrl: string,
  key: string,
  body: unknown,
  signal?: AbortSignal,
) {
  return fetch(`${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...(body as Record<string, unknown>), stream: true }),
    cache: "no-store",
    signal,
  });
}

export function createImageGeneration(
  baseUrl: string,
  key: string,
  body: unknown,
  signal?: AbortSignal,
) {
  return fetch(`${baseUrl.replace(/\/+$/, "")}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
}
