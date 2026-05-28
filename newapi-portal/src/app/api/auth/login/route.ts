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
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  try {
    const input = await readJson(request, loginSchema);
    const user = await db.user.findUnique({
      where: { email: input.email },
    });

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
      message: "Email or password is incorrect",
    },
    401,
  );
}
