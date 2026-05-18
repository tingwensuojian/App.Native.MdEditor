import React from 'react'
import ReactDOM from 'react-dom/client'
// 内置字体：JetBrains Mono、Fira Code，打包进应用，飞牛 NAS 离线可用
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/fira-code/400.css'
import '@fontsource/fira-code/500.css'
import AuthBootstrap from './components/auth/AuthBootstrap.jsx'
import './index.css'
import { initPerformanceOptimizations } from './utils/performanceOptimization.jsx'

const getProxyBasePath = () => {
  if (typeof window === 'undefined') return '/'
  const marker = '/index.cgi/'
  const pathname = window.location.pathname || '/'
  const idx = pathname.indexOf(marker)
  if (idx === -1) return '/'
  return pathname.slice(0, idx + marker.length)
}

const joinBasePath = (basePath, absolutePath) => {
  if (!absolutePath.startsWith('/')) return absolutePath
  if (!basePath || basePath === '/') return absolutePath
  return `${basePath}${absolutePath.slice(1)}`
}

if (typeof window !== 'undefined') {
  const proxyBasePath = getProxyBasePath()
  window.__APP_PROXY_BASE_PATH__ = proxyBasePath

  // In proxy.cgi mode, rewrite root-relative API requests to same-origin proxy path.
  if (proxyBasePath !== '/' && typeof window.fetch === 'function') {
    const originalFetch = window.fetch.bind(window)
    const shouldRewrite = (url) =>
      url.startsWith('/api') ||
      url.startsWith('/health') ||
      url.startsWith('/images') ||
      url.startsWith('/math-svg')

    window.fetch = (input, init) => {
      if (typeof input === 'string') {
        const next = shouldRewrite(input) ? joinBasePath(proxyBasePath, input) : input
        return originalFetch(next, init)
      }
      if (input instanceof Request) {
        const rawUrl = input.url || ''
        if (rawUrl.startsWith(window.location.origin + '/')) {
          const path = rawUrl.slice(window.location.origin.length)
          if (shouldRewrite(path)) {
            const nextUrl = window.location.origin + joinBasePath(proxyBasePath, path)
            return originalFetch(new Request(nextUrl, input), init)
          }
        }
      }
      return originalFetch(input, init)
    }
  }
}

// 初始化性能优化
initPerformanceOptimizations()

// 移动端/非安全上下文（http）下 Clipboard API 可能不存在。
// 为了避免 editor.api-* 内部直接调用 navigator.clipboard.write 导致崩溃，这里做最小兜底。
if (typeof navigator !== 'undefined' && typeof document !== 'undefined') {
  const legacyCopy = (text) => {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text || ''
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(textarea)
      return ok
    } catch (e) {
      return false
    }
  }

  const getBlobText = async (blob) => {
    try {
      if (!blob) return ''
      if (typeof blob.text === 'function') return await blob.text()
    } catch (e) {}
    return await new Promise((resolve) => {
      try {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => resolve('')
        reader.readAsText(blob)
      } catch (e) {
        resolve('')
      }
    })
  }

  if (!navigator.clipboard) {
    navigator.clipboard = {}
  }

  // ClipboardItem 在非安全上下文/部分移动端可能不存在。
  // editor.api-* 可能会直接 new ClipboardItem(...)，因此这里做最小 shim。
  if (typeof window.ClipboardItem === 'undefined') {
    window.ClipboardItem = class ClipboardItem {
      constructor(items) {
        this._items = items || {}
      }

      async getType(type) {
        // pdf/markdown 导出里通常只需要 text/plain 或 text/html
        return this._items[type]
      }
    }
  }
  if (typeof globalThis.ClipboardItem === 'undefined') {
    globalThis.ClipboardItem = window.ClipboardItem
  }

  // 如果缺少 write，则给一个最小实现（优先取 text/plain）
  if (typeof navigator.clipboard.write !== 'function') {
    navigator.clipboard.write = async (items) => {
      try {
        if (!items || !items.length) return
        const first = items[0]
        if (typeof first === 'string') {
          legacyCopy(first)
          return
        }
        // ClipboardItem: getType('text/plain'|'text/html')
        if (first && typeof first.getType === 'function') {
          try {
            const blob = await first.getType('text/plain')
            const text = await getBlobText(blob)
            legacyCopy(text)
            return
          } catch (e) {}
          try {
            const blob = await first.getType('text/html')
            const text = await getBlobText(blob)
            legacyCopy(text)
            return
          } catch (e) {}
        }
        // 最后兜底：复制当前选择文本
        const sel = window.getSelection?.()
        const selectedText = sel ? String(sel.toString() || '') : ''
        legacyCopy(selectedText)
      } catch (e) {}
    }
  }

  if (typeof navigator.clipboard.writeText !== 'function') {
    navigator.clipboard.writeText = async (text) => {
      legacyCopy(text)
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthBootstrap />,
)

