import React, { useState, useEffect } from 'react'
import { Clock, Trash2, AlertCircle, FileText } from 'lucide-react'
import { 
  getFileHistory, 
  deleteVersion, 
  clearAllVersions,
  formatHistoryTime 
} from '../utils/fileHistoryManagerV2'
import ConfirmDialog from './ConfirmDialog'
import VersionPreviewDialog from './VersionPreviewDialog'
import AnimatedList from './AnimatedList'
import { useAppUi } from '../context/AppUiContext'
import './HistoryPanel.css'

/**
 * 历史版本面板组件
 */
function HistoryPanel({ currentPath, theme = 'light', onVersionRestore }) {
  const { showToast } = useAppUi()
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState(null)

  // 加载版本列表
  useEffect(() => {
    if (currentPath) {
      loadVersions()
    } else {
      setVersions([])
    }
  }, [currentPath])

  // 智能刷新：检测到新版本时才刷新
  useEffect(() => {
    if (!currentPath) return

    const interval = setInterval(async () => {
      try {
        const list = await getFileHistory(currentPath)
        // 只有当版本数量变化时才更新（说明有新版本）
        if (list.length !== versions.length) {
          setVersions(list)
        }
      } catch (error) {
        console.error('检查版本更新失败:', error)
      }
    }, 3000) // 3秒检查一次

    return () => clearInterval(interval)
  }, [currentPath, versions.length])

  const loadVersions = async () => {
    setLoading(true)
    try {
      const list = await getFileHistory(currentPath)
      setVersions(list)
    } catch (error) {
      console.error('加载历史版本失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 删除单个版本
  const doDeleteVersion = async (versionNumber) => {
    try {
      await deleteVersion(currentPath, versionNumber)
      await loadVersions() // 重新加载列表
    } catch (error) {
      console.error('删除版本失败:', error)
      showToast('删除失败: ' + error.message, 'error')
    }
  }

  // 显示清空确认对话框
  const doOpenClearAllConfirm = () => {
    if (versions.length === 0) return
    setShowClearConfirm(true)
  }

  // 确认清空所有版本
  const doClearAllVersions = async () => {
    try {
      await clearAllVersions(currentPath)
      setVersions([])
      setShowClearConfirm(false)
    } catch (error) {
      console.error('清空历史版本失败:', error)
      showToast('清空失败: ' + error.message, 'error')
    }
  }

  // 预览版本（点击版本项）
  const doOpenVersionPreview = (version) => {
    setSelectedVersion(version)
  }

  // 关闭预览对话框
  const doCloseVersionPreview = () => {
    setSelectedVersion(null)
  }

  // 恢复版本
  const doRestoreVersion = (version, content) => {
    if (onVersionRestore) {
      onVersionRestore(content, version)
    }
  }

  const handleDeleteVersionClick = async (versionNumber, event) => {
    event.stopPropagation()
    await doDeleteVersion(versionNumber)
  }

  const handleClearAllClick = () => {
    doOpenClearAllConfirm()
  }

  const handleVersionClick = (version) => {
    doOpenVersionPreview(version)
  }

  const handleClosePreviewClick = () => {
    doCloseVersionPreview()
  }

  if (!currentPath) {
    return (
      <div className="history-panel">
        <div className="history-empty">
          <FileText size={48} className="empty-icon" strokeWidth={1.5} />
          <div className="empty-text">请先打开一个文件</div>
        </div>
      </div>
    )
  }

  return (
    <div className="history-panel">
      {loading ? (
        <div className="history-loading">
          <div className="loading-spinner"></div>
          <div>加载中...</div>
        </div>
      ) : versions.length === 0 ? (
        <div className="history-empty">
          <Clock size={48} className="empty-icon" strokeWidth={1.5} />
          <div className="empty-text">暂无历史版本</div>
          <div className="empty-hint">编辑并保存文件后会自动创建历史版本</div>
        </div>
      ) : (
        <div className="history-content">
          <div className="history-header">
            <span className="history-count">共 {versions.length} 个版本</span>
            <button 
              className="btn-clear-all" 
              onClick={handleClearAllClick}
              title="清空所有历史版本"
            >
              清空所有
            </button>
          </div>
          
          <div className="history-list">
            <AnimatedList delay={30}>
              {versions.map((v, index) => (
                <div 
                  key={v.versionNumber} 
                  className="history-item"
                  onClick={() => handleVersionClick(v)}
                >
                  <button 
                    className="btn-delete-icon"
                    onClick={(e) => handleDeleteVersionClick(v.versionNumber, e)}
                    title="删除此版本"
                  >
                    <Trash2 size={16} />
                  </button>
                  
                  <div className="history-info">
                    <div className="version-header">
                      <span className="version-number">版本 {v.versionNumber}</span>
                      {index === 0 && <span className="version-badge latest">最新</span>}
                      {v.linesDiff !== undefined && v.linesDiff !== 0 && (
                        <span className={`lines-diff ${v.linesDiff > 0 ? 'positive' : 'negative'}`}>
                          {v.linesDiff > 0 ? '+' : ''}{v.linesDiff}
                        </span>
                      )}
                    </div>
                    
                    <div className="version-time">{formatHistoryTime(v.timestamp)}</div>
                    
                    <div className="version-meta">
                      {v.label && v.label.includes('恢复') ? (
                        <span className="restore-info">{v.label}</span>
                      ) : (
                        <span>{v.lines} 行</span>
                      )}
                      <span>·</span>
                      <span>{v.autoSaved ? '自动保存' : '手动保存'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </AnimatedList>
          </div>
        </div>
      )}

      {/* 删除所有版本确认对话框 */}
      {showClearConfirm && (
        <ConfirmDialog
          title="清空历史版本"
          message={`确定要删除 "${currentPath}" 的所有 ${versions.length} 个历史版本吗？\n\n此操作不可恢复。`}
          confirmText="确定删除"
          cancelText="取消"
          onConfirm={doClearAllVersions}
          onCancel={() => setShowClearConfirm(false)}
          theme={theme}
        />
      )}

      {/* 版本预览对话框 */}
      {selectedVersion && (
        <VersionPreviewDialog
          version={selectedVersion}
          filePath={currentPath}
          theme={theme}
          onClose={handleClosePreviewClick}
          onRestore={doRestoreVersion}
        />
      )}
    </div>
  )
}

// 使用 React.memo 优化性能
export default React.memo(HistoryPanel)
