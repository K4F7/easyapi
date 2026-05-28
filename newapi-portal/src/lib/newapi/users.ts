import "server-only";

import { newApiAdminRequest, newApiUserRequest } from "./client";
import type {
  NewApiAdminAddQuotaInput,
  NewApiAdminCreateUserInput,
  NewApiAdminCreateUserResult,
  NewApiAuth,
  NewApiManageUserResult,
  NewApiUserSelf,
} from "./types";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
