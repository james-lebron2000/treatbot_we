#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROLLBACK_SCRIPT="$ROOT_DIR/scripts/release-rollback.sh"
SMOKE_SCRIPT="$ROOT_DIR/scripts/smoke.sh"

BASE_URL="${BASE_URL:-https://inseq.top}"
FILE_PATH="${FILE_PATH:-}"
WEAPP_CODE="${WEAPP_CODE:-}"
TOKEN="${TOKEN:-}"
H5_PHONE="${H5_PHONE:-}"
H5_CODE="${H5_CODE:-000000}"
ENABLE_TRIAL_FLOW="${ENABLE_TRIAL_FLOW:-0}"

echo "release deploy starting..."

snapshot_output="$("$ROLLBACK_SCRIPT" snapshot)"
release_id="$(printf '%s' "$snapshot_output" | awk '{print $NF}')"
echo "snapshot id: $release_id"

deploy_ok=0
set +e
(cd "$ROOT_DIR" && docker compose up -d --build api)
deploy_status=$?
if [ "$deploy_status" -eq 0 ]; then
  BASE_URL="$BASE_URL" \
  FILE_PATH="$FILE_PATH" \
  WEAPP_CODE="$WEAPP_CODE" \
  TOKEN="$TOKEN" \
  H5_PHONE="$H5_PHONE" \
  H5_CODE="$H5_CODE" \
  ENABLE_TRIAL_FLOW="$ENABLE_TRIAL_FLOW" \
  "$SMOKE_SCRIPT"
  deploy_status=$?
fi

if [ "$deploy_status" -eq 0 ]; then
  deploy_ok=1
fi
set -e

if [ "$deploy_ok" -eq 1 ]; then
  echo "release deploy succeeded"
  exit 0
fi

echo "release deploy failed, start rollback: $release_id"
"$ROLLBACK_SCRIPT" rollback "$release_id"
echo "rollback completed"
exit 1

