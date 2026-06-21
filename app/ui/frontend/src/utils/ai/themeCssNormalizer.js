const THEME_SELECTOR_WHITELIST = new Set([
  'container',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'strong', 'link', 'ul', 'ol', 'li',
  'blockquote', 'codespan', 'code_pre', 'hr', 'image',
])

function stripCodeFences(text) {
  return String(text || '').replace(/```[a-zA-Z]*\n([\s\S]*?)```/g, '$1').trim()
}

function normalizeSingleSelector(raw) {
  let s = raw.trim()
  if (!s) return null

  // 统一空白
  s = s.replace(/\s+/g, ' ').trim()

  // 不支持伪类、组合器、属性选择器
  if (/[>+~:\[]/.test(s)) return null

  // 常见 root 选择器映射到 container
  if (/^(\.markdown-body|\.markdown|#preview-area|\.preview-area)$/i.test(s)) {
    return 'container'
  }

  // 常见「root + 子元素」映射（如 .markdown h1）
  const rootPrefix = /^(?:\.markdown-body|\.markdown|#preview-area|\.preview-area)\s+(.+)$/i
  const rootMatch = s.match(rootPrefix)
  if (rootMatch) {
    s = rootMatch[1].trim()
  }

  // a -> link、img -> image、pre -> code_pre、code -> codespan
  if (/^a$/i.test(s)) s = 'link'
  if (/^img$/i.test(s)) s = 'image'
  if (/^pre$/i.test(s)) s = 'code_pre'
  if (/^code$/i.test(s)) s = 'codespan'

  // 将 .h1/.container 等 class 写法转换为简写选择器
  if (s.startsWith('.')) s = s.slice(1)

  s = s.replace(/\s+/g, ' ').trim()

  return THEME_SELECTOR_WHITELIST.has(s) ? s : null
}

export function normalizeThemeCssOutput(raw = '') {
  const text = stripCodeFences(raw)
  if (!text) return ''

  const blocks = []
  const re = /([^{}]+)\{([\s\S]*?)\}/g
  let m

  while ((m = re.exec(text)) !== null) {
    const selectorPart = (m[1] || '').trim()
    const body = (m[2] || '').trim()
    if (!selectorPart || !body) continue

    const selectors = selectorPart
      .split(',')
      .map((s) => normalizeSingleSelector(s))
      .filter(Boolean)

    if (selectors.length === 0) continue

    // 去掉明显非声明行，保留 CSS 声明
    let bodyLines = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && line.includes(':'))

    // 过滤常见误伤：大范围透明背景重置
    const isMassTransparentReset =
      selectors.length >= 8 &&
      bodyLines.some((line) => /background-color\s*:\s*transparent\s*!important/i.test(line))
    if (isMassTransparentReset) continue

    // 对包含 container 的块，去掉透明背景重置，避免“整体背景不显示”
    if (selectors.includes('container')) {
      bodyLines = bodyLines.filter((line) => !/background(-color)?\s*:\s*transparent\s*!important/i.test(line))
    }

    // 过滤会把标题背景“裁成文字”的声明（与用户“标题背景块”诉求冲突）
    bodyLines = bodyLines.filter((line) => {
      // 禁止把背景裁成文字（会导致“标题背景块”失效）
      if (/background-clip\s*:\s*text\s*;?$/i.test(line)) return false
      if (/text-fill-color\s*:\s*transparent\s*;?$/i.test(line)) return false
      // 禁止文字透明（避免标题文字不可读）
      if (/^color\s*:\s*transparent\s*;?$/i.test(line)) return false
      return true
    })

    if (bodyLines.length === 0) continue

    // 标题元素兜底：如果出现背景但无文字色，补一个深色保证可读性
    const isHeadingBlock = selectors.every((s) => /^h[1-6]$/i.test(s))
    const hasBackground = bodyLines.some((line) => /^background(-color)?\s*:/i.test(line))
    const hasTextColor = bodyLines.some((line) => /^color\s*:/i.test(line))
    if (isHeadingBlock && hasBackground && !hasTextColor) {
      bodyLines.push('color: #1f2937;')
    }

    blocks.push(`${selectors.join(', ')} {\n  ${bodyLines.join('\n  ')}\n}`)
  }

  // 若输出中没有有效 container 背景，补一个温和兜底，确保“整体背景”可见
  const hasContainerBackground = blocks.some((b) =>
    /^container\s*\{/i.test(b) && /background(-color)?\s*:\s*(?!transparent)/i.test(b)
  )
  if (!hasContainerBackground) {
    blocks.unshift('container {\n  background-color: #f7fafc;\n}')
  }

  return blocks.join('\n\n').trim()
}
