#!/bin/bash

echo "测试图片上传 API..."
echo ""

# 测试 API 是否存在
echo "1. 测试 API 路由..."
curl -X POST http://localhost:18080/api/image/upload \
  -H "Content-Type: application/json" \
  2>/dev/null | head -5

echo ""
echo ""
echo "2. 检查 server.js 中的 API 定义..."
grep -A 5 "POST /api/image/upload" app/server/server.js | head -10

echo ""
echo "提示："
echo "- 如果看到 404，说明后端服务器需要重启"
echo "- 如果看到 'INVALID_CONTENT_TYPE'，说明 API 正常工作"
echo "- 请重启后端服务器：pkill -f server.js && ./app/server/server.js"
