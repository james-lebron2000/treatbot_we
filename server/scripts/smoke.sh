#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-https://inseq.top}"
FILE_PATH="${FILE_PATH:-}"
WEAPP_CODE="${WEAPP_CODE:-}"
TOKEN="${TOKEN:-}"
H5_PHONE="${H5_PHONE:-}"
H5_CODE="${H5_CODE:-000000}"
ENABLE_TRIAL_FLOW="${ENABLE_TRIAL_FLOW:-0}"
POLL_MAX="${POLL_MAX:-20}"
POLL_INTERVAL="${POLL_INTERVAL:-3}"
HEALTH_RETRIES="${HEALTH_RETRIES:-6}"
HEALTH_RETRY_INTERVAL="${HEALTH_RETRY_INTERVAL:-2}"

PASS=0
FAIL=0
WARN=0

json_get() {
  local expr="$1"
  node -e "const fs=require('fs');const raw=fs.readFileSync(0,'utf8');const data=raw?JSON.parse(raw):{};const v=(()=>{${expr}})();if(v===undefined||v===null){process.exit(2)};if(typeof v==='object'){process.stdout.write(JSON.stringify(v));}else{process.stdout.write(String(v));}" 2>/dev/null
}

step_ok() {
  PASS=$((PASS + 1))
  echo "[PASS] $1"
}

step_fail() {
  FAIL=$((FAIL + 1))
  echo "[FAIL] $1"
}

step_warn() {
  WARN=$((WARN + 1))
  echo "[WARN] $1"
}

require_code_zero() {
  local payload="$1"
  if printf '%s' "$payload" | json_get "return data.code===0?1:null" >/dev/null; then
    return 0
  fi
  return 1
}

echo "Smoke target: $BASE_URL"

# 1) health
health_resp=""
for _ in $(seq 1 "$HEALTH_RETRIES"); do
  health_resp="$(curl -fsS -m 15 "$BASE_URL/health" || true)"
  if [ -n "$health_resp" ] && printf '%s' "$health_resp" | json_get "return data.status" | grep -q '^ok$'; then
    break
  fi
  sleep "$HEALTH_RETRY_INTERVAL"
done

if [ -n "$health_resp" ] && printf '%s' "$health_resp" | json_get "return data.status" | grep -q '^ok$'; then
  step_ok "GET /health"
else
  step_fail "GET /health"
fi

# 2) login
if [ -z "$TOKEN" ]; then
  if [ -n "$WEAPP_CODE" ]; then
    login_resp="$(curl -fsS -m 20 -X POST "$BASE_URL/api/auth/weapp-login" \
      -H 'Content-Type: application/json' \
      -d "{\"code\":\"$WEAPP_CODE\"}" || true)"
    if [ -n "$login_resp" ] && require_code_zero "$login_resp"; then
      TOKEN="$(printf '%s' "$login_resp" | json_get "return data.data&&data.data.token")"
      step_ok "POST /api/auth/weapp-login"
    else
      step_fail "POST /api/auth/weapp-login"
    fi
  elif [ -n "$H5_PHONE" ]; then
    h5_resp="$(curl -fsS -m 20 -X POST "$BASE_URL/api/auth/h5-login" \
      -H 'Content-Type: application/json' \
      -d "{\"phone\":\"$H5_PHONE\",\"code\":\"$H5_CODE\"}" || true)"
    if [ -n "$h5_resp" ] && require_code_zero "$h5_resp"; then
      TOKEN="$(printf '%s' "$h5_resp" | json_get "return data.data&&data.data.token")"
      step_ok "POST /api/auth/h5-login"
    else
      step_fail "POST /api/auth/h5-login"
    fi
  else
    step_warn "No TOKEN/WEAPP_CODE/H5_PHONE provided; authenticated checks are skipped"
  fi
fi

FILE_ID=""
RECORD_ID=""
TRIAL_ID=""

