#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROD_HOST="${PROD_HOST:-ubuntu@49.235.162.129}"
RELAY_HOST="${RELAY_HOST:-}"
IDENTITY_FILE="${DEPLOY_SSH_KEY_PATH:-}"
PUBLIC_URL="${PUBLIC_URL:-https://inseq.top}"
SHA="${SHA:-$(git rev-parse HEAD)}"
BUILD_WEB=1
PROMOTE_WEB=1
APPLY_CADDY=1
RUN_SMOKE=1
GHCR_IMAGE_ARG="${GHCR_IMAGE:-}"
GHCR_IMAGE=""
GHCR_USER="${GHCR_USER:-}"
GHCR_TOKEN="${GHCR_TOKEN:-}"

usage() {
  cat <<'USAGE'
Deploy production without GitHub Actions.

Usage:
  scripts/deploy-production.sh [options]

Options:
  --prod USER@HOST        Production SSH target. Default: ubuntu@49.235.162.129
  --relay USER@HOST       Optional SSH ProxyJump relay, e.g. root@45.32.219.241
  --identity FILE         SSH private key file. Default: SSH agent/config
  --sha SHA               Git commit to package. Default: current HEAD
  --skip-web-build        Reuse existing web/dist instead of running npm ci && npm run build
  --backend-only          Deploy backend only; do not upload/promote web and do not patch Caddyfile
  --no-caddy              Do not replace /etc/caddy/Caddyfile
  --no-smoke              Skip public smoke checks after deployment
  --public-url URL        Public base URL for smoke checks. Default: https://inseq.top
  --ghcr-image IMAGE      Optional GHCR image to pull before local build fallback
  --ghcr-user USER        GHCR username. Default: $GHCR_USER
  --ghcr-token TOKEN      GHCR token. Default: $GHCR_TOKEN
  -h, --help              Show this help

Sensitive OCR credentials are not required locally. The script backs up the
existing treatbot-api container env on the server and reuses it. If KIMI_API_KEY
or ARK_API_KEY is set in the local environment, that value overrides the
server-side backup for this deploy.

Examples:
  scripts/deploy-production.sh
  scripts/deploy-production.sh --relay root@45.32.219.241
  scripts/deploy-production.sh --prod ubuntu@49.235.162.129 --backend-only
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --prod)
      PROD_HOST="${2:?missing --prod value}"
      shift 2
      ;;
    --relay)
      RELAY_HOST="${2:?missing --relay value}"
      shift 2
      ;;
    --identity)
      IDENTITY_FILE="${2:?missing --identity value}"
      shift 2
      ;;
    --sha)
      SHA="${2:?missing --sha value}"
      shift 2
      ;;
    --skip-web-build)
      BUILD_WEB=0
      shift
      ;;
    --backend-only)
      BUILD_WEB=0
      PROMOTE_WEB=0
      APPLY_CADDY=0
      shift
      ;;
    --no-caddy)
      APPLY_CADDY=0
      shift
      ;;
    --no-smoke)
      RUN_SMOKE=0
      shift
      ;;
    --public-url)
      PUBLIC_URL="${2:?missing --public-url value}"
      shift 2
      ;;
    --ghcr-image)
      GHCR_IMAGE_ARG="${2:?missing --ghcr-image value}"
      shift 2
      ;;
    --ghcr-user)
      GHCR_USER="${2:?missing --ghcr-user value}"
      shift 2
      ;;
    --ghcr-token)
      GHCR_TOKEN="${2:?missing --ghcr-token value}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -n "$GHCR_IMAGE_ARG" ]; then
  GHCR_IMAGE="$GHCR_IMAGE_ARG"
else
  GHCR_IMAGE="ghcr.io/james-lebron2000/treatbot-api:${SHA}"
fi

if [ ! -f server/Dockerfile ] || [ ! -f web/package.json ] || [ ! -f deploy/Caddyfile ]; then
  echo "Run this script from the repository root, or keep it under scripts/." >&2
  exit 1
fi

