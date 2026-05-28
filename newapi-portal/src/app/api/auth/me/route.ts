import { getCurrentUser, jsonError, jsonOk } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
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
