import "server-only";

import type { NewApiAuth } from "@/lib/newapi/types";

const PLAYGROUND_KEY_CACHE_TTL_MS = 60 * 60 * 1000;

type CachedPlaygroundKey = {
  key: string;
  expiresAt: number;
};

const playgroundKeyCache = new Map<string, CachedPlaygroundKey>();

function cacheKey(auth: NewApiAuth, tokenId: number): string {
  return `${auth.userId}:${tokenId}`;
}

export function getCachedPlaygroundKey(
  auth: NewApiAuth,
  tokenId: number,
): string | undefined {
  const entry = playgroundKeyCache.get(cacheKey(auth, tokenId));

  if (!entry) {
    return undefined;
  }

  if (entry.expiresAt <= Date.now()) {
    playgroundKeyCache.delete(cacheKey(auth, tokenId));
    return undefined;
  }

  return entry.key;
}

export function cachePlaygroundKey(
  auth: NewApiAuth,
  tokenId: number,
  key: string,
): void {
  playgroundKeyCache.set(cacheKey(auth, tokenId), {
    key,
    expiresAt: Date.now() + PLAYGROUND_KEY_CACHE_TTL_MS,
  });
}

export function forgetCachedPlaygroundKey(
  auth: NewApiAuth,
  tokenId: number,
): void {
  playgroundKeyCache.delete(cacheKey(auth, tokenId));
}

export function clearPlaygroundKeyCacheForTests(): void {
  playgroundKeyCache.clear();
}
