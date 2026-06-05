"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { apiFetch } from "@/lib/client/api";
import {
  createQuotaFormatters,
  type QuotaFormatters,
} from "@/lib/client/quota-format";
import {
  DEFAULT_QUOTA_DISPLAY_CONFIG,
  type QuotaDisplayConfig,
} from "@/lib/quota/display-config.shared";

type QuotaConfigContextValue = QuotaFormatters & {
  config: QuotaDisplayConfig;
  /** 从已返回的 summary 等接口写入，避免重复请求 */
  applyConfig: (config: QuotaDisplayConfig) => void;
  /** 从 /api/quota/config 拉取最新汇率（获取业务数据时可顺带调用） */
  refresh: () => Promise<void>;
};

const QuotaConfigContext = createContext<QuotaConfigContextValue | null>(null);

export function QuotaConfigProvider({
  initialConfig,
  children,
}: {
  initialConfig?: QuotaDisplayConfig;
  children: ReactNode;
}) {
  const [config, setConfig] = useState<QuotaDisplayConfig>(
    initialConfig ?? DEFAULT_QUOTA_DISPLAY_CONFIG,
  );

  const applyConfig = useCallback((next: QuotaDisplayConfig) => {
    setConfig(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ config: QuotaDisplayConfig }>(
        "/api/quota/config",
      );
      setConfig(data.config);
    } catch {
      // 保留当前配置（多为 layout 注入或上一次成功拉取）
    }
  }, []);

  const value = useMemo<QuotaConfigContextValue>(() => {
    const formatters = createQuotaFormatters(config);
    return {
      ...formatters,
      config,
      applyConfig,
      refresh,
    };
  }, [config, applyConfig, refresh]);

  return (
    <QuotaConfigContext.Provider value={value}>
      {children}
    </QuotaConfigContext.Provider>
  );
}

export function useQuotaFormat(): QuotaConfigContextValue {
  const context = useContext(QuotaConfigContext);

  if (!context) {
    const formatters = createQuotaFormatters(DEFAULT_QUOTA_DISPLAY_CONFIG);
    return {
      ...formatters,
      config: DEFAULT_QUOTA_DISPLAY_CONFIG,
      applyConfig: () => {},
      refresh: async () => {},
    };
  }

  return context;
}
