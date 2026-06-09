#!/usr/bin/env bash
# Restore easyapi-portal staging Postgres from the production snapshot SQL dump.
#
# Runs on the staging host (via GHA SSH on dev pushes, or manually):
#   down stack -> delete postgres volume -> up stack with BACKUP_SQL_GZ init import
#
# Optional env:
#   REMOTE_DIR, COMPOSE_PROJECT, COMPOSE_FILE, POSTGRES_VOLUME, BACKUP_SQL_GZ

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/staging-backup.sh
source "${SCRIPT_DIR}/staging-backup.sh"

REMOTE_DIR="${REMOTE_DIR:-${STAGING_REMOTE_DIR}}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-easyapi-portal}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.easyapi-portal-test.yml}"
POSTGRES_VOLUME="${POSTGRES_VOLUME:-easyapi-portal_pg_data_test}"
BACKUP_SQL_GZ="${BACKUP_SQL_GZ:-${STAGING_BACKUP_SQL_GZ}}"

cd "${REMOTE_DIR}"

if [ ! -f "${BACKUP_SQL_GZ}" ]; then
  echo "Backup not found: ${BACKUP_SQL_GZ}" >&2
  exit 1
fi

echo "Restoring staging Postgres from ${BACKUP_SQL_GZ} ..."

docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" down
docker volume rm -f "${POSTGRES_VOLUME}" || true
export BACKUP_SQL_GZ
docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" up -d

echo "Staging stack recreated; waiting for postgres init import to finish on first boot."
