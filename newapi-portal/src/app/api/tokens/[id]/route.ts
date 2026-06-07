import { z } from "zod";

import { jsonError, jsonOk, readJson, requireUser } from "@/lib/auth";
import { channelGroupSchema } from "@/lib/channels/tiers";
import {
  isDevMockEnabled,
  mockTokenDeleteResponse,
  mockTokenUpdateResponse,
} from "@/lib/dev-mock";
import { getUserNewApiAuth, handleApiError } from "@/lib/api/bff";
import { deleteToken, getToken, updateToken } from "@/lib/newapi";
import { isManagedPlaygroundToken } from "@/lib/playground/token-identity";
import { maskToken } from "@/lib/quota/usage";

export const runtime = "nodejs";

const updateTokenSchema = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    expired_time: z.number().int().nonnegative().optional(),
    remain_quota: z.number().int().nonnegative().optional(),
    unlimited_quota: z.boolean().optional(),
    model_limits_enabled: z.boolean().optional(),
    model_limits: z.string().max(4000).optional(),
    allow_ips: z.string().max(4000).nullable().optional(),
    group: channelGroupSchema.optional(),
    cross_group_retry: z.boolean().optional(),
    status: z.number().int().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "至少提供一个要更新的字段",
  });

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (isDevMockEnabled()) {
    return mockTokenUpdateResponse(request, id);
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

    const input = await readJson(request, updateTokenSchema);
    const targetToken = await getToken(authResult.auth, numericId);

    if (isManagedPlaygroundToken(targetToken)) {
      return jsonError(
        {
          code: "PLAYGROUND_TOKEN_LOCKED",
          message: "操练场 Token 不可编辑",
        },
        403,
      );
    }

    const patch = {
      id: numericId,
      ...input,
    };
    const updated =
      (await updateToken(authResult.auth, patch)) ??
      (await getToken(authResult.auth, numericId));

    return jsonOk({
      token: maskToken(updated),
    });
  } catch (error) {
    return handleApiError(error, "更新令牌失败");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (isDevMockEnabled()) {
    return mockTokenDeleteResponse(id);
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

    const targetToken = await getToken(authResult.auth, numericId);

    if (isManagedPlaygroundToken(targetToken)) {
      return jsonError(
        {
          code: "PLAYGROUND_TOKEN_LOCKED",
          message: "操练场 Token 不可删除",
        },
        403,
      );
    }

    await deleteToken(authResult.auth, numericId);

    return jsonOk({
      deleted: true,
      id: numericId,
    });
  } catch (error) {
    return handleApiError(error, "删除令牌失败");
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
