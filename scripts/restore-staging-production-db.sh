#!/usr/bin/env bash
# Rebuild easyapi-portal staging Postgres from the production snapshot on the server.
# Used by dev CI and manual ops — wipes only this project's postgres test volume.
#
# Optional env:
#   REMOTE_DIR              default /opt/easyapi-portal-test
#   COMPOSE_PROJECT         default easyapi-portal
#   COMPOSE_FILE            default docker-compose.easyapi-portal-test.yml
#   BACKUP_SQL_GZ           default $REMOTE_DIR/xbh-new-api-2026-05-23-172431.sql.gz
#   POSTGRES_VOLUME         default easyapi-portal_pg_data_test
#
# FORBIDDEN: operating other compose projects; this script only touches easyapi-portal test stack.

set -euo pipefail

REMOTE_DIR="${REMOTE_DIR:-/opt/easyapi-portal-test}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-easyapi-portal}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.easyapi-portal-test.yml}"
BACKUP_SQL_GZ="${BACKUP_SQL_GZ:-${REMOTE_DIR}/xbh-new-api-2026-05-23-172431.sql.gz}"
POSTGRES_VOLUME="${POSTGRES_VOLUME:-easyapi-portal_pg_data_test}"

if [ ! -f "${BACKUP_SQL_GZ}" ]; then
  echo "Production backup not found: ${BACKUP_SQL_GZ}" >&2
  exit 1
fi

cd "${REMOTE_DIR}"

echo "Restoring staging DB from ${BACKUP_SQL_GZ} (project=${COMPOSE_PROJECT}) ..."
docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" down
docker volume rm -f "${POSTGRES_VOLUME}" || true
export BACKUP_SQL_GZ
docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" up -d

docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" ps
echo "Staging stack started; Postgres should import ${BACKUP_SQL_GZ} on first init."
