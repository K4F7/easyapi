import "server-only";

import { newApiUserRequest } from "./client";
import type {
  NewApiAuth,
  NewApiCreateTokenInput,
  NewApiCreateTokenResult,
  NewApiPage,
  NewApiToken,
  NewApiUpdateTokenInput,
} from "./types";

interface ListTokensParams {
  p?: number;
  size?: number;
}

export function listTokens(
  auth: NewApiAuth,
  params: ListTokensParams = {},
): Promise<NewApiPage<NewApiToken>> {
  return newApiUserRequest<NewApiPage<NewApiToken>>(auth, "/api/token/", {
    query: {
      p: params.p ?? 1,
      size: params.size ?? 10,
    },
  });
}

export function getToken(
  auth: NewApiAuth,
  id: string | number,
): Promise<NewApiToken> {
  return newApiUserRequest<NewApiToken>(auth, `/api/token/${id}`);
}

export async function createToken(
  auth: NewApiAuth,
  input: NewApiCreateTokenInput,
): Promise<NewApiCreateTokenResult> {
  const raw = await newApiUserRequest<unknown>(auth, "/api/token/", {
    method: "POST",
    json: input,
    unwrap: false,
  });

  return parseCreateTokenResult(raw);
}

export function updateToken(
  auth: NewApiAuth,
  input: NewApiUpdateTokenInput,
): Promise<NewApiToken | undefined> {
  return newApiUserRequest<NewApiToken | undefined>(auth, "/api/token/", {
    method: "PUT",
    json: input,
  });
}

export async function deleteToken(
  auth: NewApiAuth,
  id: string | number,
): Promise<void> {
  await newApiUserRequest(auth, `/api/token/${id}`, {
    method: "DELETE",
  });
}

export async function revealTokenKey(
  auth: NewApiAuth,
  id: string | number,
): Promise<string> {
  const data = await newApiUserRequest<unknown>(auth, `/api/token/${id}/key`, {
    method: "POST",
  });

  const key = isRecord(data) ? data.key : undefined;

  if (typeof key !== "string" || key.length === 0) {
    throw new Error("NewAPI did not return a token key");
  }

  return key;
}

export async function createTokenAndRevealKey(
  auth: NewApiAuth,
  input: NewApiCreateTokenInput,
): Promise<NewApiCreateTokenResult> {
  const created = await createToken(auth, input);

  if (created.key) {
    return created;
  }

  const token = created.token ?? (await findNewestTokenByName(auth, input.name));

  if (!token?.id) {
    return created;
  }

  return {
    ...created,
    token,
    key: await revealTokenKey(auth, token.id),
  };
}

function parseCreateTokenResult(raw: unknown): NewApiCreateTokenResult {
  const unwrapped = unwrapData(raw);
  const token = parseToken(unwrapped);
  const key = extractTokenKey(unwrapped) ?? extractTokenKey(raw);

  return {
    token,
    key,
    raw,
  };
}

function parseToken(value: unknown): NewApiToken | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const maybeToken = isRecord(value.token) ? value.token : value;

  if (typeof maybeToken.id !== "number" || typeof maybeToken.name !== "string") {
    return undefined;
  }

  return maybeToken as unknown as NewApiToken;
}

export function extractTokenKey(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const keyName of ["key", "token_key", "tokenKey"]) {
    const valueAtKey = value[keyName];

    if (typeof valueAtKey === "string" && valueAtKey.length > 0) {
      return valueAtKey;
    }
  }

  return isRecord(value.token) ? extractTokenKey(value.token) : undefined;
}

function unwrapData(value: unknown): unknown {
  return isRecord(value) && "data" in value ? value.data : value;
}

async function findNewestTokenByName(
  auth: NewApiAuth,
  name: string,
): Promise<NewApiToken | undefined> {
  const page = await listTokens(auth, { p: 1, size: 100 });

  return page.items.find((token) => token.name === name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
