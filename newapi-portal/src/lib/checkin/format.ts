import "server-only";

import type { NewApiCheckinStatus } from "@/lib/newapi/checkin";
import { dateKey, todayDateOnly } from "@/lib/quota/usage";

export type DashboardCheckinSummary = {
  enabled: boolean;
  checkedInToday: boolean;
  checkedInOn: string;
  status: "AVAILABLE" | "CLAIMED";
  totalCheckins: number;
  monthlyCheckins: number;
  totalQuotaAwarded: number;
  monthlyRecords: Array<{ date: string; quotaAwarded: number }>;
  quotaApplied: boolean | null;
};

export function formatDashboardCheckin(
  status: NewApiCheckinStatus | null,
  options: { enabled: boolean },
): DashboardCheckinSummary {
  const today = dateKey(todayDateOnly());

  if (!options.enabled || !status) {
    return {
      enabled: options.enabled,
      checkedInToday: false,
      checkedInOn: today,
      status: "AVAILABLE",
      totalCheckins: 0,
      monthlyCheckins: 0,
      totalQuotaAwarded: 0,
      monthlyRecords: [],
      quotaApplied: null,
    };
  }

  const checkedInToday = status.stats.checked_in_today;

  return {
    enabled: true,
    checkedInToday,
    checkedInOn: today,
    status: checkedInToday ? "CLAIMED" : "AVAILABLE",
    totalCheckins: status.stats.total_checkins,
    monthlyCheckins: status.stats.checkin_count,
    totalQuotaAwarded: status.stats.total_quota,
    monthlyRecords: status.stats.records.map((record) => ({
      date: record.checkin_date,
      quotaAwarded: record.quota_awarded,
    })),
    quotaApplied: checkedInToday ? true : null,
  };
}
