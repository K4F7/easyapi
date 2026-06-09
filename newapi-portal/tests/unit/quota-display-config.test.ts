import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNewApiRequest = vi.fn();

vi.mock("@/lib/newapi/client", () => ({
  newApiRequest: (...args: unknown[]) => mockNewApiRequest(...args),
}));

describe("getQuotaDisplayConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mockNewApiRequest.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers NewAPI status when available", async () => {
    mockNewApiRequest.mockResolvedValue({
      quota_per_unit: 500_000,
      usd_exchange_rate: 7,
      quota_display_type: "CNY",
    });

    const { getQuotaDisplayConfig } = await import("@/lib/quota/get-display-config");
    const config = await getQuotaDisplayConfig();

    expect(mockNewApiRequest).toHaveBeenCalledWith("/api/status");
    expect(config.source).toBe("newapi");
    expect(config.quotaPerUnit).toBe(500_000);
    expect(config.usdExchangeRate).toBe(7);
    expect(config.displayType).toBe("CNY");
    expect(config.quotaPerCny).toBeCloseTo(500_000 / 7, 5);
  });

  it("falls back to QUOTA_PER_CNY when status is unavailable", async () => {
    mockNewApiRequest.mockRejectedValue(new Error("network error"));
    vi.stubEnv("QUOTA_PER_CNY", "123456");

    const { getQuotaDisplayConfig } = await import("@/lib/quota/get-display-config");
    const config = await getQuotaDisplayConfig();

    expect(config.source).toBe("env");
    expect(config.quotaPerCny).toBe(123456);
  });

  it("uses default config when status and env are unavailable", async () => {
    mockNewApiRequest.mockRejectedValue(new Error("network error"));

    const { getQuotaDisplayConfig } = await import("@/lib/quota/get-display-config");
    const { DEFAULT_QUOTA_DISPLAY_CONFIG } = await import(
      "@/lib/quota/display-config.shared"
    );
    const config = await getQuotaDisplayConfig();

    expect(config).toEqual(DEFAULT_QUOTA_DISPLAY_CONFIG);
  });
});

describe("quota display helpers", () => {
  it("converts quota to CNY using quotaPerCny", async () => {
    const { quotaToCny, quotaToDisplayAmount } = await import(
      "@/lib/quota/display-config.shared"
    );

    const config = {
      quotaPerCny: 500_000 / 7,
      source: "newapi" as const,
    };

    expect(quotaToCny(500_000, config)).toBeCloseTo(7, 5);
    expect(quotaToDisplayAmount(500_000, config)).toBeCloseTo(7, 5);
  });
});
