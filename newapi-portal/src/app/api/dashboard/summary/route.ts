import { jsonOk, requireUser } from "@/lib/auth";
import { isDevMockEnabled, mockDashboardSummaryResponse } from "@/lib/dev-mock";
import {
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
    const [checkin] = await Promise.all([
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
    ]);

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
        logStats: pendingLogStats(),
        checkin: formatCheckin(checkin),
      });
    }

    const now = nowTimestamp();
    const todayStart = startOfTodayTimestamp();
    const weekStart = startOfWeekTimestamp();

    try {
      const [self, tokensPageRaw, todayUsage, weekUsage, logStatsRaw] =
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
        logStats: formatLogStats(logStatsRaw),
        checkin: formatCheckin(checkin),
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
        logStats: errorLogStats(),
        checkin: formatCheckin(checkin),
      });
    }
  } catch (error) {
    return handleApiError(error, "Failed to load dashboard summary");
  }
}

function pendingLogStats() {
  return { rpm: null, tpm: null, status: "pending" };
}

function errorLogStats() {
  return { rpm: null, tpm: null, status: "upstream_error" };
}

function formatLogStats(stats: { rpm?: number; tpm?: number }) {
  return {
    rpm: stats.rpm ?? null,
    tpm: stats.tpm ?? null,
    status: "ready",
  };
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

