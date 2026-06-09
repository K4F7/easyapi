import "server-only";

import { createHash } from "node:crypto";

import { newApiRequest } from "./client";

export type NewApiNotice = {
  content: string;
  contentHash: string;
};

const CACHE_TTL_MS = 60 * 1000;

let cachedNotice: { value: NewApiNotice | null; expiresAt: number } | null =
  null;

export function hashNoticeContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function parseNoticePayload(data: unknown): NewApiNotice | null {
  const content =
    typeof data === "string"
      ? data.trim()
      : isRecord(data) && typeof data.content === "string"
        ? data.content.trim()
        : "";

  if (!content) {
    return null;
  }

  return {
    content,
    contentHash: hashNoticeContent(content),
  };
}

export async function getNewApiNotice(): Promise<NewApiNotice | null> {
  if (cachedNotice && cachedNotice.expiresAt > Date.now()) {
    return cachedNotice.value;
  }

  try {
    const data = await newApiRequest<unknown>("/api/notice");
    const notice = parseNoticePayload(data);
    cachedNotice = { value: notice, expiresAt: Date.now() + CACHE_TTL_MS };
    return notice;
  } catch {
    cachedNotice = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
    return null;
  }
}

export function clearNewApiNoticeCacheForTests() {
  cachedNotice = null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
