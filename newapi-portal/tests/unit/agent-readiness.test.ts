import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.stubEnv("APP_URL", "https://portal.example.test");

import { GET as getApiCatalog } from "@/app/.well-known/api-catalog/route";
import { GET as getSkillsIndex } from "@/app/.well-known/agent-skills/index.json/route";
import { GET as getOauthServer } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as getOpenIdConfiguration } from "@/app/.well-known/openid-configuration/route";
import { GET as getProtectedResource } from "@/app/.well-known/oauth-protected-resource/route";
import { GET as getAuthorizePlaceholder } from "@/app/oauth/authorize/route";
import { GET as getTokenPlaceholder } from "@/app/oauth/token/route";
import { GET as getRevokePlaceholder } from "@/app/oauth/revoke/route";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { wantsMarkdownFromAccept } from "@/lib/agent-http";
import {
  discoverySkillMarkdown,
  getAppBaseUrl,
  sha256Hex,
} from "@/lib/agent-readiness";
import { middleware } from "@/middleware";

describe("agent readiness metadata", () => {
  it("generates canonical sitemap entries and robots sitemap reference", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain("https://portal.example.test/");
    expect(urls).toContain("https://portal.example.test/login");
    expect(urls).toContain("https://portal.example.test/register");
    expect(urls).toContain("https://portal.example.test/forgot-password");
    expect(urls).toContain("https://portal.example.test/.well-known/api-catalog");
    expect(urls).toContain("https://portal.example.test/auth.md");
    expect(robots().sitemap).toBe("https://portal.example.test/sitemap.xml");
  });

  it("serves an application/linkset+json api catalog by default", async () => {
    const response = getApiCatalog(
      new Request("https://portal.example.test/.well-known/api-catalog"),
    );
    const body = await response.json();

    expect(response.headers.get("content-type")).toContain("application/linkset+json");
    expect(body.linkset[0].anchor).toBe("https://portal.example.test/");
    expect(body.linkset[0]["service-doc"][0].href).toBe(
      "https://portal.example.test/auth.md",
    );
    expect(body.linkset[0].status[0].href).toBe(
      "https://portal.example.test/api/health",
    );
  });

  it("negotiates markdown for the api catalog", async () => {
    const response = getApiCatalog(
      new Request("https://portal.example.test/.well-known/api-catalog", {
        headers: { accept: "text/markdown" },
      }),
    );
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(response.headers.get("vary")).toContain("Accept");
    expect(body).toContain("# EZAPI API Catalog");
  });

  it("honors Accept q values and does not return markdown when q=0", async () => {
    expect(wantsMarkdownFromAccept("application/json, text/markdown;q=0")).toBe(false);
    expect(wantsMarkdownFromAccept("application/json;q=0.1, text/markdown;q=0.9")).toBe(true);
    expect(wantsMarkdownFromAccept("text/html;q=0.8, text/markdown;q=0.2")).toBe(false);
    expect(wantsMarkdownFromAccept("text/markdown;q=0, */*;q=1")).toBe(false);
    expect(wantsMarkdownFromAccept("application/linkset+json")).toBe(false);
    expect(wantsMarkdownFromAccept("*/*")).toBe(false);

    const response = getApiCatalog(
      new Request("https://portal.example.test/.well-known/api-catalog", {
        headers: { accept: "application/json, text/markdown;q=0" },
      }),
    );

    expect(response.headers.get("content-type")).toContain("application/linkset+json");
  });

  it("serves markdown home from middleware with the discovery Link header", async () => {
    const response = middleware(
      new NextRequest("https://portal.example.test/", {
        headers: { accept: "text/markdown" },
      }),
    );

    expect(response?.headers.get("content-type")).toContain("text/markdown");
    expect(response?.headers.get("link")).toContain(
      '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
    );
    expect(response?.headers.get("vary")).toContain("Accept");
  });

  it("publishes a real sha256 digest for served skill content", async () => {
    const response = getSkillsIndex();
    const body = await response.json();

    expect(body.skills[0]).toMatchObject({
      name: "ezapi-discovery",
      url: "https://portal.example.test/.well-known/agent-skills/discovery/SKILL.md",
      sha256: sha256Hex(discoverySkillMarkdown),
    });
  });

  it("marks OAuth readiness metadata as non-operational", async () => {
    const oauthResponse = getOauthServer();
    const oauthBody = await oauthResponse.json();
    const resourceResponse = getProtectedResource();
    const resourceBody = await resourceResponse.json();

    expect(oauthBody.issuer).toBe("https://portal.example.test/");
    expect(oauthBody.authorization_endpoint).toBe(
      "https://portal.example.test/oauth/authorize",
    );
    expect(oauthBody.response_types_supported).toEqual([]);
    expect(oauthBody.grant_types_supported).toEqual([]);
    expect(oauthBody.token_endpoint_auth_methods_supported).toEqual([]);
    expect(oauthBody.grant_types_supported).not.toContain("authorization_code");
    expect(oauthBody.grant_types_supported).not.toContain("refresh_token");
    expect(oauthBody.notes).toContain("501 unsupported_operation");
    expect(oauthBody.operational_status).toBe("metadata-only-oauth-not-enabled");
    expect(oauthBody.agent_auth.register_uri).toBe(
      "https://portal.example.test/.well-known/agent-registration",
    );
    expect(resourceBody.resource).toBe("https://portal.example.test/");
    expect(resourceBody.bearer_methods_supported).toEqual(["header"]);
  });

  it("does not advertise operational OIDC ID token support", async () => {
    const response = getOpenIdConfiguration();
    const body = await response.json();

    expect(body.issuer).toBe("https://portal.example.test/");
    expect(body.authorization_endpoint).toBe(
      "https://portal.example.test/oauth/authorize",
    );
    expect(body.token_endpoint).toBe("https://portal.example.test/oauth/token");
    expect(body.jwks_uri).toBe("https://portal.example.test/.well-known/jwks.json");
    expect(body.grant_types_supported).toEqual([]);
    expect(body.response_types_supported).toEqual([]);
    expect(body.token_endpoint_auth_methods_supported).toEqual([]);
    expect(body.scopes_supported).not.toContain("openid");
    expect(body).not.toHaveProperty("id_token_signing_alg_values_supported");
    expect(body.operational_status).toBe("metadata-only-oidc-not-enabled");
  });

  it("keeps OAuth placeholder endpoints explicitly unsupported", async () => {
    for (const response of [
      getAuthorizePlaceholder(),
      getTokenPlaceholder(),
      getRevokePlaceholder(),
    ]) {
      const body = await response.json();

      expect(response.status).toBe(501);
      expect(body.error).toBe("unsupported_operation");
    }
  });

  it("fails fast for missing or invalid production APP_URL", () => {
    const originalNodeEnv = process.env.NODE_ENV ?? "test";

    try {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("APP_URL", "");
      expect(() => getAppBaseUrl()).toThrow("APP_URL is required in production.");

      vi.stubEnv("APP_URL", "ftp://portal.example.test");
      expect(() => getAppBaseUrl()).toThrow(
        "APP_URL must be a valid http or https URL in production.",
      );
    } finally {
      vi.stubEnv("NODE_ENV", originalNodeEnv);
      vi.stubEnv("APP_URL", "https://portal.example.test");
    }
  });

  it("falls back to localhost outside production when APP_URL is missing or invalid", () => {
    const originalNodeEnv = process.env.NODE_ENV ?? "test";

    try {
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("APP_URL", "");
      expect(getAppBaseUrl()).toBe("http://localhost:3000");

      vi.stubEnv("APP_URL", "ftp://portal.example.test");
      expect(getAppBaseUrl()).toBe("http://localhost:3000");
    } finally {
      vi.stubEnv("NODE_ENV", originalNodeEnv);
      vi.stubEnv("APP_URL", "https://portal.example.test");
    }
  });
});
