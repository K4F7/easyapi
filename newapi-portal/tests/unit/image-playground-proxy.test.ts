import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  buildPortalTokenMarker,
  extractEmbedConfigFromSearchParams,
  extractImagePlaygroundSessionToken,
  hasImagePlaygroundSessionTokenQuery,
  IMAGE_PLAYGROUND_CONFIG_STORAGE_KEY,
  isImagePlaygroundEmbedPath,
  isPortalTokenMarker,
  parsePortalTokenMarker,
} from "@/lib/playground/image-playground-embed-path";
import {
  getImagePlaygroundInternalUrl,
  isImagePlaygroundProxyConfigured,
  proxyImagePlaygroundRequest,
  rewritePlaygroundEmbedHtml,
} from "@/lib/playground/image-playground-proxy";
import { config as middlewareConfig, middleware } from "@/middleware";

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

  it("builds and parses fixed portal token markers", () => {
    expect(buildPortalTokenMarker(202)).toBe("portal-token-202");
    expect(isPortalTokenMarker("portal-token-202")).toBe(true);
    expect(parsePortalTokenMarker("portal-token-202")).toBe(202);
    expect(parsePortalTokenMarker("portal-image-session-v1.payload.sig")).toBeNull();
    expect(parsePortalTokenMarker("sk-live-secret")).toBeNull();
  });

  it("extracts canonical embed config from search params", () => {
    const params = new URLSearchParams({
      apiUrl: "https://portal.example.test",
      apiKey: "portal-image-session-v1.payload.sig",
      imageApiUrl: "https://portal.example.test/api/playground/images/generations",
      baseUrl: "https://portal.example.test",
      tokenId: "42",
      theme: "light",
      model: "gpt-image-1",
    });

    expect(extractEmbedConfigFromSearchParams(params)).toEqual({
      apiUrl: "https://portal.example.test",
      apiKey: "portal-image-session-v1.payload.sig",
      imageApiUrl: "https://portal.example.test/api/playground/images/generations",
      baseUrl: "https://portal.example.test",
      tokenId: "42",
      theme: "light",
      model: "gpt-image-1",
    });
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
  it("injects a base href and light theme controls", () => {
    const html = "<html><head><title>Playground</title></head><body></body></html>";
    const rewritten = rewritePlaygroundEmbedHtml(html);

    expect(rewritten).toContain('<base href="/playground/embed/">');
    expect(rewritten).toContain('<meta name="color-scheme" content="light">');
    expect(rewritten).toContain('<meta name="theme-color" content="#f9fafb">');
    expect(rewritten).toContain('id="ezapi-embed-light-theme-state"');
    expect(rewritten).toContain('document.documentElement');
    expect(rewritten).toContain('dataset.theme="light"');
    expect(rewritten).toContain('classList.add("light")');
    expect(rewritten).toContain('localStorage.setItem("theme","light")');
    expect(rewritten).toContain('sessionStorage.setItem("theme","light")');
    expect(rewritten).toContain('id="ezapi-embed-light-theme"');
    expect(rewritten).toContain("html.light body");
    expect(rewritten).toContain('querySelectorAll("[class*=dark\\\\:]")');
    expect(rewritten).toContain('MutationObserver');
  });

  it("does not duplicate an existing base tag", () => {
    const html =
      '<html><head><base href="/custom/"></head><body></body></html>';
    const rewritten = rewritePlaygroundEmbedHtml(html);

    expect(rewritten.match(/<base\s/gi)).toHaveLength(1);
    expect(rewritten).toContain('<base href="/custom/">');
    expect(rewritten).toContain('id="ezapi-embed-light-theme"');
  });

  it("keeps the injected base href free of session tokens", () => {
    const html = "<html><head></head><body></body></html>";
    const rewritten = rewritePlaygroundEmbedHtml(
      html,
      "portal-image-session-v1.payload.sig",
    );

    expect(rewritten).toContain('<base href="/playground/embed/">');
    expect(rewritten).not.toContain("apiKey=portal-image-session-v1.payload.sig");
  });

  it("injects a bootstrap script that persists embed config without stripping URL params", () => {
    const html = "<html><head></head><body></body></html>";
    const rewritten = rewritePlaygroundEmbedHtml(html);

    expect(rewritten).toContain('id="ezapi-embed-config-bootstrap"');
    expect(rewritten).toContain(IMAGE_PLAYGROUND_CONFIG_STORAGE_KEY);
    expect(rewritten).toContain("sessionStorage.setItem");
    expect(rewritten).not.toContain("history.replaceState");
    expect(rewritten).not.toContain("params.delete");
  });

  it("does not append session tokens to relative asset references", () => {
    const html = [
      "<html><head>",
      '<script src="./assets/app.js"></script>',
      '<link rel="stylesheet" href="./assets/app.css?version=1">',
      '<img src="../assets/logo.png#main">',
      '<link rel="preload" href="https://cdn.example.test/app.css">',
      "</head><body></body></html>",
    ].join("");
    const rewritten = rewritePlaygroundEmbedHtml(
      html,
      "portal-image-session-v1.payload.sig",
    );

    expect(rewritten).toContain('src="./assets/app.js"');
    expect(rewritten).toContain('href="./assets/app.css?version=1"');
    expect(rewritten).toContain('src="../assets/logo.png#main"');
    expect(rewritten).toContain('href="https://cdn.example.test/app.css"');
    expect(rewritten).not.toContain("apiKey=portal-image-session-v1.payload.sig");
  });

  it("does not duplicate existing light theme controls", () => {
    const html =
      '<html><head><style id="ezapi-embed-light-theme">:root{color-scheme:light}</style></head><body></body></html>';

    expect(
      rewritePlaygroundEmbedHtml(html).match(/ezapi-embed-light-theme/gi),
    ).toHaveLength(1);
  });
});

