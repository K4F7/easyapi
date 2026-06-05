import { getUnsupportedOAuthBody, jsonResponse } from "@/lib/agent-readiness";

export const dynamic = "force-dynamic";

export function POST() {
  return jsonResponse(getUnsupportedOAuthBody("revocation_endpoint"), {
    status: 501,
  });
}

export function GET() {
  return POST();
}
