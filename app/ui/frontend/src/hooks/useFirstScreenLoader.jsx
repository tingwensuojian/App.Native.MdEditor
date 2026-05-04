// 首屏加载管理 Hook
// 用于控制首屏加载动画的显示和隐藏

import { useState, useEffect } from 'react'

/**
 * 移动端优化的首屏加载 Hook
 * 等待主应用完全准备好后再隐藏加载动画
 */
export const useMobileFirstScreenLoader = (enabled = true) => {
  // 立即设置为 true，确保首次渲染就显示加载动画
  const [isLoading, setIsLoading] = useState(() => !!enabled)
  const [loadingMessage, setLoadingMessage] = useState('正在初始化编辑环境')
  
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false)
      return undefined
    }

    let mounted = true
    
    const init = async () => {
      try {
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
        const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        // 对齐动画时长：描边约 2.5s + 文案淡入延迟 3s（持续 1.5s）
        // 给缓冲后，确保完整看到主要动画再退出
        const minTime = prefersReducedMotion ? 1600 : (isMobile ? 4800 : 5600)
        const startTime = Date.now()
        
        // 阶段 1：快速显示加载动画
        setLoadingMessage('正在加载核心资源')
        
        // 立即检查，不等待
        await new Promise(resolve => setTimeout(resolve, 100))
        
        if (!mounted) return
        
        // 阶段 2：等待 DOM 加载（如果还没加载完）
        if (document.readyState !== 'complete') {
          setLoadingMessage('正在初始化编辑器')
          await new Promise(resolve => {
            if (document.readyState === 'complete') {
              resolve()
            } else {
              window.addEventListener('load', resolve, { once: true })
            }
          })
        }
        
        if (!mounted) return
        
        // 阶段 3：等待关键元素渲染完成（快速检查）
        setLoadingMessage('准备就绪')
        let attempts = 0
        const maxAttempts = 30 // 减少到 3 秒
        
        while (attempts < maxAttempts && mounted) {
          const appElement = document.querySelector('.app')
          const editorElement = document.querySelector('.editor-container') || 
                               document.querySelector('.monaco-editor') ||
                               document.querySelector('textarea')
          
          if (appElement && (editorElement || attempts > 10)) {
            break
          }
          
          await new Promise(resolve => setTimeout(resolve, 100))
          attempts++
        }
        
        if (!mounted) return
        
        // 阶段 4：确保至少显示了最小时间
        const elapsed = Date.now() - startTime
        if (elapsed < minTime) {
          await new Promise(resolve => setTimeout(resolve, minTime - elapsed))
        }
        
        if (!mounted) return
        
        // 额外缓冲，避免动画刚到尾帧就切走
        await new Promise(resolve => setTimeout(resolve, 350))
        
        if (!mounted) return
        
        setIsLoading(false)
      } catch (error) {
        console.error('首屏加载失败:', error)
        // 即使出错也要隐藏加载动画，避免永久白屏
        if (mounted) {
          setTimeout(() => setIsLoading(false), 500)
        }
      }
    }
    
    init()
    
    return () => {
      mounted = false
    }
  }, [enabled])
  
  return { isLoading, loadingMessage }
}
