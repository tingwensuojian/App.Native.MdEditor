/**
 * 编辑器右键菜单集成代码
 * 这个文件包含了需要添加到 App.jsx 中的代码片段
 */

// ============================================
// 1. 在 App.jsx 顶部导入 EditorContextMenu
// ============================================
import EditorContextMenu from './components/EditorContextMenu'

// ============================================
// 2. 在 App 组件中添加右键菜单相关状态（在其他 useState 之后）
// ============================================
const [contextMenu, setContextMenu] = useState(null) // { x, y, type: 'editor' | 'preview', selectedText, selectedImage }
const [clipboardContent, setClipboardContent] = useState(null)

// ============================================
// 3. 添加获取选中文本的函数
// ============================================
const getSelectedText = useCallback(() => {
  if (!editorRef.current) return ''
  const editor = editorRef.current
  const selection = editor.getSelection()
  const model = editor.getModel()
  return model.getValueInRange(selection)
}, [])

// ============================================
// 4. 添加检测图片的函数
// ============================================
const detectImageAtCursor = useCallback(() => {
  if (!editorRef.current) return null
  
  const editor = editorRef.current
  const model = editor.getModel()
  const position = editor.getPosition()
  const lineContent = model.getLineContent(position.lineNumber)
  
  // 匹配 Markdown 图片语法: ![alt](src "title")
  const mdImageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g
  let match
  
  while ((match = mdImageRegex.exec(lineContent)) !== null) {
    const startCol = match.index + 1
    const endCol = match.index + match[0].length + 1
    
    if (position.column >= startCol && position.column <= endCol) {
      return {
        alt: match[1] || '',
        src: match[2],
        title: match[3] || '',
        scale: 1,
        isLocal: match[2].startsWith('/uploads/') || match[2].startsWith('./'),
        range: {
          startLineNumber: position.lineNumber,
          startColumn: startCol,
          endLineNumber: position.lineNumber,
          endColumn: endCol
        }
      }
    }
  }
  
  // 匹配 HTML 图片语法: <img src="..." alt="..." />
  const htmlImageRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi
  match = null
  
  while ((match = htmlImageRegex.exec(lineContent)) !== null) {
    const startCol = match.index + 1
    const endCol = match.index + match[0].length + 1
    
    if (position.column >= startCol && position.column <= endCol) {
      const altMatch = match[0].match(/alt=["']([^"']*)["']/)
      return {
        alt: altMatch ? altMatch[1] : '',
        src: match[1],
        title: '',
        scale: 1,
        isLocal: match[1].startsWith('/uploads/') || match[1].startsWith('./'),
        range: {
          startLineNumber: position.lineNumber,
          startColumn: startCol,
          endLineNumber: position.lineNumber,
          endColumn: endCol
        }
      }
    }
  }
  
  return null
}, [])

// ============================================
// 5. 添加检测预览区图片的函数
// ============================================
const detectPreviewImage = useCallback((target) => {
  // 查找最近的 img 元素
  const imgElement = target.closest('img') || (target.tagName === 'IMG' ? target : null)
  
  if (imgElement) {
    return {
      alt: imgElement.alt || '',
      src: imgElement.src,
      title: imgElement.title || '',
      scale: 1,
      isLocal: imgElement.src.includes('/uploads/') || imgElement.src.startsWith('./'),
      element: imgElement
    }
  }
  
  return null
}, [])

// ============================================
// 6. 添加编辑器右键事件处理
// ============================================
const handleEditorContextMenu = useCallback((e) => {
  e.preventDefault()
  e.stopPropagation()
  
  const selectedText = getSelectedText()
  const selectedImage = detectImageAtCursor()
  
  setContextMenu({
    x: e.clientX,
    y: e.clientY,
    type: 'editor',
    selectedText,
    selectedImage
  })
}, [getSelectedText, detectImageAtCursor])

// ============================================
// 7. 添加预览区右键事件处理
// ============================================
const handlePreviewContextMenu = useCallback((e) => {
  e.preventDefault()
  e.stopPropagation()
  
  const selectedText = window.getSelection()?.toString() || ''
  const selectedImage = detectPreviewImage(e.target)
  
  setContextMenu({
    x: e.clientX,
    y: e.clientY,
    type: 'preview',
    selectedText,
    selectedImage
  })
}, [detectPreviewImage])

