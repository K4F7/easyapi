import { z } from "zod";

import {
  createSession,
  encryptSecret,
  generateInviteCode,
  jsonError,
  jsonOk,
  readJson,
  hashPassword,
  toPublicUser,
  verifyPassword,
  zodErrorResponse,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { loginUser } from "@/lib/newapi";

export const runtime = "nodejs";

const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1)
    .max(320)
    .transform((value) => value.toLowerCase())
    .optional(),
  email: z
    .string()
    .trim()
    .min(1)
    .max(320)
    .transform((value) => value.toLowerCase())
    .optional(),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  try {
    const input = await readJson(request, loginSchema);
    const identifier = input.identifier || input.email;

    if (!identifier) {
      return invalidCredentials();
    }

    let user = await findUserByLoginIdentifier(identifier);

    if (!user) {
      const newApiUser = await loginWithNewApiCredentials(identifier, input.password);

      if (!newApiUser) {
        return invalidCredentials();
      }

      user = newApiUser;
    }

    const passwordMatches = await verifyPassword(input.password, user.passwordHash);

    if (!passwordMatches) {
      const newApiUser = await loginWithNewApiCredentials(identifier, input.password);

      if (!newApiUser) {
        return invalidCredentials();
      }

      user = newApiUser;
    }

    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const session = await createSession(user.id);

    return jsonOk({
      user: toPublicUser(updatedUser),
      session: {
        expiresAt: session.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodErrorResponse(error);
    }

    console.error("login failed", error);
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: "Login failed",
      },
      500,
    );
  }
}

function invalidCredentials() {
  return jsonError(
    {
      code: "INVALID_CREDENTIALS",
      message: "Email/username or password is incorrect",
    },
    401,
  );
}

async function findUserByLoginIdentifier(identifier: string) {
  if (identifier.includes("@")) {
    return db.user.findUnique({
      where: { email: identifier },
    });
  }

  const users = await db.user.findMany({
    where: {
      email: {
        startsWith: `${identifier}@`,
      },
    },
    take: 2,
  });

  return users.length === 1 ? users[0] : null;
}

async function loginWithNewApiCredentials(identifier: string, password: string) {
  try {
    const newApiUser = await loginUser({
      username: identifier,
      password,
    });

    const email = identifier.includes("@") ? identifier : `${identifier}@newapi.local`;
    const passwordHash = await hashPassword(password);
    const env = getServerEnv();
    const encryptedToken = newApiUser.accessToken
      ? await encryptSecret(newApiUser.accessToken, env.AUTH_SECRET)
      : null;
    const existingUser = await findExistingPortalUser(email, newApiUser.id);

    if (existingUser) {
      return db.user.update({
        where: { id: existingUser.id },
        data: {
          email,
          passwordHash,
          newApiUserId: newApiUser.id === undefined ? existingUser.newApiUserId : String(newApiUser.id),
          newApiAccessTokenCiphertext: encryptedToken ?? existingUser.newApiAccessTokenCiphertext,
          newApiAccessTokenKeyId: encryptedToken ? "auth-secret-v1" : existingUser.newApiAccessTokenKeyId,
          newApiAccessTokenUpdatedAt: encryptedToken ? new Date() : existingUser.newApiAccessTokenUpdatedAt,
        },
      });
    }

    return db.user.create({
      data: {
        email,
        passwordHash,
        inviteCode: generateInviteCode(),
        newApiUserId: newApiUser.id === undefined ? null : String(newApiUser.id),
        newApiAccessTokenCiphertext: encryptedToken,
        newApiAccessTokenKeyId: encryptedToken ? "auth-secret-v1" : null,
        newApiAccessTokenUpdatedAt: encryptedToken ? new Date() : null,
      },
    });
  } catch (error) {
    console.warn("NewAPI credential login failed", error);
    return null;
  }
}

async function findExistingPortalUser(email: string, newApiUserId?: number) {
  const userByEmail = await db.user.findUnique({
    where: { email },
  });

  if (userByEmail || newApiUserId === undefined) {
    return userByEmail;
  }

  return db.user.findUnique({
    where: { newApiUserId: String(newApiUserId) },
  });
}
