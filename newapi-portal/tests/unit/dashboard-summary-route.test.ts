import { beforeEach, describe, expect, it, vi } from "vitest";



const mockRequireUser = vi.fn();

const mockGetUserNewApiAuth = vi.fn();

const mockGetSelf = vi.fn();

const mockListTokens = vi.fn();

const mockGetUsageData = vi.fn();

const mockGetLogStats = vi.fn();

const mockGetCheckinStatus = vi.fn();

const mockGetNewApiStatus = vi.fn();



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

    username?: string | null;

    newApiUserId: string | null;

    createdAt: Date;

  }) => ({

    id: user.id,

    email: user.email,

    username: user.username ?? null,

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



vi.mock("@/lib/quota/get-display-config", () => ({

  getQuotaDisplayConfig: vi.fn(async () => ({

    quotaPerCny: 500_000,

    source: "default",

  })),

  quotaDisplayConfigForClient: (config: {

    quotaPerCny: number;

    source: string;

  }) => config,

}));



vi.mock("@/lib/newapi/status", () => ({

  getNewApiStatus: () => mockGetNewApiStatus(),

}));



vi.mock("@/lib/newapi/checkin", () => ({

  getCheckinStatus: (...args: unknown[]) => mockGetCheckinStatus(...args),

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

      checkin?: {

        enabled?: boolean;

        checkedInToday?: boolean;

        quotaApplied?: boolean | null;

      };

      quotaConfig?: {

        quotaPerCny?: number;

        source?: string;

      };

    };

  }>;

}



async function loadSummary() {

  const { GET } = await import("@/app/api/dashboard/summary/route");

  return GET(new Request("http://localhost/api/dashboard/summary"));

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

        newApiUserId: "99",

        newApiAccessTokenCiphertext: "access-token",

        createdAt: new Date("2026-06-01T00:00:00.000Z"),

      },

      auth: { userId: "99", accessToken: "access-token" },

    });

    mockGetNewApiStatus.mockResolvedValue({ checkinEnabled: true });

    mockGetCheckinStatus.mockResolvedValue({

      enabled: true,

      min_quota: 1000,

      max_quota: 10000,

      stats: {

        total_quota: 0,

        total_checkins: 0,

        checkin_count: 0,

        checked_in_today: false,

        records: [],

      },

    });

    mockGetSelf.mockResolvedValue({ quota: 1000 });

    mockListTokens.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 1 });

    mockGetUsageData.mockResolvedValue([]);

    mockGetLogStats.mockResolvedValue({});

  });



  it("returns disabled check-in summary when upstream feature is off", async () => {

    mockGetNewApiStatus.mockResolvedValue({ checkinEnabled: false });



    const response = await loadSummary();

    const body = await readJson(response);



    expect(body.data?.checkin).toMatchObject({

      enabled: false,

      checkedInToday: false,

      quotaApplied: null,

    });

    expect(mockGetCheckinStatus).not.toHaveBeenCalled();

  });



  it("returns null quotaApplied when not checked in today", async () => {

    const response = await loadSummary();

    const body = await readJson(response);



    expect(response.status).toBe(200);

    expect(body.data?.quotaConfig).toMatchObject({

      quotaPerCny: 500_000,

      source: "default",

    });

    expect(body.data?.checkin).toMatchObject({

      enabled: true,

      checkedInToday: false,

      quotaApplied: null,

    });

  });



  it("returns quotaApplied true when upstream reports checked in today", async () => {

    mockGetCheckinStatus.mockResolvedValue({

      enabled: true,

      min_quota: 1000,

      max_quota: 10000,

      stats: {

        total_quota: 1500,

        total_checkins: 1,

        checkin_count: 1,

        checked_in_today: true,

        records: [{ checkin_date: "2026-06-10", quota_awarded: 1500 }],

      },

    });



    const response = await loadSummary();

    const body = await readJson(response);



    expect(body.data?.checkin).toMatchObject({

      checkedInToday: true,

      quotaApplied: true,

      monthlyCheckins: 1,

    });

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

      const response = await loadSummary();

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


