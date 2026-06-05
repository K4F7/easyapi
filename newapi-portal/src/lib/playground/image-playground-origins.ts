import "server-only";

import { isImagePlaygroundProxyConfigured } from "@/lib/playground/image-playground-proxy";

export type ImageEmbedTarget = "proxy" | "external";

export function getPortalOrigin(request: Request): string {
  return new URL(request.url).origin;
}

export function parseConfiguredOrigins(
  value: string | undefined,
  requestOrigin: string,
): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      try {
        return new URL(item, requestOrigin).origin;
      } catch {
        return null;
      }
    })
    .filter((origin): origin is string => origin !== null);
}

export function getConfiguredPlaygroundOrigins(
  requestOrigin: string,
): string[] {
  const origins = new Set<string>();

  for (const envKey of [
    "IMAGE_PLAYGROUND_ALLOWED_ORIGIN",
    "IMAGE_PLAYGROUND_URL",
    "NEXT_PUBLIC_IMAGE_PLAYGROUND_URL",
  ] as const) {
    for (const origin of parseConfiguredOrigins(
      process.env[envKey],
      requestOrigin,
    )) {
      origins.add(origin);
    }
  }

  return [...origins];
}

export function isConfiguredPlaygroundOriginAllowed(
  origin: string,
  requestOrigin: string,
): boolean {
  const allowedOrigins = getConfiguredPlaygroundOrigins(requestOrigin);
  return allowedOrigins.length > 0 && allowedOrigins.includes(origin);
}

export function resolveImageEmbedTarget(
  requested?: ImageEmbedTarget,
): ImageEmbedTarget {
  if (requested) {
    return requested;
  }

  return isImagePlaygroundProxyConfigured() ? "proxy" : "external";
}

export function resolveSessionOrigins(
  request: Request,
  embedTarget: ImageEmbedTarget,
): {
  portalOrigin: string;
  playgroundOrigin: string;
} {
  const portalOrigin = getPortalOrigin(request);

  if (embedTarget === "proxy") {
    return {
      portalOrigin,
      playgroundOrigin: portalOrigin,
    };
  }

  const configuredOrigins = getConfiguredPlaygroundOrigins(portalOrigin);
  const playgroundOrigin = configuredOrigins[0];

  if (!playgroundOrigin) {
    throw new Error(
      "External image playground origin is not configured. Set IMAGE_PLAYGROUND_ALLOWED_ORIGIN or NEXT_PUBLIC_IMAGE_PLAYGROUND_URL.",
    );
  }

  return {
    portalOrigin,
    playgroundOrigin,
  };
}
