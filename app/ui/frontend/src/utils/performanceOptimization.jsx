// 性能优化工具集
// 用于移动端和桌面端的性能优化

/**
 * 检测设备类型
 */
export const isMobile = () => {
  if (typeof window === 'undefined') return false

  // Treat mobile as phone-sized viewports; avoid classifying iPad as mobile by UA.
  const mq = window.matchMedia?.('(max-width: 767px)')
  if (mq?.matches) return true

  // UA fallback: keep large phones in landscape treated as mobile.
  const ua = navigator?.userAgent || ''
  return /iPhone|iPod|Android.*Mobile|IEMobile|Opera Mini/i.test(ua)
}

export const isTablet = () => {
  return window.innerWidth >= 768 && window.innerWidth < 1024
}

export const isTouchDevice = () => {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

/**
 * 懒加载组件包装器
 */
export const lazyLoadComponent = (importFunc, fallback = null) => {
  const LazyComponent = React.lazy(importFunc)
  
  return (props) => (
    <React.Suspense fallback={fallback || <div className="loading">加载中...</div>}>
      <LazyComponent {...props} />
    </React.Suspense>
  )
}

/**
 * 图片懒加载 Hook
 */
export const useImageLazyLoad = (ref) => {
  const [isVisible, setIsVisible] = React.useState(false)
  
  React.useEffect(() => {
    if (!ref.current) return
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '50px' }
    )
    
    observer.observe(ref.current)
    
    return () => observer.disconnect()
  }, [ref])
  
  return isVisible
}

/**
 * 虚拟滚动 Hook
 */
export const useVirtualScroll = (items, itemHeight, containerHeight) => {
  const [scrollTop, setScrollTop] = React.useState(0)
  
  const visibleStart = Math.floor(scrollTop / itemHeight)
  const visibleEnd = Math.ceil((scrollTop + containerHeight) / itemHeight)
  
  const visibleItems = items.slice(
    Math.max(0, visibleStart - 5),
    Math.min(items.length, visibleEnd + 5)
  )
  
  const offsetY = Math.max(0, visibleStart - 5) * itemHeight
  
  return {
    visibleItems,
    offsetY,
    totalHeight: items.length * itemHeight,
    onScroll: (e) => setScrollTop(e.target.scrollTop)
  }
}

/**
 * 防抖 Hook
 */
export const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = React.useState(value)
  
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)
    
    return () => clearTimeout(handler)
  }, [value, delay])
  
  return debouncedValue
}

/**
 * 节流 Hook
 */
export const useThrottle = (callback, delay) => {
  const lastRun = React.useRef(Date.now())
  
  return React.useCallback((...args) => {
    const now = Date.now()
    if (now - lastRun.current >= delay) {
      callback(...args)
      lastRun.current = now
    }
  }, [callback, delay])
}

/**
 * 按需加载 CSS
 */
export const loadCSS = (href) => {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.onload = resolve
    link.onerror = reject
    document.head.appendChild(link)
  })
}

/**
 * 按需加载 KaTeX 字体
 */
export const loadKatexFonts = (() => {
  let loaded = false
  
  return () => {
    if (loaded) return Promise.resolve()
    
    // 检查是否有数学公式
    const hasMath = document.querySelector('.math, .math-inline, .math-display')
    if (!hasMath) return Promise.resolve()
    
    loaded = true
    return loadCSS(`${import.meta.env.BASE_URL}katex/katex.min.css`)
  }
})()

/**
 * 预连接优化
 */
export const preconnect = (url) => {
  const link = document.createElement('link')
  link.rel = 'preconnect'
  link.href = url
  document.head.appendChild(link)
}

/**
 * 预加载关键资源
 */
export const preloadResource = (href, as) => {
  const link = document.createElement('link')
  link.rel = 'preload'
  link.href = href
  link.as = as
  document.head.appendChild(link)
}

/**
 * 性能监控
 */
