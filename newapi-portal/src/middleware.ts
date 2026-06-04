import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "portal_session";

/** Files in /public — must bypass auth or <Image src="/..."> returns HTML redirects */
const PUBLIC_STATIC = /\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i;

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/api",
  "/_next",
  "/favicon.ico",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

function isAuthPage(pathname: string): boolean {
  return pathname === "/login" || pathname === "/register";
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_STATIC.test(pathname)) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has(SESSION_COOKIE);

  // Allow public paths, APIs, and static assets through. API routes enforce
  // their own authentication so external callbacks do not need browser cookies.
  if (isPublicPath(pathname)) {
    // Redirect authenticated users away from login/register to dashboard
    if (hasSession && isAuthPage(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
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
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$).*)",
  ],
};
