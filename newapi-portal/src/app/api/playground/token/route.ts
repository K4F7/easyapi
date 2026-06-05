import { jsonError, jsonOk, requireUser } from "@/lib/auth";
import { getUserNewApiAuth, handleApiError } from "@/lib/api/bff";
import { isDevMockEnabled, mockPlaygroundTokenResponse } from "@/lib/dev-mock";
import { ensurePlaygroundTokenIds } from "@/lib/playground/ensure-token";

export const runtime = "nodejs";

export async function GET() {
  if (isDevMockEnabled()) {
    return mockPlaygroundTokenResponse();
  }

  try {
    const user = await requireUser();
    const authResult = await getUserNewApiAuth(user);

    if (!authResult.ok) {
      return jsonError(
        {
          code: authResult.code,
          message: authResult.message,
        },
        409,
      );
    }

    const { chatTokenId, imageTokenId } = await ensurePlaygroundTokenIds(
      authResult.auth,
    );

    return jsonOk({ chatTokenId, imageTokenId, tokenId: chatTokenId });
  } catch (error) {
    return handleApiError(error, "Failed to resolve playground token");
  }
}
