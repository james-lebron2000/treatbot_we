#!/usr/bin/env bash
# PRD-2026Q4 T0-11：schema 漂移检测用的 mysqldump 包装脚本。
#
# 用法：
#   schema-dump.sh <output_file>
#
# 必需环境变量（通过 CI secrets 注入）：
#   DB_HOST DB_PORT DB_USER DB_PASS DB_NAME
#
# 仅 dump schema（无数据），且去掉所有 comment / AUTO_INCREMENT / dump-date，
# 这样两次 dump 的差异只来自真正的 schema 漂移。
#
# 退出码：
#   0 dump 成功；
#   1 参数 / env 缺失；
#   2 mysqldump 执行失败。

set -euo pipefail

OUT="${1:-}"
if [ -z "$OUT" ]; then
  echo "[schema-dump] usage: $0 <output_file>" >&2
  exit 1
fi

: "${DB_HOST:?DB_HOST is required}"
: "${DB_PORT:?DB_PORT is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASS:?DB_PASS is required}"
: "${DB_NAME:?DB_NAME is required}"

if ! command -v mysqldump >/dev/null 2>&1; then
  echo "[schema-dump] mysqldump not in PATH" >&2
  exit 2
fi

# --no-data        只导出 schema
# --skip-comments  去掉头部 -- MySQL dump 时间戳，避免「时间戳变化」误报漂移
# --routines / --triggers / --events 把所有 schema 对象一并导出
# --skip-extended-insert / --order-by-primary 与 schema 无关，但显式关掉避免 noise
# --column-statistics=0 兼容 8.0 client → 5.7 server 的常见组合
mysqldump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --password="$DB_PASS" \
  --no-data \
  --skip-comments \
  --skip-add-drop-table \
  --skip-set-charset \
  --routines \
  --triggers \
  --events \
  --column-statistics=0 \
  "$DB_NAME" \
  | sed -E 's/ AUTO_INCREMENT=[0-9]+//g' \
  | sed -E '/^\/\*![0-9]+ /d' \
  > "$OUT"

# 末尾再剔掉空行，让 diff 更干净
sed -i.bak -e '/^[[:space:]]*$/d' "$OUT" && rm -f "${OUT}.bak"

echo "[schema-dump] wrote $(wc -l < "$OUT") lines to $OUT"
