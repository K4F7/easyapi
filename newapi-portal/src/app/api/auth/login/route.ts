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
import { resolveNewApiLoginUsernames } from "@/lib/auth/login-identifier";
import { upsertPortalUserFromNewApiIdentity } from "@/lib/auth/newapi-user";
import { db } from "@/lib/db";
import { isDevMockEnabled, mockLoginResponse } from "@/lib/dev-mock";
import {
  loginNewApiWithPassword,
  NewApiPasswordLoginError,
} from "@/lib/newapi/password-login";

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
  if (isDevMockEnabled()) {
    return mockLoginResponse(request);
  }

  try {
    const input = await readJson(request, loginSchema);
    const identifier = input.identifier || input.email;

    if (!identifier) {
      return invalidCredentials();
    }

    const newApiLogin = await loginWithNewApi({
      identifier,
      password: input.password,
    });

    if (newApiLogin.ok) {
      const session = await createSession(newApiLogin.user.id, request);

      return jsonOk({
        user: toPublicUser(newApiLogin.user),
        session: {
          expiresAt: session.expiresAt.toISOString(),
        },
      });
    }

    const localLogin = newApiLogin.allowLocalCompatibility
      ? await loginWithLocalCompatibility({
          identifier,
          password: input.password,
          request,
        })
      : { ok: false as const };

    if (localLogin.ok) {
      return localLogin.response;
    }

    return newApiLogin.response;
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

async function loginWithLocalCompatibility(input: {
  identifier: string;
  password: string;
  request: Request;
}) {
  const user = await findUserByLoginIdentifier(input.identifier);

  if (!user || user.newApiUserId) {
    return { ok: false as const };
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);

  if (!passwordMatches) {
    return { ok: false as const };
  }

  const updatedUser = await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  const session = await createSession(user.id, input.request);

  return {
    ok: true as const,
    response: jsonOk({
      user: toPublicUser(updatedUser),
      session: {
        expiresAt: session.expiresAt.toISOString(),
      },
      authSource: "portal_legacy",
    }),
  };
}

async function loginWithNewApi(input: {
  identifier: string;
  password: string;
}) {
  const usernames = resolveNewApiLoginUsernames(input.identifier);
  let lastFailure: NewApiLoginFailure | null = null;

  for (const username of usernames) {
    try {
      const newApiUser = await loginNewApiWithPassword({
        username,
        password: input.password,
      });
      const user = await upsertPortalUserFromNewApiIdentity({
        userId: newApiUser.userId,
        username: newApiUser.username,
        email: input.identifier.includes("@") ? input.identifier : undefined,
        accessToken: newApiUser.accessToken,
      });

      return { ok: true as const, user };
    } catch (error) {
      if (!(error instanceof NewApiPasswordLoginError)) {
        throw error;
      }

      const failure = mapNewApiLoginError(error);

      if (!shouldRetryNewApiLogin(error.code, usernames, username)) {
        return failure;
      }

      lastFailure = failure;
    }
  }

  return (
    lastFailure ?? {
      ok: false as const,
      response: invalidCredentials(),
      allowLocalCompatibility: true,
    }
  );
}

type NewApiLoginFailure = {
  ok: false;
  response: ReturnType<typeof jsonError>;
  allowLocalCompatibility: boolean;
};

function shouldRetryNewApiLogin(
  code: NewApiPasswordLoginError["code"],
  usernames: string[],
  attemptedUsername: string,
): boolean {
  if (usernames.length <= 1 || attemptedUsername === usernames.at(-1)) {
    return false;
  }

  return code === "NEWAPI_INVALID_CREDENTIALS" || code === "NEWAPI_LOGIN_FAILED";
}

function mapNewApiLoginError(error: NewApiPasswordLoginError): NewApiLoginFailure {
  if (error.code === "NEWAPI_2FA_REQUIRED") {
    return {
      ok: false as const,
      response: jsonError(
        {
          code: "NEWAPI_2FA_REQUIRED",
          message:
            "This NewAPI account requires 2FA. Please sign in through NewAPI and disable 2FA or complete 2FA there first.",
        },
        403,
      ),
      allowLocalCompatibility: false,
    };
  }

  if (error.code === "NEWAPI_VERIFICATION_REQUIRED") {
    return {
      ok: false as const,
      response: jsonError(
        {
          code: "NEWAPI_VERIFICATION_REQUIRED",
          message:
            "NewAPI requires additional verification before password login can continue.",
        },
        403,
      ),
      allowLocalCompatibility: false,
    };
  }

  if (error.code === "NEWAPI_UPSTREAM_DISABLED") {
    return {
      ok: false as const,
      response: jsonError(
        {
          code: "NEWAPI_UPSTREAM_DISABLED",
          message: "NewAPI password login is currently unavailable.",
        },
        503,
      ),
      allowLocalCompatibility: true,
    };
  }

  if (error.code === "NEWAPI_INVALID_CREDENTIALS") {
    return {
      ok: false as const,
      response: invalidCredentials(),
      allowLocalCompatibility: true,
    };
  }

  console.error("NewAPI fallback login failed", {
    code: error.code,
    status: error.status,
    message: error.message,
    payload: error.payload,
    cause: error.cause,
  });

  return {
    ok: false as const,
    response: jsonError(
      {
        code: error.code,
        message: "NewAPI login failed",
      },
      502,
    ),
    allowLocalCompatibility: false,
  };
}
