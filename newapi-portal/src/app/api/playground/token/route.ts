import { jsonError, jsonOk, requireUser } from "@/lib/auth";
import { getUserNewApiAuth, handleApiError } from "@/lib/api/bff";
import { ensurePlaygroundTokenId } from "@/lib/playground/ensure-token";

export const runtime = "nodejs";

export async function GET() {
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

    const tokenId = await ensurePlaygroundTokenId(authResult.auth);

    return jsonOk({ tokenId });
  } catch (error) {
    return handleApiError(error, "Failed to resolve playground token");
  }
}
