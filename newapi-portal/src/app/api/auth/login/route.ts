import { z } from "zod";

import {
  createSession,
  jsonError,
  jsonOk,
  readJson,
  toPublicUser,
  verifyPassword,
  zodErrorResponse,
} from "@/lib/auth";
import { db } from "@/lib/db";

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

    const user = await findUserByLoginIdentifier(identifier);

    if (!user) {
      return invalidCredentials();
    }

    const passwordMatches = await verifyPassword(input.password, user.passwordHash);

    if (!passwordMatches) {
      return invalidCredentials();
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
