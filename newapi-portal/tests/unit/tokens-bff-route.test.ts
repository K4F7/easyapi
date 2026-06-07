import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mockRequireUser = vi.fn();
const mockGetUserNewApiAuth = vi.fn();
const mockGetToken = vi.fn();
const mockCreateTokenAndRevealKey = vi.fn();
const mockUpdateToken = vi.fn();
const mockDeleteToken = vi.fn();
const mockListTokens = vi.fn();
const mockGetQuotaDisplayConfig = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireUser: () => mockRequireUser(),
  readJson: async (request: Request, schema: { parse: (value: unknown) => unknown }) =>
    schema.parse(await request.json()),
  jsonOk: (data: unknown, init?: ResponseInit) =>
    Response.json({ ok: true, data }, init),
  jsonError: (error: unknown, status?: number) =>
    Response.json({ ok: false, error }, { status: status ?? 400 }),
}));

vi.mock("@/lib/api/bff", () => ({
  getUserNewApiAuth: (...args: unknown[]) => mockGetUserNewApiAuth(...args),
  parsePositiveInt: (value: string | null, fallback: number, max: number) => {
    const parsed = value ? Number(value) : fallback;
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
  },
  handleApiError: (error: unknown) =>
    error instanceof z.ZodError
      ? Response.json(
          {
            ok: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "请求参数无效",
              details: error.flatten(),
            },
          },
          { status: 400 },
        )
      : Response.json(
          {
            ok: false,
            error: {
              code: "INTERNAL_ERROR",
              message: error instanceof Error ? error.message : "error",
            },
          },
          { status: 500 },
        ),
}));

vi.mock("@/lib/dev-mock", () => ({
  isDevMockEnabled: () => false,
  mockTokenCreateResponse: vi.fn(),
  mockTokenDeleteResponse: vi.fn(),
  mockTokensListResponse: vi.fn(),
  mockTokenUpdateResponse: vi.fn(),
}));

vi.mock("@/lib/newapi", () => ({
  createTokenAndRevealKey: (...args: unknown[]) =>
    mockCreateTokenAndRevealKey(...args),
  getToken: (...args: unknown[]) => mockGetToken(...args),
  listTokens: (...args: unknown[]) => mockListTokens(...args),
  updateToken: (...args: unknown[]) => mockUpdateToken(...args),
  deleteToken: (...args: unknown[]) => mockDeleteToken(...args),
}));

vi.mock("@/lib/quota/get-display-config", () => ({
  getQuotaDisplayConfig: (...args: unknown[]) => mockGetQuotaDisplayConfig(...args),
}));

function tokenRequest(body: unknown) {
  return new Request("http://localhost/api/tokens/101", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

function routeContext(id = "101") {
  return {
    params: Promise.resolve({ id }),
  };
}

async function parseResponse(response: Response) {
  return response.json() as Promise<{
    ok: boolean;
    data?: Record<string, unknown>;
    error?: {
      code: string;
      message: string;
      details?: unknown;
    };
  }>;
}

describe("GET /api/channels/tiers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns the fixed channel tier metadata", async () => {
    vi.stubEnv("NEWAPI_CHANNEL_GROUP_LOW", undefined);
    vi.stubEnv("NEWAPI_CHANNEL_GROUP_STANDARD", undefined);
    vi.stubEnv("NEWAPI_CHANNEL_GROUP_PREMIUM", undefined);
    vi.resetModules();

    const { GET } = await import("@/app/api/channels/tiers/route");

    const response = await GET();
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data?.defaultGroup).toBe("default");
    expect(body.data?.tiers).toEqual([
      expect.objectContaining({
        id: "low",
        label: "低价渠道",
        group: "low-cost",
        stability: "~50% 在线",
      }),
      expect.objectContaining({
        id: "standard",
        label: "一般渠道",
        group: "default",
        stability: "~80% 在线",
        default: true,
      }),
      expect.objectContaining({
        id: "premium",
        label: "高价渠道",
        group: "premium",
        stability: "~99.9% 在线",
      }),
    ]);
  });

  it("keeps labels fixed while allowing NewAPI group mapping from env", async () => {
    vi.stubEnv("NEWAPI_CHANNEL_GROUP_LOW", "ops-low");
    vi.stubEnv("NEWAPI_CHANNEL_GROUP_STANDARD", "ops-standard");
    vi.stubEnv("NEWAPI_CHANNEL_GROUP_PREMIUM", "ops-premium");
    vi.resetModules();

    const { GET } = await import("@/app/api/channels/tiers/route");

    const response = await GET();
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.data?.defaultGroup).toBe("ops-standard");
    expect(body.data?.tiers).toEqual([
      expect.objectContaining({
        id: "low",
        label: "低价渠道",
        group: "ops-low",
      }),
      expect.objectContaining({
        id: "standard",
        label: "一般渠道",
        group: "ops-standard",
        default: true,
      }),
      expect.objectContaining({
        id: "premium",
        label: "高价渠道",
        group: "ops-premium",
      }),
    ]);
  });
});

