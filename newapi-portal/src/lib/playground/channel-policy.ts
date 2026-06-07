import "server-only";

export const DEFAULT_PLAYGROUND_CHAT_GROUP = "auto";

const PLAYGROUND_CHAT_GROUP_ENV_KEYS = [
  "PLAYGROUND_CHAT_GROUP",
  "CHANNEL_TIER_GENERAL_GROUP",
  "NEWAPI_GENERAL_GROUP",
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