export const reportPerformance = () => {
  if (!('performance' in window)) return
  
  window.addEventListener('load', () => {
    setTimeout(() => {
      const perfData = performance.getEntriesByType('navigation')[0]
      const paintData = performance.getEntriesByType('paint')
      
      const metrics = {
        device: isMobile() ? 'mobile' : 'desktop',
        loadTime: perfData ? perfData.loadEventEnd - perfData.fetchStart : 0,
        domReady: perfData ? perfData.domContentLoadedEventEnd - perfData.fetchStart : 0,
        firstPaint: paintData[0]?.startTime || 0,
        firstContentfulPaint: paintData[1]?.startTime || 0
      }
      
      // 仅在控制台输出，不上报到服务器（避免 404 错误）
      console.log('Performance Metrics:', metrics)
      
      // 如果需要上报，取消下面的注释并确保后端有对应的接口
      /*
      fetch('api/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metrics)
      }).catch(() => {})
      */
    }, 0)
  })
}

/**
 * 图片优化加载
 */
export const OptimizedImage = ({ src, alt, className, ...props }) => {
  const imgRef = React.useRef()
  const isVisible = useImageLazyLoad(imgRef)
  const [loaded, setLoaded] = React.useState(false)
  
  return (
    <div ref={imgRef} className={className}>
      {isVisible ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.3s' }}
          {...props}
        />
      ) : (
        <div className="image-placeholder" style={{ 
          background: '#f0f0f0',
          minHeight: '100px'
        }} />
      )}
    </div>
  )
}

/**
 * 移动端优化的文件树
 */
export const useOptimizedFileTree = (files) => {
  const mobile = isMobile()
  const containerHeight = window.innerHeight - 200
  
  if (mobile && files.length > 100) {
    return useVirtualScroll(files, 40, containerHeight)
  }
  
  return {
    visibleItems: files,
    offsetY: 0,
    totalHeight: files.length * 40,
    onScroll: () => {}
  }
}

/**
 * 移动端优化的滚动处理
 */
export const useOptimizedScroll = (callback) => {
  const mobile = isMobile()
  const delay = mobile ? 100 : 50
  
  return useThrottle(callback, delay)
}

/**
 * 代码分割加载器
 */
export const loadChunk = async (chunkName) => {
  try {
    switch (chunkName) {
      case 'monaco':
        return await import('@monaco-editor/react')
      case 'mermaid':
        return await import('mermaid')
      case 'html2canvas':
        return await import('html2canvas')
      case 'dom-to-image':
        return await import('dom-to-image-more')
      default:
        throw new Error(`Unknown chunk: ${chunkName}`)
    }
  } catch (error) {
    console.error(`Failed to load chunk ${chunkName}:`, error)
    throw error
  }
}

/**
 * 移动端检测并应用优化
 */
export const applyMobileOptimizations = () => {
  if (!isMobile()) return
  
  // 预连接到 API 服务器
  preconnect('http://localhost:18080')
  
  // 禁用不必要的动画
  document.documentElement.classList.add('reduce-motion')
  
  // 优化触摸滚动
  document.body.style.webkitOverflowScrolling = 'touch'
  
  // 防止双击缩放
  let lastTouchEnd = 0
  document.addEventListener('touchend', (e) => {
    const now = Date.now()
    if (now - lastTouchEnd <= 300) {
      e.preventDefault()
    }
    lastTouchEnd = now
  }, false)
}

/**
 * 初始化性能优化
 */
export const initPerformanceOptimizations = () => {
  // 应用移动端优化
  applyMobileOptimizations()
  
  // 启动性能监控
  reportPerformance()
  
  // Hashed asset names are unknown at runtime; avoid stale preload URLs.
}

export default {
  isMobile,
  isTablet,
  isTouchDevice,
  lazyLoadComponent,
  useImageLazyLoad,
  useVirtualScroll,
  useDebounce,
  useThrottle,
  loadCSS,
  loadKatexFonts,
  preconnect,
  preloadResource,
  reportPerformance,
  OptimizedImage,
  useOptimizedFileTree,
  useOptimizedScroll,
  loadChunk,
  applyMobileOptimizations,
  initPerformanceOptimizations
}
