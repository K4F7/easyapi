import "server-only";

import { createHash } from "node:crypto";

import { wantsMarkdown } from "@/lib/agent-http";

export { wantsMarkdown };

export const serviceName = "EZAPI Portal";
export const serviceVersion = "0.1.0";

export function getAppBaseUrl(): string {
  const rawUrl = process.env.APP_URL?.trim();

  if (!rawUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_URL is required in production.");
    }

    return "http://localhost:3000";
  }

  try {
    const url = new URL(rawUrl);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("APP_URL must use http or https.");
    }

    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_URL must be a valid http or https URL in production.");
    }

    return "http://localhost:3000";
  }
}

export function absoluteUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getAppBaseUrl()}${normalizedPath}`;
}

export function markdownResponse(markdown: string, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "text/markdown; charset=utf-8");
  headers.set("Vary", appendVary(headers.get("Vary"), "Accept"));

  return new Response(markdown, {
    ...init,
    headers,
  });
}

export function jsonResponse(
  body: unknown,
  init?: ResponseInit & { contentType?: string },
): Response {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", init?.contentType ?? "application/json; charset=utf-8");
  headers.set("Vary", appendVary(headers.get("Vary"), "Accept"));

  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers,
  });
}

export function appendVary(existing: string | null, value: string): string {
  if (!existing) {
    return value;
  }

  const parts = existing.split(",").map((part) => part.trim().toLowerCase());
  return parts.includes(value.toLowerCase()) ? existing : `${existing}, ${value}`;
}

export const publicAgentPaths = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/sitemap.xml",
  "/robots.txt",
  "/auth.md",
  "/.well-known/api-catalog",
  "/.well-known/openid-configuration",
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
  "/.well-known/mcp/server-card.json",
  "/.well-known/agent-skills/index.json",
  "/.well-known/agent-skills/discovery/SKILL.md",
  "/.well-known/agent-registration",
  "/.well-known/jwks.json",
];

export function getSitemapPaths(): string[] {
  return publicAgentPaths.filter((path) => path !== "/robots.txt");
}

export function getAuthMarkdown(): string {
  return `# EZAPI Agent Authentication

EZAPI Portal exposes public discovery metadata for agents at ${absoluteUrl("/.well-known/api-catalog")}.

## Current OAuth status

This portal does not currently operate an automated OAuth authorization server for third-party agents. The OAuth metadata endpoints are published for readiness and discovery, but the authorization, token, and revocation endpoints are non-operational placeholders that return explicit unsupported responses.

Human users can authenticate through:

- Login: ${absoluteUrl("/login")}
- Registration: ${absoluteUrl("/register")}
- Password reset: ${absoluteUrl("/forgot-password")}

## Agent registration

Agents should read ${absoluteUrl("/.well-known/agent-registration")} before attempting integration. Supported identity types are:

- human-supervised-agent
- organization-managed-agent
- dns-verified-agent

Supported credential types are documented as non-operational readiness metadata:

- oauth-client-assertion-jwt
- signed-agent-manifest
- api-token-issued-by-user

## Scopes

The discovery surface is read-only. Published scopes are:

- discovery:read - read public service metadata
- status:read - read public health metadata
- docs:read - read public documentation

## DNS-AID external step

DNS-AID cannot be completed by application code. To enable DNS-assisted agent identity, publish DNS TXT records for the production domain outside this app. Suggested records:

- _agent.${new URL(getAppBaseUrl()).hostname} TXT "aid=v1; issuer=${absoluteUrl("/.well-known/oauth-authorization-server")}; docs=${absoluteUrl("/auth.md")}"
- _mcp.${new URL(getAppBaseUrl()).hostname} TXT "mcp=${absoluteUrl("/.well-known/mcp/server-card.json")}"

These records are not claimed as published by this app. Verify them with your DNS provider before advertising DNS-AID as active.
`;
}

export const discoverySkillMarkdown = `# EZAPI Discovery

Use this read-only skill to discover EZAPI Portal metadata before attempting authenticated workflows.

## Inputs

- base_url: Optional canonical service URL. Default is the service that served this skill.

## Steps

1. Fetch /.well-known/api-catalog and inspect the linkset entries.
2. Fetch /auth.md for current agent authentication status and DNS-AID setup notes.
3. Fetch /.well-known/oauth-protected-resource before sending bearer credentials.
4. Treat OAuth authorization, token, and revocation endpoints as non-operational unless their metadata status changes.

## DNS-AID

DNS-AID requires external DNS TXT records. This skill can read and report DNS-AID instructions, but it does not claim that DNS records have been published.
`;

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function getAgentRegistrationMetadata() {
  return {
    status: "documentation-only",
    register_uri: absoluteUrl("/.well-known/agent-registration"),
    documentation: absoluteUrl("/auth.md"),
    supported_identity_types: [
      "human-supervised-agent",
      "organization-managed-agent",
      "dns-verified-agent",
    ],
    credential_types_supported: [
      "oauth-client-assertion-jwt",
      "signed-agent-manifest",
      "api-token-issued-by-user",
    ],
    claims_uri: absoluteUrl("/auth.md#agent-registration"),
    revocation_uri: absoluteUrl("/oauth/revoke"),
    dns_aid: {
      status: "external-dns-required",
      documentation: absoluteUrl("/auth.md#dns-aid-external-step"),
    },
  };
}

export function getUnsupportedOAuthBody(endpoint: string) {
  return {
    error: "unsupported_operation",
    endpoint,
    status: "not_operational",
    message:
      "EZAPI Portal publishes this endpoint as readiness metadata only. No OAuth grants, tokens, or revocations are processed here.",
    documentation: absoluteUrl("/auth.md"),
  };
}
