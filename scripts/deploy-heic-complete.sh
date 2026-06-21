#!/bin/bash

# 完整部署脚本 - HEIC 功能
# 自动构建、打包、提示重启

set -e

echo "================================"
echo "HEIC 功能完整部署"
echo "================================"
echo ""

# 步骤 1: 构建前端
echo "步骤 1/3: 构建前端..."
cd /vol4/1000/开发文件夹/mac
./build-frontend.sh

if [ $? -ne 0 ]; then
    echo "✗ 前端构建失败"
    exit 1
fi

echo "✓ 前端构建完成"
echo ""

# 步骤 2: 打包应用
echo "步骤 2/3: 打包应用..."
fnpack build

if [ $? -ne 0 ]; then
    echo "✗ 应用打包失败"
    exit 1
fi

echo "✓ 应用打包完成"
echo ""

# 步骤 3: 提示重启
echo "步骤 3/3: 重启服务"
echo ""
echo "请选择重启方式："
echo ""
echo "方法 1 - 使用 systemctl (推荐):"
echo "  sudo systemctl restart App.Native.MdEditor2"
echo ""
echo "方法 2 - 使用 appcenter-cli:"
echo "  appcenter-cli app restart App.Native.MdEditor2"
echo ""
echo "方法 3 - 重新安装:"
echo "  appcenter-cli app uninstall App.Native.MdEditor2"
echo "  appcenter-cli app install App.Native.MdEditor2.fpk"
echo ""

read -p "请选择方法 (1/2/3) 或按 Enter 手动重启: " choice

case $choice in
    1)
        echo ""
        echo "执行: sudo systemctl restart App.Native.MdEditor2"
        sudo systemctl restart App.Native.MdEditor2
        ;;
    2)
        echo ""
        echo "执行: appcenter-cli app restart App.Native.MdEditor2"
        appcenter-cli app restart App.Native.MdEditor2
        ;;
    3)
        echo ""
        echo "执行: 重新安装应用"
        appcenter-cli app uninstall App.Native.MdEditor2
        appcenter-cli app install App.Native.MdEditor2.fpk
        ;;
    *)
        echo ""
        echo "请手动重启服务后继续..."
        read -p "按 Enter 继续验证..."
        ;;
esac

echo ""
echo "等待服务启动..."
sleep 3

# 验证部署
echo ""
echo "================================"
echo "验证部署"
echo "================================"
echo ""

# 检查健康状态
echo -n "检查服务状态... "
if curl -s http://localhost:18080/health | grep -q "ok"; then
    echo "✓"
else
    echo "✗"
    echo "服务未正常运行，请检查日志:"
    echo "  journalctl -u App.Native.MdEditor2 -n 50"
    exit 1
fi

# 检查转换器 API
echo -n "检查转换器 API... "
response=$(curl -s http://localhost:18080/api/image/converter/status)
if echo "$response" | grep -q "available"; then
    echo "✓"
    echo ""
    echo "转换器状态:"
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
else
    echo "✗"
    echo "转换器 API 未找到"
    echo "响应: $response"
    exit 1
fi

echo ""
echo "================================"
echo "✓ 部署成功！"
echo "================================"
echo ""
echo "HEIC 功能已启用，现在可以："
echo "  1. 打开浏览器访问应用"
echo "  2. 点击图片上传按钮"
echo "  3. 选择 HEIC 文件测试"
echo ""
echo "查看日志:"
echo "  journalctl -u App.Native.MdEditor2 -f"
echo ""
