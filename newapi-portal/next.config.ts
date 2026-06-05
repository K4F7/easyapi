import type { NextConfig } from "next";

const immutableCache = "public, max-age=31536000, immutable";
const publicHtmlCache =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=600";
const privateNoStore = "private, no-store, max-age=0";
const apiNoStore = "no-store, max-age=0";
const agentDiscoveryLinks = [
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
  '</auth.md>; rel="service-doc"; type="text/markdown"',
  '</.well-known/api-catalog>; rel="service-desc"; type="application/linkset+json"',
  '</api/health>; rel="status"; type="application/json"',
  '</.well-known/mcp/server-card.json>; rel="mcp-server-card"; type="application/json"',
  '</.well-known/agent-skills/index.json>; rel="agent-skills"; type="application/json"',
  '</.well-known/oauth-protected-resource>; rel="oauth-protected-resource"; type="application/json"',
].join(", ");
const staticAssetExtensions = [
  "avif",
  "gif",
  "ico",
  "jpg",
  "jpeg",
  "png",
  "svg",
  "webp",
  "woff",
  "woff2",
  "ttf",
  "otf",
];

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; frame-src 'self'",
  },
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/duck.webp",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: immutableCache,
          },
        ],
      },
      ...staticAssetExtensions.map((extension) => ({
        source: `/:path*.${extension}`,
        headers: [
          {
            key: "Cache-Control",
            value: immutableCache,
          },
        ],
      })),
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: apiNoStore,
          },
        ],
      },
      {
        source: "/dashboard/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: privateNoStore,
          },
        ],
      },
      {
        source: "/login",
        headers: [
          {
            key: "Cache-Control",
            value: privateNoStore,
          },
        ],
      },
      {
        source: "/register",
        headers: [
          {
            key: "Cache-Control",
            value: privateNoStore,
          },
        ],
      },
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: publicHtmlCache,
          },
          {
            key: "Link",
            value: agentDiscoveryLinks,
          },
          {
            key: "Vary",
            value: "Accept",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