if ! git cat-file -e "${SHA}^{commit}" 2>/dev/null; then
  echo "Commit not found: $SHA" >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Warning: working tree has uncommitted changes. Server source tarball uses committed SHA $SHA." >&2
fi

SSH_OPTS=(
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=20
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=4
  -o LogLevel=ERROR
)

if [ -n "$IDENTITY_FILE" ]; then
  SSH_OPTS+=(-i "$IDENTITY_FILE")
fi

if [ -n "$RELAY_HOST" ]; then
  SSH_OPTS+=(-J "$RELAY_HOST")
fi

q() {
  printf "%q" "$1"
}

remote_env() {
  printf 'SHA=%s ' "$(q "$SHA")"
  printf 'GHCR_IMAGE=%s ' "$(q "$GHCR_IMAGE")"
  printf 'GHCR_USER=%s ' "$(q "$GHCR_USER")"
  printf 'GHCR_TOKEN=%s ' "$(q "$GHCR_TOKEN")"
  printf 'PROMOTE_WEB=%s ' "$(q "$PROMOTE_WEB")"
  printf 'APPLY_CADDY=%s ' "$(q "$APPLY_CADDY")"
  printf 'RUN_SMOKE=%s ' "$(q "$RUN_SMOKE")"
  printf 'PUBLIC_URL=%s ' "$(q "$PUBLIC_URL")"
  printf 'KIMI_API_KEY=%s ' "$(q "${KIMI_API_KEY:-}")"
  printf 'ARK_API_KEY=%s ' "$(q "${ARK_API_KEY:-}")"
}

remote() {
  ssh "${SSH_OPTS[@]}" "$PROD_HOST" "$@"
}

echo "Deploy target: $PROD_HOST"
if [ -n "$RELAY_HOST" ]; then
  echo "SSH relay: $RELAY_HOST"
fi
echo "Commit: $SHA"

if [ "$BUILD_WEB" = "1" ]; then
  echo "Building Treatbot web dist..."
  (cd web && npm ci && npm run build)
else
  echo "Skipping web build."
fi

if [ "$PROMOTE_WEB" = "1" ] && [ ! -f web/dist/index.html ]; then
  echo "web/dist/index.html missing. Run without --skip-web-build or build web first." >&2
  exit 1
fi

RELEASE_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$RELEASE_DIR"
}
trap cleanup EXIT

mkdir -p "$RELEASE_DIR/deploy"

if [ "$PROMOTE_WEB" = "1" ]; then
  echo "Packing web/dist..."
  tar -czf "$RELEASE_DIR/web-dist.tar.gz" -C web/dist .
fi

echo "Packing server source from git commit..."
git archive --format=tar "$SHA" server shared .dockerignore | gzip -9 > "$RELEASE_DIR/server-src.tar.gz"
cp deploy/Caddyfile "$RELEASE_DIR/deploy/Caddyfile"
cp deploy/nginx-patch.conf "$RELEASE_DIR/deploy/nginx-patch.conf"

echo "Release files:"
find "$RELEASE_DIR" -maxdepth 2 -type f -exec ls -lh {} \;

echo "Preparing remote upload directory..."
remote 'rm -rf /tmp/treatbot-upload /tmp/deploy && mkdir -p /tmp/treatbot-upload/deploy /tmp/deploy'

echo "Uploading release control files via tar-over-ssh..."
tar -czf - -C "$RELEASE_DIR" . | remote 'tar -xzf - -C /tmp/treatbot-upload'

echo "Promoting uploaded files on server..."
remote <<'REMOTE_UPLOAD'
set -euo pipefail
cd /tmp/treatbot-upload
if [ -f web-dist.tar.gz ]; then
  mv web-dist.tar.gz /tmp/web-dist.tar.gz
fi
mv server-src.tar.gz /tmp/server-src.tar.gz
mv deploy/Caddyfile /tmp/deploy/Caddyfile
mv deploy/nginx-patch.conf /tmp/deploy/nginx-patch.conf
rm -rf /tmp/treatbot-upload
ls -lh /tmp/server-src.tar.gz /tmp/deploy/Caddyfile /tmp/deploy/nginx-patch.conf
[ ! -f /tmp/web-dist.tar.gz ] || ls -lh /tmp/web-dist.tar.gz
REMOTE_UPLOAD

