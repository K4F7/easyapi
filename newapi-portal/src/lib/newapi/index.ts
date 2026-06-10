import "server-only";

export {
  NewApiError,
  getAdminHeaders,
  getNewApiAdminAuth,
  getNewApiConfig,
  newApiAdminRequest,
  newApiRequest,
  newApiUserRequest,
  normalizeNewApiBaseUrl,
} from "./client";
export { redeemTopup, topupWithRedemptionCode } from "./billing";
export { getLogStats, getLogs, getUsageData } from "./logs";
export {
  createToken,
  createTokenAndRevealKey,
  deleteToken,
  extractTokenKey,
  getToken,
  listTokens,
  revealTokenKey,
  updateToken,
} from "./tokens";
export { getAffInfo, parseAffFromSelf, transferAffQuota } from "./aff";
export type { NewApiAffInfo, NewApiAffTransferResult } from "./aff";
export { doCheckin, getCheckinStatus } from "./checkin";
export type {
  NewApiCheckinRecord,
  NewApiCheckinStats,
  NewApiCheckinStatus,
  NewApiDoCheckinResult,
} from "./checkin";
export { getSelf } from "./users";
export { extractAccessToken, refreshUserAccessToken } from "./access-token";
export {
  clearNewApiStatusCacheForTests,
  getNewApiStatus,
  type NewApiQuotaDisplayType,
  type NewApiStatus,
} from "./status";
export {
  clearNewApiNoticeCacheForTests,
  getNewApiNotice,
  hashNoticeContent,
  parseNoticePayload,
  type NewApiNotice,
} from "./notice";
export type {
  NewApiAdminAddQuotaInput,
  NewApiAdminCreateUserInput,
  NewApiAdminCreateUserResult,
  NewApiAuth,
  NewApiCreateTokenInput,
  NewApiCreateTokenResult,
  NewApiEnvelope,
  NewApiJson,
  NewApiLog,
  NewApiLogQuery,
  NewApiLogStats,
  NewApiLogStatsQuery,
  NewApiManageUserResult,
  NewApiPage,
  NewApiPrimitive,
  NewApiQuotaAdjustMode,
  NewApiRedeemTopupResult,
  NewApiToken,
  NewApiUpdateTokenInput,
  NewApiUsageDataItem,
  NewApiUsageDataQuery,
  NewApiUserSelf,
} from "./types";
