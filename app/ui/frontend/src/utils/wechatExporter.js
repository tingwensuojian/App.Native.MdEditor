/**
 * 微信公众号格式导出工具
 * 将 Markdown 渲染后的 HTML 处理成适合微信公众号的格式
 */

import juice from 'juice'

/**
 * 处理微信公众号格式
 * @param {string} htmlContent - 渲染后的 HTML 内容
 * @param {string} primaryColor - 主题色
 * @returns {Promise<string>} 处理后的 HTML
 */
export async function processForWeChat(htmlContent, primaryColor = '#0F4C81') {
  console.log('[微信导出] 开始处理...')
  
  // 0. 提前从主题样式中提取 .markdown-body 的背景色（juice 无法内联到自身容器）
  let markdownBodyBg = ''
  let markdownBodyPadding = ''
  const themeStyleEl = document.querySelector('#export-config-styles')
  if (themeStyleEl) {
    const rawCss = themeStyleEl.textContent
    // 逐行扫描，找到 .markdown-body { 块后提取属性
    const lines = rawCss.split('\n')
    let inBlock = false
    let depth = 0
    for (const line of lines) {
      if (!inBlock && line.includes('.markdown-body') && line.includes('{')) {
        inBlock = true
        depth = 1
        continue
      }
      if (inBlock) {
        depth += (line.match(/\{/g) || []).length
        depth -= (line.match(/\}/g) || []).length
        if (depth <= 0) break
        // 提取 background-color
        if (!markdownBodyBg && line.includes('background-color:')) {
          const m = line.match(/background-color:\s*([^;!]+)/)
          if (m) markdownBodyBg = m[1].trim()
        }
        // 提取 padding（非 padding-top/left 等）
        if (!markdownBodyPadding && /^\s*padding\s*:/.test(line)) {
          const m = line.match(/padding:\s*([^;!]+)/)
          if (m) markdownBodyPadding = m[1].trim()
        }
      }
    }
  }
  console.log('[微信导出] 提取到 .markdown-body 背景色:', markdownBodyBg || '(无)')
  console.log('[微信导出] 提取到 .markdown-body padding:', markdownBodyPadding || '(无)')

  // 1. 获取样式
  const styles = await getStyles()
  console.log('[微信导出] 样式获取完成，长度:', styles.length)
  
  // 2. 拼接 HTML + 样式
  let fullHTML = `${styles}${htmlContent}`
  
  // 3. 内联 CSS（使用 juice 库）
  console.log('[微信导出] 开始内联 CSS...')
  fullHTML = juice(fullHTML, {
    inlinePseudoElements: true,
    preserveImportant: true,
    resolveCSSVariables: false
  })
  console.log('[微信导出] CSS 内联完成')
  
  // 4. 创建临时容器处理 HTML
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = fullHTML
  
  // 5. 修改 HTML 结构（调整嵌套列表）
  modifyHtmlStructure(tempDiv)
  
  // 6. 替换 CSS 变量
  let processedHTML = tempDiv.innerHTML
  processedHTML = processedHTML
    // 替换主题色变量
    .replace(/var\(--md-primary-color\)/g, primaryColor)
    .replace(/var\(--blockquote-background\)/g, '#f7f7f7')
    .replace(/hsl\(var\(--foreground\)\)/g, '#3f3f3f')
    // 移除 CSS 变量声明
    .replace(/--md-primary-color:.+?;/g, '')
    .replace(/--md-font-family:.+?;/g, '')
    .replace(/--md-font-size:.+?;/g, '')
    // 将 top 定位转换为 transform（微信不支持 top）
    .replace(/([^-])top:(.*?)em/g, '$1transform: translateY($2em)')
    // 修复 Mermaid 节点标签
    .replace(
      /<span class="nodeLabel"([^>]*)><p[^>]*>(.*?)<\/p><\/span>/g,
      '<span class="nodeLabel"$1>$2</span>'
    )
    .replace(
      /<span class="edgeLabel"([^>]*)><p[^>]*>(.*?)<\/p><\/span>/g,
      '<span class="edgeLabel"$1>$2</span>'
    )
  
  console.log('[微信导出] CSS 变量替换完成')
  
  // 7. 重新设置到临时容器
  tempDiv.innerHTML = processedHTML
  
  // 8. 处理图片尺寸 & 将本地图片转为 base64
  await processImages(tempDiv)
  
  // 8.5. 处理 Mac 代码块（将伪元素转换为真实元素）
  processMacCodeBlock(tempDiv)

  // 8.8. 将数学公式（KaTeX HTML）替换为本地 SVG 内联图片
  await processMathFormulas(tempDiv)

  // 9. 添加空白节点（兼容 SVG 复制）
  const emptyNodeBefore = createEmptyNode()
  const emptyNodeAfter = createEmptyNode()
  tempDiv.insertBefore(emptyNodeBefore, tempDiv.firstChild)
  tempDiv.appendChild(emptyNodeAfter)
  
  // 10. 兼容 Mermaid 图表
  processMermaid(tempDiv)
  
  // 11. 修复 Mermaid 文本颜色
  processedHTML = tempDiv.innerHTML
  processedHTML = processedHTML.replace(
    /<tspan([^>]*)>/g,
    '<tspan$1 style="fill: #333333 !important; color: #333333 !important; stroke: none !important;">'
  )
  
  // 12. 修复 AntV Infographic
  tempDiv.innerHTML = processedHTML
  processInfographic(tempDiv)

  // 13. 将 .markdown-body 背景色包裹整个内容
  // 微信编辑器对 section/div 的背景色会清除，用单格 table 包裹可保留背景色
  if (markdownBodyBg) {
    const padding = markdownBodyPadding || '24px 32px'
    // 把所有内容先收集成字符串
    const innerContent = tempDiv.innerHTML
    // 用 table > tbody > tr > td 结构，微信编辑器能保留 td 的背景色
    const tableWrapper = document.createElement('table')
    tableWrapper.setAttribute('style',
      'width: 100%; border-collapse: collapse; border: none; background: none;'
    )
    const tbody = document.createElement('tbody')
    const tr = document.createElement('tr')
    const td = document.createElement('td')
    td.setAttribute('style',
      `background-color: ${markdownBodyBg}; ` +
      `padding: ${padding}; ` +
      `border: none; ` +
      `vertical-align: top;`
    )
    td.innerHTML = innerContent
    tr.appendChild(td)
    tbody.appendChild(tr)
    tableWrapper.appendChild(tbody)
    // 清空 tempDiv 并放入 table
    tempDiv.innerHTML = ''
    tempDiv.appendChild(tableWrapper)
    console.log('[微信导出] 已用 table 包裹内容，背景色:', markdownBodyBg)
  }

  console.log('[微信导出] 处理完成')
  return tempDiv.innerHTML
}

