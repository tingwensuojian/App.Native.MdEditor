/**
 * 文件搜索工具
 * 提供文件名模糊搜索和内容搜索功能
 */

import { loadSetting, parseStoredArray, persistSetting } from './settingsApi'

/**
 * 模糊匹配算法
 * @param {string} text - 要搜索的文本
 * @param {string} query - 搜索关键词
 * @returns {boolean} 是否匹配
 */
export function fuzzyMatch(text, query) {
  if (!query) return true
  if (!text) return false
  
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  
  // 简单包含匹配
  if (lowerText.includes(lowerQuery)) {
    return true
  }
  
  // 模糊匹配：查询字符按顺序出现在文本中
  let textIndex = 0
  let queryIndex = 0
  
  while (textIndex < lowerText.length && queryIndex < lowerQuery.length) {
    if (lowerText[textIndex] === lowerQuery[queryIndex]) {
      queryIndex++
    }
    textIndex++
  }
  
  return queryIndex === lowerQuery.length
}

/**
 * 计算匹配分数（用于排序）
 * @param {string} text - 要搜索的文本
 * @param {string} query - 搜索关键词
 * @returns {number} 匹配分数（越高越相关）
 */
export function getMatchScore(text, query) {
  if (!query) return 0
  if (!text) return -1
  
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  
  // 完全匹配
  if (lowerText === lowerQuery) return 1000
  
  // 开头匹配
  if (lowerText.startsWith(lowerQuery)) return 900
  
  // 包含匹配
  const index = lowerText.indexOf(lowerQuery)
  if (index !== -1) {
    // 越靠前分数越高
    return 800 - index
  }
  
  // 模糊匹配
  if (fuzzyMatch(text, query)) {
    return 500
  }
  
  return -1
}

/**
 * 高亮匹配的文本
 * @param {string} text - 原始文本
 * @param {string} query - 搜索关键词
 * @returns {Array} 高亮片段数组
 */
export function highlightMatches(text, query) {
  if (!query || !text) {
    return [{ text, highlight: false }]
  }
  
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)
  
  if (index === -1) {
    return [{ text, highlight: false }]
  }
  
  const result = []
  
  // 匹配前的文本
  if (index > 0) {
    result.push({
      text: text.substring(0, index),
      highlight: false
    })
  }
  
  // 匹配的文本
  result.push({
    text: text.substring(index, index + query.length),
    highlight: true
  })
  
  // 匹配后的文本
  if (index + query.length < text.length) {
    result.push({
      text: text.substring(index + query.length),
      highlight: false
    })
  }
  
  return result
}

/**
 * 搜索文件树
 * @param {Array} nodes - 文件树节点
 * @param {string} query - 搜索关键词
 * @returns {Array} 匹配的节点（带分数）
 */
export function searchFileTree(nodes, query) {
  if (!query) return []
  
  const results = []
  
  function traverse(node, path = '') {
    const fullPath = path ? `${path}/${node.name}` : node.name
    const score = getMatchScore(node.name, query)
    
    if (score > 0) {
      results.push({
        ...node,
        fullPath,
        score
      })
    }
    
    // 递归搜索子节点
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => traverse(child, fullPath))
    }
  }
  
  nodes.forEach(node => traverse(node))
  
  // 按分数排序
  results.sort((a, b) => b.score - a.score)
  
  return results
}

/**
 * 过滤文件树（保留匹配的节点及其父节点）
 * @param {Array} nodes - 文件树节点
 * @param {string} query - 搜索关键词
 * @returns {Array} 过滤后的树
 */
export function filterFileTree(nodes, query) {
  if (!query) return nodes
  
  function filterNode(node) {
    const nameMatches = fuzzyMatch(node.name, query)
    
    // 如果有子节点，递归过滤
    if (node.children && node.children.length > 0) {
      const filteredChildren = node.children
        .map(child => filterNode(child))
        .filter(child => child !== null)
      
      // 如果名称匹配或有匹配的子节点，保留此节点
      if (nameMatches || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren
        }
      }
    }
    
    // 叶子节点：只有名称匹配才保留
    return nameMatches ? node : null
  }
  
  return nodes
    .map(node => filterNode(node))
    .filter(node => node !== null)
}

/**
 * 获取搜索建议
 * @param {Array} recentSearches - 最近搜索历史
 * @param {string} query - 当前输入
 * @returns {Array} 建议列表
 */
export function getSearchSuggestions(recentSearches, query) {
  if (!query) return recentSearches.slice(0, 5)
  
  return recentSearches
    .filter(search => fuzzyMatch(search, query))
    .slice(0, 5)
}

/**
 * 保存搜索历史
 * @param {string} query - 搜索关键词
 */
export async function saveSearchHistory(query) {
  if (!query || query.trim().length === 0) return
  
  try {
    const history = parseStoredArray(await loadSetting('searchHistory', []), [])
    
    // 移除重复项
    const filtered = history.filter(item => item !== query)
    
    // 添加到开头
    filtered.unshift(query)
    
    // 限制数量
    const limited = filtered.slice(0, 20)
    
    await persistSetting('searchHistory', limited)
  } catch (error) {
    console.error('Failed to save search history:', error)
  }
}

/**
 * 获取搜索历史
 * @returns {Array} 搜索历史
 */
export async function getSearchHistory() {
  try {
    return parseStoredArray(await loadSetting('searchHistory', []), [])
  } catch (error) {
    console.error('Failed to load search history:', error)
    return []
  }
}

/**
 * 清空搜索历史
 */
export async function clearSearchHistory() {
  try {
    await persistSetting('searchHistory', [])
  } catch (error) {
    console.error('Failed to clear search history:', error)
  }
}

