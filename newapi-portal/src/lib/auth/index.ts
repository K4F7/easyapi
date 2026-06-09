import "server-only";

import { randomBytes, createHmac, createHash } from "node:crypto";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { PrismaClient, User } from "@prisma/client";
import { z } from "zod";

import { getMockSessionToken, getMockUser } from "@/lib/dev-mock/store";
import { isDevMockEnabled } from "@/lib/dev-mock/guard";
import { getAuthSecret } from "@/lib/env";

export { encryptSecret, decryptSecret } from "./crypto";

export const authRoutes = {
  login: "/login",
  register: "/register",
  dashboard: "/dashboard",
} as const;

export const sessionCookieName = "portal_session";
export const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;

const passwordHashRounds = 12;

type DbClient = PrismaClient;

export type PublicUser = {
  id: string;
  email: string;
  inviteCode: string;
  newApiUserId: string | null;
  newApiBinding: "ready" | "pending";
  createdAt: string;
};

export class AuthError extends Error {
  readonly status = 401;
  readonly code = "UNAUTHORIZED";

  constructor(message = "请先登录后再继续操作") {
    super(message);
    this.name = "AuthError";
  }
}

export function toPublicUser(user: Pick<User, "id" | "email" | "inviteCode" | "newApiUserId" | "createdAt">): PublicUser {
  return {
    id: user.id,
    email: user.email,
    inviteCode: user.inviteCode,
    newApiUserId: user.newApiUserId,
    newApiBinding: user.newApiUserId ? "ready" : "pending",
    createdAt: user.createdAt.toISOString(),
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, passwordHashRounds);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function generateInviteCode(): string {
  return randomBytes(6).toString("base64url").toUpperCase();
}

function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** @deprecated Use hashSessionTokenWithSecret for new sessions. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashSessionTokenWithSecret(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

function sessionCookieOptions(expiresAt?: Date, request?: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureSessionCookie(request),
    path: "/",
    maxAge: sessionMaxAgeSeconds,
    expires: expiresAt,
  };
}

function shouldUseSecureSessionCookie(request?: Request): boolean {
  const appUrl = process.env.APP_URL;

  if (appUrl) {
    try {
      return new URL(appUrl).protocol === "https:";
    } catch {
      return process.env.NODE_ENV === "production";
    }
  }

  if (request) {
    const forwardedProto = request.headers.get("x-forwarded-proto");

    if (forwardedProto) {
      return forwardedProto.split(",")[0]?.trim() === "https";
    }

    return new URL(request.url).protocol === "https:";
  }

  return process.env.NODE_ENV === "production";
}

export async function createSession(
  userId: string,
  request?: Request,
): Promise<{ expiresAt: Date }> {
  if (isDevMockEnabled()) {
    const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000);
    const cookieStore = await cookies();
    cookieStore.set(
      sessionCookieName,
      getMockSessionToken(),
      sessionCookieOptions(expiresAt, request),
    );

    return { expiresAt };
  }

  const token = generateSessionToken();
  const AUTH_SECRET = getAuthSecret();
  const db = await getDb();
  const tokenHash = hashSessionTokenWithSecret(token, AUTH_SECRET);
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000);

  await db.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(
    sessionCookieName,
    token,
    sessionCookieOptions(expiresAt, request),
  );

  return { expiresAt };
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();

  if (isDevMockEnabled()) {
    cookieStore.delete(sessionCookieName);
    return;
  }

  const token = cookieStore.get(sessionCookieName)?.value;

  if (token) {
    const AUTH_SECRET = getAuthSecret();
    const db = await getDb();
    await db.session.updateMany({
      where: {
        tokenHash: {
          in: [hashSessionTokenWithSecret(token, AUTH_SECRET), hashSessionToken(token)],
        },
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  cookieStore.delete(sessionCookieName);
}

/** Clear the session cookie from Route Handlers or Server Actions only. */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  if (isDevMockEnabled()) {
    return token === getMockSessionToken() ? getMockUser() : null;
  }

  const AUTH_SECRET = getAuthSecret();
  const db = await getDb();

  const session = await db.session.findFirst({
    where: {
      tokenHash: {
        in: [hashSessionTokenWithSecret(token, AUTH_SECRET), hashSessionToken(token)],
      },
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: true,
    },
  });

  if (!session) {
    // Do not mutate cookies here: getCurrentUser runs in Server Components
    // (e.g. dashboard layout). cookies().delete() must stay in Route Handlers.
    return null;
  }

  await db.session.update({
    where: {
      id: session.id,
    },
    data: {
      lastSeenAt: new Date(),
    },
  });

  return toPublicUser(session.user);
}

export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthError();
  }

  return user;
}

type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<{ ok: true; data: T }> {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(error: ApiError, status = 400): NextResponse<{ ok: false; error: ApiError }> {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function readJson<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: [],
        message: "请求体必须是有效 JSON",
      },
    ]);
  }

  return schema.parse(body);
}

export function zodErrorResponse(error: z.ZodError): NextResponse<{ ok: false; error: ApiError }> {
  return jsonError(
    {
      code: "VALIDATION_ERROR",
      message: "请求参数无效",
      details: error.flatten(),
    },
    400,
  );
}

async function getDb(): Promise<DbClient> {
  return (await import("@/lib/db")).db;
}
