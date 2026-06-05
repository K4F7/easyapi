#!/usr/bin/env bash
# Apply embed security headers on image.easyapi.work (1Panel openresty on staging).
#
# Run on the staging host (root@45.142.115.128) or via:
#   ssh root@45.142.115.128 'bash -s' < scripts/configure-image-playground-openresty.sh
#
# Idempotent: re-running overwrites root.conf with the expected security headers.

set -euo pipefail

OPENRESTY_CONTAINER="${OPENRESTY_CONTAINER:-1Panel-openresty-1TFn}"
CONF="${IMAGE_PLAYGROUND_OPENRESTY_CONF:-/opt/1panel/www/sites/image.easyapi.work/proxy/root.conf}"
UPSTREAM_PORT="${IMAGE_PLAYGROUND_UPSTREAM_PORT:-2334}"
PORTAL_ORIGINS="${IMAGE_PLAYGROUND_FRAME_ANCESTORS:-https://test.easyapi.work https://easyapi.work}"

if [ ! -f "${CONF}" ]; then
  echo "Missing openresty site config: ${CONF}" >&2
  exit 1
fi

backup="${CONF}.backup-$(date +%Y%m%d%H%M%S)"
cp "${CONF}" "${backup}"
echo "Backed up ${CONF} -> ${backup}"

cat > "${CONF}" <<EOF
location ^~ / {
    proxy_pass http://127.0.0.1:${UPSTREAM_PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Port \$server_port;
    proxy_set_header REMOTE-HOST \$remote_addr;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$http_connection;
    proxy_http_version 1.1;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_buffering off;

    proxy_hide_header Referrer-Policy;
    add_header Content-Security-Policy "frame-ancestors ${PORTAL_ORIGINS}" always;
    add_header Cache-Control "no-store" always;
    add_header Referrer-Policy "no-referrer" always;
}
EOF

docker exec "${OPENRESTY_CONTAINER}" openresty -t
docker exec "${OPENRESTY_CONTAINER}" openresty -s reload

echo "Verifying https://image.easyapi.work/ ..."
headers="$(curl -fsSI "https://image.easyapi.work/")"
echo "${headers}" | grep -i "^content-security-policy:" | grep -qi "frame-ancestors" \
  || { echo "frame-ancestors header missing" >&2; exit 1; }
echo "${headers}" | grep -i "^cache-control:" | grep -qi "no-store" \
  || { echo "Cache-Control: no-store missing" >&2; exit 1; }
echo "${headers}" | grep -i "^referrer-policy:" | grep -qi "no-referrer" \
  || { echo "Referrer-Policy: no-referrer missing" >&2; exit 1; }

echo "OK: image.easyapi.work embed security headers applied"
