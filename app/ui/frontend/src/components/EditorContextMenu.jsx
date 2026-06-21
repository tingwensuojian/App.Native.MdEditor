import React, { useEffect, useRef, useState } from 'react'
import { 
  Upload, 
  ZoomIn, 
  Code2, 
  Trash2, 
  Scissors, 
  Copy, 
  Clipboard, 
  Bold, 
  Italic, 
  Link2, 
  Quote,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  FileCode,
  CheckSquare,
  Minus,
  Save
} from 'lucide-react'
import './EditorContextMenu.css'

/**
 * 编辑器右键上下文菜单组件
 * 支持图片操作、编辑操作、格式化等功能
 */
function EditorContextMenu({ 
  x, 
  y, 
  onAction,
  onClose,
  selectedText = '',
  selectedImage = null, // { src, alt, title, scale }
  theme = 'light',
  clipboardHasContent = false
}) {
  const menuRef = useRef(null)
  const [activeSubmenu, setActiveSubmenu] = useState(null)
  const [submenuPosition, setSubmenuPosition] = useState({ x: 0, y: 0, direction: 'right' })
  const submenuRef = useRef(null)
  const submenuTriggerRef = useRef(null)

  // 图片缩放选项
  const scaleOptions = [
    { label: '25%', value: 0.25 },
    { label: '33%', value: 0.33 },
    { label: '50%', value: 0.5 },
    { label: '67%', value: 0.67 },
    { label: '80%', value: 0.8 },
    { label: '100%', value: 1 },
    { divider: true },
    { label: '150%', value: 1.5 },
    { label: '200%', value: 2 }
  ]

  // 段落选项
  const paragraphOptions = [
    { label: '标题 1', icon: <Heading1 size={16} />, action: 'heading1' },
    { label: '标题 2', icon: <Heading2 size={16} />, action: 'heading2' },
    { label: '标题 3', icon: <Heading3 size={16} />, action: 'heading3' },
    { divider: true },
    { label: '正文', action: 'paragraph' }
  ]

  // 插入选项
  const insertOptions = [
    { label: '图片', icon: <ImageIcon size={16} />, action: 'insert-image' },
    { label: '链接', icon: <Link2 size={16} />, action: 'insert-link' },
    { label: '代码块', icon: <FileCode size={16} />, action: 'insert-codeblock' },
    { label: '表格', icon: <FileCode size={16} />, action: 'insert-table' },
    { divider: true },
    { label: '无序列表', icon: <List size={16} />, action: 'insert-ul' },
    { label: '有序列表', icon: <ListOrdered size={16} />, action: 'insert-ol' },
    { label: '任务列表', icon: <CheckSquare size={16} />, action: 'insert-task' },
    { divider: true },
    { label: '分隔线', icon: <Minus size={16} />, action: 'insert-hr' }
  ]

  // 生成菜单项
  const getMenuItems = () => {
    const items = []

    // 如果选中了图片
    if (selectedImage) {
      items.push({
        label: '上传图片',
        icon: <Upload size={16} />,
        action: 'upload-image'
      })
      items.push({
        label: '缩放图片',
        icon: <ZoomIn size={16} />,
        submenu: 'scale',
        hasSubmenu: true
      })
      items.push({
        label: '转换图片语法',
        icon: <Code2 size={16} />,
        submenu: 'syntax',
        hasSubmenu: true
      })
      items.push({ divider: true })
    }

    // 编辑工具栏
    items.push({
      type: 'toolbar',
      buttons: [
        { icon: <Scissors size={16} />, action: 'cut', disabled: !selectedText, title: '剪切' },
        { icon: <Copy size={16} />, action: 'copy', disabled: !selectedText, title: '复制' },
        { icon: <Clipboard size={16} />, action: 'paste', disabled: false, title: '粘贴' }, // 始终启用粘贴
        { icon: <Trash2 size={16} />, action: 'delete', disabled: !selectedText, title: '删除' }
      ]
    })
    items.push({ divider: true })

    // 拷贝图片
    if (selectedImage) {
      items.push({
        label: '拷贝图片',
        icon: <Copy size={16} />,
        action: 'copy-image'
      })
      items.push({
        label: '将图像另存为...',
        icon: <Save size={16} />,
        action: 'save-image-as'
      })
      items.push({ divider: true })
    }

    // 格式化工具栏
    items.push({
      label: '加粗',
      icon: <Bold size={16} />,
      action: 'bold',
      shortcut: 'Ctrl+B',
      disabled: !selectedText
    })
    items.push({
      label: '斜体',
      icon: <Italic size={16} />,
      action: 'italic',
      shortcut: 'Ctrl+I',
      disabled: !selectedText
    })
    items.push({
      label: '代码',
      icon: <Code2 size={16} />,
      action: 'inline-code',
      shortcut: 'Ctrl+`',
      disabled: !selectedText
    })
    items.push({
      label: '链接',
      icon: <Link2 size={16} />,
      action: 'link',
      shortcut: 'Ctrl+K'
    })
    items.push({
      label: '引用',
      icon: <Quote size={16} />,
      action: 'quote'
    })
    items.push({
      label: '列表',
      icon: <List size={16} />,
      action: 'list'
    })
    items.push({ divider: true })

    // 段落
    items.push({
      label: '段落',
      submenu: 'paragraph',
      hasSubmenu: true
    })

    // 插入
    items.push({
      label: '插入',
      submenu: 'insert',
      hasSubmenu: true
    })

    return items
  }

  const items = getMenuItems()

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          (!submenuRef.current || !submenuRef.current.contains(e.target))) {
        onClose()
      }
    }

    const handleScroll = () => {
      onClose()
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('scroll', handleScroll, true)
    
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  // 调整主菜单位置，避免超出屏幕
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let adjustedX = x
      let adjustedY = y

      // 水平方向调整
      if (x + rect.width > viewportWidth - 10) {
        adjustedX = viewportWidth - rect.width - 10
      }
      if (adjustedX < 10) {
        adjustedX = 10
      }

      // 垂直方向调整
      if (y + rect.height > viewportHeight - 10) {
        adjustedY = Math.max(10, viewportHeight - rect.height - 10)
      }
      if (adjustedY < 10) {
        adjustedY = 10
      }

      menuRef.current.style.left = `${adjustedX}px`
      menuRef.current.style.top = `${adjustedY}px`
    }
  }, [x, y])

  // 处理子菜单显示
  const handleSubmenuShow = (submenuType, triggerElement) => {
    setActiveSubmenu(submenuType)
    submenuTriggerRef.current = triggerElement

    // 计算子菜单位置
    if (triggerElement) {
      const triggerRect = triggerElement.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      
      // 估算子菜单高度（根据不同类型）
      let estimatedHeight = 200
      if (submenuType === 'scale') {
        estimatedHeight = 300 // 缩放菜单有 8 个选项
      } else if (submenuType === 'paragraph') {
        estimatedHeight = 180
      } else if (submenuType === 'insert') {
        estimatedHeight = 350
      } else if (submenuType === 'syntax') {
        estimatedHeight = 150
      }
      
      // 默认显示在右侧
      let submenuX = triggerRect.right + 4
      let submenuY = triggerRect.top
      let direction = 'right'

      // 如果右侧空间不足，显示在左侧
      if (submenuX + 200 > viewportWidth - 10) {
        submenuX = triggerRect.left - 204
        direction = 'left'
      }
      
      // 检查垂直方向，如果下方空间不足，向上调整
      if (submenuY + estimatedHeight > viewportHeight - 10) {
        submenuY = Math.max(10, viewportHeight - estimatedHeight - 10)
      }

      setSubmenuPosition({ x: submenuX, y: submenuY, direction })
    }
  }

  const handleSubmenuHide = () => {
    setActiveSubmenu(null)
  }

  // 渲染子菜单内容
  const renderSubmenuContent = () => {
    if (!activeSubmenu) return null

    switch (activeSubmenu) {
      case 'scale':
        return scaleOptions.map((option, index) => 
          option.divider ? (
            <div key={`divider-${index}`} className="editor-context-menu-divider" />
          ) : (
            <div
              key={option.value}
              className={`editor-submenu-item with-check ${selectedImage?.scale === option.value ? 'active' : ''}`}
              onClick={() => {
                onAction('scale-image', { scale: option.value })
                onClose()
              }}
            >
              {option.label}
            </div>
          )
        )

      case 'syntax':
        // 显示简洁的语法示例，不包含实际 URL
        const markdownSyntax = '![alt](src "title")'
        const htmlSyntax = '<img src="src" alt="alt" />'
        
        return (
          <>
            <div
              className="editor-submenu-item"
              onClick={() => {
                onAction('convert-syntax', { syntax: 'markdown' })
                onClose()
              }}
            >
              Markdown
            </div>
            <div className="editor-submenu-code">
              {markdownSyntax}
            </div>
            <div className="editor-context-menu-divider" />
            <div
              className="editor-submenu-item"
              onClick={() => {
                onAction('convert-syntax', { syntax: 'html' })
                onClose()
              }}
            >
              HTML
            </div>
            <div className="editor-submenu-code">
              {htmlSyntax}
            </div>
          </>
        )

      case 'paragraph':
        return paragraphOptions.map((option, index) =>
          option.divider ? (
            <div key={`divider-${index}`} className="editor-context-menu-divider" />
          ) : (
            <div
              key={option.action}
              className="editor-submenu-item"
              onClick={() => {
                onAction(option.action)
                onClose()
              }}
            >
              {option.icon && <span className="editor-menu-icon">{option.icon}</span>}
              <span className="editor-menu-label">{option.label}</span>
            </div>
          )
        )

      case 'insert':
        return insertOptions.map((option, index) =>
          option.divider ? (
            <div key={`divider-${index}`} className="editor-context-menu-divider" />
          ) : (
            <div
              key={option.action}
              className="editor-submenu-item"
              onClick={() => {
                onAction(option.action)
                onClose()
              }}
            >
              {option.icon && <span className="editor-menu-icon">{option.icon}</span>}
              <span className="editor-menu-label">{option.label}</span>
            </div>
          )
        )

      default:
        return null
    }
  }

  return (
    <>
      <div 
        ref={menuRef}
        className={`editor-context-menu theme-${theme}`}
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item, index) => {
          if (item.divider) {
            return <div key={`divider-${index}`} className="editor-context-menu-divider" />
          }

          if (item.type === 'toolbar') {
            return (
              <div key={`toolbar-${index}`} className="editor-menu-toolbar">
                {item.buttons.map((btn, btnIndex) => (
                  <div
                    key={btnIndex}
                    className={`editor-menu-toolbar-btn ${btn.disabled ? 'disabled' : ''}`}
                    onClick={() => {
                      if (!btn.disabled) {
                        onAction(btn.action)
                        onClose()
                      }
                    }}
                    title={btn.title || btn.action}
                  >
                    {btn.icon}
                  </div>
                ))}
              </div>
            )
          }

          return (
            <div
              key={index}
              className={`editor-context-menu-item ${item.disabled ? 'disabled' : ''} ${item.hasSubmenu ? 'has-submenu' : ''}`}
              onClick={() => {
                if (!item.disabled && !item.hasSubmenu) {
                  onAction(item.action)
                  onClose()
                }
              }}
              onMouseEnter={(e) => {
                if (item.hasSubmenu) {
                  handleSubmenuShow(item.submenu, e.currentTarget)
                } else {
                  handleSubmenuHide()
                }
              }}
            >
              {item.icon && <span className="editor-menu-icon">{item.icon}</span>}
              <span className="editor-menu-label">{item.label}</span>
              {item.shortcut && <span className="editor-menu-shortcut">{item.shortcut}</span>}
            </div>
          )
        })}
      </div>

      {/* 子菜单 */}
      {activeSubmenu && (
        <div
          ref={submenuRef}
          className={`editor-submenu theme-${theme} ${submenuPosition.direction}`}
          style={{ 
            left: submenuPosition.x, 
            top: submenuPosition.y 
          }}
          onMouseLeave={handleSubmenuHide}
        >
          {renderSubmenuContent()}
        </div>
      )}
    </>
  )
}

export default EditorContextMenu
