#!/bin/bash

# 快速部署脚本 v1.3.0
# 功能：构建前端 -> 打包 fpk -> 准备安装

set -e

echo "=========================================="
echo "  Markdown 编辑器 v1.3.0"
echo "  快速部署脚本"
echo "=========================================="
echo ""

# 设置 Node.js 环境
export PATH=/var/apps/nodejs_v22/target/bin:$PATH

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "📍 当前目录: $SCRIPT_DIR"
echo ""

# 步骤 1: 构建前端
echo "=========================================="
echo "步骤 1/2: 构建前端"
echo "=========================================="
cd app/ui/frontend

echo "🔨 开始构建..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ 前端构建成功！"
else
    echo "❌ 前端构建失败！"
    exit 1
fi

cd "$SCRIPT_DIR"
echo ""

# 步骤 2: 打包 fpk
echo "=========================================="
echo "步骤 2/2: 打包 FPK"
echo "=========================================="

# 检查 fnpack 是否存在
if [ ! -f "../fnpack-1.2.1-darwin-arm64" ]; then
    echo "❌ 找不到 fnpack 工具"
    echo "请确保 fnpack-1.2.1-darwin-arm64 在上级目录中"
    exit 1
fi

echo "📦 开始打包..."
../fnpack-1.2.1-darwin-arm64 build

if [ $? -eq 0 ]; then
    echo "✅ FPK 打包成功！"
else
    echo "❌ FPK 打包失败！"
    exit 1
fi

echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo ""
echo "📦 生成的文件:"
ls -lh *.fpk 2>/dev/null || echo "  未找到 .fpk 文件"
echo ""
echo "🎉 新功能:"
echo "  ✅ 另存为功能"
echo "  ✅ 导出功能 (HTML/Markdown/TXT)"
echo "  ✅ 设置对话框"
echo "  ✅ 主题切换优化"
echo ""
echo "📝 下一步:"
echo "  1. 将 .fpk 文件复制到飞牛 NAS"
echo "  2. 使用 appcenter-cli install-fpk 安装"
echo "  3. 或通过 Web UI 上传安装"
echo ""
echo "📚 文档:"
echo "  - RELEASE_NOTES_v1.3.0.md  (版本说明)"
echo "  - TESTING_GUIDE.md         (测试指南)"
echo "  - DEVELOPMENT_PROGRESS.md  (开发进度)"
echo ""

