/**
 * 文章内容打包工具
 * 将编辑器内容打包成 COSE 扩展期望的格式
 */

import { processForWeChat } from './wechatExporter'

/**
 * 打包文章内容为 COSE 期望的格式
 * @param {object} params
 * @param {string} params.title       - 文章标题（文件名去掉 .md 后缀）
 * @param {string} params.markdown    - Markdown 原文（Monaco Editor 内容）
 * @param {string} params.renderedHtml - unified 渲染后的 HTML（previewHtml state）
 * @param {string} [params.primaryColor] - 主题色，用于微信样式处理
 * @returns {Promise<{title, body, markdown, wechatHtml}>}
 */
export async function packContent({ title, markdown, renderedHtml, primaryColor = '#0F4C81' }) {
  const wechatHtml = await processForWeChat(renderedHtml, primaryColor)
  return {
    title: title || '无标题',
    body: renderedHtml,
    markdown,
    wechatHtml,
  }
}

/**
 * 从文件路径提取文章标题
 * 例：'/path/to/我的文章.md' → '我的文章'
 * @param {string} filePath
 * @returns {string}
 */
export function titleFromPath(filePath) {
  if (!filePath) return '无标题'
  const name = filePath.split('/').pop()
  return name.replace(/\.md$/i, '') || '无标题'
}
