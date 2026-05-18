#!/bin/bash

# 前端热更新脚本 - 直接替换前端文件
# 警告：此方法不符合飞牛 NAS 官方规范，仅用于开发调试

set -e

echo "=========================================="
echo "  前端热更新 - 直接替换模式"
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

# 检查应用是否安装
if [ ! -d "$APP_INSTALL_PATH" ]; then
    echo -e "${RED}错误: 应用未安装或路径不存在${NC}"
    echo "路径: $APP_INSTALL_PATH"
    exit 1
fi

echo -e "${YELLOW}[1/4] 构建前端...${NC}"
cd app/ui/frontend

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}安装依赖...${NC}"
    npm install
fi

npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ 前端构建失败${NC}"
    exit 1
fi

echo -e "${GREEN}✓ 前端构建成功${NC}"
cd ../../..

echo ""
echo -e "${YELLOW}[2/4] 备份当前前端文件...${NC}"
BACKUP_DIR="backups/hot-update-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

if [ -d "${APP_INSTALL_PATH}/ui/frontend/dist" ]; then
    cp -r "${APP_INSTALL_PATH}/ui/frontend/dist" "$BACKUP_DIR/"
    echo -e "${GREEN}✓ 备份完成: $BACKUP_DIR${NC}"
else
    echo -e "${YELLOW}⚠ 未找到旧的前端文件${NC}"
fi

echo ""
echo -e "${YELLOW}[3/4] 替换前端文件...${NC}"

# 删除旧的 dist 目录
if [ -d "${APP_INSTALL_PATH}/ui/frontend/dist" ]; then
    rm -rf "${APP_INSTALL_PATH}/ui/frontend/dist"
fi

# 复制新的 dist 目录
cp -r app/ui/frontend/dist "${APP_INSTALL_PATH}/ui/frontend/"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ 前端文件替换成功${NC}"
    
    # 修复文件权限（关键！）
    echo -e "${YELLOW}修复文件权限...${NC}"
    chown -R App.Native.MdEditor:App.Native.MdEditor "${APP_INSTALL_PATH}/ui/frontend/dist" 2>/dev/null || {
        echo -e "${YELLOW}⚠ 无法修复权限，可能需要 root 权限${NC}"
        echo -e "${YELLOW}请手动执行: sudo chown -R App.Native.MdEditor:App.Native.MdEditor ${APP_INSTALL_PATH}/ui/frontend/dist${NC}"
    }
else
    echo -e "${RED}✗ 前端文件替换失败${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}[4/4] 清除浏览器缓存提示...${NC}"
echo -e "${GREEN}✓ 热更新完成！${NC}"
echo ""
echo "=========================================="
echo "  重要提示"
echo "=========================================="
echo ""
echo "1. 前端文件已更新，无需重启应用"
echo "2. 请在浏览器中按 Ctrl+Shift+R 强制刷新"
echo "3. 或清除浏览器缓存后刷新"
echo ""
echo "访问地址: http://localhost:18080"
echo ""
echo "如需回滚，备份文件在: $BACKUP_DIR"
echo ""
echo "=========================================="
