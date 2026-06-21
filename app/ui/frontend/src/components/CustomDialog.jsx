import React, { useState, useEffect, useRef } from 'react'
import { Trash2, Edit2 } from 'lucide-react'
import './CustomDialog.css'

const CustomDialog = ({ isOpen, onClose, onConfirm, title, message, type = 'alert', placeholder = '', defaultValue = '', themes = {}, onDelete, onEdit, onRename }) => {
  const [inputValue, setInputValue] = useState(defaultValue)
  const [editTheme, setEditTheme] = useState(null)
  const [editCSS, setEditCSS] = useState('')
  const [editThemeName, setEditThemeName] = useState('')
  const [rendered, setRendered] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)
  const closeTimerRef = useRef(null)

  useEffect(() => {
    setInputValue(defaultValue)
  }, [defaultValue, isOpen])

  useEffect(() => {
    if (!isOpen) {
      setEditTheme(null)
      setEditCSS('')
      setEditThemeName('')
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setRendered(true)
      setIsClosing(false)
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      return
    }

    if (!rendered || isClosing) return
    setIsClosing(true)
    closeTimerRef.current = setTimeout(() => {
      setRendered(false)
      setIsClosing(false)
      closeTimerRef.current = null
    }, 180)
  }, [isOpen, rendered, isClosing])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [])

  if (!rendered) return null

  const confirmDialog = () => {
    if (type === 'prompt') {
      onConfirm(inputValue)
    } else {
      onConfirm()
    }
    setInputValue('')
  }

  const cancelDialog = () => {
    // 如果在编辑模式，只退出编辑模式
    if (type === 'theme-list' && editTheme) {
      setEditTheme(null)
      setEditCSS('')
      setEditThemeName('')
    } else {
      // 否则关闭整个对话框
      onClose()
      setInputValue('')
    }
  }

  const handleOverlayClick = () => {
    cancelDialog()
  }

  const handleCloseClick = () => {
    cancelDialog()
  }

  const handleCancelClick = () => {
    cancelDialog()
  }

  const handleConfirmClick = () => {
    confirmDialog()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && type !== 'theme-list') {
      confirmDialog()
    } else if (e.key === 'Escape') {
      cancelDialog()
    }
  }

  return (
    <div className={`custom-dialog-overlay ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div className="custom-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="custom-dialog-header">
          <h3>{title}</h3>
        </div>
        
        <div className="custom-dialog-body">
          {message && type !== 'theme-list' && <p className="custom-dialog-message">{message}</p>}
          
          {type === 'prompt' && (
            <input
              type="text"
              className="custom-dialog-input"
              placeholder={placeholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          )}
          
          {type === 'list' && message && (
            <div className="custom-dialog-list">
              {message.split('\n').map((item, index) => (
                item && <div key={index} className="custom-dialog-list-item">{item}</div>
              ))}
            </div>
          )}
          
          {type === 'theme-list' && (
            <div className="custom-dialog-theme-list">
              {Object.keys(themes).length === 0 ? (
                <div className="custom-dialog-empty">没有保存的主题</div>
              ) : editTheme ? (
                // 编辑模式
                <div className="custom-dialog-edit-mode">
                  <div className="custom-dialog-edit-header">
                    <h4>编辑主题</h4>
                    <button
                      className="custom-dialog-btn-back"
                      onClick={() => {
                        setEditTheme(null)
                        setEditCSS('')
                        setEditThemeName('')
                      }}
                    >
                      返回列表
                    </button>
                  </div>
                  <div className="custom-dialog-edit-name">
                    <label>主题名称</label>
                    <input
                      type="text"
                      className="custom-dialog-edit-name-input"
                      value={editThemeName}
                      onChange={(e) => setEditThemeName(e.target.value)}
                      placeholder="输入主题名称"
                    />
                  </div>
                  <textarea
                    className="custom-dialog-edit-textarea"
                    value={editCSS}
                    onChange={(e) => setEditCSS(e.target.value)}
                    placeholder="输入自定义 CSS..."
                    rows={15}
                  />
                </div>
              ) : (
                // 列表模式
                Object.keys(themes).map((themeName) => (
                  <div key={themeName} className="custom-dialog-theme-item">
                    <span className="custom-dialog-theme-name">{themeName}</span>
                    <div className="custom-dialog-theme-actions">
                      <button
                        className="custom-dialog-theme-action-btn"
                        onClick={() => {
                          setEditTheme(themeName)
                          setEditThemeName(themeName)
                          setEditCSS(themes[themeName])
                        }}
                        title="编辑主题"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        className="custom-dialog-theme-delete"
                        onClick={() => onDelete && onDelete(themeName)}
                        title="删除主题"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        
        <div className="custom-dialog-footer">
          {type === 'theme-list' && editTheme ? (
            // 编辑模式的按钮
            <>
              <button 
                className="custom-dialog-btn custom-dialog-btn-cancel" 
                onClick={() => {
                  setEditTheme(null)
                  setEditCSS('')
                  setEditThemeName('')
                }}
              >
                取消
              </button>
              <button 
                className="custom-dialog-btn custom-dialog-btn-confirm" 
                onClick={() => {
                  if (onEdit) {
                    onEdit(editTheme, editCSS, editThemeName)
                  }
                  setEditTheme(null)
                  setEditCSS('')
                  setEditThemeName('')
                }}
              >
                保存修改
              </button>
            </>
          ) : type === 'theme-list' ? (
            // 列表模式只显示关闭按钮
            <button className="custom-dialog-btn custom-dialog-btn-confirm" onClick={handleCloseClick}>
              关闭
            </button>
          ) : (
            // 其他类型的对话框
            <>
              <button className="custom-dialog-btn custom-dialog-btn-cancel" onClick={handleCancelClick}>
                取消
              </button>
              <button className="custom-dialog-btn custom-dialog-btn-confirm" onClick={handleConfirmClick}>
                确定
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CustomDialog
