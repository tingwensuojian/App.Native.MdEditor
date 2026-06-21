import React, { useState, useCallback } from 'react'
import './Dialog.css'
import './ShortcutsDialog.css'

function ShortcutsDialog({ onClose, theme }) {
  const [isClosing, setIsClosing] = useState(false)

  const getThemeClass = () => {
    if (theme === 'light') return 'theme-light'
    if (theme === 'md3') return 'theme-md3'
    return 'theme-dark'
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

  const shortcuts = [
    {
      category: '文件操作',
      items: [
        { keys: 'Ctrl+N', description: '新建文件' },
        { keys: 'Ctrl+S', description: '保存文件' },
        { keys: 'Ctrl+Shift+S', description: '另存为' },
      ]
    },
    {
      category: '编辑操作',
      items: [
        { keys: 'Ctrl+Z', description: '撤销' },
        { keys: 'Ctrl+Y', description: '重做' },
        { keys: 'Ctrl+C', description: '复制' },
        { keys: 'Ctrl+X', description: '剪切' },
        { keys: 'Ctrl+V', description: '粘贴' },
        { keys: 'Ctrl+F', description: '查找' },
        { keys: 'Ctrl+H', description: '替换' },
        { keys: 'Shift+Alt+F', description: '格式化文档' },
      ]
    },
    {
      category: '格式化',
      items: [
        { keys: 'Ctrl+B', description: '加粗' },
        { keys: 'Ctrl+I', description: '斜体' },
        { keys: 'Ctrl+K', description: '插入链接' },
        { keys: 'Ctrl+1-6', description: '插入标题（1-6级）' },
      ]
    },
    {
      category: '视图控制',
      items: [
        { keys: 'Ctrl+T', description: '切换主题' },
        { keys: 'Ctrl+\\', description: '切换文件树' },
      ]
    },
    {
      category: '编辑器',
      items: [
        { keys: 'Ctrl+/', description: '切换注释' },
        { keys: 'Ctrl+D', description: '选择下一个匹配项' },
        { keys: 'Alt+↑/↓', description: '向上/下移动行' },
        { keys: 'Shift+Alt+↑/↓', description: '向上/下复制行' },
        { keys: 'Ctrl+Shift+K', description: '删除行' },
      ]
    }
  ]

  return (
    <div className={`dialog-overlay compact-panel-overlay ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div className={`dialog-container compact-panel-dialog shortcuts-dialog ${getThemeClass()}`} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>快捷键列表</h2>
          <button className="dialog-close" onClick={handleCloseClick}>×</button>
        </div>
        
        <div className="dialog-content shortcuts-content">
          {shortcuts.map((category, index) => (
            <section key={index} className="shortcuts-section">
              <h3>{category.category}</h3>
              <div className="shortcuts-list">
                {category.items.map((item, idx) => (
                  <div key={idx} className="shortcut-item">
                    <span className="shortcut-keys">{item.keys}</span>
                    <span className="shortcut-description">{item.description}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="dialog-footer">
          <button className="btn-primary" onClick={handleCloseClick}>关闭</button>
        </div>
      </div>
    </div>
  )
}

export default ShortcutsDialog
