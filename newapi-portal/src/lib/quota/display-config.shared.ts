export type QuotaDisplayType = "USD" | "CNY" | "TOKENS" | "CUSTOM";

export type QuotaDisplayConfig = {
  quotaPerCny: number;
  source: "default" | "env" | "newapi";
  quotaPerUnit?: number;
  usdExchangeRate?: number;
  displayType?: QuotaDisplayType;
};

export const DEFAULT_QUOTA_PER_CNY = 500_000;

export const DEFAULT_QUOTA_DISPLAY_CONFIG: QuotaDisplayConfig = {
  quotaPerCny: DEFAULT_QUOTA_PER_CNY,
  source: "default",
};

export function cnyToQuota(
  cny: number,
  config: QuotaDisplayConfig = DEFAULT_QUOTA_DISPLAY_CONFIG,
): number {
  return Math.round(cny * config.quotaPerCny);
}

export function quotaToCny(
  quota: number,
  config: QuotaDisplayConfig = DEFAULT_QUOTA_DISPLAY_CONFIG,
): number {
  return quota / config.quotaPerCny;
}

export function quotaToDisplayAmount(
  quota: number,
  config: QuotaDisplayConfig = DEFAULT_QUOTA_DISPLAY_CONFIG,
): number {
  return quotaToCny(quota, config);
}

export type NewApiSelfQuotaFields = {
  quota?: number;
  used_quota?: number;
};

/** NewAPI `/api/user/self` returns remaining balance in `quota`; `used_quota` is lifetime usage. */
export function remainingQuotaFromSelf(
  self: NewApiSelfQuotaFields | null | undefined,
): number | undefined {
  return typeof self?.quota === "number" ? self.quota : undefined;
}

export function normalizeQuotaDisplayConfig(
  value: Partial<QuotaDisplayConfig> | null | undefined,
): QuotaDisplayConfig {
  const quotaPerCny =
    typeof value?.quotaPerCny === "number" && Number.isFinite(value.quotaPerCny)
      ? Math.max(0.001, value.quotaPerCny)
      : DEFAULT_QUOTA_PER_CNY;

  const source =
    value?.source === "env" || value?.source === "newapi"
      ? value.source
      : "default";

  const displayType =
    value?.displayType === "USD" ||
    value?.displayType === "CNY" ||
    value?.displayType === "TOKENS" ||
    value?.displayType === "CUSTOM"
      ? value.displayType
      : undefined;

  return {
    quotaPerCny,
    source,
    ...(typeof value?.quotaPerUnit === "number" &&
    Number.isFinite(value.quotaPerUnit)
      ? { quotaPerUnit: value.quotaPerUnit }
      : {}),
    ...(typeof value?.usdExchangeRate === "number" &&
    Number.isFinite(value.usdExchangeRate)
      ? { usdExchangeRate: value.usdExchangeRate }
      : {}),
    ...(displayType ? { displayType } : {}),
  };
}
