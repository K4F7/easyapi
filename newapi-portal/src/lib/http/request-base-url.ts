import "server-only";

export function getRequestBaseUrl(request: Request): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedHost) {
    const proto = forwardedProto?.split(",")[0]?.trim() || "https";
    const host = forwardedHost.split(",")[0]?.trim();
    if (host) {
      return `${proto}://${host}`;
    }
  }

  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    try {
      return new URL(appUrl).origin;
    } catch {
      // Fall back to the request URL when APP_URL is misconfigured.
    }
  }

  return new URL(request.url).origin;
}
