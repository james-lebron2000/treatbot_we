#!/bin/bash

# 环境检查脚本
# 检查部署前是否满足所有依赖

set -e

echo "======================================"
echo "Treatbot 后端环境检查"
echo "======================================"

# 检查 Node.js 版本
echo ""
echo "[1/6] 检查 Node.js 版本..."
if ! command -v node &> /dev/null; then
    echo "错误: Node.js 未安装"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then 
    echo "错误: Node.js 版本需要 >= 18.0.0，当前版本: $NODE_VERSION"
    exit 1
fi

echo "  Node.js 版本: $NODE_VERSION ✓"

# 检查 npm
echo ""
echo "[2/6] 检查 npm..."
if ! command -v npm &> /dev/null; then
    echo "错误: npm 未安装"
    exit 1
fi
echo "  npm 版本: $(npm -v) ✓"

# 检查 PM2
echo ""
echo "[3/6] 检查 PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "警告: PM2 未安装，建议安装: npm install -g pm2"
else
    echo "  PM2 版本: $(pm2 -v) ✓"
fi

# 检查 MySQL
echo ""
echo "[4/6] 检查 MySQL 连接..."
if [ -f .env ]; then
    source .env
    if command -v mysql &> /dev/null; then
        if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" &> /dev/null; then
            echo "  MySQL 连接成功 ✓"
        else
            echo "  警告: MySQL 连接失败，请检查配置"
        fi
    else
        echo "  警告: MySQL 客户端未安装，无法检查连接"
    fi
else
    echo "  跳过（.env 文件不存在）"
fi

# 检查 Redis
echo ""
echo "[5/6] 检查 Redis 连接..."
if command -v redis-cli &> /dev/null; then
    if [ -f .env ]; then
        source .env
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping &> /dev/null; then
            echo "  Redis 连接成功 ✓"
        else
            echo "  警告: Redis 连接失败，请检查配置"
        fi
    fi
else
    echo "  警告: Redis 客户端未安装，无法检查连接"
fi

# 检查 .env 文件
echo ""
echo "[6/6] 检查环境变量配置..."
if [ ! -f .env ]; then
    echo "  错误: .env 文件不存在"
    echo "  请复制 .env.example 并配置: cp .env.example .env"
    exit 1
fi

echo "  .env 文件存在 ✓"

echo ""
echo "======================================"
echo "环境检查完成"
echo "======================================"
