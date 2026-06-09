import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { agentDiscoveryLinkHeader, wantsMarkdown } from "@/lib/agent-http";
import {
  extractImagePlaygroundSessionToken,
  isImagePlaygroundEmbedPath,
} from "@/lib/playground/image-playground-embed-path";

const SESSION_COOKIE = "portal_session";

/** Files in /public — must bypass auth or <Image src="/..."> returns HTML redirects */
const PUBLIC_STATIC = /\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i;

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/api",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/auth.md",
  "/.well-known",
  "/oauth",
];

const EMBED_DOCUMENT_PATH = /^\/playground\/embed\/?$/;
const EMBED_STATIC_RESOURCE_PATH =
  /^\/playground\/embed\/assets\/.+\.(?:css|js|mjs|map|avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i;

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

function isPlaygroundEmbedDocument(pathname: string): boolean {
  return EMBED_DOCUMENT_PATH.test(pathname);
}

function canUseSignedEmbedReferer(request: NextRequest): boolean {
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    EMBED_STATIC_RESOURCE_PATH.test(request.nextUrl.pathname)
  );
}

function markdownHomeResponse(): NextResponse {
  return new NextResponse(`# EZAPI Portal

EZAPI Portal is a user-facing API console with public read-only discovery metadata for agents.

## Discovery

- API catalog: /.well-known/api-catalog
- Auth instructions: /auth.md
- OAuth authorization server metadata: /.well-known/oauth-authorization-server
- OAuth protected resource metadata: /.well-known/oauth-protected-resource
- MCP server card: /.well-known/mcp/server-card.json
- Agent skills: /.well-known/agent-skills/index.json
- Status: /api/health

## Human workflows

- Login: /login
- Register: /register
- Password reset: /forgot-password
`, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: agentDiscoveryLinkHeader,
      Vary: "Accept",
    },
  });
}

function shouldBlockTopLevelEmbedNavigation(request: NextRequest): boolean {
  const fetchDest = request.headers.get("sec-fetch-dest");
  const fetchMode = request.headers.get("sec-fetch-mode");

  if (fetchDest !== "document" || fetchMode !== "navigate") {
    return false;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return true;
  }

  try {
    const refererPath = new URL(referer).pathname;
    return !refererPath.startsWith("/dashboard/playground");
  } catch {
    return true;
  }
}

function hasSignedEmbedReferer(request: NextRequest): boolean {
  const referer = request.headers.get("referer");
  if (!referer) {
    return false;
  }

  try {
    const refererUrl = new URL(referer);
    return (
      refererUrl.origin === request.nextUrl.origin &&
      isPlaygroundEmbedDocument(refererUrl.pathname) &&
      Boolean(extractImagePlaygroundSessionToken(refererUrl.searchParams))
    );
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (isImagePlaygroundEmbedPath(pathname)) {
    const hasEmbedToken = Boolean(
      extractImagePlaygroundSessionToken(request.nextUrl.searchParams),
    );
    const hasEmbedReferer =
      canUseSignedEmbedReferer(request) && hasSignedEmbedReferer(request);

    if (!hasSession && !hasEmbedToken && !hasEmbedReferer) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    if (
      isPlaygroundEmbedDocument(pathname) &&
      shouldBlockTopLevelEmbedNavigation(request)
    ) {
      return new NextResponse("Not Found", { status: 404 });
    }

    return NextResponse.next();
  }

  if (PUBLIC_STATIC.test(pathname)) {
    return NextResponse.next();
  }

  if (pathname === "/" && wantsMarkdown(request)) {
    return markdownHomeResponse();
  }

  // Allow public paths, APIs, and static assets through. API routes enforce
  // their own authentication so external callbacks do not need browser cookies.
  if (isPublicPath(pathname)) {
    // Session validity is checked in layouts/API routes. Cookie presence alone
    // is not enough (stale cookies after deploy/DB restore caused RSC errors).
    return NextResponse.next();
  }

  // For all other paths (e.g. /dashboard/**), require a session cookie
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/playground/embed/:path*",
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$).*)",
  ],
};
