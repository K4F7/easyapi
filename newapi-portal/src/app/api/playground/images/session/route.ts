import { z } from "zod";

import { getUserNewApiAuth, handleApiError } from "@/lib/api/bff";
import { jsonError, jsonOk, readJson, requireUser } from "@/lib/auth";
import { isDevMockEnabled, mockPlaygroundImageSessionResponse } from "@/lib/dev-mock";
import { NewApiError } from "@/lib/newapi";
import {
  resolveImageEmbedTarget,
  resolveSessionOrigins,
  type ImageEmbedTarget,
} from "@/lib/playground/image-playground-origins";
import { ensurePlaygroundImageTokenId } from "@/lib/playground/ensure-token";
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
  embedTarget: z.literal("proxy").optional(),
});

export async function POST(request: Request) {
  if (isDevMockEnabled()) {
    return mockPlaygroundImageSessionResponse();
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

    const body = await readJson(request, imageSessionSchema);
    const imageTokenId = await ensurePlaygroundImageTokenId(authResult.auth);
    await assertPlaygroundTokenAccess(authResult.auth, imageTokenId);
    const embedTarget: ImageEmbedTarget = resolveImageEmbedTarget(
      body.embedTarget,
    );
    let portalOrigin: string;
    let playgroundOrigin: string;

    try {
      ({ portalOrigin, playgroundOrigin } = resolveSessionOrigins(
        request,
        embedTarget,
      ));
    } catch {
      return jsonError(
        {
          code: "IMAGE_PLAYGROUND_NOT_CONFIGURED",
          message: "生图 Playground 未配置，无法签发会话",
        },
        503,
      );
    }

    const token = signPlaygroundImageSessionToken({
      userId: user.id,
      tokenId: imageTokenId,
      portalOrigin,
      playgroundOrigin,
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
