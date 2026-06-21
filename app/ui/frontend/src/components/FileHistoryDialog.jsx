import React, { useState, useCallback } from 'react'
import { Scroll, Trash2, ArrowLeft } from 'lucide-react'
import { 
  getVersionContent,
  formatHistoryTime, 
  formatFileSize, 
  calculateDiff 
} from '../utils/fileHistoryManagerV2'
import { useAppUi } from '../context/AppUiContext'
import './FileHistoryDialog.css'

/**
 * 文件历史记录对话框
 */
function FileHistoryDialog({ 
  filePath, 
  currentContent,
  history, 
  onRestore, 
  onDelete,
  onClose,
  theme 
}) {
  const { showToast, requestConfirm } = useAppUi()
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [showDiff, setShowDiff] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const themeClass = theme === 'light' ? 'theme-light' : theme === 'md3' ? 'theme-md3' : 'theme-dark'

  const doSelectVersion = async (version) => {
    try {
      const fullVersion = await getVersionContent(filePath, version.versionNumber)
      setSelectedVersion(fullVersion)
      setShowDiff(false)
    } catch (error) {
      console.error('加载历史版本内容失败:', error)
      showToast('加载版本内容失败: ' + error.message, 'error')
    }
  }

  const handleVersionClick = async (version) => {
    await doSelectVersion(version)
  }

  const doRestoreSelectedVersion = async () => {
    if (!selectedVersion) return

    const confirmed = await requestConfirm({
      title: '恢复历史版本',
      message: '确定要恢复到此版本吗？当前内容将被替换。',
      confirmText: '恢复',
      confirmVariant: 'primary'
    })

    if (confirmed) {
      onRestore(selectedVersion.content)
      requestClose()
    }
  }

  const doDeleteVersion = async (version) => {
    const confirmed = await requestConfirm({
      title: '删除历史版本',
      message: '确定要删除此历史版本吗？',
      confirmText: '删除'
    })

    if (confirmed) {
      onDelete(version.versionNumber)
      if (selectedVersion && selectedVersion.versionNumber === version.versionNumber) {
        setSelectedVersion(null)
      }
    }
  }

  const doToggleDiffView = () => {
    setShowDiff(!showDiff)
  }

  const handleDeleteClick = (e, version) => {
    e.stopPropagation()
    void doDeleteVersion(version)
  }

  const handleToggleDiffClick = () => {
    doToggleDiffView()
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
    void doRestoreSelectedVersion()
  }

  const renderDiff = () => {
    if (!selectedVersion || !showDiff) return null
    
    const diff = calculateDiff(selectedVersion.content, currentContent)
    
    return (
      <div className="history-diff">
        <div className="diff-stats">
          <span className="diff-stat added">+{diff.added} 行</span>
          <span className="diff-stat removed">-{diff.removed} 行</span>
          <span className="diff-stat modified">~{diff.modified} 行</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`dialog-overlay compact-panel-overlay ${themeClass} ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div className={`dialog-container compact-panel-dialog history-dialog ${themeClass}`} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>文件历史记录</h2>
          <button className="dialog-close" onClick={handleCloseClick}>×</button>
        </div>

        <div className="dialog-body">
          <div className="history-file-path">{filePath}</div>

          {history.length === 0 ? (
            <div className="history-empty">
              <span className="empty-icon"><Scroll size={48} /></span>
              <span className="empty-text">暂无历史记录</span>
              <span className="empty-hint">保存文件时会自动创建历史版本</span>
            </div>
          ) : (
            <div className="history-container">
              <div className="history-list">
                <div className="history-list-header">
                  <span>版本历史 ({history.length}/{10})</span>
                </div>
                <div className="history-list-content">
                  {history.map((version, index) => (
                    <div
                      key={version.versionNumber}
                      className={`history-item ${selectedVersion?.versionNumber === version.versionNumber ? 'selected' : ''}`}
                      onClick={() => { void handleVersionClick(version) }}
                    >
                      <div className="history-item-header">
                        <span className="history-index">#{index + 1}</span>
                        <span className="history-time">{formatHistoryTime(version.timestamp)}</span>
                      </div>
                      <div className="history-item-info">
                        <span className="history-size">{formatFileSize(version.size)}</span>
                        <span className="history-lines">{version.lines} 行</span>
                      </div>
                      <button
                        className="history-delete-btn"
                        onClick={(e) => handleDeleteClick(e, version)}
                        title="删除此版本"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="history-preview">
                {selectedVersion ? (
                  <>
                    <div className="preview-header">
                      <span className="preview-title">版本预览</span>
                      <div className="preview-actions">
                        <button
                          className="btn-secondary"
                          onClick={handleToggleDiffClick}
                        >
                          {showDiff ? '隐藏差异' : '显示差异'}
                        </button>
                        <button
                          className="btn-primary"
                          onClick={handleConfirmClick}
                        >
                          恢复此版本
                        </button>
                      </div>
                    </div>

                    {renderDiff()}

                    <div className="preview-content">
                      <pre className="preview-text">{selectedVersion.content}</pre>
                    </div>
                  </>
                ) : (
                  <div className="preview-placeholder">
                    <span className="placeholder-icon"><ArrowLeft size={48} /></span>
                    <span className="placeholder-text">选择一个版本查看内容</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={handleCloseClick}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

export default FileHistoryDialog

