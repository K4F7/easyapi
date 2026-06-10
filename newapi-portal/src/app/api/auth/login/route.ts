import { z } from "zod";

import {
  createSession,
  jsonError,
  jsonOk,
  readJson,
  toPublicUser,
  zodErrorResponse,
} from "@/lib/auth";
import { resolveNewApiLoginUsernames } from "@/lib/auth/login-identifier";
import { upsertPortalUserFromNewApiIdentity } from "@/lib/auth/newapi-user";
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

    if (!newApiLogin.ok) {
      return newApiLogin.response;
    }

    const session = await createSession(newApiLogin.user.id, request);

    return jsonOk({
      user: toPublicUser(newApiLogin.user),
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
    }
  );
}

type NewApiLoginFailure = {
  ok: false;
  response: ReturnType<typeof jsonError>;
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
    };
  }

  if (error.code === "NEWAPI_INVALID_CREDENTIALS") {
    return {
      ok: false as const,
      response: invalidCredentials(),
    };
  }

  console.error("NewAPI login failed", {
    code: error.code,
    status: error.status,
    message: error.message,
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
  };
}
