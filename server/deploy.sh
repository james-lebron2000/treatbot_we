#!/bin/bash

# Treatbot 后端部署脚本
# 使用方法: ./deploy.sh [environment]
# 环境: development | production (默认: production)

set -e

ENV=${1:-production}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================"
echo "Treatbot 后端部署脚本"
echo "环境: $ENV"
echo "======================================"

# 检查环境文件
if [ ! -f .env ]; then
    echo "错误: .env 文件不存在，请复制 .env.example 并配置"
    exit 1
fi

# 检查必要的环境变量
required_vars=("JWT_SECRET" "WEAPP_APPID" "WEAPP_SECRET")
for var in "${required_vars[@]}"; do
    if ! grep -q "^${var}=" .env || grep -q "^${var}=your_" .env; then
        echo "警告: ${var} 未配置或使用了示例值"
    fi
done

# 安装依赖
echo ""
echo "[1/5] 安装依赖..."
npm ci --only=production

# 创建日志目录
echo ""
echo "[2/5] 创建日志目录..."
mkdir -p logs

# 数据库迁移
echo ""
echo "[3/5] 执行数据库迁移..."
if [ "$ENV" = "production" ]; then
    NODE_ENV=production node scripts/migrate.js
else
    NODE_ENV=development node scripts/migrate.js
fi

# 使用 PM2 启动/重启
echo ""
echo "[4/5] 启动应用..."
if pm2 list | grep -q "treatbot-api"; then
    echo "正在重启应用..."
    pm2 reload ecosystem.config.js --env $ENV
else
    echo "正在启动应用..."
    pm2 start ecosystem.config.js --env $ENV
fi

# 保存 PM2 配置
echo ""
echo "[5/5] 保存 PM2 配置..."
pm2 save

# 显示状态
echo ""
echo "======================================"
echo "部署完成!"
echo "======================================"
pm2 list

echo ""
echo "查看日志:"
echo "  pm2 logs treatbot-api"
echo ""
echo "查看状态:"
echo "  pm2 show treatbot-api"
