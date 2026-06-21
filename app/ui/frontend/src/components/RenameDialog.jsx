import React, { useState, useEffect, useRef, useCallback } from 'react'
import './Dialog.css'
import './RenameDialog.css'

/**
 * 重命名对话框组件
 */
function RenameDialog({ 
  node,
  onConfirm, 
  onCancel,
  theme = 'light'
}) {
  const [newName, setNewName] = useState(node?.name || '')
  const [error, setError] = useState('')
  const [isClosing, setIsClosing] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (inputRef.current && node) {
      inputRef.current.focus()
      // 选中文件名（不包括扩展名）
      const dotIndex = node.name.lastIndexOf('.')
      if (dotIndex > 0) {
        inputRef.current.setSelectionRange(0, dotIndex)
      } else {
        inputRef.current.select()
      }
    }
  }, [node])

  const requestClose = useCallback(() => {
    if (isClosing) return
    setIsClosing(true)
    window.setTimeout(() => {
      onCancel()
    }, 180)
  }, [isClosing, onCancel])

  const doRenameNode = () => {
    // 验证
    if (!newName.trim()) {
      setError('名称不能为空')
      return
    }

    if (newName === node.name) {
      requestClose()
      return
    }

    // 检查非法字符
    if (/[<>:"/\\|?*]/.test(newName)) {
      setError('名称包含非法字符')
      return
    }

    onConfirm(newName)
  }

  const handleConfirmClick = () => {
    doRenameNode()
  }

  const handleConfirmSubmit = (e) => {
    e.preventDefault()
    doRenameNode()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      requestClose()
    }
  }

  const handleOverlayClick = () => {
    requestClose()
  }

  const handleCloseClick = () => {
    requestClose()
  }

  const handleCancelClick = () => {
    requestClose()
  }

  if (!node) return null

  return (
    <div className={`dialog-overlay compact-panel-overlay theme-${theme} ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div className="dialog-container compact-panel-dialog rename-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>重命名</h2>
          <button className="dialog-close" onClick={handleCloseClick}>×</button>
        </div>
        
        <form onSubmit={handleConfirmSubmit}>
          <div className="dialog-body">
            <div className="form-group">
              <label>新名称</label>
              <input
                ref={inputRef}
                type="text"
                className={`form-input ${error ? 'error' : ''}`}
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value)
                  setError('')
                }}
                onKeyDown={handleKeyDown}
              />
              {error && <div className="form-error">{error}</div>}
            </div>
            <div className="form-hint">
              原名称: {node.name}
            </div>
          </div>
          
          <div className="dialog-footer">
            <button type="button" className="btn-secondary" onClick={handleCancelClick}>
              取消
            </button>
            <button type="button" className="btn-primary" onClick={handleConfirmClick}>
              确定
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RenameDialog
