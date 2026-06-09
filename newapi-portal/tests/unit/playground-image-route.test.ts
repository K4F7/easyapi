import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireUser,
  mockGetUserNewApiAuth,
  mockGetPortalUserForApi,
  mockResolvePlaygroundKey,
  mockAssertPlaygroundTokenAccess,
  mockEnsurePlaygroundImageTokenId,
  mockCreateImageGeneration,
  MockNewApiError,
} = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockGetUserNewApiAuth: vi.fn(),
  mockGetPortalUserForApi: vi.fn(),
  mockResolvePlaygroundKey: vi.fn(),
  mockAssertPlaygroundTokenAccess: vi.fn(),
  mockEnsurePlaygroundImageTokenId: vi.fn(),
  mockCreateImageGeneration: vi.fn(),
  MockNewApiError: class MockNewApiError extends Error {
    readonly status: number;
    readonly code?: string;

    constructor(
      message: string,
      options: {
        status: number;
        code?: string;
      },
    ) {
      super(message);
      this.name = "NewApiError";
      this.status = options.status;
      this.code = options.code;
    }
  },
}));

vi.mock("@/lib/auth", () => ({
  requireUser: () => mockRequireUser(),
  jsonOk: (data: unknown, init?: ResponseInit) =>
    Response.json({ ok: true, data }, init),
  jsonError: (error: unknown, status?: number) =>
    Response.json({ ok: false, error }, { status: status ?? 400 }),
  readJson: async (
    request: Request,
    schema: { parse: (value: unknown) => unknown },
  ) => schema.parse(await request.json()),
}));

vi.mock("@/lib/api/bff", () => ({
  getPortalUserForApi: (...args: unknown[]) => mockGetPortalUserForApi(...args),
  getUserNewApiAuth: (...args: unknown[]) => mockGetUserNewApiAuth(...args),
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
  handleApiError: (error: unknown) =>
    Response.json(
      {
        ok: false,
        error: {
          code:
            error instanceof Error && error.name === "ZodError"
              ? "VALIDATION_ERROR"
              : "INTERNAL_ERROR",
          message:
            error instanceof Error && error.name === "ZodError"
              ? "Invalid request input"
              : error instanceof Error
                ? error.message
                : "error",
        },
      },
      {
        status: error instanceof Error && error.name === "ZodError" ? 400 : 500,
      },
    ),
}));

vi.mock("@/lib/newapi", () => ({
  NewApiError: MockNewApiError,
  getNewApiConfig: () => ({ baseUrl: "https://newapi.example.test" }),
}));

vi.mock("@/lib/playground/ensure-token", () => ({
  deleteAllPlaygroundTokensByName: vi.fn(),
  ensurePlaygroundChatTokenId: vi.fn(),
  ensurePlaygroundImageTokenId: (...args: unknown[]) =>
    mockEnsurePlaygroundImageTokenId(...args),
}));

vi.mock("@/lib/newapi/playground", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/newapi/playground")
  >("@/lib/newapi/playground");

  return {
    PlaygroundError: actual.PlaygroundError,
    assertPlaygroundTokenAccess: (...args: unknown[]) =>
      mockAssertPlaygroundTokenAccess(...args),
    resolvePlaygroundKey: (...args: unknown[]) =>
      mockResolvePlaygroundKey(...args),
    createImageGeneration: (...args: unknown[]) =>
      mockCreateImageGeneration(...args),
  };
});

import {
  handleImageGeneration,
  handleImageGenerationOptions,
} from "@/lib/playground/image-generation-route";
import { signPlaygroundImageSessionToken } from "@/lib/playground/image-session-token";
import { POST as createImageSession } from "@/app/api/playground/images/session/route";
import { PlaygroundError } from "@/lib/newapi/playground";

