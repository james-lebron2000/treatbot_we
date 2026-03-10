#!/usr/bin/env bash

set -euo pipefail

CMD="${1:-}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_ROOT="${RELEASE_ROOT:-$ROOT_DIR/backups/releases}"

usage() {
  cat <<EOF
Usage:
  $0 snapshot
  $0 list
  $0 rollback [release_id|latest]
EOF
}

latest_release_id() {
  ls -1 "$RELEASE_ROOT" 2>/dev/null | sort | tail -n 1
}

do_snapshot() {
  local release_id
  release_id="$(date +%Y%m%d_%H%M%S)"
  local release_dir="$RELEASE_ROOT/$release_id"
  mkdir -p "$release_dir"

  cp "$ROOT_DIR/.env" "$release_dir/.env"
  cp "$ROOT_DIR/docker-compose.yml" "$release_dir/docker-compose.yml"

  if command -v git >/dev/null 2>&1 && git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$ROOT_DIR" rev-parse HEAD > "$release_dir/git_head.txt" || true
  fi

  docker image inspect server-api --format '{{.Id}}' > "$release_dir/server_api_image_id.txt" 2>/dev/null || true

  tar -C "$ROOT_DIR" \
    --exclude='./node_modules' \
    --exclude='./logs' \
    --exclude='./uploads' \
    --exclude='./backups' \
    -czf "$release_dir/server_bundle.tgz" .

  echo "snapshot created: $release_id"
}

do_list() {
  if [ ! -d "$RELEASE_ROOT" ]; then
    echo "no releases"
    return
  fi
  ls -1 "$RELEASE_ROOT" | sort
}

do_rollback() {
  local release_id="${1:-latest}"
  if [ "$release_id" = "latest" ]; then
    release_id="$(latest_release_id)"
  fi
  if [ -z "${release_id:-}" ]; then
    echo "no release found"
    exit 1
  fi

  local release_dir="$RELEASE_ROOT/$release_id"
  if [ ! -d "$release_dir" ]; then
    echo "release not found: $release_id"
    exit 1
  fi

  if [ ! -f "$release_dir/server_bundle.tgz" ]; then
    echo "invalid release bundle: $release_dir/server_bundle.tgz"
    exit 1
  fi

  echo "rolling back to release: $release_id"
  tar -xzf "$release_dir/server_bundle.tgz" -C "$ROOT_DIR"
  cp "$release_dir/.env" "$ROOT_DIR/.env"
  cp "$release_dir/docker-compose.yml" "$ROOT_DIR/docker-compose.yml"

  (cd "$ROOT_DIR" && docker compose up -d --build api)
  echo "rollback completed: $release_id"
}

case "$CMD" in
  snapshot)
    do_snapshot
    ;;
  list)
    do_list
    ;;
  rollback)
    do_rollback "${2:-latest}"
    ;;
  *)
    usage
    exit 1
    ;;
esac

