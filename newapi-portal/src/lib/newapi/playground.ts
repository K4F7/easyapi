import "server-only";

import {
  extractTokenKey,
  getToken,
  revealTokenKey,
} from "@/lib/newapi/tokens";
import type { NewApiAuth } from "@/lib/newapi/types";
import {
  deleteAllPlaygroundTokensByName,
  ensurePlaygroundChatTokenId,
  ensurePlaygroundImageTokenId,
} from "@/lib/playground/ensure-token";
import {
  cachePlaygroundKey,
  forgetCachedPlaygroundKey,
  getCachedPlaygroundKey,
} from "@/lib/playground/key-cache";
import {
  isManagedPlaygroundToken,
  PLAYGROUND_IMAGE_TOKEN_NAME,
} from "@/lib/playground/token-identity";
import { isMaskedTokenKey } from "@/lib/quota/usage";

function isInlinePlaygroundKey(key: string): boolean {
  return key.length > 0 && !isMaskedTokenKey(key);
}

function rememberPlaygroundKey(
  auth: NewApiAuth,
  tokenId: number,
  key: string,
): string {
  cachePlaygroundKey(auth, tokenId, key);
  return key;
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

export async function resolvePlaygroundImageKey(
  auth: NewApiAuth,
): Promise<string> {
  const tokenId = await ensurePlaygroundImageTokenId(auth);
  return resolvePlaygroundKey(auth, tokenId);
}

export async function resetPlaygroundImageTokenKey(
  auth: NewApiAuth,
): Promise<string> {
  await deleteAllPlaygroundTokensByName(auth, PLAYGROUND_IMAGE_TOKEN_NAME);
  const tokenId = await ensurePlaygroundImageTokenId(auth);
  return resolvePlaygroundKey(auth, tokenId, { allowRecovery: false });
}

export async function resolvePlaygroundKey(
  auth: NewApiAuth,
  tokenId: number,
  options?: { allowRecovery?: boolean },
): Promise<string> {
  const allowRecovery = options?.allowRecovery ?? true;
  const cachedKey = getCachedPlaygroundKey(auth, tokenId);

  if (cachedKey) {
    return cachedKey;
  }

  const token = await getToken(auth, tokenId);

  if (token.status !== undefined && token.status !== 1) {
    throw new PlaygroundError("所选令牌不可用", 403);
  }

  const inlineKey = extractTokenKey(token);

  if (typeof inlineKey === "string" && isInlinePlaygroundKey(inlineKey)) {
    return rememberPlaygroundKey(auth, tokenId, inlineKey);
  }

  try {
    const revealedKey = await revealTokenKey(auth, tokenId);
    return rememberPlaygroundKey(auth, tokenId, revealedKey);
  } catch {
    if (allowRecovery && isManagedPlaygroundToken(token)) {
      return recoverManagedPlaygroundKey(auth, token);
    }

    throw new PlaygroundError("所选令牌无法用于 Playground", 409);
  }
}

async function recoverManagedPlaygroundKey(
  auth: NewApiAuth,
  token: { id?: number; name?: string },
): Promise<string> {
  const oldTokenId = token.id;
  const tokenName = token.name;

  if (typeof oldTokenId !== "number" || typeof tokenName !== "string") {
    throw new PlaygroundError("所选令牌无法用于 Playground", 409);
  }

  forgetCachedPlaygroundKey(auth, oldTokenId);

  try {
    await deleteAllPlaygroundTokensByName(auth, tokenName);
  } catch {
    throw new PlaygroundError("所选令牌无法用于 Playground", 409);
  }

  const newTokenId =
    tokenName === PLAYGROUND_IMAGE_TOKEN_NAME
      ? await ensurePlaygroundImageTokenId(auth)
      : await ensurePlaygroundChatTokenId(auth);

  const key = await resolvePlaygroundKey(auth, newTokenId, {
    allowRecovery: false,
  });

  if (oldTokenId !== newTokenId) {
    cachePlaygroundKey(auth, oldTokenId, key);
  }

  return key;
}

function buildOpenAiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json");
}

export async function listUpstreamModels(baseUrl: string, key: string) {
  const response = await fetch(buildOpenAiUrl(baseUrl, "/v1/models"), {
    headers: {
      Authorization: `Bearer ${key}`,
    },
    cache: "no-store",
    redirect: "manual",
  });

  if (response.status >= 300 && response.status < 400) {
    throw new PlaygroundError(
      "NEWAPI_BASE_URL 未指向 OpenAI 兼容 API（/v1/models 被重定向，请检查是否误用了 Portal 公网地址）",
      502,
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new PlaygroundError("令牌密钥无效或无权访问模型列表", 502);
    }

    throw new PlaygroundError(`无法获取模型列表（上游 HTTP ${response.status}）`, 502);
  }

  if (!isJsonResponse(response)) {
    throw new PlaygroundError(
      "NEWAPI_BASE_URL 返回非 JSON，请检查是否指向 NewAPI 上游而非 Portal 页面",
      502,
    );
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
  return fetch(buildOpenAiUrl(baseUrl, "/v1/chat/completions"), {
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
  return fetch(buildOpenAiUrl(baseUrl, "/v1/images/generations"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "manual",
    signal,
  });
}
