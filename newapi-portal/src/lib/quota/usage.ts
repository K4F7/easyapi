import "server-only";

import type {
  NewApiLog,
  NewApiPage,
  NewApiToken,
  NewApiUsageDataItem,
} from "@/lib/newapi";
import {
  appTimeZone,
  dateKey,
  todayDateOnly,
} from "@/lib/quota/usage.shared";

export type UsageTotals = {
  quota: number;
  count: number;
  tokenUsed: number;
};

export { appTimeZone, dateKey, todayDateOnly };

export function startOfTodayTimestamp(): number {
  return Math.floor(todayDateOnly().getTime() / 1000);
}

export function startOfWeekTimestamp(): number {
  const today = todayDateOnly();
  const day = today.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - daysSinceMonday);

  return Math.floor(monday.getTime() / 1000);
}

export function nowTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function summarizeUsage(items: NewApiUsageDataItem[]): UsageTotals {
  return items.reduce<UsageTotals>(
    (totals, item) => ({
      quota: totals.quota + numberValue(item.quota),
      count: totals.count + numberValue(item.count),
      tokenUsed: totals.tokenUsed + numberValue(item.token_used),
    }),
    { quota: 0, count: 0, tokenUsed: 0 },
  );
}

export function normalizePage<T>(
  value: unknown,
  fallbackPage: number,
  fallbackPageSize: number,
): NewApiPage<T> {
  if (Array.isArray(value)) {
    return {
      items: value as T[],
      total: value.length,
      page: fallbackPage,
      page_size: fallbackPageSize,
    };
  }

  if (isRecord(value)) {
    const items = findArray<T>(value, ["items", "rows", "list", "data"]);
    const total = numberValue(value.total ?? value.count, items.length);

    return {
      ...(value as Partial<NewApiPage<T>>),
      items,
      total,
      page: numberValue(value.page ?? value.p, fallbackPage),
      page_size: numberValue(
        value.page_size ?? value.pageSize ?? value.size,
        fallbackPageSize,
      ),
    };
  }

  return {
    items: [],
    total: 0,
    page: fallbackPage,
    page_size: fallbackPageSize,
  };
}

export function summarizeLogs(logs: NewApiLog[]): UsageTotals {
  return logs.reduce<UsageTotals>(
    (totals, log) => ({
      quota: totals.quota + numberValue(log.quota),
      count: totals.count + 1,
      tokenUsed:
        totals.tokenUsed +
        numberValue(log.prompt_tokens) +
        numberValue(log.completion_tokens),
    }),
    { quota: 0, count: 0, tokenUsed: 0 },
  );
}

export function maskToken<T extends NewApiToken>(token: T): T {
  const key = typeof token.key === "string" ? token.key : undefined;

  return {
    ...token,
    key: key ? maskTokenKey(key) : undefined,
  };
}

const NEWAPI_MASK_MIDDLE = "**********";

export function isMaskedTokenKey(key: string): boolean {
  if (key.includes("...") || key.includes("*")) {
    return true;
  }

  const maskedCharCount = (key.match(/[*•·]/g) ?? []).length;
  return maskedCharCount >= 4 && maskedCharCount / key.length >= 0.3;
}

export function maskTokenKey(key: string): string {
  const trimmed = key.trim();

  if (isMaskedTokenKey(trimmed)) {
    return trimmed.startsWith("sk-") ? trimmed : `sk-${trimmed}`;
  }

  const body = trimmed.startsWith("sk-") ? trimmed.slice(3) : trimmed;
  const first4 = body.slice(0, 4);
  const last4 = body.slice(-4);

  return `sk-${first4}${NEWAPI_MASK_MIDDLE}${last4}`;
}

function findArray<T>(
  record: Record<string, unknown>,
  keys: string[],
): T[] {
  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value as T[];
    }
  }

  return [];
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
