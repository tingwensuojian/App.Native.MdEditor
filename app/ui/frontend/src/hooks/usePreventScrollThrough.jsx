import { useEffect } from 'react'

/**
 * 防止滚动穿透 Hook
 * 当滚动到容器边界时，阻止滚动事件传播到父容器
 * 
 * @param {React.RefObject} ref - 滚动容器的 ref
 */
export const usePreventScrollThrough = (ref) => {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    
    let startY = 0
    let startX = 0
    
    const handleTouchStart = (e) => {
      startY = e.touches[0].pageY
      startX = e.touches[0].pageX
    }
    
    const handleTouchMove = (e) => {
      const { scrollTop, scrollHeight, clientHeight, scrollLeft, scrollWidth, clientWidth } = element
      const currentY = e.touches[0].pageY
      const currentX = e.touches[0].pageX
      
      const isScrollingUp = currentY > startY
      const isScrollingDown = currentY < startY
      const isScrollingLeft = currentX > startX
      const isScrollingRight = currentX < startX
      
      // 垂直滚动边界检测
      const atTop = scrollTop === 0
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 // -1 for rounding
      
      // 水平滚动边界检测
      const atLeft = scrollLeft === 0
      const atRight = scrollLeft + clientWidth >= scrollWidth - 1
      
      // 在顶部且向下滑动，或在底部且向上滑动时，阻止默认行为
      if ((atTop && isScrollingUp) || (atBottom && isScrollingDown)) {
        e.preventDefault()
        return
      }
      
      // 在左边且向右滑动，或在右边且向左滑动时，阻止默认行为
      if ((atLeft && isScrollingLeft) || (atRight && isScrollingRight)) {
        e.preventDefault()
        return
      }
    }
    
    // touchstart 使用 passive: true 提升性能
    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    
    // touchmove 需要 passive: false 才能调用 preventDefault()
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    
    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
    }
  }, [ref])
}

export default usePreventScrollThrough
