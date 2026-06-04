#!/usr/bin/env node
/**
 * Wait for portal health, then seed scr@easyapi.work (for CI on GitHub runners).
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const seedScript = path.join(repoRoot, "newapi-portal", "scripts", "seed-screenshot-user.mjs");

const baseUrl = (process.env.SEED_BASE_URL ?? "https://test.easyapi.work").replace(
  /\/$/,
  "",
);
const attempts = Number(process.env.SEED_HEALTH_ATTEMPTS ?? "60");
const delayMs = Number(process.env.SEED_HEALTH_DELAY_MS ?? "5000");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth() {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        const payload = await response.json();
        if (payload?.ok === true) {
          console.log(`Health OK: ${baseUrl}/api/health`);
          return;
        }
      }
    } catch {
      // retry
    }
    console.log(`Waiting for ${baseUrl}/api/health (${attempt}/${attempts}) ...`);
    await sleep(delayMs);
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/health`);
}

function runNode(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: repoRoot,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`seed script exited with code ${code}`));
    });
  });
}

async function main() {
  await waitForHealth();
  await runNode(seedScript, {
    SEED_BASE_URL: baseUrl,
    SEED_EMAIL: process.env.SEED_EMAIL ?? "scr@easyapi.work",
    SEED_PASSWORD: process.env.SEED_PASSWORD ?? "ScreenshotTest123!",
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
