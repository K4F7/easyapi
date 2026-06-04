import { jsonOk, requireUser } from "@/lib/auth";
import {
  getRequestBaseUrl,
  getUserNewApiAuth,
  handleApiError,
  publicUserFromPortalUser,
} from "@/lib/api/bff";
import { isCheckinQuotaApplied } from "@/lib/checkin/quota";
import { db } from "@/lib/db";
import {
  getLogStats,
  getSelf,
  getUsageData,
  listTokens,
  NewApiError,
  type NewApiToken,
} from "@/lib/newapi";
import {
  getQuotaDisplayConfig,
  quotaDisplayConfigForClient,
} from "@/lib/quota/get-display-config";
import {
  dateKey,
  normalizePage,
  nowTimestamp,
  startOfTodayTimestamp,
  startOfWeekTimestamp,
  summarizeUsage,
  todayDateOnly,
} from "@/lib/quota/usage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const authResult = await getUserNewApiAuth(user);
    const portalUser = authResult.user;
    const [checkin, referralRows, rewardSummary] = await Promise.all([
      db.checkin.findUnique({
        where: {
          userId_checkedInOn: {
            userId: portalUser.id,
            checkedInOn: todayDateOnly(),
          },
        },
        select: {
          id: true,
          status: true,
          checkedInOn: true,
          createdAt: true,
          ledgerEntries: {
            select: { metadata: true },
            take: 1,
          },
        },
      }),
      db.referral.groupBy({
        by: ["status"],
        where: { referrerId: portalUser.id },
        _count: { _all: true },
      }),
      db.walletLedger.aggregate({
        where: {
          userId: portalUser.id,
          reason: "referral_reward",
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    const inviteLink = new URL("/register", getAppBaseUrl(request));
    inviteLink.searchParams.set("inviteCode", portalUser.inviteCode);
    const quotaConfig = quotaDisplayConfigForClient(await getQuotaDisplayConfig());

    if (!authResult.ok) {
      return jsonOk({
        quotaConfig,
        user: publicUserFromPortalUser(portalUser),
        newApi: {
          binding: "pending",
          status: authResult.code,
          message: authResult.message,
          self: null,
        },
        tokens: {
          count: null,
          status: "pending",
        },
        usage: emptyUsageSummary(),
        logStats: { rpm: null, tpm: null, status: "pending" },
        checkin: formatCheckin(checkin),
        referral: {
          inviteCode: portalUser.inviteCode,
          inviteLink: inviteLink.toString(),
          invitedCount: countReferralStatus(referralRows),
          rewardCount: rewardSummary._count._all,
          rewardQuota: rewardSummary._sum.amount ?? 0,
        },
      });
    }

    const now = nowTimestamp();
    const todayStart = startOfTodayTimestamp();
    const weekStart = startOfWeekTimestamp();

    try {
      const [self, tokensPageRaw, todayUsage, weekUsage, logStats] =
        await Promise.all([
          getSelf(authResult.auth),
          listTokens(authResult.auth, { p: 1, size: 1 }),
          getUsageData(authResult.auth, {
            start_timestamp: todayStart,
            end_timestamp: now,
            default_time: "day",
          }),
          getUsageData(authResult.auth, {
            start_timestamp: weekStart,
            end_timestamp: now,
            default_time: "day",
          }),
          getLogStats(authResult.auth, {
            start_timestamp: todayStart,
            end_timestamp: now,
          }),
        ]);
      const tokensPage = normalizePage<NewApiToken>(tokensPageRaw, 1, 1);

      return jsonOk({
        quotaConfig,
        user: publicUserFromPortalUser(portalUser),
        newApi: {
          binding: "ready",
          status: "ready",
          self,
        },
        tokens: {
          count: tokensPage.total,
          status: "ready",
        },
        usage: {
          today: {
            totals: summarizeUsage(todayUsage),
            start_timestamp: todayStart,
            end_timestamp: now,
          },
          week: {
            totals: summarizeUsage(weekUsage),
            start_timestamp: weekStart,
            end_timestamp: now,
          },
        },
        logStats: {
          rpm: logStats.rpm ?? null,
          tpm: logStats.tpm ?? null,
          status: "ready",
        },
        checkin: formatCheckin(checkin),
        referral: {
          inviteCode: portalUser.inviteCode,
          inviteLink: inviteLink.toString(),
          invitedCount: countReferralStatus(referralRows),
          rewardCount: rewardSummary._count._all,
          rewardQuota: rewardSummary._sum.amount ?? 0,
        },
      });
    } catch (error) {
      if (!(error instanceof NewApiError)) {
        throw error;
      }

      return jsonOk({
        quotaConfig,
        user: publicUserFromPortalUser(portalUser),
        newApi: {
          binding: "ready",
          status: "upstream_error",
          message: error.message,
          self: null,
        },
        tokens: {
          count: null,
          status: "upstream_error",
        },
        usage: emptyUsageSummary(),
        logStats: { rpm: null, tpm: null, status: "pending" },
        checkin: formatCheckin(checkin),
        referral: {
          inviteCode: portalUser.inviteCode,
          inviteLink: inviteLink.toString(),
          invitedCount: countReferralStatus(referralRows),
          rewardCount: rewardSummary._count._all,
          rewardQuota: rewardSummary._sum.amount ?? 0,
        },
      });
    }
  } catch (error) {
    return handleApiError(error, "Failed to load dashboard summary");
  }
}

function emptyUsageSummary() {
  return {
    today: {
      totals: { quota: 0, count: 0, tokenUsed: 0 },
      start_timestamp: startOfTodayTimestamp(),
      end_timestamp: nowTimestamp(),
    },
    week: {
      totals: { quota: 0, count: 0, tokenUsed: 0 },
      start_timestamp: startOfWeekTimestamp(),
      end_timestamp: nowTimestamp(),
    },
  };
}

function formatCheckin(
  checkin: {
    id: string;
    status: "CLAIMED" | "REVERSED";
    checkedInOn: Date;
    createdAt: Date;
    ledgerEntries: Array<{ metadata: unknown }>;
  } | null,
) {
  const quotaApplied =
    checkin?.ledgerEntries[0]?.metadata !== undefined &&
    isCheckinQuotaApplied(checkin.ledgerEntries[0]?.metadata);

  return {
    checkedInToday: Boolean(checkin),
    checkedInOn: checkin ? dateKey(checkin.checkedInOn) : dateKey(todayDateOnly()),
    status: checkin?.status ?? "AVAILABLE",
    checkinId: checkin?.id ?? null,
    createdAt: checkin?.createdAt.toISOString() ?? null,
    quotaApplied: checkin ? quotaApplied : null,
    quotaPending: Boolean(checkin && !quotaApplied),
  };
}

function countReferralStatus(
  rows: Array<{
    status: "PENDING" | "REWARDED" | "CANCELED";
    _count: {
      _all: number;
    };
  }>,
) {
  const counts = {
    total: 0,
    pending: 0,
    rewarded: 0,
    canceled: 0,
  };

  for (const row of rows) {
    counts.total += row._count._all;

    if (row.status === "PENDING") {
      counts.pending = row._count._all;
    } else if (row.status === "REWARDED") {
      counts.rewarded = row._count._all;
    } else if (row.status === "CANCELED") {
      counts.canceled = row._count._all;
    }
  }

  return counts;
}

function getAppBaseUrl(request: Request): string {
  return process.env.APP_URL ?? getRequestBaseUrl(request);
}
