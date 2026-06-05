import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { jsonError, jsonOk, sessionCookieName, sessionMaxAgeSeconds } from "@/lib/auth";
import {
  createMockOrder,
  createMockToken,
  deleteMockToken,
  getMockSessionToken,
  getMockState,
  getMockUser,
  listMockTokens,
  checkInMockUser,
  redeemMockCode,
} from "@/lib/dev-mock/store";
import { mockLogs, mockModels, mockQuotaConfig, mockUsageResponse } from "@/lib/dev-mock/fixtures";
import { cnyToQuota } from "@/lib/quota/display-config.shared";
import { maskToken } from "@/lib/quota/usage";

export async function getMockCurrentUser() {
  const cookieStore = await cookies();
  return cookieStore.get(sessionCookieName)?.value === getMockSessionToken()
    ? getMockUser()
    : null;
}

export async function createMockSession(request?: Request) {
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000);
  const response = jsonOk({
    user: getMockUser(),
    session: { expiresAt: expiresAt.toISOString() },
    authSource: "dev_mock",
  });

  response.cookies.set(sessionCookieName, getMockSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: request ? new URL(request.url).protocol === "https:" : false,
    path: "/",
    maxAge: sessionMaxAgeSeconds,
    expires: expiresAt,
  });
  return response;
}

export async function mockLoginResponse(request: Request) {
  const body = await request.json().catch(() => ({}));
  const identifier =
    typeof body.identifier === "string"
      ? body.identifier.trim()
      : typeof body.email === "string"
        ? body.email.trim()
        : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!identifier || !password) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Email/username or password is incorrect",
        },
      },
      { status: 401 },
    );
  }

  return createMockSession(request);
}

export async function destroyMockSession() {
  const response = jsonOk({ loggedOut: true });
  response.cookies.delete(sessionCookieName);
  return response;
}

