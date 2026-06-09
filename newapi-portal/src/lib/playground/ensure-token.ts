import "server-only";

import { createToken, listTokens, updateToken } from "@/lib/newapi";
import type {
  NewApiAuth,
  NewApiCreateTokenInput,
  NewApiToken,
} from "@/lib/newapi/types";
import {
  PLAYGROUND_CHAT_TOKEN_NAME,
  PLAYGROUND_IMAGE_TOKEN_NAME,
} from "@/lib/playground/token-identity";
import { getPlaygroundChatGroup, getPlaygroundImageGroup } from "@/lib/playground/channel-policy";

export { PLAYGROUND_CHAT_TOKEN_NAME, PLAYGROUND_IMAGE_TOKEN_NAME };

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
  const group = getPlaygroundChatGroup();

  return ensurePlaygroundToken(auth, {
    name: PLAYGROUND_CHAT_TOKEN_NAME,
    isQualified: isQualifiedChatToken,
    canUpdate: (token) => isUsableToken(token),
    createInput: {
      name: PLAYGROUND_CHAT_TOKEN_NAME,
      unlimited_quota: true,
      model_limits_enabled: false,
      group,
    },
  });
}

export async function ensurePlaygroundImageTokenId(
  auth: NewApiAuth,
): Promise<number> {
  const group = getPlaygroundImageGroup();

  return ensurePlaygroundToken(auth, {
    name: PLAYGROUND_IMAGE_TOKEN_NAME,
    isQualified: isQualifiedImageToken,
    canUpdate: (token) => isUsableToken(token),
    createInput: {
      name: PLAYGROUND_IMAGE_TOKEN_NAME,
      unlimited_quota: true,
      model_limits_enabled: false,
      group,
    },
  });
}

async function ensurePlaygroundToken(
  auth: NewApiAuth,
  options: {
    name: string;
    isQualified: (token: NewApiToken) => boolean;
    canUpdate?: (token: NewApiToken) => boolean;
    createInput: NewApiCreateTokenInput;
  },
): Promise<number> {
  const existing = await findPlaygroundTokenCandidate(auth, {
    name: options.name,
    isQualified: options.isQualified,
    canUpdate: options.canUpdate,
  });

  if (existing.qualified?.id) {
    return existing.qualified.id;
  }

  if (existing.updatable?.id) {
    await updateToken(auth, {
      id: existing.updatable.id,
      ...options.createInput,
    });

    return existing.updatable.id;
  }

  const created = await createToken(auth, options.createInput);
  const tokenId = created.token?.id;

  if (typeof tokenId !== "number") {
    throw new Error("Failed to provision playground token");
  }

  return tokenId;
}

async function findPlaygroundTokenCandidate(
  auth: NewApiAuth,
  options: {
    name: string;
    isQualified: (token: NewApiToken) => boolean;
    canUpdate?: (token: NewApiToken) => boolean;
  },
): Promise<{
  qualified?: NewApiToken;
  updatable?: NewApiToken;
}> {
  let pageNumber = 1;
  let scanned = 0;
  let updatable: NewApiToken | undefined;

  while (true) {
    const page = await listTokens(auth, {
      p: pageNumber,
      size: TOKEN_PAGE_SIZE,
    });
    const items = Array.isArray(page.items) ? page.items : [];

    for (const token of items) {
      if (token.name !== options.name) {
        continue;
      }

      if (options.isQualified(token)) {
        return { qualified: token };
      }

      if (!updatable && options.canUpdate?.(token)) {
        updatable = token;
      }
    }

    scanned += items.length;

    if (
      items.length < TOKEN_PAGE_SIZE ||
      (typeof page.total === "number" && scanned >= page.total)
    ) {
      return { updatable };
    }

    pageNumber += 1;
  }
}

function isQualifiedChatToken(token: NewApiToken): boolean {
  return (
    isUsableToken(token) &&
    token.model_limits_enabled !== true &&
    token.group === getPlaygroundChatGroup()
  );
}

function isQualifiedImageToken(token: NewApiToken): boolean {
  return (
    isUsableToken(token) &&
    token.model_limits_enabled !== true &&
    token.group === getPlaygroundImageGroup()
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

