import { absoluteUrl, jsonResponse, serviceName, serviceVersion } from "@/lib/agent-readiness";

export const dynamic = "force-dynamic";

export function GET() {
  return jsonResponse({
    serverInfo: {
      name: serviceName,
      version: serviceVersion,
    },
    transport: {
      type: "https",
      endpoint: absoluteUrl("/.well-known/api-catalog"),
      note: "Read-only discovery transport metadata. This endpoint does not expose state-changing tools.",
    },
    capabilities: {
      tools: {
        listChanged: false,
        readOnly: true,
      },
      resources: {
        subscribe: false,
      },
    },
    auth: {
      documentation: absoluteUrl("/auth.md"),
      protected_resource: absoluteUrl("/.well-known/oauth-protected-resource"),
      authorization_server: absoluteUrl("/.well-known/oauth-authorization-server"),
      status: "metadata-only-oauth-not-enabled",
    },
  });
}