if [ -n "$TOKEN" ]; then
  # 3) profile
  profile_resp="$(curl -fsS -m 20 "$BASE_URL/api/auth/profile" -H "Authorization: Bearer $TOKEN" || true)"
  if [ -n "$profile_resp" ] && require_code_zero "$profile_resp"; then
    step_ok "GET /api/auth/profile"
  else
    step_fail "GET /api/auth/profile"
  fi

  # 4) upload + parse
  if [ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ]; then
    upload_resp="$(curl -fsS -m 60 -X POST "$BASE_URL/api/medical/upload" \
      -H "Authorization: Bearer $TOKEN" \
      -F "file=@$FILE_PATH" \
      -F "type=auto" \
      -F "remark=smoke" || true)"
    if [ -n "$upload_resp" ] && require_code_zero "$upload_resp"; then
      FILE_ID="$(printf '%s' "$upload_resp" | json_get "return data.data&&data.data.fileId")"
      RECORD_ID="$FILE_ID"
      step_ok "POST /api/medical/upload"
    else
      step_fail "POST /api/medical/upload"
    fi

    if [ -n "$FILE_ID" ]; then
      final_status=""
      for _ in $(seq 1 "$POLL_MAX"); do
        parse_resp="$(curl -fsS -m 20 "$BASE_URL/api/medical/parse-status?fileId=$FILE_ID" \
          -H "Authorization: Bearer $TOKEN" || true)"
        if [ -n "$parse_resp" ] && require_code_zero "$parse_resp"; then
          status="$(printf '%s' "$parse_resp" | json_get "return data.data&&data.data.status" || true)"
          if [ "$status" = "completed" ] || [ "$status" = "error" ]; then
            final_status="$status"
            break
          fi
        fi
        sleep "$POLL_INTERVAL"
      done

      if [ "$final_status" = "completed" ]; then
        step_ok "GET /api/medical/parse-status => completed"
      elif [ "$final_status" = "error" ]; then
        step_fail "GET /api/medical/parse-status => error"
      else
        step_fail "GET /api/medical/parse-status => timeout"
      fi

      records_resp="$(curl -fsS -m 20 "$BASE_URL/api/medical/records?page=1&pageSize=20" \
        -H "Authorization: Bearer $TOKEN" || true)"
      if [ -n "$records_resp" ] && require_code_zero "$records_resp"; then
        step_ok "GET /api/medical/records"
      else
        step_fail "GET /api/medical/records"
      fi

      matches_resp="$(curl -fsS -m 20 \
        "$BASE_URL/api/matches?page=1&pageSize=20&recordId=$RECORD_ID&filters=%7B%22disease%22%3A%22%E8%82%BA%E7%99%8C%22%7D" \
        -H "Authorization: Bearer $TOKEN" || true)"
      if [ -n "$matches_resp" ] && require_code_zero "$matches_resp"; then
        step_ok "GET /api/matches"
        TRIAL_ID="$(printf '%s' "$matches_resp" | json_get "const list=(data.data&&Array.isArray(data.data)?data.data:(data.data&&data.data.list)||[]);return list[0]&&list[0].id" || true)"
      else
        step_fail "GET /api/matches"
      fi
    fi
  else
    step_warn "FILE_PATH not provided or file missing; upload/parse checks are skipped"
  fi

  # 5) optional trial flow
  if [ "$ENABLE_TRIAL_FLOW" = "1" ]; then
    trials_resp="$(curl -fsS -m 20 "$BASE_URL/api/trials/search?page=1&pageSize=20&keyword=%E8%82%BA%E7%99%8C" \
      -H "Authorization: Bearer $TOKEN" || true)"
    if [ -n "$trials_resp" ] && require_code_zero "$trials_resp"; then
      step_ok "GET /api/trials/search"
      if [ -z "$TRIAL_ID" ]; then
        TRIAL_ID="$(printf '%s' "$trials_resp" | json_get "const list=(data.data&&data.data.list)||[];return list[0]&&list[0].id" || true)"
      fi
    else
      step_fail "GET /api/trials/search"
    fi

    if [ -n "$TRIAL_ID" ]; then
      detail_resp="$(curl -fsS -m 20 "$BASE_URL/api/trials/$TRIAL_ID" -H "Authorization: Bearer $TOKEN" || true)"
      if [ -n "$detail_resp" ] && require_code_zero "$detail_resp"; then
        step_ok "GET /api/trials/:id"
      else
        step_fail "GET /api/trials/:id"
      fi

      apply_resp="$(curl -fsS -m 20 -X POST "$BASE_URL/api/applications" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: smoke-$(date +%s)" \
        -d "{\"trialId\":\"$TRIAL_ID\",\"recordIds\":[\"$RECORD_ID\"],\"remark\":\"smoke\"}" || true)"
      if [ -n "$apply_resp" ] && require_code_zero "$apply_resp"; then
        step_ok "POST /api/applications"
      else
        step_fail "POST /api/applications"
      fi
    else
      step_warn "No trialId available; trial apply checks are skipped"
    fi
  fi
fi

echo "----------------------------------------"
echo "Smoke summary: PASS=$PASS FAIL=$FAIL WARN=$WARN"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
