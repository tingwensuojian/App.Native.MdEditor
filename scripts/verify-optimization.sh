#!/bin/bash
# 快速验证优化效果

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     优化效果验证工具                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"

PROJECT_ROOT="/vol4/1000/开发文件夹/mac"
cd "$PROJECT_ROOT"

# 1. 检查 fpk 包大小
echo -e "\n${YELLOW}[1/6] 检查 fpk 包大小...${NC}"
if [ -f "App.Native.MdEditor2.fpk" ]; then
    FPK_SIZE=$(ls -lh App.Native.MdEditor2.fpk | awk '{print $5}')
    FPK_SIZE_MB=$(du -m App.Native.MdEditor2.fpk | cut -f1)
    
    echo "  fpk 包大小: ${FPK_SIZE}"
    
    if [ $FPK_SIZE_MB -lt 30 ]; then
        echo -e "${GREEN}✓ 优秀！fpk 包已优化到 ${FPK_SIZE}${NC}"
    elif [ $FPK_SIZE_MB -lt 50 ]; then
        echo -e "${YELLOW}⚠ 良好，但还有优化空间（当前 ${FPK_SIZE}）${NC}"
    else
        echo -e "${RED}✗ 需要优化！fpk 包过大（${FPK_SIZE}）${NC}"
        echo "  建议运行: bash build-optimized.sh"
    fi
else
    echo -e "${RED}✗ 未找到 fpk 包${NC}"
    echo "  请先运行: bash build-optimized.sh"
fi

# 2. 检查前端构建产物
echo -e "\n${YELLOW}[2/6] 检查前端构建产物...${NC}"
if [ -d "app/ui/frontend/dist" ]; then
    DIST_SIZE=$(du -sh app/ui/frontend/dist | cut -f1)
    echo "  构建产物大小: ${DIST_SIZE}"
    echo -e "${GREEN}✓ 前端已构建${NC}"
else
    echo -e "${RED}✗ 前端未构建${NC}"
    echo "  请运行: cd app/ui/frontend && npm run build"
fi

# 3. 检查 node_modules
echo -e "\n${YELLOW}[3/6] 检查 node_modules...${NC}"
FRONTEND_NM=$(du -sh app/ui/frontend/node_modules 2>/dev/null | cut -f1 || echo "0")
SERVER_NM=$(du -sh app/server/node_modules 2>/dev/null | cut -f1 || echo "0")

echo "  前端 node_modules: ${FRONTEND_NM}"
echo "  后端 node_modules: ${SERVER_NM}"

if [ "$FRONTEND_NM" != "0" ]; then
    echo -e "${YELLOW}⚠ 前端 node_modules 存在（开发需要，打包时会自动排除）${NC}"
fi

# 4. 检查优化文件
echo -e "\n${YELLOW}[4/6] 检查优化文件...${NC}"

FILES=(
    ".fpkignore:fpk 排除配置"
    ".npmrc:npm 镜像配置"
    "app/ui/frontend/src/utils/performanceOptimization.js:性能优化工具"
    "app/ui/frontend/src/utils/lazyComponents.js:懒加载组件"
    "app/ui/frontend/src/components/FirstScreenLoader.jsx:首屏加载动画"
    "app/ui/frontend/src/hooks/useFirstScreenLoader.js:加载管理 Hook"
)

MISSING_COUNT=0
for item in "${FILES[@]}"; do
    FILE="${item%%:*}"
    DESC="${item##*:}"
    if [ -f "$FILE" ]; then
        echo -e "  ${GREEN}✓${NC} ${DESC}"
    else
        echo -e "  ${RED}✗${NC} ${DESC} (缺失: ${FILE})"
        ((MISSING_COUNT++))
    fi
done

