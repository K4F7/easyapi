import { destroySession, jsonOk } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  await destroySession();

  return jsonOk({
    loggedOut: true,
  });
}
