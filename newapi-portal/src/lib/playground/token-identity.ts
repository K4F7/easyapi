export const PLAYGROUND_CHAT_TOKEN_NAME = "操练场-Chat";
export const PLAYGROUND_IMAGE_TOKEN_NAME = "操练场-Image";
export const LEGACY_PLAYGROUND_TOKEN_NAME = "Playground";

export const PLAYGROUND_TOKEN_NAMES = [
  PLAYGROUND_CHAT_TOKEN_NAME,
  PLAYGROUND_IMAGE_TOKEN_NAME,
  LEGACY_PLAYGROUND_TOKEN_NAME,
] as const;

const playgroundTokenNameSet = new Set<string>(PLAYGROUND_TOKEN_NAMES);

export function isManagedPlaygroundTokenName(name: string): boolean {
  return playgroundTokenNameSet.has(name);
}

export function isManagedPlaygroundToken(token: { name?: string }): boolean {
  return typeof token.name === "string" && isManagedPlaygroundTokenName(token.name);
}
