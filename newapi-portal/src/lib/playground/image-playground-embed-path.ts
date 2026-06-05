/** Same-origin path where the image playground SPA is proxied. */
export const IMAGE_PLAYGROUND_EMBED_PATH = "/playground/embed";

const imageSessionTokenPrefix = "portal-image-session-v1.";

export function isImagePlaygroundEmbedPath(pathname: string): boolean {
  return (
    pathname === IMAGE_PLAYGROUND_EMBED_PATH ||
    pathname.startsWith(`${IMAGE_PLAYGROUND_EMBED_PATH}/`)
  );
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
