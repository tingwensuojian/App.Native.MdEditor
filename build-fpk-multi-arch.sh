#!/bin/bash

# Multi-arch FPK build script
# - Build amd64 / arm64 FPK packages with architecture suffix
# - Rebuild server native deps (better-sqlite3) for target arch
# - Persistent docker builder container (for cross-arch)
# - Safe trim by default, optional aggressive trim
#
# Usage:
#   bash scripts/build-fpk-multi-arch.sh                  # interactive
#   bash scripts/build-fpk-multi-arch.sh amd64           # non-interactive, safe trim
#   bash scripts/build-fpk-multi-arch.sh arm64 --aggressive
#   bash scripts/build-fpk-multi-arch.sh amd64 arm64 --safe

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/manifest" ]; then
  ROOT_DIR="${SCRIPT_DIR}"
else
  ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
fi
APP_NAME="App.Native.MdEditor2"
AGGRESSIVE_TRIM=0
MANIFEST_VERSION=""

declare -a CONTAINERS_STARTED_BY_SCRIPT=()

export PATH=/var/apps/nodejs_v22/target/bin:$PATH

log() { echo "[multi-pack] $*"; }
err() { echo "[multi-pack][ERROR] $*" >&2; }

require_path() {
  local p="$1"
  [ -e "$p" ] || { err "missing required path: $p"; exit 1; }
}

map_uname_to_arch() {
  case "${1:-}" in
    x86_64|amd64) echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) echo "unknown" ;;
  esac
}

map_arch_to_manifest_platform() {
  case "${1:-}" in
    amd64) echo "x86" ;;
    arm64) echo "arm" ;;
    *) echo "" ;;
  esac
}

has_docker() {
  command -v docker >/dev/null 2>&1
}

cleanup_docker_builders() {
  if [ "${#CONTAINERS_STARTED_BY_SCRIPT[@]}" -eq 0 ]; then
    return 0
  fi

  if ! has_docker; then
    return 0
  fi

  log "stopping docker builder containers: ${CONTAINERS_STARTED_BY_SCRIPT[*]}"
  for c in "${CONTAINERS_STARTED_BY_SCRIPT[@]}"; do
    docker stop "$c" >/dev/null 2>&1 || true
  done
}

trap cleanup_docker_builders EXIT

builder_container_name() {
  local target_arch="$1"
  echo "md2-builder-${target_arch}"
}

ensure_builder_container() {
  local target_arch="$1"
  local name
  name="$(builder_container_name "$target_arch")"

  local running_before=0
  if docker ps --format '{{.Names}}' | grep -q "^${name}$"; then
    running_before=1
  fi

  if ! docker ps -a --format '{{.Names}}' | grep -q "^${name}$"; then
    log "creating persistent builder container: ${name}"
    docker create \
      --name "$name" \
      --platform "linux/${target_arch}" \
      -v /:/host \
      node:22-bookworm \
      bash -lc "sleep infinity" >/dev/null
  fi

  if [ "$running_before" -eq 0 ]; then
    log "starting builder container: ${name}"
    docker start "$name" >/dev/null
    CONTAINERS_STARTED_BY_SCRIPT+=("$name")
  fi
}

docker_exec_builder() {
  local target_arch="$1"
  local workdir="$2"
  shift 2
  local name
  name="$(builder_container_name "$target_arch")"

  ensure_builder_container "$target_arch"
  docker exec -w "$workdir" "$name" "$@"
}

can_run_platform() {
  local target_arch="$1"
  local name
  name="$(builder_container_name "$target_arch")"

  ensure_builder_container "$target_arch"
  docker exec "$name" uname -m >/dev/null 2>&1
}

ensure_binfmt_for_arch() {
  local target_arch="$1"

  if can_run_platform "$target_arch"; then
    return 0
  fi

  log "linux/${target_arch} container test failed, trying to install binfmt"
  docker run --privileged --rm tonistiigi/binfmt --install "$target_arch" >/dev/null 2>&1 || true

  if ! can_run_platform "$target_arch"; then
    err "cannot execute linux/${target_arch} docker containers on this host"
    err "please run: docker run --privileged --rm tonistiigi/binfmt --install ${target_arch}"
    exit 1
  fi
}

slim_node_modules() {
  local server_dir="$1"
  local nm_dir="$server_dir/node_modules"

  [ -d "$nm_dir" ] || return 0

  log "slimming server node_modules"
  log "before slim: $(du -sh "$nm_dir" | cut -f1)"

  # Safe trim
  rm -rf "$nm_dir/.bin" "$nm_dir/typescript" || true

  find "$nm_dir" -type d \( \
    -name "test" -o -name "tests" -o -name "__tests__" -o \
    -name "doc" -o -name "docs" -o \
    -name "example" -o -name "examples" -o \
    -name "coverage" -o -name ".github" -o -name ".nyc_output" \
  \) -prune -exec rm -rf {} +

  find "$nm_dir" -type f \( \
    -name "*.map" -o -name "*.markdown" -o -name "README*" -o -name "readme*" \
  \) -delete

  # Optional aggressive trim (可能影响公式相关能力)
  if [ "$AGGRESSIVE_TRIM" = "1" ]; then
    log "aggressive trim enabled: removing mathjax packages"
    rm -rf "$nm_dir/mathjax" "$nm_dir/@mathjax" || true
  fi

  log "after slim: $(du -sh "$nm_dir" | cut -f1)"
}

