import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockGetUserNewApiAuth = vi.fn();
const mockResolvePlaygroundKey = vi.fn();
const mockListUpstreamModels = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireUser: () => mockRequireUser(),
  jsonOk: (data: unknown, init?: ResponseInit) =>
    Response.json({ ok: true, data }, init),
  jsonError: (error: unknown, status?: number) =>
    Response.json({ ok: false, error }, { status: status ?? 400 }),
}));

vi.mock("@/lib/api/bff", () => ({
  getUserNewApiAuth: (...args: unknown[]) => mockGetUserNewApiAuth(...args),
  handleApiError: (error: unknown) =>
    Response.json(
      {
        ok: false,
        error: {
          message: error instanceof Error ? error.message : "error",
        },
      },
      { status: 500 },
    ),
}));

vi.mock("@/lib/dev-mock", () => ({
  isDevMockEnabled: () => false,
  mockPlaygroundModelsResponse: vi.fn(),
}));

vi.mock("@/lib/newapi", () => ({
  getNewApiConfig: () => ({ baseUrl: "https://newapi.example.test" }),
}));

vi.mock("@/lib/newapi/playground", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/newapi/playground")
  >("@/lib/newapi/playground");

  return {
    PlaygroundError: actual.PlaygroundError,
    resolvePlaygroundKey: (...args: unknown[]) =>
      mockResolvePlaygroundKey(...args),
    listUpstreamModels: (...args: unknown[]) => mockListUpstreamModels(...args),
  };
});

import { GET } from "@/app/api/playground/models/route";
import { PlaygroundError } from "@/lib/newapi/playground";

async function parseResponse(response: Response) {
  return response.json() as Promise<{
    ok?: boolean;
    error?: {
      code?: string;
      message?: string;
    };
    data?: {
      models?: { id: string }[];
      fallback?: boolean;
    };
  }>;
}

describe("GET playground models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      id: "portal-user-1",
      email: "user@example.com",
    });
    mockGetUserNewApiAuth.mockResolvedValue({
      ok: true,
      auth: { userId: "99", accessToken: "newapi-access-token" },
    });
    mockResolvePlaygroundKey.mockResolvedValue("sk-real-chat-key");
  });

  it("returns the upstream /v1/models list for the selected chat token", async () => {
    mockListUpstreamModels.mockResolvedValue([
      { id: "gpt-real-1" },
      { id: "gpt-real-2" },
    ]);

    const response = await GET(
      new Request(
        "https://portal.example.test/api/playground/models?tokenId=101",
      ),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      models: [{ id: "gpt-real-1" }, { id: "gpt-real-2" }],
      fallback: false,
    });
    expect(mockResolvePlaygroundKey).toHaveBeenCalledWith(
      { userId: "99", accessToken: "newapi-access-token" },
      101,
    );
    expect(mockListUpstreamModels).toHaveBeenCalledWith(
      "https://newapi.example.test",
      "sk-real-chat-key",
    );
  });

  it("returns an error instead of fixed fallback models when upstream fails", async () => {
    mockListUpstreamModels.mockRejectedValue(
      new PlaygroundError("上游模型列表不可用", 503),
    );

    const response = await GET(
      new Request(
        "https://portal.example.test/api/playground/models?tokenId=101",
      ),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(503);
    expect(body.error).toMatchObject({
      code: "PLAYGROUND_ERROR",
      message: "上游模型列表不可用",
    });
    expect(JSON.stringify(body)).not.toMatch(/gpt-4o|deepseek|claude/);
  });

  it("returns an error instead of fixed fallback models when upstream is empty", async () => {
    mockListUpstreamModels.mockResolvedValue([]);

    const response = await GET(
      new Request(
        "https://portal.example.test/api/playground/models?tokenId=101",
      ),
    );
    const body = await parseResponse(response);

    expect(response.status).toBe(502);
    expect(body.error).toMatchObject({
      code: "NO_MODELS",
      message: "上游未返回可用模型",
    });
    expect(JSON.stringify(body)).not.toMatch(/gpt-4o|deepseek|claude/);
  });
});
