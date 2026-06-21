// 轻量级编辑器 - 移动端使用
// 替代 Monaco Editor，减少首屏加载

import React, { useRef, useEffect } from 'react'
import './LightweightEditor.css'

const LightweightEditor = ({ 
  value, 
  onChange, 
  language = 'markdown',
  theme = 'light',
  options = {}
}) => {
  const textareaRef = useRef(null)
  
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.value = value || ''
    }
  }, [value])
  
  const handleChange = (e) => {
    if (onChange) {
      onChange(e.target.value)
    }
  }
  
  const handleTab = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const start = e.target.selectionStart
      const end = e.target.selectionEnd
      const value = e.target.value
      
      e.target.value = value.substring(0, start) + '  ' + value.substring(end)
      e.target.selectionStart = e.target.selectionEnd = start + 2
      
      handleChange(e)
    }
  }
  
  return (
    <div className={`lightweight-editor lightweight-editor-${theme}`}>
      <textarea
        ref={textareaRef}
        className="lightweight-editor-textarea"
        defaultValue={value}
        onChange={handleChange}
        onKeyDown={handleTab}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="开始输入 Markdown..."
        {...options}
      />
    </div>
  )
}

export default LightweightEditor
