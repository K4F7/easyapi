import { absoluteUrl, jsonResponse } from "@/lib/agent-readiness";

export const dynamic = "force-dynamic";

export function GET() {
  return jsonResponse({
    resource: absoluteUrl("/"),
    authorization_servers: [absoluteUrl("/.well-known/oauth-authorization-server")],
    scopes_supported: ["discovery:read", "status:read", "docs:read"],
    bearer_methods_supported: ["header"],
    resource_documentation: absoluteUrl("/auth.md"),
    operational_status: "public-discovery-only",
  });
}
