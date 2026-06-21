import React, { useState, useCallback } from 'react'
import './Dialog.css'
import './RenameDialog.css'
import { useAppUi } from '../context/AppUiContext'

/**
 * 文件属性对话框组件
 */
function FilePropertiesDialog({ 
  node,
  onClose
}) {
  const { showToast } = useAppUi()
  const [isClosing, setIsClosing] = useState(false)

  const copyText = async (value, label) => {
    const text = String(value ?? '')

    // 1) 标准 Clipboard API
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        showToast?.(`${label}已复制`, 'success')
        return
      }
    } catch (_) {
      // ignore and fallback
    }

    // 2) 最后兜底：弹窗给用户手动复制
    try {
      window.prompt(`请手动复制${label}`, text)
    } catch (_) {
      // ignore
    }
    showToast?.('当前环境限制自动复制，请手动复制', 'warning')
  }

  const requestClose = useCallback(() => {
    if (isClosing) return
    setIsClosing(true)
    window.setTimeout(() => {
      onClose()
    }, 180)
  }, [isClosing, onClose])

  const handleOverlayClick = () => {
    requestClose()
  }

  const handleCloseClick = () => {
    requestClose()
  }

  const handleConfirmClick = () => {
    requestClose()
  }

  if (!node) return null

  return (
    <div className={`dialog-overlay compact-panel-overlay ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div className="dialog-container compact-panel-dialog properties-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>文件属性</h2>
          <button className="dialog-close" onClick={handleCloseClick}>×</button>
        </div>
        
        <div className="dialog-body">
          <div className="properties-list">
            <div className="property-item">
              <span className="property-label">名称:</span>
              <span
                className="property-value property-value-copyable"
                role="button"
                tabIndex={0}
                title="点击复制名称"
                onClick={() => copyText(node.name, '名称')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    copyText(node.name, '名称')
                  }
                }}
              >
                {node.name}
              </span>
            </div>
            <div className="property-item">
              <span className="property-label">路径:</span>
              <span
                className="property-value property-value-copyable"
                role="button"
                tabIndex={0}
                title="点击复制路径"
                onClick={() => copyText(node.path, '路径')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    copyText(node.path, '路径')
                  }
                }}
              >
                {node.path}
              </span>
            </div>
            <div className="property-item">
              <span className="property-label">类型:</span>
              <span className="property-value">{node.type === 'directory' ? '文件夹' : '文件'}</span>
            </div>
            {node.size !== undefined && (
              <div className="property-item">
                <span className="property-label">大小:</span>
                <span className="property-value">
                  {node.size < 1024 ? `${node.size} B` : 
                   node.size < 1024 * 1024 ? `${(node.size / 1024).toFixed(2)} KB` : 
                   `${(node.size / (1024 * 1024)).toFixed(2)} MB`}
                </span>
              </div>
            )}
            {node.mtime !== undefined && (
              <div className="property-item">
                <span className="property-label">修改时间:</span>
                <span className="property-value">
                  {new Date(node.mtime).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
        
        <div className="dialog-footer">
          <button type="button" className="btn-primary" onClick={handleConfirmClick}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

export default FilePropertiesDialog
