#!/bin/bash

# Treatbot 日志清理脚本
# 自动清理过期日志文件，释放磁盘空间

set -e

# 配置
LOG_DIR="${LOG_DIR:-/opt/treatbot/logs}"
NGINX_LOG_DIR="${NGINX_LOG_DIR:-/var/log/nginx}"

# 保留天数
APP_LOG_KEEP_DAYS=30
NGINX_LOG_KEEP_DAYS=7
ACCESS_LOG_KEEP_DAYS=7

# 日志文件大小阈值（MB），超过则压缩
COMPRESS_THRESHOLD=100

echo "======================================"
echo "Treatbot 日志清理"
echo "时间: $(date)"
echo "======================================"

# 1. 清理应用日志
echo "[1/4] 清理应用日志（${APP_LOG_KEEP_DAYS}天前）..."
if [ -d "$LOG_DIR" ]; then
    find "$LOG_DIR" -name "*.log" -mtime +$APP_LOG_KEEP_DAYS -delete
    find "$LOG_DIR" -name "*.log.*" -mtime +$APP_LOG_KEEP_DAYS -delete
    echo "  ✓ 应用日志清理完成"
else
    echo "  ! 日志目录不存在: $LOG_DIR"
fi

# 2. 清理 Nginx 访问日志
echo "[2/4] 清理 Nginx 访问日志（${ACCESS_LOG_KEEP_DAYS}天前）..."
if [ -d "$NGINX_LOG_DIR" ]; then
    find "$NGINX_LOG_DIR" -name "*access*.log" -mtime +$ACCESS_LOG_KEEP_DAYS -delete
    find "$NGINX_LOG_DIR" -name "*access*.log.*" -mtime +$ACCESS_LOG_KEEP_DAYS -delete
    echo "  ✓ Nginx 访问日志清理完成"
else
    echo "  ! Nginx 日志目录不存在: $NGINX_LOG_DIR"
fi

# 3. 压缩大日志文件
echo "[3/4] 压缩大日志文件（>${COMPRESS_THRESHOLD}MB）..."
find "$LOG_DIR" "$NGINX_LOG_DIR" -name "*.log" -size +${COMPRESS_THRESHOLD}M -exec gzip {} \; 2>/dev/null || true
echo "  ✓ 大日志文件压缩完成"

# 4. 清理 PM2 日志
echo "[4/4] 清理 PM2 日志..."
if command -v pm2 &> /dev/null; then
    pm2 flush
    pm2 reloadLogs
    echo "  ✓ PM2 日志清理完成"
else
    echo "  ! PM2 未安装，跳过"
fi

# 输出磁盘使用情况
echo ""
echo "======================================"
echo "磁盘使用情况"
echo "======================================"
df -h | grep -E "(Filesystem|/dev/)"

echo ""
echo "日志目录大小:"
du -sh "$LOG_DIR" 2>/dev/null || echo "  无法访问"
du -sh "$NGINX_LOG_DIR" 2>/dev/null || echo "  无法访问"

echo ""
echo "======================================"
echo "日志清理完成！"
echo "======================================"

# 添加到 crontab 的示例：
# 0 3 * * 0 /opt/treatbot/server/scripts/cleanup-logs.sh >> /var/log/treatbot-cleanup.log 2>&1
