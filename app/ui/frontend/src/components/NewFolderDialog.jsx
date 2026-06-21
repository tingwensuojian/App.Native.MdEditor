import React, { useState, useEffect, useRef, useCallback } from 'react'
import './Dialog.css'
import './NewFolderDialog.css'

/**
 * 新建文件夹对话框组件
 */
function NewFolderDialog({ 
  parentPath,
  onConfirm, 
  onCancel
}) {
  const [folderName, setFolderName] = useState('')
  const [error, setError] = useState('')
  const [isClosing, setIsClosing] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const requestClose = useCallback(() => {
    if (isClosing) return
    setIsClosing(true)
    window.setTimeout(() => {
      onCancel()
    }, 180)
  }, [isClosing, onCancel])

  const doCreateFolder = () => {
    // 验证
    if (!folderName.trim()) {
      setError('文件夹名称不能为空')
      return
    }

    // 检查非法字符
    if (/[<>:"/\\|?*]/.test(folderName)) {
      setError('名称包含非法字符')
      return
    }

    // 检查是否以点开头（隐藏文件夹）
    if (folderName.startsWith('.')) {
      setError('文件夹名称不能以点开头')
      return
    }

    onConfirm(folderName)
  }

  const handleConfirmClick = () => {
    doCreateFolder()
  }

  const handleConfirmSubmit = (e) => {
    e.preventDefault()
    doCreateFolder()
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

  return (
    <div className={`dialog-overlay new-folder-dialog-overlay ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div className="dialog-content new-folder-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>新建文件夹</h2>
          <button className="dialog-close" onClick={handleCloseClick}>×</button>
        </div>
        
        <form onSubmit={handleConfirmSubmit}>
          <div className="dialog-body">
            <div className="form-group">
              <label>文件夹名称</label>
              <input
                ref={inputRef}
                type="text"
                className={`form-input ${error ? 'error' : ''}`}
                value={folderName}
                onChange={(e) => {
                  setFolderName(e.target.value)
                  setError('')
                }}
                onKeyDown={handleKeyDown}
                placeholder="请输入文件夹名称"
              />
              {error && <div className="form-error">{error}</div>}
            </div>
          </div>
          
          <div className="dialog-footer">
            <div className="form-hint">
              位置: {parentPath}
            </div>
            <div className="footer-buttons">
              <button type="button" className="btn-secondary" onClick={handleCancelClick}>
                取消
              </button>
              <button type="button" className="btn-primary" onClick={handleConfirmClick}>
                创建
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default NewFolderDialog

