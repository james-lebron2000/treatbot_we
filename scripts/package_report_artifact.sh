#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-scripts/output}"
STAMP="${REPORT_ARTIFACT_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
ZIP_NAME="treatbot-match-report-${STAMP}.zip"

if [ ! -d "$OUT_DIR" ]; then
  echo "Missing output directory: $OUT_DIR" >&2
  exit 1
fi

for required in html match_report.md match_results.json run_metadata.json; do
  if [ ! -e "$OUT_DIR/$required" ]; then
    echo "Missing report output: $OUT_DIR/$required" >&2
    exit 1
  fi
done

if ! command -v zip >/dev/null 2>&1; then
  echo "zip is required to package the report artifact" >&2
  exit 1
fi

(
  cd "$OUT_DIR"
  rm -f treatbot-match-report-*.zip
  zip -r -X "$ZIP_NAME" html match_report.md match_results.json run_metadata.json
)

echo "$OUT_DIR/$ZIP_NAME"
