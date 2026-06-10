import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadJson = vi.fn();
const mockCreateSession = vi.fn();
const mockRegisterNewApiUser = vi.fn();
const mockLoginNewApiWithPassword = vi.fn();
const mockUpsertPortalUserFromNewApiIdentity = vi.fn();
const mockDbUserFindUnique = vi.fn();
const mockDbAuditLogCreate = vi.fn();

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

vi.mock("@/lib/auth/newapi-user", () => ({
  upsertPortalUserFromNewApiIdentity: (...args: unknown[]) =>
    mockUpsertPortalUserFromNewApiIdentity(...args),
}));

vi.mock("@/lib/dev-mock", () => ({
  isDevMockEnabled: () => false,
  mockRegisterResponse: vi.fn(),
}));

vi.mock("@/lib/newapi/native-auth", () => ({
  registerNewApiUser: (...args: unknown[]) => mockRegisterNewApiUser(...args),
  NewApiNativeAuthError: class NewApiNativeAuthError extends Error {
    code: string;
    status: number;

    constructor(
      code: string,
      message: string,
      options: { status?: number } = {},
    ) {
      super(message);
      this.name = "NewApiNativeAuthError";
      this.code = code;
      this.status = options.status ?? 0;
    }
  },
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
      findUnique: (...args: unknown[]) => mockDbUserFindUnique(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => mockDbAuditLogCreate(...args),
    },
  },
}));

import { POST } from "@/app/api/auth/register/route";
import { NewApiNativeAuthError } from "@/lib/newapi/native-auth";
import { NewApiPasswordLoginError } from "@/lib/newapi/password-login";

const registerInput = {
  username: "testuser",
  email: "user@example.com",
  password: "MyPassword8!",
  affCode: "ABC123",
};

function registerRequest(body: Record<string, unknown> = registerInput) {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function parseResponse(response: Response) {
  return response.json() as Promise<{
    ok: boolean;
    data?: {
      status?: string;
      user?: { email: string; newApiBinding: string };
      session?: { expiresAt: string };
      newApiBinding?: string;
      reason?: string;
    };
    error?: { code: string; message: string };
  }>;
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadJson.mockImplementation(async (_request: Request, schema: { parse: (value: unknown) => unknown }) =>
      schema.parse(registerInput),
    );
    mockDbUserFindUnique.mockResolvedValue(null);
    mockRegisterNewApiUser.mockResolvedValue(undefined);
    mockLoginNewApiWithPassword.mockResolvedValue({
      userId: "99",
      username: "testuser",
      accessToken: "newapi-token",
    });
    mockUpsertPortalUserFromNewApiIdentity.mockResolvedValue({
      id: "portal-user-1",
      email: "user@example.com",
      username: "testuser",
      newApiUserId: "99",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    mockCreateSession.mockResolvedValue({
      expiresAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    mockDbAuditLogCreate.mockResolvedValue({});
  });

  it("registers through NewAPI, binds the portal user, and creates a session", async () => {
    const response = await POST(registerRequest());
    const body = await parseResponse(response);

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data?.status).toBe("REGISTERED_AND_LOGGED_IN");
    expect(body.data?.user).toMatchObject({
      email: "user@example.com",
      newApiBinding: "ready",
    });
    expect(mockRegisterNewApiUser).toHaveBeenCalledWith({
      username: "testuser",
      email: "user@example.com",
      password: "MyPassword8!",
      verificationCode: undefined,
      turnstile: undefined,
      affCode: "ABC123",
    });
    expect(mockLoginNewApiWithPassword).toHaveBeenCalledWith({
      username: "testuser",
      password: "MyPassword8!",
    });
    expect(mockUpsertPortalUserFromNewApiIdentity).toHaveBeenCalledWith({
      userId: "99",
      username: "testuser",
      email: "user@example.com",
      accessToken: "newapi-token",
    });
    expect(mockDbAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "auth.register",
          metadata: expect.objectContaining({
            affCode: "ABC123",
            source: "newapi_native",
          }),
        }),
      }),
    );
    expect(mockCreateSession).toHaveBeenCalledWith("portal-user-1", expect.any(Request));
  });

  it("returns conflict when the email already exists in the portal", async () => {
    mockDbUserFindUnique.mockResolvedValue({ id: "existing", newApiUserId: "1" });

    const response = await POST(registerRequest());
    const body = await parseResponse(response);

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("EMAIL_ALREADY_REGISTERED");
    expect(mockRegisterNewApiUser).not.toHaveBeenCalled();
    expect(mockLoginNewApiWithPassword).not.toHaveBeenCalled();
  });

  it("returns verification required when NewAPI blocks registration", async () => {
    mockRegisterNewApiUser.mockRejectedValue(
      new NewApiNativeAuthError(
        "NEWAPI_VERIFICATION_REQUIRED",
        "verification required",
        { status: 403 },
      ),
    );

    const response = await POST(registerRequest());
    const body = await parseResponse(response);

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("NEWAPI_VERIFICATION_REQUIRED");
    expect(mockLoginNewApiWithPassword).not.toHaveBeenCalled();
  });

  it("returns registered-login-required when NewAPI login is blocked after register", async () => {
    mockLoginNewApiWithPassword.mockRejectedValue(
      new NewApiPasswordLoginError("NEWAPI_VERIFICATION_REQUIRED", "blocked", {
        status: 403,
      }),
    );

    const response = await POST(registerRequest());
    const body = await parseResponse(response);

    expect(response.status).toBe(202);
    expect(body.ok).toBe(true);
    expect(body.data?.status).toBe("REGISTERED_LOGIN_REQUIRED");
    expect(body.data?.newApiBinding).toBe("pending");
    expect(body.data?.reason).toBe("NEWAPI_VERIFICATION_REQUIRED");
    expect(mockUpsertPortalUserFromNewApiIdentity).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});
