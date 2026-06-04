import { Prisma } from "@prisma/client";



import { jsonError, jsonOk, requireUser } from "@/lib/auth";

import { getServerEnv } from "@/lib/env";

import { db } from "@/lib/db";

import { getUserNewApiAuth, handleApiError } from "@/lib/api/bff";

import {

  applyCheckinQuota,

  isCheckinQuotaApplied,

} from "@/lib/checkin/quota";

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

      return respondForExistingCheckin({

        existing,

        checkedInKey,

        newApiUserId: authResult.auth.userId,

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

            newApiUserId: authResult.auth.userId,

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



    try {

      if (env.CHECKIN_QUOTA > 0) {

        await applyCheckinQuota({

          newApiUserId: authResult.auth.userId,

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

      console.error("checkin: adminAddQuota failed", error);



      return jsonError(

        {

          code: "CHECKIN_QUOTA_APPLY_FAILED",

          message:

            "签到已记录，但额度发放失败，请再次点击签到重试",

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



async function respondForExistingCheckin(input: {

  existing: NonNullable<Awaited<ReturnType<typeof findExistingCheckin>>>;

  checkedInKey: string;

  newApiUserId: string;

  quotaAmount: number;

}) {

  const { existing, checkedInKey, newApiUserId, quotaAmount } = input;

  const quotaApplied = isCheckinQuotaApplied(existing.ledgerMetadata);



  if (quotaAmount > 0 && existing.ledgerId && !quotaApplied) {

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

      console.error("checkin: retry adminAddQuota failed", error);



      return jsonError(

        {

          code: "CHECKIN_QUOTA_APPLY_FAILED",

          message: "今日已签到，但额度发放失败，请稍后重试或联系客服",

          details: {

            checkedInOn: checkedInKey,

            ledgerId: existing.ledgerId,

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

