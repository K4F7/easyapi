import "server-only";

export const DEFAULT_PLAYGROUND_CHAT_GROUP = "normal";
export const DEFAULT_PLAYGROUND_IMAGE_GROUP = "auto";

const PLAYGROUND_CHAT_GROUP_ENV_KEYS = [
  "PLAYGROUND_CHAT_GROUP",
  "NEWAPI_CHANNEL_GROUP_STANDARD",
  "CHANNEL_TIER_GENERAL_GROUP",
  "NEWAPI_GENERAL_GROUP",
] as const;

const PLAYGROUND_IMAGE_GROUP_ENV_KEYS = [
  "PLAYGROUND_IMAGE_GROUP",
  "NEWAPI_CHANNEL_GROUP_AUTO",
] as const;

export function getPlaygroundChatGroup(): string {
  for (const key of PLAYGROUND_CHAT_GROUP_ENV_KEYS) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return DEFAULT_PLAYGROUND_CHAT_GROUP;
}

export function getPlaygroundImageGroup(): string {
  for (const key of PLAYGROUND_IMAGE_GROUP_ENV_KEYS) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return DEFAULT_PLAYGROUND_IMAGE_GROUP;
}
