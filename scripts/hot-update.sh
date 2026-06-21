#!/bin/bash

# 快速热更新 - 一键脚本
# 根据修改的文件自动选择更新方式

echo "=========================================="
echo "  智能热更新"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}请选择更新方式：${NC}"
echo ""
echo "1. 前端热更新（最快，无需重启）"
echo "2. 后端热更新（需要重启）"
echo "3. 完整热更新（前端+后端）"
echo "4. 监听模式（自动更新）"
echo ""
read -p "请输入选项 [1-4]: " choice

case $choice in
    1)
        echo ""
        echo -e "${YELLOW}执行前端热更新...${NC}"
        ./hot-update-frontend.sh
        ;;
    2)
        echo ""
        echo -e "${YELLOW}执行后端热更新...${NC}"
        ./hot-update-backend.sh
        ;;
    3)
        echo ""
        echo -e "${YELLOW}执行完整热更新...${NC}"
        ./hot-update-full.sh
        ;;
    4)
        echo ""
        echo -e "${YELLOW}启动监听模式...${NC}"
        echo -e "${BLUE}按 Ctrl+C 停止监听${NC}"
        echo ""
        ./hot-update-watch.sh
        ;;
    *)
        echo ""
        echo -e "${YELLOW}无效选项，默认执行前端热更新${NC}"
        ./hot-update-frontend.sh
        ;;
esac
