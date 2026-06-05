import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { adminAddQuota, NewApiError } from "@/lib/newapi";

export async function applyCheckinQuota({
  newApiUserId,
  quotaAmount,
  ledgerId,
  checkedInKey,
}: {
  newApiUserId: string;
  quotaAmount: number;
  ledgerId: string;
  checkedInKey: string;
}) {
  await adminAddQuota({
    userId: newApiUserId,
    value: quotaAmount,
  });

  await db.walletLedger.update({
    where: { id: ledgerId },
    data: {
      metadata: {
        source: "checkin",
        checkedInOn: checkedInKey,
        newApiUserId,
        quotaAmount,
        quotaApplied: true,
      },
    },
  });
}

export function isCheckinQuotaApplied(metadata: unknown): boolean {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).quotaApplied === true
  );
}

export function describeCheckinQuotaError(error: unknown): {
  status?: number;
  code?: string | number | boolean;
  message: string;
} {
  if (error instanceof NewApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  return {
    message: error instanceof Error ? error.message : "Unknown quota apply error",
  };
}
