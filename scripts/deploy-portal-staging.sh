#!/usr/bin/env bash
# Deploy portal-test, new-api-test, and image-playground-test on the easyapi-portal staging stack.
#
# Required: PORTAL_IMAGE (full GHCR ref, e.g. ghcr.io/k4f7/easyapi/newapi-portal:dev-latest)
#
# Optional: REMOTE_DIR, COMPOSE_PROJECT, COMPOSE_FILE, SERVICE_NAME
# Optional runtime env for compose interpolation:
#   IMAGE_PLAYGROUND_INTERNAL_URL
#   NEWAPI_IMAGE (default calciumion/new-api:latest)
#   IMAGE_PLAYGROUND_IMAGE (default ghcr.io/cooksleep/gpt_image_playground:latest)
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
NEWAPI_IMAGE="${NEWAPI_IMAGE:-calciumion/new-api:latest}"
IMAGE_PLAYGROUND_IMAGE="${IMAGE_PLAYGROUND_IMAGE:-ghcr.io/cooksleep/gpt_image_playground:latest}"
DEPLOY_SERVICES="${DEPLOY_SERVICES:-new-api-test image-playground-test portal-test}"

if [ -n "${GHCR_PULL_TOKEN:-}" ]; then
  : "${GHCR_PULL_USER:?GHCR_PULL_USER is required when GHCR_PULL_TOKEN is set}"
  echo "${GHCR_PULL_TOKEN}" | docker login ghcr.io -u "${GHCR_PULL_USER}" --password-stdin
fi

cd "${REMOTE_DIR}"

pull_image() {
  local image="$1"
  local pull_ok=0

  echo "Pulling ${image} ..."
  for attempt in 1 2 3 4 5; do
    if docker pull "${image}"; then
      pull_ok=1
      break
    fi
    echo "docker pull failed (attempt ${attempt}/5), retrying in 15s ..."
    sleep 15
  done

  if [ "${pull_ok}" -ne 1 ]; then
    echo "docker pull failed after retries: ${image}" >&2
    exit 1
  fi
}

pull_image "${PORTAL_IMAGE}"
pull_image "${NEWAPI_IMAGE}"
pull_image "${IMAGE_PLAYGROUND_IMAGE}"

echo "Recreating ${DEPLOY_SERVICES} (project=${COMPOSE_PROJECT}) ..."
export PORTAL_IMAGE
export NEWAPI_IMAGE
export IMAGE_PLAYGROUND_IMAGE
export IMAGE_PLAYGROUND_INTERNAL_URL="${IMAGE_PLAYGROUND_INTERNAL_URL:-}"

# shellcheck disable=SC2086
docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" \
  up -d --no-deps --force-recreate ${DEPLOY_SERVICES}

docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" ps ${DEPLOY_SERVICES}
echo "Deploy finished:"
echo "  portal=${PORTAL_IMAGE}"
echo "  newapi=${NEWAPI_IMAGE}"
echo "  image-playground=${IMAGE_PLAYGROUND_IMAGE}"
