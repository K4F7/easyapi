import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbFindUnique = vi.fn();
const mockDecryptSecret = vi.fn();
const mockEncryptSecret = vi.fn();
const mockRefreshUserAccessToken = vi.fn();

vi.mock("@/lib/auth", () => ({
  AuthError: class AuthError extends Error {
    readonly status = 401;
    readonly code = "UNAUTHORIZED";
  },
  decryptSecret: (...args: unknown[]) => mockDecryptSecret(...args),
  jsonError: (error: unknown, status?: number) =>
    Response.json({ ok: false, error }, { status: status ?? 400 }),
  zodErrorResponse: vi.fn(),
}));

vi.mock("@/lib/auth/newapi-user", () => ({
  updatePortalUserAccessToken: (...args: unknown[]) => mockDbUpdate(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => mockDbFindUnique(...args),
      update: (...args: unknown[]) => mockDbUpdate(...args),
    },
  },
}));

vi.mock("@/lib/env", () => ({
  getAuthSecret: () => "test-auth-secret-32-characters-min",
  getNewApiAccessTokenRefreshAfterMs: () => 60 * 60 * 1000,
  getNewApiBaseUrl: () => "https://newapi.test",
}));

vi.mock("@/lib/newapi/access-token", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/newapi/access-token")>();
  return {
    ...actual,
    refreshUserAccessToken: (...args: unknown[]) =>
      mockRefreshUserAccessToken(...args),
  };
});

describe("refreshUserAccessToken", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls GET /api/user/token with bearer auth and extracts data token", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: "fresh-token-abc",
        }),
        { status: 200 },
      ),
    );

    const { refreshUserAccessToken } = await vi.importActual<
      typeof import("@/lib/newapi/access-token")
    >("@/lib/newapi/access-token");

    const token = await refreshUserAccessToken({
      userId: "42",
      accessToken: "stale-token",
    });

    expect(token).toBe("fresh-token-abc");
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://newapi.test/api/user/token");
    expect(init.method ?? "GET").toBe("GET");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer stale-token",
    );
    expect(new Headers(init.headers).get("New-Api-User")).toBe("42");
  });
});

describe("getUserNewApiAuth token refresh", () => {
  const portalUser = {
    id: "portal-1",
    email: "user@test.com",
    username: "user@test.com",
    newApiUserId: "99",
    newApiBinding: "ready" as const,
    createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDecryptSecret.mockResolvedValue("stored-token");
    mockRefreshUserAccessToken.mockResolvedValue("refreshed-token");
    mockDbUpdate.mockResolvedValue({});
  });

  it("proactively refreshes stale tokens and persists the new token", async () => {
    const staleUpdatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);

    mockDbFindUnique.mockResolvedValue({
      id: "portal-1",
      email: "user@test.com",
      username: "user@test.com",
      newApiUserId: "99",
      newApiAccessTokenCiphertext: "v1:ciphertext",
      newApiAccessTokenUpdatedAt: staleUpdatedAt,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const { getUserNewApiAuth } = await import("@/lib/api/bff");
    const result = await getUserNewApiAuth(portalUser);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.auth.accessToken).toBe("refreshed-token");
    expect(mockRefreshUserAccessToken).toHaveBeenCalledWith({
      userId: "99",
      accessToken: "stored-token",
    });
    expect(mockDbUpdate).toHaveBeenCalledWith("portal-1", "refreshed-token");
    expect(typeof result.auth._portalRefresh).toBe("function");
  });

  it("skips proactive refresh when token was updated recently", async () => {
    mockDbFindUnique.mockResolvedValue({
      id: "portal-1",
      email: "user@test.com",
      username: "user@test.com",
      newApiUserId: "99",
      newApiAccessTokenCiphertext: "v1:ciphertext",
      newApiAccessTokenUpdatedAt: new Date(),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const { getUserNewApiAuth } = await import("@/lib/api/bff");
    const result = await getUserNewApiAuth(portalUser);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.auth.accessToken).toBe("stored-token");
    expect(mockRefreshUserAccessToken).not.toHaveBeenCalled();
  });

  it("falls back to stored token when proactive refresh fails", async () => {
    mockDbFindUnique.mockResolvedValue({
      id: "portal-1",
      email: "user@test.com",
      username: "user@test.com",
      newApiUserId: "99",
      newApiAccessTokenCiphertext: "v1:ciphertext",
      newApiAccessTokenUpdatedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    mockRefreshUserAccessToken.mockRejectedValue(new Error("upstream down"));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const { getUserNewApiAuth } = await import("@/lib/api/bff");
      const result = await getUserNewApiAuth(portalUser);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.auth.accessToken).toBe("stored-token");
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("newApiRequest 401 refresh retry", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries once with refreshed auth when upstream returns 401", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "unauthorized" }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { ok: true } }), {
          status: 200,
        }),
      );

    const { newApiUserRequest } = await import("@/lib/newapi/client");

    const result = await newApiUserRequest(
      {
        userId: "99",
        accessToken: "stale-token",
        _portalRefresh: async () => ({
          userId: "99",
          accessToken: "fresh-token",
        }),
      },
      "/api/user/self",
    );

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [, firstInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const [, secondInit] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(new Headers(firstInit.headers).get("Authorization")).toBe(
      "Bearer stale-token",
    );
    expect(new Headers(secondInit.headers).get("Authorization")).toBe(
      "Bearer fresh-token",
    );
  });
});
