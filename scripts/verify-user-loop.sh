#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-https://inseq.top}"
TOKEN="${TOKEN:-}"
TREATBOT_PHONE="${TREATBOT_PHONE:-}"
TREATBOT_CODE="${TREATBOT_CODE:-000000}"
POLL_MAX="${POLL_MAX:-80}"
POLL_INTERVAL="${POLL_INTERVAL:-5}"
FILE_PATHS_CSV="${FILE_PATHS:-server/public/demo/sample-2-nsclc.jpg}"

json_get() {
  local expr="$1"
  node -e "const fs=require('fs');const raw=fs.readFileSync(0,'utf8');const data=raw?JSON.parse(raw):{};const v=(()=>{${expr}})();if(v===undefined||v===null){process.exit(2)};if(typeof v==='object'){process.stdout.write(JSON.stringify(v));}else{process.stdout.write(String(v));}" 2>/dev/null
}

require_code_zero() {
  local payload="$1"
  printf '%s' "$payload" | json_get "return data.code===0?1:null" >/dev/null
}

echo "Target: $BASE_URL"

health="$(curl -fsS -m 15 "$BASE_URL/health")"
printf '%s' "$health" | json_get "return data.status" | grep -Eq '^(ok|OK)$'
echo "ok: health"

unauth_stream="$(curl -sS -m 15 -i "$BASE_URL/api/medical/parse-status-stream?recordIds=probe" || true)"
printf '%s' "$unauth_stream" | grep -q 'HTTP/.* 401'
echo "ok: unauthenticated parse-status-stream returns 401"

if [ -z "$TOKEN" ]; then
  if [ -z "$TREATBOT_PHONE" ]; then
    echo "Set TOKEN or TREATBOT_PHONE to run authenticated upload/OCR checks." >&2
    exit 2
  fi
  login_resp="$(curl -fsS -m 20 -X POST "$BASE_URL/api/auth/treatbot-login" \
    -H 'Content-Type: application/json' \
    -d "{\"phone\":\"$TREATBOT_PHONE\",\"code\":\"$TREATBOT_CODE\"}")"
  require_code_zero "$login_resp"
  TOKEN="$(printf '%s' "$login_resp" | json_get "return data.data&&data.data.token")"
  echo "ok: treatbot login"
fi

sts_resp="$(curl -fsS -m 20 "$BASE_URL/api/medical/upload-sts?count=1&originalNames=smoke.jpg&types=image/jpeg" \
  -H "Authorization: Bearer $TOKEN")"
require_code_zero "$sts_resp"
echo "ok: upload-sts"

IFS=',' read -r -a raw_files <<< "$FILE_PATHS_CSV"
files=()
for f in "${raw_files[@]}"; do
  if [[ "$f" != /* ]]; then
    f="$ROOT_DIR/$f"
  fi
  if [ ! -f "$f" ]; then
    echo "Missing fixture: $f" >&2
    exit 2
  fi
  files+=("$f")
done

curl_args=(-fsS -m 120 -X POST "$BASE_URL/api/medical/upload-batch" -H "Authorization: Bearer $TOKEN" -F "type=auto" -F "remark=production-user-loop-smoke")
for f in "${files[@]}"; do
  curl_args+=(-F "files=@$f")
done
upload_resp="$(curl "${curl_args[@]}")"
require_code_zero "$upload_resp"
file_ids="$(printf '%s' "$upload_resp" | json_get "return (data.data&&data.data.fileIds||[]).join(',')")"
if [ -z "$file_ids" ]; then
  echo "upload-batch returned no fileIds" >&2
  exit 1
fi
echo "ok: upload-batch fileIds=$file_ids"

final_resp=""
ids_json="$(printf '%s' "$file_ids" | node -e "const fs=require('fs');const ids=fs.readFileSync(0,'utf8').trim().split(',').filter(Boolean);process.stdout.write(JSON.stringify(ids));")"
for _ in $(seq 1 "$POLL_MAX"); do
  final_resp="$(curl -fsS -m 30 -X POST "$BASE_URL/api/medical/parse-status-batch" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"fileIds\":$ids_json}" || true)"
  if [ -n "$final_resp" ] && require_code_zero "$final_resp"; then
    done_flag="$(printf '%s' "$final_resp" | json_get "return data.data&&data.data.done?1:0" || true)"
    if [ "$done_flag" = "1" ]; then
      break
    fi
  fi
  sleep "$POLL_INTERVAL"
done

require_code_zero "$final_resp"
completed="$(printf '%s' "$final_resp" | json_get "return data.data&&data.data.completedCount")"
if [ "${completed:-0}" -lt 1 ]; then
  echo "No completed OCR entry. Response:" >&2
  printf '%s\n' "$final_resp" >&2
  exit 1
fi
printf '%s' "$final_resp" | json_get "const e=(data.data.entries||[]).find(x=>x.status==='completed'&&x.result); return e.result.entities&&Object.keys(e.result.entities).length?1:null" >/dev/null
printf '%s' "$final_resp" | json_get "const e=(data.data.entries||[]).find(x=>x.status==='completed'&&x.result); return e.result.diagnosis||e.result.entities.diagnosis" >/dev/null
record_id="$(printf '%s' "$final_resp" | json_get "const e=(data.data.entries||[]).find(x=>x.status==='completed'&&x.recordId); return e.recordId")"
echo "ok: parse-status-batch completed recordId=$record_id"

detail_resp="$(curl -fsS -m 20 "$BASE_URL/api/medical/records/$record_id" -H "Authorization: Bearer $TOKEN")"
require_code_zero "$detail_resp"
printf '%s' "$detail_resp" | json_get "return data.data&&data.data.structured&&data.data.structured.entities&&Object.keys(data.data.structured.entities).length?1:null" >/dev/null
echo "ok: records/:id structured readback"

stream_resp="$(curl -fsS -N -m 20 "$BASE_URL/api/medical/parse-status-stream?recordIds=$record_id&afterSeq=$record_id:0" \
  -H "Authorization: Bearer $TOKEN" || true)"
printf '%s' "$stream_resp" | grep -q '^event: state'
printf '%s' "$stream_resp" | grep -q '^event: done'
printf '%s' "$stream_resp" | grep -q '"entities"'
if printf '%s' "$stream_resp" | grep -q '"rawText"'; then
  echo "parse-status-stream leaked rawText while OCR_STREAM_RAW_TEXT_ENABLED is default-off" >&2
  exit 1
fi
echo "ok: parse-status-stream replay"

matches_resp="$(curl -fsS -m 30 "$BASE_URL/api/matches?recordId=$record_id&page=1&pageSize=20" -H "Authorization: Bearer $TOKEN")"
require_code_zero "$matches_resp"
echo "ok: matches read"

echo "User loop smoke passed."
