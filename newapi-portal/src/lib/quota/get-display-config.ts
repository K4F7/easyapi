import "server-only";

import { getNewApiStatus } from "@/lib/newapi/status";
import {
  DEFAULT_QUOTA_DISPLAY_CONFIG,
  normalizeQuotaDisplayConfig,
  type QuotaDisplayConfig,
} from "@/lib/quota/display-config.shared";

export async function getQuotaDisplayConfig(): Promise<QuotaDisplayConfig> {
  const status = await getNewApiStatus();

  if (status) {
    return normalizeQuotaDisplayConfig({
      quotaPerCny: status.quotaPerUnit / status.usdExchangeRate,
      quotaPerUnit: status.quotaPerUnit,
      usdExchangeRate: status.usdExchangeRate,
      displayType: status.displayType,
      source: "newapi",
    });
  }

  const raw = process.env.QUOTA_PER_CNY;
  if (raw) {
    const parsed = Number(raw);

    if (Number.isFinite(parsed)) {
      return normalizeQuotaDisplayConfig({
        quotaPerCny: parsed,
        source: "env",
      });
    }
  }

  return DEFAULT_QUOTA_DISPLAY_CONFIG;
}

export function quotaDisplayConfigForClient(
  config: QuotaDisplayConfig,
): QuotaDisplayConfig {
  return normalizeQuotaDisplayConfig(config);
}
