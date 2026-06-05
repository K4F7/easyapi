import "server-only";

export type { QuotaDisplayConfig } from "./display-config.shared";
export {
  DEFAULT_QUOTA_DISPLAY_CONFIG,
  resolveQuotaDisplayConfig,
  cnyToQuota,
  quotaToCny,
} from "./display-config.shared";
