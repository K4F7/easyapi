import "server-only";

export type NewApiPrimitive = string | number | boolean | null;
export type NewApiJson =
  | NewApiPrimitive
  | NewApiJson[]
  | { [key: string]: NewApiJson };

export interface NewApiAuth {
  accessToken: string;
  userId: string | number;
}

export interface NewApiEnvelope<T = unknown> {
  success?: boolean;
  message?: string;
  data?: T;
  code?: string | number | boolean;
  error?: string;
}

export interface NewApiPage<T> {
  items: T[];
  total: number;
  page?: number;
  page_size?: number;
  pageSize?: number;
  p?: number;
}

export type NewApiQuotaAdjustMode = "add" | "subtract" | "override";

export interface NewApiUserSelf {
  id: number;
  username: string;
  display_name?: string;
  role?: number;
  status?: number;
  email?: string;
  group?: string;
  quota?: number;
  used_quota?: number;
  request_count?: number;
  [key: string]: unknown;
}

export interface NewApiAdminCreateUserInput {
  username: string;
  password: string;
  displayName?: string;
  display_name?: string;
  role?: number;
}

export interface NewApiAdminCreateUserResult {
  id?: number;
  username: string;
  displayName?: string;
  accessToken?: string;
  raw?: unknown;
}

export interface NewApiAdminAddQuotaInput {
  userId: string | number;
  value: number;
  mode?: NewApiQuotaAdjustMode;
}

export interface NewApiManageUserResult {
  success: true;
  data?: unknown;
}

export interface NewApiToken {
  id: number;
  user_id?: number;
  key?: string;
  status?: number;
  name: string;
  created_time?: number;
  accessed_time?: number;
  expired_time?: number;
  remain_quota?: number;
  unlimited_quota?: boolean;
  model_limits_enabled?: boolean;
  model_limits?: string;
  allow_ips?: string | null;
  used_quota?: number;
  group?: string;
  cross_group_retry?: boolean;
  [key: string]: unknown;
}

export interface NewApiCreateTokenInput {
  name: string;
  expired_time?: number;
  remain_quota?: number;
  unlimited_quota?: boolean;
  model_limits_enabled?: boolean;
  model_limits?: string;
  allow_ips?: string | null;
  group?: string;
  cross_group_retry?: boolean;
}

export interface NewApiUpdateTokenInput extends NewApiCreateTokenInput {
  id: number;
  status?: number;
}

export interface NewApiCreateTokenResult {
  token?: NewApiToken;
  key?: string;
  raw?: unknown;
}

export interface NewApiLog {
  id: number;
  user_id?: number;
  created_at: number;
  type?: number;
  content?: string;
  username?: string;
  token_name?: string;
  model_name?: string;
  quota?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  use_time?: number;
  is_stream?: boolean;
  channel?: number;
  group?: string;
  request_id?: string;
  [key: string]: unknown;
}

export interface NewApiLogQuery {
  p?: number;
  page_size?: number;
  type?: number;
  token_name?: string;
  model_name?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  group?: string;
  request_id?: string;
}

export interface NewApiLogStatsQuery {
  type?: number;
  token_name?: string;
  model_name?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  group?: string;
}

export interface NewApiLogStats {
  quota: number;
  rpm?: number;
  tpm?: number;
  [key: string]: unknown;
}

export interface NewApiUsageDataQuery {
  start_timestamp: number;
  end_timestamp: number;
  default_time?: string;
}

export interface NewApiUsageDataItem {
  id?: number;
  user_id?: number;
  username?: string;
  model_name?: string;
  created_at: number;
  token_used?: number;
  count?: number;
  quota?: number;
  [key: string]: unknown;
}

export interface NewApiRedeemTopupResult {
  success: true;
  data?: unknown;
}
