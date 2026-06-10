import { z } from "zod";

import { jsonError, jsonOk, requireUser } from "@/lib/auth";
import { getUserNewApiAuth, handleApiError } from "@/lib/api/bff";
import { isDevMockEnabled, mockTokenRevealKeyResponse } from "@/lib/dev-mock";
import { revealTokenKey } from "@/lib/newapi";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (isDevMockEnabled()) {
    return mockTokenRevealKeyResponse(id);
  }

  try {
    const numericId = parseTokenId(id);
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

    const key = await revealTokenKey(authResult.auth, numericId);

    return jsonOk({ key });
  } catch (error) {
    return handleApiError(error, "获取令牌密钥失败");
  }
}

function parseTokenId(id: string): number {
  const numericId = Number(id);

  if (!id || !Number.isInteger(numericId) || numericId <= 0) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message: "令牌 ID 无效",
      },
    ]);
  }

  return numericId;
}
