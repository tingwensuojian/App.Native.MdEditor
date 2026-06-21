const FORBIDDEN_PROP_PATTERNS = [
  /^position$/i,
  /^z-index$/i,
  /^content$/i,
  /^behavior$/i,
]

const FORBIDDEN_VALUE_PATTERNS = [
  /javascript:/i,
  /expression\s*\(/i,
  /url\s*\(\s*javascript:/i,
]


export function extractCssDeclarations(raw = '') {
  if (!raw) return ''
  let text = String(raw).trim()
  // 去掉 ```css ``` 包裹
  text = text.replace(/```[a-zA-Z]*\n([\s\S]*?)```/g, '$1').trim()
  // 去掉选择器块（如 h1 { ... }）
  const blockMatch = text.match(/^[^{]+\{([\s\S]*?)\}\s*$/)
  if (blockMatch) text = blockMatch[1]

  // 统一为分号分隔
  const normalized = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')

  return normalized
}

function isForbidden(prop, value) {
  if (FORBIDDEN_PROP_PATTERNS.some((p) => p.test(prop))) return true
  if (FORBIDDEN_VALUE_PATTERNS.some((p) => p.test(value))) return true
  return false
}

function isAllowed(prop) {
  // 放宽策略：除危险属性外，默认允许所有标准 CSS 属性
  // 保留 CSS 变量与浏览器前缀属性
  if (!prop) return false
  return /^-?[_a-zA-Z][-_a-zA-Z0-9]*$/.test(prop)
}

export function sanitizeCssDeclarations(raw = '', elementKey = '') {
  const normalized = extractCssDeclarations(raw)
  if (!normalized) return ''

  const parts = normalized
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)

  const kept = []
  for (const part of parts) {
    const idx = part.indexOf(':')
    if (idx === -1) continue
    const prop = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!prop || !value) continue
    if (isForbidden(prop, value)) continue
    if (!isAllowed(prop, elementKey)) continue
    kept.push(`${prop}: ${value}`)
  }

  return kept.length > 0 ? kept.map((line) => `${line};`).join('\n') : ''
}
