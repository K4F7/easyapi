import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../..");

const workflow = readFileSync(
  resolve(repoRoot, ".github/workflows/portal-cd.yml"),
  "utf8",
);
const compose = readFileSync(
  resolve(repoRoot, "infra/docker-compose.easyapi-portal-test.yml"),
  "utf8",
);
const restoreScript = readFileSync(
  resolve(repoRoot, "scripts/restore-staging-production-db.sh"),
  "utf8",
);
const stagingBackup = readFileSync(
  resolve(repoRoot, "scripts/staging-backup.sh"),
  "utf8",
);

const stagingBackupFilename = "xbh-new-api-2026-06-09-174203.sql.gz";

describe("staging backup snapshot", () => {
  it("uses the current xbh-new-api dump across CD, compose, and restore script", () => {
    expect(stagingBackup).toContain(stagingBackupFilename);
    expect(compose).toContain(stagingBackupFilename);
    expect(workflow).toContain(`infra/staging-dumps/${stagingBackupFilename}`);
    expect(restoreScript).toContain("staging-backup.sh");
  });
});
