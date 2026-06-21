import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Check, X, AlertTriangle, Info } from 'lucide-react'
import './Toast.css'

/**
 * Toast 通知组件
 */
function Toast({ message, type = 'info', duration = 3000, onClose }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => {
        onClose && onClose()
      }, 300)
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  const getIcon = () => {
    switch(type) {
      case 'success': return <Check size={18} />
      case 'error': return <X size={18} />
      case 'warning': return <AlertTriangle size={18} />
      case 'info': return <Info size={18} />
      default: return <Info size={18} />
    }
  }

  return (
    <div className={`toast toast-${type} ${visible ? 'toast-visible' : 'toast-hidden'}`}>
      <span className="toast-icon">{getIcon()}</span>
      <span className="toast-message">{message}</span>
    </div>
  )
}

/**
 * Toast 容器组件
 */
export function ToastContainer({ toasts, onRemove }) {
  return createPortal(
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>,
    document.body
  )
}

export default Toast

