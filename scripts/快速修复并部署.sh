#!/bin/bash

echo "=========================================="
echo "开始修复并部署 Markdown 编辑器"
echo "=========================================="

# 1. 构建前端
echo ""
echo "步骤 1/3: 构建前端..."
cd /vol4/1000/开发文件夹/mac/app/ui/frontend
export PATH=/var/apps/nodejs_v22/target/bin:$PATH
npm run build 2>&1 | tail -10

if [ $? -ne 0 ]; then
    echo "❌ 前端构建失败"
    exit 1
fi

echo "✅ 前端构建成功"

# 2. 停止旧版本
echo ""
echo "步骤 2/3: 停止旧版本..."
appcenter-cli stop App.Native.MdEditor2 2>&1
sleep 2

# 3. 从本地目录直接安装（无需打包 fpk）
echo ""
echo "步骤 3/3: 从本地目录安装..."
cd /vol4/1000/开发文件夹/mac
appcenter-cli install-local 2>&1 | tail -10

if [ $? -ne 0 ]; then
    echo "❌ 安装失败"
    exit 1
fi

echo "✅ 安装成功"

# 4. 启动应用
echo ""
echo "启动应用..."
appcenter-cli start App.Native.MdEditor2 2>&1
sleep 5

# 5. 检查健康状态
echo ""
echo "检查应用状态..."
curl -s http://localhost:18080/health

echo ""
echo "=========================================="
echo "✅ 部署完成！"
echo "=========================================="
echo ""
echo "请访问: http://192.168.2.2:18080/"
echo ""
echo "测试步骤："
echo "1. 打开应用"
echo "2. 创建包含表格、图片、Mermaid 图表的文档"
echo "3. 点击导出按钮"
echo "4. 按 F12 打开浏览器控制台，查看调试信息"
echo ""
echo "💡 提示: 使用 install-local 直接从目录安装，无需打包 fpk"
echo ""
