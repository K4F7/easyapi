import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  MockNewApiError,
  mockRequireUser,
  mockGetUserNewApiAuth,
  mockRedeemTopup,
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
    mockRedeemTopup: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  requireUser: () => mockRequireUser(),
  readJson: async (request: Request, schema: { parse: (value: unknown) => unknown }) =>
    schema.parse(await request.json()),
  jsonOk: (data: unknown, init?: ResponseInit) =>
    Response.json({ ok: true, data }, init),
  jsonError: (error: unknown, status?: number) =>
    Response.json({ ok: false, error }, { status: status ?? 400 }),
  zodErrorResponse: () =>
    Response.json({ ok: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 }),
  AuthError: class AuthError extends Error {
    code = "AUTH_ERROR";
    status = 401;
  },
}));

vi.mock("@/lib/api/bff", () => ({
  getUserNewApiAuth: (...args: unknown[]) => mockGetUserNewApiAuth(...args),
}));

vi.mock("@/lib/dev-mock", () => ({
  isDevMockEnabled: () => false,
  mockBillingRedeemResponse: vi.fn(),
}));

vi.mock("@/lib/newapi", () => ({
  redeemTopup: (...args: unknown[]) => mockRedeemTopup(...args),
}));

vi.mock("@/lib/newapi/client", () => ({
  NewApiError: MockNewApiError,
}));

import { POST } from "@/app/api/billing/redeem/route";

function redeemRequest(code: string) {
  return new Request("http://localhost/api/billing/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

async function parseResponse(response: Response) {
  return response.json() as Promise<{
    ok: boolean;
    data?: Record<string, unknown>;
    error?: { code: string; message: string };
  }>;
}

describe("POST /api/billing/redeem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      id: "portal-user-1",
      email: "user@example.com",
    });
    mockGetUserNewApiAuth.mockResolvedValue({
      ok: true,
      user: {
        id: "portal-user-1",
        newApiUserId: "99",
      },
      auth: {
        userId: "99",
        accessToken: "access-token",
      },
    });
    mockRedeemTopup.mockResolvedValue({
      data: { quota_amount: 2500 },
    });
  });

  it("proxies redemption to NewAPI topup", async () => {
    const response = await POST(redeemRequest("REDEEM-CODE-1"));
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      redeemed: true,
      duplicate: false,
      quotaAmount: 2500,
    });
    expect(mockRedeemTopup).toHaveBeenCalledWith(
      { userId: "99", accessToken: "access-token" },
      "REDEEM-CODE-1",
    );
  });

  it("returns 409 when NewAPI binding is missing", async () => {
    mockGetUserNewApiAuth.mockResolvedValue({
      ok: false,
      user: {
        id: "portal-user-1",
        newApiUserId: null,
      },
      code: "NEWAPI_BINDING_PENDING",
      message: "NewAPI 账号绑定仍在处理中",
    });

    const response = await POST(redeemRequest("REDEEM-CODE-1"));
    const body = await parseResponse(response);

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("NEWAPI_BINDING_PENDING");
    expect(mockRedeemTopup).not.toHaveBeenCalled();
  });

  it("returns REDEEM_FAILED when upstream rejects the code", async () => {
    mockRedeemTopup.mockRejectedValue(
      new MockNewApiError("invalid code", { status: 400 }),
    );

    const response = await POST(redeemRequest("BAD-CODE"));
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("REDEEM_FAILED");
  });
});
