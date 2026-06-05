import "server-only";

import { createToken, listTokens } from "@/lib/newapi";
import type { NewApiAuth } from "@/lib/newapi/types";

/** 门户自动创建的操练场专用令牌名称（对用户不可见，仅服务端识别）。 */
export const PLAYGROUND_TOKEN_NAME = "操练场";

const PLAYGROUND_TOKEN_LOOKUP_NAMES = new Set([
  PLAYGROUND_TOKEN_NAME,
  "Playground",
]);

export async function ensurePlaygroundTokenId(
  auth: NewApiAuth,
): Promise<number> {
  const page = await listTokens(auth, { p: 1, size: 100 });
  const existing = page.items.find((token) =>
    PLAYGROUND_TOKEN_LOOKUP_NAMES.has(token.name),
  );

  if (existing?.id) {
    return existing.id;
  }

  const created = await createToken(auth, { name: PLAYGROUND_TOKEN_NAME });
  const tokenId = created.token?.id;

  if (typeof tokenId !== "number") {
    throw new Error("Failed to provision playground token");
  }

  return tokenId;
}
