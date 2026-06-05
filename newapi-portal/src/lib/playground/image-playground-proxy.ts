import "server-only";

import {
  IMAGE_PLAYGROUND_EMBED_PATH,
} from "@/lib/playground/image-playground-embed-path";

export {
  extractImagePlaygroundSessionToken,
  hasImagePlaygroundSessionTokenQuery,
  IMAGE_PLAYGROUND_EMBED_PATH,
  isImagePlaygroundEmbedPath,
} from "@/lib/playground/image-playground-embed-path";

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export function isImagePlaygroundProxyConfigured(): boolean {
  return Boolean(getImagePlaygroundInternalUrl());
}

export function getImagePlaygroundInternalUrl(): string | null {
  const value = process.env.IMAGE_PLAYGROUND_INTERNAL_URL?.trim();
  return value || null;
}

export async function proxyImagePlaygroundRequest(
  request: Request,
  pathSegments: string[] | undefined,
): Promise<Response> {
  const internalBase = getImagePlaygroundInternalUrl();
  if (!internalBase) {
    return new Response(
      "Image playground proxy is not configured. Set IMAGE_PLAYGROUND_INTERNAL_URL on the Portal server.",
      {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }

  const requestUrl = new URL(request.url);
  const upstreamBase = new URL(
    internalBase.endsWith("/") ? internalBase : `${internalBase}/`,
  );
  const subpath = pathSegments?.join("/") ?? "";
  const upstreamUrl = new URL(subpath, upstreamBase);
  upstreamUrl.search = requestUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  const upstreamResponse = await fetch(upstreamUrl, init);
  const responseHeaders = sanitizeProxyResponseHeaders(upstreamResponse.headers);
  applyEmbedSecurityHeaders(responseHeaders);
  rewriteProxyLocationHeader(responseHeaders, requestUrl.origin);

  const contentType = upstreamResponse.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    const html = await upstreamResponse.text();
    const rewritten = rewritePlaygroundEmbedHtml(html);
    responseHeaders.delete("content-length");
    return new Response(rewritten, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export function rewritePlaygroundEmbedHtml(html: string): string {
  const baseHref = `${IMAGE_PLAYGROUND_EMBED_PATH}/`;
  if (!/<base\s/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
  }

  return html;
}

function applyEmbedSecurityHeaders(headers: Headers) {
  headers.set("Content-Security-Policy", "frame-ancestors 'self'");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Referrer-Policy", "no-referrer");
}

function sanitizeProxyResponseHeaders(headers: Headers): Headers {
  const sanitized = new Headers();

  headers.forEach((value, key) => {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      sanitized.set(key, value);
    }
  });

  sanitized.delete("content-encoding");
  sanitized.delete("content-length");
  return sanitized;
}

function rewriteProxyLocationHeader(headers: Headers, publicOrigin: string) {
  const location = headers.get("location");
  if (!location) {
    return;
  }

  try {
    const resolved = new URL(location, publicOrigin);
    if (resolved.origin !== publicOrigin) {
      return;
    }

    const pathname = resolved.pathname.startsWith(IMAGE_PLAYGROUND_EMBED_PATH)
      ? resolved.pathname
      : `${IMAGE_PLAYGROUND_EMBED_PATH}${resolved.pathname.startsWith("/") ? "" : "/"}${resolved.pathname}`;
    resolved.pathname = pathname;
    headers.set("location", `${resolved.pathname}${resolved.search}`);
  } catch {
    if (location.startsWith("/") && !location.startsWith(IMAGE_PLAYGROUND_EMBED_PATH)) {
      headers.set("location", `${IMAGE_PLAYGROUND_EMBED_PATH}${location}`);
    }
  }
}
