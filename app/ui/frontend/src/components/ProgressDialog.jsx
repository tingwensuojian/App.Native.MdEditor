import React from 'react'
import './Dialog.css'
import './ProgressDialog.css'

/**
 * 进度对话框组件
 * 用于显示长时间操作的进度
 */
function ProgressDialog({ 
  title = '处理中...',
  message = '请稍候',
  progress = 0,
  showProgress = true
}) {
  return (
    <div className="dialog-overlay compact-panel-overlay">
      <div className="dialog-content progress-dialog compact-panel-dialog">
        <div className="dialog-header">
          <h2>{title}</h2>
        </div>
        
        <div className="dialog-body">
          <div className="progress-message">{message}</div>
          
          {showProgress && (
            <div className="progress-bar-container">
              <div 
                className="progress-bar-fill" 
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          )}
          
          {!showProgress && (
            <div className="progress-spinner">
              <div className="spinner"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProgressDialog

