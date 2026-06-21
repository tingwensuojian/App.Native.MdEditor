#!/bin/bash

# 应用内自动更新脚本 - 监听文件变化并自动热更新
# 警告：此方法不符合飞牛 NAS 官方规范，仅用于开发调试

echo "=========================================="
echo "  应用内自动更新 - 监听模式"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 应用名称
APP_NAME="App.Native.MdEditor2"

# 应用安装路径（通过符号链接）
APP_INSTALL_PATH="/var/apps/${APP_NAME}/target"

# 检查 inotify-tools 是否安装
if ! command -v inotifywait &> /dev/null; then
    echo -e "${RED}错误: 需要安装 inotify-tools${NC}"
    echo "请运行: sudo apt-get install inotify-tools"
    exit 1
fi

echo -e "${GREEN}监听模式已启动${NC}"
echo "监听目录: app/ui/frontend/src"
echo "按 Ctrl+C 停止监听"
echo ""

# 防抖动 - 避免频繁触发
LAST_UPDATE=0
DEBOUNCE_SECONDS=3

# 监听文件变化
inotifywait -m -r -e modify,create,delete app/ui/frontend/src |
while read path action file; do
    CURRENT_TIME=$(date +%s)
    TIME_DIFF=$((CURRENT_TIME - LAST_UPDATE))
    
    # 防抖动：3秒内只触发一次
    if [ $TIME_DIFF -lt $DEBOUNCE_SECONDS ]; then
        continue
    fi
    
    LAST_UPDATE=$CURRENT_TIME
    
    echo ""
    echo -e "${YELLOW}检测到文件变化: $file${NC}"
    echo -e "${YELLOW}开始自动更新...${NC}"
    
    # 构建前端
    cd app/ui/frontend
    npm run build > /dev/null 2>&1
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ 构建失败${NC}"
        cd ../../..
        continue
    fi
    
    cd ../../..
    
    # 替换前端文件
    if [ -d "${APP_INSTALL_PATH}/ui/frontend/dist" ]; then
        rm -rf "${APP_INSTALL_PATH}/ui/frontend/dist"
    fi
    
    cp -r app/ui/frontend/dist "${APP_INSTALL_PATH}/ui/frontend/"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ 自动更新完成 ($(date '+%H:%M:%S'))${NC}"
        echo -e "${YELLOW}请刷新浏览器 (Ctrl+Shift+R)${NC}"
    else
        echo -e "${RED}✗ 更新失败${NC}"
    fi
done
