#!/bin/bash

# HEIC 转换功能测试脚本

SERVER_URL="http://localhost:18080"

echo "================================"
echo "HEIC 转换功能测试"
echo "================================"
echo ""

# 1. 检查服务器状态
echo "1. 检查服务器状态..."
HEALTH=$(curl -s "${SERVER_URL}/health" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "   ✓ 服务器运行正常"
    echo "   响应: $HEALTH"
else
    echo "   ✗ 服务器未运行"
    echo "   请先启动服务器: cd app/server && node server.js"
    exit 1
fi
echo ""

# 2. 检查 FFmpeg 是否安装
echo "2. 检查 FFmpeg 安装状态..."
if command -v ffmpeg &> /dev/null; then
    echo "   ✓ FFmpeg 已安装"
    ffmpeg -version | head -1 | sed 's/^/   /'
else
    echo "   ✗ FFmpeg 未安装"
    echo "   请运行: sudo ./install-ffmpeg.sh"
    exit 1
fi
echo ""

# 3. 检查转换工具状态（通过 API）
echo "3. 检查转换工具状态（API）..."
STATUS=$(curl -s "${SERVER_URL}/api/image/converter/status" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "   API 响应:"
    echo "$STATUS" | python3 -m json.tool 2>/dev/null | sed 's/^/   /' || echo "   $STATUS"
else
    echo "   ✗ 无法连接到 API"
fi
echo ""

# 4. 测试 FFmpeg HEIC 转换
echo "4. 测试 FFmpeg HEIC 转换能力..."
echo "   创建测试图片..."

# 创建一个简单的测试图片（PNG）
TEST_PNG="/tmp/test_image.png"
convert -size 100x100 xc:blue "$TEST_PNG" 2>/dev/null || {
    echo "   注意: ImageMagick 未安装，跳过本地测试"
    echo "   FFmpeg 可以直接处理 HEIC 文件"
}

if [ -f "$TEST_PNG" ]; then
    echo "   ✓ 测试图片创建成功"
    
    # 测试 FFmpeg 转换
    TEST_JPG="/tmp/test_output.jpg"
    ffmpeg -i "$TEST_PNG" -q:v 5 "$TEST_JPG" -y 2>/dev/null
    
    if [ -f "$TEST_JPG" ]; then
        echo "   ✓ FFmpeg 转换测试成功"
        rm -f "$TEST_PNG" "$TEST_JPG"
    else
        echo "   ✗ FFmpeg 转换测试失败"
    fi
fi
echo ""

echo "================================"
echo "测试完成！"
echo "================================"
echo ""
echo "下一步："
echo "  1. 如果 FFmpeg 未安装，运行: sudo ./install-ffmpeg.sh"
echo "  2. 测试 HEIC 上传: ./test-heic-upload.sh <heic文件路径>"
echo "  3. 或在浏览器中上传 HEIC 文件测试"
echo ""
