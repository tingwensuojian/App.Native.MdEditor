/**
 * 最近文件管理器
 * 负责记录和管理最近打开的文件列表
 */
import { safeParseJsonResponse } from './fetchUtils'

const MAX_RECENT_FILES = 20

/**
 * 获取最近文件列表
 * @returns {Array} 最近文件列表
 */
export async function getRecentFiles() {
  try {
    const res = await fetch('api/recent-files')
    const data = await safeParseJsonResponse(res, { ok: false })
    if (!res.ok || !data.ok) return []
    return Array.isArray(data.items) ? data.items.slice(0, MAX_RECENT_FILES) : []
  } catch (error) {
    console.error('Failed to load recent files:', error)
    return []
  }
}

/**
 * 添加文件到最近列表
 * @param {string} filePath - 文件路径
 */
export async function addRecentFile(filePath) {
  if (!filePath) return
  try {
    await fetch('api/recent-files/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, name: getFileName(filePath) }),
    })
  } catch (error) {
    console.error('Failed to add recent file:', error)
  }
}

/**
 * 从最近列表中移除文件
 * @param {string} filePath - 文件路径
 */
// 兼容旧接口：现在由服务端自动覆盖/清理，因此这里保持空实现或后续需要可扩展
export function removeRecentFile(filePath) {
  console.warn('removeRecentFile is not implemented for DB-backed recent files.')
}

/**
 * 清空最近文件列表
 */
export async function clearRecentFiles() {
  try {
    await fetch('api/recent-files/clear', { method: 'POST' })
  } catch (error) {
    console.error('Failed to clear recent files:', error)
  }
}

/**
 * 检查文件是否在最近列表中
 * @param {string} filePath - 文件路径
 * @returns {boolean}
 */
export async function isRecentFile(filePath) {
  const files = await getRecentFiles()
  return files.some(item => item.path === filePath)
}

/**
 * 从路径中提取文件名
 * @param {string} filePath - 文件路径
 * @returns {string}
 */
function getFileName(filePath) {
  if (!filePath) return ''
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

/**
 * 格式化时间戳为相对时间
 * @param {number} timestamp - 时间戳
 * @returns {string}
 */
export function formatRelativeTime(timestamp) {
  const now = Date.now()
  const diff = now - timestamp
  
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `${days}天前`
  if (hours > 0) return `${hours}小时前`
  if (minutes > 0) return `${minutes}分钟前`
  return '刚刚'
}

