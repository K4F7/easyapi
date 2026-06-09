import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listUpstreamModels,
  PlaygroundError,
} from "@/lib/newapi/playground";

describe("listUpstreamModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports redirect responses as URL misconfiguration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("", {
          status: 307,
          headers: { location: "/login" },
        }),
      ),
    );

    await expect(
      listUpstreamModels("https://test.easyapi.work", "test-key"),
    ).rejects.toMatchObject({
      message: expect.stringContaining("被重定向"),
      status: 502,
    } satisfies Partial<PlaygroundError>);
  });

  it("reports 401 responses as invalid key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Invalid token" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      listUpstreamModels("https://easyapi.work", "bad-key"),
    ).rejects.toMatchObject({
      message: "令牌密钥无效或无权访问模型列表",
      status: 502,
    } satisfies Partial<PlaygroundError>);
  });

  it("reports HTML responses as URL misconfiguration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html><body>login</body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ),
    );

    await expect(
      listUpstreamModels("https://test.easyapi.work", "test-key"),
    ).rejects.toMatchObject({
      message: expect.stringContaining("非 JSON"),
      status: 502,
    } satisfies Partial<PlaygroundError>);
  });

  it("returns model ids from a valid upstream payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ id: "gpt-test" }, { id: "claude-test" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    await expect(
      listUpstreamModels("https://easyapi.work", "good-key"),
    ).resolves.toEqual([{ id: "gpt-test" }, { id: "claude-test" }]);
  });
});
