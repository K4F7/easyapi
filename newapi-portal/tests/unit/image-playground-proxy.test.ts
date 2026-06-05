import { afterEach, describe, expect, it } from "vitest";

import {
  extractImagePlaygroundSessionToken,
  hasImagePlaygroundSessionTokenQuery,
  isImagePlaygroundEmbedPath,
} from "@/lib/playground/image-playground-embed-path";
import {
  getImagePlaygroundInternalUrl,
  isImagePlaygroundProxyConfigured,
  rewritePlaygroundEmbedHtml,
} from "@/lib/playground/image-playground-proxy";

describe("image playground embed path helpers", () => {
  it("detects embed paths", () => {
    expect(isImagePlaygroundEmbedPath("/playground/embed")).toBe(true);
    expect(isImagePlaygroundEmbedPath("/playground/embed/")).toBe(true);
    expect(isImagePlaygroundEmbedPath("/playground/embed/assets/app.js")).toBe(
      true,
    );
    expect(isImagePlaygroundEmbedPath("/dashboard/playground")).toBe(false);
  });

  it("extracts signed session tokens from iframe query params", () => {
    const params = new URLSearchParams({
      apiKey: "portal-image-session-v1.payload.sig",
      playgroundSessionToken: "portal-image-session-v1.payload.sig",
    });

    expect(extractImagePlaygroundSessionToken(params)).toBe(
      "portal-image-session-v1.payload.sig",
    );
    expect(hasImagePlaygroundSessionTokenQuery(params)).toBe(true);
  });

  it("rejects non-session apiKey values", () => {
    const params = new URLSearchParams({
      apiKey: "sk-live-secret",
    });

    expect(extractImagePlaygroundSessionToken(params)).toBeNull();
    expect(hasImagePlaygroundSessionTokenQuery(params)).toBe(false);
  });
});

describe("image playground proxy config", () => {
  afterEach(() => {
    delete process.env.IMAGE_PLAYGROUND_INTERNAL_URL;
  });

  it("reports configured only when internal URL is set", () => {
    expect(isImagePlaygroundProxyConfigured()).toBe(false);
    expect(getImagePlaygroundInternalUrl()).toBeNull();

    process.env.IMAGE_PLAYGROUND_INTERNAL_URL = "http://image-playground:8080";
    expect(isImagePlaygroundProxyConfigured()).toBe(true);
    expect(getImagePlaygroundInternalUrl()).toBe(
      "http://image-playground:8080",
    );
  });
});

describe("rewritePlaygroundEmbedHtml", () => {
  it("injects a base href for upstream root-relative assets", () => {
    const html = "<html><head><title>Playground</title></head><body></body></html>";
    expect(rewritePlaygroundEmbedHtml(html)).toContain(
      '<base href="/playground/embed/">',
    );
  });

  it("does not duplicate an existing base tag", () => {
    const html =
      '<html><head><base href="/custom/"></head><body></body></html>';
    expect(rewritePlaygroundEmbedHtml(html)).toBe(html);
  });
});
