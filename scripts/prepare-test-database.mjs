#!/usr/bin/env node

/**
 * Prepare the easyapi-portal test database on a remote host (default: staging server).
 * Does NOT use local Docker — only SSH to the target server running the easyapi-portal compose project.
 *
 * Env:
 *   PREPARE_REMOTE_HOST     default root@45.142.115.128
 *   PREPARE_REMOTE_DIR      default /opt/easyapi-portal-test
 *   PREPARE_COMPOSE_PROJECT default easyapi-portal
 *   SEED_BASE_URL           default https://test.easyapi.work
 *   BACKUP_SQL_GZ           source dump on remote host
 */

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const remoteHost = process.env.PREPARE_REMOTE_HOST ?? "root@45.142.115.128";
const remoteDir = process.env.PREPARE_REMOTE_DIR ?? "/opt/easyapi-portal-test";
const composeProject = process.env.PREPARE_COMPOSE_PROJECT ?? "easyapi-portal";
const postgresVolume = "easyapi-portal_pg_data_test";
const postgresContainer = "easyapi-portal-postgres-test";
const postgresUser = process.env.POSTGRES_USER ?? "newapi";
const postgresDb = process.env.POSTGRES_DB ?? "new-api";
const sourceBackup =
  process.env.PREPARE_REMOTE_BACKUP_SQL_GZ ??
  `${remoteDir}/xbh-new-api-2026-05-23-172431.sql.gz`;
const seedBaseUrl = (process.env.SEED_BASE_URL ?? "https://test.easyapi.work").replace(
  /\/$/,
  "",
);
const outputBackup = path.join(
  repoRoot,
  "test-data",
  "easyapi-portal-with-screenshot-user.sql.gz",
);
const seedScript = path.join(repoRoot, "newapi-portal", "scripts", "seed-screenshot-user.mjs");
const seedEmail = process.env.SEED_EMAIL ?? "scr@easyapi.work";
const seedPassword = process.env.SEED_PASSWORD ?? "ScreenshotTest123!";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url, attempts = 90, delayMs = 5000) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        const payload = await response.json();
        if (payload?.ok === true) {
          console.log(`Health OK: ${url}/api/health`);
          return;
        }
      }
    } catch {
      // retry
    }

    console.log(`Waiting for ${url}/api/health (${attempt}/${attempts}) ...`);
    await sleep(delayMs);
  }

  throw new Error(`Timed out waiting for ${url}/api/health`);
}

async function main() {
  await mkdir(path.dirname(outputBackup), { recursive: true });

  console.log(`Preparing test database on ${remoteHost} (project: ${composeProject})`);
  console.log(`Source backup on server: ${sourceBackup}`);

  const remoteScript = [
    `set -euo pipefail`,
    `cd ${remoteDir}`,
    `docker compose -p ${composeProject} -f docker-compose.easyapi-portal-test.yml down`,
    `docker volume rm -f ${postgresVolume} || true`,
    `export BACKUP_SQL_GZ=${sourceBackup}`,
    `docker compose -p ${composeProject} -f docker-compose.easyapi-portal-test.yml up -d`,
  ].join("\n");

  await run("ssh", [remoteHost, remoteScript]);

  console.log("Waiting for portal stack to become healthy after postgres re-init ...");
  await waitForHealth(seedBaseUrl);

  console.log(`Seeding screenshot test user via ${seedBaseUrl} ...`);
  await run("node", [seedScript], {
    env: {
      ...process.env,
      SEED_BASE_URL: seedBaseUrl,
      SEED_EMAIL: seedEmail,
      SEED_PASSWORD: seedPassword,
    },
  });

  console.log(`Downloading database snapshot to ${outputBackup} ...`);

  const dump = spawn(
    "ssh",
    [
      remoteHost,
      `docker exec ${postgresContainer} pg_dump -U ${postgresUser} -d ${postgresDb} --clean --if-exists | gzip -c`,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );

  const output = createWriteStream(outputBackup);
  await pipeline(dump.stdout, output);

  await new Promise((resolve, reject) => {
    dump.on("close", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`remote pg_dump exited with code ${code}`));
    });
    dump.on("error", reject);
  });

  console.log("\nTest database prepared on server and exported locally.");
  console.log(`Output backup: ${outputBackup}`);
  console.log(`Reuse on server with BACKUP_SQL_GZ=${sourceBackup.replace("xbh-new-api", "easyapi-portal-with-screenshot-user")}`);
  console.log(`E2E_PORTAL_IDENTIFIER=${seedEmail}`);
  console.log(`E2E_PORTAL_PASSWORD=${seedPassword}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
