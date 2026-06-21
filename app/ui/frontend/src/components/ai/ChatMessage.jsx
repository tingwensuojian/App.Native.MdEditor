import React from 'react'
import { User, Bot, TextQuote, RefreshCw, Copy } from 'lucide-react'
import { useAppUi } from '../../context/AppUiContext'

const QUOTE_START = '【引用】'
const QUOTE_END = '【/引用】'
const QUOTED_SUMMARY_MAX_LEN = 50

function parseUserMessageWithQuote(content) {
  if (!content || typeof content !== 'string') return null
  const startIdx = content.indexOf(QUOTE_START)
  if (startIdx === -1) return null
  const afterStart = content.slice(startIdx + QUOTE_START.length)
  const endIdx = afterStart.indexOf(QUOTE_END)
  if (endIdx === -1) return null
  const quoted = afterStart.slice(0, endIdx).trim()
  const userText = afterStart.slice(endIdx + QUOTE_END.length).replace(/^\s*\n+/, '').trim()
  return { quoted, userText }
}

export default function ChatMessage({
  message,
  index,
  isLastAssistant,
  onQuote,
  onRegenerate,
  onScrollToMessage,
  isStreaming,
  isAlreadyQuoted = false,
}) {
  const isUser = message.role === 'user'
  const isError = message.error
  const { showToast } = useAppUi()

  const handleCopy = () => {
    const text = message.content || ''
    if (!text) return

    const doCopy = () => {
      if (navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(text).then(
          () => { showToast?.('已复制到剪贴板', 'success'); return true },
          () => false
        )
      }
      // 降级：使用 execCommand（非 HTTPS 或部分环境 clipboard API 不可用）
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      ta.style.top = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        if (ok) showToast?.('已复制到剪贴板', 'success')
        return Promise.resolve(ok)
      } catch (e) {
        document.body.removeChild(ta)
        return Promise.resolve(false)
      }
    }

    doCopy().then((ok) => {
      if (!ok) showToast?.('复制失败', 'error')
    })
  }

  const handleQuote = () => {
    const text = message.content || ''
    if (text && onQuote) onQuote(text, index)
  }

  const handleRegenerate = () => {
    if (onRegenerate && isLastAssistant && !isStreaming) onRegenerate(index)
  }

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'} ${isError ? 'error' : ''}`}>
      <div className="message-avatar">
        {isUser ? <User size={20} /> : <Bot size={20} />}
      </div>
      <div className="message-content">
        {/* 推理过程（DeepSeek R1） */}
        {message.reasoning && (
          <div className="message-reasoning">
            <details>
              <summary>💭 推理过程</summary>
              <pre>{message.reasoning}</pre>
            </details>
          </div>
        )}

        {/* 消息内容 */}
        <div className="message-text">
          {isUser ? (() => {
            const content = message.content || ''
            const parsed = parseUserMessageWithQuote(content)
            if (parsed) {
              const firstLine = (parsed.quoted.split('\n')[0] || '').trim()
              const summary = firstLine.length > QUOTED_SUMMARY_MAX_LEN
                ? `${firstLine.slice(0, QUOTED_SUMMARY_MAX_LEN)}…`
                : firstLine
              const quotedFromIndex = message.quotedFromIndex
              const handleQuoteBlockClick = quotedFromIndex != null && onScrollToMessage
                ? () => onScrollToMessage(quotedFromIndex)
                : undefined
              return (
                <>
                  <div
                    className={`message-quoted-block${handleQuoteBlockClick ? ' message-quoted-block-clickable' : ''}`}
                    onClick={handleQuoteBlockClick}
                    role={handleQuoteBlockClick ? 'button' : undefined}
                    tabIndex={handleQuoteBlockClick ? 0 : undefined}
                    onKeyDown={handleQuoteBlockClick ? (e) => e.key === 'Enter' && handleQuoteBlockClick() : undefined}
                    title={handleQuoteBlockClick ? '点击跳转到被引用的对话' : undefined}
                  >
                    <span className="message-quoted-preview">{summary}</span>
                  </div>
                  {parsed.userText && <div className="message-user-text">{parsed.userText}</div>}
                </>
              )
            }
            return content || (message.done ? '' : '正在思考...')
          })() : (message.content || (message.done ? '' : '正在思考...'))}
        </div>

        {/* AI 回复操作：引用、重新生成、复制 */}
        {!isUser && message.done && !message.error && (
          <div className="message-actions">
            {onQuote && (
              <button
                type="button"
                className="message-action-btn"
                onClick={handleQuote}
                disabled={isAlreadyQuoted}
                title={isAlreadyQuoted ? '该条已引用' : '引用到输入框，供下一条消息使用'}
              >
                <TextQuote size={14} />
                <span>引用</span>
              </button>
            )}
            {isLastAssistant && onRegenerate && (
              <button
                type="button"
                className="message-action-btn"
                onClick={handleRegenerate}
                disabled={isStreaming}
                title="重新生成"
              >
                <RefreshCw size={14} />
                <span>重新生成</span>
              </button>
            )}
            <button type="button" className="message-action-btn" onClick={handleCopy} title="复制">
              <Copy size={14} />
              <span>复制</span>
            </button>
          </div>
        )}

        {/* 时间戳 */}
        {message.timestamp && (
          <div className="message-timestamp">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  )
}
