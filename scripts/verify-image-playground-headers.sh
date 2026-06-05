#!/usr/bin/env bash
# Verify image.easyapi.work (or IMAGE_PLAYGROUND_URL) returns embed security headers.
set -euo pipefail

BASE_URL="${IMAGE_PLAYGROUND_URL:-https://image.easyapi.work}"
BASE_URL="${BASE_URL%/}"

echo "Checking ${BASE_URL}/ ..."

headers="$(curl -fsSI "${BASE_URL}/")"

echo "${headers}" | grep -i "^content-security-policy:" | grep -qi "frame-ancestors https://test.easyapi.work" \
  || { echo "Missing frame-ancestors for test.easyapi.work" >&2; exit 1; }

echo "${headers}" | grep -i "^content-security-policy:" | grep -qi "https://easyapi.work" \
  || { echo "Missing frame-ancestors for easyapi.work" >&2; exit 1; }

echo "${headers}" | grep -i "^cache-control:" | grep -qi "no-store" \
  || { echo "Missing Cache-Control: no-store" >&2; exit 1; }

if echo "${headers}" | grep -i "^referrer-policy:" | grep -qi "unsafe-url"; then
  echo "Referrer-Policy is still unsafe-url — update openresty snippet" >&2
  exit 1
fi

echo "OK: embed security headers present on ${BASE_URL}"
