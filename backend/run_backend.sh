#!/usr/bin/env bash
set -euo pipefail

python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

if [ -f .env ]; then
  # Export variables from the local .env file so uvicorn picks up host/port overrides.
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

HOST="${APP_HOST:-0.0.0.0}"
PORT="${APP_PORT:-8000}"

uvicorn main:app --host "${HOST}" --port "${PORT}" --reload
