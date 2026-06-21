/**
 * 收藏夹管理器
 * 负责管理用户收藏的文件和文件夹
 */
import { safeParseJsonResponse } from './fetchUtils'

const MAX_FAVORITES = 50

/**
 * 获取收藏夹列表
 * @returns {Array} 收藏项列表
 */
export async function getFavorites() {
  try {
    const res = await fetch('api/favorites')
    const data = await safeParseJsonResponse(res, { ok: false })
    if (!res.ok || !data.ok) return []
    return Array.isArray(data.items) ? data.items.slice(0, MAX_FAVORITES) : []
  } catch (error) {
    console.error('Failed to load favorites:', error)
    return []
  }
}

/**
 * 添加到收藏夹
 * @param {string} path - 文件或文件夹路径
 * @param {string} type - 类型: 'file' 或 'directory'
 * @returns {boolean} 是否添加成功
 */
export async function addFavorite(path, type = 'file') {
  if (!path) return false
  try {
    const res = await fetch('api/favorites/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, name: getFileName(path), type }),
    })
    const data = await safeParseJsonResponse(res, { ok: false })
    if (!res.ok || !data.ok) return false
    return !!data.favorited
  } catch (error) {
    console.error('Failed to add favorite:', error)
    return false
  }
}

/**
 * 从收藏夹移除
 * @param {string} path - 文件或文件夹路径
 * @returns {boolean} 是否移除成功
 */
export async function removeFavorite(path) {
  // 直接调用 toggle 接口，后端会根据是否存在决定删除
  try {
    const res = await fetch('api/favorites/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    const data = await safeParseJsonResponse(res, { ok: false })
    if (!res.ok || !data.ok) return false
    return !data.favorited
  } catch (error) {
    console.error('Failed to remove favorite:', error)
    return false
  }
}

/**
 * 检查是否已收藏
 * @param {string} path - 文件或文件夹路径
 * @returns {boolean}
 */
export async function isFavorite(path) {
  const favorites = await getFavorites()
  return favorites.some(item => item.path === path)
}

/**
 * 切换收藏状态
 * @param {string} path - 文件或文件夹路径
 * @param {string} type - 类型: 'file' 或 'directory'
 * @returns {boolean} 新的收藏状态
 */
export async function toggleFavorite(path, type = 'file') {
  try {
    const res = await fetch('api/favorites/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, name: getFileName(path), type }),
    })
    const data = await safeParseJsonResponse(res, { ok: false })
    if (!res.ok || !data.ok) return false
    return !!data.favorited
  } catch (error) {
    console.error('Failed to toggle favorite:', error)
    return false
  }
}

/**
 * 更新收藏项顺序
 * @param {Array} favorites - 新的收藏列表（已排序）
 */
export async function updateFavoritesOrder(favorites) {
  if (!Array.isArray(favorites)) {
    console.warn('updateFavoritesOrder expected an array, received:', favorites)
    return false
  }

  try {
    const items = favorites.map((item, index) => ({
      id: item.id,
      order_index: index,
    }))
    const res = await fetch('api/favorites/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    const data = await safeParseJsonResponse(res, { ok: false })
    if (!res.ok || !data.ok) return false
    return true
  } catch (error) {
    console.error('Failed to update favorites order:', error)
    return false
  }
}

/**
 * 清空收藏夹
 */
export async function clearFavorites() {
  try {
    const res = await fetch('api/favorites/clear', { method: 'POST' })
    const data = await safeParseJsonResponse(res, { ok: false })
    if (!res.ok || !data.ok) return false
    return true
  } catch (error) {
    console.error('Failed to clear favorites:', error)
    return false
  }
}

/**
 * 更新收藏项的路径（用于文件重命名）
 * @param {string} oldPath - 旧路径
 * @param {string} newPath - 新路径
 * @returns {boolean} 是否更新成功
 */
export async function updateFavoritePath(oldPath, newPath) {
  // 目前 favorites 表以 path 为唯一键，重命名时可以简单：先删除旧路径再添加新路径
  try {
    await removeFavorite(oldPath)
    await addFavorite(newPath, 'file')
    return true
  } catch (error) {
    console.error('Failed to update favorite path:', error)
    return false
  }
}

/**
 * 从路径中提取文件名
 * @param {string} path - 文件路径
 * @returns {string}
 */
function getFileName(path) {
  if (!path) return ''
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

/**
 * 获取收藏项的图标类型
 * @param {string} type - 类型: 'file' 或 'directory'
 * @param {string} path - 文件路径
 * @returns {string} 图标类型标识
 */
export function getFavoriteIcon(type, path) {
  if (type === 'directory') {
    return 'folder'
  }
  
  // 根据文件扩展名返回不同图标类型
  if (path.endsWith('.md')) return 'markdown'
  if (path.endsWith('.txt')) return 'text'
  if (path.endsWith('.json')) return 'json'
  
  return 'file'
}
