import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import './MenuBar.css'
import {
  FilePlus,
  Save,
  Download,
  History,
  FileText,
  FilePenLine,
  Sparkles,
  Undo,
  Redo,
  Search,
  Replace,
  WrapText,
  Heading,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Code,
  Link,
  Image,
  Table,
  Minus,
  Calculator,
  Network,
  FolderTree,
  Wrench,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  HelpCircle,
  Columns,
  Eye,
  Scan,
  Keyboard,
  Info,
  X,
  Settings,
  File,
  FileJson,
  ExternalLink,
  LogOut
} from 'lucide-react'

/**
 * 菜单栏组件 - 一二级菜单结构
 */

// 菜单项图标组件
const MenuItemIcon = ({ type }) => {
  const iconStyle = { width: '14px', height: '14px', marginRight: '8px', flexShrink: 0, strokeWidth: 2.5 };
  
  const icons = {
    // 文件菜单
    'new': <FilePlus style={iconStyle} />,
    'save': <Save style={iconStyle} />,
    'export': <Download style={iconStyle} />,
    'history': <History style={iconStyle} />,
    'recent': <FileText style={iconStyle} />,
    'autosave': <Sparkles style={iconStyle} />,
    
    // 编辑菜单
    'undo': <Undo style={iconStyle} />,
    'redo': <Redo style={iconStyle} />,
    'find': <Search style={iconStyle} />,
    'replace': <Replace style={iconStyle} />,
    'format': <WrapText style={iconStyle} />,
    
    // 格式菜单
    'heading': <Heading style={iconStyle} />,
    'bold': <Bold style={iconStyle} />,
    'italic': <Italic style={iconStyle} />,
    'strikethrough': <Strikethrough style={iconStyle} />,
    'list-ul': <List style={iconStyle} />,
    'list-ol': <ListOrdered style={iconStyle} />,
    'list-task': <ListTodo style={iconStyle} />,
    'quote': <Quote style={iconStyle} />,
    'code': <Code style={iconStyle} />,
    
    // 插入菜单
    'link': <Link style={iconStyle} />,
    'image': <Image style={iconStyle} />,
    'table': <Table style={iconStyle} />,
    'hr': <Minus style={iconStyle} />,
    'math': <Calculator style={iconStyle} />,
    'ListTree': <Network style={iconStyle} />,
    
    // 视图菜单
    'tree': <FolderTree style={iconStyle} />,
    'toolbar': <Wrench style={iconStyle} />,
    'layout': <Columns style={iconStyle} />,
    'layout-vertical': <Columns style={iconStyle} />,
    'layout-editor': <FileText style={iconStyle} />,
    'layout-preview': <Eye style={iconStyle} />,
    'focus-split': <Scan style={iconStyle} />,
    'focus-editor-only': <FilePenLine style={iconStyle} />,
    'zoom-in': <ZoomIn style={iconStyle} />,
    'zoom-out': <ZoomOut style={iconStyle} />,
    'zoom-reset': <RotateCcw style={iconStyle} />,
    
    // 帮助菜单
    'help': <HelpCircle style={iconStyle} />,
    'keyboard': <Keyboard style={iconStyle} />,
    'about': <Info style={iconStyle} />,
    'clear': <X style={iconStyle} />,
    'settings': <Settings style={iconStyle} />,
    'external': <ExternalLink style={iconStyle} />,
    'logout': <LogOut style={iconStyle} />,
  };
  
  return icons[type] || null;
};

// 根据文件路径获取文件图标
const getFileIcon = (path) => {
  const iconStyle = { width: '14px', height: '14px', marginRight: '8px', flexShrink: 0, strokeWidth: 2.5 };
  
  if (path.endsWith('.md')) return <FileText style={iconStyle} />
  if (path.endsWith('.txt')) return <File style={iconStyle} />
  if (path.endsWith('.json')) return <FileJson style={iconStyle} />
  return <File style={iconStyle} />
};


