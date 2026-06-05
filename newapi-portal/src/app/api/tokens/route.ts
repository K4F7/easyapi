import { z } from "zod";

import { jsonError, jsonOk, readJson, requireUser } from "@/lib/auth";
import {
  getUserNewApiAuth,
  handleApiError,
  parsePositiveInt,
} from "@/lib/api/bff";
import {
  isDevMockEnabled,
  mockTokenCreateResponse,
  mockTokensListResponse,
} from "@/lib/dev-mock";
import { createTokenAndRevealKey, listTokens, type NewApiToken } from "@/lib/newapi";
import { cnyToQuota } from "@/lib/quota/display-config.shared";
import { getQuotaDisplayConfig } from "@/lib/quota/get-display-config";
import { maskToken, normalizePage } from "@/lib/quota/usage";

export const runtime = "nodejs";

const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(64),
  expired_time: z.number().int().nonnegative().optional(),
  /** 人民币余额上限（与门户展示一致，由服务端按 NewAPI 汇率换算为上游额度） */
  remain_quota_cny: z.number().positive().optional(),
  unlimited_quota: z.boolean().optional(),
  model_limits_enabled: z.boolean().optional(),
  model_limits: z.string().max(4000).optional(),
  allow_ips: z.string().max(4000).nullable().optional(),
  group: z.string().max(128).optional(),
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
    return handleApiError(error, "Failed to list tokens");
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

    const input = await readJson(request, createTokenSchema);
    const { remain_quota_cny, ...rest } = input;
    const quotaConfig = await getQuotaDisplayConfig();
    const created = await createTokenAndRevealKey(authResult.auth, {
      ...rest,
      remain_quota:
        remain_quota_cny !== undefined
          ? cnyToQuota(remain_quota_cny, quotaConfig)
          : undefined,
    });

    return jsonOk(
      {
        token: created.token ? maskToken(created.token) : undefined,
        key: created.key ?? null,
        keyReturnedOnce: Boolean(created.key),
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, "Failed to create token");
  }
}
