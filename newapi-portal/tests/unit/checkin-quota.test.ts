import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAdminAddQuota = vi.fn();
const mockLedgerUpdate = vi.fn();

vi.mock("@/lib/newapi", () => {
  class NewApiError extends Error {
    status: number;
    code?: string | number | boolean;
    constructor(
      message: string,
      opts: { status: number; code?: string | number | boolean },
    ) {
      super(message);
      this.name = "NewApiError";
      this.status = opts.status;
      this.code = opts.code;
    }
  }

  return {
    adminAddQuota: (...args: unknown[]) => mockAdminAddQuota(...args),
    NewApiError,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    walletLedger: {
      update: (...args: unknown[]) => mockLedgerUpdate(...args),
    },
  },
}));

import {
  applyCheckinQuota,
  isCheckinQuotaApplied,
} from "@/lib/checkin/quota";
import { NewApiError } from "@/lib/newapi";

describe("isCheckinQuotaApplied", () => {
  it("returns false for missing or invalid metadata", () => {
    expect(isCheckinQuotaApplied(null)).toBe(false);
    expect(isCheckinQuotaApplied(undefined)).toBe(false);
    expect(isCheckinQuotaApplied([])).toBe(false);
    expect(isCheckinQuotaApplied({})).toBe(false);
    expect(isCheckinQuotaApplied({ quotaApplied: false })).toBe(false);
  });

  it("returns true when quotaApplied is true", () => {
    expect(isCheckinQuotaApplied({ quotaApplied: true })).toBe(true);
  });
});

describe("applyCheckinQuota", () => {
  const input = {
    newApiUserId: "42",
    quotaAmount: 1000,
    ledgerId: "ledger-1",
    checkedInKey: "2026-06-04",
  };

  // Deterministic, instant retry config so tests don't actually wait.
  // random=0.5 -> jitter contribution is exactly 0 (full +/- jitter centred).
  const fastRetry = {
    sleep: async () => undefined,
    random: () => 0.5,
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminAddQuota.mockResolvedValue({ success: true });
    mockLedgerUpdate.mockResolvedValue({});
  });

  it("calls upstream once and marks ledger quota as applied", async () => {
    await applyCheckinQuota(input, fastRetry);

    expect(mockAdminAddQuota).toHaveBeenCalledTimes(1);
    expect(mockAdminAddQuota).toHaveBeenCalledWith({
      userId: "42",
      value: 1000,
    });
    expect(mockLedgerUpdate).toHaveBeenCalledWith({
      where: { id: "ledger-1" },
      data: {
        metadata: expect.objectContaining({
          quotaApplied: true,
          quotaAmount: 1000,
          checkedInOn: "2026-06-04",
        }),
      },
    });
  });

  it("retries transient upstream failures before succeeding", async () => {
    mockAdminAddQuota
      .mockRejectedValueOnce(new NewApiError("bad gateway", { status: 502 }))
      .mockRejectedValueOnce(new NewApiError("bad gateway", { status: 503 }))
      .mockResolvedValueOnce({ success: true });

    await applyCheckinQuota(input, { retryAttempts: 3, ...fastRetry });

    expect(mockAdminAddQuota).toHaveBeenCalledTimes(3);
    expect(mockLedgerUpdate).toHaveBeenCalledTimes(1);
  });

  it("throws after all retry attempts fail", async () => {
    mockAdminAddQuota.mockRejectedValue(
      new NewApiError("upstream down", { status: 500 }),
    );

    await expect(
      applyCheckinQuota(input, { retryAttempts: 2, ...fastRetry }),
    ).rejects.toThrow("upstream down");

    expect(mockAdminAddQuota).toHaveBeenCalledTimes(2);
    expect(mockLedgerUpdate).not.toHaveBeenCalled();
  });

  it("retries upstream timeout/network errors (status 0)", async () => {
    mockAdminAddQuota
      .mockRejectedValueOnce(
        new NewApiError("NewAPI request timed out", {
          status: 0,
          code: "NEWAPI_TIMEOUT",
        }),
      )
      .mockResolvedValueOnce({ success: true });

    await applyCheckinQuota(input, { retryAttempts: 3, ...fastRetry });

    expect(mockAdminAddQuota).toHaveBeenCalledTimes(2);
    expect(mockLedgerUpdate).toHaveBeenCalledTimes(1);
  });

  it("retries upstream rate-limit errors (429)", async () => {
    mockAdminAddQuota
      .mockRejectedValueOnce(new NewApiError("rate limited", { status: 429 }))
      .mockResolvedValueOnce({ success: true });

    await applyCheckinQuota(input, { retryAttempts: 3, ...fastRetry });

    expect(mockAdminAddQuota).toHaveBeenCalledTimes(2);
    expect(mockLedgerUpdate).toHaveBeenCalledTimes(1);
  });

  it("fails fast on 200-envelope business errors (user not found)", async () => {
    // new-api /api/user/manage returns HTTP 200 with { success:false }, which
    // surfaces as NewApiError status 200 — deterministic, must not retry.
    mockAdminAddQuota.mockRejectedValue(
      new NewApiError("用户不存在", { status: 200, code: "user_not_found" }),
    );

    await expect(
      applyCheckinQuota(input, { retryAttempts: 5, ...fastRetry }),
    ).rejects.toThrow("用户不存在");

    expect(mockAdminAddQuota).toHaveBeenCalledTimes(1);
    expect(mockLedgerUpdate).not.toHaveBeenCalled();
  });

  it("fails fast on non-retryable upstream 4xx errors", async () => {
    mockAdminAddQuota.mockRejectedValue(
      new NewApiError("forbidden", { status: 403, code: "forbidden" }),
    );

    await expect(
      applyCheckinQuota(input, { retryAttempts: 5, ...fastRetry }),
    ).rejects.toThrow("forbidden");

    expect(mockAdminAddQuota).toHaveBeenCalledTimes(1);
    expect(mockLedgerUpdate).not.toHaveBeenCalled();
  });

  it("fails fast on unexpected non-NewApiError values without retrying", async () => {
    mockAdminAddQuota.mockRejectedValue(new Error("programming bug"));

    await expect(
      applyCheckinQuota(input, { retryAttempts: 5, ...fastRetry }),
    ).rejects.toThrow("programming bug");

    expect(mockAdminAddQuota).toHaveBeenCalledTimes(1);
    expect(mockLedgerUpdate).not.toHaveBeenCalled();
  });

  it("uses exponential backoff with jitter for the configured delays", async () => {
    const sleepSpy = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
    mockAdminAddQuota.mockRejectedValue(
      new NewApiError("bad gateway", { status: 502 }),
    );

    await expect(
      applyCheckinQuota(input, {
        retryAttempts: 4,
        baseDelayMs: 100,
        backoffFactor: 2,
        maxDelayMs: 10_000,
        jitterRatio: 0.25,
        random: () => 0.5, // centred -> zero jitter, exact exponential delays
        sleep: sleepSpy,
      }),
    ).rejects.toThrow("bad gateway");

    // 4 attempts -> 3 sleeps between them: 100, 200, 400 (exponential, no jitter)
    expect(mockAdminAddQuota).toHaveBeenCalledTimes(4);
    expect(sleepSpy.mock.calls.map((call) => call[0])).toEqual([100, 200, 400]);
  });
});
