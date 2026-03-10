#!/bin/bash

# Treatbot 部署前检查清单
# 确保所有配置正确后再部署

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "======================================"
echo "Treatbot 部署前检查清单"
echo "======================================"
echo ""

ERRORS=0
WARNINGS=0

# 检查命令
check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $2 已安装"
        return 0
    else
        echo -e "${RED}✗${NC} $2 未安装"
        ((ERRORS++))
        return 1
    fi
}

# 检查版本
check_version() {
    local cmd=$1
    local expected=$2
    local current=$($cmd --version 2>&1 | head -1)
    
    echo "  当前版本: $current"
}

echo -e "${BLUE}[系统环境检查]${NC}"
check_command "node" "Node.js"
if [ $? -eq 0 ]; then
    check_version "node" "18.0.0"
fi

check_command "npm" "npm"
check_command "git" "Git"

echo ""
echo -e "${BLUE}[可选工具检查]${NC}"
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓${NC} Docker 已安装"
    docker --version
else
    echo -e "${YELLOW}⚠${NC} Docker 未安装（可选）"
    ((WARNINGS++))
fi

if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✓${NC} PM2 已安装"
else
    echo -e "${YELLOW}⚠${NC} PM2 未安装（可选）"
    ((WARNINGS++))
fi

echo ""
echo -e "${BLUE}[项目文件检查]${NC}"

if [ -f "package.json" ]; then
    echo -e "${GREEN}✓${NC} package.json 存在"
else
    echo -e "${RED}✗${NC} package.json 缺失"
    ((ERRORS++))
fi

if [ -f "Makefile" ]; then
    echo -e "${GREEN}✓${NC} Makefile 存在"
else
    echo -e "${RED}✗${NC} Makefile 缺失"
    ((ERRORS++))
fi

echo ""
echo -e "${BLUE}[后端检查]${NC}"

if [ -d "server" ]; then
    echo -e "${GREEN}✓${NC} server 目录存在"
    
    if [ -f "server/package.json" ]; then
        echo -e "${GREEN}✓${NC} server/package.json 存在"
    else
        echo -e "${RED}✗${NC} server/package.json 缺失"
        ((ERRORS++))
    fi
    
    if [ -f "server/.env.example" ]; then
        echo -e "${GREEN}✓${NC} server/.env.example 存在"
    else
        echo -e "${RED}✗${NC} server/.env.example 缺失"
        ((ERRORS++))
    fi
    
    if [ -f "server/.env" ]; then
        echo -e "${GREEN}✓${NC} server/.env 已配置"
        
        # 检查必要的环境变量
        if grep -q "JWT_SECRET" server/.env; then
            echo -e "${GREEN}✓${NC} JWT_SECRET 已配置"
        else
            echo -e "${RED}✗${NC} JWT_SECRET 未配置"
            ((ERRORS++))
        fi
        
        if grep -q "WEAPP_APPID" server/.env; then
            echo -e "${GREEN}✓${NC} WEAPP_APPID 已配置"
        else
            echo -e "${RED}✗${NC} WEAPP_APPID 未配置"
            ((ERRORS++))
        fi
    else
        echo -e "${RED}✗${NC} server/.env 未配置"
        echo "  请运行: make generate-env"
        ((ERRORS++))
    fi
else
    echo -e "${RED}✗${NC} server 目录缺失"
    ((ERRORS++))
fi

echo ""
echo -e "${BLUE}[前端检查]${NC}"

if [ -d "treatbot-weapp" ]; then
    echo -e "${GREEN}✓${NC} treatbot-weapp 目录存在"
    
    if [ -f "treatbot-weapp/app.json" ]; then
        echo -e "${GREEN}✓${NC} app.json 存在"
    else
        echo -e "${RED}✗${NC} app.json 缺失"
        ((ERRORS++))
    fi
else
    echo -e "${RED}✗${NC} treatbot-weapp 目录缺失"
    ((ERRORS++))
fi

echo ""
echo -e "${BLUE}[依赖检查]${NC}"

if [ -d "server/node_modules" ]; then
    echo -e "${GREEN}✓${NC} 后端依赖已安装"
else
    echo -e "${YELLOW}⚠${NC} 后端依赖未安装"
    echo "  请运行: make install"
    ((WARNINGS++))
fi

echo ""
echo "======================================"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ 所有检查通过！${NC}"
    echo ""
    echo "可以开始部署："
    echo "  make deploy"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ 检查通过，但有 $WARNINGS 个警告${NC}"
    echo ""
    echo "可以继续部署，但建议解决警告："
    echo "  make deploy"
    exit 0
else
    echo -e "${RED}✗ 检查失败，发现 $ERRORS 个错误${NC}"
    echo ""
    echo "请先修复错误后再部署"
    exit 1
fi
