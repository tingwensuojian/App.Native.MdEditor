import React, { useState, useCallback } from 'react'
import { Sparkles, FileText, Palette, Save, FolderTree, Zap, Upload, Gauge } from 'lucide-react'
import DynamicAppLogo, { DEFAULT_LOGO_CONFIG } from './DynamicAppLogo'
import './Dialog.css'
import './AboutDialog.css'

function AboutDialog({ onClose, theme }) {
  const [isClosing, setIsClosing] = useState(false)
  const appVersion = import.meta.env.VITE_APP_VERSION
  const versionLabel = appVersion ? `版本 v${appVersion}` : '版本'

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

  return (
    <div className={`dialog-overlay compact-panel-overlay ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div className={`dialog-container compact-panel-dialog about-dialog ${getThemeClass()}`} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>关于</h2>
          <button className="dialog-close" onClick={handleCloseClick}>×</button>
        </div>
        
        <div className="dialog-content about-content">
          <div className="about-logo">
            <div className="logo-circle">
              <DynamicAppLogo config={DEFAULT_LOGO_CONFIG} variant="about" />
            </div>
          </div>

          <div className="about-info">
            <h3 className="app-name">Markdown 编辑器</h3>
            <p className="app-version">{versionLabel}</p>
            <p className="app-description">
              专为飞牛 NAS 设计的专业 Markdown 编辑器
            </p>
          </div>

          <div className="about-features">
            <h4>核心功能</h4>
            <ul>
              <li><Sparkles size={16} /> 实时预览与语法高亮</li>
              <li><FileText size={16} /> 支持 GFM、LaTeX、Mermaid、PlantUML、Infographic</li>
              <li><Palette size={16} /> 深色/浅色主题切换</li>
              <li><Save size={16} /> 自动保存与草稿恢复</li>
              <li><FolderTree size={16} /> 文件树浏览与管理</li>
              <li><Zap size={16} /> 专业菜单栏与快捷键</li>
              <li><Upload size={16} /> 多格式支持与导出功能</li>
              <li><FileText size={16} /> Office 文件预览支持（实验）</li>
              <li><Gauge size={16} /> 性能优化与懒加载</li>
              <li><Upload size={16} /> 图床管理与 OSS 配置</li>
              <li><Sparkles size={16} /> AI 对话与内容辅助</li>
              <li><Save size={16} /> 导出配置预设管理</li>
            </ul>
          </div>

          <div className="about-tech">
            <h4>技术栈</h4>
            <div className="tech-tags">
              <span className="tech-tag">React 18</span>
              <span className="tech-tag">Monaco Editor</span>
              <span className="tech-tag">Markdown-it</span>
              <span className="tech-tag">Mermaid</span>
              <span className="tech-tag">KaTeX</span>
              <span className="tech-tag">Vite 5</span>
              <span className="tech-tag">SQLite (better-sqlite3)</span>
            </div>
          </div>

          <div className="about-thanks">
            <h4>鸣谢</h4>
            <p>
              <strong>Doocs</strong>
              <br />
              开发者友好的开源社区
            </p>
            <a href="https://doocs.org/" target="_blank" rel="noreferrer">https://doocs.org/</a>
            <p>
              开源项目支持
              <br />
              cose
            </p>
            <a href="https://github.com/doocs/cose" target="_blank" rel="noreferrer">https://github.com/doocs/cose</a>
          </div>

          <div className="about-footer-info">
            <p>© 2026 Markdown 编辑器</p>
            <p>为飞牛 NAS 用户精心打造</p>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn-primary" onClick={handleCloseClick}>关闭</button>
        </div>
      </div>
    </div>
  )
}

export default AboutDialog
