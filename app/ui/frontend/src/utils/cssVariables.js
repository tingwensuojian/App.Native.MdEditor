/**
 * CSS 变量生成工具
 * 根据配置动态生成 CSS 变量样式
 */

import { sandboxCSS, sandboxCSSForElement } from './sandboxCSS'

/**
 * 生成导出配置相关的 CSS 变量
 * @param {Object} exportConfig - 导出配置对象
 * @returns {string} CSS 变量字符串
 */
export function generateExportConfigCSS(exportConfig) {
  const { captionFormat, wechatLinkToFootnote, themeColor, elementStyles } = exportConfig
  const tc = themeColor || '#3daeff'

  let css = `
/* 导出配置 CSS 变量 */
:root {
  --export-caption-format: ${captionFormat || 'title-first'};
  --export-wechat-link-footnote: ${wechatLinkToFootnote ? '1' : '0'};
  ${themeColor ? `--export-theme-color: ${themeColor};` : ''}
}
`

  // 选择器映射表（与自定义主题使用指南保持一致）
  const selectorMap = {
    h1:         '.markdown-body h1',
    h2:         '.markdown-body h2',
    h3:         '.markdown-body h3',
    h4:         '.markdown-body h4',
    h5:         '.markdown-body h5',
    h6:         '.markdown-body h6',
    p:          '.markdown-body p',
    strong:     '.markdown-body strong, .markdown-body b',
    link:       '.markdown-body a',
    ul:         '.markdown-body ul',
    ol:         '.markdown-body ol',
    blockquote: '.markdown-body blockquote',
    codespan:   '.markdown-body code:not(pre code)',
    code_pre:   '.markdown-body pre',
    hr:         '.markdown-body hr',
    image:      '.markdown-body img',
    bg:         '.markdown-body',
  }

  const es = elementStyles || {}

  Object.entries(selectorMap).forEach(([key, selector]) => {
    const el = es[key] || {}
    const props = []
    const preset = el.preset || 'default'

    // 预设样式（最低优先级）
    if (preset === 'border-bottom') {
      props.push(`border-bottom: 2px solid ${tc}`)
      props.push(`padding-bottom: 0.3em`)
    } else if (preset === 'border-left') {
      props.push(`border-left: 4px solid ${tc}`)
      props.push(`padding-left: 0.8em`)
      props.push(`border-bottom: none`)
    } else if (preset === 'theme-bg') {
      props.push(`display: table`)
      props.push(`padding: 0.3em 1.2em`)
      props.push(`margin: 2em auto 1em`)
      props.push(`color: #fff`)
      props.push(`background: ${tc}`)
      props.push(`border-radius: 6px`)
    } else if (preset === 'indent') {
      props.push(`text-indent: 2em`)
    } else if (preset === 'justify') {
      props.push(`text-align: justify`)
    } else if (preset === 'underline') {
      props.push(`text-decoration: underline`)
    } else if (preset === 'no-underline') {
      props.push(`text-decoration: none`)
    } else if (preset === 'rounded') {
      props.push(`border-radius: 8px`)
    } else if (preset === 'shadow') {
      props.push(`box-shadow: 0 4px 12px rgba(0,0,0,0.15)`)
    } else if (preset === 'center') {
      props.push(`display: block`)
      props.push(`margin-left: auto`)
      props.push(`margin-right: auto`)
    } else if (preset === 'gradient') {
      if (key === 'hr') {
        props.push(`background: linear-gradient(to right, transparent, ${tc}, transparent)`)
        props.push(`height: 1px`)
        props.push(`border: none`)
      } else {
        props.push(`background: linear-gradient(135deg, ${tc}22, ${tc}66)`)
        if (key === 'bg') props.push(`padding: 2rem`)
      }
    } else if (preset === 'dashed') {
      props.push(`border-top: 2px dashed ${tc}`)
      props.push(`background: none`)
    } else if (preset === 'filled') {
      props.push(`background: ${tc}18`)
      props.push(`border-left: 4px solid ${tc}`)
    } else if (preset === 'grid') {
      props.push(`background-image: linear-gradient(rgba(0,0,0,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.05) 1px,transparent 1px)`)
      props.push(`background-size: 20px 20px`)
      if (key === 'bg') props.push(`padding: 2rem`)
    } else if (preset === 'dots') {
      props.push(`background-image: radial-gradient(rgba(0,0,0,0.05) 0.5px,transparent 0.5px)`)
      props.push(`background-size: 8px 8px`)
      if (key === 'bg') props.push(`padding: 2rem`)
    } else if (preset === 'stripe') {
      props.push(`background-image: repeating-linear-gradient(to bottom,transparent,transparent 19px,rgba(0,0,0,0.04) 19px,rgba(0,0,0,0.04) 20px)`)
      if (key === 'bg') props.push(`padding: 2rem`)
    } else if (preset === 'none') {
      props.push(`list-style-type: none`)
    } else if (preset === 'disc') {
      props.push(`list-style-type: disc`)
    } else if (preset === 'decimal') {
      props.push(`list-style-type: decimal`)
    } else if (preset === 'roman') {
      props.push(`list-style-type: upper-roman`)
    } else if (preset === 'dashed') {
      props.push(`border: none`)
      props.push(`border-top: 2px dashed ${tc}`)
      props.push(`height: 0`)
    } else if (preset === 'pill') {
      props.push(`border-radius: 999px`)
      props.push(`padding: 0.1em 0.6em`)
    } else if (preset === 'center') {
      props.push(`display: block`)
      props.push(`margin: 1em auto`)
    } else if (preset === 'disc') {
      props.push(`list-style-type: disc`)
    } else if (preset === 'none') {
      props.push(`list-style-type: none`)
    } else if (preset === 'decimal') {
      props.push(`list-style-type: decimal`)
    } else if (preset === 'roman') {
      props.push(`list-style-type: upper-roman`)
    }

    // 自定义 CSS（优先级最高，自动加 !important）
    const scopedRules = []
    if (el.customCSS && el.customCSS.trim()) {
      const raw = el.customCSS.trim()
      if (raw.includes('{')) {
        // 完整 CSS 规则块：只保留与当前元素选择器匹配的规则
        scopedRules.push(sandboxCSSForElement(raw, selector))
      } else {
        raw.split(';').map(s => s.trim()).filter(Boolean).forEach(p => {
          const line = p.includes('!important') ? p : `${p} !important`
          props.push(line)
        })
      }
    }

    if (props.length === 0 && scopedRules.length === 0 && !el.color) return

    // 颜色（最高优先级，在预设和自定义CSS之后写入）
    if (el.color) {
      if (key === 'bg') props.push(`background-color: ${el.color}`)
      else if (key === 'hr') {
        if (preset === 'dashed') props.push(`border-top-color: ${el.color}`)
        else props.push(`background: ${el.color}`)
      }
      else props.push(`color: ${el.color}`)
    }

    if (props.length === 0 && scopedRules.length === 0) return

    if (props.length > 0) {
      css += `\n/* ${key} */\n${selector} {\n`
      props.forEach(p => {
        const line = p.includes('!important') ? `  ${p};` : `  ${p} !important;`
        css += line + '\n'
      })
      css += `}\n`
    }

    if (scopedRules.length > 0) {
      css += `\n/* ${key} - custom rules */\n`
      css += scopedRules.join('\n') + '\n'
    }
  })

  css += `
/* 图注格式控制 */
.markdown-body figure.image-figure {
  display: block;
  text-align: center;
  margin: 1em 0;
}

.markdown-body figure.image-figure img {
  max-width: 100%;
  height: auto;
}

.markdown-body figure.image-figure figcaption {
  margin-top: 0.5em;
  font-size: 0.9em;
  color: #666;
  text-align: center;
}

/* title-first: 优先显示 title，没有则显示 alt */
.markdown-body[data-caption-format="title-first"] figure.image-figure figcaption::before {
  content: attr(data-title);
}

.markdown-body[data-caption-format="title-first"] figure.image-figure[data-title=""] figcaption::before {
  content: attr(data-alt);
}

/* alt-first: 优先显示 alt，没有则显示 title */
.markdown-body[data-caption-format="alt-first"] figure.image-figure figcaption::before {
  content: attr(data-alt);
}

.markdown-body[data-caption-format="alt-first"] figure.image-figure[data-alt=""] figcaption::before {
  content: attr(data-title);
}

/* title-only: 只显示 title */
.markdown-body[data-caption-format="title-only"] figure.image-figure figcaption::before {
  content: attr(data-title);
}

/* alt-only: 只显示 alt */
.markdown-body[data-caption-format="alt-only"] figure.image-figure figcaption::before {
  content: attr(data-alt);
}

/* no-caption: 不显示图注 */
.markdown-body[data-caption-format="no-caption"] figure.image-figure figcaption {
  display: none;
}

/* 外链转脚注控制 */
.markdown-body[data-wechat-link-footnote="true"] a.external-link {
  text-decoration: none;
}

.markdown-body[data-wechat-link-footnote="true"] a.external-link::after {
  content: "[" attr(data-footnote-index) "]";
  vertical-align: super;
  font-size: 0.8em;
  color: var(--export-theme-color);
}

/* 脚注区域样式 */
.markdown-body .footnotes-section {
  margin-top: 2em;
  padding-top: 1em;
  border-top: 1px solid #e5e7eb;
}

.markdown-body .footnotes-section h3 {
  font-size: 1.2em;
  margin-bottom: 0.5em;
}

.markdown-body .footnotes-list {
  list-style: decimal;
  padding-left: 2em;
}

.markdown-body .footnotes-list li {
  margin-bottom: 0.5em;
  word-break: break-all;
}

/* 当不启用外链转脚注时，隐藏脚注区域 */
.markdown-body[data-wechat-link-footnote="false"] .footnotes-section {
  display: none;
}
  `

  return css.trim()
}


