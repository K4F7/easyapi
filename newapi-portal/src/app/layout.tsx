import type { Metadata } from "next";
import Script from "next/script";

import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const webMcpDiscoveryContext = {
  name: "EZAPI Portal",
  description: "Public read-only discovery metadata for EZAPI Portal.",
  links: {
    apiCatalog: "/.well-known/api-catalog",
    auth: "/auth.md",
    oauthProtectedResource: "/.well-known/oauth-protected-resource",
    mcpServerCard: "/.well-known/mcp/server-card.json",
    agentSkills: "/.well-known/agent-skills/index.json",
  },
};

export const metadata: Metadata = {
  title: "EasyAPI — 人人都会用的 API 控制台",
  description: "小白也能用的 API 管理控制台",
  icons: {
    icon: [{ url: "/duck-64.webp", type: "image/webp", sizes: "64x64" }],
    shortcut: "/duck-64.webp",
    apple: "/duck-64.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="light" style={{ colorScheme: "light" }}>
      <body className="font-sans">
        {children}
        <Script id="webmcp-registration" strategy="afterInteractive">
          {`
(function () {
  var discoveryContext = ${JSON.stringify(webMcpDiscoveryContext)};

  var registerTool = document.modelContext && document.modelContext.registerTool;
  if (typeof registerTool === "function") {
    void registerTool.call(document.modelContext, {
      name: "ezapi.discovery.read",
      description: "Return public EZAPI Portal discovery links.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      readOnlyHint: true,
      execute: async function () {
        return discoveryContext;
      },
    });
  }

  var provideContext = navigator.modelContext && navigator.modelContext.provideContext;
  if (typeof provideContext === "function") {
    void provideContext.call(navigator.modelContext, discoveryContext);
  }
})();
          `}
        </Script>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
