/** Same-origin path where the image playground SPA is proxied. */
export const IMAGE_PLAYGROUND_EMBED_PATH = "/playground/embed";

export const IMAGE_PLAYGROUND_CONFIG_STORAGE_KEY =
  "portal-image-playground-config";

/** Query params injected once into the embed iframe URL (portal image-panel). */
export const IMAGE_PLAYGROUND_EMBED_QUERY_PARAMS = [
  "apiUrl",
  "apiKey",
  "imageApiUrl",
  "baseUrl",
  "tokenId",
  "portalTokenId",
  "theme",
  "model",
] as const;

export type ImagePlaygroundEmbedQueryParam =
  (typeof IMAGE_PLAYGROUND_EMBED_QUERY_PARAMS)[number];

export type ImagePlaygroundEmbedConfig = Partial<
  Record<ImagePlaygroundEmbedQueryParam, string>
>;

const imageSessionTokenPrefix = "portal-image-session-v1.";

/** Client-side TTL mirror of `imageSessionTokenTtlSeconds` on the server. */
export const imagePlaygroundSessionTokenTtlMs = 10 * 60 * 1000;

export const PORTAL_TOKEN_MARKER_PREFIX = "portal-token-";

export function buildPortalTokenMarker(tokenId: number | string): string {
  return `${PORTAL_TOKEN_MARKER_PREFIX}${tokenId}`;
}

export function parsePortalTokenMarker(
  value: string | null | undefined,
): number | null {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith(PORTAL_TOKEN_MARKER_PREFIX)) {
    return null;
  }

  const tokenId = Number(trimmed.slice(PORTAL_TOKEN_MARKER_PREFIX.length));
  return Number.isInteger(tokenId) && tokenId > 0 ? tokenId : null;
}

export function isPortalTokenMarker(value: string | null | undefined): boolean {
  return parsePortalTokenMarker(value) !== null;
}

export function isImagePlaygroundEmbedPath(pathname: string): boolean {
  return (
    pathname === IMAGE_PLAYGROUND_EMBED_PATH ||
    pathname.startsWith(`${IMAGE_PLAYGROUND_EMBED_PATH}/`)
  );
}

export function extractEmbedConfigFromSearchParams(
  searchParams: URLSearchParams,
): ImagePlaygroundEmbedConfig {
  const config: ImagePlaygroundEmbedConfig = {};

  for (const key of IMAGE_PLAYGROUND_EMBED_QUERY_PARAMS) {
    const value = searchParams.get(key)?.trim();
    if (value) {
      config[key] = value;
    }
  }

  const sessionToken =
    searchParams.get("playgroundSessionToken")?.trim() ||
    searchParams.get("apiKey")?.trim();
  if (sessionToken && !config.apiKey) {
    config.apiKey = sessionToken;
  }

  return config;
}

export function extractImagePlaygroundSessionToken(
  searchParams: URLSearchParams,
): string | null {
  const token =
    searchParams.get("playgroundSessionToken")?.trim() ||
    searchParams.get("apiKey")?.trim() ||
    null;

  if (!token?.startsWith(imageSessionTokenPrefix)) {
    return null;
  }

  return token;
}

export function hasImagePlaygroundSessionTokenQuery(
  searchParams: URLSearchParams,
): boolean {
  return extractImagePlaygroundSessionToken(searchParams) !== null;
}
