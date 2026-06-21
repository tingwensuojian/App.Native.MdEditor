/**
 * rehypeMathSvg.js
 * 将 rehype-katex 渲染的数学公式节点替换为本地 SVG 图片标签。
 * 使用后端 /api/math/svg 接口将 LaTeX 渲染为临时 SVG 文件。
 */

import { visit } from 'unist-util-visit'

/**
 * 从 rehype-katex 渲染后的 hast 节点中提取原始 LaTeX 源码。
 * rehype-katex 会在节点内生成 <annotation encoding="application/x-tex"> 保存原始 LaTeX。
 */
function extractLatexFromNode(node) {
  // 递归查找 annotation 节点
  function findAnnotation(n) {
    if (!n) return null
    if (
      n.type === 'element' &&
      n.tagName === 'annotation' &&
      n.properties &&
      n.properties.encoding === 'application/x-tex'
    ) {
      // 返回文本内容
      if (n.children && n.children.length > 0) {
        return n.children.map(c => c.value || '').join('')
      }
    }
    if (n.children) {
      for (const child of n.children) {
        const result = findAnnotation(child)
        if (result !== null) return result
      }
    }
    return null
  }
  return findAnnotation(node)
}

/**
 * 判断节点是否是块级数学公式（katex-display 包裹）
 */
function isDisplayMath(node) {
  if (!node.properties) return false
  const cls = node.properties.className || node.properties.class || []
  return Array.isArray(cls)
    ? cls.includes('katex-display')
    : String(cls).includes('katex-display')
}

/**
 * 判断节点是否是数学公式节点（包含 katex class）
 */
function isMathNode(node) {
  if (node.type !== 'element') return false
  const cls = node.properties && (node.properties.className || node.properties.class || [])
  if (!cls) return false
  const clsArr = Array.isArray(cls) ? cls : String(cls).split(' ')
  return clsArr.includes('katex') || clsArr.includes('katex-display')
}

/**
 * 调用后端 API 渲染 LaTeX 为 SVG，返回 data URI（内联，不依赖外部链接）
 */
async function renderMathToSvg(latex, display) {
  try {
    const response = await fetch('api/math/svg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latex, display })
    })
    if (!response.ok) return null
    const data = await response.json()
    if (!data.ok) return null
    // 优先使用 base64 内联 data URI，复制到微信时不依赖本地服务地址
    const src = data.svgBase64
      ? 'data:image/svg+xml;base64,' + data.svgBase64
      : data.url
    return { src, width: data.width, height: data.height }
  } catch (e) {
    console.error('[MathSvg] 渲染失败:', e)
    return null
  }
}

/**
 * 收集所有需要处理的数学节点及其信息
 * 返回 [{node, parent, index, latex, display}]
 */
function collectMathNodes(tree) {
  const nodes = []
  visit(tree, 'element', (node, index, parent) => {
    if (!isMathNode(node)) return
    // 避免重复处理 katex 内部的子节点
    // 只处理最外层的 .katex 或 .katex-display
    const cls = node.properties && (node.properties.className || node.properties.class || [])
    const clsArr = Array.isArray(cls) ? cls : String(cls).split(' ')
    if (!clsArr.includes('katex') && !clsArr.includes('katex-display')) return

    // 如果父节点也是 katex-display，跳过内层 katex
    if (parent && parent.type === 'element') {
      const parentCls = parent.properties && (parent.properties.className || parent.properties.class || [])
      const parentClsArr = Array.isArray(parentCls) ? parentCls : String(parentCls).split(' ')
      if (parentClsArr.includes('katex-display')) return
    }

    const display = isDisplayMath(node) || clsArr.includes('katex-display')
    const latex = extractLatexFromNode(node)
    if (latex) {
      nodes.push({ node, parent, index, latex, display })
    }
  })
  return nodes
}

/**
 * rehype 插件：将 KaTeX 渲染节点异步替换为 SVG 图片
 *
 * 使用方式：
 *   .use(rehypeMathSvg)
 *
 * 注意：此插件必须在 rehype-katex 之后使用，且需要 unified 支持异步插件。
 */
export function rehypeMathSvg() {
  return async function transformer(tree) {
    const mathNodes = collectMathNodes(tree)
    console.log('[MathSvg] 检测到数学公式节点数量:', mathNodes.length)
    if (mathNodes.length === 0) return

    // 并发渲染所有数学公式
    await Promise.all(
      mathNodes.map(async ({ node, parent, index, latex, display }) => {
        const result = await renderMathToSvg(latex, display)
        if (!result || !parent) return

        // 构造 <img> 节点替换原数学节点（src 为 data URI，内联 SVG 内容）
        const imgNode = {
          type: 'element',
          tagName: 'img',
          properties: {
            src: result.src,
            alt: latex,
            className: display ? ['math-svg', 'math-svg-display'] : ['math-svg', 'math-svg-inline'],
            style: display
              ? `display:block;margin:1em auto;max-width:100%;height:auto;`
              : `display:inline-block;vertical-align:middle;max-height:1.8em;`,
            width: result.width,
            height: result.height
          },
          children: []
        }

        // 如果是块级公式，包裹在 section 里
        const replacement = display
          ? {
              type: 'element',
              tagName: 'section',
              properties: { className: ['math-svg-block'] },
              children: [imgNode]
            }
          : imgNode

        // 替换原节点
        parent.children.splice(index, 1, replacement)
      })
    )
  }
}

export default rehypeMathSvg