echo "Running remote deploy..."
remote "$(remote_env) bash -s" <<'REMOTE_DEPLOY'
set -euo pipefail

TS=$(date +%Y%m%d-%H%M%S)
exec > >(tee /tmp/treatbot-discovery.txt) 2>&1

SHA_TAG="treatbot-api:${SHA}"
BACKUP_ROOT="$HOME/treatbot-deploy-backups"
mkdir -p "$BACKUP_ROOT"

echo "===== Manual deploy $TS SHA=$SHA ====="

echo "::group::0) Preflight schema repair"
if docker inspect treatbot-api >/dev/null 2>&1; then
  REPAIR_PREFIX=""
  if command -v timeout >/dev/null 2>&1; then
    REPAIR_PREFIX="timeout 30s"
  fi
  $REPAIR_PREFIX docker exec treatbot-api node - <<'NODE' || echo "  ! preflight schema repair skipped"
const { sequelize } = require('./config/database');
const { DataTypes } = require('sequelize');
(async () => {
  const qi = sequelize.getQueryInterface();
  const table = await qi.describeTable('medical_records');
  const add = async (name, definition) => {
    if (table[name]) {
      console.log(`  ok medical_records.${name} exists`);
      return;
    }
    await qi.addColumn('medical_records', name, definition);
    console.log(`  ok added medical_records.${name}`);
  };
  await add('treatment_line', { type: DataTypes.INTEGER, allowNull: true });
  await add('pdl1', { type: DataTypes.STRING(64), allowNull: true });
  await add('deleted_at', { type: DataTypes.DATE, allowNull: true, defaultValue: null });
  await add('status_phase', { type: DataTypes.STRING(24), allowNull: true, defaultValue: null });
  await add('cancelled_at', { type: DataTypes.DATE, allowNull: true, defaultValue: null });
  await add('is_active', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
})()
  .then(async () => {
    try { await sequelize.close(); } catch (_) {}
    process.exit(0);
  })
  .catch(async (err) => {
    console.log(`  warn schema repair skipped: ${err && err.message ? err.message : err}`);
    try { await sequelize.close(); } catch (_) {}
    process.exit(0);
  });
NODE
else
  echo "  no existing treatbot-api container; skip"
fi
echo "::endgroup::"

echo "::group::A) Backend image prepare"
if [ -z "${SHA:-}" ]; then
  echo "Missing SHA env"
  exit 1
fi

IMAGE_READY=0
if docker image inspect "$SHA_TAG" >/dev/null 2>&1; then
  echo "  ok image $SHA_TAG already exists"
  IMAGE_READY=1
fi

if [ "$IMAGE_READY" != "1" ] && [ -n "${GHCR_IMAGE:-}" ] && [ -n "${GHCR_TOKEN:-}" ]; then
  echo "  pulling GHCR image: $GHCR_IMAGE"
  if echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-github-actions}" --password-stdin >/dev/null 2>&1; then
    if command -v timeout >/dev/null 2>&1; then
      timeout 8m docker pull "$GHCR_IMAGE" && IMAGE_READY=1 || IMAGE_READY=0
    else
      docker pull "$GHCR_IMAGE" && IMAGE_READY=1 || IMAGE_READY=0
    fi
    docker logout ghcr.io >/dev/null 2>&1 || true
    if [ "$IMAGE_READY" = "1" ]; then
      docker tag "$GHCR_IMAGE" "$SHA_TAG"
      echo "  ok GHCR image tagged as $SHA_TAG"
    else
      echo "  warn GHCR pull failed or timed out; will build locally"
    fi
  else
    echo "  warn GHCR login failed; will build locally"
  fi
else
  echo "  GHCR pull skipped; token missing or image already exists"
fi

