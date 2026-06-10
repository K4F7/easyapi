import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireUser: () => mockRequireUser(),
  jsonOk: (data: unknown, init?: ResponseInit) =>
    Response.json({ ok: true, data }, init),
  jsonError: (error: unknown, status?: number) =>
    Response.json({ ok: false, error }, { status: status ?? 400 }),
  AuthError: class AuthError extends Error {
    code = "AUTH_ERROR";
    status = 401;
  },
}));

vi.mock("@/lib/dev-mock", () => ({
  isDevMockEnabled: () => false,
  mockBillingOrdersResponse: vi.fn(),
}));

import { GET } from "@/app/api/billing/orders/route";

async function parseResponse(response: Response) {
  return response.json() as Promise<{
    ok: boolean;
    data?: { orders: unknown[]; message?: string };
    error?: { code: string; message: string };
  }>;
}

describe("GET /api/billing/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      id: "portal-user-1",
      email: "user@example.com",
    });
  });

  it("returns an empty orders list for authenticated users", async () => {
    const response = await GET();
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data?.orders).toEqual([]);
    expect(body.data?.message).toMatch(/NewAPI/);
  });
});
