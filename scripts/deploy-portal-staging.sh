#!/usr/bin/env bash
# Deploy only portal-test on the easyapi-portal staging stack.
#
# Required: PORTAL_IMAGE (full GHCR ref, e.g. ghcr.io/k4f7/easyapi/newapi-portal:dev-latest)
#
# Optional: REMOTE_DIR, COMPOSE_PROJECT, COMPOSE_FILE, SERVICE_NAME
# Optional runtime env for portal-test compose interpolation:
#   IMAGE_PLAYGROUND_ALLOWED_ORIGIN, IMAGE_PLAYGROUND_URL
# Optional GHCR login: GHCR_PULL_USER + GHCR_PULL_TOKEN (read:packages PAT)
#
# FORBIDDEN (do not add to this script):
#   - docker compose down for the full stack
#   - deleting postgres/redis/new-api volumes or containers
#   - operating compose projects other than easyapi-portal
#   - touching official-newapi, portal-migration-test, etc.

set -euo pipefail

: "${PORTAL_IMAGE:?PORTAL_IMAGE is required}"

REMOTE_DIR="${REMOTE_DIR:-/opt/easyapi-portal-test}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-easyapi-portal}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.easyapi-portal-test.yml}"
SERVICE_NAME="${SERVICE_NAME:-portal-test}"

if [ -n "${GHCR_PULL_TOKEN:-}" ]; then
  : "${GHCR_PULL_USER:?GHCR_PULL_USER is required when GHCR_PULL_TOKEN is set}"
  echo "${GHCR_PULL_TOKEN}" | docker login ghcr.io -u "${GHCR_PULL_USER}" --password-stdin
fi

cd "${REMOTE_DIR}"

echo "Pulling ${PORTAL_IMAGE} ..."
pull_ok=0
for attempt in 1 2 3 4 5; do
  if docker pull "${PORTAL_IMAGE}"; then
    pull_ok=1
    break
  fi
  echo "docker pull failed (attempt ${attempt}/5), retrying in 15s ..."
  sleep 15
done
if [ "${pull_ok}" -ne 1 ]; then
  echo "docker pull failed after retries: ${PORTAL_IMAGE}" >&2
  exit 1
fi

echo "Recreating ${SERVICE_NAME} only (project=${COMPOSE_PROJECT}) ..."
export PORTAL_IMAGE
export IMAGE_PLAYGROUND_ALLOWED_ORIGIN="${IMAGE_PLAYGROUND_ALLOWED_ORIGIN:-}"
export IMAGE_PLAYGROUND_URL="${IMAGE_PLAYGROUND_URL:-}"
docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" \
  up -d --no-deps --force-recreate "${SERVICE_NAME}"

docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" ps "${SERVICE_NAME}"
echo "Deploy finished: ${PORTAL_IMAGE} -> ${SERVICE_NAME}"
