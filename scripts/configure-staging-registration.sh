#!/usr/bin/env bash
# Allow API registration for screenshot seeding on staging (after production snapshot restore).
# Only touches easyapi-portal test stack.

set -euo pipefail

REMOTE_DIR="${REMOTE_DIR:-/opt/easyapi-portal-test}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-easyapi-portal}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.easyapi-portal-test.yml}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-easyapi-portal-postgres-test}"
POSTGRES_USER="${POSTGRES_USER:-newapi}"
POSTGRES_DB="${POSTGRES_DB:-new-api}"

cd "${REMOTE_DIR}"

psql_exec() {
  docker exec "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 -c "$1"
}

echo "Updating NewAPI options for staging registration ..."
psql_exec "UPDATE options SET value = 'false' WHERE key = 'EmailDomainRestrictionEnabled';"
psql_exec "INSERT INTO options (key, value) VALUES ('RegisterEnabled', 'true') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;"
psql_exec "UPDATE options SET value = 'false' WHERE key = 'EmailVerificationEnabled';"
psql_exec "UPDATE options SET value = 'false' WHERE key = 'TurnstileCheckEnabled';"

echo "Restarting new-api-test and portal-test ..."
docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" restart new-api-test portal-test

echo "Registration options applied."
