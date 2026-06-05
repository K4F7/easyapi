import { Prisma } from "@prisma/client";

import { getUserNewApiAuth, handleApiError } from "@/lib/api/bff";
import { jsonError, jsonOk, requireUser } from "@/lib/auth";
import {
  applyCheckinQuota,
  describeCheckinQuotaError,
  isCheckinQuotaApplied,
} from "@/lib/checkin/quota";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { dateKey, todayDateOnly } from "@/lib/quota/usage";

export const runtime = "nodejs";

const CHECKIN_QUOTA_NEWAPI_PATH = "/api/user/manage";

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const user = await requireUser();
    const authResult = await getUserNewApiAuth(user);

    if (!authResult.ok) {
      return jsonError(
        {
          code: authResult.code,
          message: authResult.message,
        },
        409,
      );
    }

    const env = getServerEnv();
    const checkedInOn = todayDateOnly();
    const checkedInKey = dateKey(checkedInOn);
    const idempotencyKey = `checkin:${user.id}:${checkedInKey}`;
    const existing = await findExistingCheckin(user.id, checkedInOn);

    if (existing) {
      return respondForExistingCheckin({
        existing,
        checkedInKey,
        requestId,
        userId: user.id,
        newApiUserId: String(authResult.auth.userId),
        quotaAmount: env.CHECKIN_QUOTA,
      });
    }

    let created: {
      checkinId: string;
      ledgerId: string;
    };

    try {
      created = await db.$transaction(async (tx) => {
        const checkin = await tx.checkin.create({
          data: {
            userId: user.id,
            checkedInOn,
          },
        });
        const ledger = await tx.walletLedger.create({
          data: {
            userId: user.id,
            type: "CREDIT",
            amount: env.CHECKIN_QUOTA,
            reason: "daily_checkin",
            idempotencyKey,
            checkinId: checkin.id,
            metadata: {
              source: "checkin",
              checkedInOn: checkedInKey,
              newApiUserId: authResult.auth.userId,
              quotaAmount: env.CHECKIN_QUOTA,
              quotaApplied: false,
            },
          },
        });

        return {
          checkinId: checkin.id,
          ledgerId: ledger.id,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const duplicate = await findExistingCheckin(user.id, checkedInOn);

        if (duplicate) {
          return respondForExistingCheckin({
            existing: duplicate,
            checkedInKey,
            requestId,
            userId: user.id,
            newApiUserId: String(authResult.auth.userId),
            quotaAmount: env.CHECKIN_QUOTA,
          });
        }

        return jsonOk({
          checkedIn: true,
          alreadyCheckedIn: true,
          checkedInOn: checkedInKey,
          quotaAmount: 0,
          quotaApplied: false,
          ledgerId: null,
        });
      }

      throw error;
    }

    const quotaStartedAt = Date.now();

    try {
      if (env.CHECKIN_QUOTA > 0) {
        await applyCheckinQuota({
          newApiUserId: String(authResult.auth.userId),
          quotaAmount: env.CHECKIN_QUOTA,
          ledgerId: created.ledgerId,
          checkedInKey,
        });
      }

      return jsonOk({
        checkedIn: true,
        alreadyCheckedIn: false,
        checkedInOn: checkedInKey,
        quotaAmount: env.CHECKIN_QUOTA,
        quotaApplied: env.CHECKIN_QUOTA > 0,
        checkinId: created.checkinId,
        ledgerId: created.ledgerId,
      });
    } catch (error) {
      const upstream = describeCheckinQuotaError(error);

      console.error("checkin: adminAddQuota failed", {
        requestId,
        userId: user.id,
        ledgerId: created.ledgerId,
        checkedInOn: checkedInKey,
        newApiUserId: authResult.auth.userId,
        newApiPath: CHECKIN_QUOTA_NEWAPI_PATH,
        quotaAmount: env.CHECKIN_QUOTA,
        elapsedMs: Date.now() - quotaStartedAt,
        upstreamStatus: upstream.status,
        upstreamCode: upstream.code,
        upstreamMessage: upstream.message,
      });

      return jsonError(
        {
          code: "CHECKIN_QUOTA_APPLY_FAILED",
          message: "签到已记录，但额度发放失败，请再次点击签到重试",
          details: {
            requestId,
            checkedInOn: checkedInKey,
            ledgerId: created.ledgerId,
            upstreamStatus: upstream.status,
            upstreamCode: upstream.code,
          },
        },
        502,
      );
    }
  } catch (error) {
    return handleApiError(error, "Failed to check in");
  }
}

async function respondForExistingCheckin(input: {
  existing: NonNullable<Awaited<ReturnType<typeof findExistingCheckin>>>;
  checkedInKey: string;
  requestId: string;
  userId: string;
  newApiUserId: string;
  quotaAmount: number;
}) {
  const { existing, checkedInKey, requestId, userId, newApiUserId, quotaAmount } =
    input;
  const quotaApplied = isCheckinQuotaApplied(existing.ledgerMetadata);

  if (quotaAmount > 0 && existing.ledgerId && !quotaApplied) {
    const quotaStartedAt = Date.now();

    try {
      await applyCheckinQuota({
        newApiUserId,
        quotaAmount,
        ledgerId: existing.ledgerId,
        checkedInKey,
      });

      return jsonOk({
        checkedIn: true,
        alreadyCheckedIn: true,
        checkedInOn: checkedInKey,
        quotaAmount,
        quotaApplied: true,
        checkinId: existing.checkinId,
        ledgerId: existing.ledgerId,
      });
    } catch (error) {
      const upstream = describeCheckinQuotaError(error);

      console.error("checkin: retry adminAddQuota failed", {
        requestId,
        userId,
        ledgerId: existing.ledgerId,
        checkedInOn: checkedInKey,
        newApiUserId,
        newApiPath: CHECKIN_QUOTA_NEWAPI_PATH,
        quotaAmount,
        elapsedMs: Date.now() - quotaStartedAt,
        upstreamStatus: upstream.status,
        upstreamCode: upstream.code,
        upstreamMessage: upstream.message,
      });

      return jsonError(
        {
          code: "CHECKIN_QUOTA_APPLY_FAILED",
          message: "今日已签到，但额度发放失败，请稍后重试或联系客服",
          details: {
            requestId,
            checkedInOn: checkedInKey,
            ledgerId: existing.ledgerId,
            upstreamStatus: upstream.status,
            upstreamCode: upstream.code,
          },
        },
        502,
      );
    }
  }

  return jsonOk({
    checkedIn: true,
    alreadyCheckedIn: true,
    checkedInOn: checkedInKey,
    quotaAmount: quotaApplied ? quotaAmount : 0,
    quotaApplied,
    checkinId: existing.checkinId,
    ledgerId: existing.ledgerId,
  });
}

async function findExistingCheckin(userId: string, checkedInOn: Date) {
  const checkin = await db.checkin.findUnique({
    where: {
      userId_checkedInOn: {
        userId,
        checkedInOn,
      },
    },
    include: {
      ledgerEntries: {
        select: { id: true, metadata: true },
        take: 1,
      },
    },
  });

  if (!checkin) {
    return null;
  }

  const ledger = checkin.ledgerEntries[0];

  return {
    checkinId: checkin.id,
    ledgerId: ledger?.id ?? null,
    ledgerMetadata: ledger?.metadata ?? null,
  };
}
