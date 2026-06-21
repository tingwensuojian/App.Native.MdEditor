#!/bin/bash
# =============================================================================
#  fpk 打包大小诊断脚本
#  用途：分析项目中哪些文件/目录占用空间最大，找出优化机会
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log_step() { echo ""; echo "══════════════════════════════════════════"; echo "  $1"; echo "══════════════════════════════════════════"; }
log_ok()   { echo "✅ $1"; }
log_info() { echo "   $1"; }

# 获取目录大小并排序
analyze_dir() {
    local dir="$1"
    local title="$2"
    
    if [ ! -d "$dir" ]; then
        return
    fi
    
    log_step "$title"
    
    # 显示该目录的总大小
    local total=$(du -sh "$dir" 2>/dev/null | cut -f1)
    log_info "总大小: $total"
    
    # 显示子目录大小（前 10 个最大的）
    log_info ""
    log_info "最大的子目录/文件（前 10）："
    du -sh "$dir"/* 2>/dev/null | sort -rh | head -10 | while read size path; do
        log_info "  $size  $(basename "$path")"
    done
}

# 分析 node_modules 中的大文件
analyze_node_modules() {
    local nm_dir="$1"
    local title="$2"
    
    if [ ! -d "$nm_dir" ]; then
        return
    fi
    
    log_step "$title"
    
    local total=$(du -sh "$nm_dir" 2>/dev/null | cut -f1)
    log_info "总大小: $total"
    
    log_info ""
    log_info "最大的包（前 15）："
    du -sh "$nm_dir"/* 2>/dev/null | sort -rh | head -15 | while read size path; do
        log_info "  $size  $(basename "$path")"
    done
    
    # 统计可删除的文件
    log_info ""
    log_info "可删除的文件统计："
    
    local map_size=$(find "$nm_dir" -name "*.map" -type f -exec du -c {} + 2>/dev/null | tail -1 | cut -f1)
    [ -n "$map_size" ] && log_info "  *.map 文件: $map_size"
    
    local md_size=$(find "$nm_dir" -name "*.md" -type f -exec du -c {} + 2>/dev/null | tail -1 | cut -f1)
    [ -n "$md_size" ] && log_info "  *.md 文件: $md_size"
    
    local test_size=$(find "$nm_dir" -path "*/test/*" -type f -exec du -c {} + 2>/dev/null | tail -1 | cut -f1)
    [ -n "$test_size" ] && log_info "  test 目录: $test_size"
    
    local git_size=$(find "$nm_dir" -name ".git" -type d -exec du -cs {} + 2>/dev/null | tail -1 | cut -f1)
    [ -n "$git_size" ] && log_info "  .git 目录: $git_size"
}

# 统计项目中的大文件
analyze_large_files() {
    log_step "项目中的大文件（前 20）"
    
    find "$SCRIPT_DIR" \
        -type f \
        -not -path "*/node_modules/*" \
        -not -path "*/.git/*" \
        -not -path "*/.trae/*" \
        -exec du -h {} + 2>/dev/null | sort -rh | head -20 | while read size path; do
        log_info "  $size  ${path#$SCRIPT_DIR/}"
    done
}

# 统计可删除的文件
analyze_deletable() {
    log_step "可删除的文件统计"
    
    local total_md=0
    local total_py=0
    local total_sh=0
    local total_map=0
    
    log_info "文档文件 (*.md):"
    find "$SCRIPT_DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | while read f; do
        local size=$(du -h "$f" | cut -f1)
        log_info "  $size  $(basename "$f")"
    done
    
    log_info ""
    log_info "Python 脚本 (*.py):"
    find "$SCRIPT_DIR" -maxdepth 1 -name "*.py" -type f 2>/dev/null | while read f; do
        local size=$(du -h "$f" | cut -f1)
        log_info "  $size  $(basename "$f")"
    done
    
    log_info ""
    log_info "构建脚本 (build*.sh, 快速*.sh):"
    find "$SCRIPT_DIR" -maxdepth 1 \( -name "build*.sh" -o -name "快速*.sh" \) -type f 2>/dev/null | while read f; do
        local size=$(du -h "$f" | cut -f1)
        log_info "  $size  $(basename "$f")"
    done
    
    log_info ""
    log_info "前端 source maps:"
    if [ -d "$SCRIPT_DIR/app/ui/frontend/dist" ]; then
        local map_count=$(find "$SCRIPT_DIR/app/ui/frontend/dist" -name "*.map" -type f 2>/dev/null | wc -l)
        local map_size=$(find "$SCRIPT_DIR/app/ui/frontend/dist" -name "*.map" -type f -exec du -c {} + 2>/dev/null | tail -1 | cut -f1)
        log_info "  $map_count 个文件，总大小: $map_size"
    fi
}

# 生成优化建议
generate_recommendations() {
    log_step "优化建议"
    
    local frontend_nm="$SCRIPT_DIR/app/ui/frontend/node_modules"
    local server_nm="$SCRIPT_DIR/app/server/node_modules"
    
    log_info "1. 前端优化："
    if [ -d "$frontend_nm" ]; then
        local size=$(du -sh "$frontend_nm" 2>/dev/null | cut -f1)
        log_info "   - 前端 node_modules: $size"
        log_info "   - 建议: 运行清理脚本删除不必要文件"
    fi
    
    if [ -d "$SCRIPT_DIR/app/ui/frontend/dist" ]; then
        local dist_size=$(du -sh "$SCRIPT_DIR/app/ui/frontend/dist" 2>/dev/null | cut -f1)
        log_info "   - 前端构建产物: $dist_size"
        log_info "   - 建议: 删除 *.map 文件"
    fi
    
    log_info ""
    log_info "2. 服务端优化："
    if [ -d "$server_nm" ]; then
        local size=$(du -sh "$server_nm" 2>/dev/null | cut -f1)
        log_info "   - 服务端 node_modules: $size"
        log_info "   - 建议: 运行清理脚本删除不必要文件"
    fi
    
    log_info ""
    log_info "3. 项目文件优化："
    local doc_count=$(find "$SCRIPT_DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)
    [ "$doc_count" -gt 0 ] && log_info "   - 发现 $doc_count 个 .md 文档，可删除"
    
    local py_count=$(find "$SCRIPT_DIR" -maxdepth 1 -name "*.py" -type f 2>/dev/null | wc -l)
    [ "$py_count" -gt 0 ] && log_info "   - 发现 $py_count 个 .py 脚本，可删除"
    
    local sh_count=$(find "$SCRIPT_DIR" -maxdepth 1 -name "build*.sh" -o -name "快速*.sh" 2>/dev/null | wc -l)
    [ "$sh_count" -gt 0 ] && log_info "   - 发现 $sh_count 个构建脚本，可删除"
    
    log_info ""
    log_info "4. 使用优化脚本："
    log_info "   bash build-and-deploy-optimized.sh --build"
}

# 主程序
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  fpk 打包大小诊断工具                    ║"
echo "╚══════════════════════════════════════════╝"

analyze_dir "app/ui/frontend" "前端目录分析"
analyze_dir "app/server" "服务端目录分析"
analyze_dir "app/shares" "共享数据目录分析"
analyze_dir "app/var" "应用数据目录分析"

analyze_node_modules "$SCRIPT_DIR/app/ui/frontend/node_modules" "前端 node_modules 分析"
analyze_node_modules "$SCRIPT_DIR/app/server/node_modules" "服务端 node_modules 分析"

analyze_large_files
analyze_deletable
generate_recommendations

echo ""
echo "══════════════════════════════════════════"
echo "  诊断完成"
echo "══════════════════════════════════════════"
