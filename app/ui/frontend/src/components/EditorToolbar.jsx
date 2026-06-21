import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { 
  Heading1, 
  Heading2, 
  Heading3, 
  Bold, 
  Italic, 
  Strikethrough,
  List,
  ListOrdered,
  CheckSquare,
  Link2,
  Image,
  Upload,
  Code2,
  FileCode,
  Quote,
  Table,
  Minus,
  BarChart3,
  ChevronDown,
  ImageIcon,
  Copy,
  Bot
} from 'lucide-react'
import { copyToWeChat } from '../utils/wechatExporter'
import { useAppUi } from '../context/AppUiContext'
import './EditorToolbar.css'

function EditorToolbar({ onInsert, onImageUpload, onOpenImageManager, onOpenTableInsert, onOpenAI, disabled, onShowToast, exportConfig, compact = false, theme = 'dark' }) {
  const { showToast } = useAppUi()
  const [showChartMenu, setShowChartMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const [copying, setCopying] = useState(false)
  const chartMenuRef = useRef(null)
  const chartButtonRef = useRef(null)
  const fileInputRef = useRef(null)
  
  const doOpenUploadPicker = () => {
    fileInputRef.current?.click()
  }

  const doOpenImageManager = () => {
    onOpenImageManager?.()
  }

  const doOpenTableInsert = () => {
    onOpenTableInsert?.()
  }

  const handleUploadClick = () => {
    doOpenUploadPicker()
  }

  const handleOpenImageManagerClick = () => {
    doOpenImageManager()
  }

  const handleOpenTableInsertClick = () => {
    doOpenTableInsert()
  }
  
  const handleFileChange = async (e) => {
    const files = e.target.files
    if (files && files.length > 0 && onImageUpload) {
      for (let i = 0; i < files.length; i++) {
        await onImageUpload(files[i])
      }
      // 清空 input，允许重复选择同一文件
      e.target.value = ''
    }
  }
  
  const doCopyToWeChat = async () => {
    if (copying) return
    
    setCopying(true)
    
    try {
      // 获取预览内容 - 使用 .markdown-body 选择器
      const previewEl = document.querySelector('.markdown-body')
      if (!previewEl) {
        ;(onShowToast || showToast)('未找到预览内容，请确保文档已渲染', 'error')
        setCopying(false)
        return
      }
      
      const htmlContent = previewEl.innerHTML
      if (!htmlContent || htmlContent.trim() === '') {
        ;(onShowToast || showToast)('预览内容为空，请先编辑文档', 'error')
        setCopying(false)
        return
      }
      
      // 获取主题色（从 exportConfig 或使用默认值）
      let primaryColor = '#0F4C81' // 默认值
      
      // 尝试从 exportConfig 获取主题色
      if (exportConfig && exportConfig.themeColor) {
        primaryColor = exportConfig.themeColor
        console.log('[复制微信] 使用配置的主题色:', primaryColor)
      } else {
        console.log('[复制微信] 使用默认主题色:', primaryColor)
      }
      
      console.log('[复制微信] 开始复制，HTML 长度:', htmlContent.length)
      
      // 复制到剪贴板
      const success = await copyToWeChat(htmlContent, primaryColor)
      
      if (success) {
        ;(onShowToast || showToast)('已复制微信格式，可直接粘贴到微信公众号编辑器', 'success')
      } else {
        ;(onShowToast || showToast)('复制失败，请重试', 'error')
      }
    } catch (err) {
      console.error('复制微信格式失败:', err)
      ;(onShowToast || showToast)('复制失败: ' + err.message, 'error')
    } finally {
      setCopying(false)
    }
  }

  const handleCopyToWeChatClick = async () => {
    await doCopyToWeChat()
  }
  
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!showChartMenu) return
      const target = event.target
      if (chartMenuRef.current?.contains(target) || chartButtonRef.current?.contains(target)) return
      setShowChartMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [showChartMenu])
  
  useEffect(() => {
    if (showChartMenu && chartButtonRef.current) {
      const rect = chartButtonRef.current.getBoundingClientRect()
      const dropdownHeight = 280
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const openAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow
      setMenuPosition({
        top: openAbove ? rect.top - dropdownHeight - 8 : rect.bottom + 8,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 296))
      })
    }
  }, [showChartMenu])
  
  const insertHeading = (level) => {
    const prefix = '#'.repeat(level) + ' '
    onInsert(prefix, '', 'heading')
  }

  const insertBold = () => onInsert('**', '**', 'wrap')
  const insertItalic = () => onInsert('*', '*', 'wrap')
  const insertStrikethrough = () => onInsert('~~', '~~', 'wrap')
  const insertUnorderedList = () => onInsert('- ', '', 'line')
  const insertOrderedList = () => onInsert('1. ', '', 'line')
  const insertTaskList = () => onInsert('- [ ] ', '', 'line')
  const insertLink = () => onInsert('[链接](https://)', '', 'insert')
  const insertImage = () => onInsert('![', '](https://)', 'wrap')
  const insertCodeBlock = () => onInsert('```\n', '\n```', 'wrap')
  const insertInlineCode = () => onInsert('`', '`', 'wrap')
  const insertQuote = () => onInsert('> ', '', 'line')
  const insertHorizontalRule = () => onInsert('\n---\n', '', 'insert')
  const insertTable = () => {
    const table = `| 列1 | 列2 | 列3 |
|------|------|------|
| 内容 | 内容 | 内容 |
| 内容 | 内容 | 内容 |
`
    onInsert(table, '', 'insert')
  }

  const insertChart = (type) => {
    const charts = {
      flowchart: `${'```'}mermaid
graph TD
    A[开始] --> B{判断条件}
    B -->|是| C[执行操作]
    B -->|否| D[其他操作]
    C --> E[结束]
    D --> E
${'```'}`,
      sequence: `${'```'}mermaid
sequenceDiagram
    participant A as 用户
    participant B as 系统
    A->>B: 发送请求
    B->>B: 处理请求
    B-->>A: 返回响应
${'```'}`,
      class: `${'```'}mermaid
classDiagram
    class "动物" {
        +String 名称
        +int 年龄
        +吃()
        +睡()
    }
    class "狗" {
        +吠叫()
    }
    "动物" <|-- "狗"
${'```'}`,
      state: `${'```'}mermaid
stateDiagram-v2
    [*] --> 待机
    待机 --> 运行: 启动
    运行 --> 暂停: 暂停
    暂停 --> 运行: 继续
    运行 --> [*]: 停止
${'```'}`,
      gantt: `${'```'}mermaid
gantt
    title 项目进度
    dateFormat  YYYY-MM-DD
    section 阶段1
    任务1           :a1, 2024-01-01, 30d
    任务2           :after a1, 20d
    section 阶段2
    任务3           :2024-02-01, 25d
${'```'}`,
      pie: `${'```'}mermaid
pie title 数据分布
    "类别A" : 45
    "类别B" : 30
    "类别C" : 15
    "类别D" : 10
${'```'}`,
      journey: `${'```'}mermaid
journey
    title 用户旅程
    section 访问网站
      打开首页: 5: 用户
      浏览内容: 4: 用户
    section 注册
      填写表单: 3: 用户
      验证邮箱: 2: 用户, 系统
${'```'}`,
      er: `${'```'}mermaid
erDiagram
    "用户" ||--o{ "订单" : "创建"
    "订单" ||--|{ "订单项" : "包含"
    "商品" ||--o{ "订单项" : "属于"

    "用户" {
        int id "用户ID（主键）"
        string name "姓名"
        string email "邮箱"
    }
    "订单" {
        int id "订单ID（主键）"
        int user_id "关联用户ID（外键）"
        datetime create_time "创建时间"
    }
    "订单项" {
        int id "订单项ID（主键）"
        int order_id "关联订单ID（外键）"
        int product_id "关联商品ID（外键）"
        int quantity "购买数量"
        decimal price "商品单价"
    }
    "商品" {
        int id "商品ID（主键）"
        string name "商品名称"
        decimal price "售价"
        int stock "库存"
    }
${'```'}`
    }
    
    onInsert(charts[type] + '\n', '', 'insert')
    setShowChartMenu(false)
  }

  const iconSize = 16

  const chartTypes = [
    { id: 'flowchart', label: '流程图', icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M10 6.5h4M17.5 10v4"/></svg>) },
    { id: 'sequence', label: '时序图', icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><line x1="6" y1="8" x2="6" y2="20"/><line x1="18" y1="8" x2="18" y2="20"/><path d="M6 12h12M18 12l-2-2M18 12l-2 2"/></svg>) },
    { id: 'class', label: '类图', icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="6"/><line x1="3" y1="9" x2="21" y2="9"/><rect x="3" y="9" width="18" height="6"/><line x1="3" y1="15" x2="21" y2="15"/><rect x="3" y="15" width="18" height="6"/></svg>) },
    { id: 'state', label: '状态图', icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="12" r="3"/><circle cx="18" cy="12" r="3"/><path d="M9 12h6M15 12l-2-2M15 12l-2 2"/></svg>) },
    { id: 'gantt', label: '甘特图', icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="15" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="12" y2="18"/><circle cx="15" cy="6" r="1.5" fill="currentColor"/><circle cx="21" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="18" r="1.5" fill="currentColor"/></svg>) },
    { id: 'pie', label: '饼图', icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.36 6.36"/><path d="M3 12h9"/></svg>) },
    { id: 'journey', label: '用户旅程图', icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg>) },
    { id: 'er', label: '实体关系图', icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="8" height="10" rx="1"/><rect x="14" y="7" width="8" height="10" rx="1"/><path d="M10 12h4"/></svg>) }
  ]

  if (compact) {
    return (
      <div className="editor-toolbar mobile-compact">
        <div className="toolbar-group mobile-compact-group">
          <button className="toolbar-btn" onClick={() => insertHeading(1)} disabled={disabled} title="标题 1"><Heading1 size={iconSize} /></button>
          <button className="toolbar-btn" onClick={() => insertHeading(2)} disabled={disabled} title="标题 2"><Heading2 size={iconSize} /></button>
          <button className="toolbar-btn" onClick={() => insertHeading(3)} disabled={disabled} title="标题 3"><Heading3 size={iconSize} /></button>
          <button className="toolbar-btn" onClick={insertBold} disabled={disabled} title="加粗 (Ctrl+B)"><Bold size={iconSize} /></button>
          <button className="toolbar-btn" onClick={insertItalic} disabled={disabled} title="斜体 (Ctrl+I)"><Italic size={iconSize} /></button>
          <button className="toolbar-btn" onClick={insertStrikethrough} disabled={disabled} title="删除线"><Strikethrough size={iconSize} /></button>
          {onOpenAI && (
            <>
              <div className="toolbar-divider"></div>
              <button
                type="button"
                className="toolbar-btn ai-toolbar-btn"
                onClick={onOpenAI}
                disabled={disabled}
                title="打开 AI 助手"
              >
                <Bot size={iconSize} />
              </button>
            </>
          )}
          <div className="toolbar-divider"></div>
          <button className="toolbar-btn" onClick={insertUnorderedList} disabled={disabled} title="无序列表"><List size={iconSize} /></button>
          <button className="toolbar-btn" onClick={insertOrderedList} disabled={disabled} title="有序列表"><ListOrdered size={iconSize} /></button>
          <button className="toolbar-btn" onClick={insertTaskList} disabled={disabled} title="任务列表"><CheckSquare size={iconSize} /></button>
          <button className="toolbar-btn" onClick={insertLink} disabled={disabled} title="插入链接"><Link2 size={iconSize} /></button>
          <button className="toolbar-btn" onClick={handleOpenImageManagerClick} disabled={disabled} title="图片管理"><Image size={iconSize} /></button>
          <button className="toolbar-btn" onClick={handleUploadClick} disabled={disabled} title="上传图片 (支持多选)"><Upload size={iconSize} /></button>
          <button className="toolbar-btn" onClick={insertCodeBlock} disabled={disabled} title="代码块"><FileCode size={iconSize} /></button>
          <button className="toolbar-btn" onClick={insertInlineCode} disabled={disabled} title="行内代码"><Code2 size={iconSize} /></button>
          <button className="toolbar-btn" onClick={insertQuote} disabled={disabled} title="引用"><Quote size={iconSize} /></button>
          <button className="toolbar-btn" onClick={handleOpenTableInsertClick} disabled={disabled} title="插入表格"><Table size={iconSize} /></button>
          <button className="toolbar-btn" onClick={insertHorizontalRule} disabled={disabled} title="分隔线"><Minus size={iconSize} /></button>
          <div className="toolbar-group chart-group mobile-chart-group">
            <button
              ref={chartButtonRef}
              className={`toolbar-btn chart-btn ${showChartMenu ? 'active' : ''}`}
              onClick={() => setShowChartMenu(!showChartMenu)}
              disabled={disabled}
              title="插入图表"
            >
              <BarChart3 size={iconSize} />
              <ChevronDown size={12} />
            </button>
          </div>
        </div>

        {showChartMenu && createPortal(
          <div
            ref={chartMenuRef}
            className={`chart-dropdown theme-${theme}`}
            style={{
              position: 'fixed',
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
              zIndex: 9999
            }}
          >
            <div className="chart-dropdown-header">图表类型</div>
            <div className="chart-grid">
              {chartTypes.map(chart => (
                <button key={chart.id} className="chart-item" onClick={() => insertChart(chart.id)} disabled={disabled}>
                  <span className="chart-icon">{chart.icon}</span>
                  <span className="chart-label">{chart.label}</span>
                </button>
              ))}
            </div>
            <div className="chart-dropdown-footer">图表将在预览面板中渲染</div>
          </div>,
          document.body
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    )
  }


  return (
    <div className="editor-toolbar">
      <div className="toolbar-group">
        <button 
          className={`toolbar-btn wechat-copy-btn ${copying ? 'copying' : ''}`}
          onClick={handleCopyToWeChatClick} 
          disabled={disabled || copying} 
          title="复制微信公众号格式 - 可直接粘贴到微信编辑器"
          style={{ display: 'none' }}
        >
          <Copy size={iconSize} />
          <span className="btn-text">{copying ? '复制中...' : '复制微信格式'}</span>
        </button>
      </div>
      <div className="toolbar-divider"></div>
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={() => insertHeading(1)} disabled={disabled} title="标题 1"><Heading1 size={iconSize} /></button>
        <button className="toolbar-btn" onClick={() => insertHeading(2)} disabled={disabled} title="标题 2"><Heading2 size={iconSize} /></button>
        <button className="toolbar-btn" onClick={() => insertHeading(3)} disabled={disabled} title="标题 3"><Heading3 size={iconSize} /></button>
      </div>
      <div className="toolbar-divider"></div>
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={insertBold} disabled={disabled} title="加粗 (Ctrl+B)"><Bold size={iconSize} /></button>
        <button className="toolbar-btn" onClick={insertItalic} disabled={disabled} title="斜体 (Ctrl+I)"><Italic size={iconSize} /></button>
        <button className="toolbar-btn" onClick={insertStrikethrough} disabled={disabled} title="删除线"><Strikethrough size={iconSize} /></button>
      </div>
      {onOpenAI && (
        <>
          <div className="toolbar-divider"></div>
          <div className="toolbar-group">
            <button
              type="button"
              className="toolbar-btn ai-toolbar-btn"
              onClick={onOpenAI}
              disabled={disabled}
              title="打开 AI 助手"
            >
              <Bot size={iconSize} />
            </button>
          </div>
        </>
      )}
      <div className="toolbar-divider"></div>
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={insertUnorderedList} disabled={disabled} title="无序列表"><List size={iconSize} /></button>
        <button className="toolbar-btn" onClick={insertOrderedList} disabled={disabled} title="有序列表"><ListOrdered size={iconSize} /></button>
        <button className="toolbar-btn" onClick={insertTaskList} disabled={disabled} title="任务列表"><CheckSquare size={iconSize} /></button>
      </div>
      <div className="toolbar-divider"></div>
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={insertLink} disabled={disabled} title="插入链接"><Link2 size={iconSize} /></button>
        <button className="toolbar-btn" onClick={handleOpenImageManagerClick} disabled={disabled} title="图片管理"><Image size={iconSize} /></button>
        <button className="toolbar-btn" onClick={handleUploadClick} disabled={disabled} title="上传图片 (支持多选)"><Upload size={iconSize} /></button>
        <button className="toolbar-btn" onClick={insertCodeBlock} disabled={disabled} title="代码块"><FileCode size={iconSize} /></button>
        <button className="toolbar-btn" onClick={insertInlineCode} disabled={disabled} title="行内代码"><Code2 size={iconSize} /></button>
      </div>
      <div className="toolbar-divider"></div>
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={insertQuote} disabled={disabled} title="引用"><Quote size={iconSize} /></button>
        <button className="toolbar-btn" onClick={handleOpenTableInsertClick} disabled={disabled} title="插入表格"><Table size={iconSize} /></button>
        <button className="toolbar-btn" onClick={insertHorizontalRule} disabled={disabled} title="分隔线"><Minus size={iconSize} /></button>
      </div>
      <div className="toolbar-divider"></div>
      <div className="toolbar-group chart-group">
        <button 
          ref={chartButtonRef}
          className={`toolbar-btn chart-btn ${showChartMenu ? 'active' : ''}`} 
          onClick={() => setShowChartMenu(!showChartMenu)} 
          disabled={disabled} 
          title="插入图表"
        >
          <BarChart3 size={iconSize} />
          <ChevronDown size={12} />
        </button>
      </div>
      
      {showChartMenu && createPortal(
        <div
          ref={chartMenuRef}
          className={`chart-dropdown theme-${theme}`}
          style={{
            position: 'fixed',
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            zIndex: 9999
          }}
        >
          <div className="chart-dropdown-header">图表类型</div>
          <div className="chart-grid">
            {chartTypes.map(chart => (
              <button key={chart.id} className="chart-item" onClick={() => insertChart(chart.id)} disabled={disabled}>
                <span className="chart-icon">{chart.icon}</span>
                <span className="chart-label">{chart.label}</span>
              </button>
            ))}
          </div>
          <div className="chart-dropdown-footer">图表将在预览面板中渲染</div>
        </div>,
        document.body
      )}
      
      {/* 隐藏的文件输入框 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  )
}

// 使用 React.memo 优化性能，避免不必要的重渲染
export default React.memo(EditorToolbar)
