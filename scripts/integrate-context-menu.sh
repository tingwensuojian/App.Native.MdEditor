#!/bin/bash

# Markdown 编辑器右键菜单集成脚本
# 此脚本会自动将右键菜单功能集成到 App.jsx

echo "=========================================="
echo "Markdown 编辑器右键菜单集成脚本"
echo "=========================================="
echo ""

# 设置工作目录
WORK_DIR="/vol4/1000/开发文件夹/mac/app/ui/frontend/src"
APP_FILE="$WORK_DIR/App.jsx"
BACKUP_FILE="$WORK_DIR/App.jsx.backup_contextmenu"

# 检查文件是否存在
if [ ! -f "$APP_FILE" ]; then
    echo "❌ 错误：找不到 App.jsx 文件"
    exit 1
fi

# 创建备份
echo "📦 创建备份文件..."
cp "$APP_FILE" "$BACKUP_FILE"
echo "✅ 备份已创建：$BACKUP_FILE"
echo ""

echo "⚠️  注意：此脚本仅用于参考"
echo "建议手动集成以下内容到 App.jsx："
echo ""
echo "1. 导入 EditorContextMenu 组件"
echo "2. 添加状态变量（contextMenu, clipboardContent）"
echo "3. 添加辅助函数（getSelectedText, detectImageAtCursor 等）"
echo "4. 修改 handleEditorMount 添加事件监听"
echo "5. 添加预览区事件监听的 useEffect"
echo "6. 在 JSX 中添加 EditorContextMenu 组件"
echo ""
echo "详细步骤请参考："
echo "  - 右键菜单功能实现指南.md"
echo "  - EditorContextMenuIntegration.jsx"
echo ""

# 显示需要添加的关键代码位置
echo "=========================================="
echo "关键集成点："
echo "=========================================="
echo ""
echo "1️⃣  在文件顶部导入区域添加："
echo "   import EditorContextMenu from './components/EditorContextMenu'"
echo ""
echo "2️⃣  在 useState 声明区域添加："
echo "   const [contextMenu, setContextMenu] = useState(null)"
echo "   const [clipboardContent, setClipboardContent] = useState(null)"
echo ""
echo "3️⃣  在 return 语句的最后（Toast 容器之后）添加："
echo "   {contextMenu && ("
echo "     <EditorContextMenu"
echo "       x={contextMenu.x}"
echo "       y={contextMenu.y}"
echo "       selectedText={contextMenu.selectedText}"
echo "       selectedImage={contextMenu.selectedImage}"
echo "       theme={editorTheme}"
echo "       clipboardHasContent={!!clipboardContent}"
echo "       onAction={handleContextMenuAction}"
echo "       onClose={() => setContextMenu(null)}"
echo "     />"
echo "   )}"
echo ""
echo "=========================================="
echo "完整代码请查看："
echo "  EditorContextMenuIntegration.jsx"
echo "=========================================="
echo ""

# 检查组件文件是否存在
COMPONENT_FILE="$WORK_DIR/components/EditorContextMenu.jsx"
CSS_FILE="$WORK_DIR/components/EditorContextMenu.css"

if [ -f "$COMPONENT_FILE" ]; then
    echo "✅ EditorContextMenu.jsx 已存在"
else
    echo "❌ EditorContextMenu.jsx 不存在"
fi

if [ -f "$CSS_FILE" ]; then
    echo "✅ EditorContextMenu.css 已存在"
else
    echo "❌ EditorContextMenu.css 不存在"
fi

echo ""
echo "=========================================="
echo "下一步操作："
echo "=========================================="
echo "1. 查看 EditorContextMenuIntegration.jsx 了解完整代码"
echo "2. 查看 右键菜单功能实现指南.md 了解详细步骤"
echo "3. 手动将代码集成到 App.jsx"
echo "4. 测试功能是否正常"
echo ""
echo "如需恢复备份："
echo "  cp $BACKUP_FILE $APP_FILE"
echo ""
echo "=========================================="
echo "集成准备完成！"
echo "=========================================="
