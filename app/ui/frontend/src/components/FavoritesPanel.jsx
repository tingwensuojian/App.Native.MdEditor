import React, { useEffect, useRef, useState } from 'react'
import { Star, Folder, FileText, File, FileJson, ChevronDown, ChevronRight, GripVertical, Trash2, FolderOpen, ChevronUp, ChevronDown as ChevronDownSmall } from 'lucide-react'
import { loadSetting, persistSetting } from '../utils/settingsApi'
import './FavoritesPanel.css'

/**
 * 收藏夹面板组件
 */
function FavoritesPanel({ 
  favorites, 
  onOpenFavorite, 
  onRemoveFavorite,
  onClearFavorites,
  onReorderFavorites,
  currentPath 
}) {
  const safeFavorites = Array.isArray(favorites) ? favorites : []
  const [isExpanded, setIsExpanded] = useState(true)
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const expandedHydratedRef = useRef(false)
  const reorderPersistTimerRef = useRef(null)

  useEffect(() => {
    const hydrateExpandedState = async () => {
      try {
        const saved = await loadSetting('favoritesPanelExpanded', true)
        setIsExpanded(saved !== false)
      } catch (error) {
        console.error('[FavoritesPanel] Failed to load expanded state:', error)
      } finally {
        expandedHydratedRef.current = true
      }
    }

    hydrateExpandedState()
  }, [])

  useEffect(() => {
    if (!expandedHydratedRef.current) {
      return
    }

    persistSetting('favoritesPanelExpanded', isExpanded).catch((error) => {
      console.error('[FavoritesPanel] Failed to save expanded state:', error)
    })
  }, [isExpanded])

  useEffect(() => {
    return () => {
      if (reorderPersistTimerRef.current) {
        clearTimeout(reorderPersistTimerRef.current)
      }
    }
  }, [])

  const doToggleExpanded = () => {
    setIsExpanded(!isExpanded)
  }

  const doOpenFavorite = (path) => {
    onOpenFavorite(path)
  }

  const handleToggleClick = () => {
    doToggleExpanded()
  }

  const handleOpenFavoriteClick = (path) => {
    doOpenFavorite(path)
  }

  const doRemoveFavorite = (path) => {
    onRemoveFavorite(path)
  }

  const handleRemoveClick = (e, path) => {
    e.stopPropagation()
    doRemoveFavorite(path)
  }

  const doClearFavorites = () => {
    onClearFavorites()
  }

  const schedulePersistReorder = (nextFavorites) => {
    if (!onReorderFavorites) return

    // 本地即时更新（无感）
    onReorderFavorites(nextFavorites, { skipPersist: true })

    // 防抖持久化（减少频繁写入）
    if (reorderPersistTimerRef.current) {
      clearTimeout(reorderPersistTimerRef.current)
    }

    reorderPersistTimerRef.current = setTimeout(() => {
      onReorderFavorites(nextFavorites)
      reorderPersistTimerRef.current = null
    }, 350)
  }

  const doMoveFavorite = (fromIndex, toIndex) => {
    if (!onReorderFavorites) return
    if (toIndex < 0 || toIndex >= safeFavorites.length || fromIndex === toIndex) return

    const nextFavorites = [...safeFavorites]
    const [movedItem] = nextFavorites.splice(fromIndex, 1)
    nextFavorites.splice(toIndex, 0, movedItem)
    schedulePersistReorder(nextFavorites)
  }

  const handleClearFavoritesClick = () => {
    doClearFavorites()
  }

  const handleMoveUpClick = (e, index) => {
    e.stopPropagation()
    doMoveFavorite(index, index - 1)
  }

  const handleMoveDownClick = (e, index) => {
    e.stopPropagation()
    doMoveFavorite(index, index + 1)
  }

  // 处理右键菜单
  const handleContextMenu = (e, item) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item: item,
      type: item ? 'item' : 'header'
    })
  }

  // 处理头部右键菜单
  const handleHeaderContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item: null,
      type: 'header'
    })
  }

  // 关闭右键菜单
  const closeContextMenu = () => {
    setContextMenu(null)
  }

  // 处理右键菜单操作
  const doExecuteContextMenuAction = (action) => {
    if (!contextMenu) return

    // 处理头部菜单操作
    if (contextMenu.type === 'header') {
      if (action === 'clear') {
        doClearFavorites()
      }
      closeContextMenu()
      return
    }

    // 处理收藏项菜单操作
    switch (action) {
      case 'open':
        doOpenFavorite(contextMenu.item.path)
        break
      case 'remove':
        doRemoveFavorite(contextMenu.item.path)
        break
      default:
        break
    }
    closeContextMenu()
  }

  const handleContextMenuActionClick = (action) => {
    doExecuteContextMenuAction(action)
  }

  // 拖拽开始
  const handleDragStart = (e, index) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
    // 添加拖拽样式
    e.currentTarget.style.opacity = '0.5'
  }

  // 拖拽结束
  const handleDragEnd = (e) => {
    setDraggedIndex(null)
    e.currentTarget.style.opacity = '1'
  }

  // 拖拽经过
  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  // 放置
  const handleDrop = (e, dropIndex) => {
    e.preventDefault()
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      return
    }

    // 重新排序
    const newFavorites = [...safeFavorites]
    const [draggedItem] = newFavorites.splice(draggedIndex, 1)
    newFavorites.splice(dropIndex, 0, draggedItem)

    // 本地即时更新 + 防抖持久化
    schedulePersistReorder(newFavorites)

    setDraggedIndex(null)
  }

  const getFavoriteIcon = (type, path) => {
    if (type === 'directory') return <Folder size={16} />
    if (path.endsWith('.md')) return <FileText size={16} />
    if (path.endsWith('.txt')) return <File size={16} />
    if (path.endsWith('.json')) return <FileJson size={16} />
    return <File size={16} />
  }

  return (
    <div className="favorites-panel">
      <div className="favorites-header" onClick={handleToggleClick} onContextMenu={handleHeaderContextMenu}>
        <span className="favorites-toggle">{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <span className="favorites-title"><Star size={16} fill="currentColor" /> 收藏夹</span>
        <span className="favorites-count">({safeFavorites.length})</span>
      </div>

      {isExpanded && (
        <div className="favorites-content" onContextMenu={handleHeaderContextMenu}>
          {safeFavorites.length === 0 ? (
            <div className="favorites-empty">
              <span className="empty-icon"><Star size={48} /></span>
              <span className="empty-text">暂无收藏</span>
              <span className="empty-hint">右键文件可添加收藏</span>
            </div>
          ) : (
            <>
              <div className="favorites-list">
                {safeFavorites.map((item, index) => (
                  <div
                    key={item.path}
                    className={`favorite-item ${currentPath === item.path ? 'active' : ''} ${draggedIndex === index ? 'dragging' : ''}`}
                    onClick={() => handleOpenFavoriteClick(item.path)}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                    title={item.path}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                  >
                    <span className="favorite-drag-handle" title="拖拽排序"><GripVertical size={16} /></span>
                    <span className="favorite-icon">
                      {getFavoriteIcon(item.type, item.path)}
                    </span>
                    <span className="favorite-name">{item.name}</span>
                    <div className="favorite-reorder-controls">
                      <button
                        className="favorite-reorder-btn"
                        onClick={(e) => handleMoveUpClick(e, index)}
                        title="上移"
                        disabled={index === 0}
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        className="favorite-reorder-btn"
                        onClick={(e) => handleMoveDownClick(e, index)}
                        title="下移"
                        disabled={index === safeFavorites.length - 1}
                      >
                        <ChevronDownSmall size={14} />
                      </button>
                    </div>
                    <button
                      className="favorite-remove"
                      onClick={(e) => handleRemoveClick(e, item.path)}
                      title="取消收藏"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              
              {safeFavorites.length > 0 && (
                <div className="favorites-actions">
                  <button
                    className="favorites-clear-btn"
                    onClick={handleClearFavoritesClick}
                    title="清空收藏夹"
                  >
                    清空收藏夹
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 自定义右键菜单 */}
      {contextMenu && (
        <div 
          className="favorites-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'header' ? (
            // 头部菜单
            <>
              <div 
                className="context-menu-item danger"
                onClick={() => handleContextMenuActionClick('clear')}
              >
                <Trash2 size={16} />
                <span>清空收藏夹</span>
              </div>
            </>
          ) : (
            // 收藏项菜单
            <>
              <div 
                className="context-menu-item"
                onClick={() => handleContextMenuActionClick('open')}
              >
                <FolderOpen size={16} />
                <span>打开</span>
              </div>
              <div className="context-menu-divider" />
              <div 
                className="context-menu-item danger"
                onClick={() => handleContextMenuActionClick('remove')}
              >
                <Trash2 size={16} />
                <span>取消收藏</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* 点击其他地方关闭菜单 */}
      {contextMenu && (
        <div 
          className="context-menu-overlay"
          onClick={closeContextMenu}
          onContextMenu={(e) => {
            e.preventDefault()
            closeContextMenu()
          }}
        />
      )}
    </div>
  )
}

// 使用 React.memo 优化性能
export default React.memo(FavoritesPanel)
