import { z } from "zod";

import {
  jsonError,
  jsonOk,
  readJson,
  requireUser,
  zodErrorResponse,
  verifyPassword,
  hashPassword,
  destroySession,
} from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "当前密码不能为空"),
  newPassword: z.string().min(8, "新密码至少需要8个字符").max(128),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = await readJson(request, passwordSchema);

    // Get current user with password hash
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!dbUser) {
      return jsonError({
        code: "USER_NOT_FOUND",
        message: "User not found",
      }, 404);
    }

    // Verify current password
    const isPasswordValid = await verifyPassword(
      input.currentPassword,
      dbUser.passwordHash
    );

    if (!isPasswordValid) {
      return jsonError({
        code: "INVALID_PASSWORD",
        message: "当前密码错误",
      }, 401);
    }

    // Hash new password
    const newPasswordHash = await hashPassword(input.newPassword);

    // Update password in portal database
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    // Destroy session so user has to login again
    await destroySession();

    return jsonOk({
      message: "Password updated successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodErrorResponse(error);
    }

    console.error("password update failed", error);
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: "Failed to update password",
      },
      500,
    );
  }
}
