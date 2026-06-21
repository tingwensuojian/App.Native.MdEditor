#!/bin/bash

set -e

echo "=========================================="
echo "  文件树功能 - 完整构建流程"
echo "=========================================="

PROJECT_DIR="/Users/sangxuesheng/Desktop/开发/App.Native.MdEditor"
FNPACK="/Users/sangxuesheng/Desktop/开发/fnpack-1.2.1-darwin-arm64"
BUILD_DIR="/tmp/fpk_filetree_$(date +%s)"

# 步骤 1: 检查前端构建产物
echo ""
echo "📋 步骤 1: 检查前端构建"
if [ ! -d "$PROJECT_DIR/app/ui/frontend/dist" ]; then
    echo "❌ 错误: 前端未构建"
    echo ""
    echo "请在有 Node.js 的环境中执行："
    echo "  cd $PROJECT_DIR/app/ui/frontend"
    echo "  npm run build"
    echo ""
    exit 1
fi

echo "✅ 前端构建产物存在"

# 步骤 2: 创建构建目录
echo ""
echo "📁 步骤 2: 创建构建目录"
mkdir -p "$BUILD_DIR"
echo "✅ 构建目录: $BUILD_DIR"

# 步骤 3: 复制文件
echo ""
echo "📦 步骤 3: 复制项目文件..."
rsync -av \
  --exclude='node_modules*' \
  --exclude='.git' \
  --exclude='*.log' \
  --exclude='app/ui/frontend/src' \
  --exclude='app/ui/frontend/package*.json' \
  --exclude='app/ui/frontend/vite.config.js' \
  --exclude='app/ui/frontend/index.html' \
  --exclude='app/ui/frontend/.gitignore' \
  --exclude='app/ui/frontend/README.md' \
  --exclude='build-frontend.sh' \
  --exclude='.fnpackignore' \
  --exclude='build_temp' \
  --exclude='fpk_build' \
  --exclude='*.md' \
  "$PROJECT_DIR/" "$BUILD_DIR/" > /dev/null

echo "✅ 文件复制完成"

# 步骤 4: 更新版本号
echo ""
echo "📝 步骤 4: 更新版本号"
cd "$BUILD_DIR"
sed -i '' 's/version=.*/version=1.1.0/' manifest
VERSION=$(grep "^version=" manifest | cut -d'=' -f2)
echo "✅ 版本号: $VERSION"

# 步骤 5: 构建 fpk
echo ""
echo "🔨 步骤 5: 构建 fpk..."
"$FNPACK" build

if [ ! -f "App.Native.MdEditor.fpk" ]; then
    echo "❌ 构建失败"
    exit 1
fi

# 步骤 6: 显示结果
echo ""
echo "=========================================="
echo "✅ 构建成功！"
echo "=========================================="
echo "版本: $VERSION"
echo "文件: $BUILD_DIR/App.Native.MdEditor.fpk"
echo "大小: $(ls -lh "$BUILD_DIR/App.Native.MdEditor.fpk" | awk '{print $5}')"
echo ""
echo "📋 新功能："
echo "  ✅ 文件树组件（左侧文件浏览器）"
echo "  ✅ 目录展开/折叠"
echo "  ✅ 文件搜索"
echo "  ✅ 文件点击打开"
echo ""
echo "📁 获取 FPK 文件："
echo "  1. 使用 Finder: Cmd+Shift+G → $BUILD_DIR"
echo "  2. 或在终端中打开: open '$BUILD_DIR'"
echo ""
echo "🚀 部署到飞牛 NAS："
echo "  appcenter-cli install-fpk /path/to/App.Native.MdEditor.fpk"
echo ""
echo "🧪 测试要点："
echo "  1. 点击工具栏 📁 按钮切换文件树"
echo "  2. 展开目录查看 .md 文件"
echo "  3. 点击文件名打开文件"
echo "  4. 使用搜索框过滤文件"
echo "=========================================="

# 在 Finder 中打开
open "$BUILD_DIR"