/**
 * 注入 CSS 到页面
 * @param {string} css - CSS 字符串
 * @param {string} id - style 标签的 id
 */
export function injectCSS(css, id = 'export-config-styles') {
  let styleEl = document.getElementById(id)
  
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = id
    document.head.appendChild(styleEl)
    console.log('创建新的 style 标签:', id)
  } else {
    console.log('更新现有的 style 标签:', id)
  }
  
  styleEl.textContent = css
  
  // 验证 style 标签是否在 head 中
  const inHead = document.head.contains(styleEl)
  console.log('style 标签是否在 head 中:', inHead)
  
  // 检查 H1 和 H2 的边框样式
  if (css.includes('border-bottom')) {
    console.log('CSS 包含 border-bottom 样式')
    const h1Match = css.match(/\.markdown-body h1[^{]*\{[^}]*border-bottom:[^;]+;/s)
    const h2Match = css.match(/\.markdown-body h2[^{]*\{[^}]*border-bottom:[^;]+;/s)
    if (h1Match) console.log('H1 边框样式:', h1Match[0])
    if (h2Match) console.log('H2 边框样式:', h2Match[0])
  }
}

/**
 * 应用导出配置样式
 * @param {Object} exportConfig - 导出配置对象
 */
export function applyExportConfigStyles(exportConfig) {
  const css = generateExportConfigCSS(exportConfig)
  injectCSS(css, 'export-config-styles')
  
  // 更新 .markdown-body 的 data 属性
  const outputEl = document.querySelector('.markdown-body')
  
  if (outputEl) {
    outputEl.setAttribute('data-caption-format', exportConfig.captionFormat || 'title-first')
    outputEl.setAttribute('data-wechat-link-footnote', exportConfig.wechatLinkToFootnote ? 'true' : 'false')
    
    // 手动更新图注内容（因为 CSS attr() 可能不工作）
    updateImageCaptions(outputEl, exportConfig.captionFormat || 'title-first')
    
    // 手动更新外链脚注显示
    updateFootnotesDisplay(outputEl, exportConfig.wechatLinkToFootnote)
    
    // 如果有主题色，直接通过 JavaScript 设置 H1 和 H2 的边框颜色
    if (exportConfig.themeColor) {
      const h1Elements = outputEl.querySelectorAll('h1')
      const h2Elements = outputEl.querySelectorAll('h2')
      
      h1Elements.forEach(h1 => {
        // 无论什么样式，只要有主题色就设置边框颜色
        h1.style.borderBottomColor = exportConfig.themeColor
        console.log('直接设置 H1 边框颜色:', exportConfig.themeColor)
      })
      
      h2Elements.forEach(h2 => {
        // 无论什么样式，只要有主题色就设置边框颜色
        h2.style.borderBottomColor = exportConfig.themeColor
        console.log('直接设置 H2 边框颜色:', exportConfig.themeColor)
      })
    } else {
      // 如果没有主题色，清除内联样式，让 CSS 规则生效
      const h1Elements = outputEl.querySelectorAll('h1')
      const h2Elements = outputEl.querySelectorAll('h2')
      
      h1Elements.forEach(h1 => {
        h1.style.borderBottomColor = ''
      })
      
      h2Elements.forEach(h2 => {
        h2.style.borderBottomColor = ''
      })
    }
  }
}

/**
 * 更新图注内容
 * @param {HTMLElement} container - 容器元素
 * @param {string} format - 图注格式
 */
function updateImageCaptions(container, format) {
  const figures = container.querySelectorAll('figure.image-figure')
  console.log('找到的图片数量:', figures.length)
  
  figures.forEach((figure, index) => {
    const alt = figure.getAttribute('data-alt') || ''
    const title = figure.getAttribute('data-title') || ''
    const figcaption = figure.querySelector('figcaption')
    
    if (!figcaption) return
    
    let caption = ''
    switch (format) {
      case 'title-first':
        caption = title || alt
        break
      case 'alt-first':
        caption = alt || title
        break
      case 'title-only':
        caption = title
        break
      case 'alt-only':
        caption = alt
        break
      case 'no-caption':
        caption = ''
        break
      default:
        caption = title || alt
    }
    
    figcaption.textContent = caption
    figcaption.style.display = caption ? 'block' : 'none'
    
    console.log(`图片 ${index + 1} 图注:`, { alt, title, format, caption })
  })
}

/**
 * 更新脚注显示
 * @param {HTMLElement} container - 容器元素
 * @param {boolean} show - 是否显示脚注
 */
function updateFootnotesDisplay(container, show) {
  const footnotesSection = container.querySelector('.footnotes-section')
  if (footnotesSection) {
    footnotesSection.style.display = show ? 'block' : 'none'
    console.log('脚注区域显示:', show)
  }
  
  // 更新链接的脚注标记
  const externalLinks = container.querySelectorAll('a.external-link')
  console.log('找到的外部链接数量:', externalLinks.length)
  
  externalLinks.forEach((link) => {
    // 移除旧的脚注标记
    const existingSup = link.querySelector('sup')
    if (existingSup) {
      existingSup.remove()
    }
    
    if (show) {
      // 添加脚注标记
      const index = link.getAttribute('data-footnote-index')
      if (index) {
        const sup = document.createElement('sup')
        sup.textContent = `[${index}]`
        link.appendChild(sup)
      }
    }
  })
}

