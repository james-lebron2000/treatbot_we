#!/bin/bash

# Treatbot 项目一键设置脚本
# 用于新开发者快速设置开发环境

echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║   🏥  Treatbot 临床试验匹配平台                            ║"
echo "║                                                            ║"
echo "║   一键设置脚本                                             ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    echo "请先安装 Node.js 18+: https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 版本过低，需要 18+"
    echo "当前版本: $(node -v)"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"

# 安装依赖
echo ""
echo "📦 安装后端依赖..."
cd server
npm install

# 创建 .env 文件（如果不存在）
if [ ! -f .env ]; then
    echo ""
    echo "📝 创建环境配置文件..."
    cp .env.example .env
    echo "✅ 已创建 .env 文件，请编辑配置"
fi

echo ""
echo "✅ 设置完成！"
echo ""
echo "下一步:"
echo "  1. 编辑 server/.env 配置环境变量"
echo "  2. 运行数据库迁移: make db-migrate"
echo "  3. 启动开发服务器: make dev"
echo ""
echo "或使用交互式配置: make generate-env"
echo ""
