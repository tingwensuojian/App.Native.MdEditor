#!/bin/bash
# 快速禁用首屏加载动画（用于紧急恢复）

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}=== 禁用首屏加载动画 ===${NC}"
echo "此脚本将临时禁用首屏加载功能，恢复原有的直接加载方式"
echo ""

PROJECT_ROOT="/vol4/1000/开发文件夹/mac"
APP_FILE="$PROJECT_ROOT/app/ui/frontend/src/App.jsx"

# 备份原文件
if [ ! -f "$APP_FILE.backup" ]; then
    cp "$APP_FILE" "$APP_FILE.backup"
    echo -e "${GREEN}✓ 已备份 App.jsx${NC}"
fi

# 禁用首屏加载
echo "修改 App.jsx..."

# 方法：注释掉 Hook 调用，使用固定值
sed -i 's/const { isLoading, loadingMessage } = useMobileFirstScreenLoader()/const isLoading = false; const loadingMessage = "" \/\/ const { isLoading, loadingMessage } = useMobileFirstScreenLoader()/' "$APP_FILE"

echo -e "${GREEN}✓ 已禁用首屏加载${NC}"

# 重新构建
echo ""
echo -e "${YELLOW}重新构建前端...${NC}"
cd "$PROJECT_ROOT/app/ui/frontend"
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ 构建成功${NC}"
    
    # 询问是否打包部署
    echo ""
    read -p "是否立即打包并部署？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$PROJECT_ROOT"
        bash build-optimized.sh
    fi
else
    echo -e "${RED}✗ 构建失败${NC}"
    echo "恢复备份..."
    cp "$APP_FILE.backup" "$APP_FILE"
    exit 1
fi

echo ""
echo -e "${GREEN}=== 完成 ===${NC}"
echo "首屏加载已禁用，应用将直接显示编辑器"
echo ""
echo "如需恢复首屏加载："
echo "  cp $APP_FILE.backup $APP_FILE"
echo "  npm run build --prefix app/ui/frontend"
echo "  bash build-optimized.sh"