build_frontend_dist_once() {
  local frontend_dir="$ROOT_DIR/app/ui/frontend"
  local host_arch
  host_arch="$(map_uname_to_arch "$(uname -m)")"

  log "building frontend dist"
  pushd "$frontend_dir" >/dev/null

  export VITE_APP_VERSION="$MANIFEST_VERSION"
  npm install

  # Workaround for npm optional deps bug on ARM (missing rollup native module)
  if [ "$host_arch" = "arm64" ] && [ ! -d "node_modules/@rollup/rollup-linux-arm64-gnu" ]; then
    log "rollup arm64 native module missing; cleaning frontend deps and reinstalling"
    rm -rf node_modules package-lock.json
    npm install
  fi

  npm run build
  popd >/dev/null
}

install_server_runtime_deps_for_arch() {
  local server_dir="$1"
  local target_arch="$2"
  local host_arch="$3"

  if [ "$host_arch" = "$target_arch" ]; then
    log "host arch matches target (${target_arch}), building server deps on host"
    pushd "$server_dir" >/dev/null
    if [ -f package-lock.json ]; then
      npm ci --omit=dev
    else
      npm install --omit=dev
    fi
    npm rebuild better-sqlite3 --build-from-source
    popd >/dev/null
    return 0
  fi

  has_docker || { err "docker is required for cross-arch build to ${target_arch}"; exit 1; }
  ensure_binfmt_for_arch "$target_arch"

  local host_uid host_gid
  host_uid="$(id -u)"
  host_gid="$(id -g)"

  local name
  name="$(builder_container_name "$target_arch")"

  ensure_builder_container "$target_arch"

  local container_workdir
  container_workdir="/host${server_dir}"

  log "cross-building server deps for linux/${target_arch} via docker (persistent container: ${name})"
  docker_exec_builder "$target_arch" "$container_workdir" bash -lc "\
    set -euxo pipefail
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y --no-install-recommends \
      python3 make g++ pkg-config libsqlite3-dev
    rm -rf /var/lib/apt/lists/*

    npm config set cache /tmp/npm-cache

    if [ -f package-lock.json ]; then
      npm ci --omit=dev
    else
      npm install --omit=dev
    fi

    npm rebuild better-sqlite3 --build-from-source

    test -f node_modules/better-sqlite3/build/Release/better_sqlite3.node

    chown -R \"${host_uid}:${host_gid}\" .
    echo \"[multi-pack] server deps build OK\"\
  "
}

stage_common_files() {
  local stage_dir="$1"

  mkdir -p "$stage_dir/app/ui/frontend" "$stage_dir/app/ui" "$stage_dir/app"

  cp -a "$ROOT_DIR/manifest" "$ROOT_DIR/ICON.PNG" "$ROOT_DIR/ICON_256.PNG" "$stage_dir/"
  cp -a "$ROOT_DIR/cmd" "$ROOT_DIR/config" "$ROOT_DIR/wizard" "$stage_dir/"

  [ -d "$ROOT_DIR/app/shares" ] && cp -a "$ROOT_DIR/app/shares" "$stage_dir/app/"
  [ -d "$ROOT_DIR/app/var" ] && cp -a "$ROOT_DIR/app/var" "$stage_dir/app/"
  [ -f "$ROOT_DIR/app/ui/config" ] && cp -a "$ROOT_DIR/app/ui/config" "$stage_dir/app/ui/"
  [ -f "$ROOT_DIR/app/ui/proxy.cgi" ] && cp -a "$ROOT_DIR/app/ui/proxy.cgi" "$stage_dir/app/ui/"
  [ -f "$ROOT_DIR/app/ui/index.cgi" ] && cp -a "$ROOT_DIR/app/ui/index.cgi" "$stage_dir/app/ui/"
  [ -d "$ROOT_DIR/app/ui/images" ] && cp -a "$ROOT_DIR/app/ui/images" "$stage_dir/app/ui/"
  [ -e "$ROOT_DIR/app/ui/svg.svg" ] && cp -a "$ROOT_DIR/app/ui/svg.svg" "$stage_dir/app/ui/"

  cp -a "$ROOT_DIR/app/ui/frontend/dist" "$stage_dir/app/ui/frontend/"

  mkdir -p "$stage_dir/app/server"
  tar -cf - --exclude='node_modules' -C "$ROOT_DIR/app/server" . | tar -xf - -C "$stage_dir/app/server"

  # Fix all file permissions in staging for sandbox environments without chown
  chmod -R u+rwX "$stage_dir"
}

build_one_arch() {
  local target_arch="$1"
  local host_arch="$2"
  local target_platform="$3"

  local stage_dir
  stage_dir="$(mktemp -d "/tmp/md2-multi-pack-${target_arch}.XXXXXX")"

  log "staging for ${target_arch} in ${stage_dir}"
  stage_common_files "$stage_dir"

  log "setting stage manifest platform=${target_platform} for ${target_arch}"
  sed -i "s/^platform=.*/platform=${target_platform}/" "$stage_dir/manifest"

  install_server_runtime_deps_for_arch "$stage_dir/app/server" "$target_arch" "$host_arch"

  if [ ! -f "$stage_dir/app/server/node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
    err "better_sqlite3.node missing for ${target_arch}"
    rm -rf "$stage_dir"
    exit 1
  fi

  slim_node_modules "$stage_dir/app/server"

  log "building fpk for ${target_arch}"
  pushd "$stage_dir" >/dev/null
  fnpack build --directory "$stage_dir"
  popd >/dev/null

  local raw_fpk="$stage_dir/${APP_NAME}.fpk"
  local out_fpk="$ROOT_DIR/${APP_NAME}-${MANIFEST_VERSION}-${target_arch}.fpk"

  [ -f "$raw_fpk" ] || { err "fnpack output missing for ${target_arch}"; rm -rf "$stage_dir"; exit 1; }

  cp -f "$raw_fpk" "$out_fpk"
  log "done: ${out_fpk} ($(du -sh "$out_fpk" | cut -f1))"

  rm -rf "$stage_dir"
}

interactive_select_targets() {
  echo "请选择构建架构："
  echo "  1) amd64 + arm64"
  echo "  2) amd64"
  echo "  3) arm64"
  read -r -p "输入选项 [1-3] (默认 1): " arch_choice
  arch_choice="${arch_choice:-1}"

  case "$arch_choice" in
    1) TARGETS=(amd64 arm64) ;;
    2) TARGETS=(amd64) ;;
    3) TARGETS=(arm64) ;;
    *) err "无效选项: $arch_choice"; exit 1 ;;
  esac

  echo "请选择可选裁剪模式："
  echo "  1) 安全裁剪（默认，推荐）"
  echo "  2) 激进裁剪（删除 mathjax/@mathjax，）"
  read -r -p "输入选项 [1-2] (默认 1): " trim_choice
  trim_choice="${trim_choice:-1}"

  case "$trim_choice" in
    1) AGGRESSIVE_TRIM=0 ;;
    2) AGGRESSIVE_TRIM=1 ;;
    *) err "无效选项: $trim_choice"; exit 1 ;;
  esac
}

