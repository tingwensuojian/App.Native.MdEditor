#!/bin/bash

# 完整构建 + 优化打包 + 安装流程

set -e

echo "=========================================="
echo "  Markdown 编辑器 - 构建与打包"
echo "=========================================="
echo ""

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

# 设置 Node.js 环境
export PATH=/var/apps/nodejs_v22/target/bin:$PATH

# 前端构建需要 devDependencies，确保不被 NODE_ENV=production 影响
ORIGINAL_NODE_ENV="$NODE_ENV"
export NODE_ENV=development

# ============================================
# 步骤 1: 更新 manifest 版本号
# ============================================
echo "[1/4] 更新 manifest 版本号..."
MANIFEST_FILE="$PROJECT_ROOT/manifest"
if [ -f "$MANIFEST_FILE" ]; then
  # 读取系统已安装版本（若存在）
  INSTALLED_VERSION=$(appcenter-cli info App.Native.MdEditor2 2>/dev/null | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1)
  MANIFEST_VERSION=$(grep '^version=' "$MANIFEST_FILE" | cut -d= -f2)

  if [[ "$INSTALLED_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    BASE_VERSION="$INSTALLED_VERSION"
    echo "  检测到系统版本: ${INSTALLED_VERSION}"
  else
    BASE_VERSION="$MANIFEST_VERSION"
    echo "  未检测到系统版本，使用 manifest: ${MANIFEST_VERSION}"
  fi

  if [[ "$BASE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    IFS='.' read -r MAJOR MINOR PATCH <<< "$BASE_VERSION"
    NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
    sed -i "s/^version=.*/version=${NEW_VERSION}/" "$MANIFEST_FILE"

    # 同步前端 AboutDialog 显示版本号
    ABOUT_DIALOG_FILE="$PROJECT_ROOT/app/ui/frontend/src/components/AboutDialog.jsx"
    if [ -f "$ABOUT_DIALOG_FILE" ]; then
      sed -i "s/版本 v[0-9]\+\.[0-9]\+\.[0-9]\+/版本 v${NEW_VERSION}/" "$ABOUT_DIALOG_FILE"
      echo "  AboutDialog 版本号已同步"
    fi

    echo "  版本号已更新: ${BASE_VERSION} → ${NEW_VERSION}"
  else
    echo "  版本号格式不符合 x.y.z，跳过更新"
  fi
else
  echo "  未找到 manifest，跳过版本号更新"
fi

# ============================================
# 步骤 2: 构建前端
# ============================================
echo "[2/4] 构建前端..."
cd "$PROJECT_ROOT/app/ui/frontend"

# node_modules 可能存在但不完整（例如缺少 vite），这里做一次健壮性检查
if [ ! -d "node_modules" ] || [ ! -f "node_modules/vite/bin/vite.js" ]; then
  echo "  安装/修复前端依赖（node_modules 不存在或不完整）..."
  npm install --legacy-peer-deps
fi

npm run build

# 构建后校验：确保版本号写入前端产物
echo "  校验前端产物版本号..."
DIST_DIR="$PROJECT_ROOT/app/ui/frontend/dist"
if [ -d "$DIST_DIR" ]; then
  if grep -R "版本 v${NEW_VERSION}" "$DIST_DIR" >/dev/null 2>&1; then
    echo "  前端产物版本号已写入: v${NEW_VERSION}"
  else
    echo "  前端产物未写入版本号 v${NEW_VERSION}，停止打包"
    exit 1
  fi
else
  echo "  未找到前端 dist 目录，停止打包"
  exit 1
fi

# 还原 NODE_ENV
export NODE_ENV="$ORIGINAL_NODE_ENV"

# ============================================
# 步骤 3: 打包 fpk（依赖 .fpkignore 排除无用文件）
# ============================================
echo "[3/4] 打包 fpk..."
cd "$PROJECT_ROOT"

fnpack build

if [ ! -f "App.Native.MdEditor2.fpk" ]; then
  echo "  打包失败，未生成 fpk"
  exit 1
fi

FPK_SIZE=$(ls -lh App.Native.MdEditor2.fpk | awk '{print $5}')

echo "  fpk 打包完成: ${FPK_SIZE}"

# ============================================
# 步骤 4: 安装并启动应用
# ============================================
echo "[4/4] 安装并启动应用..."

appcenter-cli stop App.Native.MdEditor2 2>/dev/null || true
sleep 1

appcenter-cli install-fpk App.Native.MdEditor2.fpk
sleep 2

# 安装后重启，确保前端静态资源生效
appcenter-cli stop App.Native.MdEditor2 2>/dev/null || true
sleep 1
appcenter-cli start App.Native.MdEditor2
sleep 3

if curl -s http://localhost:18080/health > /dev/null 2>&1; then
  echo "  应用启动成功"
else
  echo "  应用可能需要更多时间启动"
fi

echo ""
echo "✅ 构建、打包与安装完成"

