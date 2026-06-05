import { getUnsupportedOAuthBody, jsonResponse } from "@/lib/agent-readiness";

export const dynamic = "force-dynamic";

export function GET() {
  return jsonResponse(getUnsupportedOAuthBody("authorization_endpoint"), {
    status: 501,
  });
}
