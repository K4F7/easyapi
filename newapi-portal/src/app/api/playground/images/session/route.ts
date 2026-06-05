import { z } from "zod";

import { getUserNewApiAuth, handleApiError } from "@/lib/api/bff";
import { jsonError, jsonOk, readJson, requireUser } from "@/lib/auth";
import { NewApiError } from "@/lib/newapi";
import {
  imageSessionTokenTtlSeconds,
  signPlaygroundImageSessionToken,
} from "@/lib/playground/image-session-token";
import {
  assertPlaygroundTokenAccess,
  PlaygroundError,
} from "@/lib/newapi/playground";

export const runtime = "nodejs";

const imageSessionSchema = z.object({
  tokenId: z
    .preprocess(
      (value) => (typeof value === "string" ? Number(value) : value),
      z.number().int().positive(),
    ),
});

export async function POST(request: Request) {
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

    const body = await readJson(request, imageSessionSchema);
    await assertPlaygroundTokenAccess(authResult.auth, body.tokenId);
    const token = signPlaygroundImageSessionToken({
      userId: user.id,
      tokenId: body.tokenId,
    });

    return jsonOk({
      token,
      tokenType: "Bearer",
      expiresIn: imageSessionTokenTtlSeconds,
    });
  } catch (error) {
    if (error instanceof PlaygroundError) {
      return jsonError(
        {
          code: "PLAYGROUND_ERROR",
          message: "无法校验所选令牌，请稍后重试",
        },
        error.status,
      );
    }
    if (error instanceof NewApiError) {
      return jsonError(
        {
          code: "TOKEN_RESOLUTION_FAILED",
          message: "无法校验所选令牌，请稍后重试",
          details: {
            status: error.status,
            code: error.code,
          },
        },
        502,
      );
    }

    return handleApiError(error, "Failed to create playground image session");
  }
}
