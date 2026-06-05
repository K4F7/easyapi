import { Prisma } from "@prisma/client";

import { jsonOk, requireUser } from "@/lib/auth";
import { getRequestBaseUrl, getPortalUserForApi, handleApiError } from "@/lib/api/bff";
import { db } from "@/lib/db";
import { isDevMockEnabled, mockReferralResponse } from "@/lib/dev-mock";
import { getServerEnv } from "@/lib/env";
import { adminAddQuota } from "@/lib/newapi";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (isDevMockEnabled()) {
    return mockReferralResponse(request);
  }

  try {
    const publicUser = await requireUser();
    const user = await getPortalUserForApi(publicUser.id);
    const rewardSettlement = await settlePendingReferralRewards(
      user.id,
      user.newApiUserId,
    );
    const [referralSummary, rewardRecords] = await Promise.all([
      db.referral.groupBy({
        by: ["status"],
        where: { referrerId: user.id },
        _count: { _all: true },
      }),
      db.walletLedger.findMany({
        where: {
          userId: user.id,
          reason: "referral_reward",
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          amount: true,
          reason: true,
          idempotencyKey: true,
          referralId: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ]);
    const inviteLink = new URL("/register", getAppBaseUrl(request));
    inviteLink.searchParams.set("inviteCode", user.inviteCode);

    return jsonOk({
      inviteCode: user.inviteCode,
      inviteLink: inviteLink.toString(),
      invitedCount: countReferralStatus(referralSummary),
      rewards: rewardRecords.map((record) => ({
        ...record,
        createdAt: record.createdAt.toISOString(),
      })),
      settlement: rewardSettlement,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load referral data");
  }
}

async function settlePendingReferralRewards(
  referrerId: string,
  newApiUserId: string | null,
) {
  const env = getServerEnv();

  if (!newApiUserId) {
    return {
      attempted: false,
      reason: "NEWAPI_BINDING_PENDING",
      settled: 0,
      failed: 0,
    };
  }

  if (env.INVITE_REWARD_QUOTA <= 0) {
    return {
      attempted: false,
      reason: "INVITE_REWARD_QUOTA_ZERO",
      settled: 0,
      failed: 0,
    };
  }

  const pendingReferrals = await db.referral.findMany({
    where: {
      referrerId,
      status: "PENDING",
    },
    select: {
      id: true,
      referredUserId: true,
      inviteCodeUsed: true,
    },
    take: 20,
  });
  let settled = 0;
  let failed = 0;

  for (const referral of pendingReferrals) {
    const idempotencyKey = `referral:${referral.id}:reward`;
    let ledger:
      | {
          id: string;
        }
      | null = null;

    try {
      ledger = await db.walletLedger.create({
        data: {
          userId: referrerId,
          type: "CREDIT",
          amount: env.INVITE_REWARD_QUOTA,
          reason: "referral_reward",
          idempotencyKey,
          referralId: referral.id,
          metadata: {
            source: "referral",
            newApiUserId,
            referredUserId: referral.referredUserId,
            inviteCodeUsed: referral.inviteCodeUsed,
            quotaAmount: env.INVITE_REWARD_QUOTA,
            quotaApplied: false,
          },
        },
        select: { id: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }

    try {
      await adminAddQuota({
        userId: newApiUserId,
        value: env.INVITE_REWARD_QUOTA,
      });

      await db.$transaction([
        db.referral.update({
          where: { id: referral.id },
          data: {
            status: "REWARDED",
            rewardedAt: new Date(),
          },
        }),
        db.walletLedger.update({
          where: { id: ledger.id },
          data: {
            metadata: {
              source: "referral",
              newApiUserId,
              referredUserId: referral.referredUserId,
              inviteCodeUsed: referral.inviteCodeUsed,
              quotaAmount: env.INVITE_REWARD_QUOTA,
              quotaApplied: true,
            },
          },
        }),
      ]);
      settled += 1;
    } catch (error) {
      failed += 1;
      console.error("referral: adminAddQuota failed", error);
    }
  }

  return {
    attempted: pendingReferrals.length > 0,
    settled,
    failed,
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
