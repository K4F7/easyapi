import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  createSession,
  encryptSecret,
  generateInviteCode,
  hashPassword,
  jsonError,
  jsonOk,
  readJson,
  toPublicUser,
  zodErrorResponse,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { adminCreateUser, adminAddQuota } from "@/lib/newapi";
import { NewApiError } from "@/lib/newapi/client";

export const runtime = "nodejs";

const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  inviteCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{6,32}$/)
    .optional(),
});

export async function POST(request: Request) {
  try {
    const input = await readJson(request, registerSchema);
    const existingUser = await db.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existingUser) {
      return jsonError(
        {
          code: "EMAIL_ALREADY_REGISTERED",
          message: "Email is already registered",
        },
        409,
      );
    }

    const referrer = input.inviteCode
      ? await db.user.findUnique({
          where: { inviteCode: input.inviteCode },
          select: { id: true, inviteCode: true },
        })
      : null;

    if (input.inviteCode && !referrer) {
      return jsonError(
        {
          code: "INVALID_INVITE_CODE",
          message: "Invite code is invalid",
        },
        400,
      );
    }

    const passwordHash = await hashPassword(input.password);
    const env = getServerEnv();

    // --- Create local user in a transaction ---
    const user = await db.$transaction(async (tx) => {
      let inviteCode = generateInviteCode();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const inviteCodeOwner = await tx.user.findUnique({
          where: { inviteCode },
          select: { id: true },
        });

        if (!inviteCodeOwner) {
          break;
        }

        inviteCode = generateInviteCode();
      }

      const createdUser = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          inviteCode,
          referredByUserId: referrer?.id,
          newApiUserId: null,
          newApiAccessTokenCiphertext: null,
          newApiAccessTokenKeyId: null,
        },
      });

      if (referrer) {
        await tx.referral.create({
          data: {
            referrerId: referrer.id,
            referredUserId: createdUser.id,
            inviteCodeUsed: referrer.inviteCode,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorType: "USER",
          actorUserId: createdUser.id,
          action: "auth.register",
          targetType: "user",
          targetId: createdUser.id,
          metadata: {
            newApiBinding: "pending",
            signupCreditLedger: "pending",
            referredByUserId: referrer?.id ?? null,
          },
        },
      });

      return createdUser;
    });

    // --- NewAPI integration (runtime only, outside transaction) ---
    let newApiBinding: "ready" | "pending" = "pending";
    let newApiUserId: string | null = null;
    let signupCreditLedger: "done" | "pending" | "failed" = "pending";

    try {
      const newApiUser = await adminCreateUser({
        username: input.email,
        password: input.password,
        displayName: input.email.split("@")[0],
      });

      if (newApiUser.id) {
        newApiUserId = String(newApiUser.id);
        newApiBinding = "ready";

        const encryptedToken = newApiUser.accessToken
          ? await encryptSecret(newApiUser.accessToken, env.AUTH_SECRET)
          : null;

        await db.user.update({
          where: { id: user.id },
          data: {
            newApiUserId,
            newApiAccessTokenCiphertext: encryptedToken,
            newApiAccessTokenKeyId: encryptedToken ? "auth-secret-v1" : null,
          },
        });
      }

      // --- Signup bonus: write idempotent ledger entry then call adminAddQuota ---
      const idempotencyKey = `signup:${user.id}`;
      const quotaAmount = env.REGISTER_QUOTA;

      await db.walletLedger.create({
        data: {
          userId: user.id,
          type: "CREDIT",
          amount: quotaAmount,
          reason: "signup_bonus",
          idempotencyKey,
          metadata: {
            source: "register",
            newApiUserId,
            quotaAmount,
          },
        },
      });

      if (newApiUserId) {
        try {
          await adminAddQuota({
            userId: newApiUserId,
            value: quotaAmount,
          });
          signupCreditLedger = "done";
        } catch (quotaError) {
          console.error("register: adminAddQuota failed", quotaError);
          signupCreditLedger = "pending";
        }
      }
    } catch (newApiError) {
      if (newApiError instanceof NewApiError) {
        console.error(
          "register: NewAPI adminCreateUser failed",
          newApiError.status,
          newApiError.message,
        );

        // Rollback: remove the local user so we don't leave a half-created account
        await db.user.delete({ where: { id: user.id } });

        return jsonError(
          {
            code: "NEWAPI_BINDING_FAILED",
            message:
              "Upstream service unavailable. Registration could not be completed.",
          },
          502,
        );
      }

      // Unknown error — still rollback
      console.error("register: unexpected NewAPI error", newApiError);
      await db.user.delete({ where: { id: user.id } });

      return jsonError(
        {
          code: "INTERNAL_ERROR",
          message: "Registration failed",
        },
        500,
      );
    }

    // --- Create session ---
    const session = await createSession(user.id);

    return jsonOk(
      {
        user: toPublicUser({ ...user, newApiUserId }),
        session: {
          expiresAt: session.expiresAt.toISOString(),
        },
        newApiBinding,
        signupCreditLedger,
      },
      { status: 201 },
    );
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
          code: "REGISTER_CONFLICT",
          message: "Email or invite code already exists",
        },
        409,
      );
    }

    console.error("register failed", error);
    return jsonError(
      {
        code: "INTERNAL_ERROR",
        message: "Registration failed",
      },
      500,
    );
  }
}
