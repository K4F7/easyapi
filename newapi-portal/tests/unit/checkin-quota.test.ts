import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAdminAddQuota = vi.fn();
const mockLedgerUpdate = vi.fn();

vi.mock("@/lib/newapi", () => ({
  adminAddQuota: (...args: unknown[]) => mockAdminAddQuota(...args),
}));

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

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminAddQuota.mockResolvedValue({ success: true });
    mockLedgerUpdate.mockResolvedValue({});
  });

  it("calls upstream once and marks ledger quota as applied", async () => {
    await applyCheckinQuota(input, {
      retryAttempts: 3,
      retryDelayMs: 1,
      sleep: async () => undefined,
    });

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

  it("retries upstream failures before succeeding", async () => {
    mockAdminAddQuota
      .mockRejectedValueOnce(new Error("upstream busy"))
      .mockRejectedValueOnce(new Error("upstream busy"))
      .mockResolvedValueOnce({ success: true });

    await applyCheckinQuota(input, {
      retryAttempts: 3,
      retryDelayMs: 1,
      sleep: async () => undefined,
    });

    expect(mockAdminAddQuota).toHaveBeenCalledTimes(3);
    expect(mockLedgerUpdate).toHaveBeenCalledTimes(1);
  });

  it("throws after all retry attempts fail", async () => {
    mockAdminAddQuota.mockRejectedValue(new Error("upstream down"));

    await expect(
      applyCheckinQuota(input, {
        retryAttempts: 2,
        retryDelayMs: 1,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow("upstream down");

    expect(mockAdminAddQuota).toHaveBeenCalledTimes(2);
    expect(mockLedgerUpdate).not.toHaveBeenCalled();
  });
});
