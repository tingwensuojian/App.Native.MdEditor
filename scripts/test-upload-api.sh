#!/bin/bash

# 测试 HEIC 上传功能

echo "================================"
echo "HEIC 上传功能测试"
echo "================================"
echo ""

# 创建一个测试图片
echo "创建测试图片..."
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00' > /tmp/test-upload.jpg

echo ""
echo "测试 1: 直接上传到后端 (18080)"
echo "-----------------------------------"
curl -s -X POST http://localhost:18080/api/image/upload \
  -F "image=@/tmp/test-upload.jpg" | python3 -m json.tool

echo ""
echo ""
echo "测试 2: 通过 Vite 代理上传 (3000)"
echo "-----------------------------------"
curl -s -X POST http://localhost:3000/api/image/upload \
  -F "image=@/tmp/test-upload.jpg" | python3 -m json.tool

echo ""
echo ""
echo "测试 3: 检查转换器状态"
echo "-----------------------------------"
curl -s http://localhost:3000/api/image/converter/status | python3 -m json.tool

echo ""
echo ""
echo "================================"
echo "测试完成"
echo "================================"
echo ""
echo "如果以上测试都成功，说明后端和代理都正常工作。"
echo "问题可能出在前端应用的具体实现上。"
echo ""
echo "请在浏览器中："
echo "1. 打开开发者工具 (F12)"
echo "2. 切换到 Console 标签"
echo "3. 尝试上传图片"
echo "4. 查看详细的错误信息"
echo ""