/**
 * 获取样式（主题样式 + 代码高亮样式）
 */
async function getStyles() {
  let styles = ''
  
  // 获取主题样式（导出配置面板生成的样式）
  const themeStyle = document.querySelector('#export-config-styles')
  if (themeStyle) {
    let cssContent = themeStyle.textContent
    
    console.log('[微信导出] 原始样式长度:', cssContent.length)
    console.log('[微信导出] 原始样式前100字符:', cssContent.substring(0, 100))
    
    // 移除各种作用域前缀，使样式通用化
    // 处理 .markdown-body 作用域
    cssContent = cssContent.replace(/\.markdown-body\s*\{/g, 'body {')
    cssContent = cssContent.replace(/\.markdown-body\s+/g, '')
    cssContent = cssContent.replace(/^\.markdown-body\s*/gm, '')
    
    // 处理 #output 作用域（如果有）
    cssContent = cssContent.replace(/#output\s*\{/g, 'body {')
    cssContent = cssContent.replace(/#output\s+/g, '')
    cssContent = cssContent.replace(/^#output\s*/gm, '')
    
    // 处理 .preview-pane 作用域（如果有）
    cssContent = cssContent.replace(/\.preview-pane\s*\{/g, 'body {')
    cssContent = cssContent.replace(/\.preview-pane\s+/g, '')
    
    styles += `<style>${cssContent}</style>`
    console.log('[微信导出] 主题样式已获取，处理后长度:', cssContent.length)
  } else {
    console.warn('[微信导出] 未找到主题样式元素 #export-config-styles')
    console.warn('[微信导出] 尝试查找所有 style 元素...')
    
    // 尝试获取所有页面样式作为备选
    const allStyles = document.querySelectorAll('style')
    console.warn('[微信导出] 找到', allStyles.length, '个 style 元素')
    allStyles.forEach((style, index) => {
      if (style.id) {
        console.warn(`[微信导出] style[${index}] id="${style.id}"`)
      }
    })
  }
  
  // 获取代码高亮样式
  const codeTheme = document.querySelector('#code-theme-style')
  if (codeTheme && codeTheme.href) {
    try {
      const response = await fetch(codeTheme.href)
      const css = await response.text()
      styles += `<style>${css}</style>`
      console.log('[微信导出] 代码高亮样式已获取，长度:', css.length)
    } catch (err) {
      console.warn('[微信导出] 获取代码高亮样式失败:', err)
    }
  } else {
    console.warn('[微信导出] 未找到代码高亮样式元素 #code-theme-style')
  }
  
  console.log('[微信导出] 总样式长度:', styles.length)
  return styles
}

/**
 * 修改 HTML 结构
 * 将 li > ul/ol 移到 li 后面（微信不支持嵌套列表）
 */
function modifyHtmlStructure(container) {
  const nestedLists = container.querySelectorAll('li > ul, li > ol')
  nestedLists.forEach((list) => {
    const parentLi = list.parentElement
    if (parentLi && parentLi.tagName === 'LI') {
      parentLi.insertAdjacentElement('afterend', list)
    }
  })
  console.log('[微信导出] HTML 结构调整完成，处理了', nestedLists.length, '个嵌套列表')
}

/**
 * 处理图片尺寸，并将本地服务器图片转换为 base64 内联
 * 解决微信编辑器粘贴时的 CORS 跨域问题
 */
async function processImages(container) {
  const images = container.querySelectorAll('img')

  await Promise.all(Array.from(images).map(async (img) => {
    // 处理 width/height 属性
    const width = img.getAttribute('width')
    const height = img.getAttribute('height')
    if (width) {
      img.removeAttribute('width')
      img.style.width = /^\d+$/.test(width) ? `${width}px` : width
    }
    if (height) {
      img.removeAttribute('height')
      img.style.height = /^\d+$/.test(height) ? `${height}px` : height
    }

    // 将本地图片转为 base64，避免微信编辑器粘贴时的 CORS 限制
    const src = img.getAttribute('src')
    if (!src || src.startsWith('data:')) return

    // 判断是否为本地图片（同源相对路径 或 本地局域网绝对地址）
    const isRelative = src.startsWith('/')
    const isLocalAbsolute = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(src)
    const isSameOrigin = src.startsWith(window.location.origin)

    if (!isRelative && !isLocalAbsolute && !isSameOrigin) return

    try {
      let fetchUrl
      if (isRelative || isSameOrigin) {
        // 同源路径直接 fetch，无需代理
        fetchUrl = src
      } else {
        // 本地局域网绝对地址：通过后端代理转发（绕过浏览器 CORS 限制）
        fetchUrl = `api/proxy-image?url=${encodeURIComponent(src)}`
      }
      const resp = await fetch(fetchUrl)
      if (!resp.ok) {
        console.warn('[微信导出] 图片获取失败:', src, resp.status)
        return
      }
      const blob = await resp.blob()
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
      img.src = base64
      console.log('[微信导出] 图片已转为 base64:', src.substring(0, 60))
    } catch (e) {
      console.warn('[微信导出] 图片转换失败:', src, e)
    }
  }))

  console.log('[微信导出] 图片处理完成，处理了', images.length, '张图片')
}

/**
 * 创建空白节点（用于 SVG 兼容）
 */
function createEmptyNode() {
  const node = document.createElement('p')
  node.style.fontSize = '0'
  node.style.lineHeight = '0'
  node.style.margin = '0'
  node.innerHTML = '&nbsp;'
  return node
}

/**
 * 处理 Mac 代码块
 * 将伪元素转换为真实的 DOM 元素
 */
function processMacCodeBlock(container) {
  const codeBlocks = container.querySelectorAll('pre')
  let processedCount = 0
  
  codeBlocks.forEach((pre) => {
    // 检查是否有 Mac 样式（通过检查 padding-top）
    const paddingTop = pre.style.paddingTop || ''
    
    // 如果 padding-top >= 30px，说明启用了 Mac 代码块样式
    if (paddingTop.includes('30px') || paddingTop.includes('3em') || parseInt(paddingTop) >= 30) {
      // 检查是否已经添加了装饰元素
      if (!pre.querySelector('.mac-code-decoration')) {
        // 创建装饰容器
        const decoration = document.createElement('div')
        decoration.className = 'mac-code-decoration'
        decoration.style.cssText = `
          position: absolute;
          top: 10px;
          left: 12px;
          display: flex;
          gap: 8px;
          z-index: 1;
        `
        
        // 创建三个圆点
        const colors = ['#ff5f56', '#ffbd2e', '#27c93f']
        colors.forEach(color => {
          const dot = document.createElement('span')
          dot.style.cssText = `
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: ${color};
          `
          decoration.appendChild(dot)
        })
        
        // 确保 pre 有 position: relative
        if (!pre.style.position || pre.style.position === 'static') {
          pre.style.position = 'relative'
        }
        
        // 确保有 padding-top
        if (!pre.style.paddingTop) {
          pre.style.paddingTop = '30px'
        }
        
        // 插入到 pre 的开头
        pre.insertBefore(decoration, pre.firstChild)
        processedCount++
      }
    }
  })
  
  console.log('[微信导出] Mac 代码块处理完成，处理了', processedCount, '个代码块')
}

/**
 * 处理 Mermaid 图表
 */
function processMermaid(container) {
  const nodes = container.querySelectorAll('.nodeLabel')
  
  nodes.forEach((node) => {
    const parent = node.parentElement
    if (!parent) return
    
    const xmlns = parent.getAttribute('xmlns')
    const style = parent.getAttribute('style')
    
    if (xmlns && style) {
      const section = document.createElement('section')
      section.setAttribute('xmlns', xmlns)
      section.setAttribute('style', style)
      section.innerHTML = parent.innerHTML
      
      const grand = parent.parentElement
      if (grand) {
        grand.innerHTML = ''
        grand.appendChild(section)
      }
    }
  })
  
  console.log('[微信导出] Mermaid 图表处理完成，处理了', nodes.length, '个节点')
}

/**
 * 处理 AntV Infographic
 * 修复 Safari 浏览器中文字异常的问题
 */
function processInfographic(container) {
  const diagrams = container.querySelectorAll('.infographic-diagram')
  
  diagrams.forEach((diagram) => {
    const textElements = diagram.querySelectorAll('text')
    
    textElements.forEach((textElem) => {
      const dominantBaseline = textElem.getAttribute('dominant-baseline')
      
      if (dominantBaseline) {
        const variantMap = {
          'alphabetic': '',
          'central': '0.35em',
          'middle': '0.35em',
          'hanging': '-0.55em',
          'ideographic': '0.18em',
          'text-before-edge': '-0.85em',
          'text-after-edge': '0.15em'
        }
        
        textElem.removeAttribute('dominant-baseline')
        const dy = variantMap[dominantBaseline]
        if (dy) {
          textElem.setAttribute('dy', dy)
        }
      }
    })
  })
  
  console.log('[微信导出] Infographic 处理完成，处理了', diagrams.length, '个图表')
}

/**
 * 处理数学公式：将 KaTeX HTML 替换为 MathJax SVG 或后端 SVG
 * 优先使用 window.MathJax（前端直接渲染，无外部依赖）
 * 降级使用后端 /api/math/svg 接口（base64 内联）
 */
async function processMathFormulas(container) {
  // 找所有最外层 .katex-display（块级）和 .katex（行内）
  const displayNodes = Array.from(container.querySelectorAll('.katex-display'))
  const inlineNodes = Array.from(container.querySelectorAll('.katex')).filter(el =>
    !el.closest('.katex-display')
  )
  const allNodes = [...displayNodes, ...inlineNodes]

  if (allNodes.length === 0) {
    console.log('[微信导出] 未找到数学公式节点')
    return
  }

  console.log('[微信导出] 开始处理数学公式，共', allNodes.length, '个')

  // 优先使用 window.MathJax（index.html 已通过 CDN 加载），直接渲染为内联 SVG
  // 参考 数学公式.md：SVG 随 HTML 复制，微信编辑器原生支持，无需外部链接
  // 等待 MathJax 完全初始化（async 加载，需等待 startup.promise）
  let mj = null
  try {
    if (window.MathJax) {
      // 等待 MathJax startup 完成
      if (window.MathJax.startup && window.MathJax.startup.promise) {
        await window.MathJax.startup.promise
      }
      mj = window.MathJax
    }
  } catch (e) {
    console.warn('[微信导出] MathJax 初始化等待失败:', e)
  }
  const hasMathJax = mj && typeof mj.tex2svg === 'function'
  console.log('[微信导出] MathJax 可用:', hasMathJax)

  for (const node of allNodes) {
    const isDisplay = node.classList.contains('katex-display')
    const annotation = node.querySelector('annotation[encoding="application/x-tex"]')
    if (!annotation) continue
    const latex = annotation.textContent.trim()
    if (!latex) continue

    try {
      if (hasMathJax) {
        // 方案A：MathJax 前端渲染 SVG，直接内联（最佳）
        mj.texReset()
        const mjxContainer = mj.tex2svg(latex, { display: isDisplay })
        const svgEl = mjxContainer && mjxContainer.firstChild
        if (svgEl && svgEl.tagName && svgEl.tagName.toLowerCase() === 'svg') {
          const width = svgEl.style['min-width'] || svgEl.getAttribute('width') || 'auto'
          svgEl.removeAttribute('width')
          svgEl.style.display = 'initial'
          svgEl.style.setProperty('max-width', '300vw', 'important')
          svgEl.style.flexShrink = '0'
          svgEl.style.width = width
          if (isDisplay) {
            const sec = document.createElement('section')
            sec.className = 'katex-block'
            sec.appendChild(svgEl)
            node.parentNode.replaceChild(sec, node)
          } else {
            const span = document.createElement('span')
            span.className = 'katex-inline'
            span.appendChild(svgEl)
            node.parentNode.replaceChild(span, node)
          }
          continue
        }
      }

      // 方案B：降级调用后端 /api/math/svg，base64 内联 data URI
      const response = await fetch('api/math/svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latex, display: isDisplay })
      })
      if (!response.ok) continue
      const data = await response.json()
      if (!data.ok || !data.svgBase64) continue
      const img = document.createElement('img')
      img.src = 'data:image/svg+xml;base64,' + data.svgBase64
      img.alt = latex
      if (isDisplay) {
        img.style.cssText = 'display:block;margin:0.8em auto;max-width:100%;height:auto;'
        const sec = document.createElement('section')
        sec.style.cssText = 'text-align:center;margin:1em 0;'
        sec.appendChild(img)
        node.parentNode.replaceChild(sec, node)
      } else {
        img.style.cssText = 'display:inline-block;vertical-align:middle;max-height:1.8em;margin:0 2px;'
        node.parentNode.replaceChild(img, node)
      }
    } catch (e) {
      console.warn('[微信导出] 数学公式转换失败:', latex.substring(0, 30), e)
    }
  }

  console.log('[微信导出] 数学公式处理完成')
}

/**
 * 复制到剪贴板（微信公众号格式）
 * @param {string} htmlContent - 渲染后的 HTML 内容
 * @param {string} primaryColor - 主题色
 * @returns {Promise<boolean>} 是否成功
 */
export async function copyToWeChat(htmlContent, primaryColor = '#0F4C81') {
  try {
    console.log('[微信导出] 开始复制到剪贴板...')
    
    // 处理 HTML
    const processedHTML = await processForWeChat(htmlContent, primaryColor)
    
    // 提取纯文本
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = processedHTML
    const plainText = tempDiv.textContent || ''
    
    // 写入剪贴板（优先使用现代 API）
    if (window.isSecureContext && navigator.clipboard?.write) {
      try {
        const item = new ClipboardItem({
          'text/html': new Blob([processedHTML], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' })
        })
        await navigator.clipboard.write([item])
        console.log('[微信导出] 使用 ClipboardItem API 复制成功')
        return true
      } catch (err) {
        console.warn('[微信导出] ClipboardItem API 失败，尝试降级方案:', err)
      }
    }
    
    // 降级方案：使用 execCommand
    const success = legacyCopy(processedHTML, plainText)
    console.log('[微信导出] 降级方案复制', success ? '成功' : '失败')
    return success
  } catch (err) {
    console.error('[微信导出] 复制失败:', err)
    return false
  }
}

/**
 * 降级复制方案（使用 execCommand）
 */
function legacyCopy(html, plainText) {
  try {
    const selection = window.getSelection()
    if (!selection) return false
    
    // 创建临时容器
    const tempContainer = document.createElement('div')
    tempContainer.innerHTML = html
    tempContainer.style.position = 'fixed'
    tempContainer.style.left = '-9999px'
    tempContainer.style.top = '0'
    tempContainer.style.opacity = '0'
    tempContainer.style.pointerEvents = 'none'
    tempContainer.style.setProperty('background-color', '#ffffff', 'important')
    tempContainer.style.setProperty('color', '#000000', 'important')
    
    document.body.appendChild(tempContainer)
    
    const htmlElement = document.documentElement
    const wasDark = htmlElement.classList.contains('dark')
    let successful = false
    
    try {
      // 临时移除 dark 类
      if (wasDark) {
        htmlElement.classList.remove('dark')
      }
      
      // 选中临时容器内容
      const range = document.createRange()
      range.selectNodeContents(tempContainer)
      selection.removeAllRanges()
      selection.addRange(range)
      
      // 执行复制
      successful = document.execCommand('copy')
    } catch (err) {
      console.error('[微信导出] execCommand 失败:', err)
      successful = false
    } finally {
      selection.removeAllRanges()
      tempContainer.remove()
      
      // 恢复 dark 类
      if (wasDark) {
        htmlElement.classList.add('dark')
      }
    }
    
    return successful
  } catch (err) {
    console.error('[微信导出] 降级复制失败:', err)
    return false
  }
}

/**
 * 简单的纯文本复制
 */
export async function copyPlainText(text) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {}
  }
  
  // 降级方案
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
