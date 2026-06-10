import { z } from "zod";

import { jsonError, jsonOk, readJson, requireUser } from "@/lib/auth";
import {
  getUserNewApiAuth,
  handleApiError,
  parsePositiveInt,
} from "@/lib/api/bff";
import { channelGroupSchema } from "@/lib/channels/tiers";
import {
  isDevMockEnabled,
  mockTokenCreateResponse,
  mockTokensListResponse,
} from "@/lib/dev-mock";
import { createTokenAndRevealKey, listTokens, type NewApiToken } from "@/lib/newapi";
import { isManagedPlaygroundTokenName } from "@/lib/playground/token-identity";
import { getQuotaDisplayConfig } from "@/lib/quota/get-display-config";
import { cnyToQuota } from "@/lib/quota/display-config.shared";
import { maskToken, normalizePage } from "@/lib/quota/usage";

export const runtime = "nodejs";

const createTokenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((name) => !isManagedPlaygroundTokenName(name), {
      message: "该名称为系统保留的操练场 Token 名称",
    }),
  expired_time: z.number().int().nonnegative().optional(),
  remain_quota: z.number().int().nonnegative().optional(),
  remain_quota_cny: z.number().nonnegative().optional(),
  unlimited_quota: z.boolean().optional(),
  model_limits_enabled: z.boolean().optional(),
  model_limits: z.string().max(4000).optional(),
  allow_ips: z.string().max(4000).nullable().optional(),
  group: channelGroupSchema.optional(),
  cross_group_retry: z.boolean().optional(),
});

export async function GET(request: Request) {
  if (isDevMockEnabled()) {
    return mockTokensListResponse(request);
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

    const url = new URL(request.url);
    const page = parsePositiveInt(url.searchParams.get("p"), 1, 10_000);
    const pageSize = parsePositiveInt(url.searchParams.get("size"), 20, 100);
    const tokensPage = normalizePage<NewApiToken>(
      await listTokens(authResult.auth, { p: page, size: pageSize }),
      page,
      pageSize,
    );

    return jsonOk({
      ...tokensPage,
      items: tokensPage.items.map(maskToken),
    });
  } catch (error) {
    return handleApiError(error, "获取令牌列表失败");
  }
}

export async function POST(request: Request) {
  if (isDevMockEnabled()) {
    return mockTokenCreateResponse(request);
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

    const { remain_quota_cny: remainQuotaCny, ...input } = await readJson(
      request,
      createTokenSchema,
    );
    const remainQuota =
      input.remain_quota ??
      (remainQuotaCny === undefined
        ? undefined
        : cnyToQuota(remainQuotaCny, await getQuotaDisplayConfig()));
    const tokenInput = {
      ...input,
      ...(remainQuota !== undefined ? { remain_quota: remainQuota } : {}),
      ...(remainQuota === undefined && input.unlimited_quota === undefined
        ? { unlimited_quota: true }
        : {}),
    };
    const created = await createTokenAndRevealKey(authResult.auth, tokenInput);

    return jsonOk(
      {
        token: created.token ? maskToken(created.token) : undefined,
        key: created.key ?? null,
        keyReturnedOnce: Boolean(created.key),
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, "创建令牌失败");
  }
}
