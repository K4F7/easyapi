import { z } from "zod";

import {
  jsonError,
  jsonOk,
  readJson,
  requireUser,
  zodErrorResponse,
  destroySession,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const emailSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = await readJson(request, emailSchema);

    if (user.email === input.email) {
      return jsonError({
        code: "SAME_EMAIL",
        message: "新邮箱不能与当前邮箱相同",
      });
    }

    // Update email in portal database
    await db.user.update({
      where: { id: user.id },
      data: { email: input.email },
    });

    // Destroy session so user has to login again
    await destroySession();

    return jsonOk({
      message: "Email updated successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodErrorResponse(error);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError(
        {
          code: "EMAIL_ALREADY_REGISTERED",
          message: "该邮箱已被注册",
        },
        409,
      );
    }

    console.error("email update failed", error);
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: "Failed to update email",
      },
      500,
    );
  }
}
