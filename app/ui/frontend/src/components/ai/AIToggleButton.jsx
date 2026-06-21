import React from 'react'
import { Bot, X } from 'lucide-react'

export default function AIToggleButton({ isOpen, onClick }) {
  return (
    <button
      className={`ai-toggle-btn ${isOpen ? 'open' : ''}`}
      onClick={onClick}
      title={isOpen ? '关闭 AI 助手' : '打开 AI 助手'}
    >
      {isOpen ? <X size={24} /> : <Bot size={24} />}
      {!isOpen && <span className="ai-toggle-label">AI</span>}
    </button>
  )
}
