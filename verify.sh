#!/bin/bash

# Treatbot 项目验证脚本
# 验证项目配置是否正确

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "======================================"
echo "Treatbot 项目验证"
echo "======================================"
echo ""

errors=0
warnings=0

# 检查文件是否存在
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        return 0
    else
        echo -e "${RED}✗${NC} $2 (缺失)"
        ((errors++))
        return 1
    fi
}

# 检查目录是否存在
check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        return 0
    else
        echo -e "${RED}✗${NC} $2 (缺失)"
        ((errors++))
        return 1
    fi
}

# 检查可选文件
check_optional() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${YELLOW}⚠${NC} $2 (可选，缺失)"
        ((warnings++))
    fi
}

echo "[1/6] 检查项目结构..."
check_file "README.md" "README 文件"
check_file "LICENSE" "LICENSE 文件"
check_file "package.json" "package.json"
check_file "Makefile" "Makefile"
check_file ".gitignore" ".gitignore"
check_file ".editorconfig" ".editorconfig"
echo ""

echo "[2/6] 检查后端代码..."
check_dir "server" "server 目录"
check_file "server/app.js" "app.js"
check_file "server/package.json" "server/package.json"
check_dir "server/controllers" "controllers 目录"
check_dir "server/middleware" "middleware 目录"
check_dir "server/models" "models 目录"
check_dir "server/routes" "routes 目录"
echo ""

echo "[3/6] 检查前端代码..."
check_dir "treatbot-weapp" "小程序目录"
check_file "treatbot-weapp/app.js" "小程序 app.js"
check_file "treatbot-weapp/app.json" "小程序 app.json"
check_dir "treatbot-weapp/pages" "pages 目录"
check_dir "treatbot-weapp/components" "components 目录"
echo ""

echo "[4/6] 检查文档..."
check_dir "docs" "docs 目录"
check_file "docs/QUICKSTART.md" "QUICKSTART.md"
check_file "docs/api-spec.md" "api-spec.md"
check_file "docs/production-plan.md" "production-plan.md"
check_file "docs/FAQ.md" "FAQ.md"
echo ""

echo "[5/6] 检查配置文件..."
check_optional ".env" ".env 文件"
check_file "server/.env.example" ".env.example"
check_file "server/docker-compose.yml" "docker-compose.yml"
check_file "server/Dockerfile" "Dockerfile"
check_file "server/ecosystem.config.js" "PM2 配置"
echo ""

echo "[6/6] 检查 GitHub 配置..."
check_dir ".github" ".github 目录"
check_dir ".github/workflows" "workflows 目录"
check_file ".github/workflows/deploy.yml" "CI/CD 配置"
check_dir ".github/ISSUE_TEMPLATE" "ISSUE_TEMPLATE 目录"
echo ""

echo "======================================"
if [ $errors -eq 0 ]; then
    echo -e "${GREEN}✓ 项目验证通过！${NC}"
    echo "发现 $warnings 个可选文件缺失"
    echo ""
    echo "项目已准备就绪，可以开始部署："
    echo "  make deploy"
else
    echo -e "${RED}✗ 项目验证失败！${NC}"
    echo "发现 $errors 个错误，$warnings 个警告"
    echo ""
    echo "请修复上述问题后再部署"
fi
echo "======================================"

exit $errors
