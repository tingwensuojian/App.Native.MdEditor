#!/bin/bash

# HEIC 功能部署脚本
# 用于重启服务并验证功能

echo "================================"
echo "HEIC 功能部署"
echo "================================"
echo ""

# 1. 检查后端代码
echo "1. 检查后端代码..."
if grep -q "imageConverter" /vol4/@appcenter/App.Native.MdEditor2/server/server.js; then
    echo "   ✓ 后端代码已更新"
else
    echo "   ✗ 后端代码未更新，需要重新打包"
    echo ""
    echo "   请运行: fnpack build"
    exit 1
fi

echo ""

# 2. 重启服务
echo "2. 重启服务..."
echo "   请运行以下命令（需要 root 权限）:"
echo ""
echo "   sudo systemctl restart App.Native.MdEditor2"
echo ""
echo "   或者使用 appcenter-cli:"
echo ""
echo "   appcenter-cli app restart App.Native.MdEditor2"
echo ""

read -p "   服务已重启？(y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "   请先重启服务"
    exit 1
fi

echo ""

# 3. 等待服务启动
echo "3. 等待服务启动..."
sleep 3

# 4. 验证服务
echo "4. 验证服务..."

# 检查健康状态
if curl -s http://localhost:18080/health | grep -q "ok"; then
    echo "   ✓ 服务运行正常"
else
    echo "   ✗ 服务未正常运行"
    exit 1
fi

# 检查转换器 API
if curl -s http://localhost:18080/api/image/converter/status | grep -q "available"; then
    echo "   ✓ 转换器 API 正常"
else
    echo "   ✗ 转换器 API 未找到"
    echo "   可能需要重新打包应用"
    exit 1
fi

echo ""
echo "================================"
echo "✓ 部署完成"
echo "================================"
echo ""
echo "现在可以测试 HEIC 图片上传功能了！"
echo ""
