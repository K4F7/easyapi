import { adminAddQuota } from "@/lib/newapi";
import { db } from "@/lib/db";

export const CHECKIN_QUOTA_RETRY_ATTEMPTS = 3;
export const CHECKIN_QUOTA_RETRY_DELAY_MS = 400;

export type ApplyCheckinQuotaInput = {
  newApiUserId: string;
  quotaAmount: number;
  ledgerId: string;
  checkedInKey: string;
};

export type ApplyCheckinQuotaOptions = {
  retryAttempts?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export function isCheckinQuotaApplied(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  return (metadata as { quotaApplied?: boolean }).quotaApplied === true;
}

export async function applyCheckinQuota(
  input: ApplyCheckinQuotaInput,
  options: ApplyCheckinQuotaOptions = {},
) {
  const retryAttempts = options.retryAttempts ?? CHECKIN_QUOTA_RETRY_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? CHECKIN_QUOTA_RETRY_DELAY_MS;
  const sleepFn = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    try {
      await adminAddQuota({
        userId: input.newApiUserId,
        value: input.quotaAmount,
      });

      await db.walletLedger.update({
        where: { id: input.ledgerId },
        data: {
          metadata: {
            source: "checkin",
            checkedInOn: input.checkedInKey,
            newApiUserId: input.newApiUserId,
            quotaAmount: input.quotaAmount,
            quotaApplied: true,
          },
        },
      });

      return;
    } catch (error) {
      lastError = error;

      if (attempt < retryAttempts) {
        await sleepFn(retryDelayMs * attempt);
      }
    }
  }

  throw lastError;
}

function defaultSleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
