/**
 * CSS 沙箱工具
 * 确保用户输入的 CSS 只作用于 .markdown-body 内部，不污染全局 UI
 */

const SAFE_PREFIX = /^\.markdown-body(\s|\[|:|,|$)/

const scopeSel = (sel) => {
  const s = sel.trim()
  if (!s) return null
  if (SAFE_PREFIX.test(s)) return s
  if (/^(html|head|@import|@charset)/i.test(s)) return null
  if (/^:root$/i.test(s)) return '.markdown-body'
  if (/^body$/i.test(s)) return '.markdown-body'
  if (/^(\*|#app|#root|\.app(?![\w-])|\.editor(?![\w-])|\.panel(?![\w-])|\.toolbar(?![\w-]))/i.test(s)) return null
  return `.markdown-body ${s}`
}

const scopeDecls = (decls) => decls.replace(/@import[^;]+;/gi, '')

const scopeSelGroup = (selGroup) => {
  const sels = selGroup.split(',').map(s => scopeSel(s)).filter(Boolean)
  return sels.length > 0 ? sels.join(', ') : null
}

/**
 * sandbox user CSS to only affect .markdown-body
 * @param {string} css
 * @returns {string}
 */
export function sandboxCSS(css) {
  if (!css || !css.trim()) return ''

  const result = []
  let i = 0
  const len = css.length

  while (i < len) {
    // skip comments
    if (css.slice(i, i + 2) === '/*') {
      const end = css.indexOf('*/', i + 2)
      if (end === -1) break
      result.push(css.slice(i, end + 2))
      i = end + 2
      continue
    }

    const braceOpen = css.indexOf('{', i)
    if (braceOpen === -1) break

    const selPart = css.slice(i, braceOpen).trim()

    let depth = 1
    let j = braceOpen + 1
    while (j < len && depth > 0) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    const blockContent = css.slice(braceOpen + 1, j - 1)
    i = j

    if (selPart.startsWith('@')) {
      if (/^@import|^@charset/i.test(selPart)) continue
      if (/^@keyframes/i.test(selPart)) { result.push(`${selPart} {${blockContent}}`); continue }
      result.push(`${selPart} {\n${sandboxCSS(blockContent)}\n}`)
      continue
    }

    const safeSel = scopeSelGroup(selPart)
    if (!safeSel) continue
    result.push(`${safeSel} {${scopeDecls(blockContent)}}`)
  }

  return result.join('\n')
}

/**
 * sandbox user CSS for a specific element
 * Only rules whose selector matches the element's allowed selector are kept.
 * Plain declarations (no braces) are applied directly to the element selector.
 * @param {string} css - user input CSS
 * @param {string} allowedSelector - the element's canonical selector, e.g. '.markdown-body h1'
 * @returns {string}
 */
export function sandboxCSSForElement(css, allowedSelector) {
  if (!css || !css.trim()) return ''
  const raw = css.trim()

  // No braces: plain declarations, apply directly to element selector
  if (!raw.includes('{')) {
    const decls = raw.split(';').map(s => s.trim()).filter(Boolean)
      .map(p => p.includes('!important') ? p : `${p} !important`)
      .join('; ')
    return decls ? `${allowedSelector} { ${decls} }` : ''
  }

  // Has braces: parse rule blocks and filter by selector
  // Build a set of allowed base tags/selectors from allowedSelector
  // e.g. '.markdown-body h1' -> ['h1', '.markdown-body h1', '.markdown-body h1::after', etc.]
  // Strategy: after sandboxCSS scoping, only keep rules whose selector
  // starts with or equals the allowedSelector (allowing pseudo-elements/classes)
  const sandboxed = sandboxCSS(raw)
  if (!sandboxed) return ''

  const result = []
  let i = 0
  const len = sandboxed.length

  while (i < len) {
    // skip comments
    if (sandboxed.slice(i, i + 2) === '/*') {
      const end = sandboxed.indexOf('*/', i + 2)
      if (end === -1) break
      i = end + 2
      continue
    }

    const braceOpen = sandboxed.indexOf('{', i)
    if (braceOpen === -1) break

    const selPart = sandboxed.slice(i, braceOpen).trim()

    let depth = 1
    let j = braceOpen + 1
    while (j < len && depth > 0) {
      if (sandboxed[j] === '{') depth++
      else if (sandboxed[j] === '}') depth--
      j++
    }
    const blockContent = sandboxed.slice(braceOpen + 1, j - 1)
    i = j

    // @ rules: keep (already sandboxed internally)
    if (selPart.startsWith('@')) {
      result.push(`${selPart} {${blockContent}}`)
      continue
    }

    // Check each selector in the group
    const validSels = selPart.split(',').map(s => s.trim()).filter(s => {
      // allowed: selector equals allowedSelector, or starts with it followed by pseudo/space
      return s === allowedSelector ||
        s.startsWith(allowedSelector + ':') ||
        s.startsWith(allowedSelector + ' ') ||
        s.startsWith(allowedSelector + '[')
    })

    if (validSels.length > 0) {
      result.push(`${validSels.join(', ')} {${blockContent}}`)
    }
  }

  return result.join('\n')
}
