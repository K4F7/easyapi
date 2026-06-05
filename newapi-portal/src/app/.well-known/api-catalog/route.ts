import {
  absoluteUrl,
  getAuthMarkdown,
  jsonResponse,
  markdownResponse,
  wantsMarkdown,
} from "@/lib/agent-readiness";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  if (wantsMarkdown(request)) {
    return markdownResponse(`# EZAPI API Catalog

- Service description: ${absoluteUrl("/.well-known/api-catalog")}
- Agent auth documentation: ${absoluteUrl("/auth.md")}
- Public status: ${absoluteUrl("/api/health")}
- OAuth authorization server metadata: ${absoluteUrl("/.well-known/oauth-authorization-server")}
- OAuth protected resource metadata: ${absoluteUrl("/.well-known/oauth-protected-resource")}
- MCP server card: ${absoluteUrl("/.well-known/mcp/server-card.json")}
- Agent skills: ${absoluteUrl("/.well-known/agent-skills/index.json")}

${getAuthMarkdown()}
`);
  }

  return jsonResponse(
    {
      linkset: [
        {
          anchor: absoluteUrl("/"),
          "service-desc": [
            {
              href: absoluteUrl("/.well-known/api-catalog"),
              type: "application/linkset+json",
            },
          ],
          "service-doc": [
            {
              href: absoluteUrl("/auth.md"),
              type: "text/markdown",
            },
          ],
          status: [
            {
              href: absoluteUrl("/api/health"),
              type: "application/json",
            },
          ],
          "oauth-authorization-server": [
            {
              href: absoluteUrl("/.well-known/oauth-authorization-server"),
              type: "application/json",
            },
          ],
          "oauth-protected-resource": [
            {
              href: absoluteUrl("/.well-known/oauth-protected-resource"),
              type: "application/json",
            },
          ],
          "mcp-server-card": [
            {
              href: absoluteUrl("/.well-known/mcp/server-card.json"),
              type: "application/json",
            },
          ],
          "agent-skills": [
            {
              href: absoluteUrl("/.well-known/agent-skills/index.json"),
              type: "application/json",
            },
          ],
        },
      ],
    },
    { contentType: "application/linkset+json; charset=utf-8" },
  );
}
