#!/bin/bash
# =============================================================================
#  Markdown 编辑器 - 优化版构建部署脚本
#  改进：
#    1. 前端构建时移除 source maps
#    2. 清理不必要的 node_modules 文件
#    3. 优化 npm install 参数
#    4. 使用 .fnpackignore 排除不必要文件
#    5. 显示打包前后的文件大小对比
# =============================================================================

set -e

# 配置区
APP_NAME="App.Native.MdEditor2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/app/ui/frontend"
SERVER_DIR="$SCRIPT_DIR/app/server"
SERVICE_URL="http://localhost:18080/health"

export PATH=/var/apps/nodejs_v22/target/bin:$PATH
export PATH=/var/apps/python312/target/bin:$PATH

# npm 镜像源（默认使用 npmmirror，可通过 NPM_REGISTRY_OVERRIDE 覆盖）
NPM_REGISTRY="${NPM_REGISTRY_OVERRIDE:-https://registry.npmmirror.com}"

# 工具函数
log_step() { echo ""; echo "══════════════════════════════════════════"; echo "  $1"; echo "══════════════════════════════════════════"; }
log_ok()   { echo "✅ $1"; }
log_err()  { echo "❌ $1"; }
log_info() { echo "   $1"; }
log_warn() { echo "⚠️  $1"; }

check_node() {
    if ! command -v node &> /dev/null; then
        log_err "未找到 Node.js"
        exit 1
    fi
    log_ok "Node.js $(node --version)  npm $(npm --version)"
}

ensure_npm_registry() {
    if [ -z "$NPM_REGISTRY" ]; then
        return
    fi
    log_info "设置 npm registry 为: $NPM_REGISTRY"
    if ! npm config set registry "$NPM_REGISTRY" >/dev/null 2>&1; then
        log_warn "npm registry 设置失败，请手动检查网络/权限"
    fi
}

check_fnpack() {
    if ! command -v fnpack &> /dev/null; then
        log_err "未找到 fnpack"
        exit 1
    fi
    log_ok "fnpack 已就绪"
}

check_appcenter() {
    if ! command -v appcenter-cli &> /dev/null; then
        log_err "未找到 appcenter-cli"
        exit 1
    fi
    log_ok "appcenter-cli 已就绪"
}

# 获取目录大小
get_size() {
    du -sh "$1" 2>/dev/null | cut -f1
}

# 清理不必要的 node_modules 文件
cleanup_node_modules() {
    local nm_dir="$1"
    if [ ! -d "$nm_dir" ]; then
        return
    fi
    
    log_info "清理 node_modules 中的不必要文件..."
    
    # 删除常见的不必要文件
    find "$nm_dir" -type f \( \
        -name "*.md" \
        -name "*.markdown" \
        -name "LICENSE*" \
        -name "CHANGELOG*" \
        -name "*.map" \
        -name "*.ts" \
        -name "*.tsx" \
        -name "*.test.js" \
        -name "*.spec.js" \
        -name ".eslintrc*" \
        -name ".prettierrc*" \
        -name "tsconfig.json" \
        -name "jest.config.js" \
        -name "rollup.config.js" \
        -name "webpack.config.js" \
    \) -delete 2>/dev/null || true
    
    # 删除 .git 目录
    find "$nm_dir" -type d -name ".git" -exec rm -rf {} + 2>/dev/null || true
    
    # 删除 .github 目录
    find "$nm_dir" -type d -name ".github" -exec rm -rf {} + 2>/dev/null || true
    
    # 删除 examples 目录
    find "$nm_dir" -type d -name "examples" -exec rm -rf {} + 2>/dev/null || true
    
    # 删除 docs 目录
    find "$nm_dir" -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true
    
    # 删除 test 目录
    find "$nm_dir" -type d -name "test" -exec rm -rf {} + 2>/dev/null || true
    
    # 删除 tests 目录
    find "$nm_dir" -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
    
    log_ok "node_modules 清理完成"
}

# 步骤 1：构建前端（优化版）
do_build() {
    log_step "步骤 1 / 构建前端（优化版）"
    check_node
    ensure_npm_registry
    
    cd "$FRONTEND_DIR"
    
    # 显示构建前的大小
    if [ -d "node_modules" ]; then
        local before_size=$(get_size "node_modules")
        log_info "构建前 node_modules 大小: $before_size"
    fi
    
    # 安装依赖（使用优化参数）
    if [ ! -d "node_modules" ]; then
        log_info "安装前端依赖..."
        npm install --legacy-peer-deps --omit=dev --no-optional 2>&1 | tail -5
    else
        log_info "前端依赖已存在"
    fi
    
    # 清理 node_modules
    cleanup_node_modules "node_modules"
    
    if [ -d "node_modules" ]; then
        local after_size=$(get_size "node_modules")
        log_ok "清理后 node_modules 大小: $after_size"
    fi
    
    # 构建前端
    log_info "执行 npm run build..."
    npm run build
    
    # 移除 source maps（减小包体积）
    if [ -d "dist" ]; then
        log_info "移除 source maps..."
        find dist -name "*.map" -delete 2>/dev/null || true
        local dist_size=$(get_size "dist")
        log_ok "前端构建成功 → dist ($dist_size)"
    else
        log_err "构建产物 dist/ 不存在"
        exit 1
    fi
    
    cd "$SCRIPT_DIR"
}

