#!/bin/bash

echo "================================"
echo "重新部署应用"
echo "================================"
echo ""

cd /vol4/1000/开发文件夹/mac

echo "1. 检查 FPK 文件..."
if [ ! -f "App.Native.MdEditor2.fpk" ]; then
    echo "错误: FPK 文件不存在"
    exit 1
fi

echo "   ✓ FPK 文件存在: $(ls -lh App.Native.MdEditor2.fpk | awk '{print $5}')"
echo ""

echo "2. 卸载旧版本..."
appcenter-cli app uninstall App.Native.MdEditor2 2>&1 | grep -v "^$"

echo ""
echo "3. 安装新版本..."
appcenter-cli app install App.Native.MdEditor2.fpk

echo ""
echo "4. 等待服务启动..."
sleep 5

echo ""
echo "5. 验证服务..."
if curl -s http://localhost:18080/health | grep -q "ok"; then
    echo "   ✓ 服务运行正常"
else
    echo "   ✗ 服务未正常运行"
    exit 1
fi

echo ""
echo "6. 测试中文文件名支持..."
if curl -s -I "http://localhost:18080/images/2026/03/07/1772863773484_vis0e1_IMG_2286_%E5%89%AF%E6%9C%AC.JPG.jpg" | grep -q "200 OK"; then
    echo "   ✓ 中文文件名支持正常"
else
    echo "   ✗ 中文文件名访问失败"
    echo "   (这可能是正常的，如果文件不存在)"
fi

echo ""
echo "================================"
echo "✓ 部署完成"
echo "================================"
echo ""
echo "现在可以测试图片上传功能了！"
echo ""
