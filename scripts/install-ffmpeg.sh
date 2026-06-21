#!/bin/bash

# FFmpeg 安装脚本
# 支持多种 Linux 发行版

set -e

echo "================================"
echo "FFmpeg 安装脚本"
echo "================================"
echo ""

# 检测操作系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
else
    echo "无法检测操作系统"
    exit 1
fi

echo "检测到操作系统: $OS $VERSION"
echo ""

# 检查是否已安装
if command -v ffmpeg &> /dev/null; then
    echo "✓ FFmpeg 已安装"
    ffmpeg -version | head -1
    echo ""
    echo "如需重新安装，请先卸载现有版本"
    exit 0
fi

echo "开始安装 FFmpeg..."
echo ""

# 根据不同的发行版安装
case "$OS" in
    debian|ubuntu)
        echo "使用 apt 安装..."
        apt-get update
        apt-get install -y ffmpeg
        ;;
    
    centos|rhel|fedora)
        echo "使用 yum/dnf 安装..."
        if command -v dnf &> /dev/null; then
            dnf install -y ffmpeg
        else
            # CentOS 需要 EPEL 仓库
            yum install -y epel-release
            yum install -y ffmpeg
        fi
        ;;
    
    alpine)
        echo "使用 apk 安装..."
        apk add --no-cache ffmpeg
        ;;
    
    arch|manjaro)
        echo "使用 pacman 安装..."
        pacman -Sy --noconfirm ffmpeg
        ;;
    
    *)
        echo "不支持的操作系统: $OS"
        echo ""
        echo "请手动安装 FFmpeg:"
        echo "  官网: https://ffmpeg.org/download.html"
        exit 1
        ;;
esac

echo ""
echo "================================"
echo "安装完成！"
echo "================================"
echo ""

# 验证安装
if command -v ffmpeg &> /dev/null; then
    echo "✓ FFmpeg 安装成功"
    ffmpeg -version | head -1
    echo ""
    echo "支持的格式:"
    ffmpeg -formats 2>&1 | grep -i heic || echo "  (HEIC 支持通过内置解码器)"
else
    echo "✗ FFmpeg 安装失败"
    exit 1
fi
