import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  createSession,
  jsonError,
  jsonOk,
  readJson,
  toPublicUser,
  zodErrorResponse,
} from "@/lib/auth";
import { upsertPortalUserFromNewApiIdentity } from "@/lib/auth/newapi-user";
import { db } from "@/lib/db";
import { isDevMockEnabled, mockRegisterResponse } from "@/lib/dev-mock";
import { getServerEnv } from "@/lib/env";
import { adminAddQuota } from "@/lib/newapi";
import {
  NewApiNativeAuthError,
  registerNewApiUser,
} from "@/lib/newapi/native-auth";
import {
  loginNewApiWithPassword,
  NewApiPasswordLoginError,
} from "@/lib/newapi/password-login";

export const runtime = "nodejs";

const registerSchema = z.object({
  username: z.string().trim().min(2).max(64),
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(20),
  inviteCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{6,32}$/)
    .optional(),
  verificationCode: z.string().trim().max(32).optional(),
  turnstile: z.string().trim().max(2048).optional(),
});

export async function POST(request: Request) {
  if (isDevMockEnabled()) {
    return mockRegisterResponse(request);
  }

  try {
    const input = await readJson(request, registerSchema);
    const existingPortalUser = await db.user.findUnique({
      where: { email: input.email },
      select: { id: true, newApiUserId: true },
    });

    if (existingPortalUser) {
      return jsonError(
        {
          code: "EMAIL_ALREADY_REGISTERED",
          message: "Email is already registered in the portal.",
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
          message: "Invite code is invalid.",
        },
        400,
      );
    }

    try {
      await registerNewApiUser({
        username: input.username,
        email: input.email,
        password: input.password,
        verificationCode: input.verificationCode,
        turnstile: input.turnstile,
        affCode: input.inviteCode,
      });
    } catch (error) {
      if (error instanceof NewApiNativeAuthError) {
        return newApiRegisterErrorResponse(error);
      }

      throw error;
    }

    let newApiLogin;

    try {
      newApiLogin = await loginNewApiWithPassword({
        username: input.username,
        password: input.password,
      });
    } catch (error) {
      if (error instanceof NewApiPasswordLoginError) {
        return jsonOk(
          {
            status: "REGISTERED_LOGIN_REQUIRED",
            message:
              "Registration succeeded in NewAPI, but automatic login is blocked by NewAPI policy. Please sign in after completing the required verification.",
            newApiBinding: "pending",
            reason: error.code,
          },
          { status: 202 },
        );
      }

      throw error;
    }

    const user = await upsertPortalUserFromNewApiIdentity({
      userId: newApiLogin.userId,
      username: newApiLogin.username,
      email: input.email,
      accessToken: newApiLogin.accessToken,
    });

    if (referrer) {
      await db.referral.upsert({
        where: { referredUserId: user.id },
        update: {},
        create: {
          referrerId: referrer.id,
          referredUserId: user.id,
          inviteCodeUsed: referrer.inviteCode,
        },
      });
    }

    await db.auditLog.create({
      data: {
        actorType: "USER",
        actorUserId: user.id,
        action: "auth.register",
        targetType: "user",
        targetId: user.id,
        metadata: {
          newApiBinding: "ready",
          signupCreditLedger: "pending",
          referredByUserId: referrer?.id ?? null,
          source: "newapi_native",
        },
      },
    });

    const signupCreditLedger = await grantSignupCredit(user.id, newApiLogin.userId);
    const session = await createSession(user.id, request);

    return jsonOk(
      {
        status: "REGISTERED_AND_LOGGED_IN",
        user: toPublicUser(user),
        session: {
          expiresAt: session.expiresAt.toISOString(),
        },
        newApiBinding: "ready",
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
          message: "Email, invite code, or NewAPI binding already exists.",
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

function newApiRegisterErrorResponse(error: NewApiNativeAuthError) {
  if (error.code === "NEWAPI_VERIFICATION_REQUIRED") {
    return jsonError(
      {
        code: "NEWAPI_VERIFICATION_REQUIRED",
        message:
          "NewAPI requires email verification or bot verification before registration can continue.",
      },
      403,
    );
  }

  if (error.code === "NEWAPI_REGISTER_DISABLED") {
    return jsonError(
      {
        code: "NEWAPI_REGISTER_DISABLED",
        message: "NewAPI registration is currently disabled.",
      },
      403,
    );
  }

  return jsonError(
    {
      code: error.code,
      message: error.message || "NewAPI registration failed.",
    },
    error.status >= 400 && error.status < 500 ? error.status : 502,
  );
}

async function grantSignupCredit(
  portalUserId: string,
  newApiUserId: string,
): Promise<"done" | "pending" | "failed"> {
  const env = getServerEnv();
  const quotaAmount = env.REGISTER_QUOTA;

  try {
    await db.walletLedger.upsert({
      where: { idempotencyKey: `signup:${portalUserId}` },
      update: {},
      create: {
        userId: portalUserId,
        type: "CREDIT",
        amount: quotaAmount,
        reason: "signup_bonus",
        idempotencyKey: `signup:${portalUserId}`,
        metadata: {
          source: "register",
          newApiUserId,
          quotaAmount,
        },
      },
    });

    try {
      await adminAddQuota({
        userId: newApiUserId,
        value: quotaAmount,
      });
      return "done";
    } catch (quotaError) {
      console.error("register: adminAddQuota failed", quotaError);
      return "pending";
    }
  } catch (ledgerError) {
    console.error("register: signup ledger failed", ledgerError);
    return "failed";
  }
}
