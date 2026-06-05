import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = new Map<string, string>();
const mockGetAuthSecret = vi.fn();
const mockSessionFindFirst = vi.fn();
const mockSessionCreate = vi.fn();
const mockSessionUpdate = vi.fn();
const mockSessionUpdateMany = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value ? { name, value } : undefined;
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

vi.mock("@/lib/env", () => ({
  getAuthSecret: () => mockGetAuthSecret(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    session: {
      findFirst: (...args: unknown[]) => mockSessionFindFirst(...args),
      create: (...args: unknown[]) => mockSessionCreate(...args),
      update: (...args: unknown[]) => mockSessionUpdate(...args),
      updateMany: (...args: unknown[]) => mockSessionUpdateMany(...args),
    },
  },
}));

function setDevMockEnv(value: string | undefined, nodeEnv = "test") {
  if (value === undefined) {
    vi.stubEnv("PORTAL_DEV_MOCK", undefined);
  } else {
    vi.stubEnv("PORTAL_DEV_MOCK", value);
  }
  vi.stubEnv("NODE_ENV", nodeEnv);
}

async function readJson(response: Response) {
  return response.json() as Promise<{
    ok: boolean;
    data?: Record<string, unknown>;
    error?: Record<string, unknown>;
  }>;
}

describe("dev mock guard", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    cookieJar.clear();
    setDevMockEnv(undefined);
    const { resetMockState } = await import("@/lib/dev-mock/store");
    resetMockState();
  });

  it("enables mock only when PORTAL_DEV_MOCK=1 outside production", async () => {
    const { isDevMockEnabled } = await import("@/lib/dev-mock/guard");

    setDevMockEnv(undefined);
    expect(isDevMockEnabled()).toBe(false);

    setDevMockEnv("1");
    expect(isDevMockEnabled()).toBe(true);
  });

  it("fails explicitly when production requests dev mock", async () => {
    const { isDevMockEnabled } = await import("@/lib/dev-mock/guard");

    setDevMockEnv("1", "production");

    expect(() => isDevMockEnabled()).toThrow(
      "PORTAL_DEV_MOCK=1 is only allowed outside production.",
    );
  });
});

describe("dev mock auth", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    cookieJar.clear();
    setDevMockEnv("1");
    const { resetMockState } = await import("@/lib/dev-mock/store");
    resetMockState();
  });

  it("returns the mock user without AUTH_SECRET or Prisma session access", async () => {
    const { getCurrentUser, sessionCookieName } = await import("@/lib/auth");
    const { getMockSessionToken } = await import("@/lib/dev-mock/store");
    cookieJar.set(sessionCookieName, getMockSessionToken());

    const user = await getCurrentUser();

    expect(user).toMatchObject({
      id: "dev-mock-user",
      email: "dev@example.local",
      newApiBinding: "ready",
    });
    expect(mockGetAuthSecret).not.toHaveBeenCalled();
    expect(mockSessionFindFirst).not.toHaveBeenCalled();
    expect(mockSessionUpdate).not.toHaveBeenCalled();
  });

  it("creates and destroys mock sessions without Prisma writes", async () => {
    const { createSession, destroySession, sessionCookieName } = await import(
      "@/lib/auth"
    );

    await createSession("ignored-user-id");
    expect(cookieJar.get(sessionCookieName)).toBe("portal-dev-mock-session");

    await destroySession();
    expect(cookieJar.has(sessionCookieName)).toBe(false);
    expect(mockGetAuthSecret).not.toHaveBeenCalled();
    expect(mockSessionCreate).not.toHaveBeenCalled();
    expect(mockSessionUpdateMany).not.toHaveBeenCalled();
  });
});

