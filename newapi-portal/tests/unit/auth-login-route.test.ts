import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadJson = vi.fn();
const mockCreateSession = vi.fn();
const mockLoginNewApiWithPassword = vi.fn();
const mockUpsertPortalUserFromNewApiIdentity = vi.fn();
const mockDbFindUnique = vi.fn();

vi.mock("@/lib/auth", () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  jsonOk: (data: unknown, init?: ResponseInit) =>
    Response.json({ ok: true, data }, init),
  jsonError: (error: unknown, status?: number) =>
    Response.json({ ok: false, error }, { status: status ?? 400 }),
  readJson: (...args: unknown[]) => mockReadJson(...args),
  toPublicUser: (user: {
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
  zodErrorResponse: () =>
    Response.json({ ok: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 }),
}));

vi.mock("@/lib/auth/login-identifier", () => ({
  resolveNewApiLoginUsernames: (identifier: string) =>
    identifier.includes("@") ? [identifier.split("@")[0], identifier] : [identifier],
}));

vi.mock("@/lib/auth/newapi-user", () => ({
  upsertPortalUserFromNewApiIdentity: (...args: unknown[]) =>
    mockUpsertPortalUserFromNewApiIdentity(...args),
}));

vi.mock("@/lib/dev-mock", () => ({
  isDevMockEnabled: () => false,
  mockLoginResponse: vi.fn(),
}));

vi.mock("@/lib/newapi/password-login", () => ({
  loginNewApiWithPassword: (...args: unknown[]) => mockLoginNewApiWithPassword(...args),
  NewApiPasswordLoginError: class NewApiPasswordLoginError extends Error {
    code: string;
    status: number;

    constructor(
      code: string,
      message: string,
      options: { status?: number } = {},
    ) {
      super(message);
      this.name = "NewApiPasswordLoginError";
      this.code = code;
      this.status = options.status ?? 0;
    }
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => mockDbFindUnique(...args),
    },
  },
}));

import { POST } from "@/app/api/auth/login/route";
import { NewApiPasswordLoginError } from "@/lib/newapi/password-login";

function loginRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function parseResponse(response: Response) {
  return response.json() as Promise<{
    ok: boolean;
    data?: {
      user?: { email: string; newApiBinding: string };
      session?: { expiresAt: string };
    };
    error?: { code: string; message: string };
  }>;
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadJson.mockImplementation(async (_request: Request, schema: { parse: (value: unknown) => unknown }) =>
      schema.parse({
        identifier: "user@example.com",
        password: "MyPassword8!",
      }),
    );
    mockLoginNewApiWithPassword.mockResolvedValue({
      userId: "99",
      username: "user",
      accessToken: "newapi-token",
    });
    mockUpsertPortalUserFromNewApiIdentity.mockResolvedValue({
      id: "portal-user-1",
      email: "user@example.com",
      username: "user",
      newApiUserId: "99",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    mockCreateSession.mockResolvedValue({
      expiresAt: new Date("2026-07-01T00:00:00.000Z"),
    });
  });

  it("authenticates through NewAPI only and creates a portal session", async () => {
    const response = await POST(loginRequest({}));
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data?.user).toMatchObject({
      email: "user@example.com",
      newApiBinding: "ready",
    });
    expect(body.data?.session?.expiresAt).toBe("2026-07-01T00:00:00.000Z");
    expect(mockLoginNewApiWithPassword).toHaveBeenCalledWith({
      username: "user",
      password: "MyPassword8!",
    });
    expect(mockUpsertPortalUserFromNewApiIdentity).toHaveBeenCalledWith({
      userId: "99",
      username: "user",
      email: "user@example.com",
      accessToken: "newapi-token",
    });
    expect(mockCreateSession).toHaveBeenCalledWith("portal-user-1", expect.any(Request));
    expect(mockDbFindUnique).not.toHaveBeenCalled();
  });

  it("returns invalid credentials when NewAPI rejects the password", async () => {
    mockLoginNewApiWithPassword.mockRejectedValue(
      new NewApiPasswordLoginError("NEWAPI_INVALID_CREDENTIALS", "bad password", {
        status: 401,
      }),
    );

    const response = await POST(loginRequest({}));
    const body = await parseResponse(response);

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe("INVALID_CREDENTIALS");
    expect(mockUpsertPortalUserFromNewApiIdentity).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockDbFindUnique).not.toHaveBeenCalled();
  });
});
