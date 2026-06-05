import "server-only";

import { createToken, listTokens } from "@/lib/newapi";
import type {
  NewApiAuth,
  NewApiCreateTokenInput,
  NewApiToken,
} from "@/lib/newapi/types";

/** 门户自动创建的操练场对话专用令牌名称（对用户不可见，仅服务端识别）。 */
export const PLAYGROUND_CHAT_TOKEN_NAME = "操练场-Chat";
/** 门户自动创建的操练场生图专用令牌名称（对用户不可见，仅服务端识别）。 */
export const PLAYGROUND_IMAGE_TOKEN_NAME = "操练场-Image";

export const PLAYGROUND_IMAGE_MODEL_LIMITS = "gpt-image-2";

const TOKEN_PAGE_SIZE = 100;

export async function ensurePlaygroundTokenId(
  auth: NewApiAuth,
): Promise<number> {
  return ensurePlaygroundChatTokenId(auth);
}

export async function ensurePlaygroundTokenIds(auth: NewApiAuth): Promise<{
  chatTokenId: number;
  imageTokenId: number;
}> {
  const [chatTokenId, imageTokenId] = await Promise.all([
    ensurePlaygroundChatTokenId(auth),
    ensurePlaygroundImageTokenId(auth),
  ]);

  return { chatTokenId, imageTokenId };
}

export async function ensurePlaygroundChatTokenId(
  auth: NewApiAuth,
): Promise<number> {
  return ensurePlaygroundToken(auth, {
    name: PLAYGROUND_CHAT_TOKEN_NAME,
    isQualified: isQualifiedChatToken,
    createInput: {
      name: PLAYGROUND_CHAT_TOKEN_NAME,
      unlimited_quota: true,
      model_limits_enabled: false,
      cross_group_retry: true,
    },
  });
}

export async function ensurePlaygroundImageTokenId(
  auth: NewApiAuth,
): Promise<number> {
  return ensurePlaygroundToken(auth, {
    name: PLAYGROUND_IMAGE_TOKEN_NAME,
    isQualified: isQualifiedImageToken,
    createInput: {
      name: PLAYGROUND_IMAGE_TOKEN_NAME,
      unlimited_quota: true,
      model_limits_enabled: true,
      model_limits: PLAYGROUND_IMAGE_MODEL_LIMITS,
    },
  });
}

async function ensurePlaygroundToken(
  auth: NewApiAuth,
  options: {
    name: string;
    isQualified: (token: NewApiToken) => boolean;
    createInput: NewApiCreateTokenInput;
  },
): Promise<number> {
  const existing = await findUsableTokenByName(
    auth,
    options.name,
    options.isQualified,
  );

  if (existing?.id) {
    return existing.id;
  }

  const created = await createToken(auth, options.createInput);
  const tokenId = created.token?.id;

  if (typeof tokenId !== "number") {
    throw new Error("Failed to provision playground token");
  }

  return tokenId;
}

async function findUsableTokenByName(
  auth: NewApiAuth,
  name: string,
  isQualified: (token: NewApiToken) => boolean,
): Promise<NewApiToken | undefined> {
  let pageNumber = 1;
  let scanned = 0;

  while (true) {
    const page = await listTokens(auth, {
      p: pageNumber,
      size: TOKEN_PAGE_SIZE,
    });
    const items = Array.isArray(page.items) ? page.items : [];
    const found = items.find(
      (token) => token.name === name && isQualified(token),
    );

    if (found) {
      return found;
    }

    scanned += items.length;

    if (
      items.length < TOKEN_PAGE_SIZE ||
      (typeof page.total === "number" && scanned >= page.total)
    ) {
      return undefined;
    }

    pageNumber += 1;
  }
}

function isQualifiedChatToken(token: NewApiToken): boolean {
  return (
    isUsableToken(token) &&
    token.model_limits_enabled !== true &&
    token.cross_group_retry === true
  );
}

function isQualifiedImageToken(token: NewApiToken): boolean {
  return (
    isUsableToken(token) &&
    token.model_limits_enabled === true &&
    modelLimitsOnlyIncludeImageModels(token.model_limits)
  );
}

function isUsableToken(token: NewApiToken): boolean {
  if (token.status !== undefined && token.status !== 1) {
    return false;
  }

  if (token.expired_time !== undefined && token.expired_time > 0) {
    const now = Math.floor(Date.now() / 1000);
    if (token.expired_time <= now) {
      return false;
    }
  }

  if (token.unlimited_quota !== true) {
    return false;
  }

  return true;
}

function modelLimitsOnlyIncludeImageModels(
  modelLimits: string | undefined,
): boolean {
  if (!modelLimits) {
    return false;
  }

  const models = modelLimits
    .split(/[\s,;|]+/)
    .map((model) => model.trim())
    .filter(Boolean);

  return (
    models.length > 0 &&
    models.every(
      (model) => model === "gpt-image-2" || model.startsWith("gpt-image-2"),
    )
  );
}
