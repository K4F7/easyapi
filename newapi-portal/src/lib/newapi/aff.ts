import "server-only";

import { newApiUserRequest } from "./client";
import type { NewApiAuth } from "./types";

export type NewApiAffInfo = {
  aff_code: string;
  aff_count: number;
  aff_quota: number;
  aff_history_quota: number;
};

export type NewApiAffTransferResult = {
  transferred_quota?: number;
  aff_quota?: number;
  quota?: number;
};

function parseAffInfo(data: unknown): NewApiAffInfo {
  if (typeof data === "string" && data.length > 0) {
    return {
      aff_code: data,
      aff_count: 0,
      aff_quota: 0,
      aff_history_quota: 0,
    };
  }

  const record = isRecord(data) ? data : {};

  return {
    aff_code:
      typeof record.aff_code === "string"
        ? record.aff_code
        : typeof record.affCode === "string"
          ? record.affCode
          : "",
    aff_count: pickNumber(record, ["aff_count", "affCount"], 0),
    aff_quota: pickNumber(record, ["aff_quota", "affQuota"], 0),
    aff_history_quota: pickNumber(
      record,
      ["aff_history_quota", "affHistoryQuota"],
      0,
    ),
  };
}

function parseAffTransferResult(data: unknown): NewApiAffTransferResult {
  const record = isRecord(data) ? data : {};

  return {
    transferred_quota: pickOptionalNumber(record, [
      "transferred_quota",
      "transferredQuota",
      "quota_awarded",
      "quotaAwarded",
    ]),
    aff_quota: pickOptionalNumber(record, ["aff_quota", "affQuota"]),
    quota: pickOptionalNumber(record, ["quota"]),
  };
}

export function getAffInfo(auth: NewApiAuth): Promise<NewApiAffInfo> {
  return newApiUserRequest<unknown>(auth, "/api/user/aff").then(parseAffInfo);
}

export function transferAffQuota(
  auth: NewApiAuth,
): Promise<NewApiAffTransferResult> {
  return newApiUserRequest<unknown>(auth, "/api/user/aff_transfer", {
    method: "POST",
  }).then(parseAffTransferResult);
}

export function parseAffFromSelf(self: Record<string, unknown>): NewApiAffInfo {
  return {
    aff_code:
      typeof self.aff_code === "string"
        ? self.aff_code
        : typeof self.affCode === "string"
          ? self.affCode
          : "",
    aff_count: pickNumber(self, ["aff_count", "affCount"], 0),
    aff_quota: pickNumber(self, ["aff_quota", "affQuota"], 0),
    aff_history_quota: pickNumber(
      self,
      ["aff_history_quota", "affHistoryQuota"],
      0,
    ),
  };
}

function pickNumber(
  source: Record<string, unknown>,
  keys: string[],
  fallback: number,
): number {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function pickOptionalNumber(
  source: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
