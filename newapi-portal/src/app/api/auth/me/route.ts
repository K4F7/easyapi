import { getCurrentUser, jsonError, jsonOk } from "@/lib/auth";
import { isDevMockEnabled, mockAuthMeResponse } from "@/lib/dev-mock";

export const runtime = "nodejs";

export async function GET() {
  if (isDevMockEnabled()) {
    return mockAuthMeResponse();
  }

  const user = await getCurrentUser();

  if (!user) {
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