// ============================================
// 8. 添加右键菜单操作处理函数
// ============================================
const handleContextMenuAction = useCallback(async (action, data) => {
  const editor = editorRef.current
  if (!editor && action !== 'save-image-as' && action !== 'copy-image') return
  
  switch (action) {
    // ========== 图片操作 ==========
    case 'upload-image':
      // 触发图片上传
      setShowImageManager(true)
      break
      
    case 'scale-image':
      if (contextMenu?.selectedImage && data?.scale) {
        const image = contextMenu.selectedImage
        const model = editor.getModel()
        
        // 计算新的图片尺寸（如果有 HTML 语法）
        let newText = ''
        const currentText = model.getValueInRange(image.range)
        
        if (currentText.startsWith('<img')) {
          // HTML 语法 - 添加或修改 width 属性
          const widthPercent = Math.round(data.scale * 100)
          if (currentText.includes('width=')) {
            newText = currentText.replace(/width=["']\d+%["']/, `width="${widthPercent}%"`)
          } else {
            newText = currentText.replace(/<img/, `<img width="${widthPercent}%"`)
          }
        } else {
          // Markdown 语法 - 转换为 HTML 以支持缩放
          const widthPercent = Math.round(data.scale * 100)
          newText = `<img src="${image.src}" alt="${image.alt}" width="${widthPercent}%" />`
        }
        
        editor.executeEdits('scale-image', [{
          range: image.range,
          text: newText
        }])
        
        showToast(`图片已缩放至 ${Math.round(data.scale * 100)}%`, 'success')
      }
      break
      
    case 'convert-syntax':
      if (contextMenu?.selectedImage && data?.syntax) {
        const image = contextMenu.selectedImage
        const model = editor.getModel()
        let newText = ''
        
        if (data.syntax === 'markdown') {
          newText = `![${image.alt}](${image.src}${image.title ? ` "${image.title}"` : ''})`
        } else if (data.syntax === 'html') {
          newText = `<img src="${image.src}" alt="${image.alt}" />`
        }
        
        editor.executeEdits('convert-syntax', [{
          range: image.range,
          text: newText
        }])
        
        showToast(`已转换为 ${data.syntax.toUpperCase()} 语法`, 'success')
      }
      break
      
    case 'delete-image':
      if (contextMenu?.selectedImage?.isLocal) {
        const confirmed = window.confirm('确定要删除这个图片文件吗？')
        if (confirmed) {
          try {
            const image = contextMenu.selectedImage
            // 调用删除 API
            const response = await fetch(`api/image/delete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: image.src })
            })
            
            const result = await response.json()
            if (result.ok) {
              // 删除编辑器中的图片标记
              const model = editor.getModel()
              editor.executeEdits('delete-image', [{
                range: image.range,
                text: ''
              }])
              showToast('图片已删除', 'success')
            } else {
              showToast('删除图片失败', 'error')
            }
          } catch (error) {
            console.error('删除图片失败:', error)
            showToast('删除图片失败', 'error')
          }
        }
      }
      break
      
    case 'copy-image':
      if (contextMenu?.selectedImage) {
        const markdown = `![${contextMenu.selectedImage.alt}](${contextMenu.selectedImage.src})`
        try {
          await navigator.clipboard.writeText(markdown)
          showToast('图片标记已复制', 'success')
        } catch (error) {
          console.error('复制失败:', error)
          showToast('复制失败', 'error')
        }
      }
      break
      
    case 'save-image-as':
      if (contextMenu?.selectedImage) {
        // 下载图片
        const link = document.createElement('a')
        link.href = contextMenu.selectedImage.src
        link.download = contextMenu.selectedImage.src.split('/').pop() || 'image.png'
        link.click()
        showToast('图片下载已开始', 'success')
      }
      break
      
    // ========== 编辑操作 ==========
    case 'cut':
      if (contextMenu?.selectedText) {
        try {
          await navigator.clipboard.writeText(contextMenu.selectedText)
          const selection = editor.getSelection()
          editor.executeEdits('cut', [{
            range: selection,
            text: ''
          }])
          showToast('已剪切', 'success')
        } catch (error) {
          editor.trigger('keyboard', 'editor.action.clipboardCutAction')
        }
      }
      break
      
    case 'copy':
      if (contextMenu?.selectedText) {
        try {
          await navigator.clipboard.writeText(contextMenu.selectedText)
          showToast('已复制', 'success')
        } catch (error) {
          editor.trigger('keyboard', 'editor.action.clipboardCopyAction')
        }
      }
      break
      
    case 'paste':
      try {
        const text = await navigator.clipboard.readText()
        const selection = editor.getSelection()
        editor.executeEdits('paste', [{
          range: selection,
          text: text
        }])
        showToast('已粘贴', 'success')
      } catch (error) {
        editor.trigger('keyboard', 'editor.action.clipboardPasteAction')
      }
      break
      
    case 'delete':
      if (contextMenu?.selectedText) {
        const selection = editor.getSelection()
        editor.executeEdits('delete', [{
          range: selection,
          text: ''
        }])
      }
      break
      
    // ========== 格式化操作 ==========
    case 'bold':
      handleToolbarInsert('**', '**', 'wrap')
      break
      
    case 'italic':
      handleToolbarInsert('*', '*', 'wrap')
      break
      
    case 'inline-code':
      handleToolbarInsert('`', '`', 'wrap')
      break
      
    case 'link':
      handleToolbarInsert('[链接](https://)', '', 'insert')
      break
      
    case 'quote':
      handleToolbarInsert('> ', '', 'line')
      break
      
    case 'list':
      handleToolbarInsert('- ', '', 'line')
      break
      
    // ========== 段落操作 ==========
    case 'heading1':
      handleToolbarInsert('# ', '', 'heading')
      break
      
    case 'heading2':
      handleToolbarInsert('## ', '', 'heading')
      break
      
    case 'heading3':
      handleToolbarInsert('### ', '', 'heading')
      break
      
    case 'paragraph':
      // 移除标题标记
      const model = editor.getModel()
      const selection = editor.getSelection()
      const lineContent = model.getLineContent(selection.startLineNumber)
      const cleanLine = lineContent.replace(/^#+\s*/, '')
      editor.executeEdits('paragraph', [{
        range: {
          startLineNumber: selection.startLineNumber,
          startColumn: 1,
          endLineNumber: selection.startLineNumber,
          endColumn: lineContent.length + 1
        },
        text: cleanLine
      }])
      break
      
    // ========== 插入操作 ==========
    case 'insert-image':
      setShowImageManager(true)
      break
      
    case 'insert-link':
      handleToolbarInsert('[链接](https://)', '', 'insert')
      break
      
    case 'insert-codeblock':
      handleToolbarInsert('```\n', '\n```', 'wrap')
      break
      
    case 'insert-table':
      setShowTableDialog(true)
      break
      
    case 'insert-ul':
      handleToolbarInsert('- ', '', 'line')
      break
      
    case 'insert-ol':
      handleToolbarInsert('1. ', '', 'line')
      break
      
    case 'insert-task':
      handleToolbarInsert('- [ ] ', '', 'line')
      break
      
    case 'insert-hr':
      handleToolbarInsert('\n---\n', '', 'insert')
      break
      
    default:
      console.log('未处理的操作:', action, data)
  }
  
  // 关闭菜单后聚焦编辑器
  if (editor) {
    setTimeout(() => editor.focus(), 100)
  }
}, [contextMenu, handleToolbarInsert, showToast])

// ============================================
// 9. 在 handleEditorMount 中添加右键事件监听
// ============================================
// 在 handleEditorMount 函数中添加以下代码：
const handleEditorMount = (editor) => {
  editorRef.current = editor
  
  // ... 现有代码 ...
  
  // 添加右键菜单事件监听
  const domNode = editor.getDomNode()
  if (domNode) {
    domNode.addEventListener('contextmenu', handleEditorContextMenu)
  }
  
  // ... 现有代码 ...
}

// ============================================
// 10. 在 useEffect 中为预览区添加右键事件监听
// ============================================
useEffect(() => {
  const previewElement = previewRef.current
  if (previewElement) {
    previewElement.addEventListener('contextmenu', handlePreviewContextMenu)
    return () => {
      previewElement.removeEventListener('contextmenu', handlePreviewContextMenu)
    }
  }
}, [handlePreviewContextMenu])

// ============================================
// 11. 在 JSX 的 return 语句末尾（</div> 之前）添加右键菜单组件
// ============================================
{contextMenu && (
  <EditorContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    selectedText={contextMenu.selectedText}
    selectedImage={contextMenu.selectedImage}
    theme={editorTheme}
    clipboardHasContent={!!clipboardContent}
    onAction={handleContextMenuAction}
    onClose={() => setContextMenu(null)}
  />
)}