function jsonRequest(
  url: string,
  body: Record<string, unknown>,
  headers?: HeadersInit,
) {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function parseResponse(response: Response) {
  return response.json() as Promise<{
    ok?: boolean;
    error?: {
      code: string;
      message: string;
      details?: unknown;
    };
    data?: unknown;
  }>;
}

describe("POST playground image session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = "unit-test-auth-secret-at-least-32-chars";
    process.env.IMAGE_PLAYGROUND_INTERNAL_URL = "http://image-playground:8080";
    mockRequireUser.mockResolvedValue({
      id: "portal-user-1",
      email: "user@example.com",
    });
    mockGetUserNewApiAuth.mockResolvedValue({
      ok: true,
      auth: { userId: "99", accessToken: "newapi-access-token" },
    });
    mockAssertPlaygroundTokenAccess.mockResolvedValue(undefined);
    mockEnsurePlaygroundImageTokenId.mockResolvedValue(101);
  });

  it("returns a signed image session token without exposing the real key", async () => {
    const response = await createImageSession(
      jsonRequest("https://portal.example.test/api/playground/images/session", {
        tokenId: 101,
      }),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      token: expect.stringMatching(/^portal-image-session-v1\./),
      tokenType: "Bearer",
      expiresIn: 600,
    });
    expect(mockGetUserNewApiAuth).toHaveBeenCalledWith({
      id: "portal-user-1",
      email: "user@example.com",
    });
    expect(mockEnsurePlaygroundImageTokenId).toHaveBeenCalledWith({
      userId: "99",
      accessToken: "newapi-access-token",
    });
    expect(mockAssertPlaygroundTokenAccess).toHaveBeenCalledWith(
      { userId: "99", accessToken: "newapi-access-token" },
      101,
    );
    expect(JSON.stringify(body)).not.toMatch(
      /sk-real-secret|newapi-access-token/,
    );
  });

  it("returns 400 when tokenId is missing", async () => {
    const response = await createImageSession(
      jsonRequest(
        "https://portal.example.test/api/playground/images/session",
        {},
      ),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(mockAssertPlaygroundTokenAccess).not.toHaveBeenCalled();
  });

  it("sanitizes token access errors before returning them", async () => {
    mockAssertPlaygroundTokenAccess.mockRejectedValue(
      new PlaygroundError("provider leaked sk-live-token in access check", 403),
    );

    const response = await createImageSession(
      jsonRequest("https://portal.example.test/api/playground/images/session", {
        tokenId: 101,
      }),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(403);
    expect(body.error).toMatchObject({
      code: "PLAYGROUND_ERROR",
      message: "无法校验所选令牌，请稍后重试",
    });
    expect(JSON.stringify(body)).not.toMatch(/sk-live-token|provider leaked/);
  });

  it("sanitizes NewApiError failures before returning them", async () => {
    mockAssertPlaygroundTokenAccess.mockRejectedValue(
      new MockNewApiError("provider leaked sk-live-token in details", {
        status: 500,
        code: "upstream_secret_trace",
      }),
    );

    const response = await createImageSession(
      jsonRequest("https://portal.example.test/api/playground/images/session", {
        tokenId: 101,
      }),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(502);
    expect(body.error).toMatchObject({
      code: "TOKEN_RESOLUTION_FAILED",
      message: "无法校验所选令牌，请稍后重试",
      details: {
        status: 500,
        code: "upstream_secret_trace",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/sk-live-token|provider leaked/);
  });
});

describe("POST playground image generations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = "unit-test-auth-secret-at-least-32-chars";
    delete process.env.IMAGE_PLAYGROUND_INTERNAL_URL;
    mockRequireUser.mockResolvedValue({
      id: "portal-user-1",
      email: "user@example.com",
    });
    mockGetUserNewApiAuth.mockResolvedValue({
      ok: true,
      auth: { userId: "99", accessToken: "newapi-access-token" },
    });
    mockGetPortalUserForApi.mockResolvedValue({
      id: "portal-user-1",
      email: "user@example.com",
      inviteCode: "INVITE1",
      newApiUserId: "99",
      newApiAccessTokenCiphertext: "newapi-access-token",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    mockResolvePlaygroundKey.mockResolvedValue("sk-real-secret");
    mockCreateImageGeneration.mockResolvedValue(
      Response.json({
        created: 1,
        data: [{ url: "https://cdn.example.test/image.png" }],
      }),
    );
  });

  it("accepts a same-origin signed image session token without requiring iframe cookies", async () => {
    const sessionToken = signPlaygroundImageSessionToken({
      userId: "portal-user-1",
      tokenId: 303,
      portalOrigin: "https://portal.example.test",
      playgroundOrigin: "https://portal.example.test",
    });

    const response = await handleImageGeneration(
      jsonRequest(
        "https://portal.example.test/v1/images/generations",
        {
          prompt: "draw with a signed session",
          playgroundSessionToken: sessionToken,
        },
        { Origin: "https://portal.example.test" },
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://portal.example.test",
    );
    expect(mockRequireUser).not.toHaveBeenCalled();
    expect(mockGetPortalUserForApi).toHaveBeenCalledWith("portal-user-1");
    expect(mockResolvePlaygroundKey).toHaveBeenCalledWith(
      { userId: "99", accessToken: "newapi-access-token" },
      303,
    );
    expect(mockCreateImageGeneration).toHaveBeenCalledWith(
      "https://newapi.example.test",
      "sk-real-secret",
      { prompt: "draw with a signed session" },
      expect.any(AbortSignal),
    );
  });

  it("does not use legacy iframe configuration for cross-origin CORS", () => {
    const response = handleImageGenerationOptions(
      new Request("https://portal.example.test/v1/images/generations", {
        method: "OPTIONS",
        headers: {
          Origin: "https://build-playground.example.test",
          "Access-Control-Request-Method": "POST",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("does not answer CORS preflight from external playground origins", () => {
    const response = handleImageGenerationOptions(
      new Request("https://portal.example.test/v1/images/generations", {
        method: "OPTIONS",
        headers: {
          Origin: "https://playground.example.test",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization,content-type",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "POST",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    );
  });

  it("rejects cross-origin tokenId compatibility requests without a signed image session token", async () => {
    const response = await handleImageGeneration(
      jsonRequest(
        "https://portal.example.test/v1/images/generations",
        {
          tokenId: 101,
          prompt: "draw without signed image session",
        },
        { Origin: "https://playground.example.test" },
      ),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(body.error?.code).toBe("IMAGE_SESSION_TOKEN_REQUIRED");
    expect(mockRequireUser).not.toHaveBeenCalled();
    expect(mockResolvePlaygroundKey).not.toHaveBeenCalled();
    expect(mockCreateImageGeneration).not.toHaveBeenCalled();
  });

  it("resolves the selected token and injects the real key only upstream", async () => {
    const response = await handleImageGeneration(
      jsonRequest("https://portal.example.test/v1/images/generations", {
        tokenId: 101,
        prompt: "draw a dashboard",
        model: "gpt-image-1",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      created: 1,
      data: [{ url: "https://cdn.example.test/image.png" }],
    });
    expect(mockResolvePlaygroundKey).toHaveBeenCalledWith(
      { userId: "99", accessToken: "newapi-access-token" },
      101,
    );
    expect(mockCreateImageGeneration).toHaveBeenCalledWith(
      "https://newapi.example.test",
      "sk-real-secret",
      {
        prompt: "draw a dashboard",
        model: "gpt-image-1",
      },
      expect.any(AbortSignal),
    );
  });

  it("accepts a non-secret Authorization marker for OpenAI-compatible iframes", async () => {
    await handleImageGeneration(
      jsonRequest(
        "https://portal.example.test/v1/images/generations",
        { prompt: "draw a token marker" },
        { Authorization: "Bearer portal-token-202" },
      ),
    );

    expect(mockResolvePlaygroundKey).toHaveBeenCalledWith(
      expect.any(Object),
      202,
    );
  });

  it("rejects a signed image session token bound to a different playground origin", async () => {
    const sessionToken = signPlaygroundImageSessionToken({
      userId: "portal-user-1",
      tokenId: 303,
      portalOrigin: "https://portal.example.test",
      playgroundOrigin: "https://other-playground.example.test",
    });

    const response = await handleImageGeneration(
      jsonRequest(
        "https://portal.example.test/v1/images/generations",
        {
          prompt: "draw with mismatched origin",
          playgroundSessionToken: sessionToken,
        },
        { Origin: "https://playground.example.test" },
      ),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe("INVALID_IMAGE_SESSION_TOKEN");
    expect(mockResolvePlaygroundKey).not.toHaveBeenCalled();
  });

  it("rejects an expired signed image session token", async () => {
    const expiredToken = signPlaygroundImageSessionToken(
      {
        userId: "portal-user-1",
        tokenId: 303,
        portalOrigin: "https://portal.example.test",
        playgroundOrigin: "https://playground.example.test",
      },
      100,
    );

    const response = await handleImageGeneration(
      jsonRequest("https://portal.example.test/v1/images/generations", {
        prompt: "draw with an expired token",
        playgroundSessionToken: expiredToken,
      }),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe("EXPIRED_IMAGE_SESSION_TOKEN");
    expect(mockResolvePlaygroundKey).not.toHaveBeenCalled();
    expect(mockCreateImageGeneration).not.toHaveBeenCalled();
  });

  it("returns a sanitized error when tokenId is missing", async () => {
    const response = await handleImageGeneration(
      jsonRequest("https://portal.example.test/v1/images/generations", {
        prompt: "draw without token",
      }),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("INVALID_TOKEN_ID");
    expect(JSON.stringify(body)).not.toMatch(/sk-/);
    expect(mockResolvePlaygroundKey).not.toHaveBeenCalled();
    expect(mockCreateImageGeneration).not.toHaveBeenCalled();
  });

  it("does not return raw upstream error bodies", async () => {
    mockCreateImageGeneration.mockResolvedValue(
      Response.json(
        { error: "provider trace leaked sk-live-abcdef secret-provider" },
        { status: 400 },
      ),
    );

    const response = await handleImageGeneration(
      jsonRequest("https://portal.example.test/v1/images/generations", {
        tokenId: "101",
        prompt: "draw failure",
      }),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(502);
    expect(body.error).toMatchObject({
      code: "UPSTREAM_ERROR",
      message: "上游生图接口返回错误（HTTP 400），请稍后重试",
      details: { status: 400 },
    });
    expect(JSON.stringify(body)).not.toMatch(/sk-live|secret-provider/);
  });

  it("sanitizes token resolution errors before returning them", async () => {
    mockResolvePlaygroundKey.mockRejectedValue(
      new MockNewApiError("provider leaked sk-live-token in details", {
        status: 500,
        code: "upstream_secret_trace",
      }),
    );

    const response = await handleImageGeneration(
      jsonRequest("https://portal.example.test/v1/images/generations", {
        tokenId: "101",
        prompt: "draw token resolution failure",
      }),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(502);
    expect(body.error).toMatchObject({
      code: "TOKEN_RESOLUTION_FAILED",
      message: "无法解析所选令牌，请稍后重试",
      details: {
        status: 500,
        code: "upstream_secret_trace",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/sk-live-token|provider leaked/);
  });
});
