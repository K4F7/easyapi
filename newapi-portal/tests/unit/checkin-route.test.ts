import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockGetUserNewApiAuth = vi.fn();
const mockFindUnique = vi.fn();
const mockTransaction = vi.fn();
const mockApplyCheckinQuota = vi.fn();

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

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ CHECKIN_QUOTA: 1000 }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    checkin: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/checkin/quota", () => ({
  isCheckinQuotaApplied: (metadata: unknown) =>
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    (metadata as { quotaApplied?: boolean }).quotaApplied === true,
  describeCheckinQuotaError: (error: unknown) => ({
    status: (error as { status?: number })?.status,
    code: (error as { code?: string | number | boolean })?.code,
    message: error instanceof Error ? error.message : String(error),
  }),
  applyCheckinQuota: (...args: unknown[]) => mockApplyCheckinQuota(...args),
}));

import { POST } from "@/app/api/checkin/route";

function checkinRequest(headers?: HeadersInit) {
  return new Request("http://localhost/api/checkin", {
    method: "POST",
    headers,
  });
}

async function parseResponse(response: Response) {
  return response.json() as Promise<{
    ok: boolean;
    data?: Record<string, unknown>;
    error?: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };
  }>;
}

describe("POST /api/checkin", () => {
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
    mockFindUnique.mockResolvedValue(null);
    mockApplyCheckinQuota.mockResolvedValue(undefined);
    mockTransaction.mockImplementation(
      async (callback: (tx: {
        checkin: { create: ReturnType<typeof vi.fn> };
        walletLedger: { create: ReturnType<typeof vi.fn> };
      }) => unknown) => {
        const tx = {
          checkin: {
            create: vi.fn().mockResolvedValue({ id: "checkin-1" }),
          },
          walletLedger: {
            create: vi.fn().mockResolvedValue({ id: "ledger-1" }),
          },
        };
        return callback(tx);
      },
    );
  });

  it("returns 409 when NewAPI binding is not ready", async () => {
    mockGetUserNewApiAuth.mockResolvedValue({
      ok: false,
      code: "NEWAPI_BINDING_PENDING",
      message: "binding pending",
    });

    const response = await POST(checkinRequest());
    const body = await parseResponse(response);

    expect(response.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("NEWAPI_BINDING_PENDING");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("creates check-in and applies quota on first success", async () => {
    const response = await POST(checkinRequest());
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      checkedIn: true,
      alreadyCheckedIn: false,
      quotaApplied: true,
      quotaAmount: 1000,
      checkinId: "checkin-1",
      ledgerId: "ledger-1",
    });
    expect(mockApplyCheckinQuota).toHaveBeenCalledWith({
      newApiUserId: "99",
      quotaAmount: 1000,
      ledgerId: "ledger-1",
      checkedInKey: expect.any(String),
    });
  });

  it("returns 502 when quota apply fails after check-in is recorded", async () => {
    mockApplyCheckinQuota.mockRejectedValue(new Error("upstream down"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const response = await POST(
        checkinRequest({ "x-request-id": "unit-request-id" }),
      );
      const body = await parseResponse(response);

      expect(response.status).toBe(502);
      expect(body.ok).toBe(false);
      expect(body.error?.code).toBe("CHECKIN_QUOTA_APPLY_FAILED");
      expect(body.error?.message).toContain("请再次点击签到重试");
      expect(body.error?.details?.requestId).toBe("unit-request-id");
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "checkin: adminAddQuota failed",
        expect.objectContaining({
          requestId: "unit-request-id",
          userId: "portal-user-1",
          ledgerId: "ledger-1",
          checkedInOn: expect.any(String),
          newApiUserId: "99",
          newApiPath: "/api/user/manage",
          quotaAmount: 1000,
          elapsedMs: expect.any(Number),
          upstreamStatus: undefined,
          upstreamCode: undefined,
          upstreamMessage: "upstream down",
        }),
      );

      const logDetails = consoleErrorSpy.mock.calls[0]?.[1];

      expect(isRecord(logDetails)).toBe(true);
      expect(Object.keys(logDetails as Record<string, unknown>)).toEqual(
        expect.arrayContaining([
          "requestId",
          "userId",
          "ledgerId",
          "checkedInOn",
          "newApiUserId",
          "newApiPath",
          "quotaAmount",
          "elapsedMs",
          "upstreamStatus",
          "upstreamCode",
          "upstreamMessage",
        ]),
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("retries quota for an existing check-in with pending ledger metadata", async () => {
    mockFindUnique.mockResolvedValue({
      id: "checkin-existing",
      ledgerEntries: [
        {
          id: "ledger-existing",
          metadata: { quotaApplied: false, source: "checkin" },
        },
      ],
    });

    const response = await POST(checkinRequest());
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      checkedIn: true,
      alreadyCheckedIn: true,
      quotaApplied: true,
      quotaAmount: 1000,
      checkinId: "checkin-existing",
      ledgerId: "ledger-existing",
    });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockApplyCheckinQuota).toHaveBeenCalledWith({
      newApiUserId: "99",
      quotaAmount: 1000,
      ledgerId: "ledger-existing",
      checkedInKey: expect.any(String),
    });
  });

  it("skips quota apply when today's check-in already has quota applied", async () => {
    mockFindUnique.mockResolvedValue({
      id: "checkin-existing",
      ledgerEntries: [
        {
          id: "ledger-existing",
          metadata: { quotaApplied: true, source: "checkin" },
        },
      ],
    });

    const response = await POST(checkinRequest());
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      alreadyCheckedIn: true,
      quotaApplied: true,
      quotaAmount: 1000,
    });
    expect(mockApplyCheckinQuota).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
