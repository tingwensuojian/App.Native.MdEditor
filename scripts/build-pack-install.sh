#!/bin/bash

# =============================================================================
#  Markdown 编辑器 - 完整发布脚本（构建前端 + 打包 fpk + 安装 + 重启）
#
#  用法：
#    bash build-pack-install.sh 1.27.19
#      - 其中 1.27.19 为要写入 manifest 的版本号
#
#  说明：
#    - 严格按照「构建前端 → 更新 manifest 版本 → fnpack build → install-fpk → stop/start」
#      这一完整发布流程执行。
# =============================================================================

set -e

APP_NAME="App.Native.MdEditor2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/app/ui/frontend"
SERVICE_URL="http://localhost:18080/health"

# Node.js / Python 路径（飞牛 NAS 环境）
export PATH=/var/apps/nodejs_v22/target/bin:$PATH
export PATH=/var/apps/python312/target/bin:$PATH

log_step() { echo ""; echo "══════════════════════════════════════════"; echo "  $1"; echo "══════════════════════════════════════════"; }
log_ok()   { echo "✅ $1"; }
log_err()  { echo "❌ $1"; }
log_info() { echo "   $1"; }

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    log_err "未找到 Node.js，请确认 PATH 设置"
    log_info "飞牛 NAS: export PATH=/var/apps/nodejs_v22/target/bin:\$PATH"
    exit 1
  fi
  log_ok "Node.js $(node --version)  npm $(npm --version)"
}

check_fnpack() {
  if ! command -v fnpack >/dev/null 2>&1; then
    log_err "未找到 fnpack，请先安装："
    log_info "chmod +x fnpack-1.2.1-linux-amd64"
    log_info "sudo mv fnpack-1.2.1-linux-amd64 /usr/local/bin/fnpack"
    exit 1
  fi
  log_ok "fnpack $(fnpack --version 2>/dev/null || echo '已就绪')"
}

check_appcenter() {
  if ! command -v appcenter-cli >/dev/null 2>&1; then
    log_err "未找到 appcenter-cli（仅飞牛 NAS 系统预装，本地环境无此工具）"
    exit 1
  fi
  log_ok "appcenter-cli 已就绪"
}

update_manifest_version() {
  local new_version="$1"
  local new_changelog="$2"
  local manifest_file="$SCRIPT_DIR/manifest"

  if [ ! -f "$manifest_file" ]; then
    log_err "未找到 manifest 文件：$manifest_file"
    exit 1
  fi

  # 如果未显式指定版本号，则根据现有 version 自动递增小孙版本号
  # 规则：a.b.c → a.b.(c+1)，当 c >= 10 时，变为 a.(b+1).1
  if [ -z "$new_version" ]; then
    if grep -q '^version=' "$manifest_file"; then
      local current_version
      current_version=$(grep '^version=' "$manifest_file" | head -1 | cut -d'=' -f2)

      IFS='.' read -r major minor patch <<<"$current_version"
      [ -z "$major" ] && major=0
      [ -z "$minor" ] && minor=0
      [ -z "$patch" ] && patch=0

      if [ "$patch" -ge 10 ]; then
        patch=1
        minor=$((minor + 1))
      else
        patch=$((patch + 1))
      fi

      new_version="${major}.${minor}.${patch}"
      log_info "自动递增版本号：$current_version → $new_version"
    else
      log_info "manifest 中未找到 version= 行，无法自动递增版本号，将仅根据 changelog 更新"
    fi
  fi

  if [ -z "$new_version" ] && [ -z "$new_changelog" ]; then
    log_info "未指定版本号或更新日志，且无法自动递增版本，跳过 manifest 更新"
    return 0
  fi

  log_step "更新 manifest 信息"

  # 备份一份旧的 manifest
  cp "$manifest_file" "$manifest_file.bak.$(date +%Y%m%d_%H%M%S)"

  # 将 version= 行替换为新版本号（如果传入）
  if [ -n "$new_version" ]; then
    if grep -q '^version=' "$manifest_file"; then
      sed -i "s/^version=.*/version=$new_version/" "$manifest_file"
    else
      echo "version=$new_version" >>"$manifest_file"
    fi
    log_ok "version 已更新为 $new_version"
  else
    log_info "未指定版本号，保留原有 version"
  fi

  # 更新 changelog= 行（用于应用中心的更新日志展示）
  if [ -n "$new_changelog" ]; then
    # 将可能包含 / & 的内容转义为 \/ \& 以兼容 sed
    local escaped_changelog
    escaped_changelog=$(printf '%s\n' "$new_changelog" | sed 's/[&/]/\\&/g')

    if grep -q '^changelog=' "$manifest_file"; then
      sed -i "s/^changelog=.*/changelog=$escaped_changelog/" "$manifest_file"
    else
      echo "changelog=$new_changelog" >>"$manifest_file"
    fi
    log_ok "changelog 已更新"
  else
    log_info "未指定 changelog，保留原有（如果存在）"
  fi
}

