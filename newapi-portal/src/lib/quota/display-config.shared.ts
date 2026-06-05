export type QuotaDisplayConfig = {
  quotaPerCny: number;
  source: "default" | "env" | "newapi";
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

export function normalizeQuotaDisplayConfig(
  value: Partial<QuotaDisplayConfig> | null | undefined,
): QuotaDisplayConfig {
  const quotaPerCny =
    typeof value?.quotaPerCny === "number" && Number.isFinite(value.quotaPerCny)
      ? Math.max(1, Math.round(value.quotaPerCny))
      : DEFAULT_QUOTA_PER_CNY;

  const source =
    value?.source === "env" || value?.source === "newapi" ? value.source : "default";

  return { quotaPerCny, source };
}