# 步骤 2：优化服务端依赖
do_optimize_server() {
    log_step "步骤 1.5 / 优化服务端依赖"
    
    if [ ! -d "$SERVER_DIR" ]; then
        log_info "服务端目录不存在，跳过"
        return
    fi
    
    cd "$SERVER_DIR"
    
    if [ ! -d "node_modules" ]; then
        log_info "安装服务端依赖..."
        ensure_npm_registry
        npm install --omit=dev --no-optional 2>&1 | tail -5
    else
        log_info "服务端依赖已存在"
    fi
    
    # 清理 node_modules
    cleanup_node_modules "node_modules"
    
    if [ -d "node_modules" ]; then
        local size=$(get_size "node_modules")
        log_ok "服务端 node_modules 大小: $size"
    fi
    
    cd "$SCRIPT_DIR"
}

# 步骤 3：fnpack 打包
do_pack() {
    log_step "步骤 2 / fnpack 打包"
    check_fnpack
    
    cd "$SCRIPT_DIR"
    
    # 校验必要文件
    for f in manifest config/privilege config/resource ICON.PNG ICON_256.PNG; do
        [ -e "$f" ] || { log_err "缺少必要文件: $f"; exit 1; }
    done
    for d in app cmd wizard; do
        [ -d "$d" ] || { log_err "缺少必要目录: $d/"; exit 1; }
    done
    
    # 显示打包前的大小
    local before_pack=$(du -sh . 2>/dev/null | cut -f1)
    log_info "打包前项目大小: $before_pack"
    
    fnpack build
    
    FPK_FILE=$(ls -t *.fpk 2>/dev/null | head -1)
    if [ -n "$FPK_FILE" ]; then
        local fpk_size=$(du -sh "$FPK_FILE" | cut -f1)
        log_ok "打包成功 → $FPK_FILE ($fpk_size)"
    else
        log_err "未找到 .fpk 文件"
        exit 1
    fi
}

# 步骤 4：install-fpk 安装
do_install_fpk() {
    log_step "步骤 3 / appcenter-cli 安装 fpk"
    check_appcenter
    
    cd "$SCRIPT_DIR"
    FPK_FILE=$(ls -t *.fpk 2>/dev/null | head -1)
    if [ -z "$FPK_FILE" ]; then
        log_err "未找到 .fpk 文件"
        exit 1
    fi
    
    log_info "安装: $FPK_FILE"
    appcenter-cli install-fpk "$FPK_FILE"
    log_ok "安装完成"
}

# 步骤 5：install-local 开发快速安装
do_install_local() {
    log_step "步骤 3 / appcenter-cli install-local（开发模式）"
    check_appcenter
    
    cd "$SCRIPT_DIR"
    if ! appcenter-cli install-local; then
        log_err "install-local 命令执行失败"
        return 1
    fi
    
    if ! appcenter-cli list 2>/dev/null | grep -q "$APP_NAME"; then
        log_err "install-local 可能失败：未找到 $APP_NAME"
        return 1
    fi
    
    log_ok "install-local 完成"
}

# 步骤 6：重启并验证
do_restart() {
    log_step "步骤 4 / 重启应用并验证"
    check_appcenter
    
    appcenter-cli stop "$APP_NAME" 2>/dev/null && log_info "已停止 $APP_NAME" || log_info "应用未在运行"
    sleep 2
    appcenter-cli start "$APP_NAME"
    log_ok "已启动 $APP_NAME"
    
    log_info "等待服务就绪..."
    sleep 5
    
    if curl -sf "$SERVICE_URL" &>/dev/null; then
        log_ok "服务健康检查通过 → $SERVICE_URL"
    else
        log_warn "健康检查未响应，请手动验证: $SERVICE_URL"
    fi
}

# 主流程
cd "$SCRIPT_DIR"

case "${1:-}" in
    --build)
        do_build
        do_optimize_server
        ;;
    --pack)
        do_pack
        ;;
    --install)
        do_install_fpk
        do_restart
        ;;
    --local)
        do_build
        do_optimize_server
        if do_install_local; then
            do_restart
        else
            log_err "install-local 失败"
            exit 1
        fi
        ;;
    --restart)
        do_restart
        ;;
    "")
        echo ""
        echo "╔══════════════════════════════════════════╗"
        echo "║  Markdown 编辑器  优化版完整构建部署     ║"
        echo "║  $APP_NAME"
        echo "╚══════════════════════════════════════════╝"
        do_build
        do_optimize_server
        do_pack
        
        if do_install_local; then
            log_ok "使用 install-local 安装成功"
        else
            log_info "install-local 失败，回退到 install-fpk..."
            do_install_fpk
        fi
        
        do_restart
        echo ""
        echo "══════════════════════════════════════════"
        echo "  🎉 全部完成！"
        echo "  应用: $APP_NAME"
        FPK_FILE=$(ls -t *.fpk 2>/dev/null | head -1)
        [ -n "$FPK_FILE" ] && echo "  包文件: $FPK_FILE"
        echo "  访问: http://192.168.2.2:18080/"
        echo "══════════════════════════════════════════"
        ;;
    *)
        echo "用法: bash build-and-deploy-optimized.sh [选项]"
        echo ""
        echo "选项:"
        echo "  (无参数)   完整流程（优化版）"
        echo "  --build    仅构建前端 + 优化服务端"
        echo "  --pack     仅 fnpack 打包"
        echo "  --install  仅安装已有的 fpk + 重启"
        echo "  --local    构建 + 优化 + install-local + 重启"
        echo "  --restart  仅重启应用"
        exit 1
        ;;
esac