if [ $MISSING_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ 所有优化文件已就绪${NC}"
else
    echo -e "${YELLOW}⚠ 有 ${MISSING_COUNT} 个文件缺失${NC}"
fi

# 5. 检查备份文件夹
echo -e "\n${YELLOW}[5/6] 检查冗余文件...${NC}"
if [ -d "backups" ]; then
    BACKUP_SIZE=$(du -sh backups | cut -f1)
    echo -e "  ${YELLOW}⚠ 发现备份文件夹: ${BACKUP_SIZE}${NC}"
    echo "  建议运行: bash cleanup-project.sh"
else
    echo -e "  ${GREEN}✓ 无备份文件夹${NC}"
fi

DOC_COUNT=$(find . -maxdepth 1 -name "*.md" | wc -l)
if [ $DOC_COUNT -gt 10 ]; then
    echo -e "  ${YELLOW}⚠ 根目录有 ${DOC_COUNT} 个文档文件${NC}"
    echo "  这些文件不会被打包（已在 .fpkignore 中排除）"
else
    echo -e "  ${GREEN}✓ 文档文件数量合理${NC}"
fi

# 6. 生成优化报告
echo -e "\n${YELLOW}[6/6] 生成优化报告...${NC}"

cat > optimization-report.txt << EOF
优化效果验证报告
生成时间: $(date)

=== fpk 包信息 ===
$(if [ -f "App.Native.MdEditor2.fpk" ]; then
    echo "大小: $(ls -lh App.Native.MdEditor2.fpk | awk '{print $5}')"
    echo "路径: $(pwd)/App.Native.MdEditor2.fpk"
else
    echo "未找到 fpk 包"
fi)

=== 构建产物 ===
$(if [ -d "app/ui/frontend/dist" ]; then
    echo "前端构建: $(du -sh app/ui/frontend/dist | cut -f1)"
    echo "文件数量: $(find app/ui/frontend/dist -type f | wc -l) 个"
else
    echo "前端未构建"
fi)

=== node_modules ===
前端: ${FRONTEND_NM}
后端: ${SERVER_NM}

=== 优化文件状态 ===
$(for item in "${FILES[@]}"; do
    FILE="${item%%:*}"
    DESC="${item##*:}"
    if [ -f "$FILE" ]; then
        echo "✓ ${DESC}"
    else
        echo "✗ ${DESC} (缺失)"
    fi
done)

=== 冗余文件检查 ===
$(if [ -d "backups" ]; then
    echo "备份文件夹: $(du -sh backups | cut -f1)"
else
    echo "无备份文件夹"
fi)
文档文件: ${DOC_COUNT} 个

=== 优化建议 ===
$(if [ ! -f "App.Native.MdEditor2.fpk" ]; then
    echo "1. 运行 bash build-optimized.sh 构建优化版 fpk"
fi)
$(if [ -d "backups" ]; then
    echo "2. 运行 bash cleanup-project.sh 清理冗余文件"
fi)
$(if [ $MISSING_COUNT -gt 0 ]; then
    echo "3. 检查缺失的优化文件"
fi)

=== 下一步 ===
1. 查看 OPTIMIZATION_SUMMARY.md 了解完整优化方案
2. 查看 CODE_LEVEL_OPTIMIZATION.md 实施代码优化
3. 查看 FIRST_SCREEN_LOADER_GUIDE.md 添加首屏动画
EOF

echo -e "${GREEN}✓ 报告已生成: optimization-report.txt${NC}"

# 显示总结
echo -e "\n${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          验证完成                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"

if [ -f "App.Native.MdEditor2.fpk" ] && [ $FPK_SIZE_MB -lt 30 ] && [ $MISSING_COUNT -eq 0 ]; then
    echo -e "${GREEN}🎉 优化效果优秀！${NC}"
    echo ""
    echo "下一步："
    echo "1. 在 App.jsx 中添加首屏加载动画"
    echo "2. 实施代码级懒加载优化"
    echo "3. 测试移动端性能"
else
    echo -e "${YELLOW}⚠ 还有优化空间${NC}"
    echo ""
    echo "建议："
    if [ ! -f "App.Native.MdEditor2.fpk" ] || [ $FPK_SIZE_MB -ge 30 ]; then
        echo "1. 运行: bash build-optimized.sh"
    fi
    if [ -d "backups" ]; then
        echo "2. 运行: bash cleanup-project.sh"
    fi
    if [ $MISSING_COUNT -gt 0 ]; then
        echo "3. 检查缺失的优化文件"
    fi
fi

echo ""
echo "详细报告: optimization-report.txt"
echo "完整指南: OPTIMIZATION_SUMMARY.md"
