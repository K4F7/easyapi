import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadDotEnvFile(relativePath: string) {
  const filePath = join(process.cwd(), relativePath);
  if (!existsSync(filePath)) return;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnvFile(".env.e2e");

const baseURL = process.env.E2E_BASE_URL ?? "https://test.easyapi.work";
const authStorageState = join(
  process.cwd(),
  "test-results",
  "auth",
  "portal-user.json",
);
const authenticatedSpecs = [
  /.*\/tokens-channel\.spec\.ts/,
  /.*\/playground\.spec\.ts/,
  /.*\/chat-polish\.spec\.ts/,
  /.*\/theme-light\.spec\.ts/,
  /.*\/onboarding\.spec\.ts/,
  /.*\/billing-aff\.spec\.ts/,
];
const checkinDiagnosticsSpec = /.*\/checkin-diagnostics\.spec\.ts/;
const liveNewApiSmokeSpec = /.*\/live-newapi-smoke\.spec\.ts/;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "auth setup",
      testMatch: /.*\/auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [
        /.*\/auth\.setup\.ts/,
        checkinDiagnosticsSpec,
        process.env.E2E_LIVE_SMOKE === "1" ? undefined : liveNewApiSmokeSpec,
      ].filter((pattern): pattern is RegExp => Boolean(pattern)),
    },
    {
      name: "checkin-diagnostics",
      testMatch: checkinDiagnosticsSpec,
      use: { ...devices["Desktop Chrome"], video: "off" },
    },
    {
      name: "authenticated-chromium",
      dependencies: ["auth setup"],
      testMatch: authenticatedSpecs,
      use: {
        ...devices["Desktop Chrome"],
        storageState: authStorageState,
      },
    },
  ],
});