export async function mockAuthMeResponse() {
  const user = await getMockCurrentUser();

  if (!user) {
    return jsonError(
      {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
      401,
    );
  }

  return jsonOk({ user });
}

export function mockRegisterResponse(request: Request) {
  return createMockSession(request);
}

export function mockDashboardSummaryResponse(request: Request) {
  const state = getMockState();
  const origin = new URL(request.url).origin;
  const inviteLink = new URL("/register", origin);
  inviteLink.searchParams.set("inviteCode", state.user.inviteCode);
  const usage = mockUsageResponse();

  return jsonOk({
    quotaConfig: mockQuotaConfig,
    user: state.user,
    newApi: {
      binding: "ready",
      status: "ready",
      self: {
        id: Number(state.user.newApiUserId),
        username: "dev-mock",
        email: state.user.email,
        group: "default",
        quota: state.quota,
        used_quota: state.usedQuota,
        request_count: usage.totals.count,
      },
    },
    tokens: { count: state.tokens.length, status: "ready" },
    usage: {
      today: {
        totals: usage.totals,
        start_timestamp: usage.query.start_timestamp,
        end_timestamp: usage.query.end_timestamp,
      },
      week: {
        totals: usage.totals,
        start_timestamp: usage.query.start_timestamp,
        end_timestamp: usage.query.end_timestamp,
      },
    },
    logStats: { rpm: 3, tpm: 128, status: "ready" },
    checkin: {
      checkedInToday: Boolean(state.checkedInOn),
      checkedInOn: state.checkedInOn,
      status: state.checkedInOn ? "CLAIMED" : "AVAILABLE",
      checkinId: state.checkedInOn ? `mock-checkin-${state.checkedInOn}` : null,
      createdAt: state.checkedInOn ? new Date().toISOString() : null,
      quotaApplied: state.checkedInOn ? true : null,
      quotaPending: false,
    },
    referral: {
      inviteCode: state.user.inviteCode,
      inviteLink: inviteLink.toString(),
      invitedCount: { total: 1, pending: 0, rewarded: 1, canceled: 0 },
      rewardCount: 1,
      rewardQuota: 1000,
    },
  });
}

export function mockTokensListResponse(request: Request) {
  const url = new URL(request.url);
  const page = positiveInt(url.searchParams.get("p"), 1, 10_000);
  const pageSize = positiveInt(
    url.searchParams.get("size") ?? url.searchParams.get("page_size"),
    20,
    100,
  );
  const tokensPage = listMockTokens(page, pageSize);
  return jsonOk({
    ...tokensPage,
    items: tokensPage.items.map(maskToken),
  });
}

export async function mockTokenCreateResponse(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Dev Mock Token";
  const token = createMockToken({
    name,
    expired_time: numberOrUndefined(body.expired_time),
    remain_quota: resolveMockRemainQuota(body),
    unlimited_quota: body.unlimited_quota === true,
    model_limits_enabled: body.model_limits_enabled === true,
    model_limits: typeof body.model_limits === "string" ? body.model_limits : undefined,
    allow_ips: typeof body.allow_ips === "string" || body.allow_ips === null ? body.allow_ips : undefined,
    group: typeof body.group === "string" ? body.group : undefined,
    cross_group_retry: body.cross_group_retry === true,
  });
  return jsonOk(
    {
      token: maskToken(token),
      key: token.key,
      keyReturnedOnce: true,
    },
    { status: 201 },
  );
}

export function mockTokenDeleteResponse(id: string) {
  deleteMockToken(id);
  return jsonOk({ deleted: true });
}

export function mockUsageRouteResponse() {
  return jsonOk(mockUsageResponse());
}

export function mockLogsRouteResponse(request: Request) {
  const url = new URL(request.url);
  const page = positiveInt(url.searchParams.get("p"), 1, 10_000);
  const pageSize = positiveInt(url.searchParams.get("page_size"), 20, 100);
  const all = mockLogs();
  const start = (page - 1) * pageSize;
  const items = all.slice(start, start + pageSize);
  return jsonOk({
    items,
    total: all.length,
    page,
    page_size: pageSize,
    totals: {
      quota: all.reduce((sum, item) => sum + (item.quota ?? 0), 0),
      count: all.length,
      tokenUsed: all.reduce(
        (sum, item) => sum + (item.prompt_tokens ?? 0) + (item.completion_tokens ?? 0),
        0,
      ),
    },
  });
}

export function mockBillingOrdersResponse() {
  return jsonOk({ orders: getMockState().orders });
}

export async function mockBillingRedeemResponse(request: Request) {
  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" && body.code.trim() ? body.code : "DEV-MOCK";
  return jsonOk(redeemMockCode(code));
}

export async function mockBillingEpayCreateResponse(request: Request) {
  const body = await request.json().catch(() => ({}));
  const amountCents = parseAmountCents(body);
  const order = createMockOrder({
    amountCents,
    productCode: typeof body.productCode === "string" ? body.productCode : "quota",
  });
  const action = new URL("/dashboard/billing?payment=mock-return", new URL(request.url).origin).toString();
  return jsonOk(
    {
      order,
      payment: {
        method: "GET",
        action,
        params: {},
        url: action,
      },
    },
    { status: 201 },
  );
}

export function mockCheckinResponse() {
  return jsonOk(checkInMockUser());
}

export function mockReferralResponse(request: Request) {
  const inviteLink = new URL("/register", new URL(request.url).origin);
  inviteLink.searchParams.set("inviteCode", getMockUser().inviteCode);
  return jsonOk({
    inviteCode: getMockUser().inviteCode,
    inviteLink: inviteLink.toString(),
    invitedCount: { total: 1, pending: 0, rewarded: 1, canceled: 0 },
    rewards: [
      {
        id: "mock-referral-ledger-1",
        amount: 1000,
        reason: "referral_reward",
        idempotencyKey: "mock-referral:1:reward",
        referralId: "mock-referral-1",
        metadata: { source: "dev_mock", quotaApplied: true },
        createdAt: new Date().toISOString(),
      },
    ],
    settlement: { attempted: true, settled: 1, failed: 0 },
  });
}

export function mockQuotaConfigResponse() {
  return jsonOk({ config: mockQuotaConfig });
}

export function mockPlaygroundTokenResponse() {
  const tokenId = getMockState().tokens[0]?.id ?? 101;
  return jsonOk({ chatTokenId: tokenId, imageTokenId: tokenId, tokenId });
}

export function mockPlaygroundModelsResponse() {
  return jsonOk({ models: mockModels, fallback: false });
}

export function mockPlaygroundChatResponse() {
  const encoder = new TextEncoder();
  const body = encoder.encode(
    [
      "data: {\"choices\":[{\"delta\":{\"content\":\"Dev mock response\"}}]}",
      "data: [DONE]",
      "",
    ].join("\n\n"),
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}

export function mockPlaygroundImageSessionResponse() {
  return jsonOk({
    token: "portal-image-session-v1.dev-mock",
    tokenType: "Bearer",
    expiresIn: 600,
  });
}

export function mockImageEmbedConfigResponse() {
  return jsonOk({ configured: true });
}

export function mockImagePlaygroundEmbedResponse(request: Request) {
  if (request.method === "HEAD") {
    return new Response(null, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(
    [
      "<!doctype html>",
      '<html lang="zh-CN">',
      "<head>",
      '<meta charset="utf-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
      "<title>Dev Mock Image Playground</title>",
      "<style>html,body{margin:0;height:100%;font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0}main{min-height:100%;display:grid;place-items:center;padding:24px;text-align:center}button{border:0;border-radius:6px;padding:10px 14px;background:#38bdf8;color:#082f49;font-weight:600}</style>",
      "</head>",
      "<body>",
      "<main>",
      "<section>",
      "<h1>Dev Mock Image Playground</h1>",
      "<p>PORTAL_DEV_MOCK iframe stub is active.</p>",
      '<button type="button" onclick="parent.postMessage({type:\'portal-dev-mock-ready\'},\'*\')">Ready</button>',
      "</section>",
      "</main>",
      "</body>",
      "</html>",
    ].join(""),
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

export function mockImageGenerationResponse(request: Request) {
  const response = NextResponse.json({
    created: Math.floor(Date.now() / 1000),
    data: [
      {
        url: new URL("/duck.webp", new URL(request.url).origin).toString(),
        revised_prompt: "Dev mock image generation response",
      },
    ],
  });
  const origin = request.headers.get("origin");
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

export function mockImageGenerationOptions(request: Request) {
  const response = new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
  const origin = request.headers.get("origin");
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  return response;
}

function positiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = value ? Number(value) : fallback;
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function resolveMockRemainQuota(body: Record<string, unknown>): number | undefined {
  const remainQuota = numberOrUndefined(body.remain_quota);

  if (remainQuota !== undefined) {
    return remainQuota;
  }

  const remainQuotaCny = numberOrUndefined(body.remain_quota_cny);

  return remainQuotaCny !== undefined
    ? cnyToQuota(remainQuotaCny, mockQuotaConfig)
    : undefined;
}

function parseAmountCents(body: Record<string, unknown>): number {
  if (typeof body.amountCents === "number" && Number.isInteger(body.amountCents) && body.amountCents > 0) {
    return body.amountCents;
  }
  if (typeof body.amount === "number" && Number.isInteger(body.amount) && body.amount > 0) {
    return body.amount * 100;
  }
  if (typeof body.amount === "string" && /^\d+$/.test(body.amount.trim())) {
    return Number(body.amount) * 100;
  }
  return 1000;
}