TARBALL=/tmp/treatbot-api.tar.gz
if [ "$IMAGE_READY" != "1" ] && [ -f "$TARBALL" ]; then
  TARBALL_SIZE=$(stat -c '%s' "$TARBALL" 2>/dev/null || stat -f '%z' "$TARBALL")
  echo "  loading API image tarball: $((TARBALL_SIZE / 1024 / 1024)) MB"
  gunzip -c "$TARBALL" | docker load
  rm -f "$TARBALL"
  if docker image inspect "$SHA_TAG" >/dev/null 2>&1; then
    IMAGE_READY=1
    echo "  ok image tarball loaded as $SHA_TAG"
  else
    echo "  warn image tarball did not contain $SHA_TAG; will build locally"
  fi
fi

SOURCE_TARBALL=/tmp/server-src.tar.gz
BUILD_DIR=/tmp/treatbot-server-build.${TS}
if [ "$IMAGE_READY" != "1" ]; then
  if [ ! -f "$SOURCE_TARBALL" ]; then
    echo "  error source tarball missing: $SOURCE_TARBALL"
    exit 1
  fi

  echo "  building image locally from $SOURCE_TARBALL"
  LOCAL_BUILD_ARGS=(
    --build-arg "APT_DEBIAN_MIRROR=http://mirrors.cloud.tencent.com/debian"
    --build-arg "APT_SECURITY_MIRROR=http://mirrors.cloud.tencent.com/debian-security"
    --build-arg "PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple"
    --build-arg "PIP_DEFAULT_TIMEOUT=180"
    --build-arg "PIP_RETRIES=10"
  )
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"
  tar -xzf "$SOURCE_TARBALL" -C "$BUILD_DIR"
  rm -f "$SOURCE_TARBALL"
  if [ ! -f "$BUILD_DIR/server/Dockerfile" ]; then
    echo "  error source tarball extracted but server/Dockerfile is missing"
    exit 1
  fi

  if command -v timeout >/dev/null 2>&1; then
    timeout 45m docker build "${LOCAL_BUILD_ARGS[@]}" -t "$SHA_TAG" -f "$BUILD_DIR/server/Dockerfile" "$BUILD_DIR"
  else
    docker build "${LOCAL_BUILD_ARGS[@]}" -t "$SHA_TAG" -f "$BUILD_DIR/server/Dockerfile" "$BUILD_DIR"
  fi
  rm -rf "$BUILD_DIR"
  IMAGE_READY=1
  echo "  ok image $SHA_TAG built locally"
fi

if ! docker image inspect "$SHA_TAG" >/dev/null 2>&1; then
  echo "  error image prepare completed but $SHA_TAG is missing"
  exit 1
fi
echo "::endgroup::"

echo "::group::B) Backend container replace"
OLD_IMG=$(docker inspect treatbot-api -f '{{.Config.Image}}' 2>/dev/null || echo "")
if [ -n "$OLD_IMG" ]; then
  docker tag "$OLD_IMG" "treatbot-api:rollback-${TS}" || true
  echo "  ok old image '$OLD_IMG' backed up as treatbot-api:rollback-${TS}"
else
  echo "  first deploy: no existing treatbot-api image"
fi

BACKUP_ENV="$BACKUP_ROOT/treatbot-api.${TS}.env"
if docker inspect treatbot-api >/dev/null 2>&1; then
  docker inspect treatbot-api -f '{{range .Config.Env}}{{println .}}{{end}}' \
    | awk -F= '{ line[NR]=$0; key[NR]=$1 } END { for (i=NR;i>=1;i--) if (!seen[key[i]]++) keep[i]=1; for (i=1;i<=NR;i++) if (keep[i]) print line[i]; }' \
    > "$BACKUP_ENV"
else
  : > "$BACKUP_ENV"
