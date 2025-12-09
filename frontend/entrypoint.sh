#!/bin/sh
set -eu

CONFIG_FILE="/config/api-base-url"
DEFAULT_API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"

if [ -f "$CONFIG_FILE" ]; then
  BASE_URL=$(tr -d '\r\n ' < "$CONFIG_FILE")
elif [ -n "$DEFAULT_API_BASE_URL" ]; then
  BASE_URL="$DEFAULT_API_BASE_URL"
else
  BASE_URL="http://localhost:8000"
fi

cat <<EOF_CONF >/usr/share/nginx/html/env-config.js
window.__ENV__ = {
  API_BASE_URL: '${BASE_URL}'
}
EOF_CONF

exec nginx -g 'daemon off;'