describe("proxyImagePlaygroundRequest", () => {
  afterEach(() => {
    delete process.env.IMAGE_PLAYGROUND_INTERNAL_URL;
    vi.unstubAllGlobals();
  });

  it("does not forward browser navigation headers to the upstream app", async () => {
    process.env.IMAGE_PLAYGROUND_INTERNAL_URL = "http://image-playground:8080";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html><head></head><body></body></html>", {
        headers: { "Content-Type": "text/html" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await proxyImagePlaygroundRequest(
      new Request("https://portal.example.test/playground/embed", {
        headers: {
          Host: "portal.example.test",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Sec-CH-UA": '"Chromium";v="148", "HeadlessChrome";v="148"',
          "Sec-CH-UA-Mobile": "?0",
          "Sec-CH-UA-Platform": '"Windows"',
          "Upgrade-Insecure-Requests": "1",
          "User-Agent": "HeadlessChrome",
          "X-Requested-With": "portal",
        },
      }),
      undefined,
    );

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("host")).toBeNull();
    expect(headers.get("sec-fetch-dest")).toBeNull();
    expect(headers.get("sec-fetch-mode")).toBeNull();
    expect(headers.get("sec-fetch-site")).toBeNull();
    expect(headers.get("sec-fetch-user")).toBeNull();
    expect(headers.get("sec-ch-ua")).toBeNull();
    expect(headers.get("sec-ch-ua-mobile")).toBeNull();
    expect(headers.get("sec-ch-ua-platform")).toBeNull();
    expect(headers.get("upgrade-insecure-requests")).toBeNull();
    expect(headers.get("user-agent")).toBe("EZAPI-Portal/ImagePlaygroundProxy");
    expect(headers.get("x-requested-with")).toBe("portal");
  });

  it("passes CSS responses through without buffering or rewriting", async () => {
    process.env.IMAGE_PLAYGROUND_INTERNAL_URL = "http://image-playground:8080";
    const upstreamResponse = new Response(
      [
        "body{background:#f9fafb}",
        "@media (prefers-color-scheme: dark){body{background:#020617}}",
      ].join(""),
      {
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          "Content-Length": "999",
        },
      },
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstreamResponse));

    const response = await proxyImagePlaygroundRequest(
      new Request("https://portal.example.test/playground/embed/assets/app.css"),
      ["assets", "app.css"],
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "frame-ancestors 'self'",
    );
    expect(response.headers.get("content-length")).toBeNull();
    expect(upstreamResponse.bodyUsed).toBe(false);
    expect(response.body).toBe(upstreamResponse.body);
  });

  it("normalizes Content-Type before rewriting HTML responses only", async () => {
    process.env.IMAGE_PLAYGROUND_INTERNAL_URL = "http://image-playground:8080";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(
      new Response("<html><head></head><body></body></html>", {
        headers: { "Content-Type": "TEXT/HTML; Charset=UTF-8" },
      }),
    );
    const htmlResponse = await proxyImagePlaygroundRequest(
      new Request("https://portal.example.test/playground/embed/"),
      undefined,
    );
    await expect(htmlResponse.text()).resolves.toContain(
      'id="ezapi-embed-light-theme"',
    );

    const cssUpstreamResponse = new Response(
      "body{color:#111827}@media (prefers-color-scheme: dark){body{color:#f8fafc}}",
      {
        headers: { "Content-Type": "Text/CSS; Charset=UTF-8" },
      },
    );
    fetchMock.mockResolvedValueOnce(
      cssUpstreamResponse,
    );
    const cssResponse = await proxyImagePlaygroundRequest(
      new Request("https://portal.example.test/playground/embed/assets/app.css"),
      ["assets", "app.css"],
    );

    expect(cssUpstreamResponse.bodyUsed).toBe(false);
    expect(cssResponse.body).toBe(cssUpstreamResponse.body);
  });

  it("does not buffer SSE responses", async () => {
    process.env.IMAGE_PLAYGROUND_INTERNAL_URL = "http://image-playground:8080";
    const upstreamResponse = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("data: ping\n\n"));
        },
      }),
      {
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      },
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstreamResponse));

    const response = await proxyImagePlaygroundRequest(
      new Request("https://portal.example.test/playground/embed/api/events"),
      ["api", "events"],
    );

    expect(upstreamResponse.bodyUsed).toBe(false);
    expect(response.body).toBe(upstreamResponse.body);
  });

  it("does not buffer non-text resources", async () => {
    process.env.IMAGE_PLAYGROUND_INTERNAL_URL = "http://image-playground:8080";
    const upstreamResponse = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      }),
      {
        headers: { "Content-Type": "image/png" },
      },
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstreamResponse));

    const response = await proxyImagePlaygroundRequest(
      new Request("https://portal.example.test/playground/embed/assets/logo.png"),
      ["assets", "logo.png"],
    );

    expect(upstreamResponse.bodyUsed).toBe(false);
    expect(response.body).toBe(upstreamResponse.body);
  });
});

