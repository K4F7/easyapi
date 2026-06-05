#!/usr/bin/env bash
# Verify the Portal same-origin image Playground embed endpoint returns safe headers.
#
# Usage:
#   TARGET_URL=https://test.easyapi.work/playground/embed ./scripts/verify-image-playground-headers.sh
set -euo pipefail

TARGET_URL="${TARGET_URL:-https://test.easyapi.work/playground/embed}"

echo "Checking ${TARGET_URL} ..."

headers="$(curl -fsSIL "${TARGET_URL}")"

echo "${headers}" | grep -i "^content-security-policy:" | grep -qi "frame-src 'self'" \
  || { echo "Missing same-origin frame-src policy" >&2; exit 1; }

if echo "${headers}" | grep -i "^content-security-policy:" | grep -qi "image.easyapi.work"; then
  echo "CSP still references external image playground origin" >&2
  exit 1
fi

if echo "${headers}" | grep -i "^referrer-policy:" | grep -qi "unsafe-url"; then
  echo "Referrer-Policy is still unsafe-url" >&2
  exit 1
fi

echo "OK: same-origin embed headers present on ${TARGET_URL}"
