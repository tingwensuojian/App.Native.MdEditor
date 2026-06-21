#!/bin/bash

###############################################################################
# 飞牛 NAS Markdown 编辑器 - 自动保存功能构建脚本
# 版本: 1.2.0
# 功能: 构建前端 + 打包 FPK
###############################################################################

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目路径
PROJECT_ROOT="/Users/sangxuesheng/Desktop/开发/App.Native.MdEditor"
FRONTEND_DIR="$PROJECT_ROOT/app/ui/frontend"

# 临时构建目录
BUILD_TEMP="/tmp/fpk_autosave_$(date +%s)"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  飞牛 Markdown 编辑器 - 自动保存版本${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 步骤 1: 检查项目目录
echo -e "${YELLOW}[1/6] 检查项目目录...${NC}"
if [ ! -d "$PROJECT_ROOT" ]; then
    echo -e "${RED}错误: 项目目录不存在: $PROJECT_ROOT${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 项目目录存在${NC}"
echo ""

# 步骤 2: 检查 node_modules
echo -e "${YELLOW}[2/6] 检查依赖...${NC}"
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo -e "${RED}错误: node_modules 不存在，请先运行 npm install${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 依赖已安装${NC}"
echo ""

# 步骤 3: 创建临时构建目录
echo -e "${YELLOW}[3/6] 创建临时构建目录...${NC}"
mkdir -p "$BUILD_TEMP"
echo -e "${GREEN}✓ 临时目录: $BUILD_TEMP${NC}"
echo ""

# 步骤 4: 复制项目文件（排除不需要的文件）
echo -e "${YELLOW}[4/6] 复制项目文件...${NC}"
rsync -a \
    --exclude='*.log' \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='node_modules.bak' \
    --exclude='dist' \
    --exclude='.DS_Store' \
    "$PROJECT_ROOT/" "$BUILD_TEMP/" 2>/dev/null || true

echo -e "${GREEN}✓ 项目文件已复制${NC}"
echo ""

# 步骤 5: 复制 node_modules（使用 cp 避免符号链接问题）
echo -e "${YELLOW}[5/6] 复制 node_modules...${NC}"
echo "这可能需要几分钟，请耐心等待..."

# 创建目标目录
mkdir -p "$BUILD_TEMP/app/ui/frontend/node_modules"

# 使用 tar 复制（更快且保留权限）
cd "$FRONTEND_DIR"
tar cf - node_modules 2>/dev/null | (cd "$BUILD_TEMP/app/ui/frontend" && tar xf -) 2>/dev/null || {
    echo -e "${YELLOW}警告: 部分文件复制失败，尝试继续...${NC}"
}

echo -e "${GREEN}✓ node_modules 已复制${NC}"
echo ""

# 步骤 6: 构建前端
echo -e "${YELLOW}[6/6] 构建前端...${NC}"
cd "$BUILD_TEMP/app/ui/frontend"

# 设置环境变量避免权限问题
export TMPDIR=/tmp
export npm_config_cache=/tmp/.npm

# 执行构建
if ./node_modules/.bin/vite build; then
    echo -e "${GREEN}✓ 前端构建成功${NC}"
else
    echo -e "${RED}错误: 前端构建失败${NC}"
    echo -e "${YELLOW}尝试使用 npm run build...${NC}"
    npm run build || {
        echo -e "${RED}构建失败，请检查错误信息${NC}"
        exit 1
    }
fi
echo ""

# 检查构建产物
if [ ! -d "$BUILD_TEMP/app/ui/frontend/dist" ]; then
    echo -e "${RED}错误: dist 目录不存在，构建可能失败${NC}"
    exit 1
fi

echo -e "${GREEN}✓ 构建产物已生成${NC}"
ls -lh "$BUILD_TEMP/app/ui/frontend/dist" | head -5
echo ""

# 步骤 7: 打包 FPK
echo -e "${YELLOW}[7/7] 打包 FPK...${NC}"
cd "$BUILD_TEMP"

if fnpack build; then
    echo -e "${GREEN}✓ FPK 打包成功${NC}"
else
    echo -e "${RED}错误: FPK 打包失败${NC}"
    exit 1
fi
echo ""

# 查找生成的 FPK 文件
FPK_FILE=$(find "$BUILD_TEMP" -name "*.fpk" -type f | head -1)

if [ -z "$FPK_FILE" ]; then
    echo -e "${RED}错误: 未找到 FPK 文件${NC}"
    exit 1
fi

# 显示 FPK 信息
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ 构建完成！${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}FPK 文件位置:${NC}"
echo -e "  $FPK_FILE"
echo ""
echo -e "${GREEN}文件大小:${NC}"
ls -lh "$FPK_FILE" | awk '{print "  " $5}'
echo ""

# 复制到项目根目录
echo -e "${YELLOW}复制 FPK 到项目根目录...${NC}"
cp "$FPK_FILE" "$PROJECT_ROOT/" 2>/dev/null || {
    echo -e "${YELLOW}警告: 无法复制到项目根目录，请手动复制${NC}"
    echo -e "${YELLOW}源文件: $FPK_FILE${NC}"
    echo -e "${YELLOW}目标: $PROJECT_ROOT/${NC}"
}

# 复制到下载目录（方便访问）
DOWNLOAD_DIR="$HOME/Downloads"
if [ -d "$DOWNLOAD_DIR" ]; then
    echo -e "${YELLOW}复制 FPK 到下载目录...${NC}"
    cp "$FPK_FILE" "$DOWNLOAD_DIR/App.Native.MdEditor-v1.2.0-autosave.fpk" 2>/dev/null || {
        echo -e "${YELLOW}警告: 无法复制到下载目录${NC}"
    }
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}部署说明:${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "1. 上传 FPK 到飞牛 NAS"
echo "2. 在应用中心安装/更新应用"
echo "3. 测试自动保存功能："
echo "   - 编辑文件，等待 30 秒"
echo "   - 刷新页面，应该弹出草稿恢复对话框"
echo "   - 测试手动保存 (Ctrl/Cmd + S)"
echo "   - 测试自动保存开关"
echo ""
echo -e "${GREEN}新功能:${NC}"
echo "  ✓ 自动保存（每 30 秒）"
echo "  ✓ 草稿恢复对话框"
echo "  ✓ 未保存状态指示"
echo "  ✓ 自动保存开关"
echo "  ✓ 智能草稿清理"
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}构建完成！${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 清理提示
echo -e "${YELLOW}临时文件保留在: $BUILD_TEMP${NC}"
echo -e "${YELLOW}如需清理，请运行: rm -rf $BUILD_TEMP${NC}"
echo ""

