import {
  DEFAULT_QUOTA_DISPLAY_CONFIG,
  cnyToQuota as cnyToQuotaShared,
  quotaToCny as quotaToCnyShared,
  type QuotaDisplayConfig,
} from "@/lib/quota/display-config.shared";

function formatCnyAmount(yuan: number): string {
  const abs = Math.abs(yuan);
  const maximumFractionDigits =
    abs >= 100 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;

  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: abs >= 1 ? 2 : 0,
    maximumFractionDigits,
  }).format(yuan);
}

export function quotaToCny(
  quota: number,
  config: QuotaDisplayConfig = DEFAULT_QUOTA_DISPLAY_CONFIG,
): number {
  return quotaToCnyShared(quota, config);
}

export function cnyToQuota(
  cny: number,
  config: QuotaDisplayConfig = DEFAULT_QUOTA_DISPLAY_CONFIG,
): number {
  return cnyToQuotaShared(cny, config);
}

export function formatQuota(
  value: number | null | undefined,
  config: QuotaDisplayConfig = DEFAULT_QUOTA_DISPLAY_CONFIG,
): string {
  if (value === null || value === undefined) {
    return "-";
  }

  return formatCnyAmount(quotaToCny(value, config));
}

export function createQuotaFormatters(config: QuotaDisplayConfig) {
  return {
    quotaPerCny: config.quotaPerCny,
    quotaPerUnit: config.quotaPerUnit,
    usdExchangeRate: config.usdExchangeRate,
    quotaToCny: (quota: number) => quotaToCny(quota, config),
    cnyToQuota: (cny: number) => cnyToQuota(cny, config),
    formatQuota: (value: number | null | undefined) => formatQuota(value, config),
  };
}

export type QuotaFormatters = ReturnType<typeof createQuotaFormatters>;