fi
LEGACY_WEB_PREFIX="$(printf 'H%s' 5)"
LEGACY_ENABLED="$(awk -F= -v k="${LEGACY_WEB_PREFIX}_LOGIN_ENABLED" '$1 == k { print substr($0, length(k) + 2) }' "$BACKUP_ENV" | tail -1)"
LEGACY_FIXED_CODE="$(awk -F= -v k="${LEGACY_WEB_PREFIX}_LOGIN_FIXED_CODE" '$1 == k { print substr($0, length(k) + 2) }' "$BACKUP_ENV" | tail -1)"
awk -F= -v p="${LEGACY_WEB_PREFIX}_LOGIN_" '$1 != p "ENABLED" && $1 != p "FIXED_CODE" { print }' "$BACKUP_ENV" > "${BACKUP_ENV}.next"
mv "${BACKUP_ENV}.next" "$BACKUP_ENV"
if ! grep -q '^TREATBOT_LOGIN_ENABLED=' "$BACKUP_ENV" && [ -n "$LEGACY_ENABLED" ]; then
  printf 'TREATBOT_LOGIN_ENABLED=%s\n' "$LEGACY_ENABLED" >> "$BACKUP_ENV"
fi
if ! grep -q '^TREATBOT_LOGIN_FIXED_CODE=' "$BACKUP_ENV" && [ -n "$LEGACY_FIXED_CODE" ]; then
  printf 'TREATBOT_LOGIN_FIXED_CODE=%s\n' "$LEGACY_FIXED_CODE" >> "$BACKUP_ENV"
fi
chmod 600 "$BACKUP_ENV"
echo "  ok env file prepared at $BACKUP_ENV ($(wc -l < "$BACKUP_ENV") vars)"

if docker inspect treatbot-api >/dev/null 2>&1; then
  docker stop treatbot-api
  EXISTING_PREV=$(docker ps -a --format '{{.Names}}' | grep -E '^treatbot-api-prev-' | sort | head -n -4 || true)
  if [ -n "$EXISTING_PREV" ]; then
    echo "$EXISTING_PREV" | xargs -r docker rm -f
  fi
  docker rename treatbot-api "treatbot-api-prev-${TS}"
  echo "  ok old container renamed to treatbot-api-prev-${TS}"
fi

for d in /opt/treatbot/server/data /opt/treatbot/server/logs /opt/treatbot/server/uploads; do
  mkdir -p "$d" 2>/dev/null || sudo -n mkdir -p "$d"
  CUR_OWNER=$(stat -c '%u:%g' "$d" 2>/dev/null || echo "?")
  if [ "$CUR_OWNER" != "1000:1000" ]; then
    echo "  chown $d ($CUR_OWNER -> 1000:1000)"
    sudo -n chown -R 1000:1000 "$d" || echo "  warn chown failed; continuing"
  fi
done

OCR_ENV_FLAGS=()
[ -n "${KIMI_API_KEY:-}" ] && OCR_ENV_FLAGS+=(-e "KIMI_API_KEY=$KIMI_API_KEY")
OCR_ENV_FLAGS+=(-e "KIMI_VISION_MODEL=moonshot-v1-128k-vision-preview")
[ -n "${ARK_API_KEY:-}" ] && OCR_ENV_FLAGS+=(-e "ARK_API_KEY=$ARK_API_KEY")
OCR_ENV_FLAGS+=(-e "ARK_VISION_MODEL=doubao-seed-1-6-vision-250815")
OCR_ENV_FLAGS+=(-e "ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3")
OCR_ENV_FLAGS+=(-e "ARK_TIMEOUT_MS=180000")
OCR_ENV_FLAGS+=(-e "OCR_JOB_TIMEOUT_MS=900000")
OCR_ENV_FLAGS+=(-e "OCR_STRUCTURED_STREAM_TIMEOUT_MS=45000")
OCR_ENV_FLAGS+=(-e "PARSE_STATUS_RATE_LIMIT_MAX=3600")
OCR_ENV_FLAGS+=(-e "OCR_PROVIDER=auto")
OCR_ENV_FLAGS+=(-e "OCR_QUEUE_CONCURRENCY=3")
OCR_ENV_FLAGS+=(-e "OCR_PDF_VISION_MAX_PAGES=3")
OCR_ENV_FLAGS+=(-e "OCR_PDF_VISION_DPI=150")
OCR_ENV_FLAGS+=(-e "ADMIN_LOGIN_USERNAME=treatbot_admin")
OCR_ENV_FLAGS+=(-e "ADMIN_LOGIN_KEY_HASH=sha256:0740e0062f9186d15688ae5fbdbcc35c7a576ac3acd9403ad1576e41a675d60e")
OCR_ENV_FLAGS+=(-e "ADMIN_LOGIN_TOKEN_TTL=3600")
OCR_ENV_FLAGS+=(-e "ADMIN_LOGIN_CAN_REVEAL=true")

