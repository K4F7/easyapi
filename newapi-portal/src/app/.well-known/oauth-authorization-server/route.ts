import {
  absoluteUrl,
  getAgentRegistrationMetadata,
  jsonResponse,
} from "@/lib/agent-readiness";

export const dynamic = "force-dynamic";

export function GET() {
  return jsonResponse({
    issuer: absoluteUrl("/"),
    authorization_endpoint: absoluteUrl("/oauth/authorize"),
    token_endpoint: absoluteUrl("/oauth/token"),
    jwks_uri: absoluteUrl("/.well-known/jwks.json"),
    registration_endpoint: absoluteUrl("/.well-known/agent-registration"),
    revocation_endpoint: absoluteUrl("/oauth/revoke"),
    response_types_supported: [],
    grant_types_supported: [],
    token_endpoint_auth_methods_supported: [],
    code_challenge_methods_supported: [],
    scopes_supported: ["discovery:read", "status:read", "docs:read"],
    service_documentation: absoluteUrl("/auth.md"),
    operational_status: "metadata-only-oauth-not-enabled",
    notes:
      "Discovery-only metadata. The authorization, token, and revocation endpoints are placeholders that return 501 unsupported_operation and do not process OAuth grants or issue tokens.",
    agent_auth: getAgentRegistrationMetadata(),
  });
}
