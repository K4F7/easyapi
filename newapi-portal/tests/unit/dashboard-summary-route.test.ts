import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockGetUserNewApiAuth = vi.fn();
const mockGetSelf = vi.fn();
const mockListTokens = vi.fn();
const mockGetUsageData = vi.fn();
const mockGetLogStats = vi.fn();
const mockCheckinFindUnique = vi.fn();

class MockNewApiError extends Error {
  readonly status?: number;
  readonly code?: string | number | boolean;
  readonly payload?: unknown;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string | number | boolean;
      payload?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "NewApiError";
    this.status = options.status;
    this.code = options.code;
    this.payload = options.payload;
  }
}

vi.mock("@/lib/auth", () => ({
  requireUser: () => mockRequireUser(),
  jsonOk: (data: unknown, init?: ResponseInit) =>
    Response.json({ ok: true, data }, init),
}));

vi.mock("@/lib/api/bff", () => ({
  getUserNewApiAuth: (...args: unknown[]) => mockGetUserNewApiAuth(...args),
  handleApiError: (error: unknown, message: string) =>
    Response.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : message,
        },
      },
      { status: 500 },
    ),
  publicUserFromPortalUser: (user: {
    id: string;
    email: string;
    inviteCode: string;
    newApiUserId: string | null;
    createdAt: Date;
  }) => ({
    id: user.id,
    email: user.email,
    inviteCode: user.inviteCode,
    newApiUserId: user.newApiUserId,
    newApiBinding: user.newApiUserId ? "ready" : "pending",
    createdAt: user.createdAt.toISOString(),
  }),
  sanitizeNewApiErrorForLog: (error: MockNewApiError) => ({
    name: error.name,
    status: error.status,
    code: error.code,
  }),
}));

vi.mock("@/lib/dev-mock", () => ({
  isDevMockEnabled: () => false,
  mockDashboardSummaryResponse: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    checkin: {
      findUnique: (...args: unknown[]) => mockCheckinFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/newapi", () => ({
  NewApiError: MockNewApiError,
  getSelf: (...args: unknown[]) => mockGetSelf(...args),
  listTokens: (...args: unknown[]) => mockListTokens(...args),
  getUsageData: (...args: unknown[]) => mockGetUsageData(...args),
  getLogStats: (...args: unknown[]) => mockGetLogStats(...args),
}));

async function readJson(response: Response) {
  return response.json() as Promise<{
    ok: boolean;
    data?: {
      newApi?: {
        status?: string;
        message?: string;
        self?: unknown;
      };
      tokens?: {
        count?: number | null;
        status?: string;
      };
      usage?: unknown;
      logStats?: {
        status?: string;
      };
    };
  }>;
}

describe("GET /api/dashboard/summary", () => {
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
        email: "user@example.com",
        inviteCode: "INVITE",
        newApiUserId: "99",
        newApiAccessTokenCiphertext: "access-token",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
      },
      auth: { userId: "99", accessToken: "access-token" },
    });
    mockCheckinFindUnique.mockResolvedValue(null);
    mockListTokens.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 1 });
    mockGetUsageData.mockResolvedValue([]);
    mockGetLogStats.mockResolvedValue({});
  });

  it("returns a stable Chinese message when NewAPI summary calls fail", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockGetSelf.mockRejectedValue(
      new MockNewApiError("upstream leaked sk-live-secret raw trace", {
        status: 503,
        code: "provider_secret_trace",
        payload: {
          message: "provider raw sk-live-secret payload",
        },
      }),
    );

    try {
      const { GET } = await import("@/app/api/dashboard/summary/route");

      const response = await GET(new Request("http://localhost/api/dashboard/summary"));
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data?.newApi).toMatchObject({
        status: "upstream_error",
        message: "暂时无法获取 NewAPI 仪表盘数据，请稍后重试",
        self: null,
      });
      expect(body.data?.tokens).toMatchObject({
        count: null,
        status: "upstream_error",
      });
      expect(body.data?.logStats).toMatchObject({
        status: "upstream_error",
      });
      expect(JSON.stringify(body)).not.toMatch(
        /sk-live-secret|raw trace|provider_secret_trace|provider raw/,
      );
      expect(consoleError).toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.any(MockNewApiError),
      );
      expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(
        /sk-live-secret|raw trace|provider raw|payload/i,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