describe("image playground middleware access", () => {
  const signedEmbedReferer =
    "https://portal.example.test/playground/embed?apiKey=portal-image-session-v1.payload.sig";

  const matchesMiddleware = (pathname: string): boolean => {
    return middlewareConfig.matcher.some((matcher) => {
      const pattern = matcher.replace(":path*", ".*");
      return new RegExp(`^${pattern}$`).test(pathname);
    });
  };

  it("allows embed assets when the referer has a signed embed token", () => {
    const response = middleware(
      new NextRequest(
        "https://portal.example.test/playground/embed/assets/app.js",
        {
          headers: {
            referer: signedEmbedReferer,
          },
        },
      ),
    );

    expect(response?.status).not.toBe(307);
    expect(response?.headers.get("location")).toBeNull();
  });

  it("allows embed image assets when the referer has a signed embed token", () => {
    const response = middleware(
      new NextRequest(
        "https://portal.example.test/playground/embed/assets/logo.png",
        {
          headers: {
            referer: signedEmbedReferer,
          },
        },
      ),
    );

    expect(response?.status).not.toBe(307);
    expect(response?.headers.get("location")).toBeNull();
  });

  it("keeps anonymous embed assets protected without a signed referer", () => {
    const response = middleware(
      new NextRequest(
        "https://portal.example.test/playground/embed/assets/app.js",
      ),
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toContain("/login");
  });

  it("keeps anonymous embed image assets protected without a signed referer", () => {
    const response = middleware(
      new NextRequest(
        "https://portal.example.test/playground/embed/assets/logo.png",
      ),
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toContain("/login");
  });

  it("does not allow signed referers to bypass auth for embed HTML paths", () => {
    const response = middleware(
      new NextRequest("https://portal.example.test/playground/embed/settings", {
        headers: {
          referer: signedEmbedReferer,
        },
      }),
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toContain("/login");
  });

  it("does not allow signed referers to bypass auth for the embed document", () => {
    const response = middleware(
      new NextRequest("https://portal.example.test/playground/embed/", {
        headers: {
          referer: signedEmbedReferer,
        },
      }),
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toContain("/login");
  });

  it("does not allow signed referers to bypass auth for non-GET asset requests", () => {
    const response = middleware(
      new NextRequest(
        "https://portal.example.test/playground/embed/assets/app.js",
        {
          method: "POST",
          headers: {
            referer: signedEmbedReferer,
          },
        },
      ),
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toContain("/login");
  });

  it("does not allow signed referers to bypass auth for non-GET image asset requests", () => {
    const response = middleware(
      new NextRequest(
        "https://portal.example.test/playground/embed/assets/logo.png",
        {
          method: "POST",
          headers: {
            referer: signedEmbedReferer,
          },
        },
      ),
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toContain("/login");
  });

  it("keeps embed static extensions inside the middleware matcher", () => {
    expect(matchesMiddleware("/playground/embed/assets/logo.png")).toBe(true);
    expect(matchesMiddleware("/playground/embed/assets/icon.svg")).toBe(true);
    expect(matchesMiddleware("/playground/embed/assets/font.woff2")).toBe(true);
  });
});
