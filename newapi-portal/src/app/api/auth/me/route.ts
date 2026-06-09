import {
  clearSessionCookie,
  getCurrentUser,
  jsonError,
  jsonOk,
  sessionCookieName,
} from "@/lib/auth";
import { isDevMockEnabled, mockAuthMeResponse } from "@/lib/dev-mock";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function GET() {
  if (isDevMockEnabled()) {
    return mockAuthMeResponse();
  }

  const cookieStore = await cookies();
  const hasSessionCookie = Boolean(
    cookieStore.get(sessionCookieName)?.value,
  );
  const user = await getCurrentUser();

  if (!user) {
    if (hasSessionCookie) {
      await clearSessionCookie();
    }

    return jsonError(
      {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
      401,
    );
  }

  return jsonOk({
    user,
  });
}
