import "server-only";

import {
  DEFAULT_QUOTA_DISPLAY_CONFIG,
  normalizeQuotaDisplayConfig,
  type QuotaDisplayConfig,
} from "@/lib/quota/display-config.shared";

export async function getQuotaDisplayConfig(): Promise<QuotaDisplayConfig> {
  const raw = process.env.QUOTA_PER_CNY;
  if (!raw) {
    return DEFAULT_QUOTA_DISPLAY_CONFIG;
  }

  const parsed = Number(raw);
  return normalizeQuotaDisplayConfig({
    quotaPerCny: parsed,
    source: Number.isFinite(parsed) ? "env" : "default",
  });
}

export function quotaDisplayConfigForClient(
  config: QuotaDisplayConfig,
): QuotaDisplayConfig {
  return normalizeQuotaDisplayConfig(config);
}
