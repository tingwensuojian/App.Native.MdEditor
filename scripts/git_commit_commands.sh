#!/bin/bash
# v1.17.0 修复版本提交命令

echo "=== 添加所有修改的文件 ==="
git add app/ui/frontend/src/App.jsx
git add app/ui/frontend/src/components/ImageManagerDialog.css
git add app/ui/frontend/src/components/ImageManagerDialog.jsx
git add app/ui/frontend/src/components/SettingsDialog.jsx
git add app/ui/frontend/src/utils/imageCompressor.js
git add manifest
git add v1.17.0_修复说明.md

echo ""
echo "=== 提交修改 ==="
git commit -m "fix: v1.17.0 修复版本

修复问题：
1. 修复剪贴板图片粘贴功能
   - 使用事件捕获阶段监听粘贴事件
   - 在 Monaco Editor 拦截前捕获图片
   - 支持 Ctrl+V 粘贴截图和复制的图片

2. 添加图片压缩设置
   - 可开启/关闭自动压缩
   - 可调整压缩质量（50%-100%）
   - 可设置最大宽高
   - 设置保存在 localStorage

3. 预览区图片点击预览
   - 预览区图片自动添加点击事件
   - 点击弹出预览对话框
   - 显示图片详细信息

4. 批量管理按钮位置优化
   - 移到图片库浮窗左下角
   - 固定定位，始终可见
   - 半透明背景

技术改进：
- imageCompressor 支持从设置读取配置
- 优化事件监听器性能
- 改进 UI 布局和交互体验"

echo ""
echo "=== 查看提交日志 ==="
git log --oneline -3

echo ""
echo "=== 推送到远程仓库 ==="
echo "执行以下命令推送："
echo "git push origin master"
