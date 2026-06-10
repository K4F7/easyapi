import { z } from "zod";

import { getUserNewApiAuth, handleApiError } from "@/lib/api/bff";
import { jsonError, jsonOk, readJson, requireUser, zodErrorResponse } from "@/lib/auth";
import { isDevMockEnabled, mockCheckinResponse } from "@/lib/dev-mock";
import { doCheckin } from "@/lib/newapi/checkin";
import { NewApiError } from "@/lib/newapi/client";
import { getNewApiStatus } from "@/lib/newapi/status";

export const runtime = "nodejs";

const checkinSchema = z.object({
  turnstile: z.string().trim().max(2048).optional(),
});

export async function POST(request: Request) {
  if (isDevMockEnabled()) {
    return mockCheckinResponse();
  }

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

    const status = await getNewApiStatus();

    if (status && !status.checkinEnabled) {
      return jsonError(
        {
          code: "CHECKIN_DISABLED",
          message: "签到功能未启用",
        },
        403,
      );
    }

    const turnstileFromQuery = new URL(request.url).searchParams.get("turnstile");
    let turnstile = turnstileFromQuery ?? undefined;

    if (request.headers.get("content-type")?.includes("application/json")) {
      const input = await readJson(request, checkinSchema);
      turnstile = input.turnstile ?? turnstile;
    }

    const result = await doCheckin(authResult.auth, { turnstile });

    return jsonOk({
      checkedIn: true,
      alreadyCheckedIn: false,
      checkedInOn: result.checkin_date,
      quotaAmount: result.quota_awarded,
      quotaApplied: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodErrorResponse(error);
    }

    if (error instanceof NewApiError) {
      const message = error.message || "签到失败";

      if (message.includes("今日已签到") || message.includes("already")) {
        return jsonOk({
          checkedIn: true,
          alreadyCheckedIn: true,
          checkedInOn: new Date().toISOString().slice(0, 10),
          quotaAmount: 0,
          quotaApplied: true,
        });
      }

      if (message.includes("未启用")) {
        return jsonError(
          {
            code: "CHECKIN_DISABLED",
            message,
          },
          403,
        );
      }

      return jsonError(
        {
          code: "CHECKIN_FAILED",
          message,
        },
        error.status && error.status >= 400 && error.status < 500
          ? error.status
          : 502,
      );
    }

    return handleApiError(error, "Failed to check in");
  }
}
