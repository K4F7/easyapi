import "server-only";

import { newApiUserRequest } from "./client";
import type {
  NewApiAuth,
  NewApiLog,
  NewApiLogQuery,
  NewApiLogStats,
  NewApiLogStatsQuery,
  NewApiPage,
  NewApiUsageDataItem,
  NewApiUsageDataQuery,
} from "./types";

export function getLogs(
  auth: NewApiAuth,
  query: NewApiLogQuery = {},
): Promise<NewApiPage<NewApiLog>> {
  return newApiUserRequest<NewApiPage<NewApiLog>>(auth, "/api/log/self", {
    query: {
      p: query.p ?? 1,
      page_size: query.page_size ?? 20,
      type: query.type,
      token_name: query.token_name,
      model_name: query.model_name,
      start_timestamp: query.start_timestamp,
      end_timestamp: query.end_timestamp,
      group: query.group,
      request_id: query.request_id,
    },
  });
}

export function getLogStats(
  auth: NewApiAuth,
  query: NewApiLogStatsQuery = {},
): Promise<NewApiLogStats> {
  return newApiUserRequest<NewApiLogStats>(auth, "/api/log/self/stat", {
    query: {
      type: query.type,
      token_name: query.token_name,
      model_name: query.model_name,
      start_timestamp: query.start_timestamp,
      end_timestamp: query.end_timestamp,
      group: query.group,
    },
  });
}

export function getUsageData(
  auth: NewApiAuth,
  query: NewApiUsageDataQuery,
): Promise<NewApiUsageDataItem[]> {
  return newApiUserRequest<NewApiUsageDataItem[]>(auth, "/api/data/self", {
    query: {
      start_timestamp: query.start_timestamp,
      end_timestamp: query.end_timestamp,
      default_time: query.default_time,
    },
  });
}