echo "  OCR env override:"
[ -n "${KIMI_API_KEY:-}" ] && echo "    KIMI_API_KEY override supplied" || echo "    KIMI_API_KEY preserved from previous container"
[ -n "${ARK_API_KEY:-}" ] && echo "    ARK_API_KEY override supplied" || echo "    ARK_API_KEY preserved from previous container"
echo "    OCR_QUEUE_CONCURRENCY=3"
echo "    PARSE_STATUS_RATE_LIMIT_MAX=3600"

docker run -d --name treatbot-api \
  --network server_treatbot-network \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file "$BACKUP_ENV" \
  "${OCR_ENV_FLAGS[@]}" \
  -v /opt/treatbot/server/data:/app/data \
  -v /opt/treatbot/server/logs:/app/logs \
  -v /opt/treatbot/server/uploads:/app/uploads \
  "$SHA_TAG"

HEALTHY=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 3
  if curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1; then
    HEALTHY=1
    echo "  ok healthy after $((i*3))s"
    break
  fi
  echo "  waiting for /health ($i/12)"
done

if [ "$HEALTHY" != "1" ]; then
  echo "  error health check failed; rolling back"
  docker logs treatbot-api --tail 80 || true
  docker rm -f treatbot-api || true
  if docker inspect "treatbot-api-prev-${TS}" >/dev/null 2>&1; then
    docker rename "treatbot-api-prev-${TS}" treatbot-api
    docker start treatbot-api
  fi
  exit 1
fi

RUNNING_IMAGE=$(docker inspect treatbot-api -f '{{.Config.Image}}')
if [ "$RUNNING_IMAGE" != "$SHA_TAG" ]; then
  echo "  error running image '$RUNNING_IMAGE', expected '$SHA_TAG'"
  exit 1
fi
echo "  ok backend running image verified: $RUNNING_IMAGE"
echo "  rollback command:"
echo "    docker stop treatbot-api && docker rm treatbot-api && docker rename treatbot-api-prev-${TS} treatbot-api && docker start treatbot-api"
echo "::endgroup::"

echo "::group::C) DB migrations"
if docker exec treatbot-api node scripts/migrate.js; then
  echo "  ok migrations done"
else
  echo "  warn migrate failed; deploy continues because old schema may still be compatible"
fi
echo "::endgroup::"

