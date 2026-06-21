#!/bin/bash

# 完整热更新脚本 - 前端+后端一起更新
# 警告：此方法不符合飞牛 NAS 官方规范，仅用于开发调试

set -e

echo "=========================================="
echo "  完整热更新 - 前端+后端"
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

# 创建备份目录
BACKUP_DIR="backups/hot-update-full-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo -e "${YELLOW}[1/6] 构建前端...${NC}"
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
echo -e "${YELLOW}[2/6] 备份当前文件...${NC}"

# 备份前端
if [ -d "${APP_INSTALL_PATH}/ui/frontend/dist" ]; then
    mkdir -p "$BACKUP_DIR/frontend"
    cp -r "${APP_INSTALL_PATH}/ui/frontend/dist" "$BACKUP_DIR/frontend/"
fi

# 备份后端
if [ -d "${APP_INSTALL_PATH}/server" ]; then
    mkdir -p "$BACKUP_DIR/backend"
    cp -r "${APP_INSTALL_PATH}/server" "$BACKUP_DIR/backend/"
fi

echo -e "${GREEN}✓ 备份完成: $BACKUP_DIR${NC}"

echo ""
echo -e "${YELLOW}[3/6] 停止应用...${NC}"
appcenter-cli stop ${APP_NAME}
sleep 2

echo ""
echo -e "${YELLOW}[4/6] 替换文件...${NC}"

# 替换前端
if [ -d "${APP_INSTALL_PATH}/ui/frontend/dist" ]; then
    rm -rf "${APP_INSTALL_PATH}/ui/frontend/dist"
fi
cp -r app/ui/frontend/dist "${APP_INSTALL_PATH}/ui/frontend/"
echo -e "${GREEN}✓ 前端文件已替换${NC}"

# 替换后端
cp -r app/server/* "${APP_INSTALL_PATH}/server/"
echo -e "${GREEN}✓ 后端文件已替换${NC}"

echo ""
echo -e "${YELLOW}[5/6] 启动应用...${NC}"
appcenter-cli start ${APP_NAME}
sleep 5

echo ""
echo -e "${YELLOW}[6/6] 验证服务...${NC}"

if curl -s http://localhost:18080/health | grep -q "ok"; then
    echo -e "${GREEN}✓ 服务运行正常${NC}"
else
    echo -e "${RED}✗ 服务未正常运行${NC}"
    echo -e "${YELLOW}尝试回滚...${NC}"
    
    # 回滚
    appcenter-cli stop ${APP_NAME}
    sleep 2
    
    if [ -d "$BACKUP_DIR/frontend/dist" ]; then
        rm -rf "${APP_INSTALL_PATH}/ui/frontend/dist"
        cp -r "$BACKUP_DIR/frontend/dist" "${APP_INSTALL_PATH}/ui/frontend/"
    fi
    
    if [ -d "$BACKUP_DIR/backend/server" ]; then
        cp -r "$BACKUP_DIR/backend/server"/* "${APP_INSTALL_PATH}/server/"
    fi
    
    appcenter-cli start ${APP_NAME}
    sleep 3
    
    echo -e "${YELLOW}已回滚到之前的版本${NC}"
    exit 1
fi

echo ""
echo "=========================================="
echo "  热更新完成"
echo "=========================================="
echo ""
echo "✓ 前端代码已更新"
echo "✓ 后端代码已更新"
echo "✓ 应用已重启"
echo ""
echo "访问地址: http://localhost:18080"
echo ""
echo "备份文件在: $BACKUP_DIR"
echo ""
echo "=========================================="
