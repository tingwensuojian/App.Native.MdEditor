#!/bin/bash
cd app/ui/frontend
# 尝试使用系统中的 node
if command -v node &> /dev/null; then
    node node_modules/.bin/vite build
elif command -v nodejs &> /dev/null; then
    nodejs node_modules/.bin/vite build
else
    echo "错误: 未找到 Node.js"
    echo "请手动运行: cd app/ui/frontend && npm run build"
    exit 1
fi
