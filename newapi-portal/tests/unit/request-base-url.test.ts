import { afterEach, describe, expect, it } from "vitest";

import { getRequestBaseUrl } from "@/lib/http/request-base-url";

describe("getRequestBaseUrl", () => {
  afterEach(() => {
    delete process.env.APP_URL;
  });

  it("prefers forwarded host headers behind a reverse proxy", () => {
    const request = new Request("http://127.0.0.1:3000/api/playground/images/session", {
      headers: {
        "x-forwarded-host": "test.easyapi.work",
        "x-forwarded-proto": "https",
      },
    });

    expect(getRequestBaseUrl(request)).toBe("https://test.easyapi.work");
  });

  it("falls back to APP_URL when forwarded headers are absent", () => {
    process.env.APP_URL = "https://test.easyapi.work";

    const request = new Request("http://127.0.0.1:3000/api/playground/images/session");

    expect(getRequestBaseUrl(request)).toBe("https://test.easyapi.work");
  });
});
