"use client";

import { useEffect } from "react";

type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    additionalProperties: boolean;
  };
  readOnlyHint?: boolean;
  execute: () => Promise<unknown>;
};

type ModelContextApi = {
  registerTool?: (tool: WebMcpTool) => void | Promise<void>;
  provideContext?: (context: unknown) => void | Promise<void>;
};

declare global {
  interface Document {
    modelContext?: ModelContextApi;
  }

  interface Navigator {
    modelContext?: ModelContextApi;
  }
}

const discoveryContext = {
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

export function WebMcpRegistration() {
  useEffect(() => {
    const registerTool = document.modelContext?.registerTool;

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
        execute: async () => discoveryContext,
      });
    }

    const provideContext = navigator.modelContext?.provideContext;

    if (typeof provideContext === "function") {
      void provideContext.call(navigator.modelContext, discoveryContext);
    }
  }, []);

  return null;
}
