import { Prisma } from "@prisma/client";

import { jsonError, jsonOk, requireUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { db } from "@/lib/db";
import { getUserNewApiAuth, handleApiError } from "@/lib/api/bff";
import { adminAddQuota } from "@/lib/newapi";
import { dateKey, todayDateOnly } from "@/lib/quota/usage";

export const runtime = "nodejs";

export async function POST() {
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
      return jsonOk({
        checkedIn: true,
        alreadyCheckedIn: true,
        checkedInOn: checkedInKey,
        quotaAmount: 0,
        quotaApplied: false,
        ledgerId: existing.ledgerId,
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

        return jsonOk({
          checkedIn: true,
          alreadyCheckedIn: true,
          checkedInOn: checkedInKey,
          quotaAmount: 0,
          quotaApplied: false,
          ledgerId: duplicate?.ledgerId ?? null,
        });
      }

      throw error;
    }

    try {
      if (env.CHECKIN_QUOTA > 0) {
        await adminAddQuota({
          userId: authResult.auth.userId,
          value: env.CHECKIN_QUOTA,
        });
      }

      await db.walletLedger.update({
        where: { id: created.ledgerId },
        data: {
          metadata: {
            source: "checkin",
            checkedInOn: checkedInKey,
            newApiUserId: authResult.auth.userId,
            quotaAmount: env.CHECKIN_QUOTA,
            quotaApplied: true,
          },
        },
      });

      return jsonOk({
        checkedIn: true,
        alreadyCheckedIn: false,
        checkedInOn: checkedInKey,
        quotaAmount: env.CHECKIN_QUOTA,
        quotaApplied: true,
        checkinId: created.checkinId,
        ledgerId: created.ledgerId,
      });
    } catch (error) {
      console.error("checkin: adminAddQuota failed", error);

      return jsonError(
        {
          code: "CHECKIN_QUOTA_APPLY_FAILED",
          message:
            "Check-in was recorded, but upstream quota could not be applied",
          details: {
            checkedInOn: checkedInKey,
            ledgerId: created.ledgerId,
          },
        },
        502,
      );
    }
  } catch (error) {
    return handleApiError(error, "Failed to check in");
  }
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
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!checkin) {
    return null;
  }

  return {
    checkinId: checkin.id,
    ledgerId: checkin.ledgerEntries[0]?.id ?? null,
  };
}
