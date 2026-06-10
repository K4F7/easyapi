import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockGetUserNewApiAuth = vi.fn();
const mockGetNewApiStatus = vi.fn();
const mockDoCheckin = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireUser: () => mockRequireUser(),
  readJson: async (request: Request, schema: { parse: (value: unknown) => unknown }) => {
    if (request.headers.get("content-type")?.includes("application/json")) {
      return schema.parse(await request.json());
    }

    return schema.parse({});
  },
  jsonOk: (data: unknown, init?: ResponseInit) =>
    Response.json({ ok: true, data }, init),
  jsonError: (error: unknown, status?: number) =>
    Response.json({ ok: false, error }, { status: status ?? 400 }),
  zodErrorResponse: () =>
    Response.json({ ok: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 }),
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

vi.mock("@/lib/dev-mock", () => ({
  isDevMockEnabled: () => false,
  mockCheckinResponse: vi.fn(),
}));

vi.mock("@/lib/newapi/status", () => ({
  getNewApiStatus: () => mockGetNewApiStatus(),
}));

vi.mock("@/lib/newapi/checkin", () => ({
  doCheckin: (...args: unknown[]) => mockDoCheckin(...args),
}));

import { POST } from "@/app/api/checkin/route";

function checkinRequest(options?: {
  headers?: HeadersInit;
  body?: Record<string, unknown>;
  query?: string;
}) {
  const url = new URL("http://localhost/api/checkin");
  if (options?.query) {
    url.search = options.query;
  }

  const headers = new Headers(options?.headers);
  const body = options?.body;

  if (body) {
    headers.set("content-type", "application/json");
  }

  return new Request(url.toString(), {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
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
    mockGetNewApiStatus.mockResolvedValue({ checkinEnabled: true });
    mockDoCheckin.mockResolvedValue({
      quota_awarded: 1500,
      checkin_date: "2026-06-10",
    });
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
    expect(mockDoCheckin).not.toHaveBeenCalled();
  });

  it("returns 403 when check-in is disabled upstream", async () => {
    mockGetNewApiStatus.mockResolvedValue({ checkinEnabled: false });

    const response = await POST(checkinRequest());
    const body = await parseResponse(response);

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("CHECKIN_DISABLED");
    expect(mockDoCheckin).not.toHaveBeenCalled();
  });

  it("proxies check-in to NewAPI on first success", async () => {
    const response = await POST(checkinRequest());
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      checkedIn: true,
      alreadyCheckedIn: false,
      checkedInOn: "2026-06-10",
      quotaAmount: 1500,
      quotaApplied: true,
    });
    expect(mockDoCheckin).toHaveBeenCalledWith(
      { userId: "99", accessToken: "token" },
      { turnstile: undefined },
    );
  });

  it("returns idempotent success when upstream reports already checked in", async () => {
    const { NewApiError } = await import("@/lib/newapi/client");
    mockDoCheckin.mockRejectedValue(new NewApiError("今日已签到", { status: 200 }));

    const response = await POST(checkinRequest());
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      checkedIn: true,
      alreadyCheckedIn: true,
      quotaApplied: true,
    });
  });

  it("forwards turnstile from JSON body to upstream check-in", async () => {
    const response = await POST(
      checkinRequest({ body: { turnstile: "turnstile-body-token" } }),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockDoCheckin).toHaveBeenCalledWith(
      { userId: "99", accessToken: "token" },
      { turnstile: "turnstile-body-token" },
    );
  });

  it("forwards turnstile from query string when body omits it", async () => {
    const response = await POST(
      checkinRequest({ query: "turnstile=turnstile-query-token" }),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockDoCheckin).toHaveBeenCalledWith(
      { userId: "99", accessToken: "token" },
      { turnstile: "turnstile-query-token" },
    );
  });
});
