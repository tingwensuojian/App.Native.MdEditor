#!/bin/bash
# 字体信息查看脚本 - 不删除任何格式

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== KaTeX 字体信息 ===${NC}"

FONTS_DIR="/vol4/1000/开发文件夹/mac/app/ui/frontend/public/fonts"
cd "$FONTS_DIR"

# 统计字体大小
TOTAL_SIZE=$(du -sh . | cut -f1)
echo "字体总大小: ${TOTAL_SIZE}"

# 统计文件数量
TTF_COUNT=$(find . -name "*.ttf" | wc -l)
WOFF_COUNT=$(find . -name "*.woff" -not -name "*.woff2" | wc -l)
WOFF2_COUNT=$(find . -name "*.woff2" | wc -l)

echo ""
echo "字体文件统计："
echo "  - TTF:   ${TTF_COUNT} 个"
echo "  - WOFF:  ${WOFF_COUNT} 个"
echo "  - WOFF2: ${WOFF2_COUNT} 个"

# 分别统计各格式大小
if [ $TTF_COUNT -gt 0 ]; then
    TTF_SIZE=$(find . -name "*.ttf" -exec du -ch {} + | tail -1 | cut -f1)
    echo "  - TTF 总大小:   ${TTF_SIZE}"
fi

if [ $WOFF_COUNT -gt 0 ]; then
    WOFF_SIZE=$(find . -name "*.woff" -not -name "*.woff2" -exec du -ch {} + | tail -1 | cut -f1)
    echo "  - WOFF 总大小:  ${WOFF_SIZE}"
fi

if [ $WOFF2_COUNT -gt 0 ]; then
    WOFF2_SIZE=$(find . -name "*.woff2" -exec du -ch {} + | tail -1 | cut -f1)
    echo "  - WOFF2 总大小: ${WOFF2_SIZE}"
fi

echo ""
echo -e "${GREEN}=== 字体格式说明 ===${NC}"
echo "• TTF:   传统格式，兼容性最好，体积最大"
echo "• WOFF:  Web 字体格式，兼容 IE9+，体积中等"
echo "• WOFF2: 现代 Web 字体，兼容 Chrome 36+/Firefox 39+/Safari 10+，体积最小"
echo ""
echo -e "${YELLOW}优化建议：${NC}"
echo "1. 保留所有格式以确保最大兼容性（当前策略）"
echo "2. 使用字体按需加载策略（仅在需要数学公式时加载）"
echo "3. 考虑使用 CDN 加载 KaTeX 字体"
echo ""
echo -e "${BLUE}字体按需加载示例：${NC}"
echo "// 仅在检测到数学公式时加载字体"
echo "if (document.querySelector('.math-formula')) {"
echo "  import('./fonts/katex.css')"
echo "}"
