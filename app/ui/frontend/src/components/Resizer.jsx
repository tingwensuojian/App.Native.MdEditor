import React, { useCallback, useEffect, useRef } from 'react'
import './Resizer.css'

/**
 * 可拖拽的分隔条组件
 * @param {string} direction - 'vertical' 或 'horizontal'
 * @param {function} onResize - 拖拽时的回调函数，参数为拖拽的偏移量
 */
function Resizer({ direction = 'vertical', onResize }) {
  const isResizing = useRef(false)
  const startPos = useRef(0)
  const activePointerId = useRef(null)

  const resetResizeState = useCallback(() => {
    isResizing.current = false
    activePointerId.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  const handlePointerDown = useCallback((e) => {
    if (!e.isPrimary) return
    if (e.pointerType === 'mouse' && e.button !== 0) return

    e.preventDefault()
    isResizing.current = true
    activePointerId.current = e.pointerId
    startPos.current = direction === 'vertical' ? e.clientX : e.clientY
    document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }, [direction])

  const handlePointerMove = useCallback((e) => {
    if (!isResizing.current) return
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
    
    const currentPos = direction === 'vertical' ? e.clientX : e.clientY
    const delta = currentPos - startPos.current
    
    if (onResize) {
      onResize(delta)
    }
    
    startPos.current = currentPos
  }, [direction, onResize])

  const handlePointerUp = useCallback((e) => {
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
    resetResizeState()
  }, [resetResizeState])

  const handlePointerCancel = useCallback((e) => {
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
    resetResizeState()
  }, [resetResizeState])

  useEffect(() => {
    return () => {
      resetResizeState()
    }
  }, [resetResizeState])

  return (
    <div 
      className={`resizer resizer-${direction}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="resizer-handle" />
    </div>
  )
}

// 使用 React.memo 优化性能
export default React.memo(Resizer)

