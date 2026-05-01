import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMath from 'remark-math'
import remarkBreaks from 'remark-breaks'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import { applyExportConfigStyles } from './utils/cssVariables'
import { sandboxCSS, sandboxCSSForElement } from './utils/sandboxCSS'
import rehypeRaw from 'rehype-raw'
import rehypeHighlight from 'rehype-highlight'
import remarkGfmCompat from './utils/remarkGfmCompat'
import html2canvas from 'html2canvas'
import 'katex/dist/katex.min.css'
// github-markdown-css 将根据主题动态加载

import FileTree from './components/FileTree'
import OutlinePanel from './components/OutlinePanel'
import Resizer from './components/Resizer'
import EditorToolbar from './components/EditorToolbar'
import DynamicAppLogo, { DEFAULT_LOGO_CONFIG, normalizeLogoConfig } from './components/DynamicAppLogo'
import MenuBar from './components/MenuBar'
import NewFileDialog from './components/NewFileDialog'
import SaveAsDialog from './components/SaveAsDialog'
import ExportDialog from './components/ExportDialog'
import ExportConfigPanel from './components/ExportConfigPanel'
import SettingsDialog from './components/SettingsDialog'
import MarkdownHelpDialog from './components/MarkdownHelpDialog'
import ShortcutsDialog from './components/ShortcutsDialog'
import ImageManagerDialog from './components/ImageManagerDialog'
import ImagePreviewDialog from './components/ImagePreviewDialog'
import TableInsertDialog from './components/TableInsertDialog'
import AboutDialog from './components/AboutDialog'
import SyncDialog from './components/SyncDialog'
import FileHistoryDialog from './components/FileHistoryDialog'
import EditorContextMenu from './components/EditorContextMenu'
import SlashCommandMenu from './components/SlashCommandMenu'
import ConfirmDialog from './components/ConfirmDialog'
import { ToastContainer } from './components/Toast'
import { useDebounce } from './hooks/useDebounce'
import { debounce, throttle, rafThrottle } from './utils/performanceUtils'
import { saveFileHistory, getFileHistory as getFileHistoryVersions, deleteVersion } from './utils/fileHistoryManagerV2'
import { handleError, logError, getUserFriendlyMessage } from './utils/errorHandler'
import './App.css'
import { getRecentFiles, addRecentFile, clearRecentFiles } from './utils/recentFilesManager'
import { compressImage } from './utils/imageCompressor'

import { getFavorites, toggleFavorite, clearFavorites, updateFavoritesOrder } from './utils/favoritesManager'
import { FolderArchive, Sun, Moon, Columns, FileText, Eye, PanelLeft, Menu, Share2, ListCollapse, Scan, FilePenLine, MonitorCheck } from 'lucide-react'
import { useLocalPersistence, useBeforeUnload, useVisibilityChange } from './hooks/useLocalPersistence'
import { clearContent as clearPersistedContent, loadPersistedState } from './utils/localPersistence'
import PdfViewer from './components/PdfViewer'
import OfficeViewer from './components/office/OfficeViewer'

import { saveEditorDraft, loadEditorDraft, clearEditorDraft } from './utils/editorLocalStorage'
import { DEFAULT_APP_STATE, fetchAllSettings, persistSetting, mergeExportConfigWithDefaults } from './utils/settingsApi'
import { safeParseJsonResponse } from './utils/fetchUtils'
import { copyToWeChat } from './utils/wechatExporter'
import { detectCOSE } from './utils/coseClient'
import { DEFAULT_DOCUMENT_CONTENT } from './constants/defaultDocument'
import { getFormatFromPath, getLanguageFromPath, FORMAT_DOCX, FORMAT_IMAGE, FORMAT_MD, FORMAT_PDF, FORMAT_PPTX_EXPERIMENTAL, FORMAT_TEXT, FORMAT_UNSUPPORTED, FORMAT_XLSX } from './constants/fileFormats'
import { AppUiProvider } from './context/AppUiContext'

// 性能优化：首屏加载动画
import FirstScreenLoader from './components/FirstScreenLoader'
import { useMobileFirstScreenLoader } from './hooks/useFirstScreenLoader.jsx'
import { usePreventScrollThrough } from './hooks/usePreventScrollThrough.jsx'
import { preloadCommonComponents } from './utils/lazyComponents'

import AISidebar from './components/ai/AISidebar'
const MonacoEditor = lazy(() => import('@monaco-editor/react'))

// “随系统”主题图标（MonitorCheck）
const SystemThemeIcon = ({ size = 16 }) => (
  <MonitorCheck size={size} aria-hidden="true" focusable="false" />
)

/** 明暗模式：支持“随系统”实时跟随；手动选择 light/dark 作为覆盖 */
const THEME_STORAGE_KEY = 'md-editor-theme'
const FIRST_SCREEN_LOADER_STORAGE_KEY = 'md-editor-enable-first-screen-loader'

const getInitialFirstScreenLoaderEnabled = () => {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem(FIRST_SCREEN_LOADER_STORAGE_KEY)
  if (stored === 'true') return true
  if (stored === 'false') return false
  // 未命中本地缓存时默认关闭，避免刷新时先闪现再关闭
  return false
}

// 编辑器字体动态下载（优先加载常用代码字体，失败时回退系统等宽字体）
const DYNAMIC_FONT_SOURCES = {
  'JetBrains Mono': 'https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2',
  'Fira Code': 'https://cdn.jsdelivr.net/npm/@fontsource/fira-code/files/fira-code-latin-400-normal.woff2',
  'Source Code Pro': 'https://cdn.jsdelivr.net/npm/@fontsource/source-code-pro/files/source-code-pro-latin-400-normal.woff2',
  'IBM Plex Mono': 'https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
  'Cascadia Code': 'https://cdn.jsdelivr.net/npm/@fontsource/cascadia-code/files/cascadia-code-latin-400-normal.woff2',
  // 中文云字体
  楷体: {
    type: 'css',
    cssUrls: [
      'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css',
      'https://unpkg.com/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css',
    ],
    loadedFamily: 'LXGW WenKai',
  },
  // 兼容历史配置值
  KaiTi: {
    type: 'css',
    cssUrls: [
      'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css',
      'https://unpkg.com/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css',
    ],
    loadedFamily: 'LXGW WenKai',
  },
  '霞鹜文楷': {
    type: 'css',
    cssUrls: [
      'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css',
      'https://unpkg.com/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css',
    ],
    loadedFamily: 'LXGW WenKai',
  },
  '思源黑体': {
    type: 'css',
    cssUrls: [
      'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400&display=swap',
      'https://fonts.loli.net/css2?family=Noto+Sans+SC:wght@400&display=swap',
    ],
    loadedFamily: 'Noto Sans SC',
  },
  '思源宋体': {
    type: 'css',
    cssUrls: [
      'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400&display=swap',
      'https://fonts.loli.net/css2?family=Noto+Serif+SC:wght@400&display=swap',
    ],
    loadedFamily: 'Noto Serif SC',
  },
  'Noto Serif SC': {
    type: 'css',
    cssUrls: [
      'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400&display=swap',
      'https://fonts.loli.net/css2?family=Noto+Serif+SC:wght@400&display=swap',
    ],
    loadedFamily: 'Noto Serif SC',
  },
  '阿里巴巴普惠体': {
    type: 'css',
    cssUrls: [
      'https://cdn.jsdelivr.net/npm/@chinese-fonts/alibaba-puhuiti-3@1.0.0/dist/AlibabaPuHuiTi-3-45-Light/result.css',
      'https://cdn.jsdelivr.net/npm/@chinese-fonts/alibaba-puhuiti-3@1.0.0/dist/AlibabaPuHuiTi-3-55-Regular/result.css',
    ],
    loadedFamily: 'Alibaba PuHuiTi 3.0 55 Regular',
  },
  'HarmonyOS Sans SC': {
    type: 'css',
    cssUrls: [
      'https://cdn.jsdelivr.net/npm/@chinese-fonts/harmonyos-sans-sc@1.0.0/dist/HarmonyOS_Sans_SC_Regular/result.css',
      'https://unpkg.com/@chinese-fonts/harmonyos-sans-sc@1.0.0/dist/HarmonyOS_Sans_SC_Regular/result.css',
    ],
    loadedFamily: 'HarmonyOS Sans SC',
  },
  'Ma Shan Zheng': {
    type: 'css',
    cssUrls: [
      'https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap',
      'https://fonts.loli.net/css2?family=Ma+Shan+Zheng&display=swap',
    ],
    loadedFamily: 'Ma Shan Zheng',
  },
}

const getEditorFontStack = (fontFamily) => {
  const safe = (fontFamily || '').trim()
  if (!safe || safe === 'monospace') return 'monospace'
  if (safe === 'sans-serif') return 'sans-serif'
  if (safe === 'serif') return 'serif'
  if (safe === '楷体' || safe === 'KaiTi') {
    return `'LXGW WenKai', 'KaiTi', 'STKaiti', 'Kaiti SC', serif`
  }
  if (safe === '思源黑体') {
    return `'Noto Sans SC', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif`
  }
  if (safe === '思源宋体' || safe === 'Noto Serif SC') {
    return `'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif`
  }
  if (safe === '霞鹜文楷') {
    return `'LXGW WenKai', 'KaiTi', 'STKaiti', 'Kaiti SC', serif`
  }
  if (safe === '阿里巴巴普惠体') {
    return `'Alibaba PuHuiTi 3.0 55 Regular', 'Alibaba PuHuiTi', 'PingFang SC', 'Microsoft YaHei', sans-serif`
  }
  if (safe === 'HarmonyOS Sans SC') {
    return `'HarmonyOS Sans SC', 'HarmonyOS Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif`
  }
  if (safe === 'Ma Shan Zheng') {
    return `'Ma Shan Zheng', 'KaiTi', 'STKaiti', cursive`
  }
  return `'${safe}', 'Fira Code', 'JetBrains Mono', 'Monaco', 'Consolas', monospace`
}

const getExportFontStack = (fontFamily) => {
  const safe = (fontFamily || '').trim()
  if (!safe || safe === 'sans-serif') {
    return `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  }
  if (safe === 'serif') return `Georgia, serif`
  if (safe === 'monospace') return `Monaco, Consolas, monospace`
  return getEditorFontStack(safe)
}

const isRemoteFontFamily = (fontFamily) => {
  const family = (fontFamily || '').trim()
  return Boolean(family && DYNAMIC_FONT_SOURCES[family])
}

const getRemoteFontLoadedFamily = (fontFamily) => {
  const family = (fontFamily || '').trim()
  const source = DYNAMIC_FONT_SOURCES[family]
  if (!source) return family
  if (typeof source === 'string') return family
  return source.loadedFamily || family
}

const getRemoteFontDescriptor = (fontFamily) => {
  const loadedFamily = getRemoteFontLoadedFamily(fontFamily)
  return `14px "${loadedFamily}"`
}

const injectLocalFontCacheEntry = (family, entry) => {
  if (!family || !entry) return
  const id = `local-font-cache-${family.replace(/\s+/g, '-').toLowerCase()}`
  if (document.getElementById(id)) return

  if (entry.type === 'css' && entry.localCssUrl) {
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = entry.localCssUrl
    document.head.appendChild(link)
    return
  }

  if (entry.type === 'file' && entry.localUrl) {
    const loadedFamily = entry.loadedFamily || family
    const style = document.createElement('style')
    style.id = id
    style.textContent = `
      @font-face {
        font-family: '${loadedFamily}';
        src: url('${entry.localUrl}') format('woff2');
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
    `
    document.head.appendChild(style)
  }
}

// Breakpoints:
// - mobile single-column: < 768px (<= 767px)
// - compact (tablet + mobile): <= 1024px
const MOBILE_SINGLE_COLUMN_MEDIA_QUERY = '(max-width: 767px)'

const getSystemTheme = () => {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
}

const getFnosThemeMode = () => {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('DesktopConfig-1000')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const theme = parsed?.userPreference?.theme
    if (theme === 10) return 'light'
    if (theme === 20) return 'dark'
    if (theme === 30) return 'system'
  } catch (error) {
    // Ignore parse failures and fallback to app preferences.
  }
  return null
}

// themeMode:
// - 'system'：实时跟随系统
// - 'light'/'dark'：覆盖系统（用户手动选择）
const getInitialThemeMode = () => {
  if (typeof window === 'undefined') return 'system'
  const fnosThemeMode = getFnosThemeMode()
  if (fnosThemeMode) return fnosThemeMode
  const isMobile = window.matchMedia?.(MOBILE_SINGLE_COLUMN_MEDIA_QUERY)?.matches
  if (isMobile) return 'system'

  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return 'system'
}

const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'light'
  const fnosThemeMode = getFnosThemeMode()
  if (fnosThemeMode) return fnosThemeMode === 'system' ? getSystemTheme() : fnosThemeMode
  const isMobile = window.matchMedia?.(MOBILE_SINGLE_COLUMN_MEDIA_QUERY)?.matches
  if (isMobile) return getSystemTheme()

  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return getSystemTheme()
}

// 初始化 unified 处理器
const createMarkdownProcessor = () => {
  return unified()
    .use(remarkParse)
    .use(remarkGfmCompat)
    .use(remarkBreaks) // 支持硬换行：单个换行符转换为 <br>
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeKatex)
    .use(rehypeHighlight)
    .use(rehypeStringify, {
      allowDangerousHtml: true,
      allowDangerousCharacters: true
    })
}

// Mermaid 懒加载 - 按需动态 import('mermaid')（window.mermaid 作为兼容兜底）
let mermaidModule = null
let mermaidLoadPromise = null
let infographicModule = null
let infographicLoadPromise = null
let infographicResourceLoaderRegistered = false

const loadInfographic = async () => {
  if (infographicModule) return infographicModule
  if (typeof window === 'undefined') throw new Error('Infographic not available')
  if (infographicLoadPromise) return infographicLoadPromise

  infographicLoadPromise = (async () => {
    try {
      const mod = await import('@antv/infographic')
      const api = mod?.Infographic ? mod : (mod?.default || mod)
      if (!api?.Infographic) throw new Error('Infographic module invalid')

      if (!infographicResourceLoaderRegistered && typeof api.registerResourceLoader === 'function' && typeof api.loadSVGResource === 'function') {
        api.registerResourceLoader(async (config) => {
          const iconId = config?.data
          if (!iconId || typeof iconId !== 'string') return null

          try {
            const safeId = iconId.trim()
            const res = await fetch(`https://api.iconify.design/${safeId}.svg`)
            if (!res.ok) return null
            const text = await res.text()
            return api.loadSVGResource(text)
          } catch {
            return null
          }
        })
        infographicResourceLoaderRegistered = true
      }

      infographicModule = api
      return infographicModule
    } finally {
      infographicLoadPromise = null
    }
  })()

  return infographicLoadPromise
}

const renderInfographicSvg = async (code, theme = 'light', backgroundColor = '', contrastThreshold = 0.55) => {
  const api = await loadInfographic()

  // 预检查模板是否存在：当前依赖版本与官网 gallery 可能不完全一致。
  try {
    const firstLine = String(code || '').split(/\r?\n/).find((line) => line.trim()) || ''
    const m = firstLine.trim().match(/^infographic\s+([^\s#]+)/i)
    const templateId = m?.[1]
    if (templateId && typeof api.getTemplates === 'function') {
      const supported = api.getTemplates()
      if (Array.isArray(supported) && !supported.includes(templateId)) {
        const hint = supported.find((id) => String(id).startsWith('chart-column')) || supported.find((id) => String(id).startsWith('chart-')) || supported[0]
        throw new Error(`当前版本不支持模板: ${templateId}。可尝试: ${hint}`)
      }
    }
  } catch (e) {
    if (e instanceof Error) throw e
  }

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-99999px'
  container.style.top = '-99999px'
  container.style.width = '1200px'
  container.style.height = '800px'
  container.style.overflow = 'hidden'
  document.body.appendChild(container)

  let infographic = null
  try {
    infographic = new api.Infographic({
      container,
      width: 1200,
      height: 800,
    })

    // render 在某些版本中不是 Promise，需要监听 rendered 事件确保完成。
    await new Promise((resolve, reject) => {
      let settled = false
      const onRendered = () => {
        if (settled) return
        settled = true
        try { infographic.off?.('rendered', onRendered) } catch (_) {}
        try { infographic.off?.('error', onError) } catch (_) {}
        resolve()
      }
      const normalizeInfographicError = (err) => {
        if (err instanceof Error) return err
        if (Array.isArray(err)) {
          const msg = err.map((item) => {
            if (!item) return ''
            if (typeof item === 'string') return item
            if (typeof item.message === 'string') return item.message
            if (typeof item.reason === 'string') return item.reason
            return JSON.stringify(item)
          }).filter(Boolean).join(' | ')
          return new Error(msg || 'Infographic render error')
        }
        if (err && typeof err === 'object') {
          const msg = err.message || err.reason || JSON.stringify(err)
          return new Error(String(msg || 'Infographic render error'))
        }
        return new Error(String(err || 'Infographic render error'))
      }

      const onError = (err) => {
        if (settled) return
        settled = true
        try { infographic.off?.('rendered', onRendered) } catch (_) {}
        try { infographic.off?.('error', onError) } catch (_) {}
        reject(normalizeInfographicError(err))
      }

      try {
        infographic.on?.('rendered', onRendered)
        infographic.on?.('error', onError)
        infographic.render(code)
        setTimeout(() => {
          if (settled) return
          settled = true
          try { infographic.off?.('rendered', onRendered) } catch (_) {}
          try { infographic.off?.('error', onError) } catch (_) {}
          reject(new Error('Infographic 渲染超时'))
        }, 5000)
      } catch (err) {
        onError(err)
      }
    })

    // 官方 API：浏览器端使用 toDataURL({ type: 'svg' }) 导出 SVG
    const dataUrl = await infographic.toDataURL({ type: 'svg', embedResources: true })
    if (!dataUrl || !dataUrl.startsWith('data:image/svg+xml')) {
      throw new Error('Infographic 未生成 SVG')
    }

    const commaIdx = dataUrl.indexOf(',')
    if (commaIdx < 0) throw new Error('Infographic SVG 数据无效')

    const encoded = dataUrl.slice(commaIdx + 1)
    let svg = decodeURIComponent(encoded)
    if (!/<svg[\s>]/i.test(svg)) throw new Error('Infographic SVG 内容无效')

    // SVG 内容后处理：尽量移除整张深色背景层，保留业务图形
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(svg, 'image/svg+xml')
      const root = doc.documentElement

      const viewBox = (root.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number)
      const vbW = viewBox.length === 4 ? Math.abs(viewBox[2]) : null
      const vbH = viewBox.length === 4 ? Math.abs(viewBox[3]) : null
      const wAttr = parseFloat((root.getAttribute('width') || '').replace('px', ''))
      const hAttr = parseFloat((root.getAttribute('height') || '').replace('px', ''))
      const svgW = Number.isFinite(wAttr) ? wAttr : vbW
      const svgH = Number.isFinite(hAttr) ? hAttr : vbH

      const darkFill = (v) => {
        const s = String(v || '').toLowerCase()
        if (!s) return false
        if (s === 'none' || s === 'transparent') return false
        return /^#0{3,8}$/.test(s)
          || /^#111(111)?$/.test(s)
          || /^#121212$/.test(s)
          || /^#1a1a1a$/.test(s)
          || /^#1f1f1f$/.test(s)
          || /^rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/.test(s)
          || /^rgb\(\s*31\s*,\s*31\s*,\s*31\s*\)/.test(s)
          || /^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*(0\.[5-9]|1(\.0+)?)\s*\)/.test(s)
          || /^rgba\(\s*31\s*,\s*31\s*,\s*31\s*,\s*(0\.[5-9]|1(\.0+)?)\s*\)/.test(s)
      }

      const candidates = Array.from(root.querySelectorAll('rect,path')).filter((el) => {
        const tag = el.tagName.toLowerCase()
        const fill = el.getAttribute('fill') || ''
        const style = el.getAttribute('style') || ''
        const styleFill = /fill\s*:\s*([^;]+)/i.exec(style)?.[1] || ''
        const hasFill = !!(fill || styleFill)
        const hasDarkFill = darkFill(fill) || darkFill(styleFill)
        if (!hasFill) return false
        if (el.getAttribute('stroke')) return false

        const isBackgroundName = /background|bg|backdrop/i.test(el.getAttribute('id') || '')
          || /background|bg|backdrop/i.test(el.getAttribute('class') || '')

        if (tag === 'rect') {
          const x = parseFloat(el.getAttribute('x') || '0')
          const y = parseFloat(el.getAttribute('y') || '0')
          const w = parseFloat(el.getAttribute('width') || '0')
          const h = parseFloat(el.getAttribute('height') || '0')
          if (!svgW || !svgH) return hasDarkFill
          const coversSvg = Math.abs(x) <= 2 && Math.abs(y) <= 2 && Math.abs(w - svgW) <= 3 && Math.abs(h - svgH) <= 3
          return isBackgroundName || coversSvg
        }

        if (tag === 'path') {
          const d = el.getAttribute('d') || ''
          const isRectLikeL = /M[\d\s.,-]+L[\d\s.,-]+L[\d\s.,-]+L[\d\s.,-]+Z/i.test(d)
          const isRectLikeHV = /M[\d\s.,-]+H[\d\s.,-]+V[\d\s.,-]+H[\d\s.,-]+Z/i.test(d)
          const isRectLike = isRectLikeL || isRectLikeHV
          return isBackgroundName || isRectLike
        }
        return false
      })

      candidates.forEach((el) => el.parentNode?.removeChild(el))

      // 兜底：移除大面积深色背景 rect（兼容宽高不完全等于 viewBox 的情况）
      if (svgW && svgH) {
        const rects = Array.from(root.querySelectorAll('rect'))
        for (const rect of rects) {
          const x = parseFloat(rect.getAttribute('x') || '0')
          const y = parseFloat(rect.getAttribute('y') || '0')
          const w = parseFloat(rect.getAttribute('width') || '0')
          const h = parseFloat(rect.getAttribute('height') || '0')
          const fill = rect.getAttribute('fill') || ''
          const style = rect.getAttribute('style') || ''
          const styleFill = /fill\s*:\s*([^;]+)/i.exec(style)?.[1] || ''
          const rectArea = Math.abs(w * h)
          const svgArea = Math.abs(svgW * svgH)
          const isLarge = svgArea > 0 ? (rectArea / svgArea) >= 0.6 : false
          const nearOrigin = Math.abs(x) <= 2 && Math.abs(y) <= 2
          const coversSvg = Math.abs(x) <= 2 && Math.abs(y) <= 2 && Math.abs(w - svgW) <= 3 && Math.abs(h - svgH) <= 3
          const isDark = darkFill(fill) || darkFill(styleFill)
          if (coversSvg || (nearOrigin && isLarge && isDark)) {
            rect.parentNode?.removeChild(rect)
          }
        }
      }

      const rootStyle = (root.getAttribute('style') || '')
        .replace(/background-color\s*:\s*[^;]+;?/gi, '')
        .replace(/background\s*:\s*[^;]+;?/gi, '')
        .trim()
      root.setAttribute('style', `${rootStyle};background:transparent;`)

      // 最终兜底：将明显的黑色填充改为透明，仅针对背景命名元素
      root.querySelectorAll('[id*="bg" i],[id*="background" i],[class*="bg" i],[class*="background" i]').forEach((el) => {
        const tag = (el.tagName || '').toLowerCase()
        if (!['rect', 'path', 'g'].includes(tag)) return
        const fill = el.getAttribute('fill') || ''
        const style = el.getAttribute('style') || ''
        if (/^#0{3,8}$/i.test(fill) || /^#111(111)?$/i.test(fill) || /^#121212$/i.test(fill)) {
          el.setAttribute('fill', 'none')
        }
        if (/fill\s*:\s*(#0{3,8}|#111(?:111)?|#121212)/i.test(style)) {
          el.setAttribute('style', style.replace(/fill\s*:\s*[^;]+;?/ig, 'fill:none;'))
        }
      })

      // 文本颜色逻辑：
      // 1) 未设置主题背景色 => 按明暗模式（亮模深字 / 暗模浅字）
      // 2) 设置了主题背景色 => 优先按背景色反差选字色（浅背景深字 / 深背景浅字）
      const normalizedBackgroundColor = String(backgroundColor || '').trim()
      const parseColorToRgb = (value) => {
        const v = String(value || '').trim().toLowerCase()
        if (!v) return null
        if (v.startsWith('#')) {
          const hex = v.replace('#', '')
          if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16)
            const g = parseInt(hex[1] + hex[1], 16)
            const b = parseInt(hex[2] + hex[2], 16)
            return [r, g, b]
          }
          if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16)
            const g = parseInt(hex.slice(2, 4), 16)
            const b = parseInt(hex.slice(4, 6), 16)
            return [r, g, b]
          }
          return null
        }
        const rgbMatch = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i)
        if (rgbMatch) {
          const r = Math.min(255, Math.max(0, Number(rgbMatch[1])))
          const g = Math.min(255, Math.max(0, Number(rgbMatch[2])))
          const b = Math.min(255, Math.max(0, Number(rgbMatch[3])))
          return [r, g, b]
        }
        return null
      }
      const getContrastText = (color) => {
        const rgb = parseColorToRgb(color)
        if (!rgb) return null
        const [r, g, b] = rgb.map((n) => n / 255)
        const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
        const l = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
        // 亮度高则用黑字，亮度低则用浅色字
        return l > contrastThreshold ? '#000000' : '#e6edf3'
      }
      const textFallback = normalizedBackgroundColor
        ? (getContrastText(normalizedBackgroundColor) || (theme === 'dark' ? '#e6edf3' : '#000000'))
        : (theme === 'dark' ? '#e6edf3' : '#000000')
      const normalizeTextColor = (value) => {
        const v = String(value || '').trim().toLowerCase()
        if (!v) return null

        const isWhite = v === '#fff'
          || v === '#ffffff'
          || v === 'white'
          || /^rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/.test(v)

        if (isWhite) return textFallback

        // 暗色模式下，黑字在透明背景上可能不可读，统一提升为浅色文本
        if (theme === 'dark') {
          const isBlack = /^#0{3,8}$/.test(v)
            || v === '#111'
            || v === '#111111'
            || v === '#121212'
            || v === 'black'
            || /^rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/.test(v)
            || /^rgb\(\s*17\s*,\s*17\s*,\s*17\s*\)/.test(v)
            || /^rgb\(\s*18\s*,\s*18\s*,\s*18\s*\)/.test(v)
          if (isBlack) return textFallback
        }

        return null
      }

      root.querySelectorAll('text').forEach((el) => {
        const fill = el.getAttribute('fill') || ''
        const next = normalizeTextColor(fill)
        if (next) el.setAttribute('fill', next)
      })

      root.querySelectorAll('foreignObject span').forEach((el) => {
        const style = el.getAttribute('style') || ''
        const colorMatch = /color\s*:\s*([^;]+)/i.exec(style)
        const next = normalizeTextColor(colorMatch?.[1])
        if (next) {
          el.setAttribute('style', style.replace(/color\s*:\s*[^;]+;?/ig, `color:${next};`))
        }
      })

      svg = new XMLSerializer().serializeToString(root)
    } catch {
      // 保持原 SVG 兜底
    }

    return svg
  } finally {
    try { infographic?.destroy?.() } catch (_) {}
    container.remove()
  }
}

const loadMermaid = async () => {
  if (mermaidModule) return mermaidModule
  if (typeof window === 'undefined') throw new Error('Mermaid not available')
  if (mermaidLoadPromise) return mermaidLoadPromise

  const initMermaid = (m) => {
    if (!m?.initialize) throw new Error('Mermaid not available')
    m.initialize({
      startOnLoad: false,
      theme: 'default', // 使用 default 主题，蓝紫色节点
      securityLevel: 'loose'
    })
    return m
  }

  // 兼容：如果外部已提前注入（例如旧版 index.html 或其它入口脚本），直接复用。
  if (window.mermaid) {
    mermaidModule = initMermaid(window.mermaid)
    return mermaidModule
  }

  // Ensure concurrent callers share a single in-flight load.
  mermaidLoadPromise = (async () => {
    // 首选：按需动态加载本地依赖（构建产物也能工作，不依赖 CDN）。
    try {
      const mod = await import('mermaid')
      const m = mod?.default || mod
      window.mermaid = m
      mermaidModule = initMermaid(m)
      return mermaidModule
    } catch (err) {
      // 兜底：等待 window.mermaid 被注入（最多 5s），避免直接失败。
      let attempts = 0
      while (!window.mermaid && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100))
        attempts++
      }
      if (!window.mermaid) throw err
      mermaidModule = initMermaid(window.mermaid)
      return mermaidModule
    } finally {
      mermaidLoadPromise = null
    }
  })()
  return mermaidLoadPromise
}

// 默认导出配置（用于合并持久化数据）
const DEFAULT_EXPORT_CONFIG = {
  theme: 'default',
  customCSS: '',
  fontFamily: 'sans-serif',
  fontSize: '16px',
  textAlign: 'left',
  lineHeight: 1.8,
  themeColor: '',
  infographicTextContrastThreshold: 0.55,
  elementStyles: {
    h1: { color: '', preset: 'default', customCSS: '' },
    h2: { color: '', preset: 'default', customCSS: '' },
    h3: { color: '', preset: 'default', customCSS: '' },
    h4: { color: '', preset: 'default', customCSS: '' },
    h5: { color: '', preset: 'default', customCSS: '' },
    h6: { color: '', preset: 'default', customCSS: '' },
    p: { color: '', preset: 'default', customCSS: '' },
    strong: { color: '', preset: 'default', customCSS: '' },
    link: { color: '', preset: 'default', customCSS: '' },
    ul: { color: '', preset: 'default', customCSS: '' },
    ol: { color: '', preset: 'default', customCSS: '' },
    blockquote: { color: '', preset: 'default', customCSS: '' },
    codespan: { color: '', preset: 'default', customCSS: '' },
    code_pre: { color: '', preset: 'default', customCSS: '' },
    hr: { color: '', preset: 'default', customCSS: '' },
    image: { color: '', preset: 'default', customCSS: '' },
    bg: { color: '', preset: 'default', customCSS: '' },
  },
  codeTheme: 'github',
  macCodeBlock: true,
  captionFormat: 'title-first',
  paragraphIndent: false,
  paragraphJustify: false,
  wechatLinkToFootnote: false,
  includeTOC: false,
}

// 首屏直接从 localStorage 加载草稿（无 URL 路径时），避免闪烁
const getInitialEditorState = () => {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  if (params.get('path')) return { content: DEFAULT_APP_STATE.content, currentPath: '' }
  const draft = loadEditorDraft()
  if (draft?.content) return { content: draft.content, currentPath: draft.currentPath || '' }
  return { content: DEFAULT_DOCUMENT_CONTENT, currentPath: '' }
}

const sanitizeFileNameFromTitle = (title) => {
  const raw = (title || '').trim()
  if (!raw) return ''
  return raw
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Content-driven mermaid detection: fast check, no markdown parse.
const hasMermaid = (content) => {
  if (!content || typeof content !== 'string') return false
  // Typical patterns:
  // - fenced block: ```mermaid or ``` mermaid
  // - syntax-highlighted HTML from rehype-highlight: language-mermaid
  if (content.includes('language-mermaid')) return true
  // Fast substring check first, then a slightly more permissive regex for whitespace.
  if (content.includes('```') && content.toLowerCase().includes('mermaid')) {
    return /(^|\n)\s*```+\s*mermaid\b/i.test(content)
  }
  return false
}

const hasPlantUML = (content) => {
  if (!content || typeof content !== 'string') return false
  if (content.includes('language-plantuml') || content.includes('language-puml')) return true
  if (content.includes('```')) {
    return /(^|\n)\s*```+\s*(plantuml|puml)\b/i.test(content)
  }
  return false
}

const hasInfographic = (content) => {
  if (!content || typeof content !== 'string') return false
  if (content.includes('language-infographic')) return true
  if (content.includes('```')) {
    return /(^|\n)\s*```+\s*infographic\b/i.test(content)
  }
  return false
}

const renderPlantUMLSvg = async (code, theme = 'light', backgroundColor = '', contrastThreshold = 0.55) => {
  const response = await fetch('/api/plantuml/svg', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ code })
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const detail = data?.message || data?.code || `HTTP ${response.status}`
    const extra = [
      data?.upstreamStatus ? `upstreamStatus=${data.upstreamStatus}` : '',
      data?.upstreamType ? `upstreamType=${data.upstreamType}` : '',
      data?.upstreamUrl ? `upstreamUrl=${data.upstreamUrl}` : '',
      data?.fallbackStatus ? `fallbackStatus=${data.fallbackStatus}` : '',
      data?.fallbackType ? `fallbackType=${data.fallbackType}` : '',
      data?.details ? `details=${String(data.details).slice(0, 120)}` : '',
      data?.fallbackDetails ? `fallbackDetails=${String(data.fallbackDetails).slice(0, 120)}` : '',
    ].filter(Boolean).join(', ')
    throw new Error(`PlantUML 渲染请求失败: ${response.status} - ${detail}${extra ? ` (${extra})` : ''}`)
  }

  if (!data?.ok || !data?.svg) {
    throw new Error(data?.message || 'PlantUML 渲染失败')
  }

  let svg = data.svg
  try {
    const parseColorToRgb = (value) => {
      const v = String(value || '').trim().toLowerCase()
      if (!v) return null
      if (v.startsWith('#')) {
        const hex = v.replace('#', '')
        if (hex.length === 3) {
          const r = parseInt(hex[0] + hex[0], 16)
          const g = parseInt(hex[1] + hex[1], 16)
          const b = parseInt(hex[2] + hex[2], 16)
          return [r, g, b]
        }
        if (hex.length === 6) {
          const r = parseInt(hex.slice(0, 2), 16)
          const g = parseInt(hex.slice(2, 4), 16)
          const b = parseInt(hex.slice(4, 6), 16)
          return [r, g, b]
        }
      }
      const rgbMatch = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i)
      if (rgbMatch) {
        const r = Math.min(255, Math.max(0, Number(rgbMatch[1])))
        const g = Math.min(255, Math.max(0, Number(rgbMatch[2])))
        const b = Math.min(255, Math.max(0, Number(rgbMatch[3])))
        return [r, g, b]
      }
      return null
    }
    const getContrastText = (color) => {
      const rgb = parseColorToRgb(color)
      if (!rgb) return null
      const [r, g, b] = rgb.map((n) => n / 255)
      const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
      const l = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
      return l > contrastThreshold ? '#000000' : '#e6edf3'
    }

    const normalizedBackgroundColor = String(backgroundColor || '').trim()
    const textFallback = normalizedBackgroundColor
      ? (getContrastText(normalizedBackgroundColor) || (theme === 'dark' ? '#e6edf3' : '#000000'))
      : (theme === 'dark' ? '#e6edf3' : '#000000')

    const normalizeTextColor = (value) => {
      const v = String(value || '').trim().toLowerCase()
      if (!v) return null
      const isWhite = v === '#fff' || v === '#ffffff' || v === 'white' || /^rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/.test(v)
      const isBlack = /^#0{3,8}$/.test(v)
        || v === '#111'
        || v === '#111111'
        || v === '#121212'
        || v === 'black'
        || /^rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/.test(v)
        || /^rgb\(\s*17\s*,\s*17\s*,\s*17\s*\)/.test(v)
        || /^rgb\(\s*18\s*,\s*18\s*,\s*18\s*\)/.test(v)

      if (isWhite || isBlack) return textFallback
      return null
    }

    const parser = new DOMParser()
    const doc = parser.parseFromString(svg, 'image/svg+xml')
    const root = doc.documentElement

    root.querySelectorAll('text, tspan').forEach((el) => {
      const fill = el.getAttribute('fill') || ''
      const next = normalizeTextColor(fill)
      if (next) el.setAttribute('fill', next)
    })

    root.querySelectorAll('[style]').forEach((el) => {
      const style = el.getAttribute('style') || ''
      const colorMatch = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style)
      const fillMatch = /(?:^|;)\s*fill\s*:\s*([^;]+)/i.exec(style)
      const nextColor = normalizeTextColor(colorMatch?.[1])
      const nextFill = normalizeTextColor(fillMatch?.[1])
      let nextStyle = style
      if (nextColor) nextStyle = nextStyle.replace(/color\s*:\s*[^;]+;?/ig, `color:${nextColor};`)
      if (nextFill) nextStyle = nextStyle.replace(/fill\s*:\s*[^;]+;?/ig, `fill:${nextFill};`)
      if (nextStyle !== style) el.setAttribute('style', nextStyle)
    })

    svg = new XMLSerializer().serializeToString(root)
  } catch {
    // 保持原 SVG 兜底
  }

  return svg
}

function App({ authUser = null, onLogout = null }) {
  const [enableFirstScreenLoader, setEnableFirstScreenLoader] = useState(getInitialFirstScreenLoaderEnabled)
  const [content, setContent] = useState(() => getInitialEditorState().content)
  // 给“系统主题变化事件”提供最新的文档内容，避免闭包拿到旧值
  const latestContentRef = useRef(content)
  useEffect(() => {
    latestContentRef.current = content
  }, [content])

  const [documentTitle, setDocumentTitle] = useState('')
  const [showImageManager, setShowImageManager] = useState(false)
  const [imageManagerInitialTab, setImageManagerInitialTab] = useState(null) // 'library' | null，打开时指定标签页
  const [currentPath, setCurrentPath] = useState(() => getInitialEditorState().currentPath)
  const [status, setStatus] = useState('就绪')
  const [statusType, setStatusType] = useState('normal') // normal, success, error
  const [showTableDialog, setShowTableDialog] = useState(false)
  const [editorTheme, setEditorTheme] = useState(getInitialTheme)
  // themeMode：是否随系统实时跟随
  const [themeMode, setThemeMode] = useState(getInitialThemeMode)
  const [layout, setLayout] = useState('vertical')
  const [focusMode, setFocusMode] = useState('off') // off | split | editor-only
  const [showFileTree, setShowFileTree] = useState(false)
  const [showNewFileDialog, setShowNewFileDialog] = useState(false)
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false)
  const [isSaveAsMode, setIsSaveAsMode] = useState(true)
  const [showSwitchSaveConfirm, setShowSwitchSaveConfirm] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showSyncDialog, setShowSyncDialog] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [historyVersions, setHistoryVersions] = useState([])
  const [showToolbar, setShowToolbar] = useState(true)
  const [aiDialogOpen, setAiDialogOpen] = useState(false)
  const [aiAutoQuickCommandRequest, setAiAutoQuickCommandRequest] = useState(null)
  const [initialStateLoaded, setInitialStateLoaded] = useState(false)
  // 首屏阶段标记：仅应用启动阶段允许显示过渡页
  const [isBootPhase, setIsBootPhase] = useState(true)
  // 启动阶段 + 已开启开关 时显示过渡页；运行中切换开关不补播，避免遮罩闪动
  const shouldRenderFirstScreenLoader = enableFirstScreenLoader && isBootPhase
  const { isLoading, loadingMessage } = useMobileFirstScreenLoader(shouldRenderFirstScreenLoader)

  // 仅在过渡页自然结束后再退出启动阶段，避免“动画还没播完就被关掉”
  useEffect(() => {
    if (!isBootPhase) return
    if (!enableFirstScreenLoader) {
      setIsBootPhase(false)
      return
    }
    if (!isLoading) {
      setIsBootPhase(false)
    }
  }, [isBootPhase, enableFirstScreenLoader, isLoading])

  const [editorFontSize, setEditorFontSize] = useState(14)
  const [editorLineHeight, setEditorLineHeight] = useState(24)
  const [editorFontFamily, setEditorFontFamily] = useState('JetBrains Mono')
  const [fontDownloadState, setFontDownloadState] = useState({})
  const [localFontCacheMap, setLocalFontCacheMap] = useState({})
  const [fontDownloadRequests, setFontDownloadRequests] = useState({})
  const [editorLineNumbers, setEditorLineNumbers] = useState(true)
  const [editorWordWrap, setEditorWordWrap] = useState(true)
  const [syncPreviewWithEditor, setSyncPreviewWithEditor] = useState(true)
  const [enableSlashMenuReorder, setEnableSlashMenuReorder] = useState(false)
  const [slashCommandOrder, setSlashCommandOrder] = useState([])
  const [recentFiles, setRecentFiles] = useState([])
  const [favorites, setFavorites] = useState([])
  const [imageCaptionFormat, setImageCaptionFormat] = useState(DEFAULT_APP_STATE.imageCaptionFormat)
  const [appLogoConfig, setAppLogoConfig] = useState({ ...DEFAULT_LOGO_CONFIG })

  // 导出配置面板状态
  const [showExportConfigPanel, setShowExportConfigPanel] = useState(false)
  const [previewLayoutVersion, setPreviewLayoutVersion] = useState(0)
  const [exportConfig, setExportConfig] = useState(() => ({ ...DEFAULT_EXPORT_CONFIG }))

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState(null)
  const [clipboardContent, setClipboardContent] = useState(null)

  // 斜杠菜单状态
  const [slashMenu, setSlashMenu] = useState({ visible: false, x: 0, y: 0, query: '', range: null })

  useEffect(() => {
    if (!showNewFileDialog) return
    setSlashMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev))
  }, [showNewFileDialog])

  // 全格式支持：当前文件格式、图片预览数据、PDF预览数据、非支持格式弹窗、保存确认弹窗
  const [currentFileFormat, setCurrentFileFormat] = useState(null) // 'md'|'text'|'image'|'pdf'|'unsupported'
  const imageDataRef = useRef(null) // 图片 base64 dataURL
  const pdfDataRef = useRef(null) // PDF base64 dataURL
  const [officePreviewData, setOfficePreviewData] = useState(null) // docx: string | xlsx: table object | pptx: info object
  const [officePreviewMetadata, setOfficePreviewMetadata] = useState(null)
  const [officePreviewLoading, setOfficePreviewLoading] = useState(false)
  const [officePreviewLoadingMore, setOfficePreviewLoadingMore] = useState(false)
  const [officePreviewError, setOfficePreviewError] = useState(null)
  const officeLoadControllerRef = useRef(null)
  const [officeXlsxSheetIndex, setOfficeXlsxSheetIndex] = useState(0)
  const currentFileEncodingRef = useRef('utf8') // 'utf8'|'hex' - 用于 Hex 保存时转换
  const [currentFileSize, setCurrentFileSize] = useState(null) // 当前文件大小
  const [currentFileMtime, setCurrentFileMtime] = useState(null) // 当前文件修改时间戳
  const [showUnsupportedFormatDialog, setShowUnsupportedFormatDialog] = useState(false)
  const pendingUnsupportedPathRef = useRef(null)
  const [showSaveConfirmDialog, setShowSaveConfirmDialog] = useState(null) // { format, title, message } | null
  const pendingSaveAfterConfirmRef = useRef(null) // { path, content, encoding, isSwitch }
  const [showImageZoomDialog, setShowImageZoomDialog] = useState(false) // 图片预览点击放大

  const isOfficeReadOnly = currentFileFormat === FORMAT_DOCX || currentFileFormat === FORMAT_XLSX || currentFileFormat === FORMAT_PPTX_EXPERIMENTAL

  useEffect(() => {
    if (!isOfficeReadOnly) return
    // Office 只读预览：强制关闭专注模式，避免渲染编辑区
    setFocusMode('off')
  }, [isOfficeReadOnly])

  const handleExportConfigChange = useCallback((nextConfig) => {
    setExportConfig(nextConfig)
  }, [])

  // 应用导出配置到预览区
  useEffect(() => {
    console.log('[useEffect-预览] 开始运行');
    console.log('[useEffect-预览] exportConfig.theme:', exportConfig.theme);
    console.log('[useEffect-预览] editorTheme:', editorTheme);
    
    if (!previewRef.current) {
      console.log('[useEffect-预览] previewRef.current 不存在，退出');
      return
    }

    const preview = previewRef.current

    // 动态加载代码高亮主题
    const loadCodeTheme = (theme) => {
      const themeId = 'code-theme-style'
      let themeLink = document.getElementById(themeId)
      
      if (!themeLink) {
        themeLink = document.createElement('link')
        themeLink.id = themeId
        themeLink.rel = 'stylesheet'
        document.head.appendChild(themeLink)
      }
      
      // 根据主题名称加载对应的 CSS（本地构建产物，避免 CDN 延迟）
      const base = import.meta.env.BASE_URL || './'
      const themeMap = {
        'github': `${base}code-themes/github.min.css`,
        'github-dark': `${base}code-themes/github-dark.min.css`,
        'vs': `${base}code-themes/vs.min.css`,
        'vs2015': `${base}code-themes/vs2015.min.css`,
        'dracula': `${base}code-themes/base16/dracula.min.css`,
        'atom-one-dark': `${base}code-themes/atom-one-dark.min.css`,
        'solarized-light': `${base}code-themes/base16/solarized-light.min.css`,
        'solarized-dark': `${base}code-themes/base16/solarized-dark.min.css`,
        'nord': `${base}code-themes/nord.min.css`,
        'monokai': `${base}code-themes/monokai.min.css`,
        'material': `${base}code-themes/base16/material.min.css`
      }
      
      themeLink.href = themeMap[theme] || themeMap['github']
    }

    // 加载选中的代码主题
    const selectedTheme = exportConfig.codeTheme || 'github'
    loadCodeTheme(selectedTheme)
    
    // 调试：输出当前主题
    console.log('当前代码主题:', selectedTheme)



    // 动态注入样式
    const styleId = 'export-config-styles'
    let styleEl = document.getElementById(styleId)
    
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }

    // 应用主题色到标题和链接
    // 当有主题色时使用主题色，没有主题色时：
    // - 标题使用默认文本颜色（inherit）
    // - 链接使用蓝色
    // - 边框使用灰色
    const hasThemeColor = exportConfig.themeColor && exportConfig.themeColor !== ''
    const effectiveThemeColor = hasThemeColor ? exportConfig.themeColor : (editorTheme === 'dark' ? '#58a6ff' : '#0969da')
    const effectiveHeadingColor = hasThemeColor ? exportConfig.themeColor : 'inherit'
    const effectiveBorderColor = hasThemeColor ? exportConfig.themeColor : '#d0d7de'
    preview.style.setProperty('--theme-color', effectiveThemeColor)

    // 根据代码主题设置背景色和文字颜色映射
    const themeBackgrounds = {
      'github': '#f6f8fa',
      'github-dark': '#0d1117',
      'vs': '#ffffff',
      'vs2015': '#1e1e1e',
      'dracula': '#282a36',
      'atom-one-dark': '#282c34',
      'solarized-light': '#fdf6e3',
      'solarized-dark': '#002b36',
      'nord': '#2e3440',
      'monokai': '#272822',
      'material': '#263238'
    }

    const themeColors = {
      'dracula': '#F8F8F3',
      'solarized-dark': '#819596'
    }

    const currentThemeBg = themeBackgrounds[exportConfig.codeTheme] || themeBackgrounds['github']
    const currentThemeColor = themeColors[exportConfig.codeTheme] || 'inherit'

    // 根据主题生成不同的样式
    let themeStyles = ''
    switch (exportConfig.theme) {
      case 'default':
        // 默认主题：不添加额外的 CSS
        themeStyles = ''
        break
        
      case 'custom':
        // 自定义主题：使用用户输入的 CSS
        // 转换特殊选择器为标准 CSS 选择器
        let customCSS = exportConfig.customCSS || ''
        
        console.log('=== 自定义主题 CSS 转换 ===')
        console.log('原始 CSS:', customCSS)
        
        // 第一步：转换选择器
        customCSS = customCSS
          // 先替换长的复合选择器
          .replace(/blockquote_title_important\s*\{/g, '.markdown-body blockquote.important .title {')
          .replace(/blockquote_title_warning\s*\{/g, '.markdown-body blockquote.warning .title {')
          .replace(/blockquote_title_caution\s*\{/g, '.markdown-body blockquote.caution .title {')
          .replace(/blockquote_p_important\s*\{/g, '.markdown-body blockquote.important p {')
          .replace(/blockquote_title_note\s*\{/g, '.markdown-body blockquote.note .title {')
          .replace(/blockquote_title_tip\s*\{/g, '.markdown-body blockquote.tip .title {')
          .replace(/blockquote_p_warning\s*\{/g, '.markdown-body blockquote.warning p {')
          .replace(/blockquote_p_caution\s*\{/g, '.markdown-body blockquote.caution p {')
          .replace(/blockquote_important\s*\{/g, '.markdown-body blockquote.important {')
          .replace(/blockquote_p_note\s*\{/g, '.markdown-body blockquote.note p {')
          .replace(/blockquote_p_tip\s*\{/g, '.markdown-body blockquote.tip p {')
          .replace(/blockquote_warning\s*\{/g, '.markdown-body blockquote.warning {')
          .replace(/blockquote_caution\s*\{/g, '.markdown-body blockquote.caution {')
          .replace(/blockquote_title\s*\{/g, '.markdown-body blockquote .title {')
          .replace(/blockquote_note\s*\{/g, '.markdown-body blockquote.note {')
          .replace(/blockquote_tip\s*\{/g, '.markdown-body blockquote.tip {')
          .replace(/blockquote_p\s*\{/g, '.markdown-body blockquote p {')
          .replace(/blockquote\s*\{/g, '.markdown-body blockquote {')
          // 然后替换其他选择器（包括伪类）
          .replace(/link:hover\s*\{/g, '.markdown-body a:hover {')
          .replace(/link:active\s*\{/g, '.markdown-body a:active {')
          .replace(/link:visited\s*\{/g, '.markdown-body a:visited {')
          .replace(/link:focus\s*\{/g, '.markdown-body a:focus {')
          .replace(/container\s*\{/g, '.markdown-body {')
          .replace(/code_pre\s*\{/g, '.markdown-body pre {')
          .replace(/codespan\s*\{/g, '.markdown-body code:not(pre code) {')
          .replace(/wx_link\s*\{/g, '.markdown-body a.wx-link {')
          .replace(/image\s*\{/g, '.markdown-body img, .markdown-body figure.image-figure img {')
          .replace(/strong\s*\{/g, '.markdown-body strong, .markdown-body b {')
          .replace(/link\s*\{/g, '.markdown-body a {')
          .replace(/code\s*\{/g, '.markdown-body pre code {')
          // 最后替换单字母选择器
          .replace(/\bh1\s*\{/g, '.markdown-body h1 {')
          .replace(/\bh2\s*\{/g, '.markdown-body h2 {')
          .replace(/\bh3\s*\{/g, '.markdown-body h3 {')
          .replace(/\bh4\s*\{/g, '.markdown-body h4 {')
          .replace(/\bh5\s*\{/g, '.markdown-body h5 {')
          .replace(/\bh6\s*\{/g, '.markdown-body h6 {')
          .replace(/\bhr\s*\{/g, '.markdown-body hr {')
          .replace(/\bol\s*\{/g, '.markdown-body ol {')
          .replace(/\bul\s*\{/g, '.markdown-body ul {')
          .replace(/\bli\s*\{/g, '.markdown-body li {')
          .replace(/\bp\s*\{/g, '.markdown-body p {')
        
        // 第二步：为重要属性添加 !important
        customCSS = customCSS.replace(
          /(background-color|background-image|background-size|background-position|backdrop-filter|-webkit-backdrop-filter|border-radius|box-shadow|padding|border|color|font-family|font-size|line-height|max-width|margin|text-align)\s*:\s*([^;]+);/g,
          '$1: $2 !important;'
        )
        
        // 第三步：单独处理 background 简写属性（避免匹配到 background-color 等）
        customCSS = customCSS.replace(
          /\bbackground\s*:\s*([^;]+);/g,
          'background: $1 !important;'
        )
        
        // 替换 CSS 变量
        customCSS = customCSS
          .replace(/var\(--md-primary-color\)/g, effectiveThemeColor)
          .replace(/var\(--blockquote-background\)/g, editorTheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)')
          .replace(/hsl\(var\(--foreground\)\)/g, editorTheme === 'dark' ? '#c9d1d9' : '#24292f')
        
        console.log('转换后的 CSS:', customCSS)
        console.log('=== 转换完成 ===')
        
        themeStyles = sandboxCSS(customCSS)
        break
        
      case 'classic':
        // 经典主题：传统的文档样式
        themeStyles = `
      /* 经典主题 */
      .markdown-body {
        max-width: 800px !important;
        padding: 40px !important;
      }
      
      .markdown-body h1 {
        font-size: 2.5em !important;
        font-weight: 700 !important;
        margin-top: 0 !important;
        margin-bottom: 0.5em !important;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        -webkit-background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        background-clip: text !important;
        border-bottom: none !important;
      }
      
      .markdown-body h2 {
        font-size: 2em !important;
        font-weight: 600 !important;
        margin-top: 1.5em !important;
        margin-bottom: 0.5em !important;
        background: ${editorTheme === 'dark' ? 'rgba(102, 126, 234, 0.1)' : 'rgba(102, 126, 234, 0.08)'} !important;
        padding: 0.5em 1em !important;
        border-radius: 8px !important;
        border-left: 4px solid ${effectiveThemeColor} !important;
        border-bottom: none !important;
      }
      
      .markdown-body h3 {
        font-size: 1.5em !important;
        font-weight: 600 !important;
        margin-top: 1.2em !important;
        margin-bottom: 0.5em !important;
        color: ${effectiveThemeColor} !important;
        border-bottom: 2px dashed ${effectiveBorderColor} !important;
        padding-bottom: 0.3em !important;
      }
      
      .markdown-body p {
        margin-bottom: 1em !important;
        line-height: 1.8 !important;
      }
      
      .markdown-body blockquote {
        border-left: 4px solid ${effectiveBorderColor} !important;
        padding-left: 1em !important;
        margin: 1em 0 !important;
        color: #666 !important;
        font-style: italic !important;
        background: ${editorTheme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)'} !important;
        padding: 1em !important;
        border-radius: 4px !important;
      }
      
      .markdown-body code:not(pre code) {
        background: ${editorTheme === 'dark' ? '#2d333b' : '#f6f8fa'} !important;
        padding: 0.2em 0.4em !important;
        border-radius: 4px !important;
        border: 1px solid ${effectiveBorderColor} !important;
      }
        `
        break
        
      case 'elegant':
        // 优雅主题：更精致的排版
        themeStyles = `
      /* 优雅主题 */
      .markdown-body {
        max-width: 750px !important;
        padding: 60px !important;
      }
      
      .markdown-body h1 {
        font-size: 2.8em !important;
        font-weight: 300 !important;
        letter-spacing: -0.02em !important;
        margin-top: 0 !important;
        margin-bottom: 0.8em !important;
        text-align: center !important;
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%) !important;
        -webkit-background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        background-clip: text !important;
        padding: 0.5em 0 !important;
        border-bottom: 1px solid ${effectiveBorderColor} !important;
      }
      
      .markdown-body h2 {
        font-size: 1.8em !important;
        font-weight: 400 !important;
        letter-spacing: -0.01em !important;
        margin-top: 2em !important;
        margin-bottom: 0.8em !important;
        background: ${editorTheme === 'dark' ? 'rgba(245, 87, 108, 0.1)' : 'rgba(245, 87, 108, 0.08)'} !important;
        padding: 0.6em 1.2em !important;
        border-radius: 12px !important;
        box-shadow: 0 2px 8px ${editorTheme === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'} !important;
        border-bottom: none !important;
      }
      
      .markdown-body h3 {
        font-size: 1.4em !important;
        font-weight: 500 !important;
        margin-top: 1.5em !important;
        margin-bottom: 0.6em !important;
        color: ${effectiveThemeColor} !important;
        padding-left: 1em !important;
        border-left: 3px solid ${effectiveThemeColor} !important;
      }
      
      .markdown-body p {
        margin-bottom: 1.2em !important;
        line-height: 2 !important;
        text-align: justify !important;
      }
      
      .markdown-body p:first-letter {
        font-size: 1.5em !important;
        font-weight: 600 !important;
        color: ${effectiveThemeColor} !important;
      }
      
      .markdown-body blockquote {
        border-left: none !important;
        padding: 1.5em 2em !important;
        margin: 1.5em 0 !important;
        background: linear-gradient(135deg, ${editorTheme === 'dark' ? 'rgba(245, 87, 108, 0.1)' : 'rgba(245, 87, 108, 0.05)'} 0%, ${editorTheme === 'dark' ? 'rgba(240, 147, 251, 0.1)' : 'rgba(240, 147, 251, 0.05)'} 100%) !important;
        border-radius: 12px !important;
        font-style: italic !important;
        position: relative !important;
        box-shadow: 0 2px 12px ${editorTheme === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'} !important;
      }
      
      .markdown-body blockquote::before {
        content: '"' !important;
        font-size: 4em !important;
        position: absolute !important;
        left: 0.2em !important;
        top: -0.1em !important;
        color: ${effectiveThemeColor} !important;
        opacity: 0.3 !important;
      }
      
      .markdown-body code:not(pre code) {
        background: linear-gradient(135deg, ${editorTheme === 'dark' ? 'rgba(245, 87, 108, 0.15)' : 'rgba(245, 87, 108, 0.1)'} 0%, ${editorTheme === 'dark' ? 'rgba(240, 147, 251, 0.15)' : 'rgba(240, 147, 251, 0.1)'} 100%) !important;
        padding: 0.2em 0.6em !important;
        border-radius: 6px !important;
        font-weight: 500 !important;
      }
        `
        break
        
      case 'simple':
        // 简洁主题：极简风格
        themeStyles = `
      /* 简洁主题 */
      .markdown-body {
        max-width: 680px !important;
        padding: 30px !important;
      }
      
      .markdown-body h1 {
        font-size: 2em !important;
        font-weight: 700 !important;
        margin-top: 0 !important;
        margin-bottom: 1em !important;
        border-bottom: none !important;
        padding-bottom: 0 !important;
        background: ${editorTheme === 'dark' ? 'rgba(88, 166, 255, 0.1)' : 'rgba(9, 105, 218, 0.08)'} !important;
        padding: 0.5em 0.8em !important;
        border-radius: 6px !important;
      }
      
      .markdown-body h2 {
        font-size: 1.6em !important;
        font-weight: 600 !important;
        margin-top: 2em !important;
        margin-bottom: 0.8em !important;
        border-bottom: none !important;
        padding-bottom: 0 !important;
        background: linear-gradient(90deg, ${effectiveThemeColor} 0%, ${effectiveThemeColor} 4px, transparent 4px) !important;
        padding-left: 1em !important;
      }
      
      .markdown-body h3 {
        font-size: 1.3em !important;
        font-weight: 600 !important;
        margin-top: 1.5em !important;
        margin-bottom: 0.6em !important;
        color: ${effectiveThemeColor} !important;
      }
      
      .markdown-body p {
        margin-bottom: 1em !important;
        line-height: 1.7 !important;
      }
      
      .markdown-body blockquote {
        border-left: 2px solid ${effectiveBorderColor} !important;
        padding-left: 1em !important;
        margin: 1em 0 !important;
        color: #888 !important;
      }
      
      .markdown-body ul,
      .markdown-body ol {
        padding-left: 1.5em !important;
      }
      
      .markdown-body code:not(pre code) {
        background: ${editorTheme === 'dark' ? '#2d333b' : '#f6f8fa'} !important;
        padding: 0.2em 0.4em !important;
        border-radius: 3px !important;
        font-size: 0.9em !important;
      }
        `
        break
        
      case 'gradient':
        // 网格背景主题：带有网格背景的现代风格
        themeStyles = `
      /* 网格背景主题 */
      .markdown-body {
        max-width: 800px !important;
        padding: 40px !important;
        background-color: ${editorTheme === 'dark' ? '#1a1b26' : '#f8f9fa'} !important;
        background-image: 
          linear-gradient(${editorTheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'} 1px, transparent 1px),
          linear-gradient(90deg, ${editorTheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'} 1px, transparent 1px) !important;
        background-size: 20px 20px !important;
        background-position: 0 0 !important;
        border-radius: 16px !important;
        box-shadow: 0 4px 24px ${editorTheme === 'dark' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.1)'} !important;
        position: relative !important;
      }
      
      .markdown-body::before {
        content: '' !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        background: radial-gradient(circle at 20% 30%, ${editorTheme === 'dark' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)'} 0%, transparent 50%),
                    radial-gradient(circle at 80% 70%, ${editorTheme === 'dark' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(236, 72, 153, 0.08)'} 0%, transparent 50%) !important;
        border-radius: 16px !important;
        pointer-events: none !important;
        z-index: 0 !important;
      }
      
      .markdown-body > * {
        position: relative !important;
        z-index: 1 !important;
      }
      
      .markdown-body h1 {
        font-size: 2.5em !important;
        font-weight: 700 !important;
        margin-top: 0 !important;
        margin-bottom: 0.8em !important;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        -webkit-background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        background-clip: text !important;
        border-bottom: none !important;
        padding-bottom: 0 !important;
      }
      
      .markdown-body h2 {
        font-size: 2em !important;
        font-weight: 600 !important;
        margin-top: 2em !important;
        margin-bottom: 0.8em !important;
        background: ${editorTheme === 'dark' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)'} !important;
        padding: 0.5em 1em !important;
        border-radius: 12px !important;
        border-left: 4px solid ${effectiveThemeColor} !important;
        border-bottom: none !important;
      }
      
      .markdown-body h3 {
        font-size: 1.5em !important;
        font-weight: 600 !important;
        margin-top: 1.5em !important;
        margin-bottom: 0.6em !important;
        color: ${effectiveThemeColor} !important;
      }
      
      .markdown-body p {
        margin-bottom: 1.2em !important;
        line-height: 1.8 !important;
      }
      
      .markdown-body blockquote {
        border-left: 4px solid ${effectiveThemeColor} !important;
        padding: 1.5em 2em !important;
        margin: 1.5em 0 !important;
        background: ${editorTheme === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)'} !important;
        border-radius: 12px !important;
        font-style: italic !important;
        box-shadow: 0 2px 12px ${editorTheme === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'} !important;
      }
      
      .markdown-body code:not(pre code) {
        background: ${editorTheme === 'dark' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.15)'} !important;
        padding: 0.2em 0.6em !important;
        border-radius: 6px !important;
        font-weight: 500 !important;
        border: 1px solid ${editorTheme === 'dark' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)'} !important;
      }
      
      .markdown-body pre {
        background: ${editorTheme === 'dark' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.6)'} !important;
        border-radius: 12px !important;
        border: 1px solid ${editorTheme === 'dark' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)'} !important;
        box-shadow: 0 2px 12px ${editorTheme === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'} !important;
      }
        `
        break

      case 'retro-paper':
        // 复古纸张主题
        themeStyles = `
      .markdown-body {
        max-width: 880px !important;
        margin: 30px auto !important;
        padding: 30px 40px !important;
        background: #fef7eb !important;
        line-height: 1.8 !important;
        color: #4b453c !important;
        border-radius: 0 !important;
        border: 1px solid #d9c7b1 !important;
      }
      .markdown-body h1 {
        border: 2px solid #92400e !important;
        outline: 1px solid #92400e !important;
        outline-offset: 2px !important;
        padding: 12px 20px !important;
        text-align: center !important;
        font-size: 22px !important;
        color: #92400e !important;
      }
      .markdown-body h2 {
        border: 1px solid #b45309 !important;
        padding: 8px 16px !important;
        font-size: 19px !important;
        color: #b45309 !important;
      }
      .markdown-body h3 {
        border: 1px dashed #c97313 !important;
        padding: 6px 14px !important;
        font-size: 17px !important;
        color: #c97313 !important;
      }
      .markdown-body blockquote {
        background: #fae9cd !important;
        border-left: 4px solid #b45309 !important;
        padding: 14px !important;
      }
      .markdown-body pre {
        background: #fae9cd !important;
        padding: 16px !important;
        border: 1px solid #d9c7b1 !important;
      }
        `
        break
        
      case 'morandi':
        // 莫兰迪色系主题
        themeStyles = `
      /* 莫兰迪色系 - 全局容器样式 */
      .markdown-body {
        color: #5c5c5c !important;
        background-color: #f9f7f5 !important;
        padding: 24px 32px !important;
        max-width: 900px !important;
        margin: 0 auto !important;
        border-radius: 12px !important;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.03) !important;
      }
      
      /* 莫兰迪标题样式（带精致背景） */
      .markdown-body h1 {
        font-size: 32px !important;
        font-weight: 600;
        color: #ffffff !important;
        background: linear-gradient(90deg, #9f86c0, #be95c4) !important;
        border-radius: 10px !important;
        padding: 14px 20px 10px !important;
        margin: 40px 0 20px !important;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        border: none !important;
      }
      
      .markdown-body h2 {
        font-size: 28px !important;
        font-weight: 600;
        color: #ffffff !important;
        background: linear-gradient(90deg, #82c0cc, #9fd8df) !important;
        border-radius: 8px !important;
        padding: 12px 18px 8px !important;
        margin: 36px 0 18px !important;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        border: none !important;
      }
      
      .markdown-body h3 {
        font-size: 24px !important;
        font-weight: 600;
        color: #6a6a6a !important;
        background: rgba(202, 186, 161, 0.2) !important;
        border-radius: 6px !important;
        padding: 10px 16px !important;
        margin: 32px 0 16px !important;
        border-left: 4px solid #cabb9f !important;
      }
      
      .markdown-body h4 {
        font-size: 20px !important;
        font-weight: 600;
        color: #6a6a6a !important;
        background: rgba(168, 218, 220, 0.2) !important;
        border-radius: 6px !important;
        padding: 8px 14px !important;
        margin: 28px 0 14px !important;
        border-left: 4px solid #a8dadc !important;
      }
      
      .markdown-body h5 {
        font-size: 18px !important;
        font-weight: 600;
        color: #6a6a6a !important;
        background: rgba(221, 186, 198, 0.2) !important;
        border-radius: 6px !important;
        padding: 8px 14px !important;
        margin: 24px 0 12px !important;
        border: 1px solid #ddbabc !important;
        border-left: 4px solid #ddbabc !important;
      }
      
      .markdown-body h6 {
        font-size: 16px !important;
        font-weight: 600;
        color: #6a6a6a !important;
        background: rgba(186, 200, 206, 0.2) !important;
        border-radius: 6px !important;
        padding: 6px 12px !important;
        margin: 20px 0 10px !important;
      }
      
      /* 莫兰迪正文样式 */
      .markdown-body p {
        margin: 16px 0 !important;
        text-align: justify !important;
        color: #5c5c5c !important;
      }
      
      .markdown-body strong,
      .markdown-body b {
        font-weight: 700;
        color: #9f86c0 !important;
      }
      
      .markdown-body a {
        color: #82c0cc !important;
        text-decoration: none;
        border-bottom: 1px solid transparent;
      }
      
      .markdown-body a:hover {
        color: #9f86c0 !important;
        border-bottom: 1px solid #9f86c0;
      }
      
      /* 莫兰迪元素样式 */
      .markdown-body img {
        max-width: 100%;
        height: auto;
        border-radius: 10px !important;
        margin: 20px 0 !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
        border: 2px solid #e8e4e0 !important;
      }
      
      .markdown-body blockquote {
        background: rgba(190, 149, 196, 0.1) !important;
        border-left: 4px solid #be95c4 !important;
        padding: 16px 20px !important;
        margin: 20px 0 !important;
        border-radius: 8px !important;
        color: #6a6a6a !important;
        font-style: normal !important;
      }
      
      .markdown-body hr {
        border: none !important;
        border-top: 1px solid #e8e4e0 !important;
        margin: 32px 0 !important;
      }
      
      /* 列表样式 */
      .markdown-body ol {
        padding-left: 24px;
        margin: 16px 0 !important;
        color: #82c0cc !important;
      }
      
      .markdown-body ul {
        padding-left: 24px;
        margin: 16px 0 !important;
        list-style-type: circle !important;
        color: #a8dadc !important;
      }
      
      .markdown-body li {
        margin: 8px 0 !important;
        line-height: 1.7 !important;
        color: #5c5c5c !important;
      }
      
      /* 代码样式（低饱和度深色系） */
      .markdown-body pre {
        background-color: #f0eeec !important;
        border-radius: 8px !important;
        padding: 16px !important;
        margin: 20px 0 !important;
        overflow-x: auto;
        border: 1px solid #e8e4e0 !important;
      }
      
      .markdown-body pre code {
        font-size: 14px !important;
        color: #5c5c5c !important;
        line-height: 1.6 !important;
      }
      
      .markdown-body code:not(pre code) {
        background-color: rgba(190, 149, 196, 0.1) !important;
        color: #9f86c0 !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        font-size: 14px !important;
        border: 1px solid #e8e4e0 !important;
      }

      /* 莫兰迪表格样式 */
      .markdown-body table th,
      .markdown-body table td {
        border: 1px solid #e8e4e0 !important;
        padding: 8px 12px !important;
        color: #5c5c5c !important;
        background-color: transparent !important;
      }

      .markdown-body table th {
        background-color: rgba(159, 134, 192, 0.12) !important;
        color: #6a6a6a !important;
        font-weight: 600 !important;
      }

      .markdown-body table tr:nth-child(even) {
        background-color: rgba(202, 186, 161, 0.08) !important;
      }

      .markdown-body table tr:nth-child(odd) {
        background-color: #f9f7f5 !important;
      }

      /* 莫兰迪 Mermaid 图表样式 */
      .mermaid {
        background: rgba(249, 247, 245, 0.8) !important;
        border: 1px solid #e8e4e0 !important;
        border-radius: 8px !important;
      }
        `
        break
        
      default:
        themeStyles = ''
    }

    // elementStyles 是否有自定义设置的辅助判断
    const elHasCustom = (key) => {
      const el = exportConfig.elementStyles?.[key]
      return el && (el.color || (el.preset && el.preset !== 'default') || (el.customCSS && el.customCSS.trim()))
    }
    // 某元素的某属性是否在 customCSS 中被自定义（含完整规则块）
    const elCustomHasProp = (key, prop) => {
      const css = exportConfig.elementStyles?.[key]?.customCSS || ''
      return css.includes(prop)
    }

    styleEl.textContent = `
      ${themeStyles}
      
      /* 主题色覆盖（仅当未被 elementStyles 自定义时才应用） */
      ${exportConfig.themeColor ? `
      ${!elHasCustom('h1') && !elHasCustom('h2') && !elHasCustom('h3') && !elHasCustom('h4') && !elHasCustom('h5') && !elHasCustom('h6') ? `
      .markdown-body h1, .markdown-body h2, .markdown-body h3,
      .markdown-body h4, .markdown-body h5, .markdown-body h6 {
        color: ${exportConfig.headingColor === 'theme' ? effectiveHeadingColor : 'inherit'} !important;
      }` : [
        'h1','h2','h3','h4','h5','h6'
      ].filter(h => !elHasCustom(h)).map(h =>
        `.markdown-body ${h} { color: ${exportConfig.headingColor === 'theme' ? effectiveHeadingColor : 'inherit'} !important; }`
      ).join('\n      ')}
      
      ${!elHasCustom('h1') && !elCustomHasProp('h1','border') ? `
      .markdown-body h1.markdown-heading, .markdown-body h1 {
        border-bottom: 2px solid ${effectiveBorderColor} !important;
        padding-bottom: 0.3em !important;
      }` : ''}
      
      ${!elHasCustom('h2') && !elCustomHasProp('h2','border') ? `
      .markdown-body h2.markdown-heading, .markdown-body h2 {
        border-bottom: 2px solid ${effectiveBorderColor} !important;
        padding-bottom: 0.3em !important;
      }` : ''}
      ` : ''}
      
      .markdown-body p {
        text-indent: ${exportConfig.paragraphIndent ? '2em' : '0'} !important;
        text-align: ${exportConfig.paragraphJustify ? 'justify' : (exportConfig.textAlign || 'left')} !important;
      }

      /* 代码块主题背景 */
      .markdown-body pre {
        background: ${currentThemeBg} !important;
      }

      .markdown-body pre code {
        background: transparent !important;
        ${currentThemeColor !== 'inherit' ? `color: ${currentThemeColor} !important;` : ''}
      }

      /* 移除代码高亮的背景色 - 使用更强的选择器 */
      .markdown-body pre code *,
      .markdown-body pre code span,
      .markdown-body pre code [class*="hljs"] {
        background: none !important;
        background-color: transparent !important;
      }

      /* Mac 风格代码块 */
      ${exportConfig.macCodeBlock ? `
        .markdown-body pre {
          position: relative;
          padding-top: 30px !important;
          border-radius: 8px !important;
        }
        
        .markdown-body pre::before {
          content: '';
          position: absolute;
          top: 10px;
          left: 12px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #ff5f56;
          box-shadow: 20px 0 0 #ffbd2e, 40px 0 0 #27c93f;
        }
      ` : ''}

      /* 图注格式控制 */
      .markdown-body figure.image-figure {
        display: block;
        text-align: center;
        margin: 1em 0;
      }

      .markdown-body figure.image-figure img {
        max-width: 100%;
        height: auto;
      }

      .markdown-body figure.image-figure figcaption {
        margin-top: 0.5em;
        font-size: 0.9em;
        color: #666;
        text-align: center;
      }

      /* title-first: 优先显示 title，没有则显示 alt */
      .markdown-body[data-caption-format="title-first"] figure.image-figure figcaption::before {
        content: attr(data-title);
      }

      .markdown-body[data-caption-format="title-first"] figure.image-figure[data-title=""] figcaption::before {
        content: attr(data-alt);
      }

      /* alt-first: 优先显示 alt，没有则显示 title */
      .markdown-body[data-caption-format="alt-first"] figure.image-figure figcaption::before {
        content: attr(data-alt);
      }

      .markdown-body[data-caption-format="alt-first"] figure.image-figure[data-alt=""] figcaption::before {
        content: attr(data-title);
      }

      /* title-only: 只显示 title */
      .markdown-body[data-caption-format="title-only"] figure.image-figure figcaption::before {
        content: attr(data-title);
      }

      /* alt-only: 只显示 alt */
      .markdown-body[data-caption-format="alt-only"] figure.image-figure figcaption::before {
        content: attr(data-alt);
      }

      /* no-caption: 不显示图注 */
      .markdown-body[data-caption-format="no-caption"] figure.image-figure figcaption {
        display: none;
      }

      /* 外链转脚注控制 */
      .markdown-body[data-wechat-link-footnote="true"] a.external-link {
        text-decoration: none;
      }

      .markdown-body[data-wechat-link-footnote="true"] a.external-link::after {
        content: "[" attr(data-footnote-index) "]";
        vertical-align: super;
        font-size: 0.8em;
        color: ${effectiveThemeColor};
      }

      /* 脚注样式 */
      .markdown-body .footnotes-section {
        margin-top: 3em;
        padding-top: 1em;
        border-top: 1px solid var(--border-color, #ddd);
      }

      .markdown-body .footnotes-section h3 {
        font-size: 1.2em;
        margin-bottom: 0.5em;
      }

      .markdown-body .footnotes-list {
        font-size: 0.9em;
        color: var(--text-secondary, #666);
        padding-left: 2em;
      }

      .markdown-body .footnotes-list li {
        margin-bottom: 0.5em;
        word-break: break-all;
      }

      .markdown-body sup {
        color: ${effectiveThemeColor};
        font-weight: bold;
      }

      /* 目录样式 */
      .markdown-body .table-of-contents {
        background: ${editorTheme === 'dark' ? '#161b22' : '#f6f8fa'};
        border: 1px solid ${editorTheme === 'dark' ? '#30363d' : '#d0d7de'};
        border-radius: 8px;
        padding: 16px 20px;
        margin: 20px 0;
      }

      .markdown-body .table-of-contents h2 {
        margin: 0 0 12px 0;
        font-size: 1.2em;
        border-bottom: none !important;
        padding-bottom: 0 !important;
      }

      .markdown-body .table-of-contents ul {
        list-style: none;
        padding-left: 0;
        margin: 0;
      }

      .markdown-body .table-of-contents li {
        margin: 6px 0;
      }

      .markdown-body .table-of-contents a {
        text-decoration: none;
        color: ${effectiveThemeColor};
        transition: opacity 0.2s;
      }

      .markdown-body .table-of-contents a:hover {
        opacity: 0.7;
      }

      .markdown-body .table-of-contents .toc-h2 {
        padding-left: 0;
      }

      .markdown-body .table-of-contents .toc-h3 {
        padding-left: 1.5em;
      }

      .markdown-body .table-of-contents .toc-h4 {
        padding-left: 3em;
      }
      
      /* 自定义主题的额外样式（确保最高优先级） */
      ${exportConfig.theme === 'custom' && exportConfig.customCSS ? sandboxCSS(
        exportConfig.customCSS
          .replace(/var\(--md-primary-color\)/g, effectiveThemeColor)
          .replace(/var\(--blockquote-background\)/g, editorTheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)')
      ) : ''}

      /* 强制注脚返回箭头 ↩ 显示为文本而非 emoji */
      .markdown-body .data-footnote-backref { font-family: monospace; font-variant-emoji: text; }
      .markdown-body .footnotes .data-footnote-backref g-emoji { font-family: monospace; font-variant-emoji: text; }

      /* 细则样式管理（elementStyles）覆盖样式 */
      ${(() => {
        const es = exportConfig.elementStyles || {}
        const tc = exportConfig.themeColor || effectiveThemeColor
        const selectorMap = {
          h1: '.markdown-body h1', h2: '.markdown-body h2',
          h3: '.markdown-body h3', h4: '.markdown-body h4',
          h5: '.markdown-body h5', h6: '.markdown-body h6',
          p: '.markdown-body p', strong: '.markdown-body strong, .markdown-body b',
          link: '.markdown-body a', ul: '.markdown-body ul', ol: '.markdown-body ol',
          blockquote: '.markdown-body blockquote',
          codespan: '.markdown-body code:not(pre code)',
          code_pre: '.markdown-body pre', hr: '.markdown-body hr',
          image: '.markdown-body img', bg: '.markdown-body',
        }
        return Object.entries(selectorMap).map(([key, sel]) => {
          const el = es[key] || {}
          const props = []
          const preset = el.preset || 'default'
          // 预设（最低优先级）
          if (preset === 'border-bottom') { props.push(`border-bottom: 2px solid ${tc} !important`); props.push(`padding-bottom: 0.3em !important`) }
          else if (preset === 'border-left') { props.push(`border-left: 4px solid ${tc} !important`); props.push(`padding-left: 0.8em !important`); props.push(`border-bottom: none !important`) }
          else if (preset === 'theme-bg') { props.push(`display: table !important`); props.push(`padding: 0.3em 1.2em !important`); props.push(`color: #fff !important`); props.push(`background: ${tc} !important`); props.push(`border-radius: 6px !important`) }
          else if (preset === 'indent') props.push(`text-indent: 2em !important`)
          else if (preset === 'justify') props.push(`text-align: justify !important`)
          else if (preset === 'underline') props.push(`text-decoration: underline !important`)
          else if (preset === 'no-underline') props.push(`text-decoration: none !important`)
          else if (preset === 'rounded') props.push(`border-radius: 8px !important`)
          else if (preset === 'shadow') props.push(`box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important`)
          else if (preset === 'gradient' && key === 'hr') { props.push(`background: linear-gradient(to right,transparent,${tc},transparent) !important`); props.push(`height: 1px !important`); props.push(`border: none !important`) }
          else if (preset === 'gradient' && key === 'bg') { props.push(`background: linear-gradient(135deg, ${tc}18 0%, ${tc}08 50%, transparent 100%) !important`); props.push(`padding: 2rem !important`) }
          else if (preset === 'filled') { props.push(`background: ${tc}18 !important`); props.push(`border-left: 4px solid ${tc} !important`) }
          else if (preset === 'grid') { props.push(`background-image: linear-gradient(rgba(0,0,0,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.05) 1px,transparent 1px) !important`); props.push(`background-size: 20px 20px !important`); if (key === 'bg') props.push(`padding: 2rem !important`) }
          else if (preset === 'dots') { props.push(`background-image: radial-gradient(rgba(0,0,0,0.05) 0.5px,transparent 0.5px) !important`); props.push(`background-size: 8px 8px !important`); if (key === 'bg') props.push(`padding: 2rem !important`) }
          else if (preset === 'stripe') { props.push(`background-image: repeating-linear-gradient(to bottom,transparent,transparent 19px,rgba(0,0,0,0.04) 19px,rgba(0,0,0,0.04) 20px) !important`); if (key === 'bg') props.push(`padding: 2rem !important`) }
          else if (preset === 'none') props.push(`list-style-type: none !important`)
          else if (preset === 'disc') props.push(`list-style-type: disc !important`)
          else if (preset === 'decimal') props.push(`list-style-type: decimal !important`)
          else if (preset === 'roman') props.push(`list-style-type: upper-roman !important`)
          else if (preset === 'dashed') { props.push(`border: none !important`); props.push(`border-top: 2px dashed ${tc} !important`); props.push(`height: 0 !important`) }
          else if (preset === 'pill') { props.push(`border-radius: 999px !important`); props.push(`padding: 0.1em 0.6em !important`) }
          else if (preset === 'center') { props.push(`display: block !important`); props.push(`margin: 1em auto !important`) }
          // 自定义 CSS 简单属性（中优先级，覆盖预设）
          const scopedRules = []
          if (el.customCSS && el.customCSS.trim()) {
            const raw = el.customCSS.trim()
            if (raw.includes('{')) {
              // 完整 CSS 规则块：只保留与当前元素选择器匹配的规则
              scopedRules.push(sandboxCSSForElement(raw, sel))
            } else {
              raw.split(';').map(s => s.trim()).filter(Boolean).forEach(p => { props.push(p.includes('!important') ? p : `${p} !important`) })
            }
          }
          if (props.length === 0 && scopedRules.length === 0 && !el.color) return ''
          // 颜色（最高优先级，在预设和自定义CSS之后写入，确保覆盖）
          if (el.color) {
            if (key === 'bg') props.push(`background-color: ${el.color} !important`)
            else if (key === 'hr') {
              // hr 是空元素，颜色需映射到对应属性
              if (preset === 'dashed') props.push(`border-top-color: ${el.color} !important`)
              else props.push(`background: ${el.color} !important`)
            }
            else props.push(`color: ${el.color} !important`)
          }
          if (props.length === 0 && scopedRules.length === 0) return ''
          const baseRule = props.length > 0 ? `${sel} { ${props.join('; ')} }` : ''
          return [baseRule, ...scopedRules].filter(Boolean).join('\n      ')
        }).filter(Boolean).join('\n      ')
      })()}

      /* 链接颜色最终覆盖（确保 elementStyles 设置生效） */
      ${exportConfig.elementStyles?.link?.color ? `
      .markdown-body a,
      .markdown-body a:link,
      .markdown-body a:visited {
        color: ${exportConfig.elementStyles.link.color} !important;
        -webkit-text-fill-color: ${exportConfig.elementStyles.link.color} !important;
      }` : ''}

      /* 代码块滚动条：根据导出配置中代码主题 CSS 的背景色自动调整 */
      ${(() => {
        const themeBackgrounds = {
          'github': '#f6f8fa', 'github-dark': '#0d1117', 'vs': '#ffffff', 'vs2015': '#1e1e1e',
          'dracula': '#282a36', 'atom-one-dark': '#282c34', 'solarized-light': '#fdf6e3',
          'solarized-dark': '#002b36', 'nord': '#2e3440', 'monokai': '#272822', 'material': '#263238'
        }
        let codeBg = themeBackgrounds[exportConfig.codeTheme] || themeBackgrounds['github']
        const codePre = exportConfig.elementStyles?.code_pre
        if (codePre?.customCSS) {
          const m = codePre.customCSS.match(/(?:background(?:-color)?|background)\s*:\s*([#a-fA-F0-9()%,.\s]+)/)
          if (m) {
            const v = m[1].trim()
            if (/^#[0-9a-fA-F]{3,8}$/.test(v)) codeBg = v
            else if (/^rgb|^rgba|^hsl|^hsla/.test(v)) codeBg = v
          }
        }
        const hexToLuminance = (hex) => {
          const h = hex.replace('#', '')
          const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
          const r = parseInt(full.slice(0, 2), 16)
          const g = parseInt(full.slice(2, 4), 16)
          const b = parseInt(full.slice(4, 6), 16)
          return (r * 299 + g * 587 + b * 114) / 1000
        }
        const isDark = /^#[0-9a-fA-F]{3,8}$/i.test(codeBg) ? hexToLuminance(codeBg) < 128 : (codeBg + '').toLowerCase().includes('dark') || (codeBg + '').includes('0d1117') || (codeBg + '').includes('2728') || (codeBg + '').includes('282a') || (codeBg + '').includes('2632')
        const thumb = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.2)'
        const thumbHover = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)'
        return `
      .markdown-body pre::-webkit-scrollbar { width: 8px; height: 8px; }
      .markdown-body pre::-webkit-scrollbar-track { background: transparent; border-radius: 4px; }
      .markdown-body pre::-webkit-scrollbar-thumb { background: ${thumb}; border-radius: 4px; }
      .markdown-body pre::-webkit-scrollbar-thumb:hover { background: ${thumbHover}; }
      .markdown-body pre { scrollbar-color: ${thumb} transparent; scrollbar-width: thin; }
      `
      })()}
    `
    
    // 调试：输出生成的样式
    console.log('[useEffect-预览] 样式已生成');
    console.log('[useEffect-预览] 主题:', exportConfig.theme);
    console.log('[useEffect-预览] 样式长度:', styleEl.textContent.length);
    console.log('[useEffect-预览] 样式预览（前 500 字符）:', styleEl.textContent.substring(0, 500));
    
    // 强制应用 H1 和 H2 的边框颜色（使用内联样式作为最终保障）
    setTimeout(() => {
      const preview = document.querySelector('.markdown-body')
      if (preview) {
        // 动态检测主题背景亮暗，注入 data-theme-bg 属性
        // 规则：主题有明确背景色时跟随主题，否则跟随编辑器主题
        let themeBg = editorTheme === 'dark' ? 'dark' : 'light'

        if (exportConfig.theme === 'morandi') {
          // 莫兰迪固定亮色背景
          themeBg = 'light'
        } else if (exportConfig.theme === 'gradient') {
          // gradient 主题背景色跟随编辑器主题
          themeBg = editorTheme === 'dark' ? 'dark' : 'light'
        } else if (exportConfig.theme === 'custom' && exportConfig.customCSS) {
          // 自定义主题：解析 container 块中的 background-color
          const bgMatch = exportConfig.customCSS.match(/container\s*\{[^}]*background(?:-color)?\s*:\s*([^;!]+)/)
          if (bgMatch) {
            const bgVal = bgMatch[1].trim()
            // 简单判断：暗色关键词或深色 hex
            const isDarkBg = /^#([0-9a-f]{3}){1,2}$/i.test(bgVal)
              ? (() => {
                  const hex = bgVal.replace('#', '')
                  const full = hex.length === 3
                    ? hex.split('').map(c => c + c).join('')
                    : hex
                  const r = parseInt(full.slice(0,2), 16)
                  const g = parseInt(full.slice(2,4), 16)
                  const b = parseInt(full.slice(4,6), 16)
                  // 亮度公式
                  return (r * 299 + g * 587 + b * 114) / 1000 < 128
                })()
              : /dark|black|#[012][0-9a-f]{5}|#[0-9a-f]{3}(?=\s|;|$)/i.test(bgVal)
            themeBg = isDarkBg ? 'dark' : 'light'
          }
        }

        preview.setAttribute('data-theme-bg', themeBg)

        // 提取主题的纯背景色（background-color，不含 background-image 网格/纹理）
        // 注入到表格和 mermaid，避免网格背景影响阅读
        // 直接从主题配置推算，不依赖 getComputedStyle（避免时序问题）
        let solidBg = editorTheme === 'dark' ? '#0d1117' : '#ffffff'

        if (exportConfig.theme === 'morandi') {
          solidBg = '#f9f7f5'
        } else if (exportConfig.theme === 'gradient') {
          solidBg = editorTheme === 'dark' ? '#1a1b26' : '#f8f9fa'
        } else if (exportConfig.theme === 'custom' && exportConfig.customCSS) {
          // 从自定义 CSS 的 container 块中提取 background-color（支持多行）
          const bgColorMatch = exportConfig.customCSS.match(/container\s*\{[\s\S]*?background-color\s*:\s*([^;!\n]+)/)
          if (bgColorMatch) {
            solidBg = bgColorMatch[1].trim()
          } else {
            // 尝试匹配 background 简写（只取纯色值，忽略渐变）
            // Safari/iOS 对 lookbehind 支持不稳定，这里改用前置分组避免正则语法报错
            const bgMatch = exportConfig.customCSS.match(/container\s*\{[\s\S]*?(?:^|[^\w-])background\s*:\s*(#[0-9a-fA-F]{3,8}|rgb[^;]+|hsl[^;]+)/)
            if (bgMatch) solidBg = bgMatch[1].trim()
          }
        }

        // 用户通过「细则配色管理-背景」设置的颜色优先级最高，覆盖主题推算值
        if (exportConfig.bgColor) {
          solidBg = exportConfig.bgColor
        } else if (exportConfig.bgCSS) {
          const m = exportConfig.bgCSS.match(/background-color\s*:\s*([^;!\n]+)/i)
            || exportConfig.bgCSS.match(/(?:^|[^\w-])background\s*:\s*(#[0-9a-fA-F]{3,8}|rgb[^;]+|hsl[^;]+)/i)
          if (m) solidBg = m[1].trim()
        }

        // 注入或更新动态表格/mermaid 背景色样式
        let tableBgStyleEl = document.getElementById('table-mermaid-bg-styles')
        if (!tableBgStyleEl) {
          tableBgStyleEl = document.createElement('style')
          tableBgStyleEl.id = 'table-mermaid-bg-styles'
          document.head.appendChild(tableBgStyleEl)
        }
        tableBgStyleEl.textContent = `
          /* 强制整体预览容器背景，避免只在表格/图表显示背景 */
          .app .markdown-body {
            background-color: ${solidBg} !important;
          }
          .app .preview-pane .markdown-body,
          .app .preview-panel .markdown-body,
          .app .editor-preview-wrapper .markdown-body {
            background-color: ${solidBg} !important;
          }

          .app .markdown-body table th,
          .app .markdown-body table td {
            background-color: ${solidBg} !important;
          }
          .app .markdown-body table tr,
          .app .markdown-body table tr:nth-child(even),
          .app .markdown-body table tr:nth-child(odd) {
            background-color: ${solidBg} !important;
          }
          .app .markdown-body .mermaid {
            background: ${solidBg} !important;
          }
        `

        // 标记是否使用自定义主题（有背景色的主题都标记，用于阻止暗黑模式全局样式覆盖）
        const themesWithBg = ['custom', 'gradient', 'morandi']
        if (themesWithBg.includes(exportConfig.theme) || exportConfig.bgColor || exportConfig.bgCSS) {
          preview.setAttribute('data-custom-theme', 'true')
          // 同步标记预览区内所有 mermaid 图表
          preview.querySelectorAll('.mermaid').forEach(el => {
            el.classList.add('custom-theme-mermaid')
          })
        } else {
          preview.removeAttribute('data-custom-theme')
          preview.querySelectorAll('.mermaid').forEach(el => {
            el.classList.remove('custom-theme-mermaid')
          })
        }
        
        // 设置图注格式和脚注的 data 属性
        preview.setAttribute('data-caption-format', exportConfig.captionFormat || 'title-first')
        preview.setAttribute('data-wechat-link-footnote', exportConfig.wechatLinkToFootnote ? 'true' : 'false')
        
        // 手动更新图注内容（用户切换图注格式时生效）
        updateFigureCaptionsInPreview(preview, exportConfig.captionFormat)
        
        // 手动更新外链脚注显示
        const footnotesSection = preview.querySelector('.footnotes-section')
        if (footnotesSection) {
          footnotesSection.style.display = exportConfig.wechatLinkToFootnote ? 'block' : 'none'
        }
        
        const externalLinks = preview.querySelectorAll('a.external-link')
        externalLinks.forEach((link) => {
          const existingSup = link.querySelector('sup')
          if (existingSup) {
            existingSup.remove()
          }
          
          if (exportConfig.wechatLinkToFootnote) {
            const index = link.getAttribute('data-footnote-index')
            if (index) {
              const sup = document.createElement('sup')
              sup.textContent = `[${index}]`
              link.appendChild(sup)
            }
          }
        })
        
        // 设置 H1 和 H2 边框颜色
        const h1Elements = preview.querySelectorAll('h1')
        const h2Elements = preview.querySelectorAll('h2')
        
        h1Elements.forEach(h1 => {
          h1.style.setProperty('border-bottom-color', effectiveBorderColor, 'important')
          console.log('强制设置 H1 边框颜色:', effectiveBorderColor)
        })
        
        h2Elements.forEach(h2 => {
          h2.style.setProperty('border-bottom-color', effectiveBorderColor, 'important')
          console.log('强制设置 H2 边框颜色:', effectiveBorderColor)
        })
        
        // 生成目录（TOC）
        if (exportConfig.includeTOC) {
          // 移除旧的目录
          const oldToc = preview.querySelector('.table-of-contents')
          if (oldToc) {
            oldToc.remove()
          }
          
          // 收集所有标题
          const headings = preview.querySelectorAll('h1, h2, h3, h4')
          if (headings.length > 0) {
            const toc = document.createElement('div')
            toc.className = 'table-of-contents'
            
            const tocTitle = document.createElement('h2')
            tocTitle.textContent = '目录'
            toc.appendChild(tocTitle)
            
            const tocList = document.createElement('ul')
            
            headings.forEach((heading, index) => {
              // 为标题添加 id（如果没有）
              if (!heading.id) {
                heading.id = `heading-${index}`
              }
              
              const li = document.createElement('li')
              li.className = `toc-${heading.tagName.toLowerCase()}`
              
              const link = document.createElement('a')
              link.href = `#${heading.id}`
              link.textContent = heading.textContent
              
              li.appendChild(link)
              tocList.appendChild(li)
            })
            
            toc.appendChild(tocList)
            
            // 将目录插入到第一个标题之前
            const firstHeading = preview.querySelector('h1, h2, h3, h4, h5, h6')
            if (firstHeading) {
              firstHeading.parentNode.insertBefore(toc, firstHeading)
            } else {
              preview.insertBefore(toc, preview.firstChild)
            }
          }
        } else {
          // 移除目录
          const oldToc = preview.querySelector('.table-of-contents')
          if (oldToc) {
            oldToc.remove()
          }
        }
      }
    }, 100)
  }, [exportConfig, editorTheme, previewLayoutVersion])

  // 使用 useMemo 缓存 Markdown 处理器，避免每次渲染都重新创建
  const markdownProcessor = useMemo(() => {
    return createMarkdownProcessor()
  }, []) // 空依赖数组，只创建一次

  const [rootDirs, setRootDirs] = useState([])
  const [mermaidLoaded, setMermaidLoaded] = useState(false)
  const previewRef = useRef(null)
  const editorRef = useRef(null)
  const fileTreeRef = useRef(null)

  // Mermaid is content-driven: as soon as content contains Mermaid blocks, start fetching the chunk.
  // This runs immediately (not idle) and does not require any user interaction.
  useEffect(() => {
    if (!hasMermaid(content)) return
    let cancelled = false
    loadMermaid()
      .then(() => {
        if (!cancelled) setMermaidLoaded(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [content])

  useEffect(() => {
    if (!hasInfographic(content)) return
    let cancelled = false
    loadInfographic()
      .then(() => {
        if (!cancelled) setInfographicLoaded(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [content])
  
  // 防止编辑区和预览区滚动穿透
  usePreventScrollThrough(previewRef)
  usePreventScrollThrough(editorRef)
  
  // 优化滚动性能：使用 Passive Event Listeners
  useEffect(() => {
    const preview = previewRef.current
    const editor = editorRef.current
    
    const handleScroll = (e) => {
      e.stopPropagation() // 阻止事件冒泡，确保滚动独立
    }
    
    // passive: true 告诉浏览器不会调用 preventDefault()
    // 浏览器可以立即开始滚动，不需要等待 JS 执行
    preview?.addEventListener('scroll', handleScroll, { passive: true })
    editor?.addEventListener('scroll', handleScroll, { passive: true })
    
    return () => {
      preview?.removeEventListener('scroll', handleScroll)
      editor?.removeEventListener('scroll', handleScroll)
    }
  }, [])
  
  // 实时保存编辑器内容到 ref，供 AI 引用全文使用（避免防抖导致 state 滞后）
  const editorContentRef = useRef('')

  // 防抖的内容更新处理（优化编辑器输入性能）
  const debouncedSetContent = useMemo(
    () => debounce((value) => {
      setContent(value || '')
    }, 150), // 150ms 防抖，平衡响应速度和性能
    []
  )
  
  // 清理防抖函数
  useEffect(() => {
    return () => {
      debouncedSetContent.cancel()
    }
  }, [debouncedSetContent])

  // 编辑器 onChange：同步更新 ref（供 AI 引用全文），防抖更新 state
  const handleEditorChange = useCallback(
    (value) => {
      const nextValue = value || ''
      editorContentRef.current = nextValue
      debouncedSetContent(nextValue)

      const editor = editorRef.current
      if (!editor) return

      const model = editor.getModel()
      const position = editor.getPosition()
      if (!model || !position) return

      const lineText = model.getLineContent(position.lineNumber)
      const textBeforeCursor = lineText.slice(0, Math.max(position.column - 1, 0))
      const slashMatch = textBeforeCursor.match(/\/(\S*)$/)

      if (!slashMatch) {
        setSlashMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev))
        return
      }

      const query = slashMatch[1] || ''
      const triggerStartColumn = position.column - slashMatch[0].length
      const cursorCoords = editor.getScrolledVisiblePosition(position)
      const editorDomNode = editor.getDomNode()

      if (!cursorCoords || !editorDomNode) return

      const editorRect = editorDomNode.getBoundingClientRect()
      setSlashMenu({
        visible: true,
        x: editorRect.left + cursorCoords.left,
        y: editorRect.top + cursorCoords.top + cursorCoords.height + 6,
        query,
        range: {
          startLineNumber: position.lineNumber,
          startColumn: triggerStartColumn,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
      })
    },
    [debouncedSetContent]
  )

  // 同步 content 到 ref（文件加载、恢复等场景）
  useEffect(() => {
    editorContentRef.current = content
  }, [content])
  const fileTreeSwipeRef = useRef({
    tracking: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    deltaX: 0,
    deltaY: 0,
  })
  const fileTreeSwipeCloseTimerRef = useRef(null)
  const fileTreeEdgeSwipeRef = useRef({
    tracking: false,
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
  })
  const paneSwipeRef = useRef({
    active: false,
    decided: false,
    tracking: false,
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
  })
  const [isCompactViewport, setIsCompactViewport] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 1024px)').matches
  })
  const [isSingleColumnViewport, setIsSingleColumnViewport] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(MOBILE_SINGLE_COLUMN_MEDIA_QUERY).matches
  })
  const [mobileActivePane, setMobileActivePane] = useState('editor')
  const [showMobileOutlinePanel, setShowMobileOutlinePanel] = useState(false)
  const [isVirtualKeyboardOpen, setIsVirtualKeyboardOpen] = useState(false)
  const [fileTreeSwipeOffset, setFileTreeSwipeOffset] = useState(0)
  const [isFileTreeSwipeDragging, setIsFileTreeSwipeDragging] = useState(false)
  const [isFileTreeClosing, setIsFileTreeClosing] = useState(false)
  const [isExportConfigClosing, setIsExportConfigClosing] = useState(false)
  const [editorInstance, setEditorInstance] = useState(null)
  const [editorScrollTop, setEditorScrollTop] = useState(0)
  const syncPreviewWithEditorRef = useRef(syncPreviewWithEditor)
  const editorThemeRef = useRef(editorTheme)
  // 跟踪上次保存的内容（用于自动保存优化）
  const lastSavedContentRef = useRef('')
  const lastSavedPathRef = useRef('')
  const pendingSwitchPathRef = useRef(null)
  const initialDocumentHandledRef = useRef(false)
  // 自动保存定时器
  const autoSaveTimerRef = useRef(null)
  // 面板宽度状态
  const [fileTreeWidth, setFileTreeWidth] = useState(DEFAULT_APP_STATE.fileTreeWidth)
  const [editorWidth, setEditorWidth] = useState(DEFAULT_APP_STATE.editorWidth)
  const [exportConfigPanelWidth, setExportConfigPanelWidth] = useState(DEFAULT_APP_STATE.exportConfigPanelWidth)

  // Toast 通知状态
  const [toasts, setToasts] = useState([])
  const [confirmDialogState, setConfirmDialogState] = useState(null)

  const isAdaptiveSinglePaneViewport = isSingleColumnViewport
  const isTabletCompactViewport = isCompactViewport && !isSingleColumnViewport
  const compactFileTreePanelWidth = useMemo(() => {
    if (typeof window === 'undefined') {
      return fileTreeWidth
    }

    return Math.min(fileTreeWidth, Math.max(window.innerWidth - 24, 0))
  }, [fileTreeWidth])
  const fileTreeSwipeProgress = compactFileTreePanelWidth > 0
    ? Math.min(Math.abs(fileTreeSwipeOffset) / compactFileTreePanelWidth, 1)
    : 0

  const effectiveLayout = useMemo(() => {
    if (focusMode === 'split') {
      return 'vertical'
    }

    if (focusMode === 'editor-only') {
      return 'editor-only'
    }

    if (!isAdaptiveSinglePaneViewport) {
      return layout
    }

    if (showExportConfigPanel) {
      return 'preview-only'
    }

    return mobileActivePane === 'preview' ? 'preview-only' : 'editor-only'
  }, [focusMode, isAdaptiveSinglePaneViewport, layout, mobileActivePane, showExportConfigPanel])

  // 移动端禁用专注模式（不显示入口且自动回退）
  useEffect(() => {
    if (isAdaptiveSinglePaneViewport && focusMode !== 'off') {
      setFocusMode('off')
    }
  }, [isAdaptiveSinglePaneViewport, focusMode])

  // 当预览区变为可见时触发样式应用（解决移动端切换后 Mac 代码块、代码主题未加载的问题）
  useEffect(() => {
    if (effectiveLayout === 'preview-only' || effectiveLayout === 'vertical') {
      setPreviewLayoutVersion((v) => v + 1)
    }
  }, [effectiveLayout])

  const currentDocumentName = useMemo(() => {
    if (documentTitle?.trim()) {
      return documentTitle.trim()
    }

    if (!currentPath) {
      return '未命名文档'
    }

    return currentPath.split('/').pop() || currentPath
  }, [documentTitle, currentPath])

  const currentDocumentMeta = useMemo(() => {
    return currentPath || '未保存'
  }, [currentPath])

  const currentFontDownloadInfo = useMemo(() => {
    const family = (editorFontFamily || '').trim()
    if (!family) return null
    const state = fontDownloadState[family]
    return {
      family,
      needsDownload: isRemoteFontFamily(family),
      status: state?.status || null,
      message: state?.message || null,
      progress: typeof state?.progress === 'number' ? state.progress : 0,
      canManualDownload: isRemoteFontFamily(family) && state?.status !== 'loaded',
    }
  }, [editorFontFamily, fontDownloadState])

  editorThemeRef.current = editorTheme

  // 读取本地字体缓存状态（后端持久化）
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch('/api/font-cache/status')
        const data = await safeParseJsonResponse(res, { ok: false })
        if (!res.ok || !data?.ok || cancelled) return

        const cache = data.cache || {}
        setLocalFontCacheMap(cache)
        Object.entries(cache).forEach(([family, entry]) => {
          if (!entry || entry.status !== 'cached') return
          injectLocalFontCacheEntry(family, entry)
          setFontDownloadState((prev) => ({
            ...prev,
            [family]: {
              ...(prev[family] || {}),
              status: 'loaded',
              message: '字体已从本地缓存加载',
              progress: 100,
              updatedAt: Date.now(),
            },
          }))
        })
      } catch (error) {
        console.error('[App] 读取本地字体缓存状态失败:', error)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  // 动态下载编辑器字体，并向用户显示下载状态（支持手动触发）
  useEffect(() => {
    const family = (editorFontFamily || '').trim()
    if (!family || !isRemoteFontFamily(family)) return

    const cachedEntry = localFontCacheMap[family]
    if (cachedEntry?.status === 'cached') {
      injectLocalFontCacheEntry(family, cachedEntry)
      setFontDownloadState((prev) => ({
        ...prev,
        [family]: {
          ...(prev[family] || {}),
          status: 'loaded',
          message: '字体已从本地缓存加载',
          progress: 100,
          updatedAt: Date.now(),
        },
      }))
      return
    }

    let cancelled = false
    const src = DYNAMIC_FONT_SOURCES[family]
    const loadedFamily = getRemoteFontLoadedFamily(family)

    const mark = (status, message, progress = null) => {
      setFontDownloadState((prev) => ({
        ...prev,
        [family]: {
          ...(prev[family] || {}),
          status,
          message,
          progress: typeof progress === 'number' ? progress : (prev[family]?.progress || 0),
          updatedAt: Date.now(),
        },
      }))
    }

    const run = async () => {
      try {
        const alreadyLoaded = document.fonts?.check?.(getRemoteFontDescriptor(family))
        if (alreadyLoaded) {
          mark('loaded', '字体已就绪', 100)
          return
        }

        mark('loading', '正在下载字体…', 8)

        // CSS 源（如 LXGW WenKai / Noto CJK 等），支持多源回退
        if (src && typeof src === 'object' && src.type === 'css') {
          const cssCandidates = Array.isArray(src.cssUrls)
            ? src.cssUrls.filter(Boolean)
            : (src.cssUrl ? [src.cssUrl] : [])

          if (cssCandidates.length === 0) {
            mark('error', '字体源配置无效，已回退系统字体', 0)
            return
          }

          let loaded = false
          for (let i = 0; i < cssCandidates.length; i++) {
            if (cancelled) return
            const cssUrl = cssCandidates[i]
            const styleId = `dynamic-font-css-${family.replace(/\s+/g, '-').toLowerCase()}-${i}`

            let linkEl = document.getElementById(styleId)
            if (!linkEl) {
              const link = document.createElement('link')
              link.id = styleId
              link.rel = 'stylesheet'
              link.href = cssUrl
              document.head.appendChild(link)
              linkEl = link
            }

            const progressBase = Math.round((i / cssCandidates.length) * 70)
            mark('loading', `正在下载 ${family}...（源 ${i + 1}/${cssCandidates.length}）`, Math.min(96, progressBase + 6))

            // 使用 link load/error + timeout 进行快速失败判定
            // eslint-disable-next-line no-await-in-loop
            const cssLoadResult = await new Promise((resolve) => {
              let settled = false
              const onLoad = () => done(true)
              const onError = () => done(false)
              const timer = setTimeout(() => done(false), 3000)

              const cleanup = () => {
                clearTimeout(timer)
                if (linkEl) {
                  linkEl.removeEventListener('load', onLoad)
                  linkEl.removeEventListener('error', onError)
                }
              }

              const done = (ok) => {
                if (settled) return
                settled = true
                cleanup()
                resolve(ok)
              }

              if (linkEl) {
                linkEl.addEventListener('load', onLoad)
                linkEl.addEventListener('error', onError)
              } else {
                done(false)
                return
              }

              Promise.resolve().then(() => {
                if (document.fonts?.check?.(`14px "${loadedFamily}"`)) done(true)
              })
            })

            if (cancelled) return
            if (!cssLoadResult) {
              mark('loading', `字体源 ${i + 1} 加载失败，正在尝试下一个源...`, Math.min(96, progressBase + 10))
              continue
            }

            const started = Date.now()
            while (!document.fonts?.check?.(`14px "${loadedFamily}"`) && Date.now() - started < 2200) {
              // eslint-disable-next-line no-await-in-loop
              await new Promise((resolve) => setTimeout(resolve, 120))
              if (cancelled) return
              const elapsed = Date.now() - started
              const progressStep = Math.max(10, Math.min(26, Math.round((elapsed / 2200) * 26)))
              mark('loading', `正在下载 ${family}...（源 ${i + 1}/${cssCandidates.length}）`, Math.min(96, progressBase + progressStep))
            }

            if (document.fonts?.check?.(`14px "${loadedFamily}"`)) {
              loaded = true
              break
            }
          }

          if (loaded) {
            mark('loaded', '字体下载完成', 100)
          } else {
            mark('error', '字体下载超时，已回退系统字体', 0)
          }
          return
        }

        // 优先：fetch + FontFace，实现可感知进度
        if (typeof src === 'string' && typeof fetch !== 'undefined' && typeof FontFace !== 'undefined' && document.fonts) {
          const response = await fetch(src)
          if (!response.ok) {
            throw new Error(`字体请求失败: ${response.status}`)
          }

          const total = Number(response.headers.get('content-length') || 0)
          if (response.body && response.body.getReader) {
            const reader = response.body.getReader()
            const chunks = []
            let loadedBytes = 0

            while (true) {
              // eslint-disable-next-line no-await-in-loop
              const { done, value } = await reader.read()
              if (done) break
              if (cancelled) return
              if (value) {
                chunks.push(value)
                loadedBytes += value.byteLength
                if (total > 0) {
                  const progress = Math.max(8, Math.min(92, Math.round((loadedBytes / total) * 100)))
                  mark('loading', `正在下载 ${family}...`, progress)
                }
              }
            }

            const blob = new Blob(chunks, { type: 'font/woff2' })
            const objectUrl = URL.createObjectURL(blob)
            try {
              const font = new FontFace(family, `url(${objectUrl}) format("woff2")`, {
                style: 'normal',
                weight: '400',
                display: 'swap',
              })
              const loaded = await font.load()
              if (cancelled) return
              document.fonts.add(loaded)
              mark('loaded', '字体下载完成', 100)
              return
            } finally {
              URL.revokeObjectURL(objectUrl)
            }
          }
        }

        // 回退：直接 FontFace 加载（无准确进度，使用阶段性进度）
        mark('loading', `正在下载 ${family}...`, 35)
        if (typeof src === 'string' && typeof FontFace !== 'undefined' && document.fonts) {
          const font = new FontFace(family, `url(${src}) format("woff2")`, {
            style: 'normal',
            weight: '400',
            display: 'swap',
          })
          mark('loading', `正在下载 ${family}...`, 75)
          const loaded = await font.load()
          if (cancelled) return
          document.fonts.add(loaded)
          mark('loaded', '字体下载完成', 100)
          return
        }

        // 最后回退：注入 @font-face 后等待可用
        const styleId = `dynamic-font-${family.replace(/\s+/g, '-').toLowerCase()}`
        if (typeof src === 'string' && !document.getElementById(styleId)) {
          const styleEl = document.createElement('style')
          styleEl.id = styleId
          styleEl.textContent = `
            @font-face {
              font-family: '${family}';
              src: url('${src}') format('woff2');
              font-weight: 400;
              font-style: normal;
              font-display: swap;
            }
          `
          document.head.appendChild(styleEl)
        }

        const started = Date.now()
        while (!document.fonts?.check?.(getRemoteFontDescriptor(family)) && Date.now() - started < 8000) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 120))
          if (cancelled) return
          const elapsed = Date.now() - started
          const progress = Math.max(15, Math.min(92, Math.round((elapsed / 8000) * 100)))
          mark('loading', `正在下载 ${family}...`, progress)
        }

        if (document.fonts?.check?.(getRemoteFontDescriptor(family))) {
          mark('loaded', '字体下载完成', 100)
        } else {
          mark('error', '字体下载超时，已回退系统字体', 0)
        }
      } catch (error) {
        if (cancelled) return
        mark('error', '字体下载失败，已回退系统字体', 0)
      }
    }

    const requestKey = fontDownloadRequests[family] || 0
    const previousState = fontDownloadState[family]
    const needDownloadByState = !previousState || previousState.status !== 'loaded'

    if (needDownloadByState || requestKey > 0) {
      run()
    }

    return () => {
      cancelled = true
    }
  }, [editorFontFamily, fontDownloadRequests])

  // 从后端加载共享设置与编辑状态（含导出配置主题持久化）
  useEffect(() => {
    const loadInitialState = async () => {
      try {
        const [settings, persistedState, presetData] = await Promise.all([
          fetchAllSettings(),
          loadPersistedState(),
          fetch('/api/export-presets/active')
            .then(res => res.ok ? res.json() : null)
            .then(data => (data?.ok && data?.preset?.config) ? data : null)
            .catch(() => null),
        ])

        const s = settings || {}
        // 明暗模式不从数据库加载，由用户通过 localStorage 自行设定
        if (typeof s.editorFontSize === 'number') setEditorFontSize(s.editorFontSize)
        if (typeof s.editorLineHeight === 'number') setEditorLineHeight(s.editorLineHeight)
        if (typeof s.editorFontFamily === 'string') setEditorFontFamily(s.editorFontFamily)
        if (typeof s.editorLineNumbers === 'boolean') setEditorLineNumbers(s.editorLineNumbers)
        if (typeof s.editorWordWrap === 'boolean') setEditorWordWrap(s.editorWordWrap)
        if (typeof s.syncPreviewWithEditor === 'boolean') setSyncPreviewWithEditor(s.syncPreviewWithEditor)
        if (typeof s.enableSlashMenuReorder === 'boolean') setEnableSlashMenuReorder(s.enableSlashMenuReorder)
        if (typeof s.enableFirstScreenLoader === 'boolean') {
          setEnableFirstScreenLoader(s.enableFirstScreenLoader)
          try {
            localStorage.setItem(FIRST_SCREEN_LOADER_STORAGE_KEY, String(s.enableFirstScreenLoader))
          } catch (e) {
            console.error('[App] 同步首屏加载动画设置到 localStorage 失败:', e)
          }
        }
        if (Array.isArray(s.slashCommandOrder)) setSlashCommandOrder(s.slashCommandOrder)
        if (typeof s.layout === 'string') setLayout(s.layout)
        if (typeof s.showFileTree === 'boolean') setShowFileTree(s.showFileTree)
        if (typeof s.showToolbar === 'boolean') setShowToolbar(s.showToolbar)
        if (typeof s.showExportConfigPanel === 'boolean') setShowExportConfigPanel(s.showExportConfigPanel)
        if (typeof s.showMarkdownHelp === 'boolean') setShowMarkdownHelp(s.showMarkdownHelp)
        if (typeof s.showShortcuts === 'boolean') setShowShortcuts(s.showShortcuts)
        if (typeof s.showAbout === 'boolean') setShowAbout(s.showAbout)
        if (typeof s.showHistory === 'boolean') setShowHistory(s.showHistory)
        if (s.appLogoConfig) {
          setAppLogoConfig(normalizeLogoConfig(s.appLogoConfig))
        }

        // 方案1：启动时不恢复上次编辑的文件，仅恢复布局等设置
        setFileTreeWidth(persistedState.fileTreeWidth || DEFAULT_APP_STATE.fileTreeWidth)
        setEditorWidth(persistedState.editorWidth || DEFAULT_APP_STATE.editorWidth)
        setExportConfigPanelWidth(
          persistedState.exportConfigPanelWidth || DEFAULT_APP_STATE.exportConfigPanelWidth
        )
        setImageCaptionFormat(
          persistedState.imageCaptionFormat || DEFAULT_APP_STATE.imageCaptionFormat
        )

        // 导出配置：优先使用持久化的主题等设置，否则使用预设
        if (persistedState.exportConfig && typeof persistedState.exportConfig === 'object') {
          setExportConfig(mergeExportConfigWithDefaults(persistedState.exportConfig, DEFAULT_EXPORT_CONFIG))
        } else if (presetData?.preset?.config) {
          setExportConfig(mergeExportConfigWithDefaults(presetData.preset.config, DEFAULT_EXPORT_CONFIG))
        }
      } catch (e) {
        console.error('[App] 加载共享状态失败:', e)
      } finally {
        setInitialStateLoaded(true)
      }
    }

    loadInitialState()
  }, [])

  // 同步 ref 中的联动开关值，供非 React 事件处理使用
  useEffect(() => {
    syncPreviewWithEditorRef.current = syncPreviewWithEditor
  }, [syncPreviewWithEditor])

  // 左右联动：编辑器滚动 ↔ 预览滚动（双向同步）
  const syncFromEditorRef = useRef(false)
  const syncFromPreviewRef = useRef(false)

  useEffect(() => {
    const editor = editorInstance
    if (!editor) return

    // 编辑器滚动：始终更新标题位移；有预览时再做联动同步
    const scrollDisposable = editor.onDidScrollChange(() => {
      setEditorScrollTop(editor.getScrollTop())

      const previewRootCur = previewRef.current
      const previewPaneCur = previewRootCur?.parentElement || previewRootCur
      if (!previewPaneCur) return

      if (!syncPreviewWithEditorRef.current) return
      if (syncFromPreviewRef.current) return // 正在从预览同步过来，避免回环

      const editorScrollTop = editor.getScrollTop()
      const editorScrollHeight = editor.getScrollHeight()
      const editorLayout = editor.getLayoutInfo()
      const editorClientHeight = editorLayout ? editorLayout.height : 0
      const editorMaxScroll = Math.max(editorScrollHeight - editorClientHeight, 0)
      const previewMaxScroll = Math.max(previewPaneCur.scrollHeight - previewPaneCur.clientHeight, 0)

      if (editorMaxScroll <= 0 || previewMaxScroll <= 0) return

      syncFromEditorRef.current = true
      const ratio = editorScrollTop / editorMaxScroll
      previewPaneCur.scrollTop = previewMaxScroll * ratio
      syncFromEditorRef.current = false
    })

    const previewRoot = previewRef.current
    const previewPane = previewRoot?.parentElement || previewRoot
    if (!previewPane) {
      return () => {
        scrollDisposable?.dispose()
      }
    }

    // 预览 → 编辑器
    const handlePreviewScroll = () => {
      if (!syncPreviewWithEditorRef.current) return
      if (syncFromEditorRef.current) return // 正在从编辑器同步过来，避免回环

      const previewRootCur = previewRef.current
      const previewPaneCur = previewRootCur?.parentElement || previewRootCur
      if (!previewPaneCur) return

      const previewScrollTop = previewPaneCur.scrollTop
      const previewMaxScroll = Math.max(previewPaneCur.scrollHeight - previewPaneCur.clientHeight, 0)
      const editorScrollHeight = editor.getScrollHeight()
      const editorLayout = editor.getLayoutInfo()
      const editorClientHeight = editorLayout ? editorLayout.height : 0
      const editorMaxScroll = Math.max(editorScrollHeight - editorClientHeight, 0)

      if (previewMaxScroll <= 0 || editorMaxScroll <= 0) return

      syncFromPreviewRef.current = true
      const ratio = previewScrollTop / previewMaxScroll
      editor.setScrollTop(editorMaxScroll * ratio)
      syncFromPreviewRef.current = false
    }

    previewPane.addEventListener('scroll', handlePreviewScroll, { passive: true })

    return () => {
      scrollDisposable?.dispose()
      previewPane.removeEventListener('scroll', handlePreviewScroll)
    }
  }, [syncPreviewWithEditor, editorInstance])

  // Toast 通知辅助函数
  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type, duration }])
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialogState(null)
  }, [])

  const requestConfirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      const {
        title = '请确认',
        message = '',
        confirmText = '确定',
        cancelText = '取消',
        confirmVariant = 'danger',
        closeOnOverlayClick = true,
      } = options

      setConfirmDialogState({
        title,
        message,
        confirmText,
        cancelText,
        confirmVariant,
        closeOnOverlayClick,
        onCancel: () => {
          setConfirmDialogState(null)
          resolve(false)
        },
        onConfirm: () => {
          setConfirmDialogState(null)
          resolve(true)
        },
      })
    })
  }, [])

  const appUi = useMemo(() => ({
    showToast,
    requestConfirm,
  }), [showToast, requestConfirm])

  // ============================================
  // 右键菜单辅助函数
  // ============================================
  
  // 获取编辑器选中的文本
  const getSelectedText = useCallback(() => {
    if (!editorRef.current) return ''
    const editor = editorRef.current
    const selection = editor.getSelection()
    const model = editor.getModel()
    return model.getValueInRange(selection)
  }, [])

  // 获取编辑器当前全文（用于 AI 引用全文）
  // 优先从编辑器实例读取，否则用 editorContentRef（onChange 同步更新，无防抖延迟），最后回退到 content 状态
  const getEditorContent = useCallback(() => {
    const fromEditor = editorRef.current?.getModel()?.getValue()
    if (fromEditor != null) return fromEditor
    const fromRef = editorContentRef.current
    if (fromRef != null) return fromRef
    return content ?? ''
  }, [content])

  // 检测光标处的图片
  const detectImageAtCursor = useCallback(() => {
    if (!editorRef.current) return null
    
    const editor = editorRef.current
    const model = editor.getModel()
    const position = editor.getPosition()
    const lineContent = model.getLineContent(position.lineNumber)
    
    // 匹配 Markdown 图片语法: ![alt](src "title")
    const mdImageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g
    let match
    
    while ((match = mdImageRegex.exec(lineContent)) !== null) {
      const startCol = match.index + 1
      const endCol = match.index + match[0].length + 1
      
      if (position.column >= startCol && position.column <= endCol) {
        return {
          alt: match[1] || '',
          src: match[2],
          title: match[3] || '',
          scale: 1,
          isLocal: match[2].startsWith('/uploads/') || match[2].startsWith('./'),
          range: {
            startLineNumber: position.lineNumber,
            startColumn: startCol,
            endLineNumber: position.lineNumber,
            endColumn: endCol
          }
        }
      }
    }
    
    // 匹配 HTML 图片语法: <img src="..." alt="..." style="width:50%;" />
    const htmlImageRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi
    match = null
    
    while ((match = htmlImageRegex.exec(lineContent)) !== null) {
      const startCol = match.index + 1
      const endCol = match.index + match[0].length + 1
      
      if (position.column >= startCol && position.column <= endCol) {
        const altMatch = match[0].match(/alt=["']([^"']*)["']/)
        const styleMatch = match[0].match(/style=["']([^"']*)["']/)
        
        // 从 style 中提取 width 百分比
        let scale = 1
        if (styleMatch) {
          const widthMatch = styleMatch[1].match(/width:\s*(\d+)%/)
          if (widthMatch) {
            scale = parseInt(widthMatch[1]) / 100
          }
        }
        
        return {
          alt: altMatch ? altMatch[1] : '',
          src: match[1],
          title: '',
          scale: scale,
          isLocal: match[1].startsWith('/uploads/') || match[1].startsWith('./'),
          range: {
            startLineNumber: position.lineNumber,
            startColumn: startCol,
            endLineNumber: position.lineNumber,
            endColumn: endCol
          }
        }
      }
    }
    
    return null
  }, [])

  // 检测预览区的图片
  const detectPreviewImage = useCallback((target) => {
    console.log('[detectPreviewImage] 开始检测，target:', target, 'tagName:', target.tagName)
    
    // 尝试多种方式找到图片元素
    let imgElement = null
    
    // 方式1: 直接是 img 标签
    if (target.tagName === 'IMG') {
      imgElement = target
      console.log('[detectPreviewImage] 方式1: 直接是 IMG 标签')
    }
    // 方式2: 使用 closest 查找父级 img
    else {
      imgElement = target.closest('img')
      if (imgElement) {
        console.log('[detectPreviewImage] 方式2: 通过 closest 找到 IMG')
      }
    }
    
    // 方式3: 如果还没找到，检查子元素
    if (!imgElement && target.querySelector) {
      imgElement = target.querySelector('img')
      if (imgElement) {
        console.log('[detectPreviewImage] 方式3: 通过 querySelector 找到 IMG')
      }
    }
    
    if (imgElement && previewRef.current) {
      // 获取预览区所有图片
      const allImages = Array.from(previewRef.current.querySelectorAll('img'))
      const imageIndex = allImages.indexOf(imgElement)
      
      console.log('[detectPreviewImage] 找到图片，索引:', imageIndex, '总数:', allImages.length)
      
      // 从 style 属性中提取缩放比例
      let scale = 1
      const style = imgElement.getAttribute('style')
      if (style) {
        const widthMatch = style.match(/width:\s*(\d+)%/)
        if (widthMatch) {
          scale = parseInt(widthMatch[1]) / 100
        }
      }
      
      const result = {
        alt: imgElement.alt || '',
        src: imgElement.src,
        title: imgElement.title || '',
        scale: scale,
        isLocal: imgElement.src.includes('/uploads/') || imgElement.src.startsWith('./'),
        element: imgElement,
        imageIndex: imageIndex // 添加图片索引
      }
      
      console.log('[detectPreviewImage] 返回结果:', result)
      return result
    }
    
    console.log('[detectPreviewImage] 未找到图片元素')
    return null
  }, [])

  // 在编辑器中查找图片语法的位置（通过 src）
  const findImageInEditor = useCallback((imageSrc, targetIndex = 0) => {
    if (!editorRef.current) return null
    
    const editor = editorRef.current
    const model = editor.getModel()
    const lineCount = model.getLineCount()
    
    // 提取纯 URL（去掉域名前缀，只保留路径）
    const srcPath = imageSrc.replace(/^https?:\/\/[^\/]+/, '')
    
    // 提取文件名（最后一部分）
    const fileName = imageSrc.split('/').pop()
    
    console.log('查找图片:', { imageSrc, srcPath, fileName, targetIndex })
    
    let matchCount = 0 // 记录匹配次数
    let firstMatch = null // 保存第一个匹配的结果
    
    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
      const lineContent = model.getLineContent(lineNumber)
      
      // 匹配 Markdown 图片语法: ![alt](src "title")
      const mdImageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g
      let match
      
      while ((match = mdImageRegex.exec(lineContent)) !== null) {
        const matchedSrc = match[2]
        
        // 多种匹配方式
        const isMatch = 
          matchedSrc === imageSrc ||                    // 完全匹配
          matchedSrc === srcPath ||                     // 路径匹配
          imageSrc.includes(matchedSrc) ||              // 包含匹配
          matchedSrc.includes(fileName) ||              // 文件名匹配
          imageSrc.endsWith(matchedSrc) ||              // 结尾匹配
          (matchedSrc.startsWith('http') && imageSrc.includes(matchedSrc.split('/').pop())) // URL 文件名匹配
        
        if (isMatch) {
          const result = {
            alt: match[1] || '',
            src: matchedSrc,
            title: match[3] || '',
            scale: 1,
            isLocal: matchedSrc.startsWith('/uploads/') || matchedSrc.startsWith('./'),
            range: {
              startLineNumber: lineNumber,
              startColumn: match.index + 1,
              endLineNumber: lineNumber,
              endColumn: match.index + match[0].length + 1
            }
          }
          
          console.log(`找到 Markdown 匹配 ${matchCount}:`, { lineNumber, matchedSrc, targetIndex })
          
          // 保存第一个匹配
          if (!firstMatch) {
            firstMatch = result
            console.log('保存第一个匹配:', firstMatch)
          }
          
          // 检查是否是目标索引的匹配
          if (matchCount === targetIndex) {
            console.log('找到 Markdown 图片（精确索引）:', { lineNumber, matchedSrc, matchIndex: matchCount })
            return result
          }
          matchCount++
        }
      }
      
      // 匹配 HTML 图片语法: <img src="..." alt="..." />
      const htmlImageRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi
      match = null
      
      while ((match = htmlImageRegex.exec(lineContent)) !== null) {
        const matchedSrc = match[1]
        
        // 多种匹配方式
        const isMatch = 
          matchedSrc === imageSrc ||
          matchedSrc === srcPath ||
          imageSrc.includes(matchedSrc) ||
          matchedSrc.includes(fileName) ||
          imageSrc.endsWith(matchedSrc) ||
          (matchedSrc.startsWith('http') && imageSrc.includes(matchedSrc.split('/').pop()))
        
        if (isMatch) {
          const altMatch = match[0].match(/alt=["']([^"']*)["']/)
          const titleMatch = match[0].match(/title=["']([^"']*)["']/)
          const result = {
            alt: altMatch ? altMatch[1] : '',
            src: matchedSrc,
            title: titleMatch ? titleMatch[1] : '',
            scale: 1,
            isLocal: matchedSrc.startsWith('/uploads/') || matchedSrc.startsWith('./'),
            range: {
              startLineNumber: lineNumber,
              startColumn: match.index + 1,
              endLineNumber: lineNumber,
              endColumn: match.index + match[0].length + 1
            }
          }
          
          console.log(`找到 HTML 匹配 ${matchCount}:`, { lineNumber, matchedSrc, targetIndex })
          
          // 保存第一个匹配
          if (!firstMatch) {
            firstMatch = result
            console.log('保存第一个匹配 (HTML):', firstMatch)
          }
          
          // 检查是否是目标索引的匹配
          if (matchCount === targetIndex) {
            console.log('找到 HTML 图片（精确索引）:', { lineNumber, matchedSrc, matchIndex: matchCount })
            return result
          }
          matchCount++
        }
      }
    }
    
    // 如果没有找到精确索引匹配，但有匹配的图片，返回第一个匹配
    if (firstMatch) {
      console.log('未找到精确索引匹配，返回第一个匹配，总匹配数:', matchCount)
      return firstMatch
    }
    
    console.log('未找到匹配的图片，总匹配数:', matchCount)
    return null
  }, [])

  // 编辑器右键事件处理
  const handleEditorContextMenu = useCallback((e) => {
    // 在移动端/平板上完全交给系统级复制，不拦截 contextmenu
    try {
      const isCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches
      const isNarrowViewport = window.matchMedia?.('(max-width: 1024px)').matches
      if (isCoarsePointer && isNarrowViewport) {
        // 触摸设备上：保留系统长按菜单，用于复制/粘贴
        return
      }
    } catch (err) {
      // 媒体查询异常时忽略，按桌面逻辑处理
    }

    e.preventDefault()
    e.stopPropagation()
    
    const selectedText = getSelectedText()
    const selectedImage = detectImageAtCursor()
    
    console.log('编辑器右键菜单:', { selectedText, selectedImage })
    
    // 始终启用粘贴功能（使用 Monaco Editor 的内置功能作为后备）
    // 不依赖剪贴板 API 的权限检测，因为 Monaco 有自己的剪贴板处理
    const hasClipboard = true
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'editor',
      selectedText,
      selectedImage,
      hasClipboard
    })
  }, [getSelectedText, detectImageAtCursor])

  // 预览区右键事件处理
  const handlePreviewContextMenu = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    
    console.log('[handlePreviewContextMenu] 触发，target:', e.target, 'tagName:', e.target.tagName)
    
    // 在"仅预览"模式下，完全禁用右键菜单
    if (effectiveLayout === 'preview-only') {
      return
    }
    
    const selectedText = window.getSelection()?.toString() || ''
    const previewImage = detectPreviewImage(e.target)
    
    console.log('预览区右键菜单 - 检测到的图片:', previewImage)
    console.log('预览区右键菜单 - 选中的文本:', selectedText)
    
    // 如果在预览区检测到图片，尝试在编辑器中找到对应的语法
    let selectedImage = null
    if (previewImage) {
      // 使用图片索引来查找对应的编辑区图片
      selectedImage = findImageInEditor(previewImage.src, previewImage.imageIndex)
      // 如果找到了，保留预览区的信息（可能更完整）
      if (selectedImage) {
        selectedImage.alt = previewImage.alt || selectedImage.alt
        selectedImage.title = previewImage.title || selectedImage.title
        selectedImage.scale = previewImage.scale  // 使用预览区检测到的 scale
        console.log('最终的 selectedImage:', selectedImage)
      }
    }
    
    // 始终启用粘贴功能（使用 Monaco Editor 的内置功能作为后备）
    const hasClipboard = true
    
    console.log('[handlePreviewContextMenu] 设置菜单，type: preview, selectedImage:', selectedImage)
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'preview',
      selectedText,
      selectedImage,
      hasClipboard
    })
  }, [effectiveLayout, detectPreviewImage, findImageInEditor])

  // 编辑状态持久化到数据库（含导出配置主题等，实现主题设置持久化）
  const persistenceState = {
    content,
    currentPath,
    editorWidth,
    fileTreeWidth,
    exportConfigPanelWidth,
    imageCaptionFormat,
    exportConfig,
  }
  
  // 启用自动保存（防抖 500ms）
  useLocalPersistence(persistenceState, 500, true)
  
  // 页面关闭/刷新时保存
  useBeforeUnload(persistenceState, true)
  
  // 页面隐藏时保存
  useVisibilityChange(persistenceState, true)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const compactViewportQuery = window.matchMedia('(max-width: 1024px)')
    const singleColumnViewportQuery = window.matchMedia(MOBILE_SINGLE_COLUMN_MEDIA_QUERY)
    const handleCompactViewportChange = (event) => {
      setIsCompactViewport(event.matches)
    }
    const handleSingleColumnViewportChange = (event) => {
      setIsSingleColumnViewport(event.matches)
    }

    setIsCompactViewport(compactViewportQuery.matches)
    setIsSingleColumnViewport(singleColumnViewportQuery.matches)

    if (compactViewportQuery.addEventListener) {
      compactViewportQuery.addEventListener('change', handleCompactViewportChange)
      singleColumnViewportQuery.addEventListener('change', handleSingleColumnViewportChange)
      return () => {
        compactViewportQuery.removeEventListener('change', handleCompactViewportChange)
        singleColumnViewportQuery.removeEventListener('change', handleSingleColumnViewportChange)
      }
    }

    compactViewportQuery.addListener(handleCompactViewportChange)
    singleColumnViewportQuery.addListener(handleSingleColumnViewportChange)
    return () => {
      compactViewportQuery.removeListener(handleCompactViewportChange)
      singleColumnViewportQuery.removeListener(handleSingleColumnViewportChange)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    const root = document.documentElement
    const updateViewportMetrics = () => {
      const viewport = window.visualViewport
      const layoutViewportHeight = Math.max(
        window.innerHeight || 0,
        document.documentElement?.clientHeight || 0
      )
      const visualViewportHeight = Math.round(viewport?.height || layoutViewportHeight)
      const viewportOffsetTop = Math.round(viewport?.offsetTop || 0)
      const keyboardInset = Math.max(layoutViewportHeight - visualViewportHeight - viewportOffsetTop, 0)
      // iPhone Safari 在地址栏/底部工具栏存在时，visualViewport.height 可能小于实际页面高度，
      // 直接使用它会导致应用只占上半屏。仅在软键盘弹起时才使用 visualViewport 高度。
      const effectiveViewportHeight = keyboardInset > 0 ? visualViewportHeight : layoutViewportHeight

      root.style.setProperty('--app-viewport-height', `${effectiveViewportHeight}px`)
      root.style.setProperty('--app-viewport-offset-top', `${viewportOffsetTop}px`)
      root.style.setProperty('--app-keyboard-inset', `${keyboardInset}px`)

      setIsVirtualKeyboardOpen(isAdaptiveSinglePaneViewport && keyboardInset > 120)
    }
    
    // 使用 RAF 节流优化 resize 性能
    const throttledUpdateViewportMetrics = rafThrottle(updateViewportMetrics)

    throttledUpdateViewportMetrics()

    const viewport = window.visualViewport
    window.addEventListener('resize', throttledUpdateViewportMetrics)

    if (viewport?.addEventListener) {
      viewport.addEventListener('resize', throttledUpdateViewportMetrics)
      viewport.addEventListener('scroll', throttledUpdateViewportMetrics)
      return () => {
        window.removeEventListener('resize', throttledUpdateViewportMetrics)
        viewport.removeEventListener('resize', throttledUpdateViewportMetrics)
        viewport.removeEventListener('scroll', throttledUpdateViewportMetrics)
        throttledUpdateViewportMetrics.cancel()
      }
    }

    return () => {
      window.removeEventListener('resize', throttledUpdateViewportMetrics)
      throttledUpdateViewportMetrics.cancel()
    }
  }, [isAdaptiveSinglePaneViewport])

  useEffect(() => {
    if (!isAdaptiveSinglePaneViewport || !isVirtualKeyboardOpen || mobileActivePane !== 'editor') {
      return undefined
    }

    const timer = setTimeout(() => {
      const editor = editorRef.current
      const domNode = editor?.getDomNode?.()
      domNode?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      editor?.layout?.()
    }, 120)

    return () => clearTimeout(timer)
  }, [isAdaptiveSinglePaneViewport, isVirtualKeyboardOpen, mobileActivePane])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const isIgnorableMonacoCanceledError = ({ message = '', stack = '', filename = '' }) => {
      const normalizedMessage = String(message || '')
      const normalizedStack = String(stack || '')
      const normalizedFilename = String(filename || '')

      if (!/Canceled(?::\s*Canceled)?/i.test(normalizedMessage)) {
        return false
      }

      return /editor\.api-|monaco/i.test(normalizedStack) || /editor\.api-|monaco/i.test(normalizedFilename)
    }

    const handleUnhandledRejection = (event) => {
      const reason = event.reason
      const message = reason?.message || String(reason || '')
      const stack = reason?.stack || ''

      if (isIgnorableMonacoCanceledError({ message, stack })) {
        event.preventDefault()
      }
    }

    const handleWindowError = (event) => {
      if (isIgnorableMonacoCanceledError({
        message: event.message,
        stack: event.error?.stack,
        filename: event.filename,
      })) {
        event.preventDefault()
      }
    }

    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleWindowError)

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleWindowError)
    }
  }, [])

  // 当主题变化时，应用到 Monaco Editor
  useEffect(() => {
    if (editorRef.current && window.monaco) {
      try {
        const monacoTheme = editorThemeRef.current === 'dark' ? 'vs-dark' : 'vs'
        window.monaco.editor.setTheme(monacoTheme)
      } catch (error) {
        console.error('Failed to set Monaco theme:', error)
      }
    }
  }, [editorTheme])

  // “随系统”模式：实时监听系统明暗变化（iOS/安卓/鸿蒙/Mac/Windows WebView）
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const colorSchemeMq = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (themeMode !== 'system') return

      const nextTheme = colorSchemeMq.matches ? 'dark' : 'light'
      setEditorTheme(nextTheme)

      // Mermaid 需要重渲染以跟随主题 svg 颜色
      if (mermaidLoaded && mermaidModule) {
        mermaidModule.initialize({
          startOnLoad: false,
          theme: nextTheme === 'dark' ? 'dark' : 'default',
          securityLevel: 'loose'
        })
        setTimeout(() => {
          if (!isRenderingRef.current) {
            isRenderingRef.current = true
            renderMarkdown(latestContentRef.current).finally(() => {
              isRenderingRef.current = false
            })
          }
        }, 100)
      }
    }

    // Safari/iOS WebKit 下某些版本可能不支持 addEventListener('change')
    if (colorSchemeMq.addEventListener) {
      colorSchemeMq.addEventListener('change', handleChange)
      return () => colorSchemeMq.removeEventListener('change', handleChange)
    }
    if (colorSchemeMq.addListener) {
      colorSchemeMq.addListener(handleChange)
      return () => colorSchemeMq.removeListener(handleChange)
    }

    return undefined
  }, [themeMode, mermaidLoaded])

  // Sync with fnOS desktop theme config in proxy mode.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const proxyBase = window.__APP_PROXY_BASE_PATH__ || '/'
    if (proxyBase === '/') return undefined

    let lastMode = getFnosThemeMode()
    if (lastMode) {
      setThemeMode(lastMode)
      setEditorTheme(lastMode === 'system' ? getSystemTheme() : lastMode)
    }

    const syncTheme = () => {
      const next = getFnosThemeMode()
      if (!next || next === lastMode) return
      lastMode = next
      setThemeMode(next)
      setEditorTheme(next === 'system' ? getSystemTheme() : next)
    }

    const onStorage = (event) => {
      if (event.key === 'DesktopConfig-1000') syncTheme()
    }

    window.addEventListener('storage', onStorage)
    const timer = window.setInterval(syncTheme, 600)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const proxyBase = window.__APP_PROXY_BASE_PATH__ || '/'
    if (proxyBase === '/') return undefined

    let cancelled = false
    const loadServicePort = async () => {
      try {
        const response = await fetch('/api/service-port')
        const data = await response.json().catch(() => ({}))
        const port = String(data?.port || '').trim()
        if (!cancelled && /^[0-9]{2,5}$/.test(port)) {
          window.__APP_SERVICE_PORT__ = port
          localStorage.setItem('md-editor-service-port', port)
        }
      } catch {
        // Keep fallback behavior when request fails.
      }
    }

    loadServicePort()
    return () => { cancelled = true }
  }, [])

  // 动态加载 github-markdown CSS
  useEffect(() => {
    // 移除旧的样式表
    const oldLink = document.querySelector('link[data-github-markdown]')
    if (oldLink) {
      oldLink.remove()
    }

    // 添加新的样式表
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.setAttribute('data-github-markdown', 'true')
    link.href = editorTheme === 'dark' 
      ? 'https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-dark.min.css'
      : 'https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-light.min.css'
    
    console.log('开始加载 github-markdown-css:', link.href)
    
    // 在 github-markdown-css 加载完成后，添加我们的覆盖样式
    link.onload = () => {
      console.log('github-markdown-css 加载完成，注入覆盖样式')
      
      // 移除旧的覆盖样式
      const oldOverride = document.querySelector('style[data-image-scale-override]')
      if (oldOverride) {
        console.log('移除旧的覆盖样式')
        oldOverride.remove()
      }
      
      // 添加新的覆盖样式
      const style = document.createElement('style')
      style.setAttribute('data-image-scale-override', 'true')
      style.textContent = `
        /* 覆盖 github-markdown-css 的图片样式 */
        .markdown-body img[style*="width"],
        .markdown-body .image-figure img[style*="width"],
        .markdown-body p img[style*="width"] {
          max-width: none !important;
          display: inline-block !important;
        }
        
        /* 全局覆盖 */
        img[style*="width"] {
          max-width: none !important;
        }
      `
      document.head.appendChild(style)
      console.log('覆盖样式已注入:', style.textContent.substring(0, 100))
      
      // 重新应用导出配置样式（确保在 github-markdown-css 之后）
      // 注释掉，因为第 168 行的 useEffect 已经处理了所有样式
      // console.log('重新应用导出配置样式')
      // applyExportConfigStyles(exportConfig)
      
      // 验证样式是否真的在 DOM 中
      setTimeout(() => {
        const injected = document.querySelector('style[data-image-scale-override]')
        console.log('验证注入的样式:', injected ? '存在' : '不存在')
        if (injected) {
          console.log('样式内容:', injected.textContent.substring(0, 100))
        }
      }, 100)
    }
    
    link.onerror = () => {
      console.error('github-markdown-css 加载失败')
    }
    
    document.head.appendChild(link)
  }, [editorTheme])

  // 处理文件树宽度调整
  const handleFileTreeResize = useCallback((delta) => {
    setFileTreeWidth(prev => {
      const newWidth = prev + delta
      return Math.max(200, Math.min(600, newWidth)) // 限制在 200-600px
    })
  }, [])

  const handleExportConfigPanelResize = useCallback((delta) => {
    setExportConfigPanelWidth(prev => {
      const newWidth = prev - delta
      return Math.max(240, Math.min(520, newWidth))
    })
  }, [])

  // 处理编辑器宽度调整
  const handleEditorResize = useCallback((delta) => {
    const contentArea = document.querySelector('.editor-preview-content')
    if (!contentArea) return

    const totalWidth = contentArea.offsetWidth - 8
    if (totalWidth <= 0) return

    const deltaPercent = (delta / totalWidth) * 100
    
    setEditorWidth(prev => {
      const newWidth = prev + deltaPercent
      return Math.max(5, Math.min(95, newWidth))
    })
  }, [])

  const updateShowFileTree = useCallback((nextValue) => {
    setShowFileTree(prev => {
      const resolvedValue = typeof nextValue === 'function' ? nextValue(prev) : nextValue
      persistSetting('showFileTree', resolvedValue).catch((e) => {
        console.error('[App] 保存文件树显示状态失败:', e)
      })
      return resolvedValue
    })
  }, [])

  const updateShowToolbar = useCallback((nextValue) => {
    setShowToolbar(prev => {
      const resolvedValue = typeof nextValue === 'function' ? nextValue(prev) : nextValue
      persistSetting('showToolbar', resolvedValue).catch((e) => {
        console.error('[App] 保存工具栏显示状态失败:', e)
      })
      return resolvedValue
    })
  }, [])

  const updateLayout = useCallback((nextLayout) => {
    if (isOfficeReadOnly) {
      if (nextLayout !== 'preview-only') {
        showToast('Office 只读预览：仅支持“仅预览”布局', 'warning', 2000)
      }
      setLayout('preview-only')
      persistSetting('layout', 'preview-only').catch((e) => {
        console.error('[App] 保存布局设置失败:', e)
      })
      return
    }
    setLayout(nextLayout)
    persistSetting('layout', nextLayout).catch((e) => {
      console.error('[App] 保存布局设置失败:', e)
    })
  }, [isOfficeReadOnly, showToast])

  const updateShowExportConfigPanel = useCallback((nextValue) => {
    setShowExportConfigPanel(prev => {
      const resolvedValue = typeof nextValue === 'function' ? nextValue(prev) : nextValue
      persistSetting('showExportConfigPanel', resolvedValue).catch((e) => {
        console.error('[App] 保存导出配置面板状态失败:', e)
      })
      return resolvedValue
    })
  }, [])

  const updateShowSettingsDialog = useCallback((nextValue) => {
    setShowSettingsDialog(prev => (
      typeof nextValue === 'function' ? nextValue(prev) : nextValue
    ))
  }, [])

  const updateShowMarkdownHelp = useCallback((nextValue) => {
    setShowMarkdownHelp(prev => {
      const resolvedValue = typeof nextValue === 'function' ? nextValue(prev) : nextValue
      persistSetting('showMarkdownHelp', resolvedValue).catch((e) => {
        console.error('[App] 保存 Markdown 帮助面板状态失败:', e)
      })
      return resolvedValue
    })
  }, [])

  const updateShowShortcuts = useCallback((nextValue) => {
    setShowShortcuts(prev => {
      const resolvedValue = typeof nextValue === 'function' ? nextValue(prev) : nextValue
      persistSetting('showShortcuts', resolvedValue).catch((e) => {
        console.error('[App] 保存快捷键面板状态失败:', e)
      })
      return resolvedValue
    })
  }, [])

  const updateShowAbout = useCallback((nextValue) => {
    setShowAbout(prev => {
      const resolvedValue = typeof nextValue === 'function' ? nextValue(prev) : nextValue
      persistSetting('showAbout', resolvedValue).catch((e) => {
        console.error('[App] 保存关于面板状态失败:', e)
      })
      return resolvedValue
    })
  }, [])

  const updateShowHistory = useCallback((nextValue) => {
    setShowHistory(prev => {
      const resolvedValue = typeof nextValue === 'function' ? nextValue(prev) : nextValue
      persistSetting('showHistory', resolvedValue).catch((e) => {
        console.error('[App] 保存历史面板状态失败:', e)
      })
      return resolvedValue
    })
  }, [])

  const fileTreeClosingTimerRef = useRef(null)
  const handleCloseFileTree = useCallback(() => {
    if (isFileTreeClosing || fileTreeClosingTimerRef.current) return
    setIsFileTreeClosing(true)
    fileTreeClosingTimerRef.current = setTimeout(() => {
      updateShowFileTree(false)
      setIsFileTreeClosing(false)
      fileTreeClosingTimerRef.current = null
    }, 280)
  }, [updateShowFileTree, isFileTreeClosing])

  const handleToggleFileTree = useCallback(() => {
    if (showFileTree) {
      handleCloseFileTree()
    } else {
      updateShowFileTree(true)
    }
  }, [updateShowFileTree, showFileTree, handleCloseFileTree])

  const handleFileTreeTouchStart = useCallback((event) => {
    if (!isCompactViewport || !showFileTree) return

    if (fileTreeSwipeCloseTimerRef.current) {
      clearTimeout(fileTreeSwipeCloseTimerRef.current)
      fileTreeSwipeCloseTimerRef.current = null
    }

    const touch = event.touches?.[0]
    if (!touch) return

    fileTreeSwipeRef.current = {
      tracking: true,
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: performance.now(),
      deltaX: 0,
      deltaY: 0,
    }
    setIsFileTreeSwipeDragging(false)
  }, [isCompactViewport, showFileTree])

  const handleFileTreeTouchMove = useCallback((event) => {
    if (!fileTreeSwipeRef.current.tracking) return

    const touch = event.touches?.[0]
    if (!touch) return

    const nextDeltaX = touch.clientX - fileTreeSwipeRef.current.startX
    const nextDeltaY = touch.clientY - fileTreeSwipeRef.current.startY
    const isHorizontalIntent = Math.abs(nextDeltaX) > Math.abs(nextDeltaY) * 1.1

    fileTreeSwipeRef.current.deltaX = nextDeltaX
    fileTreeSwipeRef.current.deltaY = nextDeltaY

    if (isHorizontalIntent && nextDeltaX < 0) {
      event.preventDefault()
      setIsFileTreeSwipeDragging(true)
      setFileTreeSwipeOffset(Math.max(nextDeltaX, -compactFileTreePanelWidth))
    }
  }, [compactFileTreePanelWidth])

  const handleFileTreeTouchEnd = useCallback(() => {
    const { tracking, deltaX, deltaY, startTime } = fileTreeSwipeRef.current

    const elapsed = Math.max(performance.now() - (startTime || performance.now()), 1)
    const velocityX = deltaX / elapsed

    fileTreeSwipeRef.current = {
      tracking: false,
      startX: 0,
      startY: 0,
      startTime: 0,
      deltaX: 0,
      deltaY: 0,
    }

    if (!tracking) {
      setIsFileTreeSwipeDragging(false)
      return
    }

    const traveled = Math.abs(Math.min(deltaX, 0))
    const closeThreshold = compactFileTreePanelWidth * 0.35
    const isHorizontalSwipe = traveled > 24 && traveled > Math.abs(deltaY) * 1.15
    const isClosingSwipe = deltaX < 0
    const shouldClose = isHorizontalSwipe && isClosingSwipe && (traveled > closeThreshold || velocityX < -0.35)

    setIsFileTreeSwipeDragging(false)

    if (shouldClose) {
      setFileTreeSwipeOffset(-compactFileTreePanelWidth)
      fileTreeSwipeCloseTimerRef.current = setTimeout(() => {
        handleCloseFileTree()
        setFileTreeSwipeOffset(0)
        fileTreeSwipeCloseTimerRef.current = null
      }, 180)
      return
    }

    setFileTreeSwipeOffset(0)
  }, [compactFileTreePanelWidth, handleCloseFileTree])

  const handleEdgeSwipeTouchStart = useCallback((event) => {
    if (!isCompactViewport || showFileTree || showExportConfigPanel) return

    const touch = event.touches?.[0]
    if (!touch) return

    const EDGE_ZONE_WIDTH = 24
    if (touch.clientX > EDGE_ZONE_WIDTH) return

    fileTreeEdgeSwipeRef.current = {
      tracking: true,
      startX: touch.clientX,
      startY: touch.clientY,
      deltaX: 0,
      deltaY: 0,
    }
  }, [isCompactViewport, showFileTree, showExportConfigPanel])

  const handleEdgeSwipeTouchMove = useCallback((event) => {
    if (!fileTreeEdgeSwipeRef.current.tracking) return

    const touch = event.touches?.[0]
    if (!touch) return

    const deltaX = touch.clientX - fileTreeEdgeSwipeRef.current.startX
    const deltaY = touch.clientY - fileTreeEdgeSwipeRef.current.startY

    fileTreeEdgeSwipeRef.current.deltaX = deltaX
    fileTreeEdgeSwipeRef.current.deltaY = deltaY
  }, [])

  const handleEdgeSwipeTouchEnd = useCallback(() => {
    const { tracking, deltaX, deltaY } = fileTreeEdgeSwipeRef.current

    fileTreeEdgeSwipeRef.current = {
      tracking: false,
      startX: 0,
      startY: 0,
      deltaX: 0,
      deltaY: 0,
    }

    if (!tracking) return

    const OPEN_THRESHOLD = 50
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) * 1.2
    const isRightSwipe = deltaX > 0

    if (isHorizontalSwipe && isRightSwipe && deltaX >= OPEN_THRESHOLD) {
      updateShowFileTree(true)
    }
  }, [updateShowFileTree])

  const handlePaneSwipeTouchStart = useCallback((event) => {
    if (!isAdaptiveSinglePaneViewport || showExportConfigPanel) return

    const target = event.target
    if (target?.closest?.('.editor-toolbar') || target?.closest?.('.mobile-pane-switcher')) return

    const touch = event.touches?.[0]
    if (!touch) return

    // 延迟判定：不在 touchStart 立即 tracking，避免干扰编辑区垂直滚动
    paneSwipeRef.current = {
      active: true,
      decided: false,
      tracking: false,
      startX: touch.clientX,
      startY: touch.clientY,
      deltaX: 0,
      deltaY: 0,
    }
  }, [isAdaptiveSinglePaneViewport, showExportConfigPanel])

  const handlePaneSwipeTouchMove = useCallback((event) => {
    const ref = paneSwipeRef.current
    if (!ref?.active) return

    const touch = event.touches?.[0]
    if (!touch) return

    const deltaX = touch.clientX - ref.startX
    const deltaY = touch.clientY - ref.startY

    if (!ref.decided) {
      const MOVE_THRESHOLD = 12
      const totalMove = Math.abs(deltaX) + Math.abs(deltaY)
      if (totalMove < MOVE_THRESHOLD) return

      // 首次显著移动：垂直则放行给编辑区滚动，水平则跟踪 pane 切换
      if (Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
        ref.decided = true
        ref.tracking = false
        return
      }
      if (Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        ref.decided = true
        ref.tracking = true
      }
    }

    if (ref.tracking) {
      ref.deltaX = deltaX
      ref.deltaY = deltaY
    }
  }, [])

  const handlePaneSwipeTouchEnd = useCallback(() => {
    const { tracking, deltaX, deltaY } = paneSwipeRef.current

    paneSwipeRef.current = {
      active: false,
      decided: false,
      tracking: false,
      startX: 0,
      startY: 0,
      deltaX: 0,
      deltaY: 0,
    }

    if (!tracking) return

    const SWIPE_THRESHOLD = 50
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) * 1.2

    if (!isHorizontalSwipe) return

    if (deltaX < -SWIPE_THRESHOLD && mobileActivePane === 'editor') {
      setMobileActivePane('preview')
    } else if (deltaX > SWIPE_THRESHOLD && mobileActivePane === 'preview') {
      setMobileActivePane('editor')
    }
  }, [mobileActivePane])

  useEffect(() => {
    if (showFileTree) {
      setFileTreeSwipeOffset(0)
      setIsFileTreeSwipeDragging(false)
      setIsFileTreeClosing(false)
      if (fileTreeClosingTimerRef.current) {
        clearTimeout(fileTreeClosingTimerRef.current)
        fileTreeClosingTimerRef.current = null
      }
      return undefined
    }

    if (fileTreeSwipeCloseTimerRef.current) {
      clearTimeout(fileTreeSwipeCloseTimerRef.current)
      fileTreeSwipeCloseTimerRef.current = null
    }

    setFileTreeSwipeOffset(0)
    setIsFileTreeSwipeDragging(false)
    return undefined
  }, [showFileTree])

  const exportConfigClosingTimerRef = useRef(null)
  const handleCloseExportConfigPanel = useCallback(() => {
    if (isExportConfigClosing || exportConfigClosingTimerRef.current) return
    setIsExportConfigClosing(true)
    exportConfigClosingTimerRef.current = setTimeout(() => {
      updateShowExportConfigPanel(false)
      setIsExportConfigClosing(false)
      exportConfigClosingTimerRef.current = null
    }, 280)
  }, [updateShowExportConfigPanel, isExportConfigClosing])

  const openExportConfigPanel = useCallback(() => {
    if (exportConfigClosingTimerRef.current) {
      clearTimeout(exportConfigClosingTimerRef.current)
      exportConfigClosingTimerRef.current = null
    }
    setIsExportConfigClosing(false)
    updateShowExportConfigPanel(true)
  }, [updateShowExportConfigPanel])

  const handleToggleExportConfigPanel = useCallback(() => {
    if (isOfficeReadOnly) {
      showToast('Office 只读预览：导出配置已禁用', 'warning', 3000)
      return
    }
    if (isAdaptiveSinglePaneViewport) {
      setMobileActivePane('preview')
    }
    if (showExportConfigPanel) {
      handleCloseExportConfigPanel()
    } else {
      openExportConfigPanel()
    }
  }, [isAdaptiveSinglePaneViewport, showExportConfigPanel, handleCloseExportConfigPanel, openExportConfigPanel])

  // 合并后的布局/专注模式单按钮（桌面端）
  const handleCycleViewMode = useCallback(() => {
    if (isOfficeReadOnly) {
      showToast('Office 只读预览：不支持切换布局', 'warning', 2000)
      return
    }
    if (isAdaptiveSinglePaneViewport) {
      setMobileActivePane((prev) => (prev === 'editor' ? 'preview' : 'editor'))
      return
    }

    const modeOrder = [
      { focus: 'off', layout: 'vertical' },
      { focus: 'off', layout: 'editor-only' },
      { focus: 'off', layout: 'preview-only' },
      { focus: 'split' },
      { focus: 'editor-only' },
    ]

    const currentIndex = modeOrder.findIndex((item) => {
      if (focusMode === 'off') {
        return item.focus === 'off' && item.layout === layout
      }
      return item.focus === focusMode
    })

    const nextMode = modeOrder[(currentIndex + 1 + modeOrder.length) % modeOrder.length]

    setFocusMode(nextMode.focus)
    if (nextMode.focus === 'off' && nextMode.layout) {
      updateLayout(nextMode.layout)
    }
  }, [isAdaptiveSinglePaneViewport, focusMode, layout, updateLayout])

  const currentViewModeLabel = useMemo(() => {
    if (focusMode === 'split') return '专注左右'
    if (focusMode === 'editor-only') return '专注仅编辑'
    if (layout === 'editor-only') return '仅编辑'
    if (layout === 'preview-only') return '仅预览'
    return '左右'
  }, [focusMode, layout])

  useEffect(() => {
    return () => {
      if (exportConfigClosingTimerRef.current) {
        clearTimeout(exportConfigClosingTimerRef.current)
        exportConfigClosingTimerRef.current = null
      }
    }
  }, [])

  const toggleEditorTheme = async (forcedTheme) => {
    // 事件处理函数可能会把 click event 作为第一个参数传进来，只接受合法值
    const normalizedSelection =
      forcedTheme === 'light' || forcedTheme === 'dark' || forcedTheme === 'system'
        ? forcedTheme
        : null

    const isMobile = typeof window !== 'undefined' && window.matchMedia(MOBILE_SINGLE_COLUMN_MEDIA_QUERY).matches

    // 用户没指定时：在 light/dark 之间切换，并覆盖系统
    const nextMode = normalizedSelection || (editorTheme === 'light' ? 'dark' : 'light')

    if (nextMode === 'system') {
      setThemeMode('system')

      // 恢复随系统：清理桌面端的覆盖值
      if (!isMobile) {
        try {
          localStorage.removeItem(THEME_STORAGE_KEY)
        } catch (e) {
          console.error('[App] 清理主题 localStorage 失败:', e)
        }
      }

      const nextTheme = getSystemTheme()
      setEditorTheme(nextTheme)

      // Mermaid 需要重渲染以跟随主题 svg 颜色
      if (mermaidLoaded && mermaidModule) {
        mermaidModule.initialize({
          startOnLoad: false,
          theme: nextTheme === 'dark' ? 'dark' : 'default',
          securityLevel: 'loose'
        })
        setTimeout(() => {
          if (!isRenderingRef.current) {
            isRenderingRef.current = true
            renderMarkdown(latestContentRef.current).finally(() => {
              isRenderingRef.current = false
            })
          }
        }, 100)
      }

      return
    }

    // 覆盖系统：light/dark 固定
    setThemeMode(nextMode)
    setEditorTheme(nextMode)

    // 明暗模式：手机端不持久化，桌面端存 localStorage
    if (!isMobile) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, nextMode)
      } catch (e) {
        console.error('[App] 保存主题到 localStorage 失败:', e)
      }
    }

    // Mermaid 已加载：切换时重渲染以跟随主题 svg 颜色
    if (mermaidLoaded && mermaidModule) {
      mermaidModule.initialize({
        startOnLoad: false,
        theme: nextMode === 'dark' ? 'dark' : 'default',
        securityLevel: 'loose'
      })
      setTimeout(() => {
        if (!isRenderingRef.current) {
          isRenderingRef.current = true
          renderMarkdown(latestContentRef.current).finally(() => {
            isRenderingRef.current = false
          })
        }
      }, 100)
    }
  }

  // 主题三态轮换：随系统 -> 浅色 -> 深色
  const cycleThemeMode = () => {
    if (themeMode === 'system') {
      void toggleEditorTheme('light')
      return
    }
    if (themeMode === 'light') {
      void toggleEditorTheme('dark')
      return
    }
    void toggleEditorTheme('system')
  }

  const saveFile = async (path = currentPath, saveContent = content, isAutoSave = false, encodingOverride = null) => {
    if (!path) {
      setStatus('未指定文件路径，无法保存')
      return false
    }

    const encoding = encodingOverride ?? currentFileEncodingRef.current
    let bodyContent = saveContent
    let bodyEncoding = 'utf8'
    if (encoding === 'hex') {
      try {
        const hex = saveContent.replace(/\s/g, '')
        if (hex.length % 2 !== 0) throw new Error('Hex 字符串长度必须为偶数')
        const bytes = new Uint8Array(hex.length / 2)
        for (let i = 0; i < hex.length; i += 2) {
          bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
        }
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        bodyContent = btoa(binary)
        bodyEncoding = 'base64'
      } catch (e) {
        setStatus('Hex 格式错误，无法保存')
        return false
      }
    } else if (encoding === 'base64') {
      bodyEncoding = 'base64'
    }

    try {
      setStatus('保存中...')
      const response = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: bodyContent, encoding: bodyEncoding })
      })
      const data = await response.json()
      
      if (data.ok) {
        // 不在这里保存历史版本，由调用方决定
        
        // 清除 localStorage 草稿（已保存到文件）
        clearEditorDraft()
        
        // 更新上次保存的内容（用于自动保存优化）
        lastSavedContentRef.current = saveContent
        lastSavedPathRef.current = path
        
        // 刷新文件树（刷新父目录）
        if (fileTreeRef.current && fileTreeRef.current.refreshDirectory) {
          const parentPath = path.split('/').slice(0, -1).join('/') || '/'
          await fileTreeRef.current.refreshDirectory(parentPath)
        }
        
        setStatus(isAutoSave ? '自动保存成功' : `已保存: ${path}`)
        setStatusType('success')
        setTimeout(() => {
          setStatus('就绪')
          setStatusType('normal')
        }, 2000)
        return true
      } else {
        const errorMsg = getUserFriendlyMessage(
          new Error(data.message || data.code),
          { operation: '保存文件', filePath: path, showDetails: false }
        )
        setStatus(`保存失败: ${data.message || data.code}`)
        logError(new Error(data.message || data.code), {
          operation: '保存文件',
          filePath: path,
          responseData: data
        })
        return false
      }
    } catch (error) {
      const formattedError = handleError(error, {
        operation: '保存文件',
        filePath: path,
        contentSize: new Blob([saveContent]).size
      })
      setStatus(`保存失败: ${formattedError.message}`)
      return false
    }
  }

  // 根据文件大小动态调整自动保存间隔
  const getAutoSaveInterval = useCallback(() => {
    const contentSize = new Blob([content]).size
    const sizeInMB = contentSize / 1024 / 1024
    
    // 小文件（<100KB）：30秒
    // 中等文件（100KB-1MB）：60秒
    // 大文件（>1MB）：120秒
    if (sizeInMB > 1) {
      return 120000 // 2分钟
    } else if (sizeInMB > 0.1) {
      return 60000 // 1分钟
    } else {
      return 30000 // 30秒
    }
  }, [content])

  // 自动保存（替代 useAutoSave）- 只在内容变化时保存
  useEffect(() => {
    if (!currentPath || content === '') return
    // PDF/图片/非支持格式不自动保存（需手动确认）
    if (currentFileFormat === FORMAT_IMAGE || currentFileFormat === FORMAT_UNSUPPORTED) return
    if (currentPath.toLowerCase().endsWith('.pdf')) return

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      const contentChanged = content !== lastSavedContentRef.current
      const pathChanged = currentPath !== lastSavedPathRef.current

      if (contentChanged || pathChanged) {
        try {
          const success = await saveFile(currentPath, content, true)
          if (success) {
            // 保存历史版本（自动保存标记）
            await saveFileHistory(currentPath, content, '', true)
            // 更新上次保存的内容
            lastSavedContentRef.current = content
            lastSavedPathRef.current = currentPath
          }
        } catch (error) {
          console.error('自动保存失败:', error)
        }
      }
    }, getAutoSaveInterval())

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [content, currentPath, currentFileFormat, getAutoSaveInterval])

  // 编辑区 localStorage 草稿备份（防抖 2 秒，刷新/关闭前可恢复）
  useEffect(() => {
    const timer = setTimeout(() => {
      saveEditorDraft(content, currentPath)
    }, 2000)
    return () => clearTimeout(timer)
  }, [content, currentPath])

  // 当文件加载或切换到新建页面时，更新上次保存的内容（仅 currentPath 变化时，避免每次输入都覆盖）
  useEffect(() => {
    lastSavedContentRef.current = content
    lastSavedPathRef.current = currentPath
  }, [currentPath])

  // 加载最近文件列表和收藏夹
  useEffect(() => {
    ;(async () => {
      const [rf, favs] = await Promise.all([getRecentFiles(), getFavorites()])
      setRecentFiles(rf)
      setFavorites(favs)
    })()
  }, [])

  // 加载根目录列表
  useEffect(() => {
    const loadRootDirs = async () => {
      try {
        const response = await fetch('/api/files?path=/')
        const data = await safeParseJsonResponse(response, {})
        if (data.ok && data.items) {
          setRootDirs(data.items)
        }
      } catch (error) {
        console.error('Load root dirs error:', error)
      }
    }
    loadRootDirs()
  }, [])

  // 全局快捷键处理
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // 检查是否在输入框中
      const isInputFocused = document.activeElement.tagName === 'INPUT' || 
                            document.activeElement.tagName === 'TEXTAREA'
      
      // Ctrl+N - 新建文件
      if (e.ctrlKey && e.key === 'n' && !e.shiftKey && !isInputFocused) {
        e.preventDefault()
        handleNewFile()
        return
      }
      
      // Ctrl+Shift+S - 另存为
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault()
        handleSaveAs()
        return
      }
      
      // Ctrl+T - 切换主题
      if (e.ctrlKey && e.key === 't' && !isInputFocused) {
        e.preventDefault()
        cycleThemeMode()
        return
      }
      
      // Ctrl+\ - 切换文件树
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault()
        updateShowFileTree(prev => !prev)
        return
      }
      
      // Shift+Alt+F - 格式化文档
      if (e.shiftKey && e.altKey && e.key === 'F') {
        e.preventDefault()
        if (editorRef.current) {
          handleMenuFormatDocument()
        }
        return
      }
      
      // Ctrl+1-6 - 插入标题
      if (e.ctrlKey && /^[1-6]$/.test(e.key) && editorRef.current) {
        e.preventDefault()
        const level = parseInt(e.key)
        const prefix = '#'.repeat(level) + ' '
        handleToolbarInsert(prefix, '', 'heading')
        return
      }
    }
    
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  useEffect(() => {
    if (!initialStateLoaded || initialDocumentHandledRef.current) {
      return
    }

    initialDocumentHandledRef.current = true
    const params = new URLSearchParams(window.location.search)
    const path = params.get('path')
    const openSync = params.get('open') === 'sync'

    const runPublishFlow = () => {
      const fmt = getFormatFromPath(path)
      if (fmt === FORMAT_DOCX || fmt === FORMAT_XLSX || fmt === FORMAT_PPTX_EXPERIMENTAL) {
        showToast('Office 只读预览：同步已禁用', 'warning', 3000)
        return
      }
      setShowSyncDialog(true)
      const url = new URL(window.location.href)
      url.searchParams.delete('open')
      window.history.replaceState({}, '', url.pathname + url.search + (url.hash || ''))
    }

    if (path) {
      loadFile(path).then((ok) => {
        if (openSync && ok) runPublishFlow()
      })
    } else {
      setCurrentFileFormat(null)
      imageDataRef.current = null
      const draft = loadEditorDraft()
      if (draft && draft.content !== '') {
        setContent(draft.content)
        setCurrentPath(draft.currentPath || '')
        lastSavedContentRef.current = draft.content
        lastSavedPathRef.current = draft.currentPath || ''
        setStatus('已恢复本地草稿')
      } else {
        void clearPersistedContent()
        setContent(DEFAULT_DOCUMENT_CONTENT)
        setCurrentPath('')
        lastSavedContentRef.current = DEFAULT_DOCUMENT_CONTENT
        lastSavedPathRef.current = ''
      }
      if (openSync) runPublishFlow()
    }
  }, [initialStateLoaded])

  // 全格式支持：实际加载文件内容
  const loadOfficePreview = useCallback(async (path, format, { sheetIndex = 0, rowOffset = 0, rowLimit = 200, append = false } = {}) => {
    if (append) {
      setOfficePreviewLoadingMore(true)
    } else {
      setOfficePreviewLoading(true)
    }
    setOfficePreviewError(null)
    if (!append) setOfficePreviewMetadata(null)
    try {
      const sheetIndexParam = format === FORMAT_XLSX ? `&sheetIndex=${encodeURIComponent(String(sheetIndex || 0))}` : ''
      const rowParams = format === FORMAT_XLSX
        ? `&rowOffset=${encodeURIComponent(String(rowOffset || 0))}&rowLimit=${encodeURIComponent(String(rowLimit || 200))}`
        : ''
      const res = await fetch(`/api/file/office/extract?path=${encodeURIComponent(path)}&format=${encodeURIComponent(format)}${sheetIndexParam}${rowParams}`)
      const data = await res.json()
      if (data?.ok) {
        if (append && format === FORMAT_XLSX) {
          setOfficePreviewData((prev) => {
            if (!prev || prev.kind !== 'table') return data.content
            if (prev.sheetIndex !== data.content?.sheetIndex) return data.content
            const nextRows = Array.isArray(prev.rows) ? prev.rows.concat(data.content?.rows || []) : (data.content?.rows || [])
            return { ...data.content, rows: nextRows }
          })
        } else {
          setOfficePreviewData(data.content)
        }
        setOfficePreviewMetadata(data.metadata || null)
        setOfficePreviewLoading(false)
        setOfficePreviewLoadingMore(false)
        return true
      }
      const friendlyMsg = getUserFriendlyMessage(
        new Error(data?.message || data?.code || 'OFFICE_LOAD_ERROR'),
        { operation: '加载 Office 文件', filePath: path }
      )
      setOfficePreviewError(friendlyMsg.message || 'Office 预览加载失败')
      setOfficePreviewLoading(false)
      setOfficePreviewLoadingMore(false)
      return false
    } catch (e) {
      const friendlyMsg = handleError(e, { operation: '加载 Office 文件', filePath: path })
      setOfficePreviewError(friendlyMsg.message || 'Office 预览加载失败')
      setOfficePreviewLoading(false)
      setOfficePreviewLoadingMore(false)
      return false
    }
  }, [])

  const doLoadFile = useCallback(async (path, format, mode) => {
    try {
      await clearPersistedContent()
      clearEditorDraft()
      imageDataRef.current = null
      try {
        officeLoadControllerRef.current?.abort?.()
      } catch (_) {}
      officeLoadControllerRef.current = null
      setOfficePreviewData(null)
      setOfficePreviewMetadata(null)
      setOfficePreviewError(null)
      setOfficePreviewLoading(false)
      setOfficePreviewLoadingMore(false)
      setOfficeXlsxSheetIndex(0)
      setCurrentFileFormat(format)

      setStatus('正在加载...')

      // Office：只读预览走专用接口
      if (format === FORMAT_DOCX || format === FORMAT_XLSX) {
        const ok = await loadOfficePreview(path, format, { sheetIndex: 0, rowOffset: 0, rowLimit: 200, append: false })
        if (!ok) {
          setStatus(`加载失败: ${officePreviewError || 'Office 预览加载失败'}`)
          return false
        }

        setContent('')
        lastSavedContentRef.current = ''
        lastSavedPathRef.current = path
        imageDataRef.current = null

        // Office 默认只读预览：强制仅预览模式
        if (layout !== 'preview-only') {
          setLayout('preview-only')
        }
        if (isAdaptiveSinglePaneViewport && mobileActivePane !== 'preview') {
          setMobileActivePane('preview')
        }

        setCurrentPath(path)
        const loadedName = path.split('/').pop() || ''
        setDocumentTitle(loadedName.replace(/\.[^.]+$/, ''))
        setStatus(`已加载: ${path}`)
        return true
      }

      // PPTX 实验：只显示二进制信息，不提供解析预览
      if (format === FORMAT_PPTX_EXPERIMENTAL) {
        setOfficePreviewData({ kind: 'pptx-info' })
        setOfficePreviewMetadata(null)
        setOfficePreviewError(null)
        setOfficePreviewLoading(false)
        setContent('')
        lastSavedContentRef.current = ''
        lastSavedPathRef.current = path
        imageDataRef.current = null

        if (layout !== 'preview-only') {
          setLayout('preview-only')
        }
        if (isAdaptiveSinglePaneViewport && mobileActivePane !== 'preview') {
          setMobileActivePane('preview')
        }

        setCurrentPath(path)
        const loadedName = path.split('/').pop() || ''
        setDocumentTitle(loadedName.replace(/\.[^.]+$/, ''))
        setStatus(`已加载: ${path}`)
        return true
      }

      // 对于PDF文件，始终使用binary模式获取原始内容
      const modeParam = format === FORMAT_PDF ? 'binary' : 
                       mode === 'binary' ? 'binary' : 
                       mode === 'hex' ? 'hex' : 'text'
      const response = await fetch(`/api/file?path=${encodeURIComponent(path)}&mode=${modeParam}`)
      const data = await response.json()

      if (data.ok) {
        const fileContent = data.content || ''

        // 如果是图片或PDF格式，立即清空预览区显示加载状态
        if ((format === FORMAT_IMAGE || format === FORMAT_PDF) && previewRef.current) {
          previewRef.current.innerHTML = '<div class="preview-loading" style="display:flex;align-items:center;justify-content:center;min-height:200px;padding:24px;color:var(--text-secondary);font-size:14px;">正在加载...</div>'
        }

        // 检查文件大小（文本/hex 按字符长度，binary 按 base64 解码后估算）
        const sizeBytes = mode === 'binary' ? (fileContent.length * 3) / 4 : new Blob([fileContent]).size
        const fileSizeKB = sizeBytes / 1024
        if (fileSizeKB > 1024) {
          const fileSizeMB = (fileSizeKB / 1024).toFixed(2)
          showToast(`文件较大（${fileSizeMB} MB），加载可能需要一些时间`, 'info', 1000)
        }

        await addRecentFile(path)
        setRecentFiles(await getRecentFiles())

        if (format === FORMAT_IMAGE) {
          currentFileEncodingRef.current = 'base64'
          const mime = path.toLowerCase().endsWith('.png') ? 'image/png' : path.toLowerCase().endsWith('.gif') ? 'image/gif' : path.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg'
          imageDataRef.current = `data:${mime};base64,${fileContent}`
          // 使用 Markdown 语法引用图片，使用 /api/media 路径方式
          const mediaPath = `/api/media?path=${encodeURIComponent(path)}`
          const initialMarkdown = `![${path.split('/').pop()}](${mediaPath})`
          setContent(initialMarkdown)
          lastSavedContentRef.current = initialMarkdown
          lastSavedPathRef.current = path

          // 图片文件：强制仅预览
          if (layout !== 'preview-only') {
            setLayout('preview-only')
          }
          if (isAdaptiveSinglePaneViewport && mobileActivePane !== 'preview') {
            setMobileActivePane('preview')
          }
        } else if (format === FORMAT_PDF) {
          currentFileEncodingRef.current = 'base64'
          pdfDataRef.current = `data:application/pdf;base64,${fileContent}`
          // PDF文件设置为空内容，因为不需要编辑
          setContent('')
          lastSavedContentRef.current = ''
          lastSavedPathRef.current = path
          imageDataRef.current = null
          // PDF文件布局规则：打开时自动切换到仅预览模式
          if (layout !== 'preview-only') {
            setLayout('preview-only')
          }
          // 移动端：切换到预览视图
          if (isAdaptiveSinglePaneViewport && mobileActivePane !== 'preview') {
            setMobileActivePane('preview')
          }
        } else {
          currentFileEncodingRef.current = mode === 'hex' ? 'hex' : 'utf8'
          setContent(fileContent)
          lastSavedContentRef.current = fileContent
          lastSavedPathRef.current = path

          // Markdown：默认左右布局；非 Markdown 文本：强制仅编辑
          if (format === FORMAT_MD) {
            if (layout !== 'vertical') {
              setLayout('vertical')
            }
          } else if (layout !== 'editor-only') {
            setLayout('editor-only')
          }
        }

        setCurrentPath(path)
        const loadedName = path.split('/').pop() || ''
        setDocumentTitle(loadedName.replace(/\.[^.]+$/, ''))
        setStatus(`已加载: ${path}`)
        return true
      } else {
        const errorMsg = getUserFriendlyMessage(
          new Error(data.message || data.code),
          { operation: '加载文件', filePath: path }
        )
        setStatus(`加载失败: ${data.message || data.code}`)
        console.error(errorMsg)
        // 移除自动布局切换，沿用当前布局
        showToast('文件读取失败', 'error', 3000)
        return false
      }
    } catch (error) {
      const formattedError = handleError(error, { operation: '加载文件', filePath: path })
      setStatus(`加载失败: ${formattedError.message}`)
      // 移除自动布局切换，沿用当前布局
      showToast('文件读取失败', 'error', 3000)
      return false
    }
  }, [requestConfirm, showToast, layout, isAdaptiveSinglePaneViewport, mobileActivePane])

  // 全格式支持：按格式加载文件并应用自动布局
  const loadFile = useCallback(async (path) => {
    const format = getFormatFromPath(path)
    if (format === FORMAT_UNSUPPORTED) {
      pendingUnsupportedPathRef.current = path
      setShowUnsupportedFormatDialog(true)
      return false
    }
    return doLoadFile(path, format, format === FORMAT_IMAGE ? 'binary' : 'text')
  }, [doLoadFile])

  const handleUnsupportedFormatChoice = useCallback(async (choice) => {
    const path = pendingUnsupportedPathRef.current
    setShowUnsupportedFormatDialog(false)
    pendingUnsupportedPathRef.current = null
    if (!path || choice === 'cancel') return
    const mode = choice === 'hex' ? 'hex' : 'text'
    const loaded = await doLoadFile(path, FORMAT_UNSUPPORTED, mode)
    if (loaded) {
      pendingSwitchPathRef.current = null
      updateShowFileTree((prev) => (isCompactViewport ? false : prev))
    }
  }, [doLoadFile, isCompactViewport, updateShowFileTree])

  const hasUnsavedChanges = useCallback(() => {
    if (!content) {
      return false
    }

    if (!currentPath) {
      return content !== lastSavedContentRef.current
    }

    return currentPath !== lastSavedPathRef.current || content !== lastSavedContentRef.current
  }, [content, currentPath])

  const continuePendingSwitch = useCallback(async () => {
    const pendingSwitchPath = pendingSwitchPathRef.current
    if (!pendingSwitchPath) {
      return false
    }

    const loaded = await loadFile(pendingSwitchPath)
    if (loaded) {
      pendingSwitchPathRef.current = null
      updateShowFileTree((prev) => (isCompactViewport ? false : prev))
      return true
    }

    pendingSwitchPathRef.current = null
    return false
  }, [isCompactViewport, loadFile, updateShowFileTree])

  const handleSwitchSaveConfirm = useCallback(async () => {
    if (!currentPath) {
      setShowSwitchSaveConfirm(false)
      setIsSaveAsMode(false)
      setShowSaveAsDialog(true)
      setStatus('当前内容尚未保存，请先保存后再切换文件')
      return
    }

    const isPdf = currentPath.toLowerCase().endsWith('.pdf')
    if (currentFileFormat === FORMAT_IMAGE || isPdf || currentFileFormat === FORMAT_UNSUPPORTED) {
      setShowSwitchSaveConfirm(false)
      const format = currentFileFormat === FORMAT_IMAGE ? 'image' : isPdf ? 'pdf' : 'unsupported'
      const msg = format === 'image' ? '修改图片二进制内容可能导致图片损坏，是否确认保存？'
        : format === 'pdf' ? '仅保存提取的纯文本内容，原 PDF 格式将被覆盖，是否确认？'
        : '修改该格式文件可能导致文件损坏，是否确认保存？'
      setShowSaveConfirmDialog({
        format,
        title: format === 'pdf' ? '保存 PDF 文件' : format === 'image' ? '保存图片文件' : '保存非原生支持文件',
        message: msg
      })
      pendingSaveAfterConfirmRef.current = { path: currentPath, content, isSwitch: true }
      return
    }

    setShowSwitchSaveConfirm(false)
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }

    const success = await saveFile(currentPath, content)
    if (!success) return

    await saveFileHistory(currentPath, content, '', false).catch(err => {
      console.warn('切换前保存历史版本失败:', err)
    })

    await continuePendingSwitch()
  }, [content, continuePendingSwitch, currentPath, currentFileFormat])

  const handleSwitchWithoutSaving = useCallback(async () => {
    setShowSwitchSaveConfirm(false)
    await continuePendingSwitch()
  }, [continuePendingSwitch])

  const openFileWithGuard = useCallback(async (filePath) => {
    if (!filePath) {
      return false
    }

    if (filePath === currentPath && currentPath) {
      updateShowFileTree((prev) => (isCompactViewport ? false : prev))
      return true
    }

    if (hasUnsavedChanges()) {
      pendingSwitchPathRef.current = filePath
      setShowSwitchSaveConfirm(true)
      return false
    }

    pendingSwitchPathRef.current = filePath
    return continuePendingSwitch()
  }, [continuePendingSwitch, hasUnsavedChanges, currentPath])

  const handleFileSelect = useCallback((filePath, node) => {
    // 从文件树节点获取 size 和 mtime
    if (node && node.size !== undefined) {
      setCurrentFileSize(node.size)
    } else {
      setCurrentFileSize(null)
    }
    if (node && node.mtime !== undefined) {
      setCurrentFileMtime(node.mtime)
    } else {
      setCurrentFileMtime(null)
    }
    void openFileWithGuard(filePath)
  }, [openFileWithGuard])

  const handleNewFile = useCallback(() => {
    setSlashMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev))
    setShowNewFileDialog(true)
  }, [])

  const [initialFileName, setInitialFileName] = useState('')

  const handleNewFileConfirm = useCallback((fileContent) => {
    setSlashMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev))
    void clearPersistedContent()
    clearEditorDraft()
    imageDataRef.current = null
    setCurrentFileFormat(null)
    lastSavedContentRef.current = fileContent
    lastSavedPathRef.current = ''
    setContent(fileContent)
    setDocumentTitle('')
    setCurrentPath('')
    setInitialFileName('')
    setStatus('新建文件 - 未保存')
  }, [])

  const handleSaveAsConfirm = useCallback(async (newPath) => {
    // 使用当前编辑器内容进行保存
    const success = await saveFile(newPath, content)
    if (success) {
      setCurrentPath(newPath)
      const savedName = newPath.split('/').pop() || ''
      setDocumentTitle(savedName.replace(/\.[^.]+$/, ''))
      setStatus(`已保存: ${newPath}`)
      
      // 另存为后创建历史版本（标记为手动保存）
      await saveFileHistory(newPath, content, '', false).catch(err => {
        console.warn('保存历史版本失败:', err)
      })
      
      // 刷新文件树（刷新父目录）
      if (fileTreeRef.current && fileTreeRef.current.refreshDirectory) {
        const parentPath = newPath.split('/').slice(0, -1).join('/') || '/'
        await fileTreeRef.current.refreshDirectory(parentPath)
      }

      const pendingSwitchPath = pendingSwitchPathRef.current
      if (pendingSwitchPath) {
        pendingSwitchPathRef.current = null
        await loadFile(pendingSwitchPath)
        updateShowFileTree((prev) => (isCompactViewport ? false : prev))
        return
      }
      
      setTimeout(() => setStatus('就绪'), 2000)
    }
  }, [content, isCompactViewport, loadFile, updateShowFileTree]) // 依赖 content

  const handleImageUpload = useCallback(async (file) => {
    if (!file || !editorRef.current) return

    const isHEIC = file.name?.toLowerCase?.().endsWith('.heic') || file.name?.toLowerCase?.().endsWith('.heif')

    setStatus('正在压缩图片...')

    try {
      // 压缩图片（按设置开关；HEIC 跳过，服务器端转换）
      try {
        if (isHEIC) {
          setStatus('正在上传图片...')
        } else {
          file = await compressImage(file)
          setStatus('正在上传图片...')
        }
      } catch (error) {
        console.error('图片压缩失败:', error)
        setStatus('正在上传图片...')
      }
      
      // 上传图片
      const formData = new FormData()
      formData.append('images', file)
      
      const response = await fetch('/api/image/upload', {
        method: 'POST',
        body: formData
      })
      
      const result = await response.json()
      
      if (result.ok && result.images && result.images.length > 0) {
        const image = result.images[0]
        const markdown = `![图片](${image.url})`
        
        // 插入到编辑器，上下各留一行空格
        const editor = editorRef.current
        const selection = editor.getSelection()
        editor.executeEdits('paste-image', [{
          range: selection,
          text: `\n\n${markdown}\n\n`,
          forceMoveMarkers: true
        }])
        
        setStatus(`图片上传成功: ${image.filename}`)
        setTimeout(() => setStatus('就绪'), 2000)
      } else {
        const errorMsg = getUserFriendlyMessage(
          new Error(result.message || '上传失败'),
          { operation: '图片上传', fileName: file.name }
        )
        setStatus(`图片上传失败: ${result.message || '未知错误'}`)
        logError(new Error(result.message || '上传失败'), {
          operation: '图片上传',
          fileName: file.name,
          fileSize: file.size,
          responseData: result
        })
        setTimeout(() => setStatus('就绪'), 2000)
      }
    } catch (error) {
      const formattedError = handleError(error, {
        operation: '图片上传',
        fileName: file.name,
        fileSize: file.size
      })
      setStatus(`图片上传失败: ${formattedError.message}`)
      setTimeout(() => setStatus('就绪'), 2000)
    }
  }, [])

  // 处理大纲点击，联动编辑区与预览区
  const handleHeadingClick = useCallback((headingOrLine) => {
    if (!editorRef.current) return

    const lineNumber =
      typeof headingOrLine === 'number'
        ? headingOrLine
        : headingOrLine && typeof headingOrLine === 'object'
        ? headingOrLine.line
        : null

    if (!lineNumber) return

    const editor = editorRef.current
    // 跳转到指定行并居中显示
    editor.revealLineInCenter(lineNumber)
    // 设置光标位置
    editor.setPosition({ lineNumber, column: 1 })
    // 聚焦编辑器
    editor.focus()

    // 尝试联动预览区：根据标题文本定位到对应的 heading 元素并滚动到中间
    if (!syncPreviewWithEditorRef.current) return

    const headingText =
      headingOrLine && typeof headingOrLine === 'object' ? headingOrLine.text : null

    if (!previewRef.current || !headingText) return

    const previewRoot = previewRef.current
    const previewPane = previewRoot.parentElement || previewRoot

    // 查找第一个匹配标题文本的 h1-h6
    const headingEls = previewRoot.querySelectorAll('h1, h2, h3, h4, h5, h6')
    let target = null
    for (const el of headingEls) {
      if (el.textContent && el.textContent.trim() === headingText) {
        target = el
        break
      }
    }

    if (!target || !previewPane) return

    const targetRect = target.getBoundingClientRect()
    const paneRect = previewPane.getBoundingClientRect()
    const currentScrollTop = previewPane.scrollTop
    const targetOffset = targetRect.top - paneRect.top + currentScrollTop
    const centerOffset = previewPane.clientHeight / 2 - targetRect.height / 2

    previewPane.scrollTo({
      top: targetOffset - centerOffset,
      behavior: 'smooth'
    })
  }, [])

  // 移动端预览区大纲点击：仅滚动预览并关闭面板
  const handleMobileOutlineHeadingClick = useCallback((headingOrLine) => {
    const headingText =
      headingOrLine && typeof headingOrLine === 'object' ? headingOrLine.text : null
    if (!previewRef.current || !headingText) {
      setShowMobileOutlinePanel(false)
      return
    }
    const previewRoot = previewRef.current
    const previewPane = previewRoot.parentElement || previewRoot
    const headingEls = previewRoot.querySelectorAll('h1, h2, h3, h4, h5, h6')
    let target = null
    for (const el of headingEls) {
      if (el.textContent && el.textContent.trim() === headingText) {
        target = el
        break
      }
    }
    if (target && previewPane) {
      const targetRect = target.getBoundingClientRect()
      const paneRect = previewPane.getBoundingClientRect()
      const currentScrollTop = previewPane.scrollTop
      const targetOffset = targetRect.top - paneRect.top + currentScrollTop
      const centerOffset = previewPane.clientHeight / 2 - targetRect.height / 2
      previewPane.scrollTo({
        top: targetOffset - centerOffset,
        behavior: 'smooth'
      })
    }
    setShowMobileOutlinePanel(false)
  }, [])

  // 插入表格
  const insertTable = useCallback((markdown) => {
    if (!editorRef.current) return

    const editor = editorRef.current
    const selection = editor.getSelection()
    const position = selection.getStartPosition()

    // 插入表格
    editor.executeEdits('insert-table', [{
      range: {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      },
      text: '\n' + markdown + '\n'
    }])

    // 移动光标到表格后
    const lines = markdown.split('\n').length
    const newPosition = {
      lineNumber: position.lineNumber + lines + 2,
      column: 1
    }
    editor.setPosition(newPosition)
    editor.focus()
  }, [])

  const handleSaveClick = useCallback(async () => {
    if (isOfficeReadOnly) {
      showToast('Office 只读预览：保存已禁用', 'warning', 3000)
      return
    }
    if (currentPath) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
      // PDF/图片/非支持格式：保存前二次确认
      const isPdf = currentPath.toLowerCase().endsWith('.pdf')
      if (currentFileFormat === FORMAT_IMAGE) {
        setShowSaveConfirmDialog({
          format: 'image',
          title: '保存图片文件',
          message: '修改图片二进制内容可能导致图片损坏，是否确认保存？'
        })
        pendingSaveAfterConfirmRef.current = { path: currentPath, content, isSwitch: false }
        return
      }
      if (isPdf) {
        setShowSaveConfirmDialog({
          format: 'pdf',
          title: '保存 PDF 文件',
          message: '仅保存提取的纯文本内容，原 PDF 格式将被覆盖，是否确认？'
        })
        pendingSaveAfterConfirmRef.current = { path: currentPath, content, isSwitch: false }
        return
      }
      if (currentFileFormat === FORMAT_UNSUPPORTED) {
        setShowSaveConfirmDialog({
          format: 'unsupported',
          title: '保存非原生支持文件',
          message: '修改该格式文件可能导致文件损坏，是否确认保存？'
        })
        pendingSaveAfterConfirmRef.current = { path: currentPath, content, isSwitch: false }
        return
      }
      const success = await saveFile(currentPath, content)
      if (success) {
        await saveFileHistory(currentPath, content, '', false).catch(err => {
          console.warn('保存历史版本失败:', err)
        })
      }
    } else {
      const titleBasedName = sanitizeFileNameFromTitle(documentTitle)
      setInitialFileName(titleBasedName || '')
      setIsSaveAsMode(false)
      setShowSaveAsDialog(true)
    }
  }, [currentPath, content, currentFileFormat, documentTitle])

  // 恢复历史版本
  const handleVersionRestore = useCallback(async (restoredContent, version) => {
    if (!restoredContent) return
    
    // 更新编辑器内容
    setContent(restoredContent)
    
    // 自动保存一个新版本，标记为从哪个版本恢复
    try {
      await saveFileHistory(
        currentPath, 
        restoredContent, 
        `从版本 ${version.versionNumber} 恢复`, 
        false // 手动保存
      )
    } catch (error) {
      console.error('保存恢复版本失败:', error)
    }
    
    // 显示成功提示
    setStatus(`已恢复到版本 ${version.versionNumber}`)
    setStatusType('success')
    setTimeout(() => {
      setStatus('就绪')
      setStatusType('normal')
    }, 3000)
    
    // 聚焦编辑器
    if (editorRef.current) {
      editorRef.current.focus()
    }
  }, [currentPath])

  const handleSaveConfirmChoice = useCallback(async (choice) => {
    const pending = pendingSaveAfterConfirmRef.current
    setShowSaveConfirmDialog(null)
    pendingSaveAfterConfirmRef.current = null
    if (!pending || choice === 'cancel') return
    if (choice === 'saveAsMd') {
      setInitialFileName((pending.path.split('/').pop() || 'untitled').replace(/\.[^.]+$/, '') + '.md')
      setIsSaveAsMode(true)
      setShowSaveAsDialog(true)
      return
    }
    if (choice === 'confirm') {
      const success = await saveFile(pending.path, pending.content)
      if (success) {
        await saveFileHistory(pending.path, pending.content, '', false).catch(err => {
          console.warn('保存历史版本失败:', err)
        })
        if (pending.isSwitch) {
          await continuePendingSwitch()
        }
      }
    }
  }, [continuePendingSwitch])

  const handleSaveAs = useCallback(() => {
    setIsSaveAsMode(true)
    setShowSaveAsDialog(true)
  }, [])

  const handleSaveAsDialogClose = useCallback(() => {
    pendingSwitchPathRef.current = null
    setShowSaveAsDialog(false)
  }, [])

  // 转换为微信公众号专属格式
  const convertToWechatFormat = async (html) => {
    // 安全检查：确保 previewRef 可用
    if (!previewRef.current) {
      console.error('[微信导出] previewRef.current 不存在，返回原始 HTML')
      return html
    }
    
    // 创建临时容器
    const container = document.createElement('div')
    container.innerHTML = html
    
    // ========== 1. 处理 Mermaid SVG → 图片 ==========
    console.log('[微信导出] 开始处理 Mermaid 图表')
    const mermaidElements = container.querySelectorAll('.mermaid')
    
    for (let index = 0; index < mermaidElements.length; index++) {
      const mermaidEl = mermaidElements[index]
      try {
        // 查找 SVG 元素
        const svgElement = mermaidEl.querySelector('svg')
        if (svgElement) {
          console.log(`[微信导出] 找到 Mermaid SVG ${index + 1}`)
          
          // 获取 SVG 的实际尺寸
          const width = svgElement.getAttribute('width') || svgElement.viewBox?.baseVal?.width || 800
          const height = svgElement.getAttribute('height') || svgElement.viewBox?.baseVal?.height || 600
          
          console.log(`[微信导出] Mermaid ${index + 1} 尺寸:`, { width, height })
          
          // 获取 SVG 的完整 HTML（包括所有样式）
          const svgString = new XMLSerializer().serializeToString(svgElement)
          
          // 转换为 Data URL
          const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString)
          
          // 创建 img 标签
          const img = document.createElement('img')
          img.src = svgDataUrl
          img.alt = `Mermaid Diagram ${index + 1}`
          img.setAttribute('style', `max-width: 100%; height: auto; display: block; margin: 20px auto;`)
          
          // 用 p 标签包裹
          const p = document.createElement('p')
          p.setAttribute('style', 'text-align: center; margin: 20px 0;')
          p.appendChild(img)
          
          // 替换原始元素
          mermaidEl.parentNode.replaceChild(p, mermaidEl)
          
          console.log(`[微信导出] Mermaid ${index + 1} 转换为图片成功`)
        }
      } catch (err) {
        console.error(`[微信导出] Mermaid ${index + 1} 处理失败:`, err)
      }
    }
    
    // ========== 2. 处理数学公式 (KaTeX) → PNG 图片（使用第三方 API）==========
    console.log('[微信导出] 开始处理数学公式')
    
    // 辅助函数：将 LaTeX 转换为图片 URL（使用 CodeCogs API）
    const latexToImageUrl = (latex, isDisplay) => {
      // 清理 LaTeX 代码
      const cleanLatex = latex.trim()
      
      const encodedLatex = encodeURIComponent(cleanLatex)
      
      // 使用高 DPI 的 PNG 格式（微信编辑器不支持 SVG）
      const dpi = isDisplay ? 300 : 250  // 块级 300 DPI，行内 250 DPI
      return `https://latex.codecogs.com/png.latex?\\dpi{${dpi}}\\bg_white ${encodedLatex}`
    }
    
    // 从预览区获取数学公式元素（安全检查）
    let previewMathElements = []
    try {
      if (previewRef.current) {
        previewMathElements = previewRef.current.querySelectorAll('.katex, .katex-display')
      }
    } catch (err) {
      console.error('[微信导出] 获取预览区数学公式失败:', err)
    }
    console.log(`[微信导出] 找到 ${previewMathElements.length} 个数学公式`)
    
    // 提取 LaTeX 代码
    const mathDataMap = []
    
    previewMathElements.forEach((mathEl, index) => {
      try {
        const isDisplay = mathEl.classList.contains('katex-display')
        
        // 从 KaTeX 渲染的 HTML 中提取原始 LaTeX
        // KaTeX 会在 annotation 标签中保存原始 LaTeX
        const annotation = mathEl.querySelector('annotation[encoding="application/x-tex"]')
        
        if (annotation) {
          const latex = annotation.textContent
          console.log(`[微信导出] 公式 ${index + 1} LaTeX:`, latex.substring(0, 50))
          
          const imageUrl = latexToImageUrl(latex, isDisplay)
          
          mathDataMap.push({
            isDisplay,
            imageUrl
          })
          
          console.log(`[微信导出] 公式 ${index + 1} 将使用在线渲染`)
        } else {
          console.warn(`[微信导出] 公式 ${index + 1} 未找到 LaTeX 源码`)
          mathDataMap.push(null)
        }
      } catch (err) {
        console.error(`[微信导出] 公式 ${index + 1} 处理失败:`, err)
        mathDataMap.push(null)
      }
    })
    
    // 在 container 中替换数学公式为图片
    const containerMathElements = container.querySelectorAll('.katex, .katex-display')
    containerMathElements.forEach((mathEl, index) => {
      if (mathDataMap[index]) {
        const { isDisplay, imageUrl } = mathDataMap[index]
        
        // 创建 img 标签
        const img = document.createElement('img')
        img.src = imageUrl
        img.alt = isDisplay ? `Math Formula ${index + 1}` : 'Math'
        
        if (isDisplay) {
          // 块级公式：居中显示
          img.setAttribute('style', 'max-width: 100%; display: block; margin: 20px auto;')
          
          // 用 p 标签包裹
          const p = document.createElement('p')
          p.setAttribute('style', 'text-align: center; margin: 20px 0;')
          p.appendChild(img)
          
          mathEl.parentNode.replaceChild(p, mathEl)
        } else {
          // 行内公式：内联显示
          img.setAttribute('style', 'display: inline-block; vertical-align: middle; max-height: 1.5em;')
          mathEl.parentNode.replaceChild(img, mathEl)
        }
      }
    })
    
    console.log(`[微信导出] 数学公式处理完成，成功: ${mathDataMap.filter(m => m).length}/${mathDataMap.length}`)
    
    // ========== 3. 处理图片 ==========
    const figures = container.querySelectorAll('figure, .image-figure, .image-figure-no-caption')
    figures.forEach(figure => {
      const img = figure.querySelector('img')
      const figcaption = figure.querySelector('figcaption, .image-caption')
      
      if (img) {
        // 使用 p 标签包裹（微信公众号更兼容）
        const p = document.createElement('p')
        p.setAttribute('style', 'text-align: center; margin: 10px 0;')
        
        // 克隆图片
        const newImg = img.cloneNode(true)
        const imgStyle = img.getAttribute('style') || ''
        
        console.log('[微信导出] 原始图片样式:', imgStyle)
        
        // 检查是否有 width 百分比
        const widthMatch = imgStyle.match(/width:\s*(\d+)%/)
        
        if (widthMatch) {
          const widthPercent = parseInt(widthMatch[1])
          console.log('[微信导出] 提取到 width 百分比:', widthPercent)
          
          // 获取图片的实际宽度
          const actualWidth = img.naturalWidth || img.width
          console.log('[微信导出] 图片实际宽度:', actualWidth)
          
          // 计算目标宽度（假设容器宽度为 677px，这是微信公众号的标准宽度）
          const containerWidth = 677
          const targetWidth = Math.round(containerWidth * widthPercent / 100)
          
          console.log('[微信导出] 计算目标宽度:', targetWidth)
          
          // 使用像素值而不是百分比
          newImg.setAttribute('style', `width: ${targetWidth}px; display: block; margin: 0 auto;`)
        } else {
          // 没有 width，保留原样
          console.log('[微信导出] 没有 width，保留原样')
        }
        
        console.log('[微信导出] 最终图片 HTML:', newImg.outerHTML)
        
        p.appendChild(newImg)
        
        // 如果有图注，添加到 p 后面
        if (figcaption && figcaption.textContent.trim()) {
          const caption = document.createElement('p')
          caption.setAttribute('style', 'text-align: center; color: #999; font-size: 14px; margin-top: 5px;')
          caption.textContent = figcaption.textContent
          
          // 创建容器包裹图片和图注
          const container = document.createElement('div')
          container.appendChild(p)
          container.appendChild(caption)
          figure.parentNode.replaceChild(container, figure)
        } else {
          // 没有图注，直接替换
          figure.parentNode.replaceChild(p, figure)
        }
      }
    })
    
    // 处理直接在 p 标签中的图片
    const paragraphsWithImg = container.querySelectorAll('p:has(img)')
    paragraphsWithImg.forEach(p => {
      p.setAttribute('style', 'text-align: center; margin: 10px 0;')
      const img = p.querySelector('img')
      if (img) {
        const imgStyle = img.getAttribute('style') || ''
        const hasWidth = imgStyle.indexOf('width') >= 0 || imgStyle.indexOf('WIDTH') >= 0
        
        let finalStyle = imgStyle.trim()
        if (finalStyle && !finalStyle.endsWith(';')) {
          finalStyle += ';'
        }
        
        if (hasWidth) {
          finalStyle += ' display: inline-block;'
        } else {
          finalStyle += ' display: inline-block; max-width: 100%;'
        }
        
        img.setAttribute('style', finalStyle)
      }
    })
    
    // 处理所有独立的 img 标签
    const standaloneImages = container.querySelectorAll('img:not(figure img):not(p img)')
    standaloneImages.forEach(img => {
      const section = document.createElement('section')
      section.setAttribute('style', 'text-align: center; margin: 10px 0;')
      const imgStyle = img.getAttribute('style') || ''
      const hasWidth = imgStyle.indexOf('width') >= 0 || imgStyle.indexOf('WIDTH') >= 0
      
      let finalStyle = imgStyle.trim()
      if (finalStyle && !finalStyle.endsWith(';')) {
        finalStyle += ';'
      }
      
      if (hasWidth) {
        finalStyle += ' display: inline-block;'
      } else {
        finalStyle += ' display: inline-block; max-width: 100%;'
      }
      
      img.setAttribute('style', finalStyle)
      img.parentNode.insertBefore(section, img)
      section.appendChild(img)
    })
    
    // 微信公众号样式（简化版，主要依赖内联样式）
    const wechatStyles = `
      <style>
        /* 微信公众号基础样式 */
        section {
          margin: 10px 0;
          padding: 0;
        }
        
        /* 标题样式 */
        h1 {
          font-size: 24px;
          font-weight: bold;
          color: #000;
          margin: 20px 0 10px;
          padding-bottom: 10px;
          border-bottom: 2px solid #3daeff;
        }
        
        h2 {
          font-size: 22px;
          font-weight: bold;
          color: #000;
          margin: 18px 0 8px;
          padding-left: 10px;
          border-left: 4px solid #3daeff;
        }
        
        h3 {
          font-size: 20px;
          font-weight: bold;
          color: #333;
          margin: 16px 0 8px;
        }
        
        /* 段落样式 */
        p {
          margin: 10px 0;
          line-height: 1.75;
          font-size: 16px;
          color: #333;
        }
        
        /* 引用样式 */
        blockquote {
          margin: 15px 0;
          padding: 10px 15px;
          background: #f7f7f7;
          border-left: 4px solid #3daeff;
          color: #666;
          font-style: italic;
        }
        
        /* 代码块样式 */
        pre {
          margin: 15px 0;
          padding: 15px;
          background: #f6f8fa;
          border-radius: 4px;
          overflow-x: auto;
        }
        
        code {
          padding: 2px 6px;
          background: #f0f0f0;
          border-radius: 3px;
          font-size: 14px;
          color: #e83e8c;
        }
        
        pre code {
          padding: 0;
          background: transparent;
          color: #333;
        }
        
        /* 列表样式 */
        ul, ol {
          margin: 10px 0;
          padding-left: 30px;
        }
        
        li {
          margin: 5px 0;
          line-height: 1.75;
        }
        
        /* 表格样式 */
        table {
          width: 100%;
          margin: 15px 0;
          border-collapse: collapse;
        }
        
        table th {
          background: #3daeff;
          color: #fff;
          padding: 10px;
          text-align: left;
        }
        
        table td {
          padding: 10px;
          border: 1px solid #ddd;
        }
        
        table tr:nth-child(even) {
          background: #f9f9f9;
        }
        
        /* 链接样式 */
        a {
          color: #3daeff;
          text-decoration: none;
        }
        
        /* 分隔线 */
        hr {
          margin: 20px 0;
          border: none;
          border-top: 1px solid #ddd;
        }
      </style>
    `
    
    // 获取主题背景色并直接应用到最外层容器
    try {
      const themeStyleEl = document.querySelector('#export-config-styles')
      if (themeStyleEl) {
        const cssContent = themeStyleEl.textContent
        // 提取 .markdown-body 的背景色
        const bgColorMatch = cssContent.match(/\.markdown-body\s*\{[^}]*?background-color:\s*([^;!}]+)/s)
        const bgImageMatch = cssContent.match(/\.markdown-body\s*\{[^}]*?background(?:-image)?:\s*([^;!}]+)/s)
        const paddingMatch = cssContent.match(/\.markdown-body\s*\{[^}]*?padding:\s*([^;!}]+)/s)
        
        if (bgColorMatch || bgImageMatch) {
          // 创建最外层 section 包裹，带上主题背景
          const wrapper = document.createElement('section')
          let wrapperStyle = 'padding: 24px 32px; max-width: 900px; margin: 0 auto; box-sizing: border-box;'
          if (bgColorMatch) wrapperStyle += ` background-color: ${bgColorMatch[1].trim()};`
          if (bgImageMatch && !bgColorMatch) wrapperStyle += ` background: ${bgImageMatch[1].trim()};`
          if (paddingMatch) wrapperStyle = wrapperStyle.replace('padding: 24px 32px;', `padding: ${paddingMatch[1].trim()};`)
          wrapper.setAttribute('style', wrapperStyle)
          wrapper.innerHTML = container.innerHTML
          return wechatStyles + wrapper.outerHTML
        }
      }
    } catch(e) {
      console.warn('[微信导出] 主题背景色提取失败:', e)
    }

    // 返回处理后的 HTML
    return wechatStyles + container.innerHTML
  }

  // 微信格式复制降级方案
  const copyWechatHtmlFallback = (html) => {
    // 创建临时容器
    const container = document.createElement('div')
    container.innerHTML = html
    container.style.position = 'fixed'
    container.style.left = '-9999px'
    document.body.appendChild(container)
    
    try {
      // 选中内容
      const range = document.createRange()
      range.selectNodeContents(container)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      
      // 执行复制
      const success = document.execCommand('copy')
      
      // 清理
      selection.removeAllRanges()
      document.body.removeChild(container)
      
      if (success) {
        setStatus('已复制微信公众号格式到剪贴板')
        setStatusType('success')
        showToast('已复制，可直接粘贴到公众号编辑器', 'success')
        const hasBgImageTheme = (() => {
          const themeEl = document.querySelector('#export-config-styles')
          if (!themeEl) return false
          const css = themeEl.textContent || ''
          return css.includes('background-image') || css.includes('linear-gradient') || css.includes('radial-gradient')
        })()
        if (hasBgImageTheme) {
          setTimeout(() => {
            setStatus('⚠️ 注意：当前主题的网格/渐变背景在微信中不支持，已自动降级为纯色背景')
            setStatusType('error')
            setTimeout(() => { setStatus('就绪'); setStatusType('normal') }, 5000)
          }, 2000)
        } else {
          setTimeout(() => {
            setStatus('就绪')
            setStatusType('normal')
          }, 3000)
        }
      } else {
        setStatus('复制失败，请手动复制预览区内容')
        setStatusType('error')
        showToast('复制失败，请手动复制', 'error')
      }
    } catch (err) {
      console.error('execCommand 失败:', err)
      document.body.removeChild(container)
      setStatus('复制失败，请手动复制预览区内容')
      setStatusType('error')
      showToast('复制失败，请手动复制', 'error')
    }
  }

  // 剪贴板降级方案：使用 textarea + execCommand
  const copyToClipboardFallback = (text) => {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    
    try {
      const success = document.execCommand('copy')
      if (success) {
        setStatus('已复制公众号格式到剪贴板')
        setStatusType('success')
        setTimeout(() => {
          setStatus('就绪')
          setStatusType('normal')
        }, 2000)
      } else {
        setStatus('复制失败，请手动复制')
        setStatusType('error')
      }
    } catch (err) {
      console.error('execCommand 失败:', err)
      setStatus('复制失败，请手动复制')
      setStatusType('error')
    } finally {
      document.body.removeChild(textarea)
    }
  }

  // 生成导出用的完整样式
  const generateExportStyles = useCallback(() => {
    const effectiveThemeColor = exportConfig.themeColor || (editorTheme === 'dark' ? '#58a6ff' : '#0969da')
    const effectiveHeadingColor = exportConfig.headingColor === 'theme' ? effectiveThemeColor : 'inherit'
    const effectiveBorderColor = exportConfig.themeColor ? exportConfig.themeColor : '#d0d7de'
    
    // 代码主题背景色
    const themeBackgrounds = {
      'github': '#f6f8fa',
      'github-dark': '#0d1117',
      'vs': '#ffffff',
      'vs2015': '#1e1e1e',
      'dracula': '#282a36',
      'atom-one-dark': '#282c34',
      'solarized-light': '#fdf6e3',
      'solarized-dark': '#002b36',
      'nord': '#2e3440',
      'monokai': '#272822',
      'material': '#263238'
    }
    
    const currentThemeBg = themeBackgrounds[exportConfig.codeTheme] || themeBackgrounds['github']
    
    // 获取主题样式
    let themeStyles = ''
    switch (exportConfig.theme) {
      case 'custom':
        // 自定义主题 - 替换 CSS 变量为实际的主题色
        let customCSS = exportConfig.customCSS || ''
        customCSS = customCSS
          // 先处理伪类
          .replace(/link:hover\s*\{/g, '.markdown-body a:hover {')
          .replace(/link:active\s*\{/g, '.markdown-body a:active {')
          .replace(/link:visited\s*\{/g, '.markdown-body a:visited {')
          .replace(/link:focus\s*\{/g, '.markdown-body a:focus {')
          // 然后处理普通选择器
          .replace(/container\s*\{/g, '.markdown-body {')
          .replace(/code_pre\s*\{/g, '.markdown-body pre {')
          .replace(/codespan\s*\{/g, '.markdown-body code:not(pre code) {')
          .replace(/image\s*\{/g, '.markdown-body img {')
          .replace(/strong\s*\{/g, '.markdown-body strong, .markdown-body b {')
          .replace(/link\s*\{/g, '.markdown-body a {')
          .replace(/code\s*\{/g, '.markdown-body pre code {')
          .replace(/blockquote\s*\{/g, '.markdown-body blockquote {')
          .replace(/\bh1\s*\{/g, '.markdown-body h1 {')
          .replace(/\bh2\s*\{/g, '.markdown-body h2 {')
          .replace(/\bh3\s*\{/g, '.markdown-body h3 {')
          .replace(/\bh4\s*\{/g, '.markdown-body h4 {')
          .replace(/\bh5\s*\{/g, '.markdown-body h5 {')
          .replace(/\bh6\s*\{/g, '.markdown-body h6 {')
          .replace(/\bhr\s*\{/g, '.markdown-body hr {')
          .replace(/\bol\s*\{/g, '.markdown-body ol {')
          .replace(/\bul\s*\{/g, '.markdown-body ul {')
          .replace(/\bli\s*\{/g, '.markdown-body li {')
          .replace(/\bp\s*\{/g, '.markdown-body p {')
          .replace(/var\(--md-primary-color\)/g, effectiveThemeColor)
          .replace(/var\(--blockquote-background\)/g, editorTheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)')
        themeStyles = sandboxCSS(customCSS)
        break
        
      case 'classic':
        // 经典主题：传统的文档样式
        themeStyles = `
      /* 经典主题 */
      .markdown-body {
        max-width: 800px !important;
        padding: 40px !important;
      }
      
      .markdown-body h1 {
        font-size: 2.5em !important;
        font-weight: 700 !important;
        margin-top: 0 !important;
        margin-bottom: 0.5em !important;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        -webkit-background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        background-clip: text !important;
        border-bottom: none !important;
      }
      
      .markdown-body h2 {
        font-size: 2em !important;
        font-weight: 600 !important;
        margin-top: 1.5em !important;
        margin-bottom: 0.5em !important;
        background: ${editorTheme === 'dark' ? 'rgba(102, 126, 234, 0.1)' : 'rgba(102, 126, 234, 0.08)'} !important;
        padding: 0.5em 1em !important;
        border-radius: 8px !important;
        border-left: 4px solid ${effectiveThemeColor} !important;
        border-bottom: none !important;
      }
      
      .markdown-body h3 {
        font-size: 1.5em !important;
        font-weight: 600 !important;
        margin-top: 1.2em !important;
        margin-bottom: 0.5em !important;
        color: ${effectiveThemeColor} !important;
        border-bottom: 2px dashed ${effectiveBorderColor} !important;
        padding-bottom: 0.3em !important;
      }
      
      .markdown-body p {
        margin-bottom: 1em !important;
        line-height: 1.8 !important;
      }
      
      .markdown-body blockquote {
        border-left: 4px solid ${effectiveBorderColor} !important;
        padding-left: 1em !important;
        margin: 1em 0 !important;
        color: #666 !important;
        font-style: italic !important;
        background: ${editorTheme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)'} !important;
        padding: 1em !important;
        border-radius: 4px !important;
      }
      
      .markdown-body code:not(pre code) {
        background: ${editorTheme === 'dark' ? '#2d333b' : '#f6f8fa'} !important;
        padding: 0.2em 0.4em !important;
        border-radius: 4px !important;
        border: 1px solid ${effectiveBorderColor} !important;
      }
        `
        break
        
      case 'elegant':
        // 优雅主题：更精致的排版
        themeStyles = `
      /* 优雅主题 */
      .markdown-body {
        max-width: 750px !important;
        padding: 60px !important;
      }
      
      .markdown-body h1 {
        font-size: 2.8em !important;
        font-weight: 300 !important;
        letter-spacing: -0.02em !important;
        margin-top: 0 !important;
        margin-bottom: 0.8em !important;
        text-align: center !important;
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%) !important;
        -webkit-background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        background-clip: text !important;
        padding: 0.5em 0 !important;
        border-bottom: 1px solid ${effectiveBorderColor} !important;
      }
      
      .markdown-body h2 {
        font-size: 1.8em !important;
        font-weight: 400 !important;
        letter-spacing: -0.01em !important;
        margin-top: 2em !important;
        margin-bottom: 0.8em !important;
        background: ${editorTheme === 'dark' ? 'rgba(245, 87, 108, 0.1)' : 'rgba(245, 87, 108, 0.08)'} !important;
        padding: 0.6em 1.2em !important;
        border-radius: 12px !important;
        box-shadow: 0 2px 8px ${editorTheme === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'} !important;
        border-bottom: none !important;
      }
      
      .markdown-body h3 {
        font-size: 1.4em !important;
        font-weight: 500 !important;
        margin-top: 1.5em !important;
        margin-bottom: 0.6em !important;
        color: ${effectiveThemeColor} !important;
        padding-left: 1em !important;
        border-left: 3px solid ${effectiveThemeColor} !important;
      }
      
      .markdown-body p {
        margin-bottom: 1.2em !important;
        line-height: 2 !important;
        text-align: justify !important;
      }
      
      .markdown-body p:first-letter {
        font-size: 1.5em !important;
        font-weight: 600 !important;
        color: ${effectiveThemeColor} !important;
      }
      
      .markdown-body blockquote {
        border-left: none !important;
        padding: 1.5em 2em !important;
        margin: 1.5em 0 !important;
        background: linear-gradient(135deg, ${editorTheme === 'dark' ? 'rgba(245, 87, 108, 0.1)' : 'rgba(245, 87, 108, 0.05)'} 0%, ${editorTheme === 'dark' ? 'rgba(240, 147, 251, 0.1)' : 'rgba(240, 147, 251, 0.05)'} 100%) !important;
        border-radius: 12px !important;
        font-style: italic !important;
        position: relative !important;
        box-shadow: 0 2px 12px ${editorTheme === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'} !important;
      }
      
      .markdown-body blockquote::before {
        content: '"' !important;
        font-size: 4em !important;
        position: absolute !important;
        left: 0.2em !important;
        top: -0.1em !important;
        color: ${effectiveThemeColor} !important;
        opacity: 0.3 !important;
      }
      
      .markdown-body code:not(pre code) {
        background: linear-gradient(135deg, ${editorTheme === 'dark' ? 'rgba(245, 87, 108, 0.15)' : 'rgba(245, 87, 108, 0.1)'} 0%, ${editorTheme === 'dark' ? 'rgba(240, 147, 251, 0.15)' : 'rgba(240, 147, 251, 0.1)'} 100%) !important;
        padding: 0.2em 0.6em !important;
        border-radius: 6px !important;
        font-weight: 500 !important;
      }
        `
        break
        
      case 'simple':
        // 简洁主题：极简风格
        themeStyles = `
      /* 简洁主题 */
      .markdown-body {
        max-width: 680px !important;
        padding: 30px !important;
      }
      
      .markdown-body h1 {
        font-size: 2em !important;
        font-weight: 700 !important;
        margin-top: 0 !important;
        margin-bottom: 1em !important;
        border-bottom: none !important;
        padding-bottom: 0 !important;
        background: ${editorTheme === 'dark' ? 'rgba(88, 166, 255, 0.1)' : 'rgba(9, 105, 218, 0.08)'} !important;
        padding: 0.5em 0.8em !important;
        border-radius: 6px !important;
      }
      
      .markdown-body h2 {
        font-size: 1.6em !important;
        font-weight: 600 !important;
        margin-top: 2em !important;
        margin-bottom: 0.8em !important;
        border-bottom: none !important;
        padding-bottom: 0 !important;
        background: linear-gradient(90deg, ${effectiveThemeColor} 0%, ${effectiveThemeColor} 4px, transparent 4px) !important;
        padding-left: 1em !important;
      }
      
      .markdown-body h3 {
        font-size: 1.3em !important;
        font-weight: 600 !important;
        margin-top: 1.5em !important;
        margin-bottom: 0.6em !important;
        color: ${effectiveThemeColor} !important;
      }
      
      .markdown-body p {
        margin-bottom: 1em !important;
        line-height: 1.7 !important;
      }
      
      .markdown-body blockquote {
        border-left: 2px solid ${effectiveBorderColor} !important;
        padding-left: 1em !important;
        margin: 1em 0 !important;
        color: #888 !important;
      }
      
      .markdown-body ul,
      .markdown-body ol {
        padding-left: 1.5em !important;
      }
      
      .markdown-body code:not(pre code) {
        background: ${editorTheme === 'dark' ? '#2d333b' : '#f6f8fa'} !important;
        padding: 0.2em 0.4em !important;
        border-radius: 3px !important;
        font-size: 0.9em !important;
      }
        `
        break
        
      case 'gradient':
        // 网格背景主题
        themeStyles = `
      .markdown-body {
        max-width: 800px !important;
        padding: 40px !important;
        background-color: ${editorTheme === 'dark' ? '#1a1b26' : '#f8f9fa'} !important;
        background-image: 
          linear-gradient(${editorTheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'} 1px, transparent 1px),
          linear-gradient(90deg, ${editorTheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'} 1px, transparent 1px) !important;
        background-size: 20px 20px !important;
        background-position: 0 0 !important;
        border-radius: 16px !important;
        box-shadow: 0 4px 24px ${editorTheme === 'dark' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.1)'} !important;
        position: relative !important;
      }
      
      .markdown-body::before {
        content: '' !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        background: radial-gradient(circle at 20% 30%, ${editorTheme === 'dark' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)'} 0%, transparent 50%),
                    radial-gradient(circle at 80% 70%, ${editorTheme === 'dark' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(236, 72, 153, 0.08)'} 0%, transparent 50%) !important;
        border-radius: 16px !important;
        pointer-events: none !important;
        z-index: 0 !important;
      }
      
      .markdown-body > * {
        position: relative !important;
        z-index: 1 !important;
      }
      
      .markdown-body h1 {
        font-size: 2.5em !important;
        font-weight: 700 !important;
        margin-top: 0 !important;
        margin-bottom: 0.8em !important;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        -webkit-background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        background-clip: text !important;
        border-bottom: none !important;
        padding-bottom: 0 !important;
      }
      
      .markdown-body h2 {
        font-size: 2em !important;
        font-weight: 600 !important;
        margin-top: 2em !important;
        margin-bottom: 0.8em !important;
        background: ${editorTheme === 'dark' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)'} !important;
        padding: 0.5em 1em !important;
        border-radius: 12px !important;
        border-left: 4px solid ${effectiveThemeColor} !important;
        border-bottom: none !important;
      }
      
      .markdown-body h3 {
        font-size: 1.5em !important;
        font-weight: 600 !important;
        margin-top: 1.5em !important;
        margin-bottom: 0.6em !important;
        color: ${effectiveThemeColor} !important;
      }
      
      .markdown-body p {
        margin-bottom: 1.2em !important;
        line-height: 1.8 !important;
      }
      
      .markdown-body blockquote {
        border-left: 4px solid ${effectiveThemeColor} !important;
        padding: 1.5em 2em !important;
        margin: 1.5em 0 !important;
        background: ${editorTheme === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)'} !important;
        border-radius: 12px !important;
        font-style: italic !important;
        box-shadow: 0 2px 12px ${editorTheme === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'} !important;
      }
      
      .markdown-body code:not(pre code) {
        background: ${editorTheme === 'dark' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.15)'} !important;
        padding: 0.2em 0.6em !important;
        border-radius: 6px !important;
        font-weight: 500 !important;
        border: 1px solid ${editorTheme === 'dark' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)'} !important;
      }
      
      .markdown-body pre {
        background: ${editorTheme === 'dark' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.6)'} !important;
        border-radius: 12px !important;
        border: 1px solid ${editorTheme === 'dark' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)'} !important;
        box-shadow: 0 2px 12px ${editorTheme === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'} !important;
      }
        `
        break
        
      case 'morandi':
        // 莫兰迪色系主题
        themeStyles = `
      .markdown-body {
        color: #5c5c5c !important;
        background-color: #f9f7f5 !important;
        padding: 24px 32px !important;
        max-width: 900px !important;
        margin: 0 auto !important;
        border-radius: 12px !important;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.03) !important;
      }
      
      .markdown-body h1 {
        font-size: 32px !important;
        font-weight: 600;
        color: #ffffff !important;
        background: linear-gradient(90deg, #9f86c0, #be95c4) !important;
        border-radius: 10px !important;
        padding: 14px 20px 10px !important;
        margin: 40px 0 20px !important;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        border: none !important;
      }
      
      .markdown-body h2 {
        font-size: 28px !important;
        font-weight: 600;
        color: #ffffff !important;
        background: linear-gradient(90deg, #82c0cc, #9fd8df) !important;
        border-radius: 8px !important;
        padding: 12px 18px 8px !important;
        margin: 36px 0 18px !important;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        border: none !important;
      }
      
      .markdown-body h3 {
        font-size: 24px !important;
        font-weight: 600;
        color: #6a6a6a !important;
        background: rgba(202, 186, 161, 0.2) !important;
        border-radius: 6px !important;
        padding: 10px 16px !important;
        margin: 32px 0 16px !important;
        border-left: 4px solid #cabb9f !important;
      }
      
      .markdown-body h4 {
        font-size: 20px !important;
        font-weight: 600;
        color: #6a6a6a !important;
        background: rgba(168, 218, 220, 0.2) !important;
        border-radius: 6px !important;
        padding: 8px 14px !important;
        margin: 28px 0 14px !important;
        border-left: 4px solid #a8dadc !important;
      }
      
      .markdown-body h5 {
        font-size: 18px !important;
        font-weight: 600;
        color: #6a6a6a !important;
        background: rgba(221, 186, 198, 0.2) !important;
        border-radius: 6px !important;
        padding: 8px 14px !important;
        margin: 24px 0 12px !important;
        border: 1px solid #ddbabc !important;
        border-left: 4px solid #ddbabc !important;
      }
      
      .markdown-body h6 {
        font-size: 16px !important;
        font-weight: 600;
        color: #6a6a6a !important;
        background: rgba(186, 200, 206, 0.2) !important;
        border-radius: 6px !important;
        padding: 6px 12px !important;
        margin: 20px 0 10px !important;
      }
      
      .markdown-body p {
        margin: 16px 0 !important;
        text-align: justify !important;
        color: #5c5c5c !important;
      }
      
      .markdown-body strong,
      .markdown-body b {
        font-weight: 700;
        color: #9f86c0 !important;
      }
      
      .markdown-body a {
        color: #82c0cc !important;
        text-decoration: none;
        border-bottom: 1px solid transparent;
      }
      
      .markdown-body img {
        max-width: 100%;
        height: auto;
        border-radius: 10px !important;
        margin: 20px 0 !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
        border: 2px solid #e8e4e0 !important;
      }
      
      .markdown-body blockquote {
        background: rgba(190, 149, 196, 0.1) !important;
        border-left: 4px solid #be95c4 !important;
        padding: 16px 20px !important;
        margin: 20px 0 !important;
        border-radius: 8px !important;
        color: #6a6a6a !important;
        font-style: normal !important;
      }
      
      .markdown-body hr {
        border: none !important;
        border-top: 1px solid #e8e4e0 !important;
        margin: 32px 0 !important;
      }
      
      .markdown-body ol {
        padding-left: 24px;
        margin: 16px 0 !important;
        color: #82c0cc !important;
      }
      
      .markdown-body ul {
        padding-left: 24px;
        margin: 16px 0 !important;
        list-style-type: circle !important;
        color: #a8dadc !important;
      }
      
      .markdown-body li {
        margin: 8px 0 !important;
        line-height: 1.7 !important;
        color: #5c5c5c !important;
      }
      
      .markdown-body pre {
        background-color: #f0eeec !important;
        border-radius: 8px !important;
        padding: 16px !important;
        margin: 20px 0 !important;
        overflow-x: auto;
        border: 1px solid #e8e4e0 !important;
      }
      
      .markdown-body pre code {
        font-size: 14px !important;
        color: #5c5c5c !important;
        line-height: 1.6 !important;
      }
      
      .markdown-body code:not(pre code) {
        background-color: rgba(190, 149, 196, 0.1) !important;
        color: #9f86c0 !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        font-size: 14px !important;
        border: 1px solid #e8e4e0 !important;
      }

      /* 莫兰迪表格样式 */
      .markdown-body table th,
      .markdown-body table td {
        border: 1px solid #e8e4e0 !important;
        padding: 8px 12px !important;
        color: #5c5c5c !important;
        background-color: transparent !important;
      }

      .markdown-body table th {
        background-color: rgba(159, 134, 192, 0.12) !important;
        color: #6a6a6a !important;
        font-weight: 600 !important;
      }

      .markdown-body table tr:nth-child(even) {
        background-color: rgba(202, 186, 161, 0.08) !important;
      }

      .markdown-body table tr:nth-child(odd) {
        background-color: #f9f7f5 !important;
      }

      /* 莫兰迪 Mermaid 图表样式 */
      .mermaid {
        background: rgba(249, 247, 245, 0.8) !important;
        border: 1px solid #e8e4e0 !important;
        border-radius: 8px !important;
      }
        `
        break
        
      case 'retro-paper':
        // 复古纸张主题
        themeStyles = `
      .markdown-body {
        max-width: 880px !important;
        margin: 30px auto !important;
        padding: 30px 40px !important;
        background: #fef7eb !important;
        line-height: 1.8 !important;
        color: #4b453c !important;
        border-radius: 0 !important;
        border: 1px solid #d9c7b1 !important;
      }

      .markdown-body h1 {
        border: 2px solid #92400e !important;
        outline: 1px solid #92400e !important;
        outline-offset: 2px !important;
        padding: 12px 20px !important;
        text-align: center !important;
        font-size: 22px !important;
        color: #92400e !important;
      }

      .markdown-body h2 {
        border: 1px solid #b45309 !important;
        padding: 8px 16px !important;
        font-size: 19px !important;
        color: #b45309 !important;
      }

      .markdown-body h3 {
        border: 1px dashed #c97313 !important;
        padding: 6px 14px !important;
        font-size: 17px !important;
        color: #c97313 !important;
      }

      .markdown-body blockquote {
        background: #fae9cd !important;
        border-left: 4px solid #b45309 !important;
        padding: 14px !important;
      }

      .markdown-body pre {
        background: #fae9cd !important;
        padding: 16px !important;
        border: 1px solid #d9c7b1 !important;
      }
        `
        break

      default:
        // 默认主题 - 使用 github-markdown-css 的默认样式，只添加必要的覆盖
        themeStyles = `
      .markdown-body {
        max-width: 980px !important;
        padding: 45px !important;
      }
      
      .markdown-body h1 {
        font-size: 2em !important;
        font-weight: 600 !important;
        padding-bottom: 0.3em !important;
        border-bottom: 1px solid ${effectiveBorderColor} !important;
      }
      
      .markdown-body h2 {
        font-size: 1.5em !important;
        font-weight: 600 !important;
        padding-bottom: 0.3em !important;
        border-bottom: 1px solid ${effectiveBorderColor} !important;
      }
      
      .markdown-body h3 {
        font-size: 1.25em !important;
        font-weight: 600 !important;
      }
      
      .markdown-body h4 {
        font-size: 1em !important;
        font-weight: 600 !important;
      }
      
      .markdown-body h5 {
        font-size: 0.875em !important;
        font-weight: 600 !important;
      }
      
      .markdown-body h6 {
        font-size: 0.85em !important;
        font-weight: 600 !important;
      }
        `
    }
    
    // 基础样式
    const baseStyles = `
    body {
      margin: 0;
      padding: 20px;
      background-color: ${editorTheme === 'dark' ? '#0d1117' : '#ffffff'};
      color: ${editorTheme === 'dark' ? '#c9d1d9' : '#24292f'};
    }
    .markdown-body {
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 45px;
      font-family: ${getExportFontStack(exportConfig.fontFamily)};
      font-size: ${exportConfig.fontSize || '16px'};
      line-height: ${exportConfig.lineHeight || 1.8};
      text-align: ${exportConfig.textAlign || 'left'};
    }
    
    ${themeStyles}
    
    /* 主题色覆盖样式 - 只在明确设置了主题色时应用，elementStyles 优先 */
    ${exportConfig.themeColor ? `
    ${['h1','h2','h3','h4','h5','h6'].filter(h => !elHasCustom(h)).length > 0 ? `
    ${['h1','h2','h3','h4','h5','h6'].filter(h => !elHasCustom(h)).map(h => `.markdown-body ${h}`).join(',\n    ')} {
      color: ${exportConfig.headingColor === 'theme' ? effectiveThemeColor : 'inherit'} !important;
    }` : ''}
    
    ${!elHasCustom('h1') && !elCustomHasProp('h1','border') ? `
    .markdown-body h1 { border-bottom-color: ${effectiveThemeColor} !important; }` : ''}
    
    ${!elHasCustom('h2') && !elCustomHasProp('h2','border') ? `
    .markdown-body h2 { border-bottom-color: ${effectiveThemeColor} !important; border-left-color: ${effectiveThemeColor} !important; }` : ''}
    
    ${!elHasCustom('h3') && !elCustomHasProp('h3','border') ? `
    .markdown-body h3 { border-left-color: ${effectiveThemeColor} !important; }` : ''}
    
    .markdown-body a {
      color: ${exportConfig.elementStyles?.link?.color || effectiveThemeColor} !important;
    }
    
    ${!elHasCustom('strong') ? `
    .markdown-body strong, .markdown-body b {
      color: ${effectiveThemeColor} !important;
    }` : ''}
    
    ${!elHasCustom('blockquote') && !elCustomHasProp('blockquote','border') ? `
    .markdown-body blockquote { border-left-color: ${effectiveThemeColor} !important; }` : ''}
    ` : (exportConfig.theme !== 'custom' && exportConfig.theme === 'default') ? `
    /* 只有 default 主题且未设置主题色时，才应用默认样式 */
    ${['h1','h2','h3','h4','h5','h6'].filter(h => !elHasCustom(h)).length > 0 ? `
    ${['h1','h2','h3','h4','h5','h6'].filter(h => !elHasCustom(h)).map(h => `.markdown-body ${h}`).join(',\n    ')} {
      color: ${exportConfig.headingColor === 'theme' ? effectiveHeadingColor : 'inherit'} !important;
    }` : ''}
    
    ${!elHasCustom('h1') && !elCustomHasProp('h1','border') ? `
    .markdown-body h1 { border-bottom-color: ${effectiveBorderColor} !important; }` : ''}
    
    ${!elHasCustom('h2') && !elCustomHasProp('h2','border') ? `
    .markdown-body h2 { border-bottom-color: ${effectiveBorderColor} !important; }` : ''}
    
    .markdown-body a {
      color: ${exportConfig.elementStyles?.link?.color || effectiveThemeColor} !important;
    }
    ` : ''}
    
    .markdown-body p {
      text-indent: ${exportConfig.paragraphIndent ? '2em' : '0'} !important;
      text-align: ${exportConfig.paragraphJustify ? 'justify' : (exportConfig.textAlign || 'left')} !important;
    }

    /* 预览区粗体文本颜色 */
    .markdown-body strong,
    .markdown-body b {
      color: #55C9E9 !important;
    }
    
    .markdown-body pre {
      background: ${currentThemeBg} !important;
      text-align: left !important;
      direction: ltr !important;
      unicode-bidi: normal !important;
    }
    
    .markdown-body pre code {
      text-align: left !important;
      direction: ltr !important;
      display: block !important;
      unicode-bidi: normal !important;
    }
    
    .markdown-body .hljs {
      text-align: left !important;
      direction: ltr !important;
      display: block !important;
      unicode-bidi: normal !important;
    }
    
    .markdown-body pre code span,
    .markdown-body .hljs span {
      direction: ltr !important;
      unicode-bidi: normal !important;
    }
    
    /* 强制所有代码块内容左对齐 */
    .markdown-body pre *,
    .markdown-body pre code *,
    .markdown-body .hljs * {
      text-align: left !important;
      direction: ltr !important;
    }
    
    ${exportConfig.macCodeBlock ? `
    .markdown-body pre {
      position: relative;
      padding-top: 30px !important;
      border-radius: 8px !important;
    }
    
    .markdown-body pre::before {
      content: '';
      position: absolute;
      top: 10px;
      left: 12px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #ff5f56;
      box-shadow: 20px 0 0 #ffbd2e, 40px 0 0 #27c93f;
    }
    ` : ''}
    
    /* 图注样式 */
    .markdown-body figure.image-figure {
      display: block;
      text-align: center;
      margin: 1em 0;
    }
    
    .markdown-body figure.image-figure img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    
    .markdown-body figure.image-figure figcaption {
      margin-top: 0.5em;
      font-size: 0.85em;
      color: #6c757d;
      text-align: center;
      font-style: italic;
      line-height: 1.4;
    }
    
    @media (max-width: 767px) {
      .markdown-body {
        padding: 15px;
      }
    }
    `
    
    return baseStyles
  }, [exportConfig, editorTheme])

  // PNG 快捷导出：直接在当前页面截图并下载
  const exportAsPNG = useCallback(async (fileName) => {
    const el = document.querySelector('.markdown-body')
    if (!el) { showToast('找不到预览区', 'error'); return }
    showToast('正在生成图片...', 'info', 5000)
    // 用右上角 Toast 通知代替状态栏
    const previewPane = el.closest('.preview-pane') || el.parentElement
    const savedScrollTop = previewPane ? previewPane.scrollTop : 0
    const savedScrollLeft = previewPane ? previewPane.scrollLeft : 0
    if (previewPane) { previewPane.scrollTop = 0; previewPane.scrollLeft = 0 }
    const inlineStyleMap = new Map()
    const imgOrigSrcs = new Map()

    // 临时将 app 容器切换为 theme-light，让 CSS 自然渲染亮色模式
    // 这是解决暗黑模式下截图白底浅字问题的根本方案
    const appEl = el.closest('.app') || document.querySelector('.app')
    const wasThemeDark = appEl && appEl.classList.contains('theme-dark')

    // 判断当前主题是否配置了背景色
    // 有背景色的主题：切换到 theme-light（让背景色正确渲染）
    // 无背景色的主题：在暗黑模式下保持 theme-dark（保留暗色风格）
    const themesWithBg = ['gradient', 'morandi']
    const builtinHasBg = themesWithBg.includes(exportConfig.theme)
    const customHasBg = exportConfig.theme === 'custom' &&
      /background(?:-color)?\s*:/.test(exportConfig.customCSS || '')
    const themeHasBg = builtinHasBg || customHasBg

    if (wasThemeDark && themeHasBg) {
      appEl.classList.remove('theme-dark')
      appEl.classList.add('theme-light')
    }

    // 少量必要的内联样式覆盖（处理不受 theme class 控制的样式）
    const styleRules = [
      { el, styles: { padding: '40px 48px' } },
      ...Array.from(el.querySelectorAll('.sr-only, [class*="sr-only"]')).map(node => ({ el: node, styles: { position: 'static', width: 'auto', height: 'auto', overflow: 'visible', clip: 'auto', whiteSpace: 'normal', fontSize: '1.2em', fontWeight: '600', marginBottom: '0.5em' } })),
    ]
    styleRules.forEach(({ el: node, styles }) => {
      const saved = {}
      Object.keys(styles).forEach(prop => { saved[prop] = node.style[prop]; node.style[prop] = styles[prop] })
      inlineStyleMap.set(node, saved)
    })
    const macDots = []
    if (exportConfig && exportConfig.macCodeBlock) {
      Array.from(el.querySelectorAll('pre')).forEach(pre => {
        const wrap = document.createElement('span')
        wrap.style.cssText = 'position:absolute;top:10px;left:12px;display:flex;gap:8px;pointer-events:none;z-index:10;'
        ;['#ff5f56', '#ffbd2e', '#27c93f'].forEach(color => {
          const dot = document.createElement('span')
          dot.style.cssText = `display:inline-block;width:12px;height:12px;border-radius:50%;background:${color};`
          wrap.appendChild(dot)
        })
        pre.appendChild(wrap)
        macDots.push(wrap)
      })
    }
    try {
      await new Promise(resolve => setTimeout(resolve, 50))
      const imgEls = Array.from(el.querySelectorAll('img'))
      await Promise.all(imgEls.map(async (img) => {
        const src = img.getAttribute('src')
        if (!src || src.startsWith('data:')) return
        // 同源相对路径直接 fetch（无 CORS 问题），局域网绝对地址走代理
        const isRelative = src.startsWith('/')
        const isSameOrigin = src.startsWith(window.location.origin)
        const isLocalAbsolute = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(src)
        try {
          let fetchUrl
          if (isRelative || isSameOrigin) {
            fetchUrl = src
          } else if (isLocalAbsolute) {
            fetchUrl = `/api/proxy-image?url=${encodeURIComponent(src)}`
          } else {
            fetchUrl = `/api/proxy-image?url=${encodeURIComponent(src)}`
          }
          const resp = await fetch(fetchUrl)
          if (resp.ok) {
            const blob = await resp.blob()
            const base64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob) })
            imgOrigSrcs.set(img, src); img.src = base64
          }
        } catch (e) { console.warn('[PNG导出] 图片获取失败:', src, e) }
      }))
      // 渲染中
      const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2, useCORS: true, allowTaint: false, logging: false, imageTimeout: 15000, removeContainer: true, foreignObjectRendering: false })
      // 保存中
      canvas.toBlob((blob) => {
        if (!blob) { showToast('生成图片失败', 'error'); return }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `${fileName}.png`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
        showToast('PNG 导出成功', 'success')
      }, 'image/png')
    } catch (err) {
      showToast('PNG 导出失败: ' + err.message, 'error')
      console.error('[PNG导出] 错误:', err)
    } finally {
      inlineStyleMap.forEach((saved, node) => { Object.keys(saved).forEach(prop => { node.style[prop] = saved[prop] }) })
      // 恢复暗黑模式 theme class
      if (wasThemeDark && themeHasBg && appEl) {
        appEl.classList.remove('theme-light')
        appEl.classList.add('theme-dark')
      }
      imgOrigSrcs.forEach((src, img) => { img.src = src })
      macDots.forEach(dot => dot.parentNode && dot.parentNode.removeChild(dot))
      if (previewPane) { previewPane.scrollTop = savedScrollTop; previewPane.scrollLeft = savedScrollLeft }
    }
  }, [exportConfig])

  const inlineImagesInHtml = useCallback(async (html) => {
    const container = document.createElement('div')
    container.innerHTML = html

    const images = Array.from(container.querySelectorAll('img'))

    await Promise.all(
      images.map(async (img) => {
        const src = img.getAttribute('src')
        if (!src || src.startsWith('data:')) return

        const isRelative = src.startsWith('/')
        const isSameOrigin = src.startsWith(window.location.origin)
        const isLocalAbsolute = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(src)

        if (!isRelative && !isSameOrigin && !isLocalAbsolute) return

        try {
          let fetchUrl
          if (isRelative || isSameOrigin) {
            fetchUrl = src
          } else {
            fetchUrl = `/api/proxy-image?url=${encodeURIComponent(src)}`
          }

          const resp = await fetch(fetchUrl)
          if (!resp.ok) return

          const blob = await resp.blob()
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.readAsDataURL(blob)
          })

          img.setAttribute('src', base64)
        } catch (e) {
          console.warn('[HTML导出] 图片转 base64 失败:', src, e)
        }
      })
    )

    return container.innerHTML
  }, [])

  const renderPlantUMLInHtmlForExport = useCallback(async (html) => {
    const container = document.createElement('div')
    container.innerHTML = html

    const plantumlNodes = Array.from(container.querySelectorAll('.plantuml[data-code]'))
    const plantumlThemeKey = editorTheme === 'dark' ? 'dark' : 'light'
    const plantumlContrastThresholdRaw = Number(exportConfig?.infographicContrastThreshold)
    const plantumlContrastThreshold = Number.isFinite(plantumlContrastThresholdRaw)
      ? Math.min(0.9, Math.max(0.1, plantumlContrastThresholdRaw))
      : 0.5
    const plantumlFallbackBg = exportConfig.theme === 'morandi'
      ? '#f9f7f5'
      : (editorTheme === 'dark' ? '#0d1117' : '#ffffff')
    const plantumlBackgroundColor = exportConfig.bgColor || plantumlFallbackBg
    const plantumlBgKey = String(plantumlBackgroundColor || '').trim() || 'auto'

    await Promise.all(plantumlNodes.map(async (node) => {
      const encodedCode = node.getAttribute('data-code')
      const code = encodedCode ? decodeURIComponent(encodedCode) : (node.textContent || '')
      if (!code) return

      const cacheKey = `v2::${plantumlThemeKey}::${plantumlBgKey}::${plantumlContrastThreshold}::${code}`
      const cachedSvg = renderedPlantUMLCacheRef.current.get(cacheKey)
      if (cachedSvg) {
        node.innerHTML = cachedSvg
        node.classList.add('is-rendered')
        node.setAttribute('data-rendered-code', code)
        return
      }

      try {
        const svg = await renderPlantUMLSvg(code, plantumlThemeKey, plantumlBackgroundColor, plantumlContrastThreshold)
        node.innerHTML = svg
        node.classList.add('is-rendered')
        node.setAttribute('data-rendered-code', code)
        renderedPlantUMLCacheRef.current.set(cacheKey, svg)
      } catch (err) {
        console.warn('[导出] PlantUML 渲染失败，保留原节点:', err)
      }
    }))

    return container.innerHTML
  }, [editorTheme, exportConfig])

  const ensurePlantUMLRenderedInPreview = useCallback(async () => {
    if (!previewRef.current) return
    const nodes = Array.from(previewRef.current.querySelectorAll('.plantuml'))
    if (!nodes.length) return

    const plantumlThemeKey = editorTheme === 'dark' ? 'dark' : 'light'
    const plantumlContrastThresholdRaw = Number(exportConfig?.infographicContrastThreshold)
    const plantumlContrastThreshold = Number.isFinite(plantumlContrastThresholdRaw)
      ? Math.min(0.9, Math.max(0.1, plantumlContrastThresholdRaw))
      : 0.5
    const plantumlFallbackBg = exportConfig.theme === 'morandi'
      ? '#f9f7f5'
      : (editorTheme === 'dark' ? '#0d1117' : '#ffffff')
    const plantumlBackgroundColor = exportConfig.bgColor || plantumlFallbackBg
    const plantumlBgKey = String(plantumlBackgroundColor || '').trim() || 'auto'

    await Promise.all(nodes.map(async (node) => {
      if (node.classList.contains('is-rendered')) return
      const encodedCode = node.getAttribute('data-code')
      const code = encodedCode ? decodeURIComponent(encodedCode) : (node.textContent || '')
      if (!code) return

      const cacheKey = `v2::${plantumlThemeKey}::${plantumlBgKey}::${plantumlContrastThreshold}::${code}`
      const cachedSvg = renderedPlantUMLCacheRef.current.get(cacheKey)
      if (cachedSvg) {
        node.innerHTML = cachedSvg
        node.classList.add('is-rendered')
        node.setAttribute('data-rendered-code', code)
        return
      }

      try {
        const svg = await renderPlantUMLSvg(code, plantumlThemeKey, plantumlBackgroundColor, plantumlContrastThreshold)
        node.innerHTML = svg
        node.classList.add('is-rendered')
        node.setAttribute('data-rendered-code', code)
        renderedPlantUMLCacheRef.current.set(cacheKey, svg)
      } catch (err) {
        console.warn('[预览/导出] PlantUML 渲染失败，保留原节点:', err)
      }
    }))
  }, [editorTheme, exportConfig])

  const handleExport = useCallback(async (format) => {
    await ensurePlantUMLRenderedInPreview()
    if (isOfficeReadOnly) {
      showToast('Office 只读预览：导出已禁用', 'warning', 3000)
      return
    }
    if (!format) {
      // 如果没有指定格式，打开导出对话框让用户选择
      setShowExportDialog(true)
      return
    }

    // 微信公众号格式：先显示主题选择对话框
    if (format === 'wechat') {
      // 打开导出配置面板
      openExportConfigPanel()
      return
    }

    // 直接导出指定格式
    const getFileName = () => {
      if (currentPath) {
        const pathParts = currentPath.split('/')
        const fileName = pathParts[pathParts.length - 1]
        return fileName.replace(/\.md$/, '')
      }
      return 'document'
    }

    const fileName = getFileName()

    try {
      switch (format) {
        case 'html':
        case 'html-plain': {
          // HTML 导出 — 与对话框 exportAsHTML 使用完全相同的逻辑
          const includeCSS = format !== 'html-plain'
          const exportConfigStyleEl = includeCSS ? document.getElementById('export-config-styles') : null
          const exportStyles = exportConfigStyleEl ? exportConfigStyleEl.textContent : ''
          const codeThemeEl = document.getElementById('code-theme-style')
          const codeThemeUrl = codeThemeEl ? codeThemeEl.href : ''

          const rawHtml = previewRef.current?.innerHTML || ''
          if (!rawHtml || rawHtml.trim() === '') {
            showToast('导出失败：预览内容为空，请先渲染文档', 'error')
            break
          }

          const htmlWithPlantUML = await renderPlantUMLInHtmlForExport(rawHtml)
          const inlinedHtml = await inlineImagesInHtml(htmlWithPlantUML)

          const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName}</title>
  ${includeCSS ? `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-${editorTheme === 'dark' ? 'dark' : 'light'}.min.css">
  ${codeThemeUrl ? `<link rel="stylesheet" href="${codeThemeUrl}">` : ''}
  <script>
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']],
        processEscapes: true,
        processEnvironments: true
      }
    };
  </script>
  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background-color: #ffffff;
    }
    .markdown-body {
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 45px;
    }
    @media (max-width: 767px) {
      .markdown-body {
        padding: 15px;
      }
    }
    /* 导出配置的主题样式 */
    ${exportStyles}
    /* 强制注脚返回箭头 ↩ 显示为文本而非 emoji */
    .markdown-body .data-footnote-backref { font-family: monospace; font-variant-emoji: text; }
    .markdown-body .footnotes .data-footnote-backref g-emoji { font-family: monospace; font-variant-emoji: text; }
  </style>` : `<!-- 无样式导出：仅引入 KaTeX CSS 保证数学公式正确显示 -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">`}
</head>
<body>
  <div class="markdown-body">
    ${inlinedHtml}
  </div>
</body>
</html>`

          const htmlBlob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
          const htmlUrl = URL.createObjectURL(htmlBlob)
          const htmlLink = document.createElement('a')
          htmlLink.href = htmlUrl
          htmlLink.download = `${fileName}.html`
          document.body.appendChild(htmlLink)
          htmlLink.click()
          document.body.removeChild(htmlLink)
          URL.revokeObjectURL(htmlUrl)
          setStatus('已导出为 HTML')
          break
        }

        case 'md':
          // Markdown 导出
          const mdBlob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
          const mdUrl = URL.createObjectURL(mdBlob)
          const mdLink = document.createElement('a')
          mdLink.href = mdUrl
          mdLink.download = `${fileName}.md`
          document.body.appendChild(mdLink)
          mdLink.click()
          document.body.removeChild(mdLink)
          URL.revokeObjectURL(mdUrl)
          setStatus('已导出为 Markdown')
          break

        case 'wechat':
          // 公众号格式 - 复制带样式的 HTML 到剪贴板
          // 获取预览区的 HTML 内容
          const previewHtml = previewRef.current?.innerHTML || ''
          
          // 调试：检查预览区 HTML 中的图片样式
          console.log('[导出] 预览区 HTML 片段:', previewHtml.substring(0, 500))
          const imgMatches = previewHtml.match(/<img[^>]*>/g)
          if (imgMatches) {
            console.log('[导出] 找到图片标签数量:', imgMatches.length)
            imgMatches.forEach((img, index) => {
              console.log(`[导出] 图片 ${index + 1}:`, img)
            })
          }
          
          // 导出前确保 PlantUML 在预览与导出 HTML 中一致渲染
          const previewWithPlantUML = await renderPlantUMLInHtmlForExport(previewHtml)

          // 转换为微信公众号专属格式
          const wechatHtml = await convertToWechatFormat(previewWithPlantUML)
          
          // 优先使用 Clipboard API（支持富文本）
          if (navigator.clipboard && navigator.clipboard.write) {
            try {
              // 创建包含 HTML 和纯文本的 ClipboardItem
              const htmlBlob = new Blob([wechatHtml], { type: 'text/html' })
              const textBlob = new Blob([content], { type: 'text/plain' })
              const clipboardItem = new ClipboardItem({
                'text/html': htmlBlob,
                'text/plain': textBlob
              })
              
              navigator.clipboard.write([clipboardItem]).then(() => {
                setStatus('已复制微信公众号格式到剪贴板')
                setStatusType('success')
                showToast('已复制，可直接粘贴到公众号编辑器', 'success')
                // 检测当前主题是否含有微信不支持的背景效果
                const hasBgImageTheme = (() => {
                  const themeEl = document.querySelector('#export-config-styles')
                  if (!themeEl) return false
                  const css = themeEl.textContent || ''
                  return css.includes('background-image') || css.includes('linear-gradient') || css.includes('radial-gradient') || css.includes('repeating-linear-gradient')
                })()
                if (hasBgImageTheme) {
                  setTimeout(() => {
                    setStatus('⚠️ 注意：当前主题的网格/渐变背景在微信中不支持，已自动降级为纯色背景')
                    setStatusType('error')
                    setTimeout(() => {
                      setStatus('就绪')
                      setStatusType('normal')
                    }, 5000)
                  }, 2000)
                } else {
                  setTimeout(() => {
                    setStatus('就绪')
                    setStatusType('normal')
                  }, 3000)
                }
              }).catch((error) => {
                console.error('Clipboard.write 失败:', error)
                console.error('错误详情:', error.message, error.stack)
                // 降级方案：使用 writeText
                copyWechatHtmlFallback(wechatHtml)
              })
            } catch (error) {
              console.error('创建 ClipboardItem 失败:', error)
              copyWechatHtmlFallback(wechatHtml)
            }
          } else {
            // 降级方案
            copyWechatHtmlFallback(wechatHtml)
          }
          break

        case 'pdf': {
          const pdfCfgEl = document.getElementById('export-config-styles')
          const pdfStyles = pdfCfgEl ? pdfCfgEl.textContent : ''
          const pdfCodeEl = document.getElementById('code-theme-style')
          const pdfCodeHref = pdfCodeEl ? pdfCodeEl.href : ''
          const pdfHtml = previewRef.current?.innerHTML || ''
          if (!pdfHtml.trim()) { setStatus('导出失败：预览内容为空'); break }
          const pdfWin = window.open('', '_blank')
          if (!pdfWin || !pdfWin.document || typeof pdfWin.document.write !== 'function') {
            setStatus('无法打开打印窗口（移动端可能拦截了 window.open）')
            try { pdfWin?.close?.() } catch (e) {}
            break
          }
          pdfWin.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + fileName + '</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-light.min.css"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">' + (pdfCodeHref ? '<link rel="stylesheet" href="' + pdfCodeHref + '">' : '') + '<style>@media print{*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}}body{margin:0;padding:20px;background:#fff;}.markdown-body{box-sizing:border-box;max-width:980px;margin:0 auto;padding:45px;}' + pdfStyles + '</style></head><body><div class="markdown-body">' + pdfHtml + '</div><script>window.onload=function(){var l=Array.from(document.querySelectorAll("link[rel=stylesheet]"));var n=0;function d(){n++;if(n>=l.length)setTimeout(function(){window.print();setTimeout(function(){window.close();},100);},300);}if(!l.length){window.print();setTimeout(function(){window.close();},100);}else l.forEach(function(x){if(x.sheet)d();else{x.addEventListener("load",d);x.addEventListener("error",d);}});};<\/script></body></html>')
          pdfWin.document.close()
          setStatus('PDF 导出窗口已打开，请选择另存为 PDF')
          break
        }

        case 'png':
          exportAsPNG(fileName)
          break

        default:
          setShowExportDialog(true)
      }
    } catch (error) {
      setStatus('导出失败: ' + error.message)
      setStatusType('error')
      console.error('Export error:', error)
    }
  }, [content, currentPath, generateExportStyles, exportConfig, editorTheme, previewRef, openExportConfigPanel, ensurePlantUMLRenderedInPreview, renderPlantUMLInHtmlForExport, inlineImagesInHtml])

  const handleSettings = useCallback(() => {
    updateShowSettingsDialog(true)
  }, [updateShowSettingsDialog])

  const handleRequestFontDownload = useCallback((family) => {
    const normalized = (family || '').trim()
    if (!normalized || !isRemoteFontFamily(normalized)) return

    const mark = (status, message, progress = null) => {
      setFontDownloadState((prev) => ({
        ...prev,
        [normalized]: {
          ...(prev[normalized] || {}),
          status,
          message,
          progress: typeof progress === 'number' ? progress : (prev[normalized]?.progress || 0),
          updatedAt: Date.now(),
        },
      }))
    }

    ;(async () => {
      try {
        mark('loading', `正在下载 ${normalized}...`, 10)

        const res = await fetch('/api/font-cache/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ family: normalized }),
        })
        const data = await safeParseJsonResponse(res, { ok: false })

        if (!res.ok || !data?.ok || !data?.entry) {
          mark('error', '字体下载失败，已回退系统字体', 0)
          return
        }

        const entry = data.entry
        injectLocalFontCacheEntry(normalized, entry)
        setLocalFontCacheMap((prev) => ({ ...prev, [normalized]: entry }))

        // 兼容旧逻辑：当前选中字体仍可通过请求计数触发 effect
        setFontDownloadRequests((prev) => ({
          ...prev,
          [normalized]: (prev[normalized] || 0) + 1,
        }))

        mark('loaded', '字体下载完成（本地缓存）', 100)
      } catch (error) {
        mark('error', '字体下载失败，已回退系统字体', 0)
      }
    })()
  }, [])

  const handleRequestFontClearAndRetry = useCallback((family) => {
    const normalized = (family || '').trim()
    if (!normalized || !isRemoteFontFamily(normalized)) return

    const mark = (status, message, progress = null) => {
      setFontDownloadState((prev) => ({
        ...prev,
        [normalized]: {
          ...(prev[normalized] || {}),
          status,
          message,
          progress: typeof progress === 'number' ? progress : (prev[normalized]?.progress || 0),
          updatedAt: Date.now(),
        },
      }))
    }

    ;(async () => {
      try {
        mark('loading', `正在清理 ${normalized} 缓存...`, 5)
        const res = await fetch('/api/font-cache/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ family: normalized }),
        })
        const data = await safeParseJsonResponse(res, { ok: false })
        if (!res.ok || !data?.ok) {
          mark('error', '清理缓存失败，请稍后重试', 0)
          return
        }

        setLocalFontCacheMap((prev) => {
          const next = { ...prev }
          delete next[normalized]
          return next
        })
        mark('idle', '缓存已清理，准备重新下载', 0)
        handleRequestFontDownload(normalized)
      } catch (_) {
        mark('error', '清理缓存失败，请稍后重试', 0)
      }
    })()
  }, [handleRequestFontDownload])

  // 应用图注格式到 HTML（新版本：生成固定结构，通过 CSS 控制显示）
  const applyImageCaptionFormat = (html) => {
    // 匹配 <img> 标签，提取 src, alt, title, style 属性
    const imgRegex = /<img([^>]*?)>/g
    
    return html.replace(imgRegex, (match, attrs) => {
      // 提取属性
      const srcMatch = attrs.match(/src="([^"]*)"/)
      const altMatch = attrs.match(/alt="([^"]*)"/)
      const titleMatch = attrs.match(/title="([^"]*)"/)
      const styleMatch = attrs.match(/style="([^"]*)"/)
      
      const src = srcMatch ? srcMatch[1] : ''
      const alt = altMatch ? altMatch[1] : ''
      const title = titleMatch ? titleMatch[1] : ''
      const style = styleMatch ? styleMatch[1] : ''
      
      // 生成固定的 figure 结构，通过 data 属性传递信息
      // CSS 会根据 #output 的 data-caption-format 属性来控制显示
      return `<figure class="image-figure" data-alt="${alt}" data-title="${title}">
        <img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ''}${style ? ` style="${style}"` : ''}>
        <figcaption class="image-caption"></figcaption>
      </figure>`
    })
  }

  // 外链转脚注功能（新版本：生成固定结构，通过 CSS 控制显示）
  const convertLinksToFootnotes = (html) => {
    const footnotes = []
    let footnoteIndex = 1

    // 匹配所有外部链接，添加 class 和 data 属性
    const processedHtml = html.replace(/<a\s+href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/g, (match, url, text) => {
      // 添加到脚注列表
      footnotes.push({ index: footnoteIndex, url, text })
      const result = `<a href="${url}" class="external-link" data-footnote-index="${footnoteIndex}" target="_blank" rel="noopener noreferrer">${text}</a>`
      footnoteIndex++
      return result
    })

    // 始终添加脚注区域（通过 CSS 控制显示/隐藏）
    const footnotesHtml = footnotes.length > 0 ? `
      <div class="footnotes-section">
        <hr>
        <h3>参考资料:</h3>
        <ol class="footnotes-list">
          ${footnotes.map(fn => `<li id="fn-${fn.index}">${fn.text}: <a href="${fn.url}" target="_blank" rel="noopener noreferrer">${fn.url}</a></li>`).join('\n')}
        </ol>
      </div>
    ` : ''

    return processedHtml + footnotesHtml
  }

  // 根据 captionFormat 更新预览区内所有 figure 的图注内容（供 renderMarkdown 和 useEffect 共用）
  const updateFigureCaptionsInPreview = useCallback((previewEl, captionFormat) => {
    if (!previewEl) return
    const format = captionFormat || 'title-first'
    const figures = previewEl.querySelectorAll('figure.image-figure')
    figures.forEach((figure) => {
      const alt = figure.getAttribute('data-alt') || ''
      const title = figure.getAttribute('data-title') || ''
      const figcaption = figure.querySelector('figcaption')
      if (!figcaption) return
      let caption = ''
      switch (format) {
        case 'title-first': caption = title || alt; break
        case 'alt-first': caption = alt || title; break
        case 'title-only': caption = title; break
        case 'alt-only': caption = alt; break
        case 'no-caption': caption = ''; break
        default: caption = title || alt
      }
      figcaption.textContent = caption
      figcaption.style.display = caption ? 'block' : 'none'
    })
  }, [])

  // DOM diff 更新函数：智能更新预览区，避免不必要的 DOM 重建
  const updatePreviewDOM = useCallback((container, newHTML, mermaidCache, onUpdated) => {
    // 保存滚动位置
    const scrollTop = container.scrollTop
    
    // 保存当前所有 Mermaid 节点的状态
    const existingMermaidNodes = new Map()
    container.querySelectorAll('.mermaid[data-rendered-code]').forEach(node => {
      const code = node.getAttribute('data-rendered-code')
      const id = node.id
      if (code && id) {
        existingMermaidNodes.set(id, {
          code,
          element: node.cloneNode(true)
        })
      }
    })
    
    // 更新 HTML（使用 requestAnimationFrame 减少抖动）
    requestAnimationFrame(() => {
      container.innerHTML = newHTML
      
      // 恢复未变化的 Mermaid 节点
      container.querySelectorAll('.mermaid').forEach(node => {
        const encodedCode = node.getAttribute('data-code')
        const code = encodedCode ? decodeURIComponent(encodedCode) : node.textContent
        const id = node.id
        
        // 检查是否有缓存的节点
        if (existingMermaidNodes.has(id)) {
          const cached = existingMermaidNodes.get(id)
          // 如果代码未变化，使用缓存的节点
          if (cached.code === code) {
            node.innerHTML = cached.element.innerHTML
            node.setAttribute('data-rendered-code', code)
            console.log(`恢复缓存的 Mermaid 节点: ${id}`)
          }
        }
      })
      
      // 恢复滚动位置
      if (scrollTop > 0) {
        requestAnimationFrame(() => {
          container.scrollTop = scrollTop
        })
      }
      
      // DOM 更新完成后执行回调（用于图注更新，解决首次打开时图注不显示的时序问题）
      onUpdated?.()
    })
  }, [])
  
  // 后处理 HTML：应用固定结构（不依赖配置）
  const postProcessHtml = useCallback((html) => {
    let processedHtml = html
    
    // 应用图注格式（生成固定结构）
    processedHtml = applyImageCaptionFormat(processedHtml)
    
    // 应用外链转脚注（生成固定结构）
    processedHtml = convertLinksToFootnotes(processedHtml)
    
    return processedHtml
  }, [])

  const renderMarkdown = useCallback(async (contentToRender) => {
    if (!previewRef.current) return

    const startTime = performance.now() // 性能监控

    try {
      // Start loading Mermaid in parallel with markdown processing (content-driven, immediate).
      const mermaidPreload = hasMermaid(contentToRender) ? loadMermaid().catch(() => null) : null

      // 保存滚动位置和 Mermaid 缓存
      const scrollTop = previewRef.current.scrollTop
      const renderedMermaidCache = new Map()
      
      if (previewRef.current) {
        const existingMermaidNodes = previewRef.current.querySelectorAll('.mermaid[data-rendered-code]')
        existingMermaidNodes.forEach(node => {
          const code = node.getAttribute('data-rendered-code')
          const svg = node.querySelector('svg')
          if (code && svg) {
            renderedMermaidCache.set(code, svg.outerHTML)
          }
        })
      }
      
      // 大文件优化：检测文件大小
      const contentSize = new Blob([contentToRender]).size
      const isLargeFile = contentSize > 1024 * 1024 // 1MB
      
      if (isLargeFile) {
        console.log(`大文件检测: ${(contentSize / 1024 / 1024).toFixed(2)}MB，使用优化渲染`)
        // 对于大文件，显示加载提示
        previewRef.current.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">正在渲染大文件，请稍候...</div>'
        // 使用 setTimeout 让 UI 有时间更新
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      // 预处理：将 ==高亮== 转换为 <mark>高亮</mark>
      let processedContent = contentToRender.replace(/==([^=\n]+)==/g, '<mark>$1</mark>')
      
      // 使用缓存的 unified 处理器渲染 Markdown
      const file = await markdownProcessor.process(processedContent)
      let html = String(file)

      // 提取 Mermaid / PlantUML / Infographic 代码块统计信息
      const mermaidRegex = /(^|\n)\s*```+\s*mermaid\s*\r?\n([\s\S]*?)\r?\n\s*```+/g
      const plantumlRegex = /(^|\n)\s*```+\s*(plantuml|puml)\s*\r?\n([\s\S]*?)\r?\n\s*```+/gi
      const infographicRegex = /(^|\n)\s*```+\s*infographic\s*\r?\n([\s\S]*?)\r?\n\s*```+/gi
      let match
      let mermaidIndex = 0
      let plantumlIndex = 0
      let infographicIndex = 0
      const mermaidBlocks = []
      const plantumlBlocks = []
      const infographicBlocks = []

      while ((match = mermaidRegex.exec(contentToRender)) !== null) {
        const code = match[2]
        const id = `mermaid-${mermaidIndex++}`
        mermaidBlocks.push({ id, code })
      }

      while ((match = plantumlRegex.exec(contentToRender)) !== null) {
        const code = match[3]
        const id = `plantuml-${plantumlIndex++}`
        plantumlBlocks.push({ id, code })
      }

      while ((match = infographicRegex.exec(contentToRender)) !== null) {
        const code = match[2]
        const id = `infographic-${infographicIndex++}`
        infographicBlocks.push({ id, code })
      }

      // 一次性替换 Mermaid 代码块
      let mermaidBlockIndex = 0
      html = html.replace(
        /<pre><code class="hljs language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
        (fullMatch, htmlCode) => {
          const id = `mermaid-${mermaidBlockIndex}`
          mermaidBlockIndex++
          const textarea = document.createElement('textarea')
          textarea.innerHTML = htmlCode
          const decodedCode = textarea.value
          return `<div class="mermaid" id="${id}" data-code="${encodeURIComponent(decodedCode)}">${decodedCode}</div>`
        }
      )

      // 一次性替换 PlantUML 代码块（支持 plantuml / puml）
      // 兼容 class 不在首属性、存在其他属性、属性换行等情况
      let plantumlBlockIndex = 0
      html = html.replace(
        /<pre>\s*<code[^>]*class="([^"]*\blanguage-(?:plantuml|puml)\b[^"]*)"[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi,
        (fullMatch, className, htmlCode) => {
          const id = `plantuml-${plantumlBlockIndex}`
          plantumlBlockIndex++
          const textarea = document.createElement('textarea')
          textarea.innerHTML = htmlCode
          const decodedCode = textarea.value
          return `<div class="plantuml" id="${id}" data-code="${encodeURIComponent(decodedCode)}">${decodedCode}</div>`
        }
      )

      // 一次性替换 Infographic 代码块
      let infographicBlockIndex = 0
      html = html.replace(
        /<pre>\s*<code[^>]*class="([^"]*\blanguage-infographic\b[^"]*)"[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi,
        (fullMatch, className, htmlCode) => {
          const id = `infographic-${infographicBlockIndex}`
          infographicBlockIndex++
          const textarea = document.createElement('textarea')
          textarea.innerHTML = htmlCode
          const decodedCode = textarea.value
          return `<div class="infographic" id="${id}" data-code="${encodeURIComponent(decodedCode)}">${decodedCode}</div>`
        }
      )

      // 保存原始 HTML（未经后处理）
      lastRenderedHtmlRef.current = html

      // 应用后处理（图注格式、外链转脚注等）
      html = postProcessHtml(html)

      // 使用 DOM diff 更新，而不是直接替换 innerHTML
      // 在 DOM 更新完成后立即更新图注，避免首次打开时因 useEffect 时序导致图注不显示
      updatePreviewDOM(previewRef.current, html, renderedMermaidCache, () => {
        updateFigureCaptionsInPreview(previewRef.current, exportConfig.captionFormat)
      })

      // 恢复图片的 style 属性（因为 rehypeRaw 会过滤掉）
      // 从原始内容中提取图片的 style 属性
      const imageStylesArray = []  // 使用数组而不是 Map，因为可能有相同 src 的图片
      
      // 提取所有图片标签
      const imgRegex = /<img[^>]*>/gi
      let imgMatch
      
      while ((imgMatch = imgRegex.exec(processedContent)) !== null) {
        const imgTag = imgMatch[0]
        
        // 提取 src
        const srcMatch = imgTag.match(/src=["']([^"']+)["']/)
        // 提取 style
        const styleMatch = imgTag.match(/style=["']([^"']+)["']/)
        
        if (srcMatch) {
          const src = srcMatch[1]
          const style = styleMatch ? styleMatch[1] : null
          imageStylesArray.push({ src, style })
          if (style) {
            console.log(`提取图片 ${imageStylesArray.length} 样式:`, { src: src.substring(0, 50), style })
          }
        }
      }
      
      // 应用 style 到渲染后的图片（按顺序匹配）
      if (imageStylesArray.length > 0) {
        console.log('恢复图片样式，总数:', imageStylesArray.length)
        const images = previewRef.current.querySelectorAll('img')
        
        // 按顺序匹配图片
        images.forEach((img, index) => {
          if (index < imageStylesArray.length) {
            const { src, style } = imageStylesArray[index]
            if (style) {
              img.setAttribute('style', style)
              console.log(`恢复样式到图片 ${index + 1}:`, { src: src.substring(0, 50), style })
            }
          }
        })
      } else {
        console.log('没有找到需要恢复的图片样式')
      }

      // 只有在有 Mermaid 图表时才加载 Mermaid
      if (mermaidBlocks.length > 0) {
        try {
          if (!mermaidLoaded) {
            setStatus('正在加载 Mermaid...')
          }
          const mermaid = await (mermaidPreload || loadMermaid())
          setMermaidLoaded(true)
          
          // 等待 DOM 更新完成
          await new Promise(resolve => setTimeout(resolve, 100))
          
          const mermaidNodes = previewRef.current.querySelectorAll('.mermaid')
          
          // 逐个检查并渲染 Mermaid 图表（只渲染变化的）
          for (let i = 0; i < mermaidNodes.length; i++) {
            const node = mermaidNodes[i]
            const encodedCode = node.getAttribute('data-code')
            const code = encodedCode ? decodeURIComponent(encodedCode) : node.textContent
            const id = node.id || `mermaid-${i}`
            
            // 检查缓存中是否有已渲染的版本
            if (renderedMermaidCache.has(code)) {
              // 使用缓存的 SVG，避免重新渲染
              const cachedSvg = renderedMermaidCache.get(code)
              node.innerHTML = cachedSvg
              node.setAttribute('data-rendered-code', code)
              console.log(`Using cached Mermaid ${i}:`, code.substring(0, 30))
            } else {
              // 需要重新渲染
              console.log(`Rendering new Mermaid ${i}:`, code.substring(0, 50))
              
              try {
                const { svg } = await mermaid.render(id + '-svg', code)
                node.innerHTML = svg
                // 保存已渲染的代码，用于下次对比
                node.setAttribute('data-rendered-code', code)
              } catch (err) {
                console.error(`Failed to render mermaid ${i}:`, err)
                
                // 检查是否是中文导致的错误
                const hasChinese = /[\u4e00-\u9fa5]/.test(code)
                let errorMsg = `Mermaid 渲染失败: ${err.message}`
                
                if (hasChinese && (code.includes('erDiagram') || code.includes('classDiagram'))) {
                  errorMsg += '\n\n💡 提示：erDiagram 和 classDiagram 对中文支持有限，建议：\n'
                  errorMsg += '1. 使用英文或拼音命名实体\n'
                  errorMsg += '2. 使用引号包裹中文标签，如: "用户"\n'
                  errorMsg += '3. 或改用 flowchart/graph 类型'
                }
                
                node.innerHTML = `<pre style="color: #f85149; background: #161b22; padding: 16px; border-radius: 6px; border: 1px solid #30363d; white-space: pre-wrap;">${errorMsg}\n\n原始代码：\n${code}</pre>`
              }
            }
          }
          
          console.log('Mermaid rendering completed')
          
          if (!mermaidLoaded) {
            setStatus('就绪')
          }
        } catch (err) {
          logError(err, {
            operation: 'Mermaid 渲染',
            mermaidBlocksCount: mermaidBlocks.length
          })
          setStatus('Mermaid 渲染失败')
          setTimeout(() => setStatus('就绪'), 2000)
        }
      }

      if (plantumlBlocks.length > 0) {
        try {
          // 等待 DOM diff 落地，避免首次 query 为空
          await new Promise(resolve => setTimeout(resolve, 100))

          let plantumlNodes = previewRef.current.querySelectorAll('.plantuml')

          // 兜底：如果替换阶段未命中，则在 DOM 层再把 pre>code.language-plantuml/puml 转成 .plantuml
          if (!plantumlNodes || plantumlNodes.length === 0) {
            const codeNodes = previewRef.current.querySelectorAll('pre > code.language-plantuml, pre > code.language-puml')
            codeNodes.forEach((codeEl, idx) => {
              const pre = codeEl.parentElement
              if (!pre || !pre.parentElement) return
              const code = codeEl.textContent || ''
              const div = document.createElement('div')
              div.className = 'plantuml'
              div.id = `plantuml-dom-${idx}`
              div.setAttribute('data-code', encodeURIComponent(code))
              div.textContent = code
              pre.parentElement.replaceChild(div, pre)
            })
            plantumlNodes = previewRef.current.querySelectorAll('.plantuml')
          }

          const plantumlThemeKey = editorTheme === 'dark' ? 'dark' : 'light'
          const plantumlContrastThresholdRaw = Number(exportConfig?.infographicContrastThreshold)
          const plantumlContrastThreshold = Number.isFinite(plantumlContrastThresholdRaw)
            ? Math.min(0.9, Math.max(0.1, plantumlContrastThresholdRaw))
            : 0.5
          const plantumlFallbackBg = exportConfig.theme === 'morandi'
            ? '#f9f7f5'
            : (editorTheme === 'dark' ? '#0d1117' : '#ffffff')
          const plantumlBackgroundColor = exportConfig.bgColor || plantumlFallbackBg
          const plantumlBgKey = String(plantumlBackgroundColor || '').trim() || 'auto'

          for (let i = 0; i < plantumlNodes.length; i++) {
            const node = plantumlNodes[i]
            const encodedCode = node.getAttribute('data-code')
            const code = encodedCode ? decodeURIComponent(encodedCode) : node.textContent

            try {
              const cacheKey = `v2::${plantumlThemeKey}::${plantumlBgKey}::${plantumlContrastThreshold}::${code}`
              const cachedSvg = renderedPlantUMLCacheRef.current.get(cacheKey)
              if (cachedSvg) {
                node.innerHTML = cachedSvg
                node.classList.add('is-rendered')
                node.setAttribute('data-rendered-code', code)
                continue
              }

              const svg = await renderPlantUMLSvg(code, plantumlThemeKey, plantumlBackgroundColor, plantumlContrastThreshold)
              node.innerHTML = svg
              node.classList.add('is-rendered')
              node.setAttribute('data-rendered-code', code)
              renderedPlantUMLCacheRef.current.set(cacheKey, svg)

              if (renderedPlantUMLCacheRef.current.size > 200) {
                const firstKey = renderedPlantUMLCacheRef.current.keys().next().value
                if (firstKey) renderedPlantUMLCacheRef.current.delete(firstKey)
              }
            } catch (err) {
              console.error(`Failed to render PlantUML ${i}:`, err)
              node.innerHTML = `<pre style="color: #f85149; background: #161b22; padding: 16px; border-radius: 6px; border: 1px solid #30363d; white-space: pre-wrap;">PlantUML 渲染失败: ${err.message}\n\n原始代码：\n${code}</pre>`
            }
          }
        } catch (err) {
          logError(err, {
            operation: 'PlantUML 渲染',
            plantumlBlocksCount: plantumlBlocks.length
          })
          setStatus('PlantUML 渲染失败')
          setTimeout(() => setStatus('就绪'), 2000)
        }
      }

      if (infographicBlocks.length > 0) {
        try {
          await new Promise(resolve => setTimeout(resolve, 100))

          let infographicNodes = previewRef.current.querySelectorAll('.infographic')
          if (!infographicNodes || infographicNodes.length === 0) {
            const codeNodes = previewRef.current.querySelectorAll('pre > code.language-infographic')
            codeNodes.forEach((codeEl, idx) => {
              const pre = codeEl.parentElement
              if (!pre || !pre.parentElement) return
              const code = codeEl.textContent || ''
              const div = document.createElement('div')
              div.className = 'infographic'
              div.id = `infographic-dom-${idx}`
              div.setAttribute('data-code', encodeURIComponent(code))
              div.textContent = code
              pre.parentElement.replaceChild(div, pre)
            })
            infographicNodes = previewRef.current.querySelectorAll('.infographic')
          }

          for (let i = 0; i < infographicNodes.length; i++) {
            const node = infographicNodes[i]
            const encodedCode = node.getAttribute('data-code')
            const code = encodedCode ? decodeURIComponent(encodedCode) : node.textContent

            try {
              const infographicThemeKey = editorTheme === 'dark' ? 'dark' : 'light'
              const infographicContrastThreshold = Number(exportConfig?.infographicContrastThreshold)
              const contrastThreshold = Number.isFinite(infographicContrastThreshold)
                ? Math.min(0.9, Math.max(0.1, infographicContrastThreshold))
                : 0.5
              const fallbackBg = exportConfig.theme === 'morandi'
                ? '#f9f7f5'
                : (editorTheme === 'dark' ? '#0d1117' : '#ffffff')
              const backgroundColor = exportConfig.bgColor || fallbackBg
              const backgroundColorKey = String(backgroundColor || '').trim() || 'auto'
              const cacheKey = `v4::${infographicThemeKey}::${exportConfig.theme || 'default'}::${backgroundColorKey}::${contrastThreshold}::${code}`
              const cachedSvg = renderedInfographicCacheRef.current.get(cacheKey)
              if (cachedSvg) {
                node.innerHTML = cachedSvg
                node.classList.add('is-rendered')
                node.setAttribute('data-rendered-code', code)
                continue
              }

              const svg = await renderInfographicSvg(code, infographicThemeKey, backgroundColor, contrastThreshold)
              node.innerHTML = svg
              node.classList.add('is-rendered')
              node.setAttribute('data-rendered-code', code)
              renderedInfographicCacheRef.current.set(cacheKey, svg)

              if (renderedInfographicCacheRef.current.size > 200) {
                const firstKey = renderedInfographicCacheRef.current.keys().next().value
                if (firstKey) renderedInfographicCacheRef.current.delete(firstKey)
              }
            } catch (err) {
              console.error(`Failed to render Infographic ${i}:`, err)
              node.innerHTML = `<pre style="color: #f85149; background: #161b22; padding: 16px; border-radius: 6px; border: 1px solid #30363d; white-space: pre-wrap;">Infographic 渲染失败: ${err.message}\n\n原始代码：\n${code}</pre>`
            }
          }
        } catch (err) {
          logError(err, {
            operation: 'Infographic 渲染',
            infographicBlocksCount: infographicBlocks.length
          })
          setStatus('Infographic 渲染失败')
          setTimeout(() => setStatus('就绪'), 2000)
        }
      }
    } catch (err) {
      const formattedError = handleError(err, {
        operation: 'Markdown 渲染',
        contentSize: new Blob([contentToRender]).size,
        showDetails: true
      })
      previewRef.current.innerHTML = `<pre style="color: #f85149; background: #161b22; padding: 16px; border-radius: 6px; border: 1px solid #30363d; white-space: pre-wrap;">${formattedError.title}\n\n${formattedError.message}\n\n💡 ${formattedError.suggestion}\n\n详细信息：${formattedError.details}</pre>`
    } finally {
      // 性能监控：记录渲染时间
      const endTime = performance.now()
      const renderTime = endTime - startTime
      const contentSize = new Blob([contentToRender]).size
      console.log(`Markdown 渲染完成: ${renderTime.toFixed(2)}ms, 文件大小: ${(contentSize / 1024).toFixed(2)}KB`)
      
      // 如果渲染时间过长，给出提示
      if (renderTime > 1000) {
        console.warn(`⚠️ 渲染时间较长 (${renderTime.toFixed(2)}ms)，建议优化文档内容`)
      }
    }
  }, [mermaidLoaded, markdownProcessor, postProcessHtml, exportConfig.captionFormat, exportConfig.bgColor, exportConfig.bgCSS, exportConfig.theme, exportConfig.infographicContrastThreshold, editorTheme, updateFigureCaptionsInPreview, updatePreviewDOM])

  // 使用 debounce 优化 Markdown 渲染性能
  const debouncedContent = useDebounce(content, 300) // 300ms 防抖，平衡实时性与稳定性
  
  // 记录上次渲染的内容，避免重复渲染
  const lastRenderedContentRef = useRef('')
  const lastRenderedHtmlRef = useRef('') // 缓存原始 HTML（未经后处理）
  const renderedPlantUMLCacheRef = useRef(new Map())
  const renderedInfographicCacheRef = useRef(new Map())
  
  // 记录是否正在渲染中
  const isRenderingRef = useRef(false)
  const prevRenderMarkdownRef = useRef(renderMarkdown)
  const contentRef = useRef(debouncedContent)

  // 保持 contentRef 最新
  useEffect(() => {
    contentRef.current = debouncedContent
  }, [debouncedContent])

  useEffect(() => {
    // 图片格式不渲染 Markdown
    if (currentFileFormat === FORMAT_IMAGE || isOfficeReadOnly) return
    // 如果正在渲染中，跳过
    if (isRenderingRef.current) return
    // 只在内容真正变化时才渲染
    if (debouncedContent !== lastRenderedContentRef.current) {
      lastRenderedContentRef.current = debouncedContent
      isRenderingRef.current = true
      renderMarkdown(debouncedContent).finally(() => {
        isRenderingRef.current = false
      })
    }
  }, [debouncedContent, currentFileFormat, editorTheme, exportConfig.bgColor, exportConfig.bgCSS, exportConfig.infographicContrastThreshold])

  // 初始化时应用导出配置样式
  // useEffect(() => {
  //   applyExportConfigStyles(exportConfig)
  // }, [])

  // 当导出配置改变时，只更新 CSS，不重新渲染 Markdown
  // 注释掉，因为第 168 行的 useEffect 已经处理了所有样式
  // useEffect(() => {
  //   applyExportConfigStyles(exportConfig)
  // }, [
  //   exportConfig.captionFormat, 
  //   exportConfig.wechatLinkToFootnote, 
  //   exportConfig.themeColor, 
  //   JSON.stringify(exportConfig.headingStyles)
  // ])

  useEffect(() => {
    if (effectiveLayout === 'preview-only' || effectiveLayout === 'vertical') {
      const timer = setTimeout(() => {
        if (!previewRef.current) return
        if (isOfficeReadOnly) return
        // 图片格式：直接使用 imageDataRef.current 中的 base64 数据渲染
        // 如果 imageDataRef.current 为 null，说明图片还在加载中，显示加载状态
        if (currentFileFormat === FORMAT_IMAGE) {
          if (imageDataRef.current) {
            previewRef.current.innerHTML = `<div class="preview-image-container" style="display:flex;align-items:center;justify-content:center;min-height:200px;padding:24px;"><img src="${imageDataRef.current}" alt="${currentPath?.split('/').pop() || '预览'}" style="max-width:100%;max-height:80vh;object-fit:contain;" /></div>`
          } else {
            previewRef.current.innerHTML = '<div class="preview-loading" style="display:flex;align-items:center;justify-content:center;min-height:200px;padding:24px;color:var(--text-secondary);font-size:14px;">正在加载图片...</div>'
          }
          return
        }
        // 非支持格式：显示提示
        if (currentFileFormat === FORMAT_UNSUPPORTED) {
          previewRef.current.innerHTML = '<div class="preview-unsupported" style="display:flex;align-items:center;justify-content:center;min-height:200px;padding:24px;color:var(--text-secondary);font-size:14px;">此格式不支持预览</div>'
          return
        }
        // 文本类格式：纯文本展示（支持语法高亮）
        if (currentFileFormat === FORMAT_TEXT) {
          const escaped = (content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
          const lang = currentPath ? getLanguageFromPath(currentPath) : 'plaintext'
          const langClass = lang === 'plaintext' ? '' : ` language-${lang}`
          previewRef.current.innerHTML = `<pre class="preview-plaintext" style="margin:0;padding:24px;white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:14px;"><code class="hljs${langClass}">${escaped}</code></pre>`
          import('highlight.js').then(({ default: hljs }) => {
            const code = previewRef.current?.querySelector('.preview-plaintext code')
            if (code) hljs.highlightElement(code).catch(() => {})
          }).catch(() => {})
          return
        }
        // 布局切换时强制渲染 Markdown（包括图片格式，支持在编辑区写 Markdown 图片语法）
        if (!isRenderingRef.current) {
          isRenderingRef.current = true
          renderMarkdown(content).finally(() => {
            isRenderingRef.current = false
          })
        }
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [effectiveLayout, content, renderMarkdown, showExportConfigPanel, currentFileFormat, currentPath, imageDataRef.current])

  // 图片格式：切换到编辑/双栏布局时，按需加载 Hex 到编辑区
  useEffect(() => {
    if (currentFileFormat !== FORMAT_IMAGE || !currentPath) return
    const needsEditor = effectiveLayout === 'editor-only' || effectiveLayout === 'vertical'
    if (!needsEditor || content !== '') return

    let cancelled = false
    const loadImageHex = async () => {
      try {
        const res = await fetch(`/api/file?path=${encodeURIComponent(currentPath)}&mode=hex`)
        const data = await res.json()
        if (cancelled || !data.ok) return
        currentFileEncodingRef.current = 'hex'
        setContent(data.content || '')
        lastSavedContentRef.current = data.content || ''
        lastSavedPathRef.current = currentPath
      } catch (e) {
        if (!cancelled) showToast('加载图片 Hex 失败', 'error')
      }
    }
    loadImageHex()
    return () => { cancelled = true }
  }, [currentFileFormat, currentPath, effectiveLayout, content, showToast])

  // 图片双栏模式：Hex 编辑后实时更新预览（hex -> base64 -> dataURL）
  useEffect(() => {
    if (currentFileFormat !== FORMAT_IMAGE || effectiveLayout !== 'vertical') return
    if (!content || !/^[0-9a-fA-F\s]*$/.test(content.replace(/\s/g, ''))) return

    try {
      const hex = content.replace(/\s/g, '')
      if (hex.length % 2 !== 0) return
      const bytes = new Uint8Array(hex.length / 2)
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
      }
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const b64 = btoa(binary)
      const mime = currentPath.toLowerCase().endsWith('.png') ? 'image/png' : currentPath.toLowerCase().endsWith('.gif') ? 'image/gif' : currentPath.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg'
      imageDataRef.current = `data:${mime};base64,${b64}`
      if (previewRef.current) {
        previewRef.current.innerHTML = `<div class="preview-image-container" style="display:flex;align-items:center;justify-content:center;min-height:200px;padding:24px;"><img src="${imageDataRef.current}" alt="预览" style="max-width:100%;max-height:80vh;object-fit:contain;" /></div>`
      }
    } catch (_) {}
  }, [currentFileFormat, currentPath, effectiveLayout, content])

  // 处理脚注链接点击，防止页面滚动
  useEffect(() => {
    const handleFootnoteClick = (e) => {
      const target = e.target.closest('a[href^="#"]')
      if (!target) return
      
      const href = target.getAttribute('href')
      if (!href || href === '#') return
      
      // 检查是否是脚注相关的链接
      const isFootnoteLink = href.includes('fn') || href.includes('fnref') || 
                            target.hasAttribute('data-footnote-ref') || 
                            target.hasAttribute('data-footnote-backref')
      
      if (isFootnoteLink) {
        e.preventDefault()
        e.stopPropagation()
        
        // 查找目标元素
        const targetId = href.substring(1)
        const targetElement = previewRef.current?.querySelector(`#${targetId}`)
        
        if (targetElement) {
          // 获取预览容器 - previewRef.current 的父元素就是 .preview-pane
          const previewPane = previewRef.current.parentElement
          if (!previewPane) {
            console.log('找不到 preview-pane')
            return
          }
          
          // 计算目标元素相对于 markdown-body 的位置
          const targetRect = targetElement.getBoundingClientRect()
          const previewRect = previewPane.getBoundingClientRect()
          
          // 计算需要滚动的距离（将目标元素滚动到预览区中心）
          const scrollTop = previewPane.scrollTop
          const targetOffset = targetRect.top - previewRect.top + scrollTop
          const centerOffset = previewPane.clientHeight / 2 - targetRect.height / 2
          
          console.log('脚注滚动:', {
            targetId,
            scrollTop,
            targetOffset,
            centerOffset,
            finalScroll: targetOffset - centerOffset
          })
          
          // 只在预览区内滚动，不影响页面
          previewPane.scrollTo({
            top: targetOffset - centerOffset,
            behavior: 'smooth'
          })
        } else {
          console.log('找不到目标元素:', href)
        }
      }
    }
    
    const previewElement = previewRef.current
    if (previewElement) {
      previewElement.addEventListener('click', handleFootnoteClick, true)
      return () => {
        previewElement.removeEventListener('click', handleFootnoteClick, true)
      }
    }
  }, [previewRef])

  // 处理图片链接点击，防止跳转到 about:blank#blocked
  useEffect(() => {
    const handleImageLinkClick = (e) => {
      // 检查是否点击了包含图片的链接
      const link = e.target.closest('a')
      if (!link) return
      
      // 检查链接内是否包含图片
      const img = link.querySelector('img')
      if (!img) return
      
      // 检查是否是图片包裹链接（没有有效的 href 或 href 为空）
      const href = link.getAttribute('href')
      if (!href || href === '' || href === '#' || href.startsWith('about:')) {
        e.preventDefault()
        e.stopPropagation()
        console.log('阻止图片链接跳转:', href)
        return
      }
      
      // 如果是有效的外部链接，允许在新窗口打开
      if (href.startsWith('http://') || href.startsWith('https://')) {
        e.preventDefault()
        window.open(href, '_blank')
      }
    }
    
    const handleFormatImageClick = (e) => {
      if (e.target.closest('.preview-image-container') && currentFileFormat === FORMAT_IMAGE && imageDataRef.current) {
        e.preventDefault()
        e.stopPropagation()
        setShowImageZoomDialog(true)
      }
    }

    const previewElement = previewRef.current
    if (previewElement) {
      previewElement.addEventListener('click', handleImageLinkClick, true)
      previewElement.addEventListener('click', handleFormatImageClick, true)
      return () => {
        previewElement.removeEventListener('click', handleImageLinkClick, true)
        previewElement.removeEventListener('click', handleFormatImageClick, true)
      }
    }
  }, [previewRef, currentFileFormat])

  // 预览区右键菜单事件监听 - 已改为直接在 JSX 中使用 onContextMenu
  // useEffect 已移除，避免重复绑定

  const handleToolbarInsert = useCallback((before, after, mode) => {
    if (!editorRef.current) return

    const editor = editorRef.current
    const model = editor.getModel()
    const selection = editor.getSelection()
    const selectedText = model.getValueInRange(selection)

    let newText = ''
    let newSelection = null

    switch (mode) {
      case 'wrap':
        newText = `${before}${selectedText}${after}`
        newSelection = {
          startLineNumber: selection.startLineNumber,
          startColumn: selection.startColumn + before.length,
          endLineNumber: selection.endLineNumber,
          endColumn: selection.endColumn + before.length
        }
        break

      case 'line':
        const lineContent = model.getLineContent(selection.startLineNumber)
        newText = `${before}${lineContent}`
        editor.executeEdits('', [{
          range: {
            startLineNumber: selection.startLineNumber,
            startColumn: 1,
            endLineNumber: selection.startLineNumber,
            endColumn: lineContent.length + 1
          },
          text: newText
        }])
        editor.setPosition({
          lineNumber: selection.startLineNumber,
          column: before.length + 1
        })
        editor.focus()
        return

      case 'heading':
        const headingLine = model.getLineContent(selection.startLineNumber)
        const cleanLine = headingLine.replace(/^#+\s*/, '')
        newText = `${before}${cleanLine}`
        editor.executeEdits('', [{
          range: {
            startLineNumber: selection.startLineNumber,
            startColumn: 1,
            endLineNumber: selection.startLineNumber,
            endColumn: headingLine.length + 1
          },
          text: newText
        }])
        editor.setPosition({
          lineNumber: selection.startLineNumber,
          column: newText.length + 1
        })
        editor.focus()
        return

      case 'insert':
        newText = before
        break

      default:
        return
    }

    editor.executeEdits('', [{
      range: selection,
      text: newText
    }])

    if (newSelection) {
      editor.setSelection(newSelection)
    } else if (mode === 'insert') {
      const lines = newText.split('\n')
      const lastLine = lines[lines.length - 1]
      editor.setPosition({
        lineNumber: selection.startLineNumber + lines.length - 1,
        column: lastLine.length + 1
      })
    }

    editor.focus()
  }, []) // 添加依赖数组

  const handleSlashCommandSelect = useCallback((command) => {
    const editor = editorRef.current
    if (!editor || !slashMenu?.range || !command) {
      setSlashMenu((prev) => ({ ...prev, visible: false }))
      return
    }

    editor.executeEdits('slash-command-remove-trigger', [{
      range: slashMenu.range,
      text: '',
      forceMoveMarkers: true,
    }])

    const triggerStart = {
      lineNumber: slashMenu.range.startLineNumber,
      column: slashMenu.range.startColumn,
    }
    editor.setPosition(triggerStart)
    editor.focus()

    if (command.id === 'image') {
      setShowImageManager(true)
      setImageManagerInitialTab(null)
      setSlashMenu((prev) => ({ ...prev, visible: false }))
      return
    }

    if (command.id === 'table') {
      setShowTableDialog(true)
      setSlashMenu((prev) => ({ ...prev, visible: false }))
      return
    }

    handleToolbarInsert(command.before, command.after, command.mode)
    setSlashMenu((prev) => ({ ...prev, visible: false }))
  }, [slashMenu, handleToolbarInsert])

  const handleImageInsert = useCallback((markdown) => {
    if (!editorRef.current || !markdown) return
    const editor = editorRef.current
    const model = editor.getModel()
    if (!model) return
    let range = editor.getSelection()
    if (!range) {
      const end = model.getPositionAt(model.getValueLength())
      range = { startLineNumber: end.lineNumber, startColumn: end.column, endLineNumber: end.lineNumber, endColumn: end.column }
    }
    // 上下各留一行空格
    const text = `\n\n${markdown}\n\n`
    editor.executeEdits('insert-image', [{ range, text, forceMoveMarkers: true }])
    editor.focus()
  }, [])

  const handleInsertText = useCallback((text) => {
    if (editorRef.current && text) {
      const editor = editorRef.current
      const selection = editor.getSelection()
      editor.executeEdits('insert-text', [{
        range: selection,
        text,
        forceMoveMarkers: true
      }])
      editor.focus()
    }
  }, [])

  const applyMonacoTheme = useCallback((monacoInstance = window.monaco) => {
    if (!monacoInstance?.editor) return
    const monacoTheme = editorThemeRef.current === 'dark' ? 'custom-dark' : 'custom-light'
    monacoInstance.editor.setTheme(monacoTheme)
  }, [])

  const handleEditorMount = useCallback((editor, monacoInstance) => {
    editorRef.current = editor
    setEditorInstance(editor)

    const editorDisposables = []
    editorDisposables.push(
      editor.onDidBlurEditorText(() => {
        setSlashMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev))
      })
    )

    // 定义自定义主题 - 修改标题与粗体颜色
    monacoInstance.editor.defineTheme('custom-light', {
      base: 'vs',
      inherit: true,
      rules: [
        // 标题颜色
        { token: 'keyword.md', foreground: '0165FF', fontStyle: 'bold' },
        { token: 'string.md', foreground: '0165FF', fontStyle: 'bold' },
        // 粗体文本颜色（与标题一致）
        { token: 'strong.md', foreground: '0165FF', fontStyle: 'bold' },
        { token: 'strong', foreground: '0165FF', fontStyle: 'bold' },
        { token: 'emphasis.md', foreground: '0165FF', fontStyle: 'bold' },
      ],
      colors: {
        'editor.foreground': '#24292f',
        'editor.background': '#FFFFFF',
      }
    })

    monacoInstance.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        // 标题颜色
        { token: 'keyword.md', foreground: '0165FF', fontStyle: 'bold' },
        { token: 'string.md', foreground: '0165FF', fontStyle: 'bold' },
        // 粗体文本颜色（与标题一致）
        { token: 'strong.md', foreground: '0165FF', fontStyle: 'bold' },
        { token: 'strong', foreground: '0165FF', fontStyle: 'bold' },
        { token: 'emphasis.md', foreground: '0165FF', fontStyle: 'bold' },
      ],
      colors: {
        'editor.foreground': '#d4d4d4',
        'editor.background': '#1e1e1e',
      }
    })
    
    // 使用最新主题，避免刷新时被旧闭包主题覆盖
    applyMonacoTheme(monacoInstance)
    
    // 监听粘贴事件，处理图片粘贴
      const domNode = editor.getDomNode()
      let pasteCleanup = () => {}
      if (domNode) {
        domNode.addEventListener('focusin', () => {
          if (window.matchMedia(MOBILE_SINGLE_COLUMN_MEDIA_QUERY).matches) {
            setMobileActivePane('editor')
            setTimeout(() => {
              domNode.scrollIntoView({ block: 'nearest', inline: 'nearest' })
              editor.layout()
            }, 120)
        }
      })

      // 添加右键菜单事件监听（仅桌面设备启用自定义菜单）
      try {
        const isCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches
        const isNarrowViewport = window.matchMedia?.('(max-width: 1024px)').matches
        const shouldUseSystemMenu = isCoarsePointer && isNarrowViewport

        if (!shouldUseSystemMenu) {
          domNode.addEventListener('contextmenu', handleEditorContextMenu)
        }
      } catch {
        domNode.addEventListener('contextmenu', handleEditorContextMenu)
      }
      
      // Ctrl+V 粘贴图片：Monaco 在内部拦截粘贴，必须在 document 捕获阶段拦截
      const handleDocumentPaste = async (e) => {
        const editorDom = editor.getDomNode()
        if (!editorDom) return
        const activeEl = document.activeElement
        const target = e.target
        const editorFocused = activeEl && (editorDom === activeEl || editorDom.contains(activeEl))
        const pasteInEditor = target && (editorDom === target || editorDom.contains(target))
        if (!editorFocused && !pasteInEditor) return

        const items = e.clipboardData?.items
        if (!items) return

        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (item.type.startsWith('image/')) {
            e.preventDefault()
            e.stopPropagation()

            const file = item.getAsFile()
            if (!file) continue

            setStatus('正在上传图片...')

            const insertImageMarkdown = (markdown) => {
              const ed = editorRef.current
              if (!ed) return
              const selection = ed.getSelection()
              ed.executeEdits('paste-image', [{
                range: selection,
                text: `\n\n${markdown}\n\n`,
                forceMoveMarkers: true
              }])
            }

            try {
              const formData = new FormData()
              formData.append('images', file)

              const response = await fetch('/api/image/upload', {
                method: 'POST',
                body: formData
              })

              const result = await response.json()

              if (result.ok && result.images && result.images.length > 0) {
                const image = result.images[0]
                insertImageMarkdown(`![图片](${image.url})`)
                showToast(`图片上传成功: ${image.filename}`, 'success')
                setStatus('就绪')
              } else {
                const reader = new FileReader()
                reader.onload = () => {
                  insertImageMarkdown(`![图片](${reader.result})`)
                  showToast('图片已插入（Base64，上传服务不可用）', 'info')
                  setStatus('就绪')
                }
                reader.readAsDataURL(file)
              }
            } catch (error) {
              const reader = new FileReader()
              reader.onload = () => {
                insertImageMarkdown(`![图片](${reader.result})`)
                showToast('图片已插入（Base64）', 'info')
                setStatus('就绪')
              }
              reader.onerror = () => {
                showToast('图片读取失败，请重试', 'error')
                setStatus('就绪')
              }
              reader.readAsDataURL(file)
            }

            break
          }
        }
      }
      document.addEventListener('paste', handleDocumentPaste, true)
      pasteCleanup = () => document.removeEventListener('paste', handleDocumentPaste, true)
      
      // 监听拖拽事件，处理图片拖拽上传
      domNode.addEventListener('dragover', (e) => {
        e.preventDefault()
        e.stopPropagation()
        // 添加拖拽悬停效果
        domNode.style.opacity = '0.7'
      })
      
      domNode.addEventListener('dragleave', (e) => {
        e.preventDefault()
        e.stopPropagation()
        // 移除拖拽悬停效果
        domNode.style.opacity = '1'
      })
      
      domNode.addEventListener('drop', async (e) => {
        e.preventDefault()
        e.stopPropagation()
        
        // 移除拖拽悬停效果
        domNode.style.opacity = '1'
        
        const files = e.dataTransfer?.files
        if (!files || files.length === 0) return
        
        // 过滤出图片文件
        const imageFiles = Array.from(files).filter(file => 
          file.type.startsWith('image/')
        )
        
        if (imageFiles.length === 0) {
          setStatus('请拖拽图片文件')
          setStatusType('error')
          setTimeout(() => {
            setStatus('就绪')
            setStatusType('normal')
          }, 2000)
          return
        }
        
        // 显示上传提示
        setStatus(`正在上传 ${imageFiles.length} 张图片...`)
        setStatusType('normal')
        
        try {
          // 上传图片
          const formData = new FormData()
          imageFiles.forEach(file => {
            formData.append('images', file)
          })
          
          const response = await fetch('/api/image/upload', {
            method: 'POST',
            body: formData
          })
          
          const result = await response.json()
          
          if (result.ok && result.images && result.images.length > 0) {
            // 生成 Markdown 图片链接，上下各留一行空格
            const markdownImages = result.images.map(image => 
              `![${image.filename}](${image.url})`
            ).join('\n')
            const text = `\n\n${markdownImages}\n\n`
            
            // 获取鼠标位置对应的编辑器位置
            const position = editor.getTargetAtClientPoint(e.clientX, e.clientY)
            
            if (position) {
              // 在鼠标位置插入
              editor.executeEdits('drop-image', [{
                range: new monaco.Range(
                  position.position.lineNumber,
                  position.position.column,
                  position.position.lineNumber,
                  position.position.column
                ),
                text,
                forceMoveMarkers: true
              }])
            } else {
              // 如果无法获取位置，在当前光标位置插入
              const selection = editor.getSelection()
              editor.executeEdits('drop-image', [{
                range: selection,
                text,
                forceMoveMarkers: true
              }])
            }
            
            // 显示成功通知
            showToast(`成功上传 ${result.images.length} 张图片`, 'success')
            setStatus('就绪')
            setStatusType('normal')
          } else {
            const errorMsg = getUserFriendlyMessage(
              new Error(result.message || '上传失败'),
              { operation: '拖拽上传图片', fileCount: imageFiles.length }
            )
            showToast('图片上传失败', 'error')
            logError(new Error(result.message || '上传失败'), {
              operation: '拖拽上传图片',
              fileCount: imageFiles.length,
              responseData: result
            })
            setStatus('就绪')
            setStatusType('normal')
          }
        } catch (error) {
          const formattedError = handleError(error, {
            operation: '拖拽上传图片',
            fileCount: imageFiles.length,
            fileNames: imageFiles.map(f => f.name)
          })
          showToast(`图片上传失败: ${formattedError.message}`, 'error')
          setStatus('就绪')
          setStatusType('normal')
        }
      })
    }
    
    // 注册自定义 Markdown 折叠提供器
    monaco.languages.registerFoldingRangeProvider('markdown', {
      provideFoldingRanges: (model) => {
        const ranges = []
        const lines = model.getLinesContent()
        
        // 查找标题并计算折叠范围
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          const headingMatch = line.match(/^(#{1,6})\s/)
          
          if (headingMatch) {
            const level = headingMatch[1].length
            let endLine = i
            
            // 找到下一个同级或更高级标题
            for (let j = i + 1; j < lines.length; j++) {
              const nextLine = lines[j]
              const nextMatch = nextLine.match(/^(#{1,6})\s/)
              
              if (nextMatch && nextMatch[1].length <= level) {
                endLine = j - 1
                break
              }
              endLine = j
            }
            
            // 只有当有内容可折叠时才添加折叠范围
            if (endLine > i) {
              ranges.push({
                start: i + 1,
                end: endLine + 1,
                kind: monaco.languages.FoldingRangeKind.Region
              })
            }
          }
        }
        
        return ranges
      }
    })
    
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, async () => {
      if (currentPath) {
        // 清除自动保存定时器，避免冲突
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current)
          autoSaveTimerRef.current = null
        }
        const success = await saveFile(currentPath, content)
        if (success) {
          // 手动保存后创建历史版本（标记为手动保存）
          await saveFileHistory(currentPath, content, '', false).catch(err => {
            console.warn('保存历史版本失败:', err)
          })
        }
      }
    })

    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyB, () => {
      handleToolbarInsert('**', '**', 'wrap')
    })

    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyI, () => {
      handleToolbarInsert('*', '*', 'wrap')
    })

    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyK, () => {
      handleToolbarInsert('[链接](https://)', '', 'insert')
    })

    // 搜索和替换快捷键
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyF, () => {
      editor.trigger('keyboard', 'actions.find')
    })

    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyH, () => {
      editor.trigger('keyboard', 'editor.action.startFindReplaceAction')
    })

    return () => {
      pasteCleanup()
      editorDisposables.forEach((disposable) => {
        try {
          disposable?.dispose?.()
        } catch (_) {}
      })
    }
  }, [applyMonacoTheme])

  // MenuBar 处理函数
  const handleMenuUndo = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.trigger('keyboard', 'undo')
    }
  }, [])

  const handleMenuRedo = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.trigger('keyboard', 'redo')
    }
  }, [])

  const handleMenuCopy = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.focus()
      editorRef.current.trigger('keyboard', 'editor.action.clipboardCopyAction')
    }
  }, [])

  const handleMenuCut = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.focus()
      editorRef.current.trigger('keyboard', 'editor.action.clipboardCutAction')
    }
  }, [])

  const handleMenuPaste = useCallback(async () => {
    if (editorRef.current) {
      editorRef.current.focus()
      
      // 尝试使用浏览器剪贴板 API
      try {
        const text = await navigator.clipboard.readText()
        if (text) {
          const selection = editorRef.current.getSelection()
          editorRef.current.executeEdits('paste', [{
            range: selection,
            text: text,
            forceMoveMarkers: true
          }])
        }
      } catch (err) {
        // 如果剪贴板 API 失败，回退到 Monaco 的方法
        console.log('使用 Monaco Editor 粘贴方法')
        editorRef.current.trigger('keyboard', 'editor.action.clipboardPasteAction')
      }
    }
  }, [])
  const handleMenuFormatDocument = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument').run()
    }
  }, [])

  const handleMenuFind = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.trigger('keyboard', 'actions.find')
    }
  }, [])

  const handleMenuReplace = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.trigger('keyboard', 'editor.action.startFindReplaceAction')
    }
  }, [])

  // 菜单栏「公众号格式」- 与工具栏复制微信格式按钮行为一致
  const handleMenuCopyToWeChat = useCallback(async () => {
    if (isOfficeReadOnly) {
      showToast('Office 只读预览：复制微信格式已禁用', 'warning', 3000)
      return
    }
    const previewEl = document.querySelector('.markdown-body')
    if (!previewEl) {
      showToast('未找到预览内容，请确保文档已渲染', 'error')
      return
    }
    const htmlContent = previewEl.innerHTML
    if (!htmlContent || htmlContent.trim() === '') {
      showToast('预览内容为空，请先编辑文档', 'error')
      return
    }
    const primaryColor = (exportConfig && exportConfig.themeColor) ? exportConfig.themeColor : '#0F4C81'
    try {
      const success = await copyToWeChat(htmlContent, primaryColor)
      if (success) {
        showToast('已复制微信格式，可直接粘贴到微信公众号编辑器', 'success')
      } else {
        showToast('复制失败，请重试', 'error')
      }
    } catch (err) {
      console.error('复制微信格式失败:', err)
      showToast('复制失败: ' + err.message, 'error')
    }
  }, [exportConfig, showToast])

  const handleInsertCode = (type) => {
    if (!editorRef.current) return
    
    const templates = {
      'strikethrough': ['~~', '~~', 'wrap'],
      'ul': ['- ', '', 'line'],
      'ol': ['1. ', '', 'line'],
      'task': ['- [ ] ', '', 'line'],
      'quote': ['>  ', '', 'line'],
      'codeblock': ['```\n', '\n```', 'wrap'],
      'inline': ['`', '`', 'wrap'],
      'hr': ['\n---\n', '', 'insert'],
      'math': ['$$\n', '\n$$', 'wrap'],
      'mermaid': ['```mermaid\n', '\n```', 'wrap']
    }
    
    if (templates[type]) {
      handleToolbarInsert(...templates[type])
    }
  }

  // 视图菜单处理函数
  const handleToggleToolbar = () => {
    updateShowToolbar(!showToolbar)
  }

  // 图注格式处理函数
  const handleImageCaptionFormatChange = (format) => {
    setImageCaptionFormat(format)
    showToast(`图注格式已切换为: ${getImageCaptionFormatLabel(format)}`, 'success')
  }

  const getImageCaptionFormatLabel = (format) => {
    const labels = {
      'title-first': 'title 优先',
      'alt-first': 'alt 优先',
      'title-only': '只显示 title',
      'alt-only': '只显示 alt',
      'no-caption': '不显示',
      'html-figure': 'HTML figure'
    }
    return labels[format] || format
  }

  const handleZoomIn = () => {
    setEditorFontSize((prev) => {
      const next = Math.min(prev + 2, 32)
      persistSetting('editorFontSize', next).catch((err) => {
        console.error('[App] 保存 editorFontSize 失败:', err)
      })
      return next
    })
  }

  const handleZoomOut = () => {
    setEditorFontSize((prev) => {
      const next = Math.max(prev - 2, 10)
      persistSetting('editorFontSize', next).catch((err) => {
        console.error('[App] 保存 editorFontSize 失败:', err)
      })
      return next
    })
  }

  const handleZoomReset = () => {
    const next = 14
    setEditorFontSize(next)
    persistSetting('editorFontSize', next).catch((err) => {
      console.error('[App] 保存 editorFontSize 失败:', err)
    })
  }

  // 帮助菜单处理函数
  const handleShowMarkdownHelp = () => {
    updateShowMarkdownHelp(true)
  }

  const handleShowShortcuts = () => {
    updateShowShortcuts(true)
  }

  const handleShowAbout = () => {
    updateShowAbout(true)
  }

  // 发布：飞牛桌面下先提醒保存、开新窗口并打开文件，再检测扩展；非飞牛桌面直接检测扩展
  const getStandaloneAppOrigin = useCallback(() => {
    if (typeof window === 'undefined') return ''
    const proxyBase = window.__APP_PROXY_BASE_PATH__ || '/'
    if (proxyBase === '/') return window.location.origin

    const queryPort = new URLSearchParams(window.location.search).get('service_port')
    const storedPort =
      localStorage.getItem('md-editor-service-port') ||
      localStorage.getItem('md-editor-app-port')
    const runtimePort = window.__APP_SERVICE_PORT__
    const fallbackPort = '18080'
    const directPort = [queryPort, storedPort, runtimePort, fallbackPort]
      .map(v => String(v || '').trim())
      .find(v => /^[0-9]{2,5}$/.test(v)) || fallbackPort
    const protocol = window.location.protocol || 'http:'
    const host = window.location.hostname
    return `${protocol}//${host}:${directPort}`
  }, [])

  // 发布：飞牛桌面下先提醒保存、开新窗口并打开文件，再检测扩展；非飞牛桌面直接检测扩展
  const handlePublish = useCallback(async () => {
    if (isOfficeReadOnly) {
      showToast('Office 只读预览：发布已禁用', 'warning', 3000)
      return
    }
    const isFnOSDesktop = typeof window !== 'undefined' && window.self !== window.top

    if (isFnOSDesktop) {
      // 飞牛桌面：需有已保存的文件路径
      if (!currentPath) {
        showToast('请先打开或保存文件后再发布', 'warning', 4000)
        return
      }
      if (hasUnsavedChanges()) {
        const confirmed = await requestConfirm({
          title: '请先保存文件',
          message: '检测到未保存的更改，请先保存文件后再发布。是否现在保存？',
          confirmText: '保存',
          cancelText: '取消',
          confirmVariant: 'primary',
        })
        if (!confirmed) return
        await handleSaveClick()
        // 保存后再次检查（用户可能取消另存为）
        if (hasUnsavedChanges()) return
      }
      const url = `${getStandaloneAppOrigin()}/?path=${encodeURIComponent(currentPath)}&open=sync`
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    // 非飞牛桌面：直接打开发布弹窗，由 SyncDialog 内部检测扩展并显示（检测中/未安装引导/平台选择）
    setShowSyncDialog(true)
  }, [showToast, currentPath, hasUnsavedChanges, requestConfirm, handleSaveClick, getStandaloneAppOrigin])

  // 新窗口打开：在新标签页打开当前应用，若有当前文件则带上 path 参数
  const handleOpenInNewWindow = useCallback(() => {
    const params = new URLSearchParams()
    if (currentPath) params.set('path', currentPath)
    const url = `${getStandaloneAppOrigin()}/?${params.toString()}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [currentPath, getStandaloneAppOrigin])

  // 文件历史处理函数
  const handleShowHistory = async () => {
    if (!currentPath) {
      setStatus('请先打开一个文件')
      setTimeout(() => setStatus('就绪'), 2000)
      return
    }

    try {
      const versions = await getFileHistoryVersions(currentPath)
      setHistoryVersions(versions)
      updateShowHistory(true)
    } catch (error) {
      console.error('加载历史版本失败:', error)
      setStatus('加载历史版本失败')
      setTimeout(() => setStatus('就绪'), 2000)
    }
  }

  const handleRestoreHistory = (historyContent) => {
    setContent(historyContent)
    setStatus('已恢复历史版本')
    setTimeout(() => setStatus('就绪'), 2000)
  }

  const handleDeleteHistory = async (versionNumber) => {
    if (!currentPath) return

    try {
      await deleteVersion(currentPath, versionNumber)
      const versions = await getFileHistoryVersions(currentPath)
      setHistoryVersions(versions)
      setStatus('已删除历史版本')
      setTimeout(() => setStatus('就绪'), 2000)
    } catch (error) {
      console.error('删除历史版本失败:', error)
      setStatus('删除历史版本失败')
      setTimeout(() => setStatus('就绪'), 2000)
    }
  }

  // 最近文件处理函数
  const handleOpenRecentFile = (filePath) => {
    void openFileWithGuard(filePath)
  }

  const handleClearRecentFiles = () => {
    clearRecentFiles().then(() => setRecentFiles([]))
  }

  // 收藏夹处理函数
  const handleToggleFavorite = (path, type = 'file') => {
    return toggleFavorite(path, type).then(async (newState) => {
      setFavorites(await getFavorites())
      return newState
    })
  }

  const handleRemoveFavorite = (path) => {
    toggleFavorite(path).then(async () => {
      setFavorites(await getFavorites())
    })
  }

  const handleClearFavorites = () => {
    void (async () => {
      const confirmed = await requestConfirm({
        title: '清空收藏夹',
        message: '确定要清空收藏夹吗？此操作不会删除原始文件。',
        confirmText: '清空',
      })

      if (!confirmed) {
        return
      }

      clearFavorites().then(() => {
        setFavorites([])
        showToast('收藏夹已清空', 'success')
      })
    })()
  }

  const handleReorderFavorites = (newFavorites, options = {}) => {
    if (!Array.isArray(newFavorites)) {
      console.warn('[App] handleReorderFavorites ignored non-array payload:', newFavorites)
      return
    }

    if (options.skipPersist) {
      setFavorites(newFavorites)
      return
    }

    updateFavoritesOrder(newFavorites).then((ok) => {
      if (ok) setFavorites(newFavorites)
    })
  }

  const handleOpenFavorite = async (path) => {
    // 从收藏夹列表中找到对应项
    const favoriteItem = favorites.find(item => item.path === path)
    
    if (favoriteItem) {
      if (favoriteItem.type === 'directory') {
        // 如果是文件夹，展开到该文件夹
        if (fileTreeRef.current && fileTreeRef.current.expandToPath) {
          await fileTreeRef.current.expandToPath(path)
        }
        if (isCompactViewport) {
          updateShowFileTree(false)
        }
      } else {
        // 如果是文件，加载文件内容并展开到该文件
        if (fileTreeRef.current && fileTreeRef.current.expandToPath) {
          await fileTreeRef.current.expandToPath(path)
        }
        await openFileWithGuard(path)
      }
    } else {
      // 如果找不到收藏项，尝试作为文件加载
      await openFileWithGuard(path)
    }
  }

  // ============================================
  // 右键菜单操作处理函数
  // ============================================
  const handleContextMenuAction = useCallback(async (action, data) => {
    const editor = editorRef.current
    if (!editor && action !== 'save-image-as' && action !== 'copy-image') return
    
    switch (action) {
      // ========== 图片操作 ==========
      case 'upload-image':
        setShowImageManager(true)
        break
        
      case 'scale-image':
        if (contextMenu?.selectedImage && data?.scale) {
          const image = contextMenu.selectedImage
          const model = editor.getModel()
          
          let newText = ''
          const widthPercent = Math.round(data.scale * 100)
          
          // 构建新的 HTML 图片标签，使用 style="width:XX%;height:auto;"
          const titleAttr = image.title ? ` title="${image.title}"` : ''
          newText = `<img src="${image.src}" alt="${image.alt}"${titleAttr} style="width:${widthPercent}%;height:auto;" />`
          
          editor.executeEdits('scale-image', [{
            range: image.range,
            text: newText
          }])
          
          showToast(`图片已缩放至 ${widthPercent}%`, 'success')
        }
        break
        
      case 'convert-syntax':
        if (contextMenu?.selectedImage && data?.syntax) {
          const image = contextMenu.selectedImage
          const model = editor.getModel()
          let newText = ''
          
          if (data.syntax === 'markdown') {
            newText = `![${image.alt}](${image.src}${image.title ? ` "${image.title}"` : ''})`
          } else if (data.syntax === 'html') {
            newText = `<img src="${image.src}" alt="${image.alt}" />`
          }
          
          editor.executeEdits('convert-syntax', [{
            range: image.range,
            text: newText
          }])
          
          showToast(`已转换为 ${data.syntax.toUpperCase()} 语法`, 'success')
        }
        break
        
      case 'delete-image':
        if (contextMenu?.selectedImage?.isLocal) {
          const confirmed = await requestConfirm({
            title: '删除图片',
            message: '确定要删除这个图片文件吗？删除后将同时从文档中移除。',
            confirmText: '删除',
          })
          if (confirmed) {
            try {
              const image = contextMenu.selectedImage
              const response = await fetch(`/api/image/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: image.src })
              })
              
              const result = await response.json()
              if (result.ok) {
                const model = editor.getModel()
                editor.executeEdits('delete-image', [{
                  range: image.range,
                  text: ''
                }])
                showToast('图片已删除', 'success')
              } else {
                showToast('删除图片失败', 'error')
              }
            } catch (error) {
              console.error('删除图片失败:', error)
              showToast('删除图片失败', 'error')
            }
          }
        }
        break
        
      case 'copy-image':
        if (contextMenu?.selectedImage) {
          const markdown = `![${contextMenu.selectedImage.alt}](${contextMenu.selectedImage.src})`
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(markdown)
              showToast('图片标记已复制', 'success')
            } else {
              // Fallback: 使用传统方法
              const textarea = document.createElement('textarea')
              textarea.value = markdown
              textarea.style.position = 'fixed'
              textarea.style.opacity = '0'
              document.body.appendChild(textarea)
              textarea.select()
              document.execCommand('copy')
              document.body.removeChild(textarea)
              showToast('图片标记已复制', 'success')
            }
          } catch (error) {
            console.warn('Clipboard API 失败，使用 fallback:', error)
            // Fallback: 使用传统方法
            try {
              const textarea = document.createElement('textarea')
              textarea.value = markdown
              textarea.style.position = 'fixed'
              textarea.style.opacity = '0'
              document.body.appendChild(textarea)
              textarea.select()
              document.execCommand('copy')
              document.body.removeChild(textarea)
              showToast('图片标记已复制', 'success')
            } catch (fallbackError) {
              console.error('复制失败:', fallbackError)
              showToast('复制失败', 'error')
            }
          }
        }
        break
        
      case 'save-image-as':
        if (contextMenu?.selectedImage) {
          try {
            // 获取图片文件名
            const fileName = contextMenu.selectedImage.src.split('/').pop() || 'image.png'
            
            // 对于跨域图片，需要先获取 blob
            const response = await fetch(contextMenu.selectedImage.src)
            const blob = await response.blob()
            
            // 创建 blob URL
            const blobUrl = URL.createObjectURL(blob)
            
            // 创建下载链接
            const link = document.createElement('a')
            link.href = blobUrl
            link.download = fileName
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            
            // 释放 blob URL
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
            
            showToast('图片下载已开始', 'success')
          } catch (error) {
            console.error('图片下载失败:', error)
            // 如果 fetch 失败，尝试在新窗口打开
            window.open(contextMenu.selectedImage.src, '_blank')
            showToast('已在新窗口打开图片', 'info')
          }
        }
        break
        
      // ========== 编辑操作 ==========
      case 'cut':
        if (contextMenu?.selectedText) {
          editor.focus()
          const selection = editor.getSelection()
          const text = editor.getModel().getValueInRange(selection)
          
          // 手动实现剪切：复制到剪贴板 + 删除选中内容
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
              editor.executeEdits('cut', [{
                range: selection,
                text: ''
              }])
              // 移动光标到删除位置
              editor.setPosition({
                lineNumber: selection.startLineNumber,
                column: selection.startColumn
              })
              showToast('已剪切', 'success')
            }).catch((error) => {
              console.error('剪切失败:', error)
              showToast('剪切失败，请使用 Ctrl+X', 'error')
            })
          } else {
            // 降级方案：使用旧的 execCommand
            const textarea = document.createElement('textarea')
            textarea.value = text
            textarea.style.position = 'fixed'
            textarea.style.opacity = '0'
            document.body.appendChild(textarea)
            textarea.select()
            try {
              document.execCommand('copy')
              editor.executeEdits('cut', [{
                range: selection,
                text: ''
              }])
              editor.setPosition({
                lineNumber: selection.startLineNumber,
                column: selection.startColumn
              })
              showToast('已剪切', 'success')
            } catch (err) {
              showToast('剪切失败，请使用 Ctrl+X', 'error')
            } finally {
              document.body.removeChild(textarea)
            }
          }
        }
        break
        
      case 'copy':
        if (contextMenu?.selectedText) {
          editor.focus()
          
          // 手动实现复制：复制到剪贴板
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(contextMenu.selectedText).then(() => {
              showToast('已复制', 'success')
            }).catch((error) => {
              console.error('复制失败:', error)
              showToast('复制失败，请使用 Ctrl+C', 'error')
            })
          } else {
            // 降级方案：使用旧的 execCommand
            const textarea = document.createElement('textarea')
            textarea.value = contextMenu.selectedText
            textarea.style.position = 'fixed'
            textarea.style.opacity = '0'
            document.body.appendChild(textarea)
            textarea.select()
            try {
              document.execCommand('copy')
              showToast('已复制', 'success')
            } catch (err) {
              showToast('复制失败，请使用 Ctrl+C', 'error')
            } finally {
              document.body.removeChild(textarea)
            }
          }
        }
        break
        
      case 'paste':
        editor.focus()
        
        // 手动实现粘贴：从剪贴板读取并插入
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(text => {
            const selection = editor.getSelection()
            editor.executeEdits('paste', [{
              range: selection,
              text: text,
              forceMoveMarkers: true
            }])
            // 移动光标到插入内容的末尾
            const lines = text.split('\n')
            const lastLine = lines[lines.length - 1]
            editor.setPosition({
              lineNumber: selection.startLineNumber + lines.length - 1,
              column: lines.length === 1 ? selection.startColumn + lastLine.length : lastLine.length + 1
            })
            showToast('已粘贴', 'success')
          }).catch((error) => {
            console.error('粘贴失败:', error)
            showToast('粘贴失败，请使用 Ctrl+V', 'warning')
          })
        } else {
          showToast('粘贴失败，请使用 Ctrl+V', 'warning')
        }
        break
        
      case 'delete':
        if (contextMenu?.selectedText) {
          const selection = editor.getSelection()
          editor.executeEdits('delete', [{
            range: selection,
            text: ''
          }])
        }
        break
        
      // ========== 格式化操作 ==========
      case 'bold':
        handleToolbarInsert('**', '**', 'wrap')
        break
        
      case 'italic':
        handleToolbarInsert('*', '*', 'wrap')
        break
        
      case 'inline-code':
        handleToolbarInsert('`', '`', 'wrap')
        break
        
      case 'link':
        handleToolbarInsert('[链接](https://)', '', 'insert')
        break
        
      case 'quote':
        handleToolbarInsert('> ', '', 'line')
        break
        
      case 'list':
        handleToolbarInsert('- ', '', 'line')
        break
        
      // ========== 段落操作 ==========
      case 'heading1':
        handleToolbarInsert('# ', '', 'heading')
        break
        
      case 'heading2':
        handleToolbarInsert('## ', '', 'heading')
        break
        
      case 'heading3':
        handleToolbarInsert('### ', '', 'heading')
        break
        
      case 'paragraph':
        const model = editor.getModel()
        const selection = editor.getSelection()
        const lineContent = model.getLineContent(selection.startLineNumber)
        const cleanLine = lineContent.replace(/^#+\s*/, '')
        editor.executeEdits('paragraph', [{
          range: {
            startLineNumber: selection.startLineNumber,
            startColumn: 1,
            endLineNumber: selection.startLineNumber,
            endColumn: lineContent.length + 1
          },
          text: cleanLine
        }])
        break
        
      // ========== 插入操作 ==========
      case 'insert-image':
        setShowImageManager(true)
        break
        
      case 'insert-link':
        handleToolbarInsert('[链接](https://)', '', 'insert')
        break
        
      case 'insert-codeblock':
        handleToolbarInsert('```\n', '\n```', 'wrap')
        break
        
      case 'insert-table':
        setShowTableDialog(true)
        break
        
      case 'insert-ul':
        handleToolbarInsert('- ', '', 'line')
        break
        
      case 'insert-ol':
        handleToolbarInsert('1. ', '', 'line')
        break
        
      case 'insert-task':
        handleToolbarInsert('- [ ] ', '', 'line')
        break
        
      case 'insert-hr':
        handleToolbarInsert('\n---\n', '', 'insert')
        break
        
      default:
        console.log('未处理的操作:', action, data)
    }
    
    if (editor) {
      setTimeout(() => editor.focus(), 100)
    }
  }, [contextMenu, handleToolbarInsert, showToast])

  const menuBarProps = {
    onNewFile: handleNewFile,
    onSave: handleSaveClick,
    onSaveAs: handleSaveAs,
    onExport: handleExport,
    onCopyToWeChat: handleMenuCopyToWeChat,
    onUndo: handleMenuUndo,
    onRedo: handleMenuRedo,
    onCopy: handleMenuCopy,
    onCut: handleMenuCut,
    onPaste: handleMenuPaste,
    onFormatDocument: handleMenuFormatDocument,
    onFind: handleMenuFind,
    onReplace: handleMenuReplace,
    onInsertHeading: (level) => handleToolbarInsert('#'.repeat(level) + ' ', '', 'heading'),
    onInsertBold: () => handleToolbarInsert('**', '**', 'wrap'),
    onInsertItalic: () => handleToolbarInsert('*', '*', 'wrap'),
    onInsertLink: () => handleToolbarInsert('[链接](https://)', '', 'insert'),
    onInsertImage: () => setShowImageManager(true),
    onInsertCode: handleInsertCode,
    onInsertTable: () => setShowTableDialog(true),
    onOpenTableInsert: () => setShowTableDialog(true),
    onToggleFileTree: handleToggleFileTree,
    onToggleTheme: cycleThemeMode,
    onSettings: handleSettings,
    onToggleToolbar: handleToggleToolbar,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onZoomReset: handleZoomReset,
    layout,
    onLayoutChange: updateLayout,
    focusMode,
    onFocusModeChange: setFocusMode,
    onShowMarkdownHelp: handleShowMarkdownHelp,
    onShowShortcuts: handleShowShortcuts,
    onShowAbout: handleShowAbout,
    onShowHistory: handleShowHistory,
    onOpenInNewWindow: handleOpenInNewWindow,
    imageCaptionFormat,
    onImageCaptionFormatChange: handleImageCaptionFormatChange,
    recentFiles,
    onOpenRecentFile: handleOpenRecentFile,
    onClearRecentFiles: handleClearRecentFiles,
    disabled: !currentPath || isOfficeReadOnly,
    theme: editorTheme,
    authUser,
    onLogout,
  }

  const renderPreviewPane = () => (
    <div 
      className="preview-pane" 
      style={(effectiveLayout === 'vertical') ? { flex: '1 1 0', minWidth: '120px', minHeight: 0 } : { flex: 1, minHeight: 0 }}
      onContextMenu={(e) => {
        console.log('[preview-pane] onContextMenu 触发，target:', e.target, 'currentTarget:', e.currentTarget)
        handlePreviewContextMenu(e)
      }}
    >
      {/* PDF 文件使用专门的 PDF Viewer */}
        {isOfficeReadOnly ? (
          <OfficeViewer
            format={currentFileFormat}
            content={officePreviewData}
            metadata={officePreviewMetadata}
            loading={officePreviewLoading}
            loadingMore={officePreviewLoadingMore}
            error={officePreviewError}
            onSelectSheet={(idx) => {
              if (!currentPath || currentFileFormat !== FORMAT_XLSX) return
              const next = Number.isFinite(idx) ? idx : 0
              setOfficeXlsxSheetIndex(next)
              setOfficePreviewError(null)
              void loadOfficePreview(currentPath, FORMAT_XLSX, { sheetIndex: next, rowOffset: 0, rowLimit: 200, append: false })
            }}
            onLoadMore={() => {
              if (!currentPath || currentFileFormat !== FORMAT_XLSX) return
              if (officePreviewLoadingMore || officePreviewLoading) return
              if (!officePreviewData?.hasMore) return
              const loaded = Array.isArray(officePreviewData?.rows) ? officePreviewData.rows.length : 0
              const offset = Number.isFinite(officePreviewData?.rowOffset) ? officePreviewData.rowOffset : 0
              const nextOffset = offset + loaded
              void loadOfficePreview(currentPath, FORMAT_XLSX, { sheetIndex: officeXlsxSheetIndex || 0, rowOffset: nextOffset, rowLimit: 200, append: true })
            }}
          />
        ) : currentFileFormat === FORMAT_PDF && pdfDataRef.current ? (
          <PdfViewer 
            pdfBase64={pdfDataRef.current}
            fileName={currentPath ? currentPath.split('/').pop() : 'document.pdf'}
            theme={editorTheme}
            onReady={() => console.log('[PdfViewer] PDF loaded successfully')}
            onError={(err) => console.error('[PdfViewer] PDF load error:', err)}
          />
        ) : (
        <div 
          ref={previewRef}
          className="markdown-body"
          style={{
            fontSize: exportConfig.fontSize || '16px',
            lineHeight: exportConfig.lineHeight || 1.8,
            textAlign: exportConfig.textAlign || 'left',
            fontFamily: getExportFontStack(exportConfig.fontFamily)
          }}
        />
      )}
    </div>
  )

  return (
    <>
      {/* 首屏加载动画 - 覆盖在主应用上方 */}
      {isLoading && <FirstScreenLoader message={loadingMessage} theme={editorTheme} />}
      
      {/* 主应用内容 - 始终渲染，加载时隐藏 */}
      <AppUiProvider value={appUi}>
        <div 
          className={`app theme-${editorTheme} focus-mode-${focusMode} ${isVirtualKeyboardOpen ? 'keyboard-open' : ''}`}
          style={{ 
            visibility: isLoading ? 'hidden' : 'visible',
            opacity: isLoading ? 0 : 1,
            transition: 'opacity 0.3s ease-out'
          }}
        >
      {showNewFileDialog && (
        <NewFileDialog
          onClose={() => setShowNewFileDialog(false)}
          onConfirm={handleNewFileConfirm}
          rootDirs={rootDirs}
          theme={editorTheme}
        />
      )}

      {showSaveAsDialog && (
        <SaveAsDialog
          onClose={handleSaveAsDialogClose}
          onConfirm={handleSaveAsConfirm}
          rootDirs={rootDirs}
          currentPath={currentPath}
          theme={editorTheme}
          initialFileName={initialFileName}
          isSaveAs={isSaveAsMode}
        />
      )}

      {showSwitchSaveConfirm && (
        <ConfirmDialog
          title="是否需要保存该文件"
          message="当前文件有未保存内容。点击“确定”将进入保存流程，点击“取消”将不保存并直接切换文件。"
          confirmVariant="primary"
          closeOnOverlayClick={false}
          onConfirm={() => {
            void handleSwitchSaveConfirm()
          }}
          onCancel={() => {
            void handleSwitchWithoutSaving()
          }}
          theme={editorTheme}
        />
      )}

      {showUnsupportedFormatDialog && (
        <div className={`dialog-overlay theme-${editorTheme}`} onClick={() => handleUnsupportedFormatChoice('cancel')}>
          <div className="dialog-container confirm-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="选择打开方式">
            <div className="dialog-content confirm-dialog-panel">
              <h2 className="confirm-dialog-title">打开非支持格式文件</h2>
              <p className="confirm-message">此格式不支持预览。请选择打开方式：</p>
              <div className="confirm-dialog-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
                <button className="btn-secondary" onClick={() => void handleUnsupportedFormatChoice('text')}>纯文本</button>
                <button className="btn-secondary" onClick={() => void handleUnsupportedFormatChoice('hex')}>Hex</button>
                <button className="btn-secondary" onClick={() => handleUnsupportedFormatChoice('cancel')}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSaveConfirmDialog && (
        <div className={`dialog-overlay theme-${editorTheme}`} onClick={() => handleSaveConfirmChoice('cancel')}>
          <div className="dialog-container confirm-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={showSaveConfirmDialog.title}>
            <div className="dialog-content confirm-dialog-panel">
              <h2 className="confirm-dialog-title">{showSaveConfirmDialog.title}</h2>
              <p className="confirm-message">{showSaveConfirmDialog.message}</p>
              <div className="confirm-dialog-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
                <button className="btn-primary" onClick={() => void handleSaveConfirmChoice('confirm')}>确认保存</button>
                <button className="btn-secondary" onClick={() => void handleSaveConfirmChoice('saveAsMd')}>另存为 .md</button>
                <button className="btn-secondary" onClick={() => handleSaveConfirmChoice('cancel')}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImageZoomDialog && imageDataRef.current && (
        <ImagePreviewDialog
          image={{
            url: imageDataRef.current,
            filename: currentPath?.split('/').pop() || 'image',
            size: currentFileSize,
            mtime: currentFileMtime
          }}
          onClose={() => setShowImageZoomDialog(false)}
          theme={editorTheme}
        />
      )}

      {confirmDialogState && (
        <ConfirmDialog
          title={confirmDialogState.title}
          message={confirmDialogState.message}
          confirmText={confirmDialogState.confirmText}
          cancelText={confirmDialogState.cancelText}
          confirmVariant={confirmDialogState.confirmVariant}
          closeOnOverlayClick={confirmDialogState.closeOnOverlayClick}
          onConfirm={confirmDialogState.onConfirm}
          onCancel={confirmDialogState.onCancel || closeConfirmDialog}
          theme={editorTheme}
        />
      )}

      {showExportDialog && (
        <ExportDialog
          onClose={() => setShowExportDialog(false)}
          content={content}
          currentPath={currentPath}
          theme={editorTheme}
          previewHtml={previewRef.current?.innerHTML || ''}
          exportConfig={exportConfig}
        />
      )}

      {showSettingsDialog && (
        <SettingsDialog
          onClose={() => updateShowSettingsDialog(false)}
          theme={editorTheme}
          themeMode={themeMode}
          fontSize={editorFontSize}
          lineHeight={editorLineHeight}
          fontFamily={editorFontFamily}
          lineNumbers={editorLineNumbers}
          wordWrap={editorWordWrap}
          syncPreviewWithEditor={syncPreviewWithEditor}
          enableSlashMenuReorder={enableSlashMenuReorder}
          enableFirstScreenLoader={enableFirstScreenLoader}
          appLogoConfig={appLogoConfig}
          fontDownloadState={fontDownloadState}
          remoteFontFamilies={Object.keys(DYNAMIC_FONT_SOURCES)}
          onRequestFontDownload={handleRequestFontDownload}
          onRequestFontClearAndRetry={handleRequestFontClearAndRetry}
          onThemeChange={(t) => toggleEditorTheme(t)}
          onSave={(s) => {
            if (s.fontSize) {
              setEditorFontSize(s.fontSize)
              persistSetting('editorFontSize', s.fontSize)
            }
            if (s.lineHeight) {
              setEditorLineHeight(s.lineHeight)
              persistSetting('editorLineHeight', s.lineHeight)
            }
            if (typeof s.fontFamily === 'string' && s.fontFamily) {
              setEditorFontFamily(s.fontFamily)
              persistSetting('editorFontFamily', s.fontFamily)
            }
            if (typeof s.lineNumbers === 'boolean') {
              setEditorLineNumbers(s.lineNumbers)
              persistSetting('editorLineNumbers', s.lineNumbers)
            }
            if (typeof s.wordWrap === 'boolean') {
              setEditorWordWrap(s.wordWrap)
              persistSetting('editorWordWrap', s.wordWrap)
            }
            if (typeof s.syncPreviewWithEditor === 'boolean') {
              setSyncPreviewWithEditor(s.syncPreviewWithEditor)
              persistSetting('syncPreviewWithEditor', s.syncPreviewWithEditor)
            }
            if (typeof s.enableSlashMenuReorder === 'boolean') {
              setEnableSlashMenuReorder(s.enableSlashMenuReorder)
              persistSetting('enableSlashMenuReorder', s.enableSlashMenuReorder)
            }
            if (typeof s.enableFirstScreenLoader === 'boolean') {
              setEnableFirstScreenLoader(s.enableFirstScreenLoader)
              try {
                localStorage.setItem(FIRST_SCREEN_LOADER_STORAGE_KEY, String(s.enableFirstScreenLoader))
              } catch (e) {
                console.error('[App] 保存首屏加载动画设置到 localStorage 失败:', e)
              }
              persistSetting('enableFirstScreenLoader', s.enableFirstScreenLoader)
            }
            if (s.appLogoConfig) {
              const nextLogoConfig = normalizeLogoConfig(s.appLogoConfig)
              setAppLogoConfig(nextLogoConfig)
              persistSetting('appLogoConfig', nextLogoConfig)
            }
          }}
        />
      )}

      {showMarkdownHelp && (
        <MarkdownHelpDialog
          onClose={() => updateShowMarkdownHelp(false)}
          theme={editorTheme}
        />
      )}

      {showShortcuts && (
        <ShortcutsDialog
          onClose={() => updateShowShortcuts(false)}
          theme={editorTheme}
        />
      )}

      {showAbout && (
        <AboutDialog
          onClose={() => updateShowAbout(false)}
          theme={editorTheme}
        />
      )}

      {showSyncDialog && (
        <SyncDialog
          onClose={() => setShowSyncDialog(false)}
          theme={editorTheme}
          currentPath={currentPath}
          markdown={content}
          renderedHtml={previewRef.current?.innerHTML || ''}
        />
      )}

      {showHistory && (
        <FileHistoryDialog
          filePath={currentPath}
          currentContent={content}
          history={historyVersions}
          onRestore={handleRestoreHistory}
          onDelete={handleDeleteHistory}
          onClose={() => updateShowHistory(false)}
          theme={editorTheme}
        />
      )}

      <header className="toolbar">
        <div className="toolbar-left">
          <button 
            className={`btn-icon toggle-filetree-btn ${showFileTree ? 'filetree-open' : 'filetree-closed'}`}
            onClick={handleToggleFileTree}
            title="切换文件树 (Ctrl+B)"
          >
            <ListCollapse size={20} />
          </button>
          {!isCompactViewport && (
            <>
              <DynamicAppLogo config={appLogoConfig} variant="toolbar" />
              <MenuBar {...menuBarProps} />
            </>
          )}
          {isAdaptiveSinglePaneViewport && (
            <div className="mobile-document-meta">
              <div className="mobile-document-title-row">
                <span className="title mobile-document-title">{currentDocumentName}</span>
                {hasUnsavedChanges() && <span className="unsaved-indicator mobile-unsaved-indicator" aria-label="未保存">*</span>}
              </div>
              <div className="file-path mobile-document-path">{currentDocumentMeta}</div>
            </div>
          )}
        
        </div>
        
        <div className="toolbar-right">
          {isCompactViewport && (
            <MenuBar {...menuBarProps} compact />
          )}
          <button 
            className="btn-secondary toolbar-action-btn toolbar-config-btn" 
            onClick={handleToggleExportConfigPanel}
            title="导出配置"
          >
            {isCompactViewport
              ? (showExportConfigPanel ? '关闭配置' : '配置')
              : (showExportConfigPanel ? '关闭配置' : '导出配置')}
          </button>

          <button 
            className="btn-secondary toolbar-action-btn toolbar-publish-btn" 
            onClick={handlePublish}
            title="发布到多平台"
          >
            <Share2 size={16} />
            发布
          </button>

          <button className="btn-primary toolbar-action-btn toolbar-save-btn" onClick={handleSaveClick} disabled={false}>
            保存
          </button>
        </div>
      </header>

      <main className={`main-content layout-${effectiveLayout} ${isCompactViewport ? 'is-compact-viewport' : ''} ${isAdaptiveSinglePaneViewport ? 'mobile-single-column' : ''} ${isCompactViewport && (showFileTree || isFileTreeClosing) ? 'filetree-overlay-open' : ''}`}>
        {isCompactViewport && (showFileTree || isFileTreeClosing) && (
          <div
            className={`filetree-overlay-backdrop ${isFileTreeClosing ? 'filetree-closing' : ''}`}
            style={{ opacity: isFileTreeClosing ? 0 : 1 - fileTreeSwipeProgress, pointerEvents: isFileTreeClosing ? 'none' : undefined }}
            onClick={handleCloseFileTree}
          />
        )}
        {isCompactViewport && (showFileTree || isFileTreeClosing) && (
          <div
            className={`filetree-close-hit-area ${isFileTreeClosing ? 'filetree-closing' : ''}`}
            style={{ left: `${compactFileTreePanelWidth}px`, pointerEvents: isFileTreeClosing ? 'none' : undefined }}
            onClick={handleCloseFileTree}
          />
        )}
        {isCompactViewport && !showFileTree && !showExportConfigPanel && (
          <div
            className="filetree-edge-swipe-zone"
            onTouchStart={handleEdgeSwipeTouchStart}
            onTouchMove={handleEdgeSwipeTouchMove}
            onTouchEnd={handleEdgeSwipeTouchEnd}
            onTouchCancel={handleEdgeSwipeTouchEnd}
          />
        )}
        {isAdaptiveSinglePaneViewport && mobileActivePane === 'preview' && showMobileOutlinePanel && (
          <div
            className="mobile-outline-overlay-backdrop"
            onClick={() => setShowMobileOutlinePanel(false)}
            aria-hidden="true"
          />
        )}
        {isAdaptiveSinglePaneViewport && mobileActivePane === 'preview' && showMobileOutlinePanel && (
          <div className="mobile-outline-overlay-panel">
            <div className="mobile-outline-panel-header">
              <button
                type="button"
                className="mobile-outline-close-btn"
                onClick={() => setShowMobileOutlinePanel(false)}
                title="关闭大纲"
                aria-label="关闭大纲"
              >
                <Menu size={20} />
              </button>
              <span className="mobile-outline-panel-title">大纲</span>
            </div>
            <div className="mobile-outline-panel-body">
              <OutlinePanel
                content={content}
                onHeadingClick={handleMobileOutlineHeadingClick}
              />
            </div>
          </div>
        )}
        <div className="editor-preview-container">
          {(showFileTree || isFileTreeClosing) && !isCompactViewport && (
            <div
              className={`filetree-side-panel ${isFileTreeClosing ? 'filetree-closing' : ''}`}
              style={{
                width: `${fileTreeWidth + 4}px`,
                flexShrink: 0,
                '--filetree-panel-width': `${fileTreeWidth + 4}px`,
              }}
            >
              <FileTree 
                ref={fileTreeRef}
                onFileSelect={handleFileSelect} 
                currentPath={currentPath}
                favorites={favorites}
                onOpenFavorite={handleOpenFavorite}
                onRemoveFavorite={handleRemoveFavorite}
                onClearFavorites={handleClearFavorites}
                onReorderFavorites={handleReorderFavorites}
                content={content}
                onHeadingClick={handleHeadingClick}
                onVersionRestore={handleVersionRestore}
                style={{ width: `${fileTreeWidth}px`, flexShrink: 0 }}
                theme={editorTheme}
                compactInteractionMode={false}
              />
              <Resizer direction="vertical" onResize={handleFileTreeResize} />
            </div>
          )}
          {(showFileTree || isFileTreeClosing) && isCompactViewport && (
            <div
              className={`filetree-overlay-panel ${isFileTreeClosing ? 'filetree-closing' : ''}`}
              style={{
                width: `min(${fileTreeWidth}px, calc(100vw - 24px))`,
                transform: isFileTreeClosing ? 'translate3d(-100%, 0, 0)' : `translate3d(${fileTreeSwipeOffset}px, 0, 0)`,
                transition: isFileTreeSwipeDragging ? 'none' : (isFileTreeClosing ? 'transform 280ms ease-in' : 'transform 280ms ease-out'),
              }}
              onTouchStart={handleFileTreeTouchStart}
              onTouchMove={handleFileTreeTouchMove}
              onTouchEnd={handleFileTreeTouchEnd}
              onTouchCancel={handleFileTreeTouchEnd}
            >
              <FileTree 
                ref={fileTreeRef}
                onFileSelect={handleFileSelect} 
                currentPath={currentPath}
                favorites={favorites}
                onOpenFavorite={handleOpenFavorite}
                onRemoveFavorite={handleRemoveFavorite}
                onClearFavorites={handleClearFavorites}
                onReorderFavorites={handleReorderFavorites}
                content={content}
                onHeadingClick={handleHeadingClick}
                onVersionRestore={handleVersionRestore}
                style={{ width: `min(${fileTreeWidth}px, 100%)`, flexShrink: 0 }}
                theme={editorTheme}
                compactInteractionMode
              />
            </div>
          )}
          <div
            className={`editor-preview-wrapper${isCompactViewport && (showExportConfigPanel || isExportConfigClosing) ? ' mobile-export-config-split' : ''}`}
            {...(isAdaptiveSinglePaneViewport && !showExportConfigPanel
              ? {
                  onTouchStart: handlePaneSwipeTouchStart,
                  onTouchMove: handlePaneSwipeTouchMove,
                  onTouchEnd: handlePaneSwipeTouchEnd,
                  onTouchCancel: handlePaneSwipeTouchEnd,
                }
              : {})}
          >
            {isAdaptiveSinglePaneViewport && !showExportConfigPanel && (
              <div className="mobile-pane-switcher" role="tablist" aria-label="移动端主视图切换">
                {mobileActivePane === 'preview' && (
                  <button
                    type="button"
                    className="mobile-outline-trigger-btn"
                    onClick={() => setShowMobileOutlinePanel(true)}
                    title="大纲"
                    aria-label="打开大纲"
                  >
                    <PanelLeft size={20} />
                  </button>
                )}
                <button
                  type="button"
                  className={`mobile-pane-tab ${mobileActivePane === 'editor' ? 'active' : ''}`}
                  onClick={() => {
                    setMobileActivePane('editor')
                    setShowMobileOutlinePanel(false)
                  }}
                  aria-selected={mobileActivePane === 'editor'}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className={`mobile-pane-tab ${mobileActivePane === 'preview' ? 'active' : ''}`}
                  onClick={() => setMobileActivePane('preview')}
                  aria-selected={mobileActivePane === 'preview'}
                >
                  预览
                </button>
              </div>
            )}
            {showToolbar && (effectiveLayout === 'vertical' || effectiveLayout === 'editor-only') && (
              <EditorToolbar 
                onInsert={handleToolbarInsert}
                onImageUpload={handleImageUpload}
                onOpenImageManager={() => setShowImageManager(true)}
                onOpenTableInsert={() => setShowTableDialog(true)}
                onOpenAI={() => setAiDialogOpen(true)}
                onShowToast={(message, type) => {
                  setStatus(message)
                  setStatusType(type === 'error' ? 'error' : type === 'success' ? 'success' : 'normal')
                  setTimeout(() => {
                    setStatus('就绪')
                    setStatusType('normal')
                  }, 3000)
                }}
                exportConfig={exportConfig}
                disabled={false}
                compact={isAdaptiveSinglePaneViewport}
                theme={editorTheme}
              />
            )}
            {isCompactViewport && (showExportConfigPanel || isExportConfigClosing) ? (
              <div className="mobile-export-config-split-body">
                <div className="editor-preview-content">
              {(effectiveLayout === 'vertical' || effectiveLayout === 'editor-only') && (
            <>
              <div
                className="editor-pane"
                style={
                  (effectiveLayout === 'vertical')
                    ? {
                        width: `${editorWidth}%`,
                        flex: `0 0 ${editorWidth}%`,
                        minWidth: '120px',
                        minHeight: 0
                      }
                    : { flex: 1, minHeight: 0 }
                }
              >
              <div className="document-title-input-wrap" style={{ transform: `translateY(${-Math.min(editorScrollTop, 86)}px)` }}>
                <input
                  type="text"
                  className="document-title-input"
                  placeholder="添加标题"
                  value={documentTitle}
                  onChange={(e) => setDocumentTitle(e.target.value)}
                />
              </div>
              <Suspense
                fallback={
                  <div className={`editor-loading-placeholder ${editorTheme === 'dark' ? 'theme-dark' : 'theme-light'}`}>
                    编辑器加载中...
                  </div>
                }
              >
                <MonacoEditor
                  height="100%"
                  language={currentPath ? getLanguageFromPath(currentPath) : 'markdown'}
                  theme={editorTheme === 'dark' ? 'vs-dark' : 'vs'}
                  value={content}
                  onChange={handleEditorChange}
                  onMount={handleEditorMount}
                  options={{
                    fontSize: editorFontSize,
                    lineHeight: editorLineHeight,
                    minimap: { enabled: false },
                    wordWrap: editorWordWrap ? 'on' : 'off',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    padding: { top: 86 },
                    fontFamily: getEditorFontStack(editorFontFamily),
                    fontLigatures: true,
                    contextmenu: false, // 禁用默认右键菜单
                    // 行号配置
                    lineNumbers: editorLineNumbers ? 'on' : 'off',
                    lineNumbersMinChars: 2,
                    // 代码折叠配置
                    folding: true,
                    showFoldingControls: 'always',
                    foldingStrategy: 'auto',
                    foldingHighlight: true,
                    foldingMaximumRegions: 5000,
                    unfoldOnClickAfterEndOfLine: true,
                    // 滚动条配置
                    scrollbar: {
                      vertical: 'visible',
                      horizontal: 'visible',
                      useShadows: false,
                      verticalHasArrows: false,
                      horizontalHasArrows: false,
                      verticalScrollbarSize: 10,
                      horizontalScrollbarSize: 10
                    }
                  }}
                />
              </Suspense>
            </div>
            {effectiveLayout === 'vertical' && (
              <Resizer direction="vertical" onResize={handleEditorResize} />
            )}
          </>
        )}

        {(effectiveLayout === 'vertical' || effectiveLayout === 'preview-only') && (
          renderPreviewPane()
        )}
                </div>
                <div className={`mobile-export-config-split-panel ${isExportConfigClosing ? 'export-config-closing' : ''}`}>
                  <ExportConfigPanel
                    config={exportConfig}
                    onChange={handleExportConfigChange}
                    onClose={handleCloseExportConfigPanel}
                    compact
                    fontDownloadState={fontDownloadState}
                    remoteFontFamilies={Object.keys(DYNAMIC_FONT_SOURCES)}
                    onRequestFontDownload={handleRequestFontDownload}
                    onOpenAIWriteTheme={() => {
                      setAiAutoQuickCommandRequest('write-theme')
                      setAiDialogOpen(true)
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="editor-preview-content">
                {(effectiveLayout === 'vertical' || effectiveLayout === 'editor-only') && (
                  <>
                    <div
                      className="editor-pane"
                      style={
                        (effectiveLayout === 'vertical')
                          ? {
                              width: `${editorWidth}%`,
                              flex: `0 0 ${editorWidth}%`,
                              minWidth: '120px',
                              minHeight: 0
                            }
                          : { flex: 1, minHeight: 0 }
                      }
                    >
                      <div className="document-title-input-wrap" style={{ transform: `translateY(${-Math.min(editorScrollTop, 86)}px)` }}>
                        <input
                          type="text"
                          className="document-title-input"
                          placeholder="添加标题"
                          value={documentTitle}
                          onChange={(e) => setDocumentTitle(e.target.value)}
                        />
                      </div>
                      {content === '' && (
                        <div className="editor-firstline-placeholder">输入 / 来选择一个区块</div>
                      )}
                      <Suspense
                        fallback={
                          <div className={`editor-loading-placeholder ${editorTheme === 'dark' ? 'theme-dark' : 'theme-light'}`}>
                            编辑器加载中...
                          </div>
                        }
                      >
                        <MonacoEditor
                          height="100%"
                          language={currentPath ? getLanguageFromPath(currentPath) : 'markdown'}
                          theme={editorTheme === 'dark' ? 'vs-dark' : 'vs'}
                          value={content}
                          onChange={handleEditorChange}
                          onMount={handleEditorMount}
                          options={{
                            fontSize: editorFontSize,
                            lineHeight: editorLineHeight,
                            minimap: { enabled: false },
                            wordWrap: editorWordWrap ? 'on' : 'off',
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            tabSize: 2,
                            padding: { top: 86 },
                            fontFamily: getEditorFontStack(editorFontFamily),
                            fontLigatures: true,
                            contextmenu: false,
                            lineNumbers: editorLineNumbers ? 'on' : 'off',
                            lineNumbersMinChars: 2,
                            folding: true,
                            showFoldingControls: 'always',
                            foldingStrategy: 'auto',
                            foldingHighlight: true,
                            foldingMaximumRegions: 5000,
                            unfoldOnClickAfterEndOfLine: true,
                            scrollbar: {
                              vertical: 'visible',
                              horizontal: 'visible',
                              useShadows: false,
                              verticalHasArrows: false,
                              horizontalHasArrows: false,
                              verticalScrollbarSize: 10,
                              horizontalScrollbarSize: 10
                            }
                          }}
                        />
                      </Suspense>
                    </div>
                    {effectiveLayout === 'vertical' && (
                      <Resizer direction="vertical" onResize={handleEditorResize} />
                    )}
                  </>
                )}

                {(effectiveLayout === 'vertical' || effectiveLayout === 'preview-only') && (
                  renderPreviewPane()
                )}
              </div>
            )}
          </div>

          {/* 导出配置面板 */}
          {(showExportConfigPanel || isExportConfigClosing) && !isCompactViewport && (
            <div
              className={`export-config-side-panel ${isExportConfigClosing ? 'export-config-closing' : ''}`}
              style={{
                width: `${exportConfigPanelWidth + 4}px`,
                flexShrink: 0,
                '--export-config-panel-width': `${exportConfigPanelWidth + 4}px`,
              }}
            >
              <Resizer direction="vertical" onResize={handleExportConfigPanelResize} />
              <ExportConfigPanel
                config={exportConfig}
                onChange={handleExportConfigChange}
                onClose={handleCloseExportConfigPanel}
                style={{ width: `${exportConfigPanelWidth}px` }}
                fontDownloadState={fontDownloadState}
                remoteFontFamilies={Object.keys(DYNAMIC_FONT_SOURCES)}
                onRequestFontDownload={handleRequestFontDownload}
                onOpenAIWriteTheme={() => {
                  setAiAutoQuickCommandRequest('write-theme')
                  setAiDialogOpen(true)
                }}
              />
            </div>
          )}
        </div>

      </main>

      <footer className="statusbar">
        <div className="statusbar-left">
          <button 
            className="statusbar-btn" 
            onClick={() => cycleThemeMode()}
            title={
              themeMode === 'system'
                ? '主题：随系统 (Ctrl+T)'
                : themeMode === 'dark'
                  ? '主题：深色 (Ctrl+T)'
                  : '主题：浅色 (Ctrl+T)'
            }
          >
            {themeMode === 'system'
              ? <SystemThemeIcon size={16} />
              : (editorTheme === 'dark' ? <Moon size={16} /> : <Sun size={16} />)}
          </button>
          <span className={`status-text status-${statusType}`}>{status}</span>
        </div>
        <div className="statusbar-right">
          {!isAdaptiveSinglePaneViewport && (
            <span className="status-info">
              {content.length} 字符 · {content.split('\n').length} 行
            </span>
          )}
          {isAdaptiveSinglePaneViewport && (
            <span className="mobile-status-meta">
              {mobileActivePane === 'editor' ? '编辑' : '预览'} · {content.split('\n').length} 行
            </span>
          )}
          <button 
            className="statusbar-btn"
            onClick={handleCycleViewMode}
            title={isAdaptiveSinglePaneViewport ? (mobileActivePane === 'editor' ? '切换到预览' : '切换到编辑') : `切换布局/专注模式（当前：${currentViewModeLabel}）`}
          >
            {isAdaptiveSinglePaneViewport ? (
              mobileActivePane === 'editor' ? <Eye size={16} /> : <FileText size={16} />
            ) : focusMode === 'split' ? (
              <Scan size={16} />
            ) : focusMode === 'editor-only' ? (
              <FilePenLine size={16} />
            ) : layout === 'vertical' ? (
              <Columns size={16} />
            ) : layout === 'editor-only' ? (
              <FileText size={16} />
            ) : (
              <Eye size={16} />
            )}
          </button>
        </div>
      </footer>

      {showImageManager && (
        <ImageManagerDialog
          isOpen={showImageManager}
          initialTab={imageManagerInitialTab}
          onClose={() => {
            setShowImageManager(false)
            setImageManagerInitialTab(null)
          }}
          onInsertImage={handleImageInsert}
          theme={editorTheme}
          onNotify={(message, type) => {
            setStatus(message)
            setStatusType(type || 'normal')
            setTimeout(() => {
              setStatus('就绪')
              setStatusType('normal')
            }, 2000)
          }}
        />
      )}

      {showTableDialog && (
        <TableInsertDialog
          isOpen={showTableDialog}
          onClose={() => setShowTableDialog(false)}
          onInsert={insertTable}
          theme={editorTheme}
        />
      )}

      {/* Toast 通知容器 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* 右键菜单 */}
      {contextMenu && (
        <EditorContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedText={contextMenu.selectedText}
          selectedImage={contextMenu.selectedImage}
          theme={editorTheme}
          clipboardHasContent={contextMenu.hasClipboard !== false}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* 编辑器斜杠菜单 */}
      <SlashCommandMenu
        visible={slashMenu.visible}
        x={slashMenu.x}
        y={slashMenu.y}
        query={slashMenu.query}
        theme={editorTheme}
        enableReorder={enableSlashMenuReorder}
        commandOrder={slashCommandOrder}
        onCommandOrderChange={(nextOrder) => {
          setSlashCommandOrder(nextOrder)
          persistSetting('slashCommandOrder', nextOrder).catch((e) => {
            console.error('[App] 保存斜杠菜单顺序失败:', e)
          })
        }}
        onResetOrder={(defaultOrder) => {
          setSlashCommandOrder(defaultOrder)
          persistSetting('slashCommandOrder', defaultOrder).catch((e) => {
            console.error('[App] 重置斜杠菜单顺序失败:', e)
          })
        }}
        onSelect={handleSlashCommandSelect}
        onClose={() => setSlashMenu((prev) => ({ ...prev, visible: false }))}
      />

      {/* AI 对话（由工具栏按钮打开） */}
      <AISidebar
        isOpen={aiDialogOpen}
        onClose={() => {
          setAiDialogOpen(false)
          setAiAutoQuickCommandRequest(null)
        }}
        autoQuickCommandId={aiAutoQuickCommandRequest}
        onConsumeAutoQuickCommand={() => setAiAutoQuickCommandRequest(null)}
        getEditorContent={getEditorContent}
        getSelectedText={getSelectedText}
        onInsertImage={handleImageInsert}
        onInsertText={handleInsertText}
        onOpenImageManager={(tab) => {
          setShowImageManager(true)
          setImageManagerInitialTab(tab || null)
        }}
      />
      </div>
      </AppUiProvider>
    </>
  )
}

export default App