do_build_frontend() {
  log_step "步骤 1 / 构建前端"
  check_node

  cd "$FRONTEND_DIR"
  if [ ! -d "node_modules" ]; then
    log_info "安装依赖..."
    npm install --legacy-peer-deps
  else
    log_info "依赖已存在，跳过 npm install"
  fi

  log_info "执行 npm run build ..."
  npm run build

  if [ -d "dist" ]; then
    log_ok "前端构建成功 → $FRONTEND_DIR/dist"
  else
    log_err "构建产物 dist/ 不存在，构建失败"
    exit 1
  fi

  cd "$SCRIPT_DIR"
}

do_fnpack_build() {
  log_step "步骤 2 / fnpack 打包 fpk"
  check_fnpack
  cd "$SCRIPT_DIR"

  for f in manifest config/privilege config/resource ICON.PNG ICON_256.PNG; do
    [ -e "$f" ] || { log_err "缺少必要文件: $f"; exit 1; }
  done
  for d in app cmd wizard; do
    [ -d "$d" ] || { log_err "缺少必要目录: $d/"; exit 1; }
  done

  fnpack build
  FPK_FILE=$(ls -t *.fpk 2>/dev/null | head -1)
  if [ -n "$FPK_FILE" ]; then
    log_ok "打包成功 → $FPK_FILE  ($(du -sh "$FPK_FILE" | cut -f1))"
  else
    log_err "未找到 .fpk 文件，打包可能失败"
    exit 1
  fi
}

do_install_fpk() {
  log_step "步骤 3 / appcenter-cli install-fpk 安装"
  check_appcenter
  cd "$SCRIPT_DIR"

  FPK_FILE=$(ls -t *.fpk 2>/dev/null | head -1)
  if [ -z "$FPK_FILE" ]; then
    log_err "未找到 .fpk 文件，请先执行打包步骤"
    exit 1
  fi

  log_info "安装: $FPK_FILE"
  appcenter-cli install-fpk "$FPK_FILE"
  log_ok "install-fpk 完成"
}

do_restart_app() {
  log_step "步骤 4 / 重启应用并验证"
  check_appcenter

  appcenter-cli stop "$APP_NAME" 2>/dev/null && log_info "已停止 $APP_NAME" || log_info "应用未在运行，跳过停止"
  sleep 2
  appcenter-cli start "$APP_NAME"
  log_ok "已启动 $APP_NAME"

  log_info "等待服务就绪..."
  sleep 5
  if curl -sf "$SERVICE_URL" >/dev/null 2>&1; then
    log_ok "服务健康检查通过 → $SERVICE_URL"
  else
    log_info "⚠ 健康检查未响应，请手动验证: $SERVICE_URL"
  fi
}

main() {
  cd "$SCRIPT_DIR"

  VERSION_ARG="${1:-}"
  CHANGELOG_ARG="${2:-}"

  # 如果未显式传入 changelog，则尝试根据本次代码修改自动生成一条简要更新说明
  if [ -z "$CHANGELOG_ARG" ] && command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
    # 优先使用最近一次提交的提交说明
    local last_msg
    last_msg=$(git log -1 --pretty=%s 2>/dev/null || echo "")

    # 简要罗列最近一次提交中变更的前若干个文件名
    local changed_files
    changed_files=$(git diff --name-only HEAD~1..HEAD 2>/dev/null | head -5 | tr '\n' ' ')

    if [ -n "$last_msg" ]; then
      if [ -n "$changed_files" ]; then
        CHANGELOG_ARG="${last_msg}（涉及文件: ${changed_files}）"
      else
        CHANGELOG_ARG="${last_msg}"
      fi
      log_info "自动生成 changelog: $CHANGELOG_ARG"
    fi
  fi

  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║  Markdown 编辑器  完整发布（fpk 安装）   ║"
  echo "║  $APP_NAME"
  echo "╚══════════════════════════════════════════╝"

  update_manifest_version "$VERSION_ARG" "$CHANGELOG_ARG"
  do_build_frontend
  do_fnpack_build
  do_install_fpk
  do_restart_app

  echo ""
  echo "══════════════════════════════════════════"
  echo "  🎉 完整发布流程完成！"
  echo "  应用: $APP_NAME"
  FPK_FILE=$(ls -t *.fpk 2>/dev/null | head -1)
  [ -n "$FPK_FILE" ] && echo "  包文件: $FPK_FILE"
  echo "  访问: http://192.168.2.2:18080/"
  echo "══════════════════════════════════════════"
}

main "$@"

