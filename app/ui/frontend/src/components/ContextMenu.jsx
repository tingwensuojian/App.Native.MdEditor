import React, { useEffect, useRef } from 'react'
import { File, Folder, Edit, Trash2, Copy, Scissors, Clipboard, Star, FolderPlus, RefreshCw, Upload, Info } from 'lucide-react'
import './ContextMenu.css'

/**
 * 右键上下文菜单组件
 */
function ContextMenu({ 
  x, 
  y, 
  node,
  type,
  expanded,
  onAction,
  onClose
}) {
  const menuRef = useRef(null)

  // 根据节点类型生成菜单项
  const getMenuItems = () => {
    // 如果是头部菜单或空白处菜单
    if (type === 'header') {
      return [
        {
          label: '新建文件夹',
          icon: <FolderPlus size={16} />,
          action: () => onAction('newfolder')
        },
        { divider: true },
        {
          label: '刷新',
          icon: <RefreshCw size={16} />,
          action: () => onAction('refresh')
        }
      ]
    }
    
    if (!node) return []
    
    const isFile = node.type === 'file'
    const isDirectory = node.type === 'directory'
    const isFav = !!node.isFavorite
    const isFolderExpanded = isDirectory && expanded && expanded.has(node.path)
    
    const items = []
    
    // 打开 / 展开 / 收起
    items.push({
      label: isFile ? '打开文件' : (isFolderExpanded ? '收起文件夹' : '展开文件夹'),
      icon: isFile ? <File size={16} /> : <Folder size={16} />,
      action: () => onAction('open')
    })
    
    items.push({ divider: true })
    
    // 重命名
    items.push({
      label: '重命名',
      icon: <Edit size={16} />,
      action: () => onAction('rename')
    })
    
    // 删除
    items.push({
      label: '删除',
      icon: <Trash2 size={16} />,
      action: () => onAction('delete')
    })
    
    items.push({ divider: true })
    
    // 复制
    items.push({
      label: '复制',
      icon: <Copy size={16} />,
      action: () => onAction('copy')
    })
    
    // 剪切
    items.push({
      label: '剪切',
      icon: <Scissors size={16} />,
      action: () => onAction('cut')
    })
    
    // 粘贴（仅目录，且剪贴板有内容）
    if (isDirectory) {
      const clipboard = localStorage.getItem('clipboard');
      if (clipboard) {
        try {
          const clipData = JSON.parse(clipboard);
          if (clipData && clipData.path) {
            items.push({
              label: '粘贴',
              icon: <Clipboard size={16} />,
              action: () => onAction('paste')
            });
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
    
    items.push({ divider: true })
    
    // 收藏
    items.push({
      label: isFav ? '取消收藏' : '添加到收藏夹',
      icon: <Star size={16} fill={isFav ? 'currentColor' : 'none'} />,
      action: () => onAction('favorite')
    })
    
    // 新建文件夹（仅目录）
    if (isDirectory) {
      items.push({
        label: '新建文件夹',
        icon: <FolderPlus size={16} />,
        action: () => onAction('newfolder')
      })
    }
    
    
    // 上传文件（仅目录）
    if (isDirectory) {
      items.push({
        label: '上传文件',
        icon: <Upload size={16} />,
        action: () => onAction('upload')
      })
    }
// 刷新（仅目录）
    if (isDirectory) {
      items.push({
        label: '刷新',
        icon: <RefreshCw size={16} />,
        action: () => onAction('refresh')
      })
    }
    
    items.push({ divider: true })
    
    // 属性
    items.push({
      label: '属性',
      icon: <Info size={16} />,
      action: () => onAction('properties')
    })
    
    return items
  }

  const items = getMenuItems()

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose()
      }
    }

    const handleScroll = () => {
      onClose()
    }

    document.addEventListener('pointerdown', handleClick)
    document.addEventListener('scroll', handleScroll, true)
    
    return () => {
      document.removeEventListener('pointerdown', handleClick)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  // 调整菜单位置，避免超出屏幕
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let adjustedX = x
      let adjustedY = y

      // 水平方向调整：如果右侧超出，则向左移动
      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10
      }
      
      // 确保不会超出左边界
      if (adjustedX < 10) {
        adjustedX = 10
      }

      // 垂直方向调整：如果底部超出，则显示在鼠标上方
      if (y + rect.height > viewportHeight) {
        // 尝试显示在鼠标上方
        adjustedY = y - rect.height
        
        // 如果上方也放不下，则尽量靠近顶部
        if (adjustedY < 10) {
          adjustedY = 10
        }
      }
      
      // 确保不会超出顶部
      if (adjustedY < 10) {
        adjustedY = 10
      }

      menuRef.current.style.left = `${adjustedX}px`
      menuRef.current.style.top = `${adjustedY}px`
    }
  }, [x, y])

  return (
    <div 
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => (
        item.divider ? (
          <div key={`divider-${index}`} className="context-menu-divider" />
        ) : (
          <div
            key={index}
            className={`context-menu-item ${item.disabled ? 'disabled' : ''}`}
            onClick={() => {
              if (!item.disabled) {
                item.action()
                onClose()
              }
            }}
          >
            {item.icon && <span className="menu-icon">{item.icon}</span>}
            <span className="menu-label">{item.label}</span>
            {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
          </div>
        )
      ))}
    </div>
  )
}

export default ContextMenu
