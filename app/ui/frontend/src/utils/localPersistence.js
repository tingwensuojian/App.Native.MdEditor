/**
 * 编辑状态持久化工具
 * 使用后端数据库代替 localStorage
 */

import { DEFAULT_APP_STATE, loadAppState, saveAppState } from './settingsApi'

const sanitizePersistedState = (state = {}) => {
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
  if (state.exportConfig && typeof state.exportConfig === 'object') {
    base.exportConfig = state.exportConfig
  }
  return base
}

export const restoreFullState = () => ({ ...DEFAULT_APP_STATE })

export const loadPersistedState = async () => {
  try {
    const state = await loadAppState()
    return sanitizePersistedState(state)
  } catch (error) {
    console.error('Failed to load persisted state:', error)
    return { ...DEFAULT_APP_STATE }
  }
}

export const saveFullState = async (state, options = {}) => {
  try {
    await saveAppState(sanitizePersistedState(state), { ...options, replace: true })
    return true
  } catch (error) {
    console.error('Failed to save persisted state:', error)
    return false
  }
}

export const clearContent = async () => {
  try {
    await saveAppState(
      {
        content: '',
        currentPath: '',
      },
      { replace: false }
    )
    return true
  } catch (error) {
    console.error('Failed to clear persisted content:', error)
    return false
  }
}
