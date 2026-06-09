"use client";

import { useCallback, useState } from "react";

import {
  DEFAULT_QUOTA_DISPLAY_CONFIG,
  normalizeQuotaDisplayConfig,
  quotaToCny as quotaToCnyValue,
  type QuotaDisplayConfig,
} from "@/lib/quota/display-config.shared";

const quotaFormatter = new Intl.NumberFormat("zh-CN");
const cnyFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function useQuotaFormat() {
  const [config, setConfig] = useState<QuotaDisplayConfig>(
    DEFAULT_QUOTA_DISPLAY_CONFIG,
  );

  const applyConfig = useCallback((next: Partial<QuotaDisplayConfig>) => {
    setConfig(normalizeQuotaDisplayConfig(next));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/quota/config", { cache: "no-store" });
      const payload = await response.json();
      const next = payload?.data?.config ?? payload?.config;
      if (next) {
        setConfig(normalizeQuotaDisplayConfig(next));
      }
    } catch {
      // Keep the current/default config; display formatting must not block pages.
    }
  }, []);

  const quotaToCny = useCallback(
    (quota: number) => quotaToCnyValue(quota, config),
    [config],
  );

  const formatQuota = useCallback(
    (value: number | null | undefined) => {
      if (value === null || value === undefined) {
        return "-";
      }

      return quotaFormatter.format(value);
    },
    [],
  );

  const formatCnyFromQuota = useCallback(
    (quota: number | null | undefined) => {
      if (quota === null || quota === undefined) {
        return "-";
      }

      return `¥${cnyFormatter.format(quotaToCnyValue(quota, config))}`;
    },
    [config],
  );

  return {
    config,
    quotaPerCny: config.quotaPerCny,
    applyConfig,
    refresh,
    quotaToCny,
    formatQuota,
    formatCnyFromQuota,
    formatBalance: formatCnyFromQuota,
  };
}
