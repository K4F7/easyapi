export const PLAYGROUND_CHAT_TOKEN_NAME = "操练场-Chat";
export const PLAYGROUND_IMAGE_TOKEN_NAME = "操练场-Image";
export const LEGACY_PLAYGROUND_TOKEN_NAME = "Playground";

const PLAYGROUND_TOKEN_NAMES = new Set([
  PLAYGROUND_CHAT_TOKEN_NAME,
  PLAYGROUND_IMAGE_TOKEN_NAME,
  LEGACY_PLAYGROUND_TOKEN_NAME,
]);

export function isManagedPlaygroundTokenName(name: string): boolean {
  return PLAYGROUND_TOKEN_NAMES.has(name);
}

export function isManagedPlaygroundToken(token: { name?: string }): boolean {
  return typeof token.name === "string" && isManagedPlaygroundTokenName(token.name);
}
