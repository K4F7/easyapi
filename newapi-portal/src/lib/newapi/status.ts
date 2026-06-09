import "server-only";

import { newApiRequest } from "./client";

export type NewApiQuotaDisplayType = "USD" | "CNY" | "TOKENS" | "CUSTOM";

export type NewApiStatus = {
  quotaPerUnit: number;
  usdExchangeRate: number;
  displayType: NewApiQuotaDisplayType;
  customCurrencySymbol?: string;
  customCurrencyExchangeRate?: number;
};

const DEFAULT_QUOTA_PER_UNIT = 500_000;
const DEFAULT_USD_EXCHANGE_RATE = 7;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedStatus: { value: NewApiStatus; expiresAt: number } | null = null;

function pickNumber(
  source: Record<string, unknown>,
  keys: string[],
  fallback: number,
): number {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);

      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return fallback;
}

function pickDisplayType(value: unknown): NewApiQuotaDisplayType {
  if (
    value === "USD" ||
    value === "CNY" ||
    value === "TOKENS" ||
    value === "CUSTOM"
  ) {
    return value;
  }

  return "CNY";
}

function parseStatusPayload(data: Record<string, unknown>): NewApiStatus {
  return {
    quotaPerUnit: pickNumber(
      data,
      ["quota_per_unit", "quotaPerUnit"],
      DEFAULT_QUOTA_PER_UNIT,
    ),
    usdExchangeRate: pickNumber(
      data,
      ["usd_exchange_rate", "usdExchangeRate"],
      DEFAULT_USD_EXCHANGE_RATE,
    ),
    displayType: pickDisplayType(data.quota_display_type ?? data.quotaDisplayType),
    customCurrencySymbol:
      typeof data.custom_currency_symbol === "string"
        ? data.custom_currency_symbol
        : undefined,
    customCurrencyExchangeRate: pickNumber(
      data,
      ["custom_currency_exchange_rate", "customCurrencyExchangeRate"],
      1,
    ),
  };
}

export async function getNewApiStatus(): Promise<NewApiStatus | null> {
  if (cachedStatus && cachedStatus.expiresAt > Date.now()) {
    return cachedStatus.value;
  }

  try {
    const data = await newApiRequest<Record<string, unknown>>("/api/status");
    const status = parseStatusPayload(data);
    cachedStatus = { value: status, expiresAt: Date.now() + CACHE_TTL_MS };
    return status;
  } catch {
    return null;
  }
}

export function clearNewApiStatusCacheForTests() {
  cachedStatus = null;
}