if [ "${PROMOTE_WEB:-1}" = "1" ]; then
  echo "::group::D) Web frontend promote"
  STAGING=/tmp/treatbot-web-staging.${TS}
  TARGET=/var/www/treatbot-web
  WEB_TARBALL=/tmp/web-dist.tar.gz
  if [ ! -f "$WEB_TARBALL" ]; then
    echo "  error web tarball missing: $WEB_TARBALL"
    exit 1
  fi

  rm -rf "$STAGING"
  mkdir -p "$STAGING"
  tar -xzf "$WEB_TARBALL" -C "$STAGING"
  rm -f "$WEB_TARBALL"

  if [ -d "$TARGET" ]; then
    BACKUP_WEB="$BACKUP_ROOT/web.${TS}"
    mkdir -p "$BACKUP_WEB"
    cp -a "$TARGET"/. "$BACKUP_WEB"/ || sudo -n cp -a "$TARGET"/. "$BACKUP_WEB"/
    echo "  ok web backed up to $BACKUP_WEB"
    ls -1dt "$BACKUP_ROOT"/web.* 2>/dev/null | tail -n +6 | xargs -r rm -rf
  fi

  if command -v rsync >/dev/null 2>&1; then
    (rsync -a --delete "$STAGING"/ "$TARGET"/ 2>/dev/null) || sudo -n rsync -a --delete "$STAGING"/ "$TARGET"/
  else
    (rm -rf "$TARGET"/* && cp -a "$STAGING"/. "$TARGET"/) || sudo -n sh -c "rm -rf $TARGET/* && cp -a $STAGING/. $TARGET/"
  fi

  if [ -f "$TARGET/index.html" ] && grep -q '/treatbot/' "$TARGET/index.html"; then
    echo "  ok web promoted to $TARGET"
  else
    echo "  warn web promoted but index.html/base path looks wrong"
    ls -la "$TARGET" | head -20
  fi
  rm -rf "$STAGING"
  echo "::endgroup::"
else
  echo "Skipping web promote."
fi

if [ "${APPLY_CADDY:-1}" = "1" ]; then
  echo "::group::E) Apply Caddyfile"
  NEW_CADDYFILE=/tmp/deploy/Caddyfile
  if [ ! -f "$NEW_CADDYFILE" ]; then
    echo "  warn $NEW_CADDYFILE missing; skipping Caddyfile swap"
  elif ! command -v caddy >/dev/null 2>&1; then
    echo "  warn caddy command missing; skipping Caddyfile swap"
  else
    CADDY_BAK="$BACKUP_ROOT/Caddyfile.before-manual.${TS}"
    if [ -f /etc/caddy/Caddyfile ]; then
      sudo -n cp /etc/caddy/Caddyfile "$CADDY_BAK"
      sudo -n chown "$(whoami):$(whoami)" "$CADDY_BAK"
      echo "  ok current Caddyfile backed up to $CADDY_BAK"
    fi

    set +e
    VALIDATE=$(sudo -n caddy validate --config "$NEW_CADDYFILE" --adapter caddyfile 2>&1)
    VRC=$?
    set -e
    echo "$VALIDATE" | sed 's/^/    /' | head -40

    if [ "$VRC" = "0" ]; then
      sudo -n cp "$NEW_CADDYFILE" /etc/caddy/Caddyfile
      sudo -n chown root:root /etc/caddy/Caddyfile
      sudo -n chmod 644 /etc/caddy/Caddyfile
      if sudo -n systemctl reload caddy; then
        sleep 2
        PUB_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$PUBLIC_URL/api/demo/samples" || echo "000")
        echo "  public /api/demo/samples=$PUB_CODE"
        if [ "$PUB_CODE" != "200" ] && [ -f "$CADDY_BAK" ]; then
          echo "  warn public smoke failed; restoring Caddyfile"
          sudo -n cp "$CADDY_BAK" /etc/caddy/Caddyfile
          sudo -n systemctl reload caddy || true
        else
          echo "  ok Caddyfile applied"
        fi
      elif [ -f "$CADDY_BAK" ]; then
        echo "  warn caddy reload failed; restoring"
        sudo -n cp "$CADDY_BAK" /etc/caddy/Caddyfile
        sudo -n systemctl reload caddy || true
      fi
    else
      echo "  warn caddy validate failed; not swapping"
    fi
  fi
  rm -rf /tmp/deploy
  echo "::endgroup::"
else
  echo "Skipping Caddyfile apply."
fi

if [ "${RUN_SMOKE:-1}" = "1" ]; then
  echo "::group::F) Smoke tests"
  curl -fsS http://127.0.0.1:3000/health || echo "  warn container /health failed"
  echo ""
  curl -fsS -o /dev/null -w "  $PUBLIC_URL/ -> HTTP %{http_code}\n" "$PUBLIC_URL/" || true
  curl -fsS -o /dev/null -w "  $PUBLIC_URL/api/demo/samples -> HTTP %{http_code}\n" "$PUBLIC_URL/api/demo/samples" || true
  curl -fsS -o /dev/null -w "  $PUBLIC_URL/treatbot/ -> HTTP %{http_code}\n" "$PUBLIC_URL/treatbot/" || true
  echo "::endgroup::"
fi

docker image prune -f --filter "until=168h" || true
echo "===== Manual deploy $TS done ====="
REMOTE_DEPLOY

echo "Manual deploy finished."
