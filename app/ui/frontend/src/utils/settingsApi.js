import { safeParseJsonResponse } from './fetchUtils'

const SETTINGS_ENDPOINT = 'api/settings'
const APP_STATE_ENDPOINT = 'api/app-state'

export const DEFAULT_APP_STATE = {
  content: '',
  currentPath: '',
  editorWidth: 50,
  fileTreeWidth: 280,
  exportConfigPanelWidth: 280,
  imageCaptionFormat: 'title-first',
  exportConfig: null, // 导出配置（主题等），null 表示使用默认或预设
}

/** 默认导出配置结构（用于校验与合并） */
const DEFAULT_EXPORT_CONFIG_KEYS = [
  'theme', 'customCSS', 'fontFamily', 'fontSize', 'textAlign', 'lineHeight',
  'themeColor', 'elementStyles', 'codeTheme', 'macCodeBlock', 'captionFormat',
  'paragraphIndent', 'paragraphJustify', 'wechatLinkToFootnote', 'includeTOC',
  'headingColor', 'headingStyles', 'bgColor', 'bgCSS'
]

const sanitizeExportConfig = (config) => {
  if (!config || typeof config !== 'object') return null
  const out = {}
  for (const k of DEFAULT_EXPORT_CONFIG_KEYS) {
    const v = config[k]
    if (v !== undefined) out[k] = v
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * 将持久化的 exportConfig 与默认结构合并，供恢复时使用
 * @param {Object} persisted - 持久化的配置（可能不完整）
 * @param {Object} defaults - 默认完整结构
 */
export function mergeExportConfigWithDefaults(persisted, defaults) {
  if (!persisted || typeof persisted !== 'object') return defaults
  const merged = { ...defaults }
  for (const k of Object.keys(persisted)) {
    if (persisted[k] !== undefined && DEFAULT_EXPORT_CONFIG_KEYS.includes(k)) {
      if (k === 'elementStyles' && typeof persisted[k] === 'object') {
        merged[k] = { ...(defaults[k] || {}), ...persisted[k] }
      } else {
        merged[k] = persisted[k]
      }
    }
  }
  return merged
}

export const DEFAULT_IMAGE_MANAGER_SETTINGS = {
  imageCompression: false,
  imageCompressionMode: 'quality',
  imageQuality: 80,
  imageTargetSizePercent: 30,
  imageMaxWidth: 1920,
  imageMaxHeight: 1080,
  maxFileSize: 10,
}

const safeParseJson = (value, fallback) => {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string') return value

  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const sanitizeAppState = (state = {}) => {
  const base = {
    content: typeof state.content === 'string' ? state.content : DEFAULT_APP_STATE.content,
    currentPath: typeof state.currentPath === 'string' ? state.currentPath : DEFAULT_APP_STATE.currentPath,
    editorWidth: typeof state.editorWidth === 'number' ? state.editorWidth : DEFAULT_APP_STATE.editorWidth,
    fileTreeWidth: typeof state.fileTreeWidth === 'number' ? state.fileTreeWidth : DEFAULT_APP_STATE.fileTreeWidth,
    exportConfigPanelWidth:
      typeof state.exportConfigPanelWidth === 'number'
        ? state.exportConfigPanelWidth
        : DEFAULT_APP_STATE.exportConfigPanelWidth,
    imageCaptionFormat:
      typeof state.imageCaptionFormat === 'string'
        ? state.imageCaptionFormat
        : DEFAULT_APP_STATE.imageCaptionFormat,
  }
  const ec = sanitizeExportConfig(state.exportConfig)
  if (ec) base.exportConfig = ec
  return base
}

const sanitizePartialAppState = (state = {}) => {
  const nextState = {}

  if (typeof state.content === 'string') nextState.content = state.content
  if (typeof state.currentPath === 'string') nextState.currentPath = state.currentPath
  if (typeof state.editorWidth === 'number') nextState.editorWidth = state.editorWidth
  if (typeof state.fileTreeWidth === 'number') nextState.fileTreeWidth = state.fileTreeWidth
  if (typeof state.exportConfigPanelWidth === 'number') {
    nextState.exportConfigPanelWidth = state.exportConfigPanelWidth
  }
  if (typeof state.imageCaptionFormat === 'string') {
    nextState.imageCaptionFormat = state.imageCaptionFormat
  }
  const ec = sanitizeExportConfig(state.exportConfig)
  if (ec) nextState.exportConfig = ec

  return nextState
}

export async function fetchAllSettings() {
  const response = await fetch(SETTINGS_ENDPOINT)
  const data = await safeParseJsonResponse(response, { ok: false })

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || '读取设置失败')
  }

  return data.settings || {}
}

export async function persistSetting(key, value) {
  const response = await fetch(SETTINGS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })

  const data = await safeParseJsonResponse(response, { ok: false })
  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || '保存设置失败')
  }

  return true
}

export async function loadSetting(key, fallback = null) {
  const settings = await fetchAllSettings()
  const value = settings[key]
  return value === undefined ? fallback : value
}

export async function loadImageManagerSettings() {
  const value = await loadSetting('imageManagerSettings', DEFAULT_IMAGE_MANAGER_SETTINGS)
  return {
    ...DEFAULT_IMAGE_MANAGER_SETTINGS,
    ...(value && typeof value === 'object' ? value : {}),
  }
}

export async function saveImageManagerSettings(settings) {
  return persistSetting('imageManagerSettings', {
    ...DEFAULT_IMAGE_MANAGER_SETTINGS,
    ...settings,
  })
}

export async function loadAppState() {
  const response = await fetch(APP_STATE_ENDPOINT)
  const data = await safeParseJsonResponse(response, { ok: false })

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || '读取编辑状态失败')
  }

  return {
    ...DEFAULT_APP_STATE,
    ...sanitizeAppState(data.state || {}),
  }
}

export async function saveAppState(state, options = {}) {
  const replace = !!options.replace
  const payload = JSON.stringify({
    state: replace ? sanitizeAppState(state) : sanitizePartialAppState(state),
    replace,
  })

  if (options.keepalive && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([payload], { type: 'application/json' })
    const sent = navigator.sendBeacon(APP_STATE_ENDPOINT, blob)
    if (sent) return true
  }

  const response = await fetch(APP_STATE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: !!options.keepalive,
  })

  const data = await safeParseJsonResponse(response, { ok: false })
  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || '保存编辑状态失败')
  }

  return true
}

export async function patchAppState(partialState, options = {}) {
  return saveAppState(partialState, { ...options, replace: false })
}

export function parseStoredArray(value, fallback = []) {
  const parsed = safeParseJson(value, fallback)
  return Array.isArray(parsed) ? parsed : fallback
}
