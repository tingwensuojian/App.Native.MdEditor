#!/bin/bash

# 🚀 多图床支持 - 自动集成脚本
# 用途: 自动将图床功能集成到主服务

set -e

echo "🚀 开始集成多图床支持..."
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 步骤 1: 检查文件
echo -e "${YELLOW}[步骤 1/5]${NC} 检查必要文件..."

if [ ! -f "app/server/server.js" ]; then
  echo -e "${RED}❌ 错误: app/server/server.js 不存在${NC}"
  exit 1
fi

if [ ! -d "app/server/imagebed" ]; then
  echo -e "${RED}❌ 错误: app/server/imagebed 目录不存在${NC}"
  exit 1
fi

if [ ! -f "app/ui/frontend/src/components/ImagebedSettingsPanel.jsx" ]; then
  echo -e "${RED}❌ 错误: 前端组件不存在${NC}"
  exit 1
fi

echo -e "${GREEN}✅ 所有文件检查完成${NC}"
echo ""

# 步骤 2: 安装依赖
echo -e "${YELLOW}[步骤 2/5]${NC} 安装后端依赖..."

cd app/server

if ! npm list busboy > /dev/null 2>&1; then
  echo "  安装 busboy..."
  npm install busboy --save
fi

if ! npm list qiniu > /dev/null 2>&1; then
  echo "  安装 qiniu..."
  npm install qiniu --save
fi

if ! npm list ali-oss > /dev/null 2>&1; then
  echo "  安装 ali-oss..."
  npm install ali-oss --save
fi

if ! npm list cos-nodejs-sdk-v5 > /dev/null 2>&1; then
  echo "  安装 cos-nodejs-sdk-v5..."
  npm install cos-nodejs-sdk-v5 --save
fi

if ! npm list @octokit/rest > /dev/null 2>&1; then
  echo "  安装 @octokit/rest..."
  npm install @octokit/rest --save
fi

if ! npm list sharp > /dev/null 2>&1; then
  echo "  安装 sharp..."
  npm install sharp --save
fi

cd - > /dev/null

echo -e "${GREEN}✅ 依赖安装完成${NC}"
echo ""

# 步骤 3: 备份原文件
echo -e "${YELLOW}[步骤 3/5]${NC} 备份原文件..."

BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

cp app/server/server.js "$BACKUP_DIR/server.js.bak"
cp app/ui/frontend/src/components/ImageManagerDialog.jsx "$BACKUP_DIR/ImageManagerDialog.jsx.bak"

echo -e "${GREEN}✅ 备份完成: $BACKUP_DIR${NC}"
echo ""

# 步骤 4: 检查集成状态
echo -e "${YELLOW}[步骤 4/5]${NC} 检查集成状态..."

if grep -q "ImageBedManager" app/server/server.js; then
  echo -e "${YELLOW}⚠️  后端已包含 ImageBedManager 导入${NC}"
else
  echo -e "${YELLOW}ℹ️  后端需要集成 ImageBedManager${NC}"
fi

if grep -q "ImagebedSettingsPanel" app/ui/frontend/src/components/ImageManagerDialog.jsx; then
  echo -e "${YELLOW}⚠️  前端已包含 ImagebedSettingsPanel 导入${NC}"
else
  echo -e "${YELLOW}ℹ️  前端需要集成 ImagebedSettingsPanel${NC}"
fi

echo ""

# 步骤 5: 显示后续步骤
echo -e "${YELLOW}[步骤 5/5]${NC} 显示后续步骤..."
echo ""

echo -e "${GREEN}✅ 前置准备完成！${NC}"
echo ""
echo "📋 后续手动集成步骤:"
echo ""
echo "1️⃣  后端集成 (app/server/server.js):"
echo "   - 参考: IMAGEBED_SERVER_PATCH.js"
echo "   - 参考: IMAGEBED_PHASE2_GUIDE.md"
echo "   - 添加导入、初始化、multipart 函数、API 路由"
echo ""
echo "2️⃣  前端集成 (app/ui/frontend/src/components/ImageManagerDialog.jsx):"
echo "   - 参考: IMAGEBED_PHASE3_COMPLETION.md"
echo "   - 添加导入、标签页按钮、标签页内容"
echo ""
echo "3️⃣  构建部署:"
echo "   cd app/ui/frontend && npm run build"
echo "   cd /vol4/1000/开发文件夹/mac"
echo "   bash build-and-deploy.sh --local"
echo ""
echo "4️⃣  验证:"
echo "   curl http://localhost:18080/api/imagebed/list"
echo ""
echo "📚 详细文档:"
echo "   - IMAGEBED_INTEGRATION_CHECKLIST.md"
echo "   - NEXT_STEPS.md"
echo ""
echo -e "${GREEN}🎉 准备就绪！${NC}"
