/**
 * 安全解析 fetch 响应为 JSON
 * 当服务端返回 500 或空响应时，response.json() 会抛出 "Unexpected end of JSON input"
 * 使用 text() 先读取再解析，可避免崩溃
 * @param {Response} response - fetch 返回的 Response
 * @param {*} fallback - 解析失败时的默认值
 * @returns {Promise<*>}
 */
export async function safeParseJsonResponse(response, fallback = {}) {
  const text = await response.text()
  if (!text || !text.trim()) return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}
