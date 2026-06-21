/**
 * 编辑区草稿 localStorage 备份
 * 用于刷新/关闭前恢复未保存内容，防抖 2 秒写入
 */

const DRAFT_KEY = 'md-editor-draft'

export function saveEditorDraft(content, currentPath) {
  if (typeof window === 'undefined') return
  try {
    const payload = { content: String(content || ''), currentPath: String(currentPath || '') }
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload))
  } catch (e) {
    console.warn('saveEditorDraft failed:', e)
  }
}

export function loadEditorDraft() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return {
      content: typeof parsed.content === 'string' ? parsed.content : '',
      currentPath: typeof parsed.currentPath === 'string' ? parsed.currentPath : '',
    }
  } catch (e) {
    return null
  }
}

export function clearEditorDraft() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(DRAFT_KEY)
  } catch (e) {
    console.warn('clearEditorDraft failed:', e)
  }
}
