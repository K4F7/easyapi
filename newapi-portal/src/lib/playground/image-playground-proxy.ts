import "server-only";

import {
  IMAGE_PLAYGROUND_EMBED_PATH,
  extractImagePlaygroundSessionToken,
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

const browserNavigationHeaders = new Set([
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-user",
  "upgrade-insecure-requests",
]);

const relativeStaticAssetPath =
  /^(?:\.{1,2}\/)?assets\/.+\.(?:css|js|mjs|map|avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i;

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

  const headers = sanitizeProxyRequestHeaders(request.headers);

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

  const mediaType = getNormalizedMediaType(
    upstreamResponse.headers.get("content-type"),
  );
  if (mediaType === "text/html") {
    const html = await upstreamResponse.text();
    const rewritten = rewritePlaygroundEmbedHtml(
      html,
      extractImagePlaygroundSessionToken(requestUrl.searchParams),
    );
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

export function rewritePlaygroundEmbedHtml(
  html: string,
  sessionToken: string | null = null,
): string {
  const baseHref = buildEmbedBaseHref(sessionToken);
  const lightThemeTags = [
    '<meta name="color-scheme" content="light">',
    '<meta name="theme-color" content="#f9fafb">',
    '<script id="ezapi-embed-light-theme-state">(function(){try{var d=document.documentElement;d.dataset.theme="light";d.classList.remove("dark");d.classList.add("light");localStorage.setItem("theme","light");localStorage.setItem("color-theme","light");localStorage.setItem("vite-ui-theme","light");sessionStorage.setItem("theme","light");var strip=function(root){if(!root||!root.querySelectorAll)return;var nodes=[root].concat(Array.prototype.slice.call(root.querySelectorAll("[class*=dark\\\\:]")));nodes.forEach(function(el){if(!el.className||typeof el.className!=="string")return;var next=el.className.split(/\\s+/).filter(function(name){return name.indexOf("dark:")!==0}).join(" ");if(next!==el.className)el.className=next;});};var observe=function(){strip(document.body);new MutationObserver(function(records){records.forEach(function(record){if(record.type==="attributes"){strip(record.target)}else{record.addedNodes.forEach(strip)}})}).observe(document.body,{attributes:true,attributeFilter:["class"],childList:true,subtree:true});};if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",observe,{once:true})}else{observe()}}catch(e){}})();</script>',
    '<style id="ezapi-embed-light-theme">:root{color-scheme:light}html:not(.dark),html.light,html[data-theme="light"]{color-scheme:light}html.light body,html[data-theme="light"] body{background:#f9fafb!important;color:#111827!important}</style>',
  ].join("");

  if (!/<base\s/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
  }

  if (!/ezapi-embed-light-theme/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${lightThemeTags}`);
  }

  if (sessionToken) {
    html = appendSessionTokenToRelativeAssetReferences(html, sessionToken);
  }

  return html;
}

function buildEmbedBaseHref(sessionToken: string | null): string {
  if (!sessionToken) {
    return `${IMAGE_PLAYGROUND_EMBED_PATH}/`;
  }

  const params = new URLSearchParams({ apiKey: sessionToken });
  return `${IMAGE_PLAYGROUND_EMBED_PATH}/?${params.toString()}`;
}

function appendSessionTokenToRelativeAssetReferences(
  html: string,
  sessionToken: string,
): string {
  return html.replace(
    /\b(src|href)=(["'])([^"']+)\2/gi,
    (match, attribute: string, quote: string, value: string) => {
      if (!isRelativeAssetReference(value)) {
        return match;
      }

      const [path, hash = ""] = value.split("#", 2);
      const [pathname, search = ""] = path.split("?", 2);
      const params = new URLSearchParams(search);
      if (!params.has("apiKey") && !params.has("playgroundSessionToken")) {
        params.set("apiKey", sessionToken);
      }

      const query = params.toString();
      return `${attribute}=${quote}${pathname}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}${quote}`;
    },
  );
}

function isRelativeAssetReference(value: string): boolean {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:|mailto:|tel:)/i.test(value)) {
    return false;
  }

  const [path] = value.split(/[?#]/, 1);
  return relativeStaticAssetPath.test(path);
}

function sanitizeProxyRequestHeaders(headers: Headers): Headers {
  const sanitized = new Headers(headers);

  sanitized.delete("host");
  browserNavigationHeaders.forEach((header) => sanitized.delete(header));
  sanitized.set("user-agent", "EZAPI-Portal/ImagePlaygroundProxy");

  return sanitized;
}

function getNormalizedMediaType(contentType: string | null): string {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
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
