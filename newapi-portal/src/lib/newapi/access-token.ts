import "server-only";

import { newApiUserRequest } from "./client";
import type { NewApiAuth } from "./types";

export async function refreshUserAccessToken(auth: NewApiAuth): Promise<string> {
  const payload = await newApiUserRequest<unknown>(auth, "/api/user/token", {
    unwrap: false,
  });
  const accessToken = extractAccessToken(payload);

  if (!accessToken) {
    throw new Error("NewAPI access token refresh response did not include a token");
  }

  return accessToken;
}

export function extractAccessToken(payload: unknown): string | null {
  if (typeof payload === "string" && payload.length > 0) {
    return payload;
  }

  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.data === "string" && payload.data.length > 0) {
    return payload.data;
  }

  for (const key of ["access_token", "accessToken", "token"]) {
    const value = payload[key];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  for (const key of ["data", "user"]) {
    const value = payload[key];

    if (isRecord(value)) {
      const token = extractAccessToken(value);

      if (token) {
        return token;
      }
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
