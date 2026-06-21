import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import Editor from '@monaco-editor/react'
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import katex from 'markdown-it-katex'
import 'github-markdown-css/github-markdown-dark.css'
import 'github-markdown-css/github-markdown-light.css'
import FileTree from './components/FileTree'
import DraftRecoveryDialog from './components/DraftRecoveryDialog'
import EditorToolbar from './components/EditorToolbar'
import NewFileDialog from './components/NewFileDialog'
import SaveAsDialog from './components/SaveAsDialog'
import ExportDialog from './components/ExportDialog'
import SettingsDialog from './components/SettingsDialog'
import { useAutoSave } from './hooks/useAutoSave'
import { getDraft, clearDraft, hasDraft } from './utils/draftManager'
import './App.css'

// 初始化 Markdown 渲染器
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true
})
  .use(taskLists, { enabled: true })
  .use(footnote)
  .use(katex)

// Mermaid 懒加载
let mermaidModule = null
const loadMermaid = async () => {
  if (!mermaidModule) {
    const mermaid = await import('mermaid')
    mermaidModule = mermaid.default
    mermaidModule.initialize({ 
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose'
    })
  }
  return mermaidModule
}

function App() {
  const [content, setContent] = useState('')
  const [currentPath, setCurrentPath] = useState('')
  const [status, setStatus] = useState('就绪')
  const [editorTheme, setEditorTheme] = useState('vs-dark')
  const [layout, setLayout] = useState('vertical')
  const [showFileTree, setShowFileTree] = useState(true)
  const [showDraftDialog, setShowDraftDialog] = useState(false)
  const [showNewFileDialog, setShowNewFileDialog] = useState(false)
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [pendingDraft, setPendingDraft] = useState(null)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true)
  const [rootDirs, setRootDirs] = useState([])
  const [mermaidLoaded, setMermaidLoaded] = useState(false)
  const previewRef = useRef(null)
  const editorRef = useRef(null)

  const toggleEditorTheme = async () => {
    const newTheme = editorTheme === 'vs-dark' ? 'light' : 'vs-dark'
    setEditorTheme(newTheme)
    
    // 如果 Mermaid 已加载，更新主题
    if (mermaidLoaded && mermaidModule) {
      mermaidModule.initialize({ 
        startOnLoad: false,
        theme: newTheme === 'light' ? 'default' : 'dark',
        securityLevel: 'loose'
      })
      setTimeout(() => renderMarkdown(), 100)
    }
  }

  const saveFile = async (path = currentPath) => {
    if (!path) {
      setStatus('未指定文件路径，无法保存')
      return false
    }

    try {
      setStatus('保存中...')
      const response = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content })
      })
      const data = await response.json()
      
      if (data.ok) {
        setStatus(`已保存: ${path}`)
        setTimeout(() => setStatus('就绪'), 2000)
        return true
      } else {
        setStatus(`保存失败: ${data.message || data.code}`)
        return false
      }
    } catch (error) {
      setStatus('保存失败: 网络错误')
      console.error('Save file error:', error)
      return false
    }
  }

  const autoSave = useAutoSave(content, currentPath, saveFile, {
    interval: 30000,
    enabled: autoSaveEnabled && !!currentPath,
    onAutoSaveSuccess: (message) => {
      setStatus(message)
      setTimeout(() => setStatus('就绪'), 2000)
    },
    onAutoSaveError: (error) => {
      console.error('自动保存失败:', error)
    }
  })

  // 加载根目录列表
  useEffect(() => {
    const loadRootDirs = async () => {
      try {
        const response = await fetch('/api/files?path=/')
        const data = await response.json()
        if (data.ok && data.items) {
          setRootDirs(data.items)
        }
      } catch (error) {
        console.error('Load root dirs error:', error)
      }
    }
    loadRootDirs()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const path = params.get('path')
    if (path) {
      setCurrentPath(path)
      loadFile(path)
    } else {
      setContent(`# 欢迎使用 Markdown 编辑器

这是一个功能强大的 Markdown 编辑器，支持：

## 核心功能
- ✅ 实时预览
- ✅ 语法高亮
- ✅ GFM 支持（表格、任务列表等）
- ✅ LaTeX 数学公式
- ✅ Mermaid 流程图
- ✅ 多种布局模式
- ✅ 新建文件（支持模板）
- ✅ 另存为
- ✅ 导出功能（HTML/PDF/TXT）

## 快捷键
- \`Ctrl/Cmd + S\`: 保存文件
- \`Ctrl/Cmd + B\`: 加粗
- \`Ctrl/Cmd + I\`: 斜体
- \`Ctrl/Cmd + K\`: 插入链接

## 开始使用

点击工具栏的"新建"按钮创建新文件，或从左侧文件树打开现有文件。

开始编辑吧！`)
    }
  }, [])

  const loadFile = async (path) => {
    try {
      setStatus('正在加载...')
      const response = await fetch(`/api/file?path=${encodeURIComponent(path)}`)
      const data = await response.json()
      
      if (data.ok) {
        const fileContent = data.content || ''
        
        if (hasDraft(path, fileContent)) {
          const draft = getDraft(path)
          setPendingDraft(draft)
          setShowDraftDialog(true)
          setContent(fileContent)
        } else {
          setContent(fileContent)
          autoSave.reset()
        }
        
        setStatus(`已加载: ${path}`)
      } else {
        setStatus(`加载失败: ${data.message || data.code}`)
      }
    } catch (error) {
      setStatus('加载失败: 网络错误')
      console.error('Load file error:', error)
    }
  }

  const handleFileSelect = (filePath) => {
    setCurrentPath(filePath)
    loadFile(filePath)
  }

  const handleRecoverDraft = () => {
    if (pendingDraft) {
      setContent(pendingDraft.content)
      autoSave.reset()
      setStatus('已恢复草稿')
      setTimeout(() => setStatus('就绪'), 2000)
    }
    setShowDraftDialog(false)
    setPendingDraft(null)
  }

  const handleDiscardDraft = () => {
    if (pendingDraft) {
      clearDraft(pendingDraft.filePath)
      setStatus('已丢弃草稿')
      setTimeout(() => setStatus('就绪'), 2000)
    }
    setShowDraftDialog(false)
    setPendingDraft(null)
  }

  const handleNewFile = () => {
    setShowNewFileDialog(true)
  }

  const handleNewFileConfirm = (filePath, fileContent) => {
    setCurrentPath(filePath)
    setContent(fileContent)
    autoSave.reset()
    setStatus(`已创建: ${filePath}`)
    setTimeout(() => setStatus('就绪'), 2000)
  }

  const handleSaveAs = () => {
    setShowSaveAsDialog(true)
  }

  const handleSaveAsConfirm = async (newPath) => {
    const success = await saveFile(newPath)
    if (success) {
      setCurrentPath(newPath)
      autoSave.reset()
    }
  }

  const handleExport = () => {
    setShowExportDialog(true)
  }

  const handleSettings = () => {
    setShowSettingsDialog(true)
  }

  const renderMarkdown = useCallback(async () => {
    if (!previewRef.current) return

    let html = md.render(content)
    
    const mermaidRegex = /```mermaid\n([\s\S]*?)```/g
    let match
    let mermaidIndex = 0
    const mermaidBlocks = []
    
    while ((match = mermaidRegex.exec(content)) !== null) {
      const code = match[1]
      const id = `mermaid-${mermaidIndex++}`
      mermaidBlocks.push({ id, code })
      html = html.replace(
        /<pre><code class="language-mermaid">[\s\S]*?<\/code><\/pre>/,
        `<div class="mermaid" id="${id}">${code}</div>`
      )
    }

    previewRef.current.innerHTML = html

    // 只有在有 Mermaid 图表时才加载 Mermaid
    if (mermaidBlocks.length > 0) {
      try {
        if (!mermaidLoaded) {
          setStatus('正在加载 Mermaid...')
        }
        const mermaid = await loadMermaid()
        setMermaidLoaded(true)
        
        await mermaid.run({
          nodes: previewRef.current.querySelectorAll('.mermaid')
        })
        
        if (!mermaidLoaded) {
          setStatus('就绪')
        }
      } catch (err) {
        console.error('Mermaid render error:', err)
        setStatus('Mermaid 渲染失败')
        setTimeout(() => setStatus('就绪'), 2000)
      }
    }
  }, [content, mermaidLoaded])

  useEffect(() => {
    renderMarkdown()
  }, [renderMarkdown])

  useEffect(() => {
    if (layout === 'preview-only' || layout === 'horizontal' || layout === 'vertical') {
      const timer = setTimeout(() => {
        renderMarkdown()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [layout, renderMarkdown])

  const handleToolbarInsert = (before, after, mode) => {
    if (!editorRef.current) return

    const editor = editorRef.current
    const model = editor.getModel()
    const selection = editor.getSelection()
    const selectedText = model.getValueInRange(selection)

    let newText = ''
    let newSelection = null

    switch (mode) {
      case 'wrap':
        newText = `${before}${selectedText}${after}`
        newSelection = {
          startLineNumber: selection.startLineNumber,
          startColumn: selection.startColumn + before.length,
          endLineNumber: selection.endLineNumber,
          endColumn: selection.endColumn + before.length
        }
        break

      case 'line':
        const lineContent = model.getLineContent(selection.startLineNumber)
        newText = `${before}${lineContent}`
        editor.executeEdits('', [{
          range: {
            startLineNumber: selection.startLineNumber,
            startColumn: 1,
            endLineNumber: selection.startLineNumber,
            endColumn: lineContent.length + 1
          },
          text: newText
        }])
        editor.setPosition({
          lineNumber: selection.startLineNumber,
          column: before.length + 1
        })
        return

      case 'heading':
        const headingLine = model.getLineContent(selection.startLineNumber)
        const cleanLine = headingLine.replace(/^#+\s*/, '')
        newText = `${before}${cleanLine}`
        editor.executeEdits('', [{
          range: {
            startLineNumber: selection.startLineNumber,
            startColumn: 1,
            endLineNumber: selection.startLineNumber,
            endColumn: headingLine.length + 1
          },
          text: newText
        }])
        editor.setPosition({
          lineNumber: selection.startLineNumber,
          column: newText.length + 1
        })
        return

      case 'insert':
        newText = before
        break

      default:
        return
    }

    editor.executeEdits('', [{
      range: selection,
      text: newText
    }])

    if (newSelection) {
      editor.setSelection(newSelection)
    } else if (mode === 'insert') {
      const lines = newText.split('\n')
      const lastLine = lines[lines.length - 1]
      editor.setPosition({
        lineNumber: selection.startLineNumber + lines.length - 1,
        column: lastLine.length + 1
      })
    }

    editor.focus()
  }

  const handleEditorMount = (editor) => {
    editorRef.current = editor
    
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      autoSave.manualSave()
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => {
      handleToolbarInsert('**', '**', 'wrap')
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
      handleToolbarInsert('*', '*', 'wrap')
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      handleToolbarInsert('[', '](https://)', 'wrap')
    })
  }

  return (
    <div className={`app ${editorTheme === 'light' ? 'theme-light' : 'theme-dark'}`}>
      {showDraftDialog && (
        <DraftRecoveryDialog
          draft={pendingDraft}
          onRecover={handleRecoverDraft}
          onDiscard={handleDiscardDraft}
          onClose={() => setShowDraftDialog(false)}
        />
      )}

      {showNewFileDialog && (
        <NewFileDialog
          onClose={() => setShowNewFileDialog(false)}
          onConfirm={handleNewFileConfirm}
          rootDirs={rootDirs}
          theme={editorTheme}
        />
      )}

      {showSaveAsDialog && (
        <SaveAsDialog
          onClose={() => setShowSaveAsDialog(false)}
          onConfirm={handleSaveAsConfirm}
          rootDirs={rootDirs}
          currentPath={currentPath}
          theme={editorTheme}
        />
      )}

      {showExportDialog && (
        <ExportDialog
          onClose={() => setShowExportDialog(false)}
          content={content}
          currentPath={currentPath}
          theme={editorTheme}
          previewHtml={previewRef.current?.innerHTML}
        />
      )}

      {showSettingsDialog && (
        <SettingsDialog
          onClose={() => setShowSettingsDialog(false)}
          theme={editorTheme}
          autoSaveEnabled={autoSaveEnabled}
          onAutoSaveChange={setAutoSaveEnabled}
          onThemeChange={toggleEditorTheme}
        />
      )}

      <header className="toolbar">
        <div className="toolbar-left">
          <h1 className="title">Markdown 编辑器</h1>
          {currentPath && <span className="file-path">{currentPath}</span>}
        </div>
        
        <div className="toolbar-center">
          <button className="btn-icon" onClick={() => setLayout('horizontal')} title="水平布局">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="2" width="14" height="5" rx="1"/>
              <rect x="1" y="9" width="14" height="5" rx="1"/>
            </svg>
          </button>
          <button className="btn-icon" onClick={() => setLayout('vertical')} title="垂直布局">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="2" y="1" width="5" height="14" rx="1"/>
              <rect x="9" y="1" width="5" height="14" rx="1"/>
            </svg>
          </button>
          <button className="btn-icon" onClick={() => setLayout('editor-only')} title="仅编辑器">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="1" width="14" height="14" rx="1"/>
            </svg>
          </button>
          <button className="btn-icon" onClick={() => setLayout('preview-only')} title="仅预览">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="8" r="7"/>
            </svg>
          </button>
        </div>

        <div className="toolbar-right">
          <button className="btn-icon" onClick={handleNewFile} title="新建文件">
            新建
          </button>
          <button className="btn-icon" onClick={handleSaveAs} title="另存为" disabled={!content}>
            另存为
          </button>
          <button className="btn-icon" onClick={handleExport} title="导出" disabled={!content}>
            导出
          </button>
          <button 
            className={`btn-icon ${autoSaveEnabled ? 'active' : ''}`}
            onClick={() => setAutoSaveEnabled(!autoSaveEnabled)} 
            title={autoSaveEnabled ? '自动保存: 开启' : '自动保存: 关闭'}
          >
            {autoSaveEnabled ? '自动' : '手动'}
          </button>
          {autoSave.hasChanges && <span className="unsaved-indicator" title="有未保存的更改">●</span>}
          <button className="btn-icon" onClick={() => setShowFileTree(!showFileTree)} title="切换文件树">
            文件
          </button>
          <button className="btn-icon" onClick={handleSettings} title="设置">
            ⚙️
          </button>
          <button className="btn-icon" onClick={toggleEditorTheme} title={editorTheme === 'vs-dark' ? '切换到浅色模式' : '切换到深色模式'}>
            {editorTheme === 'vs-dark' ? '🌙' : '☀️'}
          </button>
          <button className="btn-primary" onClick={() => autoSave.manualSave()} disabled={!currentPath}>
            保存
          </button>
        </div>
      </header>

      <main className={`main-content layout-${layout} ${showFileTree ? 'with-filetree' : ''}`}>
        {showFileTree && (
          <FileTree onFileSelect={handleFileSelect} currentPath={currentPath} />
        )}
        {(layout === 'horizontal' || layout === 'vertical' || layout === 'editor-only') && (
          <div className="editor-pane">
            <EditorToolbar 
              onInsert={handleToolbarInsert} 
              disabled={!editorRef.current}
            />
            <Editor
              height="100%"
              defaultLanguage="markdown"
              theme={editorTheme}
              value={content}
              onChange={(value) => setContent(value || '')}
              onMount={handleEditorMount}
              options={{
                fontSize: 14,
                lineHeight: 24,
                minimap: { enabled: false },
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontLigatures: true
              }}
            />
          </div>
        )}

        {(layout === 'horizontal' || layout === 'vertical' || layout === 'preview-only') && (
          <div className="preview-pane">
            <div 
              ref={previewRef}
              className="markdown-body"
            />
          </div>
        )}
      </main>

      <footer className="statusbar">
        <span className="status-text">{status}</span>
        <span className="status-info">
          {content.length} 字符 · {content.split('\n').length} 行
          {autoSave.hasChanges && ' · 未保存'}
        </span>
      </footer>
    </div>
  )
}

export default App
