#!/bin/bash

# Markdown 编辑器前端构建脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/app/ui/frontend"

echo "=========================================="
echo "  Markdown 编辑器 - 前端构建"
echo "=========================================="

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js"
    echo "请先安装 Node.js (推荐版本 18+)"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"
echo "✅ npm 版本: $(npm --version)"

# 进入前端目录
cd "$FRONTEND_DIR"

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 安装依赖..."
    npm install
else
    echo ""
    echo "📦 依赖已存在，跳过安装"
fi

# 构建
echo ""
echo "🔨 开始构建..."
npm run build

# 检查构建结果
if [ -d "dist" ]; then
    echo ""
    echo "=========================================="
    echo "✅ 构建成功！"
    echo "=========================================="
    echo "构建产物: $FRONTEND_DIR/dist"
    echo ""
    echo "下一步："
    echo "1. 启动后端服务: node app/server/server.js"
    echo "2. 访问: http://localhost:18080"
    echo ""
else
    echo ""
    echo "❌ 构建失败"
    exit 1
fi

