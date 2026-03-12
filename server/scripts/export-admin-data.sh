#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000/api}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
EXPORT_TYPE="${1:-records}"
EXPORT_SCOPE="${2:-all}"
EXPORT_FORMAT="${EXPORT_FORMAT:-json}"
OUTPUT_DIR="${OUTPUT_DIR:-./exports}"
DATE_VALUE="${DATE_VALUE:-$(date +%F)}"

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "ADMIN_TOKEN is required" >&2
  exit 1
fi

case "$EXPORT_TYPE" in
  records|users) ;;
  *)
    echo "type must be records or users" >&2
    exit 1
    ;;
esac

mkdir -p "$OUTPUT_DIR"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_FILE="$OUTPUT_DIR/${EXPORT_TYPE}_${EXPORT_SCOPE}_${TIMESTAMP}.${EXPORT_FORMAT}"
URL="$BASE_URL/admin/exports/$EXPORT_TYPE?format=$EXPORT_FORMAT"

if [[ "$EXPORT_SCOPE" == "day" ]]; then
  URL="$URL&date=$DATE_VALUE"
fi

curl -fSL "$URL" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -o "$OUTPUT_FILE"

echo "exported: $OUTPUT_FILE"
