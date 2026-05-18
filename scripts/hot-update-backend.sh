#!/bin/bash

# 后端热更新脚本 - 替换后端代码并重启服务
# 警告：此方法不符合飞牛 NAS 官方规范，仅用于开发调试

set -e

echo "=========================================="
echo "  后端热更新 - 替换并重启模式"
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
    exit 1
fi

echo -e "${YELLOW}[1/4] 备份当前后端文件...${NC}"
BACKUP_DIR="backups/hot-update-backend-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

if [ -d "${APP_INSTALL_PATH}/app/server" ]; then
    cp -r "${APP_INSTALL_PATH}/app/server" "$BACKUP_DIR/"
    echo -e "${GREEN}✓ 备份完成: $BACKUP_DIR${NC}"
fi

echo ""
echo -e "${YELLOW}[2/4] 替换后端文件...${NC}"

# 复制后端文件
cp -r app/server/* "${APP_INSTALL_PATH}/app/server/"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ 后端文件替换成功${NC}"
else
    echo -e "${RED}✗ 后端文件替换失败${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}[3/4] 重启应用...${NC}"

appcenter-cli stop ${APP_NAME}
sleep 2
appcenter-cli start ${APP_NAME}
sleep 3

echo ""
echo -e "${YELLOW}[4/4] 验证服务...${NC}"

if curl -s http://localhost:18080/health | grep -q "ok"; then
    echo -e "${GREEN}✓ 服务运行正常${NC}"
else
    echo -e "${RED}✗ 服务未正常运行${NC}"
    exit 1
fi

echo ""
echo "=========================================="
echo "  热更新完成"
echo "=========================================="
echo ""
echo "后端代码已更新并重启"
echo "访问地址: http://localhost:18080"
echo ""
echo "如需回滚，备份文件在: $BACKUP_DIR"
echo ""
