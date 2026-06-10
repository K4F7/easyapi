import { z } from "zod";

import { AuthError, jsonError, jsonOk, readJson, requireUser, zodErrorResponse } from "@/lib/auth";
import { resolveAccessToken } from "@/lib/api/bff";
import { db } from "@/lib/db";
import { isDevMockEnabled, mockBillingRedeemResponse } from "@/lib/dev-mock";
import { redeemTopup } from "@/lib/newapi";
import { NewApiError } from "@/lib/newapi/client";

export const runtime = "nodejs";

const redeemSchema = z.object({
  code: z.string().trim().min(1).max(128),
});

export async function POST(request: Request) {
  if (isDevMockEnabled()) {
    return mockBillingRedeemResponse(request);
  }

  try {
    const publicUser = await requireUser();
    const input = await readJson(request, redeemSchema);
    const user = await db.user.findUnique({
      where: { id: publicUser.id },
      select: {
        id: true,
        newApiUserId: true,
        newApiAccessTokenCiphertext: true,
      },
    });

    if (!user?.newApiUserId || !user.newApiAccessTokenCiphertext) {
      return jsonError(
        {
          code: "NEWAPI_BINDING_REQUIRED",
          message: "NewAPI user binding is not ready for this account",
        },
        409,
      );
    }

    const accessToken = await resolveAccessToken(user.newApiAccessTokenCiphertext);

    const result = await redeemTopup(
      {
        userId: user.newApiUserId,
        accessToken,
      },
      input.code,
    );
    const quotaAmount = extractQuotaAmount(result.data) ?? 0;

    return jsonOk({
      redeemed: true,
      duplicate: false,
      quotaAmount,
      upstream: result.data,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError({ code: error.code, message: error.message }, error.status);
    }

    if (error instanceof z.ZodError) {
      return zodErrorResponse(error);
    }

    if (error instanceof NewApiError) {
      return jsonError(
        {
          code: "REDEEM_FAILED",
          message: error.message || "Redemption code is invalid or already used",
        },
        error.status && error.status >= 400 ? error.status : 400,
      );
    }

    console.error("billing redeem failed", error);
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to redeem code" }, 500);
  }
}

function extractQuotaAmount(value: unknown): number | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const queue: unknown[] = [value];
  const quotaKeys = new Set(["quota", "quota_amount", "quotaAmount", "topup_quota", "topupQuota"]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (typeof current !== "object" || current === null) {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    for (const [key, entryValue] of Object.entries(current)) {
      if (quotaKeys.has(key)) {
        const quota = toPositiveInteger(entryValue);

        if (quota !== null) {
          return quota;
        }
      }

      if (typeof entryValue === "object" && entryValue !== null) {
        queue.push(entryValue);
      }
    }
  }

  return null;
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);

    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}
