#!/bin/bash

# Treatbot 后端一键启动脚本
# 使用方法: ./start.sh [environment]
# 环境: development | production (默认: development)

set -e

ENV=${1:-development}
cd "$(dirname "$0")"

echo "======================================"
echo "Treatbot 后端一键启动"
echo "环境: $ENV"
echo "======================================"

# 1. 环境检查
echo ""
echo "[1/5] 运行环境检查..."
./check-env.sh || exit 1

# 2. 安装依赖
echo ""
echo "[2/5] 安装依赖..."
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "  node_modules 已存在，跳过安装"
fi

# 3. 数据库迁移（开发环境）
if [ "$ENV" = "development" ]; then
    echo ""
    echo "[3/5] 执行数据库迁移..."
    node scripts/migrate.js
fi

# 4. 创建日志目录
echo ""
echo "[4/5] 创建日志目录..."
mkdir -p logs

# 5. 启动方式选择
echo ""
echo "[5/5] 启动应用..."

case "$ENV" in
    "production")
        echo "  生产模式：使用 PM2 启动"
        if pm2 list | grep -q "treatbot-api"; then
            echo "  正在重启现有实例..."
            pm2 reload ecosystem.config.js --env production
        else
            echo "  正在启动新实例..."
            pm2 start ecosystem.config.js --env production
        fi
        echo ""
        echo "应用已启动！状态："
        pm2 list
        echo ""
        echo "查看日志:"
        echo "  pm2 logs treatbot-api"
        echo "停止应用:"
        echo "  pm2 stop treatbot-api"
        ;;
    "development")
        echo "  开发模式：使用 nodemon 启动"
        if command -v nodemon &> /dev/null; then
            echo "  启动 nodemon（热重载）..."
            nodemon app.js
        else
            echo "  nodemon 未安装，使用 node 启动..."
            node app.js
        fi
        ;;
    *)
        echo "错误: 未知环境 '$ENV'"
        echo "可用环境: development | production"
        exit 1
        ;;
esac