describe("dev mock API routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    cookieJar.clear();
    setDevMockEnv("1");
    const { resetMockState } = await import("@/lib/dev-mock/store");
    resetMockState();
  });

  it("logs in with any non-empty credentials and exposes /api/auth/me", async () => {
    const { POST: login } = await import("@/app/api/auth/login/route");
    const { GET: me } = await import("@/app/api/auth/me/route");
    const { getMockSessionToken } = await import("@/lib/dev-mock/store");
    const { sessionCookieName } = await import("@/lib/auth");

    const loginResponse = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          identifier: "anything",
          password: "anything",
        }),
      }),
    );
    cookieJar.set(sessionCookieName, getMockSessionToken());
    const meResponse = await me();
    const meBody = await readJson(meResponse);

    expect(loginResponse.status).toBe(200);
    expect(meResponse.status).toBe(200);
    expect(meBody.data?.user).toMatchObject({ id: "dev-mock-user" });
  });

  it("keeps created and deleted tokens visible in the in-process store", async () => {
    const { GET, POST } = await import("@/app/api/tokens/route");
    const { DELETE } = await import("@/app/api/tokens/[id]/route");

    const createResponse = await POST(
      new Request("http://localhost/api/tokens", {
        method: "POST",
        body: JSON.stringify({ name: "Unit Token" }),
      }),
    );
    const createBody = await readJson(createResponse);
    const token = createBody.data?.token as { id: number; name: string };

    expect(createResponse.status).toBe(201);
    expect(token).toMatchObject({ name: "Unit Token" });

    const listAfterCreate = await readJson(
      await GET(new Request("http://localhost/api/tokens?p=1&size=20")),
    );
    expect(JSON.stringify(listAfterCreate.data)).toContain("Unit Token");

    const deleteResponse = await DELETE(
      new Request(`http://localhost/api/tokens/${token.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: String(token.id) }) },
    );
    expect(deleteResponse.status).toBe(200);

    const listAfterDelete = await readJson(
      await GET(new Request("http://localhost/api/tokens?p=1&size=20")),
    );
    expect(JSON.stringify(listAfterDelete.data)).not.toContain("Unit Token");
  });

  it("returns 200/201 for representative mock API routes", async () => {
    const { GET: dashboard } = await import("@/app/api/dashboard/summary/route");
    const { GET: usage } = await import("@/app/api/usage/route");
    const { GET: logs } = await import("@/app/api/logs/route");
    const { POST: checkin } = await import("@/app/api/checkin/route");
    const { POST: epayCreate } = await import("@/app/api/billing/epay/create/route");
    const { POST: chat } = await import("@/app/api/playground/chat/route");
    const { POST: images } = await import(
      "@/app/api/playground/images/generations/route"
    );

    expect(
      (
        await dashboard(
          new Request("http://localhost/api/dashboard/summary"),
        )
      ).status,
    ).toBe(200);
    expect((await usage(new Request("http://localhost/api/usage"))).status).toBe(200);
    expect((await logs(new Request("http://localhost/api/logs"))).status).toBe(200);
    expect(
      (
        await checkin(
          new Request("http://localhost/api/checkin", { method: "POST" }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await epayCreate(
          new Request("http://localhost/api/billing/epay/create", {
            method: "POST",
            body: JSON.stringify({ amount: 10 }),
          }),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await chat(
          new Request("http://localhost/api/playground/chat", {
            method: "POST",
            body: JSON.stringify({}),
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await images(
          new Request("http://localhost/api/playground/images/generations", {
            method: "POST",
            body: JSON.stringify({ prompt: "mock" }),
          }),
        )
      ).status,
    ).toBe(200);
  });

  it("returns a local dashboard billing URL for mock payments", async () => {
    const { POST } = await import("@/app/api/billing/epay/create/route");

    const response = await POST(
      new Request("http://localhost/api/billing/epay/create", {
        method: "POST",
        body: JSON.stringify({ amount: 20 }),
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(201);
    expect(body.data?.payment).toMatchObject({
      url: "http://localhost/dashboard/billing?payment=mock-return",
    });
  });

  it("serves a minimal same-origin image playground embed stub", async () => {
    const { GET } = await import("@/app/playground/embed/[...path]/route");

    const response = await GET(
      new Request("http://localhost/playground/embed/"),
      { params: Promise.resolve({ path: [] }) },
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(html).toContain("Dev Mock Image Playground");
    expect(html).toContain("portal-dev-mock-ready");
  });

  it("serves the same image playground embed stub from the base route", async () => {
    const { GET } = await import("@/app/playground/embed/route");

    const response = await GET(
      new Request("http://localhost/playground/embed"),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(html).toContain("Dev Mock Image Playground");
    expect(html).toContain("portal-dev-mock-ready");
  });

  it("reflects check-in and redeem quota changes in dashboard balance fields", async () => {
    const { GET: dashboard } = await import("@/app/api/dashboard/summary/route");
    const { POST: checkin } = await import("@/app/api/checkin/route");
    const { POST: redeem } = await import("@/app/api/billing/redeem/route");

    const before = await readJson(
      await dashboard(new Request("http://localhost/api/dashboard/summary")),
    );

    await checkin(
      new Request("http://localhost/api/checkin", { method: "POST" }),
    );
    const redeemResponse = await redeem(
      new Request("http://localhost/api/billing/redeem", {
        method: "POST",
        body: JSON.stringify({ code: "ADD-BALANCE" }),
      }),
    );
    await redeem(
      new Request("http://localhost/api/billing/redeem", {
        method: "POST",
        body: JSON.stringify({ code: "ADD-BALANCE" }),
      }),
    );
    const after = await readJson(
      await dashboard(new Request("http://localhost/api/dashboard/summary")),
    );
    const beforeSelf = (before.data?.newApi as { self: { quota: number; used_quota: number } }).self;
    const afterSelf = (after.data?.newApi as { self: { quota: number; used_quota: number } }).self;

    expect(redeemResponse.status).toBe(200);
    expect(afterSelf.quota).toBe(beforeSelf.quota + 21_000);
    expect(afterSelf.used_quota).toBe(beforeSelf.used_quota);
  });

  it("converts token remain_quota_cny with the mock quota config", async () => {
    const { POST } = await import("@/app/api/tokens/route");

    const response = await POST(
      new Request("http://localhost/api/tokens", {
        method: "POST",
        body: JSON.stringify({
          name: "CNY Limited Token",
          remain_quota_cny: 2,
        }),
      }),
    );
    const body = await readJson(response);
    const token = body.data?.token as { remain_quota: number };

    expect(response.status).toBe(201);
    expect(token.remain_quota).toBe(142_857);
  });

  it("does not return the embed-config mock when production has no mock flag", async () => {
    const { GET } = await import("@/app/api/playground/images/embed-config/route");

    setDevMockEnv(undefined, "production");
    vi.stubEnv("IMAGE_PLAYGROUND_INTERNAL_URL", undefined);

    const response = await GET();
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ configured: false });
  });
});
