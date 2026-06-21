import React, { useState, useEffect, useCallback } from 'react'
import { Clock, RotateCcw, X, FileText } from 'lucide-react'
import { getVersionContent } from '../utils/fileHistoryManagerV2'
import './VersionPreviewDialog.css'

/**
 * 版本预览对话框
 */
function VersionPreviewDialog({ version, filePath, theme = 'light', onClose, onRestore }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    loadVersionContent()
  }, [version, filePath])

  const loadVersionContent = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const data = await getVersionContent(filePath, version.versionNumber)
      setContent(data.content || '')
    } catch (err) {
      console.error('加载版本内容失败:', err)
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const requestClose = useCallback(() => {
    if (isClosing) return
    setIsClosing(true)
    window.setTimeout(() => {
      onClose()
    }, 180)
  }, [isClosing, onClose])

  const doRestoreVersion = () => {
    if (onRestore) {
      onRestore(version, content)
    }
    requestClose()
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const handleOverlayClick = () => {
    requestClose()
  }

  const handleCloseClick = () => {
    requestClose()
  }

  const handleConfirmClick = () => {
    doRestoreVersion()
  }

  return (
    <div className={`dialog-overlay theme-${theme} ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div className="dialog-content version-preview-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <div className="version-title">
            <FileText size={20} />
            <h2>版本 {version.versionNumber}</h2>
            {version.label && <span className="version-badge">{version.label}</span>}
          </div>
          <button className="dialog-close" onClick={handleCloseClick}>
            <X size={20} />
          </button>
        </div>

        <div className="dialog-body">
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <div>加载中...</div>
            </div>
          ) : error ? (
            <div className="error-state">
              <div className="error-message">{error}</div>
            </div>
          ) : (
            <div className="content-preview">
              <pre className="content-text">{content}</pre>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <div className="version-info-bar">
            <div className="info-group">
              <div className="info-item">
                <Clock size={14} />
                <span>{formatTime(version.timestamp)}</span>
              </div>
            </div>
            <div className="info-group vertical">
              <div className="info-item">
                <span>{version.lines} 行</span>
                {version.linesDiff !== undefined && version.linesDiff !== 0 && (
                  <span className={`lines-diff ${version.linesDiff > 0 ? 'positive' : 'negative'}`}>
                    {version.linesDiff > 0 ? '+' : ''}{version.linesDiff}
                  </span>
                )}
              </div>
              <div className="info-item">
                <span>{version.autoSaved ? '自动保存' : '手动保存'}</span>
              </div>
            </div>
          </div>
          <div className="footer-actions">
            <button className="btn-secondary" onClick={handleCloseClick}>
              关闭
            </button>
            <button 
              className="btn-primary" 
              onClick={handleConfirmClick}
              disabled={loading || error}
            >
              <RotateCcw size={16} />
              恢复此版本
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VersionPreviewDialog
