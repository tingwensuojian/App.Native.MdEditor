import React from 'react'
import * as Icons from 'lucide-react'

export default function QuickCommand({ command, onClick, disabled }) {
  const Icon = Icons[command.icon] || Icons.Sparkles
  
  return (
    <button
      className="quick-command-btn"
      onClick={onClick}
      disabled={disabled}
      title={command.template}
    >
      <Icon size={14} className="command-icon" />
      <span className="command-label">{command.label}</span>
    </button>
  )
}
