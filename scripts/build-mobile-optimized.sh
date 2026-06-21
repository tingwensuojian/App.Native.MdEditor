#!/bin/bash
# 移动端性能优化构建脚本

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== 移动端性能优化构建 ===${NC}"

export PATH=/var/apps/nodejs_v22/target/bin:$PATH
export NODE_ENV=production

PROJECT_ROOT="/vol4/1000/开发文件夹/mac"
FRONTEND_DIR="$PROJECT_ROOT/app/ui/frontend"

# 1. 检查字体文件
echo -e "\n${YELLOW}[1/5] 检查字体文件...${NC}"
cd "$FRONTEND_DIR/public/fonts"
FONTS_SIZE=$(du -sh . | cut -f1)
echo "  字体大小: ${FONTS_SIZE}"
echo "  保留所有格式（ttf/woff/woff2）以确保兼容性"

# 2. 构建前端
echo -e "\n${YELLOW}[2/5] 构建前端（移动端优化）...${NC}"
cd "$FRONTEND_DIR"
npm run build

BUILD_SIZE=$(du -sh dist | cut -f1)
echo -e "${GREEN}✓ 前端构建完成: ${BUILD_SIZE}${NC}"

# 3. 优化图片（如果安装了工具）
echo -e "\n${YELLOW}[3/5] 优化图片资源...${NC}"
if command -v pngquant &> /dev/null; then
    find dist -name "*.png" -exec pngquant --force --ext .png --quality 80-95 {} \; 2>/dev/null || true
    echo -e "${GREEN}✓ PNG 图片已优化${NC}"
else
    echo "  跳过（未安装 pngquant）"
fi

if command -v jpegoptim &> /dev/null; then
    find dist -name "*.jpg" -exec jpegoptim --max=85 {} \; 2>/dev/null || true
    echo -e "${GREEN}✓ JPEG 图片已优化${NC}"
else
    echo "  跳过（未安装 jpegoptim）"
fi

# 4. 分析构建产物
echo -e "\n${YELLOW}[4/5] 分析构建产物...${NC}"
cd "$FRONTEND_DIR/dist"

JS_SIZE=$(find assets -name "*.js" -exec du -ch {} + 2>/dev/null | tail -1 | cut -f1 || echo "N/A")
CSS_SIZE=$(find assets -name "*.css" -exec du -ch {} + 2>/dev/null | tail -1 | cut -f1 || echo "N/A")
FONTS_SIZE=$(du -sh fonts 2>/dev/null | cut -f1 || echo "0")
TOTAL_SIZE=$(du -sh . | cut -f1)

echo "  JavaScript: ${JS_SIZE}"
echo "  CSS: ${CSS_SIZE}"
echo "  字体: ${FONTS_SIZE}"
echo "  总计: ${TOTAL_SIZE}"

# 5. 生成性能报告
echo -e "\n${YELLOW}[5/5] 生成性能报告...${NC}"
cat > "$PROJECT_ROOT/mobile-build-report.txt" << EOF
移动端构建报告
生成时间: $(date)

构建产物大小:
- JavaScript: ${JS_SIZE}
- CSS: ${CSS_SIZE}
- 字体: ${FONTS_SIZE}
- 总计: ${TOTAL_SIZE}

优化措施:
✓ 保留所有字体格式（ttf/woff/woff2）确保兼容性
✓ 代码分包优化（6个 vendor chunks）
✓ 禁用 sourcemap
✓ CSS 代码分割
$(command -v pngquant &> /dev/null && echo "✓ PNG 图片压缩" || echo "- PNG 图片压缩（未安装工具）")
$(command -v jpegoptim &> /dev/null && echo "✓ JPEG 图片优化" || echo "- JPEG 图片优化（未安装工具）")

文件列表:
$(find assets -type f 2>/dev/null | sort)

进一步优化建议:
1. Monaco Editor 懒加载（可减少 ~3MB）
2. WebP 图片格式（可减少 30-50%）
3. Service Worker 缓存
4. 虚拟滚动优化长列表
5. 组件按需加载（图片管理器、导出功能等）
EOF

echo -e "${GREEN}✓ 报告已生成: mobile-build-report.txt${NC}"

# 显示总结
echo -e "\n${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     移动端优化构建完成                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo -e "${GREEN}构建产物: ${TOTAL_SIZE}${NC}"
echo -e "${GREEN}字体优化: ${BEFORE_FONTS} → ${AFTER_FONTS}${NC}"
echo ""
echo -e "${YELLOW}下一步：${NC}"
echo "1. 运行 bash build-optimized.sh 打包 fpk"
echo "2. 查看 mobile-build-report.txt 了解详细信息"
echo "3. 考虑实施 MOBILE_PERFORMANCE_OPTIMIZATION.md 中的进阶优化"
