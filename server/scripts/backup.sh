#!/bin/bash

# Treatbot 数据库备份脚本
# 支持：本地备份 + 上传到 COS

set -e

# 配置
BACKUP_DIR="/opt/backups/treatbot"
DB_NAME="${DB_NAME:-treatbot}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASSWORD:-}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"

# COS 配置（可选）
COS_BUCKET="${COS_BUCKET:-}"
COS_REGION="${COS_REGION:-ap-shanghai}"

# 保留天数
KEEP_DAYS=30

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 生成备份文件名
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="treatbot_${DATE}.sql"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILE"

echo "======================================"
echo "Treatbot 数据库备份"
echo "时间: $(date)"
echo "======================================"

# 执行备份
echo "[1/4] 正在备份数据库..."
if mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" \
  --single-transaction \
  --routines \
  --triggers \
  "$DB_NAME" > "$BACKUP_PATH"; then
    echo "  ✓ 备份成功: $BACKUP_FILE"
else
    echo "  ✗ 备份失败"
    exit 1
fi

# 压缩备份
echo "[2/4] 正在压缩备份..."
gzip "$BACKUP_PATH"
BACKUP_PATH="${BACKUP_PATH}.gz"
echo "  ✓ 压缩完成: $(du -h "$BACKUP_PATH" | cut -f1)"

# 上传到 COS（如果配置了）
if [ -n "$COS_BUCKET" ]; then
    echo "[3/4] 正在上传到 COS..."
    
    # 检查 coscli 是否安装
    if ! command -v coscli &> /dev/null; then
        echo "  警告: coscli 未安装，跳过上传"
        echo "  安装命令: wget https://github.com/tencentyun/coscli/releases/download/v0.13.0/coscli-linux -O /usr/local/bin/coscli && chmod +x /usr/local/bin/coscli"
    else
        coscli cp "$BACKUP_PATH" "cos://$COS_BUCKET/backups/database/"
        echo "  ✓ 上传完成"
    fi
else
    echo "[3/4] 跳过 COS 上传（未配置）"
fi

# 清理旧备份
echo "[4/4] 清理过期备份（${KEEP_DAYS}天前）..."
find "$BACKUP_DIR" -name "treatbot_*.sql.gz" -mtime +$KEEP_DAYS -delete
echo "  ✓ 清理完成"

# 输出备份信息
echo ""
echo "======================================"
echo "备份完成！"
echo "文件: $BACKUP_PATH"
echo "大小: $(du -h "$BACKUP_PATH" | cut -f1)"
echo "======================================"

# 添加到 crontab 的示例：
# 0 2 * * * /opt/treatbot/server/scripts/backup.sh >> /var/log/treatbot-backup.log 2>&1
