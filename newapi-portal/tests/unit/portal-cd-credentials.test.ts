import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(
  resolve(testDir, "../../../.github/workflows/portal-cd.yml"),
  "utf8",
);

describe("portal staging CD credentials", () => {
  it("does not fall back to the old staging screenshot account", () => {
    expect(workflow).not.toContain("scr@qq.com");
    expect(workflow).not.toContain("ScreenshotTest123!");
    expect(workflow).not.toMatch(/\$\{E2E_PORTAL_IDENTIFIER:-/);
    expect(workflow).not.toMatch(/\$\{E2E_PORTAL_PASSWORD:-/);
  });

  it("fails fast before staging login and E2E when required credential env is missing", () => {
    expect(workflow).toContain(
      "for variable in E2E_PORTAL_IDENTIFIER E2E_PORTAL_PASSWORD; do",
    );
    expect(workflow).toContain(
      'echo "Missing required environment variable: ${variable}"',
    );

    const missingCredentialChecks =
      workflow.match(
        /for variable in E2E_PORTAL_IDENTIFIER E2E_PORTAL_PASSWORD; do/g,
      ) ?? [];

    expect(missingCredentialChecks).toHaveLength(4);
  });
});
