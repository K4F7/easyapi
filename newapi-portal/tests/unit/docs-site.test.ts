import { describe, expect, it, afterEach } from "vitest";

import { DOCS_PLACEHOLDER_PATH, getDocsNavConfig } from "@/lib/docs-site";

describe("getDocsNavConfig", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_DOCS_URL;
  });

  it("returns internal placeholder with WIP badge when env is unset", () => {
    expect(getDocsNavConfig()).toEqual({
      href: DOCS_PLACEHOLDER_PATH,
      external: false,
      badge: "WIP",
    });
  });

  it("returns external link without WIP badge when env is set", () => {
    process.env.NEXT_PUBLIC_DOCS_URL = "https://docs.easyapi.work";

    expect(getDocsNavConfig()).toEqual({
      href: "https://docs.easyapi.work",
      external: true,
    });
  });

  it("treats whitespace-only env as unset", () => {
    process.env.NEXT_PUBLIC_DOCS_URL = "   ";

    expect(getDocsNavConfig()).toEqual({
      href: DOCS_PLACEHOLDER_PATH,
      external: false,
      badge: "WIP",
    });
  });
});
