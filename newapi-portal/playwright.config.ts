import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";

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
];
const checkinDiagnosticsSpec = /.*\/checkin-diagnostics\.spec\.ts/;

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
      testIgnore: [/.*\/auth\.setup\.ts/, checkinDiagnosticsSpec],
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
