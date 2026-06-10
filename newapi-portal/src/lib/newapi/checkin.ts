import "server-only";

import { newApiUserRequest } from "./client";
import type { NewApiAuth } from "./types";

export type NewApiCheckinRecord = {
  checkin_date: string;
  quota_awarded: number;
};

export type NewApiCheckinStats = {
  total_quota: number;
  total_checkins: number;
  checkin_count: number;
  checked_in_today: boolean;
  records: NewApiCheckinRecord[];
};

export type NewApiCheckinStatus = {
  enabled: boolean;
  min_quota: number;
  max_quota: number;
  stats: NewApiCheckinStats;
};

export type NewApiDoCheckinResult = {
  quota_awarded: number;
  checkin_date: string;
};

function currentMonthKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function parseCheckinStatus(data: unknown): NewApiCheckinStatus {
  const record = isRecord(data) ? data : {};
  const statsSource = isRecord(record.stats) ? record.stats : {};
  const records = Array.isArray(statsSource.records)
    ? statsSource.records
        .map(parseCheckinRecord)
        .filter((item): item is NewApiCheckinRecord => item !== null)
    : [];

  return {
    enabled: record.enabled === true,
    min_quota: pickNumber(record, ["min_quota", "minQuota"], 0),
    max_quota: pickNumber(record, ["max_quota", "maxQuota"], 0),
    stats: {
      total_quota: pickNumber(statsSource, ["total_quota", "totalQuota"], 0),
      total_checkins: pickNumber(
        statsSource,
        ["total_checkins", "totalCheckins"],
        0,
      ),
      checkin_count: pickNumber(
        statsSource,
        ["checkin_count", "checkinCount"],
        records.length,
      ),
      checked_in_today:
        statsSource.checked_in_today === true ||
        statsSource.checkedInToday === true,
      records,
    },
  };
}

function parseCheckinRecord(value: unknown): NewApiCheckinRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const checkinDate =
    typeof value.checkin_date === "string"
      ? value.checkin_date
      : typeof value.checkinDate === "string"
        ? value.checkinDate
        : null;
  const quotaAwarded = pickNumber(
    value,
    ["quota_awarded", "quotaAwarded"],
    Number.NaN,
  );

  if (!checkinDate || !Number.isFinite(quotaAwarded)) {
    return null;
  }

  return {
    checkin_date: checkinDate,
    quota_awarded: quotaAwarded,
  };
}

function parseDoCheckinResult(data: unknown): NewApiDoCheckinResult {
  const record = isRecord(data) ? data : {};

  return {
    quota_awarded: pickNumber(record, ["quota_awarded", "quotaAwarded"], 0),
    checkin_date:
      typeof record.checkin_date === "string"
        ? record.checkin_date
        : typeof record.checkinDate === "string"
          ? record.checkinDate
          : new Date().toISOString().slice(0, 10),
  };
}

export function getCheckinStatus(
  auth: NewApiAuth,
  month: string = currentMonthKey(),
): Promise<NewApiCheckinStatus> {
  return newApiUserRequest<unknown>(auth, "/api/user/checkin", {
    query: { month },
  }).then(parseCheckinStatus);
}

export function doCheckin(
  auth: NewApiAuth,
  options: { turnstile?: string } = {},
): Promise<NewApiDoCheckinResult> {
  return newApiUserRequest<unknown>(auth, "/api/user/checkin", {
    method: "POST",
    query: options.turnstile ? { turnstile: options.turnstile } : undefined,
  }).then(parseDoCheckinResult);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