describe("POST /api/tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      id: "portal-user-1",
      email: "user@example.com",
    });
    mockGetUserNewApiAuth.mockResolvedValue({
      ok: true,
      auth: { userId: "99", accessToken: "newapi-token" },
    });
    mockGetQuotaDisplayConfig.mockResolvedValue({
      quotaPerCny: 500_000,
      source: "env",
    });
    mockCreateTokenAndRevealKey.mockResolvedValue({
      token: {
        id: 202,
        name: "CNY Token",
        key: "sk-live-created-secret",
        status: 1,
        remain_quota: 1_000_000,
        group: "premium",
      },
      key: "sk-live-created-secret",
    });
  });

  it("converts remain_quota_cny before creating a NewAPI token", async () => {
    const { POST } = await import("@/app/api/tokens/route");

    const response = await POST(
      new Request("http://localhost/api/tokens", {
        method: "POST",
        body: JSON.stringify({
          name: "CNY Token",
          remain_quota_cny: 2,
          group: "premium",
        }),
      }),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data?.token).toMatchObject({
      id: 202,
      name: "CNY Token",
      key: "sk-liv...cret",
      remain_quota: 1_000_000,
      group: "premium",
    });
    expect(body.data?.key).toBe("sk-live-created-secret");

    expect(mockCreateTokenAndRevealKey).toHaveBeenCalledWith(
      { userId: "99", accessToken: "newapi-token" },
      expect.objectContaining({
        name: "CNY Token",
        remain_quota: 1_000_000,
        group: "premium",
      }),
    );
    const tokenInput = mockCreateTokenAndRevealKey.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(tokenInput).not.toHaveProperty("remain_quota_cny");
  });

  it("rejects creating tokens with reserved playground names", async () => {
    const { POST } = await import("@/app/api/tokens/route");

    const response = await POST(
      new Request("http://localhost/api/tokens", {
        method: "POST",
        body: JSON.stringify({
          name: "操练场-Image",
          group: "default",
        }),
      }),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(body.error?.message).toBe("请求参数无效");
    expect(JSON.stringify(body.error?.details)).toContain(
      "该名称为系统保留的操练场 Token 名称",
    );
    expect(mockCreateTokenAndRevealKey).not.toHaveBeenCalled();
  });
});

