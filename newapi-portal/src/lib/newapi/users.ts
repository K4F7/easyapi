import "server-only";

import { getNewApiConfig, NewApiError, newApiAdminRequest, newApiUserRequest } from "./client";
import type {
  NewApiAdminAddQuotaInput,
  NewApiAdminCreateUserInput,
  NewApiAdminCreateUserResult,
  NewApiAuth,
  NewApiManageUserResult,
  NewApiUserSelf,
} from "./types";

interface NewApiLoginInput {
  username: string;
  password: string;
}

export interface NewApiLoginResult {
  id?: number;
  username: string;
  displayName?: string;
  accessToken?: string;
  raw?: unknown;
}

export async function adminCreateUser(
  input: NewApiAdminCreateUserInput,
): Promise<NewApiAdminCreateUserResult> {
  const displayName = input.display_name ?? input.displayName ?? input.username;
  const raw = await newApiAdminRequest<unknown>("/api/user/", {
    method: "POST",
    json: {
      username: input.username,
      password: input.password,
      display_name: displayName,
      role: input.role ?? 1,
    },
    unwrap: false,
  });
  const parsed = parseCreatedUser(raw);

  return {
    id: parsed.id,
    username: parsed.username ?? input.username,
    displayName: parsed.displayName ?? displayName,
    accessToken: parsed.accessToken,
    raw,
  };
}

export async function adminAddQuota(
  input: NewApiAdminAddQuotaInput,
): Promise<NewApiManageUserResult> {
  const data = await newApiAdminRequest<unknown>("/api/user/manage", {
    method: "POST",
    json: {
      id: Number(input.userId),
      action: "add_quota",
      mode: input.mode ?? "add",
      value: input.value,
    },
  });

  return { success: true, data };
}

export function getSelf(auth: NewApiAuth): Promise<NewApiUserSelf> {
  return newApiUserRequest<NewApiUserSelf>(auth, "/api/user/self");
}

export async function loginUser(
  input: NewApiLoginInput,
): Promise<NewApiLoginResult> {
  const login = await newApiRawRequest("/api/user/login", {
    method: "POST",
    json: {
      username: input.username,
      password: input.password,
    },
  });
  const parsed = parseLoginUser(login.payload, input.username);

  const accessToken = parsed.accessToken ??
    (login.cookie && parsed.id !== undefined
      ? await fetchAccessToken(login.cookie, parsed.id)
      : undefined);

  return {
    id: parsed.id,
    username: parsed.username ?? input.username,
    displayName: parsed.displayName,
    accessToken,
    raw: login.payload,
  };
}

async function fetchAccessToken(
  cookie: string,
  userId: number,
): Promise<string | undefined> {
  const token = await newApiRawRequest("/api/user/token", {
    method: "GET",
    headers: {
      Cookie: cookie,
      "New-Api-User": String(userId),
    },
  });

  return pickStringFromPayload(token.payload, [
    "data",
    "access_token",
    "accessToken",
    "token",
  ]);
}

function parseCreatedUser(raw: unknown): {
  id?: number;
  username?: string;
  displayName?: string;
  accessToken?: string;
} {
  if (!isRecord(raw)) {
    return {};
  }

  const user = findUserRecord(raw);
  const dataToken = typeof raw.data === "string" ? raw.data : undefined;
  const accessToken = pickString(raw, [
    "access_token",
    "accessToken",
    "token",
  ]);

  return {
    id: pickNumber(user, ["id", "user_id", "userId"]),
    username: pickString(user, ["username"]),
    displayName: pickString(user, ["display_name", "displayName"]),
    accessToken: dataToken ??
      accessToken ??
      pickString(user, ["access_token", "accessToken", "token"]),
  };
}

function parseLoginUser(raw: unknown, fallbackUsername: string): {
  id?: number;
  username?: string;
  displayName?: string;
  accessToken?: string;
  require2fa: boolean;
} {
  if (!isRecord(raw)) {
    return { username: fallbackUsername, require2fa: false };
  }

  const user = findUserRecord(raw);

  return {
    id: pickNumber(user, ["id", "user_id", "userId"]),
    username: pickString(user, ["username"]) ?? fallbackUsername,
    displayName: pickString(user, ["display_name", "displayName"]),
    accessToken: pickStringFromPayload(raw, [
      "access_token",
      "accessToken",
      "token",
    ]) ?? pickString(user, ["access_token", "accessToken", "token"]),
    require2fa: pickBoolean(user, ["require_2fa", "require2fa"]) ??
      pickBoolean(raw, ["require_2fa", "require2fa"]) ??
      false,
  };
}

function findUserRecord(raw: Record<string, unknown>): Record<string, unknown> {
  for (const key of ["user", "data"]) {
    const value = raw[key];

    if (isRecord(value)) {
      return value;
    }
  }

  return raw;
}

function pickString(
  source: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function pickNumber(
  source: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const numberValue = Number(value);

      if (Number.isFinite(numberValue)) {
        return numberValue;
      }
    }
  }

  return undefined;
}

function pickBoolean(
  source: Record<string, unknown>,
  keys: string[],
): boolean | undefined {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
}

function pickStringFromPayload(
  payload: unknown,
  keys: string[],
): string | undefined {
  if (!isRecord(payload)) {
    return typeof payload === "string" && payload.length > 0 ? payload : undefined;
  }

  const direct = pickString(payload, keys);

  if (direct) {
    return direct;
  }

  for (const key of ["data", "user"]) {
    const nested = payload[key];

    if (isRecord(nested)) {
      const nestedValue = pickString(nested, keys);

      if (nestedValue) {
        return nestedValue;
      }
    }
  }

  return undefined;
}

async function newApiRawRequest(
  path: string,
  options: {
    method: string;
    headers?: HeadersInit;
    json?: unknown;
  },
): Promise<{ payload: unknown; cookie?: string }> {
  const { baseUrl } = getNewApiConfig();
  const requestHeaders = new Headers(options.headers);

  if (options.json !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
    cache: "no-store",
    headers: requestHeaders,
  });
  const payload = await parseRawResponseBody(response);

  if (!response.ok || isFailedEnvelope(payload)) {
    throw new NewApiError(extractMessage(payload) ?? response.statusText, {
      status: response.status,
      statusText: response.statusText,
      code: isRecord(payload) ? payload.code as string | number | boolean | undefined : undefined,
      payload,
    });
  }

  return {
    payload,
    cookie: normalizeSetCookieHeader(response.headers.get("set-cookie")),
  };
}

function normalizeSetCookieHeader(setCookie: string | null): string | undefined {
  if (!setCookie) {
    return undefined;
  }

  const cookie = setCookie
    .split(/,(?=\s*[^;,]+=)/)
    .map((value) => value.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");

  return cookie || undefined;
}

async function parseRawResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isFailedEnvelope(payload: unknown): boolean {
  return isRecord(payload) && payload.success === false;
}

function extractMessage(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return typeof payload === "string" ? payload : undefined;
  }

  const message = payload.message ?? payload.error ?? payload.msg;
  return typeof message === "string" ? message : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
