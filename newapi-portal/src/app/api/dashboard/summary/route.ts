import { jsonOk, requireUser } from "@/lib/auth";
import { isDevMockEnabled, mockDashboardSummaryResponse } from "@/lib/dev-mock";
import {
  getRequestBaseUrl,
  getUserNewApiAuth,
  handleApiError,
  publicUserFromPortalUser,
} from "@/lib/api/bff";
import { db } from "@/lib/db";
import {
  getSelf,
  getUsageData,
  listTokens,
  NewApiError,
  type NewApiToken,
} from "@/lib/newapi";
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
  if (isDevMockEnabled()) {
    return mockDashboardSummaryResponse(request);
  }

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

    if (!authResult.ok) {
      return jsonOk({
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
      const [self, tokensPageRaw, todayUsage, weekUsage] = await Promise.all([
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
      ]);
      const tokensPage = normalizePage<NewApiToken>(tokensPageRaw, 1, 1);

      return jsonOk({
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
  } | null,
) {
  return {
    checkedInToday: Boolean(checkin),
    checkedInOn: checkin ? dateKey(checkin.checkedInOn) : dateKey(todayDateOnly()),
    status: checkin?.status ?? "AVAILABLE",
    checkinId: checkin?.id ?? null,
    createdAt: checkin?.createdAt.toISOString() ?? null,
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
