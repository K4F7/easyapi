import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  MockNewApiError,
  mockRequireUser,
  mockGetUserNewApiAuth,
  mockNewApiUserRequest,
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
    mockNewApiUserRequest: vi.fn(),
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
  mockBillingEpayCreateResponse: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    APP_URL: "https://portal.example.test",
  }),
}));

vi.mock("@/lib/newapi", () => ({
  newApiUserRequest: (...args: unknown[]) => mockNewApiUserRequest(...args),
}));

vi.mock("@/lib/newapi/client", () => ({
  NewApiError: MockNewApiError,
}));

import { POST } from "@/app/api/billing/epay/create/route";

function createPaymentRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/billing/epay/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function parseResponse(response: Response) {
  return response.json() as Promise<{
    ok: boolean;
    data?: Record<string, unknown>;
    error?: { code: string; message: string };
  }>;
}

describe("POST /api/billing/epay/create", () => {
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
    mockNewApiUserRequest.mockResolvedValue({
      message: "success",
      url: "https://pay.example.test/checkout",
      data: { out_trade_no: "ORDER-1" },
    });
  });

  it("proxies payment creation to NewAPI pay", async () => {
    const response = await POST(
      createPaymentRequest({ amountCents: 1000, paymentMethod: "alipay" }),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      amountCents: 1000,
      paymentMethod: "alipay",
      payment: {
        method: "GET",
        action: "https://pay.example.test/checkout",
        url: expect.stringContaining("out_trade_no=ORDER-1"),
      },
    });
    expect(mockNewApiUserRequest).toHaveBeenCalledWith(
      { userId: "99", accessToken: "token" },
      "/api/user/pay",
      {
        method: "POST",
        json: {
          amount: 10,
          payment_method: "alipay",
          return_url: "https://portal.example.test/dashboard/billing?payment=return",
        },
      },
    );
  });

  it("returns 409 when NewAPI binding is not ready", async () => {
    mockGetUserNewApiAuth.mockResolvedValue({
      ok: false,
      code: "NEWAPI_BINDING_PENDING",
      message: "binding pending",
    });

    const response = await POST(createPaymentRequest({ amount: 10 }));
    const body = await parseResponse(response);

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("NEWAPI_BINDING_PENDING");
    expect(mockNewApiUserRequest).not.toHaveBeenCalled();
  });

  it("returns NEWAPI_PAYMENT_FAILED when upstream rejects payment", async () => {
    mockNewApiUserRequest.mockRejectedValue(
      new MockNewApiError("payment unavailable", { status: 502 }),
    );

    const response = await POST(createPaymentRequest({ amount: 10 }));
    const body = await parseResponse(response);

    expect(response.status).toBe(502);
    expect(body.error?.code).toBe("NEWAPI_PAYMENT_FAILED");
  });
});