function MenuBar({ 
  onNewFile, 
  onSave, 
  onSaveAs, 
  onExport,
  onCopyToWeChat,
  recentFiles,
  onOpenRecentFile,
  onClearRecentFiles,
  onUndo,
  onRedo,
  onCopy,
  onCut,
  onPaste,
  onFormatDocument,
  onFind,
  onReplace,
  onInsertHeading,
  onInsertBold,
  onInsertItalic,
  onInsertLink,
  onInsertImage,
  onInsertCode,
  onInsertTable,
  onOpenTableInsert,
  onToggleFileTree,
  onToggleTheme,
  onSettings,
  onToggleToolbar,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  layout,
  onLayoutChange,
  focusMode,
  onFocusModeChange,
  onShowMarkdownHelp,
  onShowShortcuts,
  onShowAbout,
  onShowHistory,
  onOpenInNewWindow,
  showNewWindowButton = true,
  imageCaptionFormat,
  onImageCaptionFormatChange,
  disabled,
  theme,
  compact = false,
  authUser = null,
  onLogout,
}) {
  const [activeMenu, setActiveMenu] = useState(null)
  const menuRef = useRef(null)
  const compactTriggerRef = useRef(null)
  const compactDropdownRef = useRef(null)
  const [compactDropdownStyle, setCompactDropdownStyle] = useState(null)
  const compactMenuKey = '__compact__'
  const [compactSectionCollapsed, setCompactSectionCollapsed] = useState({
    文件: true,
    编辑: true,
    格式: true,
    插入: true,
    视图: true,
    帮助: true,
    新窗口打开: true,
  })
  const [compactRecentFilesCollapsed, setCompactRecentFilesCollapsed] = useState(true)
  const [compactExportCollapsed, setCompactExportCollapsed] = useState(true)

  // 移动端下拉栏自适应位置
  useLayoutEffect(() => {
    if (activeMenu !== compactMenuKey || !compactTriggerRef.current || !compactDropdownRef.current) {
      setCompactDropdownStyle(null)
      return
    }
    const trigger = compactTriggerRef.current
    const dropdown = compactDropdownRef.current
    const triggerRect = trigger.getBoundingClientRect()
    const dropdownRect = dropdown.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const gap = 4
    const padding = 12

    let left = triggerRect.left
    let top = triggerRect.bottom + gap

    if (left + dropdownRect.width > vw - padding) {
      left = Math.max(padding, vw - dropdownRect.width - padding)
    }
    if (left < padding) left = padding

    if (top + dropdownRect.height > vh - padding) {
      top = triggerRect.top - dropdownRect.height - gap
    }
    if (top < padding) top = padding

    setCompactDropdownStyle({ position: 'fixed', left, top })
  }, [activeMenu])

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenu(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMenuClick = (menuName) => {
    setActiveMenu(activeMenu === menuName ? null : menuName)
  }

  const handleMenuItemClick = (action, options = {}) => {
    action?.()
    if (!options.keepMenuOpen) {
      setActiveMenu(null)
    }
  }

  const formatTime = (timestamp) => {
    const now = Date.now()
    const diff = now - timestamp
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days}天前`
    if (hours > 0) return `${hours}小时前`
    if (minutes > 0) return `${minutes}分钟前`
    return '刚刚'
  }

  // Docker 构建时隐藏「新窗口」按钮
  const hideNewWindowButton = import.meta.env.VITE_RUN_IN_DOCKER === 'true' || showNewWindowButton === false
  const logoutLabel = authUser?.username ? `${authUser.username} 退出` : '退出'

  const menuConfig = [
    {
      name: '文件',
      items: [
        { label: '新建', icon: 'new', shortcut: 'Ctrl+N', action: onNewFile },
        { label: '保存', icon: 'save', shortcut: 'Ctrl+S', action: onSave, disabled },
        { label: '另存为', icon: 'save', shortcut: 'Ctrl+Shift+S', action: onSaveAs },
        { divider: true },
        { label: '最近文件', icon: 'recent', type: 'recent-files' },
        { label: '文件历史', icon: 'history', action: onShowHistory },
        { divider: true },
        { 
          icon: 'export', label: '导出', 
          submenu: [
            { label: '公众号格式', icon: 'export', action: () => onCopyToWeChat ? onCopyToWeChat() : onExport('wechat') },
            { label: 'HTML 格式', icon: 'export', action: () => onExport('html') },
            { label: 'HTML 格式（无样式）', icon: 'export', action: () => onExport('html-plain') },
            { label: 'PDF 格式', icon: 'export', action: () => onExport('pdf') },
            { label: 'PNG 图片', icon: 'export', action: () => onExport('png') },
            { label: 'MD 格式', icon: 'export', action: () => onExport('md') },
            { divider: true },
            { label: '更多选项...', icon: 'export', action: () => onExport() }
          ]
        }
      ]
    },
    {
      name: '编辑',
      items: [
        { label: '撤销', icon: 'undo', shortcut: 'Ctrl+Z', action: onUndo },
        { label: '重做', icon: 'redo', shortcut: 'Ctrl+Y', action: onRedo },
        { divider: true },
        { label: '格式化文档', icon: 'format', shortcut: 'Shift+Alt+F', action: onFormatDocument },
        { divider: true },
        { label: '查找', icon: 'find', shortcut: 'Ctrl+F', action: onFind },
        { label: '替换', icon: 'replace', shortcut: 'Ctrl+H', action: onReplace }
      ]
    },
    {
      name: '格式',
      items: [
        { 
          icon: 'heading', label: '标题', 
          submenu: [
            { label: '一级标题', icon: 'heading', shortcut: 'Ctrl+1', action: () => onInsertHeading(1) },
            { label: '二级标题', icon: 'heading', shortcut: 'Ctrl+2', action: () => onInsertHeading(2) },
            { label: '三级标题', icon: 'heading', shortcut: 'Ctrl+3', action: () => onInsertHeading(3) },
            { label: '四级标题', icon: 'heading', shortcut: 'Ctrl+4', action: () => onInsertHeading(4) },
            { label: '五级标题', icon: 'heading', shortcut: 'Ctrl+5', action: () => onInsertHeading(5) },
            { label: '六级标题', icon: 'heading', shortcut: 'Ctrl+6', action: () => onInsertHeading(6) }
          ]
        },
        { divider: true },
        { label: '加粗', icon: 'bold', shortcut: 'Ctrl+B', action: onInsertBold },
        { label: '斜体', icon: 'italic', shortcut: 'Ctrl+I', action: onInsertItalic },
        { label: '删除线', icon: 'strikethrough', action: () => onInsertCode('strikethrough') },
        { divider: true },
        { label: '无序列表', icon: 'list-ul', action: () => onInsertCode('ul') },
        { label: '有序列表', icon: 'list-ol', action: () => onInsertCode('ol') },
        { label: '任务列表', icon: 'list-task', action: () => onInsertCode('task') },
        { divider: true },
        { label: '引用', icon: 'quote', action: () => onInsertCode('quote') },
        { label: '代码块', icon: 'code', action: () => onInsertCode('codeblock') },
        { label: '行内代码', icon: 'code', action: () => onInsertCode('inline') }
      ]
    },
    {
      name: '插入',
      items: [
        { label: '链接', icon: 'link', shortcut: 'Ctrl+K', action: onInsertLink },
        { label: '图片', icon: 'image', action: onInsertImage },
        { label: '表格', icon: 'table', action: onOpenTableInsert },
        { label: '分隔线', icon: 'hr', action: () => onInsertCode('hr') },
        { divider: true },
        { label: '代码块', icon: 'code', action: () => onInsertCode('codeblock') },
        { label: '数学公式', icon: 'math', action: () => onInsertCode('math') },
        { label: 'Mermaid 图表', icon: 'ListTree', action: () => onInsertCode('mermaid') }
      ]
    }, {
      name: '视图',
      items: [
        { label: '切换工具栏', icon: 'toolbar', action: onToggleToolbar },
        {
          icon: 'layout',
          label: '页面布局',
          submenu: [
            { label: '左右分栏', icon: 'layout-vertical', action: () => { onFocusModeChange?.('off'); onLayoutChange?.('vertical') }, checked: focusMode === 'off' && (layout || 'vertical') === 'vertical', keepMenuOpen: true },
            { label: '仅编辑', icon: 'layout-editor', action: () => { onFocusModeChange?.('off'); onLayoutChange?.('editor-only') }, checked: focusMode === 'off' && layout === 'editor-only', keepMenuOpen: true },
            { label: '仅预览', icon: 'layout-preview', action: () => { onFocusModeChange?.('off'); onLayoutChange?.('preview-only') }, checked: focusMode === 'off' && layout === 'preview-only', keepMenuOpen: true },
            { divider: true },
            { label: '专注左右', icon: 'focus-split', action: () => onFocusModeChange?.('split'), checked: focusMode === 'split', keepMenuOpen: true },
            { label: '专注仅编辑', icon: 'focus-editor-only', action: () => onFocusModeChange?.('editor-only'), checked: focusMode === 'editor-only', keepMenuOpen: true }
          ]
        },
        { divider: true },
        { label: '放大', icon: 'zoom-in', shortcut: 'Ctrl++', action: onZoomIn, keepMenuOpen: true },
        { label: '缩小', icon: 'zoom-out', shortcut: 'Ctrl+-', action: onZoomOut, keepMenuOpen: true },
        { label: '重置缩放', icon: 'zoom-reset', shortcut: 'Ctrl+0', action: onZoomReset },
        { divider: true },
        { label: '设置', icon: 'settings', action: onSettings },
        ...(authUser && !compact ? [
          { divider: true },
          { label: logoutLabel, icon: 'logout', action: onLogout, disabled: !onLogout }
        ] : [])
      ]
    },
    {
      name: '帮助',
      items: [
        { label: 'Markdown 语法', icon: 'help', action: onShowMarkdownHelp },
        { label: '快捷键列表', icon: 'keyboard', action: onShowShortcuts },
        { divider: true },
        { label: '关于', icon: 'about', action: onShowAbout }
      ]
    },
    {
      name: '新窗口打开',
      items: [
        { label: '新窗口打开', icon: 'external', action: onOpenInNewWindow }
      ]
    }
  ]

  const renderCompactMenuContent = (wrapperProps = {}) => {
    return (
      <div className="menu-dropdown compact-menu-dropdown" {...wrapperProps}>
        {menuConfig.map((menu, menuIndex) => (
          <div
            key={menu.name}
            className={`compact-menu-section ${menu.name === '新窗口打开' && hideNewWindowButton ? 'ui-hidden' : ''}`}
          >
            {menuIndex > 0 && <div className="menu-divider compact-menu-divider" />}
            <button
              type="button"
              className="compact-menu-section-title compact-menu-section-toggle"
              onClick={() => setCompactSectionCollapsed((prev) => ({
                ...prev,
                [menu.name]: !prev[menu.name],
              }))}
              aria-expanded={!compactSectionCollapsed[menu.name]}
            >
              <span>{menu.name}</span>
              <span className={`compact-section-arrow ${compactSectionCollapsed[menu.name] ? '' : 'open'}`}>▾</span>
            </button>
            {!compactSectionCollapsed[menu.name] && <div className="compact-menu-section-body">
              {menu.items.map((item, index) => {
                if (item.divider) {
                  return <div key={`divider-${menu.name}-${index}`} className="menu-divider compact-menu-divider" />
                }

                if (item.type === 'recent-files') {
                  return (
                    <div key={`${menu.name}-recent`} className="compact-menu-block">
                      <button
                        type="button"
                        className="compact-submenu-label compact-submenu-toggle"
                        onClick={() => setCompactRecentFilesCollapsed((prev) => !prev)}
                        aria-expanded={!compactRecentFilesCollapsed}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {item.icon && <MenuItemIcon type={item.icon} />}
                          <span className="menu-label">{item.label}</span>
                        </span>
                        <span className={`compact-section-arrow ${compactRecentFilesCollapsed ? '' : 'open'}`}>▾</span>
                      </button>
                      {!compactRecentFilesCollapsed && (
                        recentFiles && recentFiles.length > 0 ? (
                          <>
                            {recentFiles.map((file) => (
                              <button
                                key={file.path}
                                className="menu-dropdown-item compact-submenu-item recent-file-item"
                                onClick={() => handleMenuItemClick(() => onOpenRecentFile(file.path))}
                                title={file.path}
                              >
                                {getFileIcon(file.path)}
                                <span className="menu-label">{file.name}</span>
                                <span className="menu-shortcut recent-time">{formatTime(file.timestamp)}</span>
                              </button>
                            ))}
                            <button
                              className="menu-dropdown-item compact-submenu-item"
                              onClick={() => handleMenuItemClick(onClearRecentFiles)}
                            >
                              <span className="menu-label">清空列表</span>
                            </button>
                          </>
                        ) : (
                          <div className="menu-dropdown-item disabled compact-submenu-item">
                            <span className="menu-label">无最近文件</span>
                          </div>
                        )
                      )}
                    </div>
                  )
                }

                if (item.submenu) {
                  const isExportSubmenu = menu.name === '文件' && item.label === '导出'
                  const isCollapsed = isExportSubmenu ? compactExportCollapsed : false

                  return (
                    <div key={`${menu.name}-${item.label}`} className="compact-menu-block">
                      {isExportSubmenu ? (
                        <button
                          type="button"
                          className="compact-submenu-label compact-submenu-toggle"
                          onClick={() => setCompactExportCollapsed((prev) => !prev)}
                          aria-expanded={!compactExportCollapsed}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                            {item.icon && <MenuItemIcon type={item.icon} />}
                            <span className="menu-label">{item.label}</span>
                          </span>
                          <span className={`compact-section-arrow ${compactExportCollapsed ? '' : 'open'}`}>▾</span>
                        </button>
                      ) : (
                        <div className="compact-submenu-label">
                          {item.icon && <MenuItemIcon type={item.icon} />}
                          <span className="menu-label">{item.label}</span>
                        </div>
                      )}
                      {!isCollapsed && item.submenu.map((subItem, subIdx) => {
                        if (subItem.divider) {
                          return <div key={`divider-${menu.name}-${item.label}-${subIdx}`} className="menu-divider compact-menu-divider" />
                        }

                        return (
                          <button
                            key={`${menu.name}-${item.label}-${subItem.label || subIdx}`}
                            className={`menu-dropdown-item compact-submenu-item ${subItem.checked ? 'checked' : ''}`}
                            onClick={() => handleMenuItemClick(subItem.action, { keepMenuOpen: !!subItem.keepMenuOpen })}
                            disabled={subItem.disabled}
                            title={subItem.description}
                          >
                            {subItem.icon && <MenuItemIcon type={subItem.icon} />}
                            <span className="menu-label">{subItem.label}</span>
                            {subItem.checked && <span className="menu-check">✓</span>}
                            {subItem.shortcut && (
                              <span className="menu-shortcut">{subItem.shortcut}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                }

                return (
                  <button
                    key={`${menu.name}-${item.label}`}
                    className="menu-dropdown-item compact-menu-item"
                    onClick={() => handleMenuItemClick(item.action, { keepMenuOpen: !!item.keepMenuOpen })}
                    disabled={item.disabled}
                  >
                    {item.icon && <MenuItemIcon type={item.icon} />}
                    <span className="menu-label">{item.label}</span>
                    {item.shortcut && (
                      <span className="menu-shortcut">{item.shortcut}</span>
                    )}
                  </button>
                )
              })}
            </div>}
          </div>
        ))}
        {authUser && (
          <div className="compact-menu-section compact-auth-section">
            <div className="menu-divider compact-menu-divider" />
            <button
              className="menu-dropdown-item compact-menu-item"
              onClick={() => handleMenuItemClick(onLogout)}
              disabled={!onLogout}
            >
              <MenuItemIcon type="logout" />
              <span className="menu-label">{logoutLabel}</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={menuRef} style={{ display: 'contents' }}>
      {compact && (
        <div className="menu-item menu-item-compact">
          <button
            ref={compactTriggerRef}
            className={`menu-button compact-trigger ${activeMenu === compactMenuKey ? 'active' : ''}`}
            onClick={() => handleMenuClick(compactMenuKey)}
          >
            菜单
          </button>
          {activeMenu === compactMenuKey && renderCompactMenuContent({
            ref: compactDropdownRef,
            style: compactDropdownStyle
          })}
        </div>
      )}

      {!compact && menuConfig.map((menu) => (
        <div
          key={menu.name}
          className={`menu-item ${menu.name === '新窗口打开' && hideNewWindowButton ? 'ui-hidden' : ''}`}
        >
          <button
            className={`menu-button ${activeMenu === menu.name ? 'active' : ''}`}
            onClick={
              menu.name === '新窗口打开'
                ? () => handleMenuItemClick(onOpenInNewWindow)
                : () => handleMenuClick(menu.name)
            }
          >
            {menu.name === '新窗口打开' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                新窗口
                <ExternalLink size={14} />
              </span>
            ) : (
              menu.name
            )}
          </button>

          {menu.name !== '新窗口打开' && activeMenu === menu.name && (
            <div className="menu-dropdown">
              {menu.items.map((item, index) => {
                if (item.divider) {
                  return <div key={`divider-${index}`} className="menu-divider" />
                }

                // 最近文件特殊处理
                if (item.type === 'recent-files') {
                  return (
                    <div key="recent-files" className="menu-dropdown-item has-submenu">
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {item.icon && <MenuItemIcon type={item.icon} />}
                        <span className="menu-label">{item.label}</span>
                      </span>
                      <span className="menu-arrow">▶</span>
                      <div className="menu-submenu recent-files-submenu">
                        {recentFiles && recentFiles.length > 0 ? (
                          <>
                            {recentFiles.map((file) => (
                              <button
                                key={file.path}
                                className="menu-dropdown-item recent-file-item"
                                onClick={() => handleMenuItemClick(() => onOpenRecentFile(file.path))}
                                title={file.path}
                              >
                                {getFileIcon(file.path)}
                                <span className="menu-label">{file.name}</span>
                                <span className="menu-shortcut recent-time">{formatTime(file.timestamp)}</span>
                              </button>
                            ))}
                            <div className="menu-divider" />
                            <button
                              className="menu-dropdown-item"
                              onClick={() => handleMenuItemClick(onClearRecentFiles)}
                            >
                              <span className="menu-label">清空列表</span>
                            </button>
                          </>
                        ) : (
                          <div className="menu-dropdown-item disabled">
                            <span className="menu-label">无最近文件</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }

                if (item.submenu) {
                  return (
                    <div key={item.label} className="menu-dropdown-item has-submenu">
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {item.icon && <MenuItemIcon type={item.icon} />}
                        <span className="menu-label">{item.label}</span>
                      </span>
                      <span className="menu-arrow">▶</span>
                      <div className="menu-submenu">
                        {item.submenu.map((subItem, subIdx) => {
                          if (subItem.divider) {
                            return <div key={`divider-${subIdx}`} className="menu-divider" />
                          }
                          return (
                            <button
                              key={subItem.label || `item-${subIdx}`}
                              className={`menu-dropdown-item ${subItem.checked ? 'checked' : ''}`}
                              onClick={() => handleMenuItemClick(subItem.action, { keepMenuOpen: !!subItem.keepMenuOpen })}
                              disabled={subItem.disabled}
                              title={subItem.description}
                            >
                              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                {subItem.icon && <MenuItemIcon type={subItem.icon} />}
                                <span className="menu-label">{subItem.label}</span>
                              </span>
                              {subItem.checked && <span className="menu-check">✓</span>}
                              {subItem.shortcut && (
                                <span className="menu-shortcut">{subItem.shortcut}</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                }

                return (
                  <button
                    key={item.label}
                    className="menu-dropdown-item"
                    onClick={() => handleMenuItemClick(item.action, { keepMenuOpen: !!item.keepMenuOpen })}
                    disabled={item.disabled}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      {item.icon && <MenuItemIcon type={item.icon} />}
                      <span className="menu-label">{item.label}</span>
                    </span>
                    {item.shortcut && (
                      <span className="menu-shortcut">{item.shortcut}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}

    </div>
  )
}

// 使用 React.memo 优化性能，避免不必要的重渲染
export default React.memo(MenuBar)
