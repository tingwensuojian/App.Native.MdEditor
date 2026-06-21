/**
 * 文件历史版本管理器 V2（API版本）
 * 通过后端API管理历史版本，替代localStorage方案
 */

/**
 * 保存文件历史版本
 * @param {string} filePath - 文件路径
 * @param {string} content - 文件内容
 * @param {string} label - 版本标签
 * @param {boolean} autoSaved - 是否自动保存
 * @returns {Promise<Object>} 保存结果
 */
export async function saveFileHistory(filePath, content, label = '', autoSaved = true) {
  try {
    const response = await fetch('api/file/history/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, content, label, autoSaved })
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.message || '保存历史版本失败')
    }
    
    return data
  } catch (error) {
    console.error('保存历史版本失败:', error)
    throw error
  }
}

/**
 * 获取文件历史版本列表
 * @param {string} filePath - 文件路径
 * @returns {Promise<Array>} 版本列表
 */
export async function getFileHistory(filePath) {
  try {
    const response = await fetch(`api/file/history/list?path=${encodeURIComponent(filePath)}`)
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.message || '获取历史版本列表失败')
    }
    
    return data.versions || []
  } catch (error) {
    console.error('获取历史版本列表失败:', error)
    return []
  }
}

/**
 * 获取指定版本的内容
 * @param {string} filePath - 文件路径
 * @param {number} versionNumber - 版本号
 * @returns {Promise<Object>} 版本信息和内容
 */
export async function getVersionContent(filePath, versionNumber) {
  try {
    const response = await fetch(
      `api/file/history/version?path=${encodeURIComponent(filePath)}&version=${versionNumber}`
    )
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.message || '获取版本内容失败')
    }
    
    return data
  } catch (error) {
    console.error('获取版本内容失败:', error)
    throw error
  }
}

/**
 * 删除指定版本
 * @param {string} filePath - 文件路径
 * @param {number} versionNumber - 版本号
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteVersion(filePath, versionNumber) {
  try {
    const response = await fetch('api/file/history/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, versionNumber })
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.message || '删除版本失败')
    }
    
    return data
  } catch (error) {
    console.error('删除版本失败:', error)
    throw error
  }
}

/**
 * 删除文件的所有历史版本
 * @param {string} filePath - 文件路径
 * @returns {Promise<Object>} 删除结果
 */
export async function clearAllVersions(filePath) {
  try {
    const response = await fetch('api/file/history/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath })
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.message || '清空历史版本失败')
    }
    
    return data
  } catch (error) {
    console.error('清空历史版本失败:', error)
    throw error
  }
}

/**
 * 格式化历史时间显示
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化的时间
 */
export function formatHistoryTime(timestamp) {
  const date = new Date(timestamp)
  const now = new Date()
  
  // 今天
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  
  // 昨天
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  
  // 今年
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleString('zh-CN', { 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }
  
  // 其他年份
  return date.toLocaleString('zh-CN', { 
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化的大小
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 计算相对时间
 * @param {number} timestamp - 时间戳
 * @returns {string} 相对时间描述
 */
export function getRelativeTime(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} 天前`
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)} 周前`
  return `${Math.floor(seconds / 2592000)} 月前`
}

export function calculateDiff(oldText, newText) {
  const oldLines = String(oldText || '').split('\n')
  const newLines = String(newText || '').split('\n')

  let added = 0
  let removed = 0
  let modified = 0

  const maxLen = Math.max(oldLines.length, newLines.length)

  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i]
    const newLine = newLines[i]

    if (oldLine === undefined) {
      added++
    } else if (newLine === undefined) {
      removed++
    } else if (oldLine !== newLine) {
      modified++
    }
  }

  return { added, removed, modified }
}
