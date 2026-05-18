#!/bin/bash

# HEIC 上传测试脚本

SERVER_URL="http://localhost:18080"

echo "================================"
echo "HEIC 上传测试"
echo "================================"
echo ""

# 1. 检查服务器状态
echo "1. 检查服务器状态..."
HEALTH=$(curl -s "${SERVER_URL}/health" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "   ✓ 服务器运行正常: $HEALTH"
else
    echo "   ✗ 服务器未运行"
    echo "   请先启动: cd app/server && node server.js"
    exit 1
fi
echo ""

# 2. 检查转换工具状态
echo "2. 检查转换工具状态..."
STATUS=$(curl -s "${SERVER_URL}/api/image/converter/status" 2>/dev/null)
echo "   $STATUS" | python3 -m json.tool 2>/dev/null || echo "   $STATUS"
echo ""

# 3. 测试上传（需要实际的 HEIC 文件）
echo "3. 上传测试"
echo ""

if [ -z "$1" ]; then
    echo "   用法: $0 <heic文件路径>"
    echo ""
    echo "   示例:"
    echo "     $0 /path/to/photo.heic"
    echo "     $0 /path/to/photo.HEIF"
    echo ""
    echo "   如果没有 HEIC 文件，可以："
    echo "   - 从 iPhone/iPad 传输照片（默认 HEIC 格式）"
    echo "   - 下载测试 HEIC 文件"
    echo "   - 使用在线转换工具将 JPG 转为 HEIC"
    exit 0
fi

HEIC_FILE="$1"

if [ ! -f "$HEIC_FILE" ]; then
    echo "   ✗ 文件不存在: $HEIC_FILE"
    exit 1
fi

echo "   上传文件: $HEIC_FILE"
echo "   文件大小: $(du -h "$HEIC_FILE" | cut -f1)"
echo ""

# 上传文件
echo "   正在上传..."
RESPONSE=$(curl -s -X POST \
  -F "images=@${HEIC_FILE}" \
  "${SERVER_URL}/api/image/upload")

echo ""
echo "   服务器响应:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "   $RESPONSE"

echo ""
echo "================================"
echo ""

# 检查是否成功
if echo "$RESPONSE" | grep -q '"ok": true'; then
    echo "✓ 上传成功！"
    
    # 提取图片 URL
    IMAGE_URL=$(echo "$RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['images'][0]['url'])" 2>/dev/null)
    
    if [ -n "$IMAGE_URL" ]; then
        echo "图片 URL: ${SERVER_URL}${IMAGE_URL}"
        
        # 检查是否进行了转换
        if echo "$RESPONSE" | grep -q '"converted": true'; then
            echo "✓ HEIC 已自动转换为 JPEG"
        fi
    fi
else
    echo "✗ 上传失败"
    
    # 检查是否是转换工具问题
    if echo "$RESPONSE" | grep -q "FFmpeg"; then
        echo ""
        echo "提示: 需要安装 FFmpeg"
        echo "运行: sudo ./install-ffmpeg.sh"
    fi
fi
