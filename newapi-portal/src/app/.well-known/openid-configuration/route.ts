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
    scopes_supported: ["discovery:read", "status:read", "docs:read"],
    response_types_supported: [],
    grant_types_supported: [],
    token_endpoint_auth_methods_supported: [],
    service_documentation: absoluteUrl("/auth.md"),
    operational_status: "metadata-only-oidc-not-enabled",
    notes:
      "Discovery-only metadata. This portal does not currently provide an operational OpenID Provider, authorization code flow, refresh tokens, or ID tokens.",
    agent_auth: getAgentRegistrationMetadata(),
  });
}
