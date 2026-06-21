import React from 'react'
import { createPortal } from 'react-dom'
import { X, Settings, Plus, FolderOpen, MessageSquare, Image as ImageIcon, Trash2, Loader2, Hand, Send, Square, Check, TextQuote, ChevronDown, ChevronUp, Search } from 'lucide-react'
import ChatMessage from './ChatMessage'
import QuickCommand from './QuickCommand'
import Resizer from '../Resizer'
import { AI_SERVICES, DEFAULT_QUICK_COMMANDS } from '../../constants/aiConfig'
import { formatHistoryTime } from '../../utils/fileHistoryManagerV2'

const INPUT_HEIGHT_MIN = 80
const INPUT_HEIGHT_MAX = 400
const INPUT_HEIGHT_DEFAULT = 180
const QUOTE_START = '【引用】'
const QUOTE_END = '【/引用】'

export default function AIChatPanel({
  config,
  onConfigChange,
  messages,
  isStreaming,
  quoteFullContent,
  onSendMessage,
  onStopGeneration,
  onNewConversation,
  onLoadConversation,
  onDeleteConversation,
  onGetAllConversations,
  onToggleQuoteFullContent,
  onOpenConfig,
  onClose,
  onSwitchToImage,
  autoQuickCommandId,
  onConsumeAutoQuickCommand,
  getEditorContent,
  getSelectedText,
  onInsertText,
  onRegenerateReply,
}) {
  const [input, setInput] = React.useState('')
  const [quotedBlocks, setQuotedBlocks] = React.useState([])
  const [fullContentPreview, setFullContentPreview] = React.useState('')
  const [showConversations, setShowConversations] = React.useState(false)
  const [conversations, setConversations] = React.useState([])
  const [loadingConversations, setLoadingConversations] = React.useState(false)
  const [showModelSwitcher, setShowModelSwitcher] = React.useState(false)
  const [modelSearch, setModelSearch] = React.useState('')
  const [modelSwitcherPosition, setModelSwitcherPosition] = React.useState({ bottom: 0, left: 0 })
  const [modelSwitcherPositionReady, setModelSwitcherPositionReady] = React.useState(false)
  const [inputAreaHeight, setInputAreaHeight] = React.useState(INPUT_HEIGHT_DEFAULT)
  const messagesEndRef = React.useRef(null)
  const inputRef = React.useRef(null)
  const modelSwitcherRef = React.useRef(null)
  const modelSwitcherButtonRef = React.useRef(null)
  const modelSwitcherPopoverRef = React.useRef(null)

  const currentService = AI_SERVICES.find((s) => s.value === config?.type)
  // 所有已启用服务商下已启用的模型（与 AIConfigPanel 一致；当前使用的服务在对话区此处选择）
  const connectableModels = React.useMemo(() => {
    const disabled = new Set(config?.disabledProviders || [])
    const verified = config?.verifiedModelsByService || {}
    return AI_SERVICES.flatMap((s) => {
      if (disabled.has(s.value)) return []
      const list = verified[s.value] || []
      if (s.value !== 'builtin' && list.length === 0) return []
      return list.map((model) => ({ serviceType: s.value, serviceLabel: s.label, model }))
    })
  }, [config?.disabledProviders, config?.verifiedModelsByService])
  const filteredModels = React.useMemo(() => {
    if (!modelSearch.trim()) return connectableModels
    const q = modelSearch.trim().toLowerCase()
    return connectableModels.filter(
      (item) =>
        item.model.toLowerCase().includes(q) || item.serviceLabel.toLowerCase().includes(q)
    )
  }, [connectableModels, modelSearch])

  // 按服务商分组，用于分组展示
  const groupedByService = React.useMemo(() => {
    const map = new Map()
    for (const item of filteredModels) {
      const key = item.serviceType
      if (!map.has(key)) map.set(key, { serviceType: item.serviceType, serviceLabel: item.serviceLabel, models: [] })
      map.get(key).models.push(item.model)
    }
    return Array.from(map.values())
  }, [filteredModels])

  const currentModel = config?.model || ''
  const isCurrentModelAvailable = connectableModels.some((m) => m.model === currentModel)
  const displayModelLabel = connectableModels.length === 0 || !isCurrentModelAvailable ? '选择模型' : (currentModel || '选择模型')

  const handleInputResize = React.useCallback((delta) => {
    setInputAreaHeight((h) => Math.min(INPUT_HEIGHT_MAX, Math.max(INPUT_HEIGHT_MIN, h - delta)))
  }, [])

  const refreshFullContentPreview = React.useCallback(() => {
    if (!quoteFullContent || !getEditorContent) return
    try {
      const content = getEditorContent()
      const firstLine = (typeof content === 'string' ? content : '').split('\n')[0] || ''
      const preview = firstLine.length > 50 ? `${firstLine.slice(0, 50)}…` : firstLine
      setFullContentPreview(preview || '（空）')
    } catch {
      setFullContentPreview('（无法获取）')
    }
  }, [quoteFullContent, getEditorContent])

  // 引用全文启用时，获取编辑器内容预览
  React.useEffect(() => {
    if (quoteFullContent && getEditorContent) {
      refreshFullContentPreview()
    } else {
      setFullContentPreview('')
    }
  }, [quoteFullContent, getEditorContent, refreshFullContentPreview])

  // 打开历史面板时加载列表
  React.useEffect(() => {
    if (showConversations && onGetAllConversations) {
      setLoadingConversations(true)
      onGetAllConversations()
        .then(setConversations)
        .catch(() => setConversations([]))
        .finally(() => setLoadingConversations(false))
    }
  }, [showConversations, onGetAllConversations])

  // 外部请求：自动选中快捷指令（用于“帮我写主题”一键打开）
  React.useEffect(() => {
    if (!autoQuickCommandId) return
    const command = DEFAULT_QUICK_COMMANDS.find((c) => c.id === autoQuickCommandId)
    if (command) {
      handleQuickCommand(command)
    }
    onConsumeAutoQuickCommand?.()
  }, [autoQuickCommandId, onConsumeAutoQuickCommand])

  // 浮框位置：使用 bottom 锚定按钮上方，避免内容较少（如无匹配模型）时下拉框与按钮间距过大
  React.useLayoutEffect(() => {
    if (!showModelSwitcher) {
      setModelSwitcherPositionReady(false)
      return
    }
    if (!modelSwitcherButtonRef.current) return
    const rect = modelSwitcherButtonRef.current.getBoundingClientRect()
    const dropdownWidth = 280
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - dropdownWidth - 8))
    const bottom = window.innerHeight - rect.top + 8
    setModelSwitcherPosition({ bottom, left })
    setModelSwitcherPositionReady(true)
  }, [showModelSwitcher])

  // 点击外部关闭模型切换弹窗（点击按钮或浮框内部不关）
  React.useEffect(() => {
    if (!showModelSwitcher) return
    const onDocClick = (e) => {
      const inButton = modelSwitcherButtonRef.current?.contains(e.target)
      const inPopover = modelSwitcherPopoverRef.current?.contains(e.target)
      if (!inButton && !inPopover) setShowModelSwitcher(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('touchstart', onDocClick, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('touchstart', onDocClick)
    }
  }, [showModelSwitcher])

  // 自动滚动到底部
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 处理发送（引用块 + 输入文本；引用全文时从编辑器实时获取）
  // 含引用时使用 【引用】...【/引用】 标记，便于展示时解析
  const handleSend = () => {
    const quoted = quotedBlocks.map((b) => b.content).join('\n\n')
    const userText = input.trim()
    let finalContent
    if (quoted && userText) {
      finalContent = `${QUOTE_START}\n${quoted}\n${QUOTE_END}\n\n${userText}`
    } else if (quoted) {
      finalContent = `${QUOTE_START}\n${quoted}\n${QUOTE_END}`
    } else {
      finalContent = userText
    }
    if (!finalContent || isStreaming) return

    const fullContent = quoteFullContent && getEditorContent ? getEditorContent() : null
    const quotedFromIndex = quotedBlocks[0]?.sourceIndex ?? null
    onSendMessage(finalContent, fullContent, quotedFromIndex)
    setInput('')
    setQuotedBlocks([])
  }

  // 引用全文启用时，清空其他引用块（只同时引用一个）
  React.useEffect(() => {
    if (quoteFullContent) setQuotedBlocks([])
  }, [quoteFullContent])

  // 处理快捷指令：将提示词作为引用块插入，不写入编辑区（只同时引用一个，会替换已有引用）
  // 若已启用引用全文，则保留引用全文，将提示词放入输入框，便于对全文执行润色/翻译等操作
  const handleQuickCommand = (command) => {
    const text = (getSelectedText ? getSelectedText() : '') || ''
    let prompt = command.template.replace('{{sel}}', text)

    if (command.id === 'write-theme') {
      prompt += '\n\n再次强调：最终回复只能是纯 CSS 主题内容，禁止出现任何说明性文字。'
    }
    if (quoteFullContent) {
      // 引用全文 + 快捷指令：保留引用全文，提示词放入输入框
      setInput(prompt)
      setQuotedBlocks([])
    } else {
      // 无引用全文时：提示词作为引用块
      onToggleQuoteFullContent?.(false)
      setQuotedBlocks([
        {
          id: crypto.randomUUID?.() ?? `q-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          content: prompt,
          sourceIndex: null,
        },
      ])
      setInput('')
    }
    // 内容较长时自动展开输入区，便于查看引用块
    const lineCount = (prompt.match(/\n/g) || []).length + 1
    if (lineCount > 6) {
      const neededHeight = Math.min(INPUT_HEIGHT_MAX, 120 + lineCount * 22)
      setInputAreaHeight((h) => Math.max(h, neededHeight))
    }
    inputRef.current?.focus()
  }

  // 引用 AI 回复为独立块，插入输入框上方（只同时引用一个，会替换已有引用；可点击 × 移除）
  const handleQuoteToInput = (text, sourceIndex) => {
    if (!text) return
    onToggleQuoteFullContent?.(false)
    setQuotedBlocks([
      {
        id: crypto.randomUUID?.() ?? `q-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        content: text,
        sourceIndex: typeof sourceIndex === 'number' ? sourceIndex : null,
      },
    ])
    inputRef.current?.focus()
  }

  const removeQuotedBlock = (id) => {
    setQuotedBlocks((prev) => prev.filter((b) => b.id !== id))
  }

  // 点击引用全文时：若当前有引用块（来自快捷指令），先将其内容移入输入框，再启用引用全文
  const handleToggleQuoteFull = () => {
    if (!quoteFullContent && quotedBlocks.length > 0) {
      const prompt = quotedBlocks.map((b) => b.content).join('\n\n')
      setInput(prompt)
      setQuotedBlocks([])
    }
    onToggleQuoteFullContent?.(!quoteFullContent)
  }

  const scrollToMessage = (index) => {
    const el = document.getElementById(`ai-message-${index}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // 处理键盘事件
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="ai-chat-panel">
      {/* 头部 */}
      <div className="ai-chat-header">
        <div className="ai-chat-title">
          <MessageSquare size={20} />
          <h3>AI 对话</h3>
        </div>
        <div className="ai-chat-actions">
          <button
            className="ai-icon-btn"
            onClick={onOpenConfig}
            title="配置"
          >
            <Settings size={18} />
          </button>
          <button
            className="ai-icon-btn"
            onClick={onSwitchToImage || (() => setShowConversations(!showConversations))}
            title={onSwitchToImage ? 'AI 文生图' : '历史会话'}
          >
            <ImageIcon size={18} />
          </button>
          <button
            className="ai-icon-btn"
            onClick={onNewConversation}
            title="新建会话"
          >
            <Plus size={18} />
          </button>
          <button
            className="ai-icon-btn"
            onClick={() => setShowConversations(!showConversations)}
            title="历史会话"
          >
            <FolderOpen size={18} />
          </button>
          <button
            className="ai-icon-btn"
            onClick={onClose}
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 快捷指令 */}
      <div className="ai-quick-commands">
        {DEFAULT_QUICK_COMMANDS.map((cmd) => (
          <QuickCommand
            key={cmd.id}
            command={cmd}
            onClick={() => handleQuickCommand(cmd)}
            disabled={isStreaming}
          />
        ))}
      </div>

      {/* 消息列表 */}
      <div className="ai-messages">
        {messages.length === 0 ? (
          <div className="ai-empty-state">
            <p><Hand size={18} className="ai-empty-icon" /> 你好！我是 AI 助手</p>
            <p>我可以帮你润色、翻译、总结文章</p>
            <p>选择快捷指令或直接输入问题开始对话</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} id={`ai-message-${index}`} className="ai-message-item">
              <ChatMessage
                message={msg}
                index={index}
                isLastAssistant={msg.role === 'assistant' && index === messages.length - 1}
                onQuote={handleQuoteToInput}
                onRegenerate={onRegenerateReply}
                onScrollToMessage={scrollToMessage}
                isStreaming={isStreaming}
                isAlreadyQuoted={quotedBlocks.some((b) => b.sourceIndex === index)}
              />
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 拉动条：上拉可放大输入框 */}
      <Resizer direction="horizontal" onResize={handleInputResize} />

      {/* 输入区：引用全文和发送按钮置于输入框内底部 */}
      <div className="ai-input-area" style={{ height: inputAreaHeight, minHeight: INPUT_HEIGHT_MIN }}>
        <div className="ai-input-box">
          <div className="ai-input-content">
            {(quoteFullContent || quotedBlocks.length > 0) && (
              <div className="ai-quoted-blocks">
                {quoteFullContent && (
                  <div className="ai-quoted-block ai-quoted-block-full">
                    <TextQuote size={14} className="ai-quoted-block-icon" />
                    <span className="ai-quoted-block-preview" title={fullContentPreview || undefined}>
                      引用全文
                    </span>
                    <button
                      type="button"
                      className="ai-quoted-block-remove"
                      onClick={() => onToggleQuoteFullContent(false)}
                      title="取消引用全文"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                {quotedBlocks.map((block) => {
                  const firstLine = block.content.split('\n')[0] || ''
                  const preview = firstLine.length > 50 ? `${firstLine.slice(0, 50)}…` : firstLine
                  return (
                    <div key={block.id} className="ai-quoted-block">
                      <span className="ai-quoted-block-preview">{preview}</span>
                      <button
                        type="button"
                        className="ai-quoted-block-remove"
                        onClick={() => removeQuotedBlock(block.id)}
                        title="移除引用"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="ai-input-text">
              <textarea
                ref={inputRef}
                className="ai-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={refreshFullContentPreview}
                placeholder="说些什么... (Enter 发送，Shift+Enter 换行)"
                disabled={isStreaming}
                rows={3}
              />
            </div>
          </div>
          <div className="ai-input-footer">
            <button
              type="button"
              className={`ai-quote-full-btn${quoteFullContent ? ' active' : ''}`}
              onClick={handleToggleQuoteFull}
              title={quoteFullContent ? '已启用引用全文' : '引用全文'}
            >
              {quoteFullContent ? <Check size={14} /> : <TextQuote size={14} />}
              <span>引用全文</span>
            </button>
            {config && onConfigChange && (
              <div className="ai-model-switcher-wrap" ref={modelSwitcherRef}>
                <button
                  ref={modelSwitcherButtonRef}
                  type="button"
                  className="ai-model-switcher-btn"
                  onClick={() => { setShowModelSwitcher((v) => !v); setModelSearch('') }}
                  title="切换模型"
                >
                  <span className="ai-model-switcher-label">{displayModelLabel}</span>
                  {showModelSwitcher ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showModelSwitcher && modelSwitcherPositionReady && createPortal(
                  <div
                    role="dialog"
                    aria-label="切换模型"
                    className={`ai-model-switcher-dropdown ${document.querySelector('.app')?.classList.contains('theme-light') ? 'theme-light' : 'theme-dark'}`}
                    style={{
                      position: 'fixed',
                      bottom: modelSwitcherPosition.bottom,
                      left: modelSwitcherPosition.left,
                      zIndex: 9999,
                      width: 280,
                      maxHeight: 320,
                    }}
                  >
                    <div
                      ref={modelSwitcherPopoverRef}
                      className="ai-model-switcher-popover ai-model-switcher-popover-fixed"
                    >
                      <div className="ai-model-switcher-search">
                        <Search size={16} />
                        <input
                          type="text"
                          placeholder="搜索模型"
                          value={modelSearch}
                          onChange={(e) => setModelSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="ai-model-switcher-list">
                        {groupedByService.length === 0 ? (
                          <div className="ai-model-switcher-empty">无匹配模型</div>
                        ) : (
                          groupedByService.map((group) => (
                            <div key={group.serviceType} className="ai-model-switcher-group">
                              <div className="ai-model-switcher-group-title">{group.serviceLabel}</div>
                              {group.models.map((model) => (
                                <button
                                  key={`${group.serviceType}:${model}`}
                                  type="button"
                                  className={`ai-model-switcher-item${config?.type === group.serviceType && currentModel === model ? ' active' : ''}`}
                                  onClick={() => {
                                    onConfigChange({ type: group.serviceType, model })
                                    setShowModelSwitcher(false)
                                  }}
                                >
                                  <span className="ai-model-switcher-item-label">{model}</span>
                                  {config?.type === group.serviceType && currentModel === model && <Check size={16} />}
                                </button>
                              ))}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>,
                  document.body
                )}
              </div>
            )}
            <button
              className="ai-send-btn"
              onClick={isStreaming ? onStopGeneration : handleSend}
              disabled={(!input.trim() && quotedBlocks.length === 0 && !quoteFullContent) || isStreaming}
            >
              {isStreaming ? (
                <>
                  <Square size={14} />
                  <span>停止</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>发送</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 历史会话列表 */}
      {showConversations && (
        <div className="ai-conversations-overlay" onClick={() => setShowConversations(false)}>
          <div className="ai-conversations-panel" onClick={(e) => e.stopPropagation()}>
            <div className="ai-conversations-header">
              <h4>历史会话</h4>
              <button onClick={() => setShowConversations(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="ai-conversations-list">
              {loadingConversations ? (
                <div className="ai-conversations-loading">
                  <Loader2 size={20} className="spin" />
                  加载中...
                </div>
              ) : conversations.length === 0 ? (
                <div className="ai-conversations-empty">暂无历史会话</div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className="ai-conversations-item"
                    onClick={() => {
                      onLoadConversation(conv.id)
                      setShowConversations(false)
                    }}
                  >
                    <div className="ai-conversations-item-content">
                      <div className="ai-conversations-item-title">{conv.title || '新对话'}</div>
                      <div className="ai-conversations-item-time">{formatHistoryTime(conv.timestamp)}</div>
                    </div>
                    <div className="ai-conversations-item-actions">
                      <button
                        title="删除"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteConversation(conv.id)
                          setConversations((prev) => prev.filter((c) => c.id !== conv.id))
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
