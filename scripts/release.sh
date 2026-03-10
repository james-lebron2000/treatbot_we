#!/bin/bash

# Treatbot 版本发布脚本
# 用法: ./scripts/release.sh [major|minor|patch]

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 获取当前版本
get_current_version() {
    node -p "require('./package.json').version"
}

# 更新版本号
bump_version() {
    local type=$1
    npm version $type --no-git-tag-version
}

# 更新 CHANGELOG
update_changelog() {
    local version=$1
    local date=$(date +%Y-%m-%d)
    
    echo "## [$version] - $date" > /tmp/changelog_new.md
    echo "" >> /tmp/changelog_new.md
    git log --pretty=format:"- %s" $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~10)..HEAD >> /tmp/changelog_new.md
    echo "" >> /tmp/changelog_new.md
    
    # 合并到 CHANGELOG
    cat /tmp/changelog_new.md CHANGELOG.md > /tmp/changelog_merged.md
    mv /tmp/changelog_merged.md CHANGELOG.md
}

# 创建 Git 标签
create_tag() {
    local version=$1
    git add -A
    git commit -m "chore(release): $version"
    git tag -a "v$version" -m "Release version $version"
}

# 主函数
main() {
    local type=${1:-patch}
    
    echo "======================================"
    echo "Treatbot 版本发布"
    echo "======================================"
    echo ""
    
    # 检查 Git 状态
    if [ -n "$(git status --porcelain)" ]; then
        echo -e "${RED}错误: 有未提交的更改${NC}"
        echo "请先提交所有更改"
        exit 1
    fi
    
    # 获取当前版本
    current_version=$(get_current_version)
    echo "当前版本: $current_version"
    echo "更新类型: $type"
    echo ""
    
    # 确认
    read -p "确认发布? (y/N) " confirm
    if [[ $confirm != [yY] ]]; then
        echo "取消发布"
        exit 0
    fi
    
    # 更新版本
    echo -e "${BLUE}更新版本号...${NC}"
    new_version=$(bump_version $type)
    new_version=${new_version#v}
    echo -e "${GREEN}✓${NC} 新版本: $new_version"
    
    # 更新 CHANGELOG
    echo -e "${BLUE}更新 CHANGELOG...${NC}"
    update_changelog $new_version
    echo -e "${GREEN}✓${NC} CHANGELOG 已更新"
    
    # 创建标签
    echo -e "${BLUE}创建 Git 标签...${NC}"
    create_tag $new_version
    echo -e "${GREEN}✓${NC} 标签已创建: v$new_version"
    
    echo ""
    echo "======================================"
    echo -e "${GREEN}✓ 发布成功！${NC}"
    echo "======================================"
    echo ""
    echo "版本: v$new_version"
    echo ""
    echo "下一步:"
    echo "  git push origin main --tags"
    echo ""
}

main "$@"
