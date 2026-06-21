#!/bin/bash

# 右键菜单剪贴板功能修复 - 构建和部署脚本
# 用于快速构建前端并部署到生产环境进行测试

set -e

echo "=========================================="
echo "  右键菜单剪贴板功能修复 - 部署脚本"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查是否在正确的目录
if [ ! -d "app/ui/frontend" ]; then
    echo -e "${RED}错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

# 步骤 1: 构建前端
echo -e "${YELLOW}[1/4] 构建前端...${NC}"
cd app/ui/frontend

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}检测到 node_modules 不存在，正在安装依赖...${NC}"
    npm install
fi

echo "开始构建..."
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ 前端构建成功${NC}"
else
    echo -e "${RED}✗ 前端构建失败${NC}"
    exit 1
fi

cd ../../..

# 步骤 2: 备份当前版本（可选）
echo ""
echo -e "${YELLOW}[2/4] 备份当前版本...${NC}"
BACKUP_DIR="backups/clipboard-fix-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
if [ -d "app/ui/frontend/dist" ]; then
    cp -r app/ui/frontend/dist "$BACKUP_DIR/"
    echo -e "${GREEN}✓ 备份完成: $BACKUP_DIR${NC}"
else
    echo -e "${YELLOW}⚠ 没有找到旧的 dist 目录，跳过备份${NC}"
fi

# 步骤 3: 检查修改的文件
echo ""
echo -e "${YELLOW}[3/4] 验证修改...${NC}"
echo "检查关键修改是否存在..."

# 检查 App.jsx 中的关键修改
if grep -q "navigator.clipboard && navigator.clipboard.writeText" app/ui/frontend/src/App.jsx; then
    echo -e "${GREEN}✓ 检测到 Clipboard API 检查逻辑${NC}"
else
    echo -e "${RED}✗ 未找到 Clipboard API 检查逻辑${NC}"
    exit 1
fi

if grep -q "editor.trigger('keyboard', 'editor.action.clipboardCutAction')" app/ui/frontend/src/App.jsx; then
    echo -e "${GREEN}✓ 检测到 Monaco Editor fallback 机制${NC}"
else
    echo -e "${RED}✗ 未找到 Monaco Editor fallback 机制${NC}"
    exit 1
fi

if grep -q "document.execCommand('copy')" app/ui/frontend/src/App.jsx; then
    echo -e "${GREEN}✓ 检测到 execCommand fallback 机制${NC}"
else
    echo -e "${RED}✗ 未找到 execCommand fallback 机制${NC}"
    exit 1
fi

if grep -q "hasClipboard" app/ui/frontend/src/App.jsx; then
    echo -e "${GREEN}✓ 检测到剪贴板状态检测逻辑${NC}"
else
    echo -e "${RED}✗ 未找到剪贴板状态检测逻辑${NC}"
    exit 1
fi

# 步骤 4: 显示部署信息
echo ""
echo -e "${YELLOW}[4/4] 部署信息${NC}"
echo "----------------------------------------"
echo "构建输出目录: app/ui/frontend/dist"
echo "备份目录: $BACKUP_DIR"
echo ""
echo -e "${GREEN}✓ 构建完成！${NC}"
echo ""
echo "=========================================="
echo "  下一步操作"
echo "=========================================="
echo ""
echo "1. 测试开发环境:"
echo "   cd app/ui/frontend"
echo "   npm run dev"
echo "   打开浏览器访问开发服务器"
echo ""
echo "2. 部署到生产环境:"
echo "   ./deploy.sh"
echo "   或手动部署 app/ui/frontend/dist 目录"
echo ""
echo "3. 测试剪贴板功能:"
echo "   - 打开编辑器"
echo "   - 选中文本，右键点击"
echo "   - 测试剪切、复制、粘贴功能"
echo "   - 在 HTTP 和 HTTPS 环境下都要测试"
echo ""
echo "4. 使用测试页面:"
echo "   在浏览器中打开: test-clipboard-fix.html"
echo "   测试各种剪贴板操作"
echo ""
echo "=========================================="
echo ""

# 询问是否立即部署
read -p "是否立即部署到生产环境? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f "deploy.sh" ]; then
        echo -e "${YELLOW}开始部署...${NC}"
        ./deploy.sh
    else
        echo -e "${RED}未找到 deploy.sh 脚本${NC}"
        echo "请手动部署 app/ui/frontend/dist 目录"
    fi
else
    echo "跳过部署，请稍后手动部署"
fi

echo ""
echo -e "${GREEN}完成！${NC}"
