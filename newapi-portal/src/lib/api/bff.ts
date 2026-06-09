import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  AuthError,
  decryptSecret,
  jsonError,
  zodErrorResponse,
  type PublicUser,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { getAuthSecret } from "@/lib/env";
import { NewApiError, type NewApiAuth } from "@/lib/newapi";

export type PortalUserForApi = {
  id: string;
  email: string;
  username: string | null;
  inviteCode: string;
  newApiUserId: string | null;
  newApiAccessTokenCiphertext: string | null;
  createdAt: Date;
};

export type UserNewApiAuthResult =
  | {
      ok: true;
      user: PortalUserForApi;
      auth: NewApiAuth;
    }
  | {
      ok: false;
      user: PortalUserForApi;
      code: "NEWAPI_BINDING_PENDING" | "NEWAPI_ACCESS_TOKEN_MISSING";
      message: string;
    };

export async function getPortalUserForApi(
  userId: string,
): Promise<PortalUserForApi> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      inviteCode: true,
      newApiUserId: true,
      newApiAccessTokenCiphertext: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AuthError();
  }

  return user;
}

export async function getUserNewApiAuth(
  publicUser: PublicUser,
): Promise<UserNewApiAuthResult> {
  const user = await getPortalUserForApi(publicUser.id);

  if (!user.newApiUserId) {
    return {
      ok: false,
      user,
      code: "NEWAPI_BINDING_PENDING",
      message: "NewAPI 账号绑定仍在处理中",
    };
  }

  if (!user.newApiAccessTokenCiphertext) {
    return {
      ok: false,
      user,
      code: "NEWAPI_ACCESS_TOKEN_MISSING",
      message: "当前用户缺少 NewAPI 访问凭据",
    };
  }

  const accessToken = await resolveAccessToken(user.newApiAccessTokenCiphertext);

  return {
    ok: true,
    user,
    auth: {
      userId: user.newApiUserId,
      accessToken,
    },
  };
}

export async function resolveAccessToken(ciphertext: string): Promise<string> {
  if (!ciphertext.startsWith("v1:")) {
    return ciphertext;
  }

  return decryptSecret(ciphertext, getAuthSecret());
}

export function publicUserFromPortalUser(user: PortalUserForApi): PublicUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    inviteCode: user.inviteCode,
    newApiUserId: user.newApiUserId,
    newApiBinding: user.newApiUserId ? "ready" : "pending",
    createdAt: user.createdAt.toISOString(),
  };
}

export function handleApiError(error: unknown, fallbackMessage: string) {
  if (error instanceof AuthError) {
    return jsonError(
      {
        code: error.code,
        message: error.message,
      },
      error.status,
    );
  }

  if (error instanceof z.ZodError) {
    return zodErrorResponse(error);
  }

  if (error instanceof NewApiError) {
    console.error(fallbackMessage, sanitizeNewApiErrorForLog(error));

    return jsonError(
      {
        code: "NEWAPI_ERROR",
        message: "上游 NewAPI 请求失败",
        details: {
          status: error.status,
          code: error.code,
        },
      },
      502,
    );
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return jsonError(
      {
        code: "CONFLICT",
        message: "记录已存在，请检查后重试",
      },
      409,
    );
  }

  console.error(fallbackMessage, sanitizeErrorForLog(error));
  return jsonError(
    {
      code: "INTERNAL_ERROR",
      message: fallbackMessage,
    },
    500,
  );
}

export function sanitizeNewApiErrorForLog(error: NewApiError) {
  return {
    name: error.name,
    status: error.status,
    statusText: error.statusText,
    code: error.code,
  };
}

function sanitizeErrorForLog(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      code: getSafeErrorCode(error),
    };
  }

  return {
    type: typeof error,
  };
}

function getSafeErrorCode(error: Error): unknown {
  if (!("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ||
    typeof code === "number" ||
    typeof code === "boolean"
    ? code
    : undefined;
}

export function parsePositiveInt(
  value: string | null,
  fallback: number,
  max: number,
): number {
  const parsed = value ? Number(value) : fallback;

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

export function parseOptionalInt(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function maskSecret(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 10) {
    return `${value.slice(0, 2)}...${value.slice(-2)}`;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function getRequestBaseUrl(request: Request): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedHost) {
    return `${forwardedProto ?? "https"}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}
