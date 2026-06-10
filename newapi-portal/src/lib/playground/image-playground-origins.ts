import "server-only";

import { getRequestBaseUrl } from "@/lib/http/request-base-url";

export type ImageEmbedTarget = "proxy";

export function getPortalOrigin(request: Request): string {
  return getRequestBaseUrl(request);
}

export function resolveImageEmbedTarget(
  requested?: ImageEmbedTarget,
): ImageEmbedTarget {
  return requested ?? "proxy";
}

export function resolveSessionOrigins(
  request: Request,
  _embedTarget: ImageEmbedTarget,
): {
  portalOrigin: string;
  playgroundOrigin: string;
} {
  const portalOrigin = getPortalOrigin(request);

  return {
    portalOrigin,
    playgroundOrigin: portalOrigin,
  };
}
