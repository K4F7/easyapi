import { destroySession, jsonOk } from "@/lib/auth";
import { destroyMockSession, isDevMockEnabled } from "@/lib/dev-mock";

export const runtime = "nodejs";

export async function POST() {
  if (isDevMockEnabled()) {
    return destroyMockSession();
  }

  await destroySession();

  return jsonOk({
    loggedOut: true,
  });
}
