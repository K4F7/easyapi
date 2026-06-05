/** 客户端/服务端共用的额度展示配置（勿加 server-only）。 */

export type QuotaDisplayConfig = {
  quotaPerUnit: number;
  usdExchangeRate: number;
  quotaPerCny: number;
  quotaDisplayType: string;
  displayInCurrency: boolean;
  source: "newapi" | "default";
};

export type NewApiStatusQuotaFields = {
  quota_per_unit?: number;
  display_in_currency?: boolean;
  quota_display_type?: string;
  usd_exchange_rate?: number;
  custom_currency_symbol?: string;
  custom_currency_exchange_rate?: number;
};

export const DEFAULT_QUOTA_PER_UNIT = 500_000;
export const DEFAULT_USD_EXCHANGE_RATE = 7;

export const DEFAULT_QUOTA_DISPLAY_CONFIG: QuotaDisplayConfig = {
  quotaPerUnit: DEFAULT_QUOTA_PER_UNIT,
  usdExchangeRate: DEFAULT_USD_EXCHANGE_RATE,
  quotaPerCny: DEFAULT_QUOTA_PER_UNIT / DEFAULT_USD_EXCHANGE_RATE,
  quotaDisplayType: "CNY",
  displayInCurrency: true,
  source: "default",
};

/**
 * 与 NewAPI 控制台一致（CNY 模式）：
 * 展示金额 = quota / quotaPerUnit × usdExchangeRate
 */
export function resolveQuotaDisplayConfig(
  status: NewApiStatusQuotaFields | null | undefined,
): QuotaDisplayConfig {
  const quotaPerUnit = positiveNumber(status?.quota_per_unit);
  const usdExchangeRate = positiveNumber(status?.usd_exchange_rate);

  if (!status || quotaPerUnit === null || usdExchangeRate === null) {
    return DEFAULT_QUOTA_DISPLAY_CONFIG;
  }

  const quotaDisplayType =
    typeof status.quota_display_type === "string" && status.quota_display_type
      ? status.quota_display_type
      : "CNY";

  // 门户固定以人民币展示；CUSTOM 时仍按「每美元额度 × 自定义汇率」换算到展示币，
  // 再与 CNY 路径共用 usdExchangeRate 字段时由运营保持与 NewAPI 后台一致。
  const displayRate =
    quotaDisplayType === "CUSTOM"
      ? (positiveNumber(status.custom_currency_exchange_rate) ?? usdExchangeRate)
      : usdExchangeRate;

  return {
    quotaPerUnit,
    usdExchangeRate: displayRate,
    quotaPerCny: quotaPerUnit / displayRate,
    quotaDisplayType,
    displayInCurrency: status.display_in_currency !== false,
    source: "newapi",
  };
}

export function quotaToCny(
  quota: number,
  config: QuotaDisplayConfig = DEFAULT_QUOTA_DISPLAY_CONFIG,
): number {
  const { quotaPerCny } = config;
  if (!Number.isFinite(quotaPerCny) || quotaPerCny <= 0) {
    return quota / DEFAULT_QUOTA_DISPLAY_CONFIG.quotaPerCny;
  }
  return quota / quotaPerCny;
}

export function cnyToQuota(
  cny: number,
  config: QuotaDisplayConfig = DEFAULT_QUOTA_DISPLAY_CONFIG,
): number {
  if (!Number.isFinite(cny) || cny <= 0) {
    return 0;
  }
  const rate =
    Number.isFinite(config.quotaPerCny) && config.quotaPerCny > 0
      ? config.quotaPerCny
      : DEFAULT_QUOTA_DISPLAY_CONFIG.quotaPerCny;
  return Math.round(cny * rate);
}

function positiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