parse_args() {
  TARGETS=()

  for arg in "$@"; do
    case "$arg" in
      amd64|arm64)
        TARGETS+=("$arg")
        ;;
      --aggressive)
        AGGRESSIVE_TRIM=1
        ;;
      --safe)
        AGGRESSIVE_TRIM=0
        ;;
      *)
        err "invalid arg: $arg (allowed: amd64 arm64 --safe --aggressive)"
        exit 1
        ;;
    esac
  done

  if [ ${#TARGETS[@]} -eq 0 ] && [ $# -eq 0 ]; then
    interactive_select_targets
  fi

  if [ ${#TARGETS[@]} -eq 0 ]; then
    TARGETS=(amd64 arm64)
  fi
}

main() {
  require_path "$ROOT_DIR/manifest"
  require_path "$ROOT_DIR/ICON.PNG"
  require_path "$ROOT_DIR/ICON_256.PNG"
  require_path "$ROOT_DIR/cmd"
  require_path "$ROOT_DIR/config"
  require_path "$ROOT_DIR/wizard"
  require_path "$ROOT_DIR/app/server"
  require_path "$ROOT_DIR/app/ui/frontend"

  local host_arch
  host_arch="$(map_uname_to_arch "$(uname -m)")"
  [ "$host_arch" != "unknown" ] || { err "unsupported host arch: $(uname -m)"; exit 1; }

  MANIFEST_VERSION="$(awk -F= '$1=="version"{print $2; exit}' "$ROOT_DIR/manifest" | tr -d '\r\n')"
  [ -n "$MANIFEST_VERSION" ] || MANIFEST_VERSION="unknown"

  parse_args "$@"

  log "targets: ${TARGETS[*]}"
  if [ "$AGGRESSIVE_TRIM" = "1" ]; then
    log "trim mode: aggressive"
  else
    log "trim mode: safe"
  fi

  build_frontend_dist_once

  for t in "${TARGETS[@]}"; do
    local target_platform
    target_platform="$(map_arch_to_manifest_platform "$t")"
    [ -n "$target_platform" ] || { err "unsupported target arch: $t"; exit 1; }
    build_one_arch "$t" "$host_arch" "$target_platform"
  done

  log "all done"
}

main "$@"
