// AI 会话存储工具
// 配置、会话历史、当前会话均存数据库（settings 表）
import { loadSetting, persistSetting } from '../settingsApi'
import { safeParseJsonResponse } from '../fetchUtils'

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } })
  const data = await safeParseJsonResponse(res, { ok: false })
  if (!res.ok || !data?.ok) throw new Error(data?.message || '请求失败')
  return data
}

export const aiStorage = {
  // 保存配置到数据库
  async saveConfig(config) {
    try {
      await persistSetting('aiConfig', config)
      return true
    } catch (error) {
      console.error('保存 AI 配置失败:', error)
      return false
    }
  },

  // 从数据库加载配置
  async loadConfig() {
    try {
      const saved = await loadSetting('aiConfig', null)
      return saved && typeof saved === 'object' ? saved : null
    } catch (error) {
      console.error('加载 AI 配置失败:', error)
      return null
    }
  },

  // 保存当前会话到数据库
  async saveCurrentConversation(messages) {
    try {
      const data = await fetchJson('api/ai/current-conversation', {
        method: 'POST',
        body: JSON.stringify({ messages: Array.isArray(messages) ? messages : [] }),
      })
      return !!data?.ok
    } catch (error) {
      console.error('保存当前会话失败:', error)
      return false
    }
  },

  // 从数据库加载当前会话
  async loadCurrentConversation() {
    try {
      const data = await fetchJson('api/ai/current-conversation')
      return Array.isArray(data?.messages) ? data.messages : []
    } catch (error) {
      console.error('加载当前会话失败:', error)
      return []
    }
  },

  // 保存会话到历史（数据库）
  async saveConversation(id, messages, title) {
    try {
      const conversations = await this.loadAllConversations()
      conversations[id] = {
        id,
        messages,
        title: title || messages[0]?.content?.slice(0, 30) || '新对话',
        timestamp: Date.now(),
      }
      await fetchJson('api/ai/conversations', {
        method: 'POST',
        body: JSON.stringify({ conversations }),
      })
      return true
    } catch (error) {
      console.error('保存会话失败:', error)
      return false
    }
  },

  // 从数据库加载所有会话
  async loadAllConversations() {
    try {
      const data = await fetchJson('api/ai/conversations')
      return data?.conversations && typeof data.conversations === 'object' ? data.conversations : {}
    } catch (error) {
      console.error('加载会话列表失败:', error)
      return {}
    }
  },

  // 加载单个会话
  async loadConversation(id) {
    try {
      const conversations = await this.loadAllConversations()
      return conversations[id] || null
    } catch (error) {
      console.error('加载会话失败:', error)
      return null
    }
  },

  // 删除会话
  async deleteConversation(id) {
    try {
      const conversations = await this.loadAllConversations()
      delete conversations[id]
      await fetchJson('api/ai/conversations', {
        method: 'POST',
        body: JSON.stringify({ conversations }),
      })
      return true
    } catch (error) {
      console.error('删除会话失败:', error)
      return false
    }
  },

  // 清空所有会话
  async clearAllConversations() {
    try {
      await fetchJson('api/ai/conversations', {
        method: 'POST',
        body: JSON.stringify({ conversations: {} }),
      })
      await fetchJson('api/ai/current-conversation', {
        method: 'POST',
        body: JSON.stringify({ messages: [] }),
      })
      return true
    } catch (error) {
      console.error('清空会话失败:', error)
      return false
    }
  },

  // 生成会话 ID
  generateConversationId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
}
