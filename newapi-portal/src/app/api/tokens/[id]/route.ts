import { jsonError, jsonOk, requireUser } from "@/lib/auth";
import { getUserNewApiAuth, handleApiError } from "@/lib/api/bff";
import { deleteToken } from "@/lib/newapi";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
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

    const { id } = await context.params;

    if (!id) {
      return jsonError(
        {
          code: "TOKEN_ID_REQUIRED",
          message: "Token id is required",
        },
        400,
      );
    }

    await deleteToken(authResult.auth, id);

    return jsonOk({
      deleted: true,
      id,
    });
  } catch (error) {
    return handleApiError(error, "Failed to delete token");
  }
}
