import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

class MockAuthError extends Error {
  readonly status = 401;
  readonly code = "UNAUTHORIZED";
}

vi.mock("@/lib/auth", () => ({
  AuthError: MockAuthError,
  decryptSecret: vi.fn(),
  jsonError: (error: unknown, status?: number) =>
    Response.json({ ok: false, error }, { status: status ?? 400 }),
  zodErrorResponse: (error: z.ZodError) =>
    Response.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "请求参数无效",
          details: error.flatten(),
        },
      },
      { status: 400 },
    ),
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/lib/env", () => ({
  getAuthSecret: vi.fn(),
}));

async function parseResponse(response: Response) {
  return response.json() as Promise<{
    ok: boolean;
    error: {
      code: string;
      message: string;
      details?: unknown;
    };
  }>;
}

describe("handleApiError", () => {
  it("does not expose raw NewAPI error messages in response details", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const { handleApiError } = await import("@/lib/api/bff");
      const { NewApiError } = await import("@/lib/newapi");

      const response = handleApiError(
        new NewApiError("upstream leaked sk-live-secret raw trace", {
          status: 429,
          code: "rate_limit_secret_trace",
          payload: {
            message: "provider raw sk-live-secret payload",
          },
        }),
        "调用上游失败",
      );
      const body = await parseResponse(response);

      expect(response.status).toBe(502);
      expect(body.error).toEqual({
        code: "NEWAPI_ERROR",
        message: "上游 NewAPI 请求失败",
        details: {
          status: 429,
          code: "rate_limit_secret_trace",
        },
      });
      expect(JSON.stringify(body)).not.toMatch(/sk-live-secret|raw trace|provider raw/);
      expect(consoleError).toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.any(NewApiError),
      );
      expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(
        /sk-live-secret|raw trace|provider raw|payload/i,
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("sanitizes generic error log objects before logging", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const { handleApiError } = await import("@/lib/api/bff");
      const error = Object.assign(new Error("generic leaked sk-live-secret"), {
        headers: { Authorization: "Bearer sk-live-secret" },
        body: "raw body sk-live-secret",
        payload: { token: "sk-live-secret" },
        code: "GENERIC_FAILURE",
      });

      const response = handleApiError(error, "内部调用失败");
      const body = await parseResponse(response);

      expect(response.status).toBe(500);
      expect(body.error).toEqual({
        code: "INTERNAL_ERROR",
        message: "内部调用失败",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "内部调用失败",
        expect.objectContaining({
          name: "Error",
          code: "GENERIC_FAILURE",
        }),
      );
      expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(
        /sk-live-secret|raw body|headers|payload|Authorization/i,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
