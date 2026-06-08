#!/bin/bash
#
# Treatbot 备份恢复演练（Restore Drill）
# ------------------------------------------------------------------
# 目的：验证 backup.sh 产出的备份「真的可恢复」。未经恢复验证的备份等于没有备份。
# 做法：取最新一份 treatbot_*.sql.gz → 灌入一个一次性临时库 → 对关键表做 COUNT 断言
#       → 跑通则删库返回 0；任一环节失败返回非 0（供 cron/告警捕获）。
#
# 用法：
#   DB_PASSWORD=xxx ./restoreDrill.sh
#   # 可选：BACKUP_DIR / DB_HOST / DB_PORT / DB_USER / MIN_USERS / MIN_TRIALS
#
# 退出码：0=演练通过；1=无备份；2=恢复失败；3=数据断言失败
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/backups/treatbot}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASSWORD:-}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"

# 健康阈值：恢复后这些表至少应有多少行（按真实数据量调整）
MIN_TRIALS="${MIN_TRIALS:-1}"
MIN_USERS="${MIN_USERS:-0}"

TS="$(date +%Y%m%d_%H%M%S)"
DRILL_DB="treatbot_restore_drill_${TS}"
MYSQL=(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS")

log() { echo "[$(date '+%F %T')] $*"; }
fail() { log "✗ $1"; cleanup; exit "${2:-1}"; }

cleanup() {
  "${MYSQL[@]}" -e "DROP DATABASE IF EXISTS \`${DRILL_DB}\`;" 2>/dev/null || true
}
trap cleanup EXIT

log "======== Treatbot 恢复演练开始 ========"

# 1) 找最新备份
LATEST="$(ls -1t "${BACKUP_DIR}"/treatbot_*.sql.gz 2>/dev/null | head -n1 || true)"
[ -z "$LATEST" ] && fail "在 ${BACKUP_DIR} 未找到任何 treatbot_*.sql.gz 备份" 1
AGE_HOURS=$(( ( $(date +%s) - $(stat -c %Y "$LATEST" 2>/dev/null || stat -f %m "$LATEST") ) / 3600 ))
log "最新备份：$(basename "$LATEST")（约 ${AGE_HOURS} 小时前，$(du -h "$LATEST" | cut -f1)）"
if [ "$AGE_HOURS" -gt 26 ]; then
  log "⚠️  警告：最新备份已超过 26 小时，每日备份可能没在跑！"
fi

# 2) 建临时库 + 恢复
log "创建临时库 ${DRILL_DB} 并恢复..."
"${MYSQL[@]}" -e "CREATE DATABASE \`${DRILL_DB}\` CHARACTER SET utf8mb4;" || fail "无法创建临时库" 2
if ! gunzip -c "$LATEST" | "${MYSQL[@]}" "${DRILL_DB}"; then
  fail "恢复失败：备份文件可能损坏或不完整" 2
fi
log "✓ 恢复完成"

# 3) 关键表数据断言
count() { "${MYSQL[@]}" -N -s "${DRILL_DB}" -e "SELECT COUNT(*) FROM $1;" 2>/dev/null || echo "ERR"; }

TRIALS=$(count trials)
USERS=$(count users)
APPS=$(count trial_applications)
[ "$TRIALS" = "ERR" ] && fail "trials 表不存在 —— 备份结构不完整" 3
log "数据计数：trials=${TRIALS} users=${USERS} trial_applications=${APPS}"
[ "$TRIALS" -lt "$MIN_TRIALS" ] && fail "trials=${TRIALS} 低于阈值 ${MIN_TRIALS}" 3
[ "$USERS" = "ERR" ] || { [ "$USERS" -lt "$MIN_USERS" ] && fail "users=${USERS} 低于阈值 ${MIN_USERS}" 3; }

log "✓✓ 恢复演练通过：备份可恢复且关键表数据完整"
log "======== 恢复演练结束（PASS）========"
# cleanup 由 trap 自动执行
exit 0
