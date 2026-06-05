import { jsonResponse } from "@/lib/agent-readiness";

export const dynamic = "force-dynamic";

export function GET() {
  return jsonResponse({
    keys: [],
    operational_status: "metadata-only-oauth-not-enabled",
  });
}
