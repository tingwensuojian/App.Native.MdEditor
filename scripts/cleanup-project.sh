#!/bin/bash
# 清理项目冗余文件 - 减少开发目录体积

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== 项目清理工具 ===${NC}"
echo "此脚本将清理开发目录中的冗余文件"
echo ""

PROJECT_ROOT="/vol4/1000/开发文件夹/mac"
cd "$PROJECT_ROOT"

# 统计当前大小
BEFORE=$(du -sh . | cut -f1)
echo "清理前项目大小: ${BEFORE}"
echo ""

# 1. 备份文件夹
if [ -d "backups" ]; then
    BACKUP_SIZE=$(du -sh backups | cut -f1)
    echo -e "${YELLOW}发现备份文件夹: ${BACKUP_SIZE}${NC}"
    read -p "是否删除 backups/ 文件夹？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf backups
        echo -e "${GREEN}✓ 已删除 backups/ (${BACKUP_SIZE})${NC}"
    fi
fi

# 2. 历史版本
if [ -d "app/shares/history" ]; then
    HISTORY_SIZE=$(du -sh app/shares/history | cut -f1)
    echo -e "${YELLOW}发现历史版本: ${HISTORY_SIZE}${NC}"
    read -p "是否删除 app/shares/history/ ？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf app/shares/history
        echo -e "${GREEN}✓ 已删除历史版本 (${HISTORY_SIZE})${NC}"
    fi
fi

# 3. 文档文件
DOC_COUNT=$(find . -maxdepth 1 -name "*.md" -o -name "*.txt" | wc -l)
if [ $DOC_COUNT -gt 5 ]; then
    echo -e "${YELLOW}发现 ${DOC_COUNT} 个文档文件${NC}"
    read -p "是否删除根目录的 .md 和 .txt 文件（保留 README.md）？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        find . -maxdepth 1 -name "*.md" ! -name "README.md" -delete
        find . -maxdepth 1 -name "*.txt" -delete
        echo -e "${GREEN}✓ 已删除文档文件${NC}"
    fi
fi

# 4. Python 脚本
PY_COUNT=$(find . -maxdepth 1 -name "*.py" | wc -l)
if [ $PY_COUNT -gt 0 ]; then
    echo -e "${YELLOW}发现 ${PY_COUNT} 个 Python 脚本${NC}"
    read -p "是否删除根目录的 .py 文件？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        find . -maxdepth 1 -name "*.py" -delete
        echo -e "${GREEN}✓ 已删除 Python 脚本${NC}"
    fi
fi

# 5. 测试文件
TEST_COUNT=$(find . -maxdepth 1 -name "test*.html" -o -name "debug*.html" | wc -l)
if [ $TEST_COUNT -gt 0 ]; then
    echo -e "${YELLOW}发现 ${TEST_COUNT} 个测试文件${NC}"
    read -p "是否删除测试 HTML 文件？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        find . -maxdepth 1 -name "test*.html" -delete
        find . -maxdepth 1 -name "debug*.html" -delete
        echo -e "${GREEN}✓ 已删除测试文件${NC}"
    fi
fi

# 6. 配置备份
MANIFEST_BAK=$(find . -maxdepth 1 -name "manifest.bak*" | wc -l)
if [ $MANIFEST_BAK -gt 0 ]; then
    echo -e "${YELLOW}发现 ${MANIFEST_BAK} 个配置备份${NC}"
    read -p "是否删除 manifest.bak* 文件？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        find . -maxdepth 1 -name "manifest.bak*" -delete
        echo -e "${GREEN}✓ 已删除配置备份${NC}"
    fi
fi

# 7. docs 文件夹
if [ -d "docs" ]; then
    DOCS_SIZE=$(du -sh docs | cut -f1)
    echo -e "${YELLOW}发现 docs/ 文件夹: ${DOCS_SIZE}${NC}"
    read -p "是否删除 docs/ 文件夹？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf docs
        echo -e "${GREEN}✓ 已删除 docs/ (${DOCS_SIZE})${NC}"
    fi
fi

# 统计清理后大小
AFTER=$(du -sh . | cut -f1)

echo ""
echo -e "${GREEN}=== 清理完成 ===${NC}"
echo "清理前: ${BEFORE}"
echo "清理后: ${AFTER}"
echo ""
echo -e "${YELLOW}提示：${NC}"
echo "• 这些文件不会被打包到 fpk 中（已在 .fpkignore 中排除）"
echo "• 清理后可以减少开发目录体积，提升文件浏览速度"
echo "• 如需恢复，请从 Git 仓库或备份中恢复"
