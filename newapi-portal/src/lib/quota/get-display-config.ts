import "server-only";

import { unstable_cache } from "next/cache";

import { fetchNewApiStatusSafe } from "@/lib/newapi/status";

import {
  resolveQuotaDisplayConfig,
  type QuotaDisplayConfig,
} from "./display-config.shared";

const CACHE_TAG = "newapi-quota-config";

async function loadQuotaDisplayConfig(): Promise<QuotaDisplayConfig> {
  const status = await fetchNewApiStatusSafe();
  return resolveQuotaDisplayConfig(status);
}

/** 从 NewAPI /api/status 读取；失败时返回 default（调用方应提示用户）。 */
export const getQuotaDisplayConfig = unstable_cache(
  loadQuotaDisplayConfig,
  [CACHE_TAG],
  { revalidate: 60, tags: [CACHE_TAG] },
);

export function quotaDisplayConfigForClient(
  config: QuotaDisplayConfig,
): QuotaDisplayConfig {
  return { ...config };
}