describe("PUT /api/tokens/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      id: "portal-user-1",
      email: "user@example.com",
    });
    mockGetUserNewApiAuth.mockResolvedValue({
      ok: true,
      auth: { userId: "99", accessToken: "newapi-token" },
    });
    mockGetToken.mockResolvedValue({
      id: 101,
      name: "Existing Token",
      key: "sk-live-existing-secret",
      status: 1,
      expired_time: 0,
      remain_quota: 100_000,
      unlimited_quota: false,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: null,
      group: "default",
      cross_group_retry: false,
    });
    mockUpdateToken.mockResolvedValue({
      id: 101,
      name: "Existing Token",
      key: "sk-live-existing-secret",
      status: 1,
      remain_quota: 100_000,
      unlimited_quota: false,
      group: "premium",
      cross_group_retry: false,
    });
  });

  it("sends only the requested patch fields to NewAPI", async () => {
    const { PUT } = await import("@/app/api/tokens/[id]/route");

    const response = await PUT(tokenRequest({ group: "premium" }), routeContext());
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data?.token).toMatchObject({
      id: 101,
      name: "Existing Token",
      key: "sk-liv...cret",
      group: "premium",
    });
    expect(mockGetToken).toHaveBeenCalledWith(
      { userId: "99", accessToken: "newapi-token" },
      101,
    );
    expect(mockUpdateToken).toHaveBeenCalledWith(
      { userId: "99", accessToken: "newapi-token" },
      {
        id: 101,
        group: "premium",
      },
    );
  });

  it("ignores remain_quota_cny on update and does not forward convenience fields", async () => {
    const { PUT } = await import("@/app/api/tokens/[id]/route");

    const response = await PUT(
      tokenRequest({
        name: "Renamed Token",
        remain_quota_cny: 2,
      }),
      routeContext(),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockUpdateToken).toHaveBeenCalledWith(
      { userId: "99", accessToken: "newapi-token" },
      {
        id: 101,
        name: "Renamed Token",
      },
    );
    const tokenInput = mockUpdateToken.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(tokenInput).not.toHaveProperty("remain_quota_cny");
    expect(tokenInput).not.toHaveProperty("remain_quota");
  });

  it("rejects managed playground token updates before calling NewAPI update", async () => {
    mockGetToken.mockResolvedValue({
      id: 101,
      name: "操练场-Chat",
      key: "sk-live-playground-secret",
      status: 1,
      unlimited_quota: true,
      group: "default",
    });
    const { PUT } = await import("@/app/api/tokens/[id]/route");

    const response = await PUT(tokenRequest({ group: "premium" }), routeContext());
    const body = await parseResponse(response);

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("PLAYGROUND_TOKEN_LOCKED");
    expect(body.error?.message).toBe("操练场 Token 不可编辑");
    expect(mockGetToken).toHaveBeenCalledWith(
      { userId: "99", accessToken: "newapi-token" },
      101,
    );
    expect(mockUpdateToken).not.toHaveBeenCalled();
  });

  it("rejects renaming regular tokens to reserved playground names", async () => {
    const { PUT } = await import("@/app/api/tokens/[id]/route");

    const response = await PUT(
      tokenRequest({ name: "操练场-Chat" }),
      routeContext(),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(body.error?.message).toBe("请求参数无效");
    expect(JSON.stringify(body.error?.details)).toContain(
      "该名称为系统保留的操练场 Token 名称",
    );
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(mockUpdateToken).not.toHaveBeenCalled();
  });

  it("rejects legacy Playground token updates with the same structured error", async () => {
    mockGetToken.mockResolvedValue({
      id: 101,
      name: "Playground",
      key: "sk-live-legacy-playground-secret",
      status: 1,
      unlimited_quota: true,
      group: "default",
    });
    const { PUT } = await import("@/app/api/tokens/[id]/route");

    const response = await PUT(tokenRequest({ name: "Renamed Playground" }), routeContext());
    const body = await parseResponse(response);

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toEqual({
      code: "PLAYGROUND_TOKEN_LOCKED",
      message: "操练场 Token 不可编辑",
    });
    expect(mockUpdateToken).not.toHaveBeenCalled();
  });

  it("does not synthesize missing group fields from sparse legacy tokens", async () => {
    mockUpdateToken.mockResolvedValue(undefined);
    mockGetToken.mockResolvedValue({
      id: 101,
      name: "Legacy Sparse Token",
      key: "sk-live-legacy-secret",
      remain_quota: 88_000,
    });
    const { PUT } = await import("@/app/api/tokens/[id]/route");

    const response = await PUT(
      tokenRequest({ name: "Renamed Legacy Token" }),
      routeContext(),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data?.token).toMatchObject({
      id: 101,
      name: "Legacy Sparse Token",
      key: "sk-liv...cret",
      remain_quota: 88_000,
    });
    expect(body.data?.token).not.toHaveProperty("group");
    expect(mockUpdateToken).toHaveBeenCalledWith(
      { userId: "99", accessToken: "newapi-token" },
      {
        id: 101,
        name: "Renamed Legacy Token",
      },
    );
    expect(mockGetToken).toHaveBeenCalledWith(
      { userId: "99", accessToken: "newapi-token" },
      101,
    );
  });

  it("rejects invalid channel groups with a structured Chinese validation error", async () => {
    const { PUT } = await import("@/app/api/tokens/[id]/route");

    const response = await PUT(tokenRequest({ group: "invalid-group" }), routeContext());
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(body.error?.message).toBe("请求参数无效");
    expect(JSON.stringify(body.error?.details)).toContain("请选择有效的渠道档位");
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(mockUpdateToken).not.toHaveBeenCalled();
  });

  it("returns 409 when the NewAPI binding is not ready", async () => {
    mockGetUserNewApiAuth.mockResolvedValue({
      ok: false,
      code: "NEWAPI_BINDING_PENDING",
      message: "NewAPI 账号绑定仍在处理中",
    });
    const { PUT } = await import("@/app/api/tokens/[id]/route");

    const response = await PUT(tokenRequest({ group: "premium" }), routeContext());
    const body = await parseResponse(response);

    expect(response.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("NEWAPI_BINDING_PENDING");
    expect(body.error?.message).toBe("NewAPI 账号绑定仍在处理中");
    expect(mockGetToken).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/tokens/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      id: "portal-user-1",
      email: "user@example.com",
    });
    mockGetUserNewApiAuth.mockResolvedValue({
      ok: true,
      auth: { userId: "99", accessToken: "newapi-token" },
    });
    mockGetToken.mockResolvedValue({
      id: 101,
      name: "Existing Token",
      key: "sk-live-existing-secret",
      status: 1,
      expired_time: 0,
      remain_quota: 100_000,
      unlimited_quota: false,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: null,
      group: "default",
      cross_group_retry: false,
    });
    mockDeleteToken.mockResolvedValue(undefined);
  });

  it("rejects managed playground token deletes before calling NewAPI delete", async () => {
    mockGetToken.mockResolvedValue({
      id: 101,
      name: "操练场-Image",
      key: "sk-live-playground-image-secret",
      status: 1,
      unlimited_quota: true,
      group: "default",
    });
    const { DELETE } = await import("@/app/api/tokens/[id]/route");

    const response = await DELETE(
      new Request("http://localhost/api/tokens/101", { method: "DELETE" }),
      routeContext(),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toEqual({
      code: "PLAYGROUND_TOKEN_LOCKED",
      message: "操练场 Token 不可删除",
    });
    expect(mockGetToken).toHaveBeenCalledWith(
      { userId: "99", accessToken: "newapi-token" },
      101,
    );
    expect(mockDeleteToken).not.toHaveBeenCalled();
  });

  it("deletes regular tokens after reading them with the current user auth", async () => {
    const { DELETE } = await import("@/app/api/tokens/[id]/route");

    const response = await DELETE(
      new Request("http://localhost/api/tokens/101", { method: "DELETE" }),
      routeContext(),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({
      deleted: true,
      id: 101,
    });
    expect(mockGetToken).toHaveBeenCalledWith(
      { userId: "99", accessToken: "newapi-token" },
      101,
    );
    expect(mockDeleteToken).toHaveBeenCalledWith(
      { userId: "99", accessToken: "newapi-token" },
      101,
    );
  });
});
