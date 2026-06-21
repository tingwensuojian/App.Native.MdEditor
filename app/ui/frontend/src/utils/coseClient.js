/**
 * COSE 扩展通信客户端
 * 通过 window.postMessage 与 COSE Chrome 扩展通信
 * 协议参考：https://github.com/doocs/cose
 */

const COSE_PAGE = 'cose-page'
const COSE_EXT  = 'cose-extension'
let reqCounter  = 0

/**
 * 发送消息给 COSE 扩展，返回 Promise
 * @param {string} type - 消息类型
 * @param {object|null} payload - 消息负载
 * @param {number} timeoutMs - 超时时间（ms）
 */
function sendMessage(type, payload = null, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const requestId = `cose_${++reqCounter}_${Date.now()}`
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler)
      reject(new Error('COSE_NOT_INSTALLED'))
    }, timeoutMs)

    const handler = (e) => {
      if (e.source !== window) return
      if (!e.data || e.data.source !== COSE_EXT) return
      if (e.data.requestId !== requestId) return
      clearTimeout(timer)
      window.removeEventListener('message', handler)
      if (e.data.error) reject(new Error(e.data.error))
      else resolve(e.data.result)
    }

    window.addEventListener('message', handler)
    window.postMessage({ source: COSE_PAGE, type, requestId, payload }, '*')
  })
}

/**
 * 检测 COSE 扩展是否已安装并注入当前页面
 * @param {number} timeout - 超时时间（ms），建议 2000
 * @returns {Promise<boolean>}
 */
export async function detectCOSE(timeout = 2000) {
  try {
    await sendMessage('GET_PLATFORMS', null, timeout)
    return true
  } catch {
    return false
  }
}

/**
 * 获取所有支持的平台列表
 * @returns {Promise<{platforms: Array}>}
 */
export function getPlatforms() {
  return sendMessage('GET_PLATFORMS')
}

/**
 * 渐进式检测各平台登录状态
 * 每个平台检测完成后立即通过 onUpdate 回调返回结果
 * @param {Array} platforms - 平台列表
 * @param {Function} onUpdate - 单平台更新回调 ({ platformId, result, completed, total })
 * @param {Function} onComplete - 全部完成回调
 * @returns {Promise}
 */
export function checkPlatformsProgressive(platforms, onUpdate, onComplete) {
  const handler = (e) => {
    if (!e.data || e.data.source !== COSE_EXT) return
    if (e.data.type === 'PLATFORM_STATUS_UPDATE') {
      onUpdate?.(e.data)
    } else if (e.data.type === 'PLATFORM_STATUS_COMPLETE') {
      window.removeEventListener('message', handler)
      onComplete?.()
    }
  }
  window.addEventListener('message', handler)
  return sendMessage('CHECK_PLATFORM_STATUS_PROGRESSIVE', { platforms })
}

/**
 * 开始新的同步批次（重置 Tab 分组）
 * 每次批量同步前调用
 */
export function startSyncBatch() {
  return sendMessage('START_SYNC_BATCH')
}

/**
 * 同步内容到指定平台
 * @param {string} platformId - 平台 ID（如 'wechat'、'csdn'）
 * @param {object} content - 文章内容 { title, body, markdown, wechatHtml }
 * @returns {Promise<{success: boolean, message: string, tabId?: number}>}
 */
export function syncToPlatform(platformId, content) {
  return sendMessage('SYNC_TO_PLATFORM', { platformId, content }, 60000)
}
