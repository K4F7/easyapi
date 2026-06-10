import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  MockNewApiError,
  mockRequireUser,
  mockGetUserNewApiAuth,
  mockGetAffInfo,
  mockTransferAffQuota,
  mockGetSelf,
} = vi.hoisted(() => {
  class MockNewApiError extends Error {
    readonly status?: number;

    constructor(message: string, options: { status?: number } = {}) {
      super(message);
      this.name = "NewApiError";
      this.status = options.status;
    }
  }

  return {
    MockNewApiError,
    mockRequireUser: vi.fn(),
    mockGetUserNewApiAuth: vi.fn(),
    mockGetAffInfo: vi.fn(),
    mockTransferAffQuota: vi.fn(),
    mockGetSelf: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  requireUser: () => mockRequireUser(),
  jsonOk: (data: unknown, init?: ResponseInit) =>
    Response.json({ ok: true, data }, init),
  jsonError: (error: unknown, status?: number) =>
    Response.json({ ok: false, error }, { status: status ?? 400 }),
}));

vi.mock("@/lib/api/bff", () => ({
  getUserNewApiAuth: (...args: unknown[]) => mockGetUserNewApiAuth(...args),
  handleApiError: (error: unknown) =>
    Response.json(
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
}));

vi.mock("@/lib/newapi/aff", () => ({
  getAffInfo: (...args: unknown[]) => mockGetAffInfo(...args),
  transferAffQuota: (...args: unknown[]) => mockTransferAffQuota(...args),
}));

vi.mock("@/lib/newapi", () => ({
  getSelf: (...args: unknown[]) => mockGetSelf(...args),
  NewApiError: MockNewApiError,
}));

import { GET, POST } from "@/app/api/aff/route";

async function parseResponse(response: Response) {
  return response.json() as Promise<{
    ok: boolean;
    data?: Record<string, unknown>;
    error?: { code: string; message: string };
  }>;
}

describe("GET /api/aff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      id: "portal-user-1",
      email: "user@example.com",
    });
    mockGetUserNewApiAuth.mockResolvedValue({
      ok: true,
      auth: { userId: "99", accessToken: "token" },
    });
    mockGetAffInfo.mockResolvedValue({
      aff_code: "AFF123",
      aff_count: 2,
      aff_quota: 5000,
      aff_history_quota: 12000,
    });
    mockGetSelf.mockResolvedValue({
      aff_code: "SELF99",
      aff_count: 1,
      aff_quota: 100,
      aff_history_quota: 200,
    });
  });

  it("returns affiliate info from upstream", async () => {
    const response = await GET();
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({
      aff_code: "AFF123",
      aff_count: 2,
      aff_quota: 5000,
      aff_history_quota: 12000,
    });
    expect(mockGetAffInfo).toHaveBeenCalledWith({ userId: "99", accessToken: "token" });
    expect(mockGetSelf).toHaveBeenCalledWith({ userId: "99", accessToken: "token" });
  });

  it("falls back to self profile when aff info is unavailable", async () => {
    mockGetAffInfo.mockRejectedValue(new Error("upstream unavailable"));

    const response = await GET();
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      aff_code: "SELF99",
      aff_count: 1,
      aff_quota: 100,
      aff_history_quota: 200,
    });
  });

  it("returns 409 when NewAPI binding is not ready", async () => {
    mockGetUserNewApiAuth.mockResolvedValue({
      ok: false,
      code: "NEWAPI_BINDING_PENDING",
      message: "binding pending",
    });

    const response = await GET();
    const body = await parseResponse(response);

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("NEWAPI_BINDING_PENDING");
    expect(mockGetAffInfo).not.toHaveBeenCalled();
  });
});

describe("POST /api/aff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      id: "portal-user-1",
      email: "user@example.com",
    });
    mockGetUserNewApiAuth.mockResolvedValue({
      ok: true,
      auth: { userId: "99", accessToken: "token" },
    });
    mockTransferAffQuota.mockResolvedValue({
      transferred_quota: 3000,
      aff_quota: 8000,
    });
  });

  it("transfers affiliate quota through upstream", async () => {
    const response = await POST();
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({
      transferred: true,
      transferred_quota: 3000,
      aff_quota: 8000,
    });
    expect(mockTransferAffQuota).toHaveBeenCalledWith({
      userId: "99",
      accessToken: "token",
    });
  });

  it("returns AFF_TRANSFER_FAILED when upstream rejects transfer", async () => {
    mockTransferAffQuota.mockRejectedValue(
      new MockNewApiError("划转失败", { status: 400 }),
    );

    const response = await POST();
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("AFF_TRANSFER_FAILED");
  });
});
