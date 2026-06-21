import React, { useState, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { 
  Palette, 
  Type, 
  Code, 
  Code2,
  Download,
  Image as ImageIcon,
  Settings,
  FileText,
  MoreHorizontal,
  Smartphone,
  Save,
  FolderOpen,
  FileText as FileTextIcon,
  Trash2,
  Sparkles,
  Loader2
} from 'lucide-react'
import ElasticSlider from './ElasticSlider'
import CustomDialog from './CustomDialog'
import AnimatedSelect from './AnimatedSelect'
import { getExportFontOptions, getExportFontOptionsWithGroups } from '../constants/fontOptions'
import { AIService } from '../utils/ai/aiService'
import { loadSetting } from '../utils/settingsApi'
import { AI_SERVICES, DEFAULT_CONFIG } from '../constants/aiConfig'
import { buildElementStylePrompt } from '../constants/elementStyleAIPrompts'
import { sanitizeCssDeclarations } from '../utils/elementStyleAiHelpers'
import { normalizeThemeCssOutput } from '../utils/ai/themeCssNormalizer'
import './ExportConfigPanel.css'

/**
 * 标题样式条目 - 含预设下拉 + 自定义 CSS Popover
 */
/**
 * 背景 CSS 白名单过滤
 * 只允许背景相关属性注入，过滤其他属性保证安全
 */
const BG_CSS_WHITELIST = [
  'background',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  'background-attachment',
  'background-clip',
  'background-origin',
  'background-blend-mode',
  'border-radius',
  'box-shadow',
]

const filterBgCSS = (css) => {
  if (!css || !css.trim()) return { valid: '', filtered: [] }
  // 去除可能的 container { } 或 .markdown-body { } 包裹
  let raw = css.trim()
  const blockMatch = raw.match(/^(?:container|[\.\w-]+)\s*\{([\s\S]*)\}\s*$/)
  if (blockMatch) raw = blockMatch[1]

  // 合并多行：把换行后不含冒号的续行拼回上一行
  const normalized = raw
    .split('\n')
    .reduce((acc, line) => {
      const t = line.trim()
      if (!t) return acc
      // 如果这行包含冒号，说明是新属性
      if (t.includes(':') && !t.startsWith('//')) {
        acc.push(t)
      } else {
        // 续行，拼到上一行
        if (acc.length > 0) acc[acc.length - 1] += ' ' + t
        else acc.push(t)
      }
      return acc
    }, [])
    .join('; ')

  const lines = normalized.split(';').map(s => s.trim()).filter(Boolean)
  const valid = []
  const filtered = []
  lines.forEach(line => {
    const prop = line.split(':')[0].trim().toLowerCase()
    if (prop.startsWith('background') || prop === 'border-radius' || prop === 'box-shadow' || prop === 'padding' || prop.startsWith('padding-')) {
      valid.push(line)
    } else {
      filtered.push(prop)
    }
  })
  return { valid: valid.join('; '), filtered }
}

// ─────────────────────────────────────────────────────────────
// 元素样式行 - 统一管理颜色 / 预设 / 自定义CSS
// ─────────────────────────────────────────────────────────────

// 每种元素支持的预设选项
const ELEMENT_PRESETS = {
  h1: [
    { value: 'default',      label: '默认' },
    { value: 'border-bottom', label: '下边框' },
    { value: 'border-left',   label: '左边框' },
    { value: 'theme-bg',      label: '主题背景块' },
  ],
  h2: [
    { value: 'default',      label: '默认' },
    { value: 'border-bottom', label: '下边框' },
    { value: 'border-left',   label: '左边框' },
    { value: 'theme-bg',      label: '主题背景块' },
  ],
  h3: [
    { value: 'default',      label: '默认' },
    { value: 'border-left',   label: '左边框' },
  ],
  h4: [{ value: 'default', label: '默认' }],
  h5: [{ value: 'default', label: '默认' }],
  h6: [{ value: 'default', label: '默认' }],
  p:          [{ value: 'default', label: '默认' }, { value: 'indent', label: '首行缩进' }, { value: 'justify', label: '两端对齐' }],
  strong:     [{ value: 'default', label: '默认' }],
  link:       [{ value: 'default', label: '默认' }, { value: 'underline', label: '下划线' }, { value: 'no-underline', label: '无下划线' }],
  ul:         [{ value: 'default', label: '默认' }, { value: 'none', label: '无符号' }, { value: 'disc', label: '实心圆' }],
  ol:         [{ value: 'default', label: '默认' }, { value: 'decimal', label: '数字' }, { value: 'roman', label: '罗马' }],
  blockquote: [{ value: 'default', label: '默认' }, { value: 'border-left', label: '左边框' }, { value: 'filled', label: '填充背景' }],
  codespan:   [{ value: 'default', label: '默认' }, { value: 'pill', label: '胶囊' }, { value: 'underline', label: '下划线' }],
  code_pre:   [{ value: 'default', label: '默认' }, { value: 'rounded', label: '圆角' }, { value: 'shadow', label: '阴影' }],
  hr:         [{ value: 'default', label: '默认' }, { value: 'gradient', label: '渐变' }, { value: 'dashed', label: '虚线' }],
  image:      [{ value: 'default', label: '默认' }, { value: 'rounded', label: '圆角' }, { value: 'shadow', label: '阴影' }, { value: 'center', label: '居中' }],
  bg:         [{ value: 'default', label: '默认' }, { value: 'grid', label: '网格纹理' }, { value: 'dots', label: '点阵纹理' }, { value: 'stripe', label: '条纹纹理' }, { value: 'gradient', label: '渐变' }],
}

// 预设对应的 CSS 模板（点击预设时填入自定义CSS文本框，方便用户在此基础上修改）
const PRESET_CSS_TEMPLATES = {
  'border-bottom': 'border-bottom: 2px solid var(--theme-color, #4f46e5);\npadding-bottom: 0.3em;',
  'border-left':   'border-left: 4px solid var(--theme-color, #4f46e5);\npadding-left: 0.8em;\nborder-bottom: none;',
  'theme-bg':      'display: table;\npadding: 0.3em 1.2em;\ncolor: #fff;\nbackground: var(--theme-color, #4f46e5);\nborder-radius: 6px;',
  'indent':        'text-indent: 2em;',
  'justify':       'text-align: justify;',
  'underline':     'text-decoration: underline;',
  'no-underline':  'text-decoration: none;',
  'rounded':       'border-radius: 8px;',
  'shadow':        'box-shadow: 0 4px 12px rgba(0,0,0,0.15);',
  'gradient':      'background: linear-gradient(to right, transparent, var(--theme-color, #4f46e5), transparent);\nheight: 1px;\nborder: none;',
  'filled':        'background: color-mix(in srgb, var(--theme-color, #4f46e5) 10%, transparent);\nborder-left: 4px solid var(--theme-color, #4f46e5);',
  'grid':          'background-image: linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px);\nbackground-size: 20px 20px;',
  'dots':          'background-image: radial-gradient(rgba(0,0,0,0.05) 0.5px, transparent 0.5px);\nbackground-size: 8px 8px;',
  'stripe':        'background-image: repeating-linear-gradient(to bottom, transparent, transparent 19px, rgba(0,0,0,0.04) 19px, rgba(0,0,0,0.04) 20px);',
  'dashed':        'border: none;\nborder-top: 2px dashed var(--theme-color, #4f46e5);\nheight: 0;',
  'pill':          'border-radius: 999px;\npadding: 0.1em 0.6em;',
  'none':          'list-style-type: none;',
  'disc':          'list-style-type: disc;',
  'decimal':       'list-style-type: decimal;',
  'roman':         'list-style-type: upper-roman;',
  'center':        'display: block;\nmargin: 1em auto;',
}

// 元素显示名称
const ELEMENT_LABELS = {
  h1: 'H1 一级标题', h2: 'H2 二级标题', h3: 'H3 三级标题',
  h4: 'H4 四级标题', h5: 'H5 五级标题', h6: 'H6 六级标题',
  p: '正文段落', strong: '粗体', link: '链接',
  ul: '无序列表', ol: '有序列表', blockquote: '引用块',
  codespan: '行内代码', code_pre: '代码块', hr: '分割线',
  image: '图片', bg: '背景',
}

const ElementStyleItem = ({ elementKey, value = {}, colors, themeColor, onChange, onGenerateAI, aiGenerating, aiStyleDirection, aiRequirementDirection, onStyleDirectionChange, onRequirementDirectionChange, strictUserIntent, onStrictUserIntentChange }) => {
  const [open, setOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, width: 0 })
  const [draftCSS, setDraftCSS] = useState(value.customCSS || '')
  const rowRef = useRef(null)
  const popoverRef = useRef(null)

  const label = ELEMENT_LABELS[elementKey] || elementKey
  const presets = ELEMENT_PRESETS[elementKey] || [{ value: 'default', label: '默认' }]
  const hasColor = value.color && value.color !== ''
  const hasPreset = value.preset && value.preset !== 'default'
  const hasCustom = value.customCSS && value.customCSS.trim() !== ''
  const hasAny = hasColor || hasPreset || hasCustom

  useEffect(() => { setDraftCSS(value.customCSS || '') }, [value.customCSS])

  const handleRowClick = () => {
    if (!open) {
      const rect = rowRef.current.getBoundingClientRect()
      const popW = Math.max(rect.width, 280)
      const left = Math.min(rect.left, window.innerWidth - popW - 8)
      // 判断上下空间
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const popH = 280
      let top, transform
      if (spaceBelow >= popH || spaceBelow >= spaceAbove) {
        top = rect.bottom + 4
        transform = 'none'
      } else {
        top = rect.top - 4
        transform = 'translateY(-100%)'
      }
      setPopoverPos({ top, left: Math.max(8, left), width: popW, transform })
    }
    setOpen(o => !o)
  }

  useEffect(() => {
    if (!open) return
    const handle = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        rowRef.current && !rowRef.current.contains(e.target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const update = (patch) => onChange({ ...value, ...patch })

  const isLight = document.querySelector('.app.theme-light') !== null
  const popoverClass = `element-style-popover${isLight ? ' theme-light' : ''}`

  const popover = open ? ReactDOM.createPortal(
    <div
      ref={popoverRef}
      className={popoverClass}
      style={{
        position: 'fixed',
        left: popoverPos.left,
        top: popoverPos.top,
        width: popoverPos.width,
        transform: popoverPos.transform,
        zIndex: 99999,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="element-style-popover-header">
        <span>{label}</span>
        <button className="element-style-popover-close" onClick={() => setOpen(false)}>✕</button>
      </div>

      {/* 预设选项（仅当有多于1个预设时显示） */}
      {presets.length > 1 && (
        <div className="element-style-section">
          <div className="element-style-section-label">预设样式</div>
          <div className="element-style-presets">
            {presets.map(p => (
              <button
                key={p.value}
                className={`element-preset-btn ${(value.preset || 'default') === p.value ? 'active' : ''}`}
                onClick={() => {
                  update({ preset: p.value })
                  if (p.value !== 'default' && PRESET_CSS_TEMPLATES[p.value]) {
                    setDraftCSS(PRESET_CSS_TEMPLATES[p.value])
                  } else if (p.value === 'default') {
                    setDraftCSS('')
                  }
                }}
              >{p.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* 颜色选择器（背景元素用特殊标注） */}
      {elementKey !== 'bg' && (
        <div className="element-style-section">
          <div className="element-style-section-label">颜色{hasColor ? <span className="element-style-value-hint"> {value.color}</span> : <span className="element-style-value-hint"> 默认</span>}</div>
          <ColorPicker
            value={value.color || ''}
            colors={colors}
            onChange={(v) => update({ color: v })}
            allowCustom={true}
          />
        </div>
      )}

      {/* 背景颜色（bg 专用） */}
      {elementKey === 'bg' && (
        <div className="element-style-section">
          <div className="element-style-section-label">背景颜色{hasColor ? <span className="element-style-value-hint"> {value.color}</span> : <span className="element-style-value-hint"> 默认</span>}</div>
          <ColorPicker
            value={value.color || ''}
            colors={colors}
            onChange={(v) => update({ color: v })}
            allowCustom={true}
          />
        </div>
      )}

      {/* 自定义 CSS */}
      <div className="element-style-section">
        <div className="element-style-section-label">自定义 CSS <span className="element-style-value-hint">（优先级最高，分号分隔）</span></div>
        <textarea
          className="element-style-textarea"
          value={draftCSS}
          onChange={(e) => {
            setDraftCSS(e.target.value)
            // 用户手动编辑时，自动清除预设状态，以自定义CSS为准
            if (value.preset && value.preset !== 'default') {
              update({ preset: 'default' })
            }
          }}
          placeholder={elementKey.startsWith('h') ? 'font-size: 2em; font-weight: 800;' : 'color: #333; margin: 1em 0;'}
          rows={3}
          spellCheck={false}
        />
        <div className="element-style-section">
          <div className="element-style-section-label">AI 风格方向</div>
          <textarea
            className="element-style-textarea"
            value={aiStyleDirection}
            onChange={(e) => onStyleDirectionChange?.(e.target.value)}
            placeholder="例如：简约科技风、商务稳重、公众号友好"
            rows={2}
            spellCheck={false}
          />
        </div>
        <div className="element-style-section">
          <div className="element-style-section-label">AI 需求方向</div>
          <textarea
            className="element-style-textarea"
            value={aiRequirementDirection}
            onChange={(e) => onRequirementDirectionChange?.(e.target.value)}
            placeholder="例如：增强层级对比、减弱阴影、提高移动端可读性"
            rows={2}
            spellCheck={false}
          />
        </div>
        <div className="element-style-section">
          <label className="toggle-label" style={{ justifyContent: 'space-between' }}>
            <span>严格遵循用户需求</span>
            <input
              type="checkbox"
              className="toggle-checkbox"
              checked={!!strictUserIntent}
              onChange={(e) => onStrictUserIntentChange?.(e.target.checked)}
            />
            <span className="toggle-slider-new"></span>
          </label>
        </div>
        <div className="element-style-actions">
          <button
            className="element-style-btn"
            onClick={async () => {
              if (!onGenerateAI || aiGenerating) return
              const generated = await onGenerateAI({
                elementKey,
                value,
                themeColor,
                currentDraft: draftCSS,
                styleDirection: aiStyleDirection,
                requirementDirection: aiRequirementDirection,
                strictUserIntent,
              })
              if (generated) setDraftCSS(generated)
            }}
            disabled={!!aiGenerating}
            title="AI 生成样式"
          >
            {aiGenerating ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            {aiGenerating ? '生成中' : 'AI'}
          </button>
          <button className="element-style-btn clear" onClick={() => { setDraftCSS(''); update({ customCSS: '' }) }}>清除</button>
          <button className="element-style-btn apply" onClick={() => { update({ customCSS: draftCSS }); setOpen(false) }}>应用</button>
        </div>
      </div>
    </div>,
    document.body
  ) : null

  // 状态摘要文字
  const summary = []
  if (hasColor) summary.push(value.color)
  if (hasPreset) summary.push(presets.find(p => p.value === value.preset)?.label || value.preset)
  if (hasCustom) summary.push('CSS')

  return (
    <div className="element-style-row" ref={rowRef} onClick={handleRowClick}>
      <span className="element-style-label">{label}</span>
      <div className="element-style-summary">
        {hasColor && <span className="element-color-dot" style={{ background: value.color }} />}
        {summary.length > 0
          ? <span className="element-style-summary-text has-value">{summary.join(' · ')}</span>
          : <span className="element-style-summary-text">默认</span>
        }
      </div>
      <span className="element-style-arrow">{open ? '▲' : '▼'}</span>
      {popover}
    </div>
  )
}

// ── 以下是已废弃的旧组件占位，保留行号连续性 ──
const HeadingStyleItem = ({ level, styleValue, customCSS, onStyleChange, onCustomCSSChange }) => {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, width: 0 })
  const [draftCSS, setDraftCSS] = useState(customCSS)
  const rowRef = useRef(null)
  const popoverRef = useRef(null)
  const hasCustom = customCSS && customCSS.trim() !== ''

  // 同步外部值到 draft
  useEffect(() => { setDraftCSS(customCSS) }, [customCSS])

  const handleEditClick = (e) => {
    e.stopPropagation()
    if (!popoverOpen) {
      const rect = rowRef.current.getBoundingClientRect()
      const popW = 280
      // 防止超出窗口右边界
      const left = Math.min(rect.left, window.innerWidth - popW - 8)
      setPopoverPos({ top: rect.top, left: Math.max(8, left), width: popW })
    }
    setPopoverOpen(o => !o)
  }

  useEffect(() => {
    if (!popoverOpen) return
    const handleOutside = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        rowRef.current && !rowRef.current.contains(e.target)
      ) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [popoverOpen])

  const popover = popoverOpen ? ReactDOM.createPortal(
    <div
      ref={popoverRef}
      className={`heading-custom-popover${document.documentElement.classList.contains('theme-light') || document.querySelector('.app.theme-light') ? ' theme-light' : ''}`}
      style={{
        position: 'fixed',
        left: popoverPos.left,
        top: popoverPos.top,
        width: popoverPos.width,
        transform: 'translateY(-100%)',
        zIndex: 99999,
      }}
    >
      <div className="heading-custom-popover-header">
        <span>{level.toUpperCase()} 自定义 CSS</span>
        <span className="heading-custom-hint">属性间用分号分隔</span>
      </div>
      <textarea
        className="heading-custom-textarea"
        value={draftCSS}
        onChange={(e) => setDraftCSS(e.target.value)}
        placeholder={`font-size: 2em; font-weight: 800;`}
        rows={3}
        spellCheck={false}
      />
      <div className="heading-custom-actions">
        <button className="heading-custom-btn clear" onClick={() => { setDraftCSS(''); onCustomCSSChange('') }}>清除</button>
        <button className="heading-custom-btn apply" onClick={() => { onCustomCSSChange(draftCSS); setPopoverOpen(false) }}>应用</button>
      </div>
    </div>,
    document.body
  ) : null

  return (
    <div key={level} className="heading-style-item" ref={rowRef}>
      <span className="heading-level-label">{level.toUpperCase()}</span>
      <button
        className={`heading-custom-edit-btn ${hasCustom ? 'has-custom' : ''}`}
        onClick={handleEditClick}
        title={hasCustom ? `已设置自定义CSS: ${customCSS}` : '添加自定义CSS'}
      ><Code2 size={11} /></button>
      <AnimatedSelect
        value={styleValue}
        onChange={onStyleChange}
        options={[
          { value: 'default', label: '默认' },
          { value: 'border-bottom', label: '下边框' },
          { value: 'border-left', label: '左边框' },
        ]}
        wrapperClassName="heading-style-select-wrap"
      />
      {popover}
    </div>
  )
}

/**
 * 字体颜色表格组件 - 紧凑行式布局
 */
const FontColorRow = ({ label, colorKey, value, colors, onChange }) => {
  const [open, setOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, width: 0 })
  const rowRef = useRef(null)
  const popoverRef = useRef(null)
  const hasValue = value && value !== ''

  const handleClick = () => {
    if (!open) {
      const rect = rowRef.current.getBoundingClientRect()
      const popW = rect.width
      const left = Math.min(rect.left, window.innerWidth - popW - 8)
      setPopoverPos({
        top: rect.top,
        left: Math.max(8, left),
        width: popW,
      })
    }
    setOpen(o => !o)
  }

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handleOutside = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        rowRef.current && !rowRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const popover = open ? ReactDOM.createPortal(
    <div
      ref={popoverRef}
      className={`font-color-popover${document.querySelector('.app.theme-light') ? ' theme-light' : ''}`}
      style={{
        position: 'fixed',
        left: popoverPos.left,
        top: popoverPos.top,
        width: popoverPos.width,
        transform: 'translateY(-100%)',
        zIndex: 99999,
      }}
    >
      <ColorPicker
        value={value || ''}
        colors={colors}
        onChange={(v) => { onChange(v) }}
        allowCustom={true}
      />
    </div>,
    document.body
  ) : null

  return (
    <div className="font-color-row" ref={rowRef}>
      <div className="font-color-row-main" onClick={handleClick}>
        <span className="font-color-label">{label}</span>
        <div className="font-color-preview-wrap">
          <div
            className="font-color-preview"
            style={{
              background: hasValue ? value : 'transparent',
              border: hasValue ? `1px solid ${value}` : '1px dashed #666',
            }}
          />
          <span className="font-color-value">{hasValue ? value : '默认'}</span>
        </div>
        <span className="font-color-arrow">{open ? '▲' : '▼'}</span>
      </div>
      {popover}
    </div>
  )
}

const FontColorTable = ({ config, fontColors, updateConfig }) => {
  const rows = [
    { label: 'H1', key: 'h1Color' },
    { label: 'H2', key: 'h2Color' },
    { label: 'H3', key: 'h3Color' },
    { label: 'H4', key: 'h4Color' },
    { label: 'H5', key: 'h5Color' },
    { label: 'H6', key: 'h6Color' },
    { label: '正文', key: 'bodyColor' },
    { label: '副文', key: 'subColor' },
    { label: '链接', key: 'linkColor' },
  ]
  return (
    <div className="font-color-table">
      {rows.map(row => (
        <FontColorRow
          key={row.key}
          label={row.label}
          colorKey={row.key}
          value={config[row.key] || ''}
          colors={fontColors}
          onChange={(v) => updateConfig(row.key, v)}
        />
      ))}
      <BgCSSRow
        value={config.bgCSS || ''}
        bgColor={config.bgColor || ''}
        colors={fontColors}
        onChange={(v) => updateConfig('bgCSS', v)}
        onColorChange={(v) => updateConfig('bgColor', v)}
      />
    </div>
  )
}

/**
 * 背景自定义 CSS 行组件（含颜色选择器 + CSS 输入框）
 */
const BgCSSRow = ({ value, bgColor, colors, onChange, onColorChange }) => {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [filterHint, setFilterHint] = useState('')
  const rowRef = useRef(null)
  const popoverRef = useRef(null)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, width: 0 })
  const hasCSS = value && value.trim() !== ''
  const hasBgColor = bgColor && bgColor !== ''
  const hasValue = hasCSS || hasBgColor

  useEffect(() => { setDraft(value) }, [value])

  const handleClick = () => {
    if (!open) {
      const rect = rowRef.current.getBoundingClientRect()
      const popW = Math.max(rect.width, 260)
      const left = Math.min(rect.left, window.innerWidth - popW - 8)
      setPopoverPos({ top: rect.top, left: Math.max(8, left), width: popW })
    }
    setOpen(o => !o)
  }

  useEffect(() => {
    if (!open) return
    const handleOutside = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        rowRef.current && !rowRef.current.contains(e.target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const popover = open ? ReactDOM.createPortal(
    <div
      ref={popoverRef}
      className={`heading-custom-popover${document.querySelector('.app.theme-light') ? ' theme-light' : ''}`}
      style={{ position: 'fixed', left: popoverPos.left, top: popoverPos.top, width: popoverPos.width, transform: 'translateY(-100%)', zIndex: 99999 }}
    >
      <div className="heading-custom-popover-header">
        <span>背景设置</span>
        <span className="heading-custom-hint">颜色或自定义 CSS</span>
      </div>
      {/* 颜色选择器 */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>快速选色（纯色背景）</div>
        <ColorPicker
          value={bgColor || ''}
          colors={colors}
          onChange={onColorChange}
          allowCustom={true}
        />
      </div>
      {/* 分隔线 */}
      <div style={{ borderTop: '1px solid rgba(128,128,128,0.2)', margin: '8px 0' }} />
      {/* 自定义 CSS */}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>自定义 CSS（渐变/网格等）</div>
      <textarea
        className="heading-custom-textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={`background-color: #f8f9fa;\nbackground-image: linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px);\nbackground-size: 20px 20px;`}
        rows={3}
        spellCheck={false}
      />
      <div className="heading-custom-actions">
        <button className="heading-custom-btn clear" onClick={() => { setDraft(''); onChange(''); onColorChange(''); setFilterHint('') }}>全部清除</button>
        <button className="heading-custom-btn apply" onClick={() => {
          const { valid, filtered } = filterBgCSS(draft)
          onChange(valid)
          setOpen(false)
          if (filtered.length > 0) {
            setFilterHint(`已过滤 ${filtered.length} 个非背景属性：${filtered.join(', ')}`)
          } else {
            setFilterHint('')
          }
        }}>应用</button>
      </div>
    </div>,
    document.body
  ) : null

  return (
    <div className="font-color-row" ref={rowRef}>
      <div className="font-color-row-main" onClick={handleClick}>
        <span className="font-color-label">背景</span>
        <div className="font-color-preview-wrap">
          {hasBgColor && <div className="font-color-preview" style={{ background: bgColor, border: `1px solid ${bgColor}`, flexShrink: 0 }} />}
          {!hasBgColor && <div className="font-color-preview" style={{ background: 'transparent', border: '1px dashed rgb(102,102,102)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Code2 size={10} style={{ color: hasCSS ? '#4ade80' : '#888' }} /></div>}
          <span className="font-color-value" style={{ color: hasValue ? (hasBgColor ? bgColor : '#4ade80') : undefined }}>
            {hasBgColor ? bgColor : hasCSS ? draft.trim().slice(0, 24) + (draft.trim().length > 24 ? '…' : '') : '默认'}
          </span>
        </div>
        <span className="font-color-arrow">{open ? '▲' : '▼'}</span>
      </div>
      {filterHint && <div style={{ fontSize: 10, color: '#f59e0b', padding: '2px 8px 4px', lineHeight: 1.4 }}>{filterHint}</div>}
      {popover}
    </div>
  )
}
const ConfigSection = ({ title, icon: Icon, children }) => {
  return (
    <div className="config-section">
      <div className="config-section-header">
        <div className="section-title">
          {Icon && <Icon size={16} />}
          <span>{title}</span>
        </div>
      </div>
      <div className="config-section-body">
        {children}
      </div>
    </div>
  )
}

/**
 * 选择器组件
 */
const Select = ({ label, value, options, onChange }) => {
  return (
    <AnimatedSelect
      label={label}
      value={value}
      options={options}
      onChange={onChange}
    />
  )
}

/**
 * 单选按钮组
 */
const RadioGroup = ({ label, value, options, onChange }) => {
  return (
    <div className="config-item">
      {label && <label className="config-label">{label}</label>}
      <div className="radio-group">
        {options.map(opt => (
          <label key={opt.value} className="radio-label">
            <input
              type="radio"
              name={label}
              value={opt.value}
              checked={value === opt.value}
              onChange={(e) => onChange(e.target.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

/**
 * 颜色选择器
 */
const ColorPicker = ({ value, colors, onChange, allowCustom = true }) => {
  const [showCustom, setShowCustom] = useState(false)

  const handleColorClick = (colorValue) => {
    // 如果点击的是当前已选中的颜色（且不是空字符串），则取消选择（设为空字符串）
    if (value === colorValue && colorValue !== '') {
      onChange('')
    } else {
      // 否则选择新颜色（包括选择空字符串）
      onChange(colorValue)
    }
  }

  return (
    <div className="color-picker">
      <div className="color-grid">
        {colors.map(color => {
          const isSelected = value === color.value
          return (
            <div
              key={color.value || 'default'}
              className={`color-item ${isSelected ? 'selected' : ''}`}
              style={{ backgroundColor: color.color }}
              onClick={() => handleColorClick(color.value)}
              title={color.label}
            />
          )
        })}
        {allowCustom && (
          <div
            className="color-item custom"
            onClick={() => setShowCustom(!showCustom)}
            title="自定义颜色"
          >
            <Palette size={16} />
          </div>
        )}
      </div>
      {showCustom && (
        <div className="custom-color-input">
          <input
            type="color"
            value={value || '#000000'}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
          />
        </div>
      )}
    </div>
  )
}

/**
 * 开关组件
 */
const Toggle = ({ label, checked, onChange }) => {
  return (
    <div className="config-item">
      <label className="toggle-label">
        <span>{label}</span>
        <input
          type="checkbox"
          className="toggle-checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-slider-new"></span>
      </label>
    </div>
  )
}

/**
 * 导出配置面板
 */
const ExportConfigPanel = ({
  config,
  onChange,
  onClose,
  compact = false,
  style,
  fontDownloadState = {},
  remoteFontFamilies = [],
  onRequestFontDownload,
  onOpenAIWriteTheme,
}) => {
  // 获取保存的自定义主题（从后端数据库加载）
  const [customThemes, setCustomThemes] = useState({})
  const [aiGeneratingKey, setAiGeneratingKey] = useState('')
  const [aiStyleDirection, setAiStyleDirection] = useState('')
  const [aiRequirementDirection, setAiRequirementDirection] = useState('')
  const [strictUserIntent, setStrictUserIntent] = useState(true)

  useEffect(() => {
    const loadThemes = async () => {
      try {
        const res = await fetch('api/export-themes')
        if (!res.ok) return
        const data = await res.json()
        if (!data || !data.ok || !data.themes) return
        setCustomThemes(data.themes)
      } catch (e) {
        console.error('[ExportConfigPanel] 加载自定义主题失败:', e)
      }
    }
    loadThemes()
  }, [])
  
  // 对话框状态
  const [dialog, setDialog] = useState({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    placeholder: '',
    defaultValue: '',
    onConfirm: () => {}
  })
  
  // 显示对话框
  const showDialog = (options) => {
    setDialog({
      isOpen: true,
      type: options.type || 'alert',
      title: options.title || '',
      message: options.message || '',
      placeholder: options.placeholder || '',
      defaultValue: options.defaultValue || '',
      onConfirm: options.onConfirm || (() => {})
    })
  }
  
  // 关闭对话框
  const closeDialog = () => {
    setDialog({ ...dialog, isOpen: false })
  }
  
  // 主题选项（包括自定义主题）
  const themeOptions = [
    { value: 'default', label: '默认' },
    { value: 'classic', label: '经典' },
    { value: 'elegant', label: '优雅' },
    { value: 'simple', label: '简洁' },
    { value: 'gradient', label: '渐变背景' },
    { value: 'morandi', label: '莫兰迪色系' },
    { value: 'retro-paper', label: '复古纸张' },
    ...Object.keys(customThemes).map(name => ({
      value: `custom:${name}`,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          
          {name}
        </span>
      )
    })),
    { value: 'custom', label: '+ 新建自定义' }
  ]

  // 字体选项（与设置页同源，支持分组）
  const fontOptions = getExportFontOptionsWithGroups() // 使用新的函数

  const withCloudTag = (fontName) => {
    return fontName
  }

  // 统一字体预览函数，与设置对话框保持一致
  const getFontPreviewFamily = (fontValue) => {
    switch (fontValue) {
      case '楷体':
      case 'KaiTi':
        return `'LXGW WenKai', 'KaiTi', 'STKaiti', 'Kaiti SC', serif`
      case '思源黑体':
        return `'Noto Sans SC', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif`
      case '思源宋体':
      case 'Noto Serif SC':
        return `'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif`
      case '霞鹜文楷':
        return `'LXGW WenKai', 'KaiTi', 'STKaiti', 'Kaiti SC', serif`
      case '阿里巴巴普惠体':
        return `'Alibaba PuHuiTi 3.0 55 Regular', 'Alibaba PuHuiTi', 'PingFang SC', 'Microsoft YaHei', sans-serif`
      case 'HarmonyOS Sans SC':
        return `'HarmonyOS Sans SC', 'HarmonyOS Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif`
      case 'Ma Shan Zheng':
        return `'Ma Shan Zheng', 'KaiTi', 'STKaiti', cursive`
      case 'JetBrains Mono':
      case 'Fira Code':
      case 'Source Code Pro':
      case 'IBM Plex Mono':
      case 'Cascadia Code':
      case 'Monaco':
      case 'Consolas':
        return `'${fontValue}', 'Fira Code', 'JetBrains Mono', 'Monaco', 'Consolas', monospace`
      case 'monospace':
        return 'monospace'
      case 'sans-serif':
        return `'Noto Sans SC', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif`
      case 'serif':
        return `'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif`
      default:
        return `'${fontValue}', sans-serif`
    }
  }

  const renderFontOption = (option) => {
    // 跳过分组标题的下载按钮渲染
    if (option.disabled) {
      return <span>{option.label}</span>
    }
    
    const isRemote = remoteFontFamilies.includes(option.value)
    const state = fontDownloadState?.[option.value] || null
    const progress = state?.progress || 0
    const canDownload = isRemote && state?.status !== 'loaded'

    return (
      <>
        <span style={{ fontFamily: getFontPreviewFamily(option.value) }}>{option.label}</span>
        {canDownload && (
          <button
            type="button"
            className="btn-secondary font-download-btn"
            aria-label={state?.status === 'loading' ? `正在下载 ${option.value}` : `下载 ${option.value}`}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onRequestFontDownload?.(option.value)
            }}
            style={{
              height: 24,
              width: 24,
              minWidth: 24,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
            }}
          >
            {state?.status === 'loading' ? (
              <span
                aria-hidden="true"
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: `conic-gradient(var(--primary-color, #3b82f6) ${progress * 3.6}deg, rgba(148,163,184,0.25) 0deg)`,
                  display: 'inline-block',
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    inset: 3,
                    borderRadius: '50%',
                    background: 'var(--panel-bg, #fff)',
                    display: 'block',
                  }}
                />
              </span>
            ) : (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
          </button>
        )}
      </>
    )
  }

  // 字号选项
  const fontSizeOptions = [
    { value: '12px', label: '更小' },
    { value: '14px', label: '稍小' },
    { value: '16px', label: '推荐' },
    { value: '18px', label: '稍大' },
    { value: '20px', label: '更大' }
  ]

  // 字体颜色预设选项（h1-h6、正文、链接共用）
  const fontColors = [
    { value: '', label: '默认（跟随主题）', color: '#999' },
    { value: '#1a1a1a', label: '深墨黑', color: '#1a1a1a' },
    { value: '#24292f', label: 'GitHub 黑', color: '#24292f' },
    { value: '#3d3d3d', label: '炭灰', color: '#3d3d3d' },
    { value: '#5c5c5c', label: '雾灰', color: '#5c5c5c' },
    { value: '#8c8c8c', label: '银灰', color: '#8c8c8c' },
    { value: '#ffffff', label: '纯白', color: '#ffffff', border: true },
    { value: '#0969da', label: '经典蓝', color: '#0969da' },
    { value: '#1677ff', label: 'Ant 蓝', color: '#1677ff' },
    { value: '#0f4c81', label: '深海蓝', color: '#0f4c81' },
    { value: '#52c41a', label: '翡翠绿', color: '#52c41a' },
    { value: '#389e0d', label: '深绿', color: '#389e0d' },
    { value: '#fa8c16', label: '活力橘', color: '#fa8c16' },
    { value: '#eb2f96', label: '玫瑰粉', color: '#eb2f96' },
    { value: '#9254de', label: '薰衣草紫', color: '#9254de' },
    { value: '#9f86c0', label: '莫兰迪紫', color: '#9f86c0' },
    { value: '#c0392b', label: '中国红', color: '#c0392b' },
    { value: '#d4a017', label: '金色', color: '#d4a017' },
  ]

  // 主题色选项
  const themeColors = [
    { value: '', label: '默认（不使用主题色）', color: '#999' },
    { value: '#3daeff', label: '经典蓝', color: '#3daeff' },
    { value: '#52c41a', label: '翡翠绿', color: '#52c41a' },
    { value: '#fa8c16', label: '活力橘', color: '#fa8c16' },
    { value: '#fadb14', label: '柠檬黄', color: '#fadb14' },
    { value: '#9254de', label: '薰衣草紫', color: '#9254de' },
    { value: '#13c2c2', label: '天空蓝', color: '#13c2c2' },
    { value: '#eb2f96', label: '玫瑰金', color: '#eb2f96' },
    { value: '#7cb305', label: '橄榄绿', color: '#7cb305' },
    { value: '#434343', label: '石墨黑', color: '#434343' },
    { value: '#8c8c8c', label: '雾烟灰', color: '#8c8c8c' },
    { value: '#f759ab', label: '樱花粉', color: '#f759ab' }
  ]

  // 标题层级选项
  const headingLevelOptions = [
    { value: 'h2', label: '二级标题' },
    { value: 'h3', label: '三级标题' },
    { value: 'h4', label: '四级标题' }
  ]

  // 代码块主题选项
  const codeThemeOptions = [
    { value: 'github', label: 'GitHub Light' },
    { value: 'github-dark', label: 'GitHub Dark' },
    { value: 'vs', label: 'VS Code Light' },
    { value: 'vs2015', label: 'VS Code Dark' },
    { value: 'dracula', label: 'Dracula' },
    { value: 'atom-one-dark', label: 'One Dark' },
    { value: 'solarized-light', label: 'Solarized Light' },
    { value: 'solarized-dark', label: 'Solarized Dark' },
    { value: 'nord', label: 'Nord' },
    { value: 'monokai', label: 'Monokai' },
    { value: 'material', label: 'Material' }
  ]

  // 图注格式选项
  const captionFormatOptions = [
    { value: 'title-first', label: 'title 优先' },
    { value: 'alt-first', label: 'alt 优先' },
    { value: 'title-only', label: '只显示 title' },
    { value: 'alt-only', label: '只显示 alt' },
    { value: 'no-caption', label: '不显示' }
  ]

  const updateConfig = (key, value) => {
    onChange({
      ...config,
      [key]: value
    })
  }

  const getEffectiveAiConfig = async () => {
    const saved = await loadSetting('aiConfig', null)
    const merged = {
      ...DEFAULT_CONFIG,
      ...(saved && typeof saved === 'object' ? saved : {}),
    }

    const service = AI_SERVICES.find((s) => s.value === merged.type)
    const apiKey = merged.apiKeys?.[merged.type] ?? merged.apiKey ?? ''
    const endpoint = merged.endpoints?.[merged.type] ?? service?.endpoint ?? merged.endpoint ?? ''

    return {
      ...merged,
      apiKey,
      endpoint,
      model: merged.model || DEFAULT_CONFIG.model,
      temperature: merged.temperature ?? 0.6,
      maxTokens: merged.maxTokens ?? 1024,
    }
  }

  const generateElementStyleWithAI = async ({ elementKey, value, themeColor, currentDraft, styleDirection, requirementDirection }) => {
    setAiGeneratingKey(elementKey)
    try {
      const aiConfig = await getEffectiveAiConfig()
      const aiService = new AIService(aiConfig)
      const prompt = buildElementStylePrompt({
        elementKey,
        themeColor,
        preset: value?.preset,
        currentColor: value?.color,
        currentCustomCSS: currentDraft || value?.customCSS,
        styleDirection,
        requirementDirection,
        strictUserIntent,
      })

      let text = ''
      await new Promise((resolve, reject) => {
        aiService.sendMessage(
          [{ role: 'user', content: prompt }],
          (chunk) => { text += chunk || '' },
          () => resolve(),
          (err) => reject(err)
        )
      })

      const cleaned = sanitizeCssDeclarations(text, elementKey)
      if (!cleaned) throw new Error('AI 未返回可用 CSS')
      return cleaned
    } catch (error) {
      console.error('[ExportConfigPanel] AI 生成元素样式失败:', error)
      showDialog({
        type: 'alert',
        title: 'AI 生成失败',
        message: error?.message || '请稍后重试',
        onConfirm: closeDialog,
      })
      return ''
    } finally {
      setAiGeneratingKey('')
    }
  }
  
  // 处理主题选择
  const handleThemeChange = (value) => {
    if (value.startsWith('custom:')) {
      // 加载已保存的自定义主题
      const themeName = value.substring(7)
      const themeCSS = customThemes[themeName]
      if (themeCSS) {
        onChange({
          ...config,
          theme: 'custom',
          customCSS: themeCSS
        })
      }
    } else {
      // 选择预设主题或新建自定义
      updateConfig('theme', value)
    }
  }
  
  // 保存自定义主题
  // 将当前可视化配置导出为自定义 CSS
  const exportToCustomCSS = () => {
    const lines = []
    const tc = config.themeColor || '#3daeff'

    // container 基础样式
    const containerProps = []
    if (config.fontFamily && config.fontFamily !== 'sans-serif') containerProps.push(`  font-family: ${config.fontFamily};`)
    if (config.fontSize && config.fontSize !== '16px') containerProps.push(`  font-size: ${config.fontSize};`)
    if (config.lineHeight && config.lineHeight !== 1.8) containerProps.push(`  line-height: ${config.lineHeight};`)
    if (config.textAlign && config.textAlign !== 'left') containerProps.push(`  text-align: ${config.textAlign};`)
    if (containerProps.length > 0) {
      lines.push('container {')
      lines.push(...containerProps)
      lines.push('}')
      lines.push('')
    }

    // 主题色导出（即使未设置元素细则，也保留主题色基线）
    if (config.themeColor) {
      lines.push('/* 主题色基线 */')
      lines.push(`link {`)
      lines.push(`  color: ${tc};`)
      lines.push('}')
      lines.push('')
      lines.push('blockquote {')
      lines.push(`  border-left: 4px solid ${tc};`)
      lines.push('}')
      lines.push('')
      lines.push('hr {')
      lines.push(`  border-top: 2px solid ${tc};`)
      lines.push('}')
      lines.push('')
    }

    // 选择器映射表
    const selectorMap = {
      h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6',
      p: 'p', strong: 'strong', link: 'link',
      ul: 'ul', ol: 'ol', blockquote: 'blockquote',
      codespan: 'codespan', code_pre: 'code_pre', hr: 'hr', image: 'image',
      bg: 'container',
    }

    const es = config.elementStyles || {}
    Object.entries(selectorMap).forEach(([key, sel]) => {
      const el = es[key] || {}
      const props = []

      // 预设
      const preset = el.preset || 'default'

      // 颜色
      if (el.color) {
        if (key === 'bg') props.push(`  background-color: ${el.color};`)
        else if (preset !== 'theme-bg') props.push(`  color: ${el.color};`)
      }
      if (preset === 'border-bottom') {
        props.push(`  border-bottom: 2px solid ${tc};`)
        props.push(`  padding-bottom: 0.3em;`)
      } else if (preset === 'border-left') {
        props.push(`  border-left: 4px solid ${tc};`)
        props.push(`  padding-left: 0.8em;`)
        props.push(`  border-bottom: none;`)
      } else if (preset === 'theme-bg') {
        props.push(`  display: table;`)
        props.push(`  padding: 0.3em 1.2em;`)
        props.push(`  margin: 2em auto 1em;`)
        props.push(`  color: ${el.color || '#fff'};`)
        props.push(`  background: ${tc};`)
        props.push(`  border-radius: 6px;`)
      } else if (preset === 'indent') {
        props.push(`  text-indent: 2em;`)
      } else if (preset === 'justify') {
        props.push(`  text-align: justify;`)
      } else if (preset === 'underline') {
        props.push(`  text-decoration: underline;`)
      } else if (preset === 'no-underline') {
        props.push(`  text-decoration: none;`)
      } else if (preset === 'rounded') {
        props.push(`  border-radius: 8px;`)
      } else if (preset === 'shadow') {
        props.push(`  box-shadow: 0 4px 12px rgba(0,0,0,0.15);`)
      } else if (preset === 'center') {
        props.push(`  display: block; margin: 0 auto;`)
      } else if (preset === 'gradient') {
        if (key === 'hr') props.push(`  background: linear-gradient(to right, transparent, ${tc}, transparent); height: 1px; border: none;`)
        else props.push(`  background: linear-gradient(135deg, ${tc}22, ${tc}66);`)
      } else if (preset === 'dashed') {
        props.push(`  border-top: 2px dashed ${tc}; background: none;`)
      } else if (preset === 'filled') {
        props.push(`  background: ${tc}18; border-left: 4px solid ${tc};`)
      } else if (preset === 'pill') {
        props.push(`  border-radius: 4px; padding: 2px 6px;`)
      } else if (preset === 'grid') {
        props.push(`  background-image: linear-gradient(rgba(0,0,0,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.05) 1px,transparent 1px);`)
        props.push(`  background-size: 20px 20px;`)
      } else if (preset === 'dots') {
        props.push(`  background-image: radial-gradient(rgba(0,0,0,0.05) 0.5px,transparent 0.5px);`)
        props.push(`  background-size: 8px 8px;`)
      } else if (preset === 'stripe') {
        props.push(`  background-image: repeating-linear-gradient(to bottom,transparent,transparent 19px,rgba(0,0,0,0.04) 19px,rgba(0,0,0,0.04) 20px);`)
      }

      // 背景颜色（bg 元素）
      if (key === 'bg' && el.color) props.push(`  background-color: ${el.color};`)

      // 自定义 CSS
      if (el.customCSS) {
        el.customCSS.split(';').map(s => s.trim()).filter(Boolean).forEach(p => props.push(`  ${p};`))
      }

      if (props.length > 0) {
        lines.push(`${sel} {`)
        lines.push(...props)
        lines.push('}')
        lines.push('')
      }
    })

    const css = lines.join('\n').trim()
    if (!css) {
      showDialog({ type: 'alert', title: '提示', message: '当前没有可导出的配置（均为默认值）', onConfirm: closeDialog })
      return
    }

    onChange({ ...config, theme: 'custom', customCSS: css })
    showDialog({ type: 'alert', title: '导出成功', message: '已切换到自定义主题，CSS 已填入输入框，可继续编辑。', onConfirm: closeDialog })
  }

  const saveCustomTheme = () => {
    if (!config.customCSS) {
      showDialog({
        type: 'alert',
        title: '提示',
        message: '请先输入自定义 CSS',
        onConfirm: closeDialog
      })
      return
    }
    
    showDialog({
      type: 'prompt',
      title: '保存主题',
      message: '请输入主题名称：',
      placeholder: '例如：我的主题',
      onConfirm: (name) => {
        if (!name) {
          closeDialog()
          return
        }
        
        const saveTheme = async () => {
          try {
            const res = await fetch('api/export-themes/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, css: config.customCSS || '' }),
            })
            const data = await res.json()
            if (!res.ok || !data.ok) {
              console.error('[ExportConfigPanel] 保存自定义主题失败:', data)
              showDialog({
                type: 'alert',
                title: '错误',
                message: '保存主题失败，请稍后重试',
                onConfirm: closeDialog,
              })
              return
            }
            const newThemes = { ...customThemes, [name]: config.customCSS }
            setCustomThemes(newThemes)
            showDialog({
              type: 'alert',
              title: '成功',
              message: `主题 "${name}" 已保存！`,
              onConfirm: closeDialog
            })
          } catch (e) {
            console.error('[ExportConfigPanel] 保存自定义主题异常:', e)
            showDialog({
              type: 'alert',
              title: '错误',
              message: '保存主题时发生错误',
              onConfirm: closeDialog,
            })
          }
        }

        if (customThemes[name]) {
          showDialog({
            type: 'alert',
            title: '确认覆盖',
            message: `主题 "${name}" 已存在，是否覆盖？`,
            onConfirm: saveTheme
          })
        } else {
          saveTheme()
        }
      }
    })
  }
  
  // 删除自定义主题
  const deleteCustomTheme = () => {
    const names = Object.keys(customThemes)
    if (names.length === 0) {
      showDialog({
        type: 'alert',
        title: '提示',
        message: '没有保存的自定义主题',
        onConfirm: closeDialog
      })
      return
    }
    
    showDialog({
      type: 'prompt',
      title: '删除主题',
      message: `可用主题：\n${names.join('\n')}\n\n请输入要删除的主题名称：`,
      placeholder: '输入主题名称',
      onConfirm: (name) => {
        if (!name) {
          closeDialog()
          return
        }
        
        if (!customThemes[name]) {
          showDialog({
            type: 'alert',
            title: '错误',
            message: '主题不存在',
            onConfirm: closeDialog
          })
          return
        }
        
        showDialog({
          type: 'alert',
          title: '确认删除',
          message: `确定要删除主题 "${name}" 吗？`,
          onConfirm: () => {
            const deleteTheme = async () => {
              try {
                const res = await fetch('api/export-themes/delete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name }),
                })
                const data = await res.json()
                if (!res.ok || !data.ok) {
                  console.error('[ExportConfigPanel] 删除自定义主题失败:', data)
                  showDialog({
                    type: 'alert',
                    title: '错误',
                    message: '删除主题失败，请稍后重试',
                    onConfirm: closeDialog,
                  })
                  return
                }
                const newThemes = { ...customThemes }
                delete newThemes[name]
                setCustomThemes(newThemes)
            
                // 如果当前正在使用被删除的主题，切换到默认主题
                if (config.theme === 'custom' && config.customCSS === customThemes[name]) {
                  onChange({
                    ...config,
                    theme: 'default',
                    customCSS: ''
                  })
                }
              } catch (e) {
                console.error('[ExportConfigPanel] 删除自定义主题异常:', e)
                showDialog({
                  type: 'alert',
                  title: '错误',
                  message: '删除主题时发生错误',
                  onConfirm: closeDialog,
                })
              }
            }
            
            showDialog({
              type: 'alert',
              title: '成功',
              message: `主题 "${name}" 已删除！`,
              onConfirm: closeDialog
            })
          }
        })
      }
    })
  }

  const handleCloseClick = () => {
    onClose()
  }

  return (
    <div className={`export-config-panel ${compact ? 'compact' : ''}`} style={style}>
      <div className="panel-header">
        <h3>导出配置</h3>
        <button className="panel-close" onClick={handleCloseClick}>×</button>
      </div>

      <div className="panel-body">
        {/* 一、主题与基础 */}
        <ConfigSection title="主题与基础" icon={Palette}>
          <AnimatedSelect
            label="主题"
            value={config.theme === 'custom' && config.customCSS ? 
              (() => {
                // 查找匹配的自定义主题
                const matchedTheme = Object.keys(customThemes).find(
                  name => customThemes[name] === config.customCSS
                )
                return matchedTheme ? `custom:${matchedTheme}` : 'custom'
              })() 
              : config.theme || 'default'}
            options={themeOptions}
            onChange={handleThemeChange}
          />
          
          {/* 自定义 CSS */}
          {config.theme === 'custom' && (
            <>
              <div className="config-item config-item-custom-theme-editor">
                <label className="config-label">自定义主题管理</label>
                <textarea
                  className="config-textarea"
                  placeholder="输入自定义 CSS 样式...&#10;&#10;示例：&#10;.container h1 {&#10;  color: #ff6b6b;&#10;  font-size: 2.5em;&#10;}"
                  value={config.customCSS || ''}
                  onChange={(e) => updateConfig('customCSS', normalizeThemeCssOutput(e.target.value))}
                  rows={10}
                  style={{ fontFamily: 'Monaco, Consolas, monospace', fontSize: '12px' }}
                />
                <div className="config-action-stack">
                  <div className="config-inline-actions">
                  <button
                    className="btn-group-item"
                    style={{ flex: 1 }}
                    onClick={() => {
                      const defaultTemplate = `/*
  按Ctrl/Command+F可格式化
  使用 var(--md-primary-color) 代替主题色
  
  背景自定义说明：
  - 修改 container 的 background 相关属性来自定义背景
  - 下面提供了8种背景样式示例，取消注释即可使用
  
  注意：
  - link 伪类（:hover, :active）仅在导出的 HTML 中生效
  - 预览区域不支持伪类交互效果
*/

/* 容器背景样式 - 选择一种使用 */

/* 样式1: 基础网格纹理（默认启用） */
container {
  background-color: #f8f9fa;
  background-image: 
    linear-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 0, 0, 0.05) 1px, transparent 1px);
  background-size: 20px 20px;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
  padding: 40px;
}

/* 样式2: 渐变光晕背景（取消注释使用）
container {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1), 
              inset 0 1px 0 rgba(255, 255, 255, 0.8);
  padding: 40px;
}
*/

/* 样式3: 低饱和度波浪纹理（取消注释使用）
container {
  background-color: #f8f9fa;
  background-image: 
    repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.03) 0px, rgba(0, 0, 0, 0.03) 2px, 
    transparent 2px, transparent 10px);
  background-size: 28px 28px;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
  padding: 40px;
}
*/

/* 样式4: 磨砂玻璃纹理（取消注释使用）
container {
  background-color: rgba(248, 249, 250, 0.85);
  background-image: radial-gradient(rgba(0, 0, 0, 0.02) 1px, transparent 1px);
  background-size: 10px 10px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
  padding: 40px;
  border: 1px solid rgba(255, 255, 255, 0.5);
}
*/

/* 样式5: 极简纯色+微光质感（取消注释使用）
container {
  background: #f8f9fa;
  background-image: linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 100%);
  border-radius: 16px;
  box-shadow: 
    0 2px 8px rgba(0,0,0,0.06),
    0 4px 24px rgba(0,0,0,0.1);
  padding: 40px;
  border: 1px solid rgba(0,0,0,0.03);
}
*/

/* 样式6: 复古条纹纹理（取消注释使用）
container {
  background-color: #f8f9fa;
  background-image: 
    repeating-linear-gradient(
      to bottom,
      transparent,
      transparent 19px,
      rgba(0,0,0,0.04) 19px,
      rgba(0,0,0,0.04) 20px
    );
  background-size: 100% 20px;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
  padding: 40px;
}
*/

/* 样式7: 科技感点阵纹理（取消注释使用）
container {
  background-color: #f8f9fa;
  background-image: 
    radial-gradient(rgba(0,0,0,0.05) 0.5px, transparent 0.5px);
  background-size: 8px 8px;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
  padding: 40px;
}
*/

/* 样式8: 双色柔渐变（取消注释使用）
container {
  background: linear-gradient(
    to right,
    #fafbfc 0%,
    #f5f7f9 50%,
    #fafbfc 100%
  );
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  padding: 40px;
}
*/

/* 一级标题样式 */
h1 {
  display: table;
  padding: 0.5em 1em;
  border-bottom: 2px solid var(--md-primary-color);
  margin: 2em auto 1em;
  font-size: 1.4em;
  font-weight: bold;
  text-align: center;
}

/* 二级标题样式 */
h2 {
  display: table;
  padding: 0.3em 1.2em;
  margin: 4em auto 2em;
  color: #fff;
  background: var(--md-primary-color);
  font-size: 1.3em;
  font-weight: bold;
  text-align: center;
  border-radius: 8px;
}

/* 三级标题样式 */
h3 {
  padding-left: 12px;
  font-size: 1.2em;
  border-left: 4px solid var(--md-primary-color);
  color: var(--md-primary-color);
  margin: 2em 8px 0.75em 0;
  font-weight: bold;
}

/* 四级标题样式 */
h4 {
  margin: 2em 8px 0.5em;
  color: var(--md-primary-color);
  font-size: 1.1em;
  font-weight: bold;
}

/* 段落样式 */
p {
  margin: 1.5em 8px;
  letter-spacing: 0.1em;
  text-align: justify;
}

/* 引用样式 */
blockquote {
  font-style: italic;
  padding: 1em 1em 1em 2em;
  border-left: 4px solid var(--md-primary-color);
  border-radius: 6px;
  background: var(--blockquote-background);
  margin-bottom: 1em;
}

/* 行内代码样式 */
codespan {
  font-size: 90%;
  color: #d14;
  background: rgba(27,31,35,.05);
  padding: 3px 5px;
  border-radius: 4px;
}

/* 粗体样式 */
strong {
  color: var(--md-primary-color);
  font-weight: bold;
}

/* 链接样式 */
link {
  color: #576b95;
  text-decoration: none;
}

/* 链接悬停样式（仅导出 HTML 生效） */
link:hover {
  color: #165dff;
  border-bottom: 1px solid #165dff;
}

/* 链接点击样式（仅导出 HTML 生效） */
link:active {
  color: #0e42c7;
}

/* 图片样式 */
image {
  display: block;
  width: 100%;
  margin: 0.5em auto;
  border-radius: 8px;
}

/* 分割线样式 */
hr {
  height: 1px;
  border: none;
  margin: 2em 0;
  background: linear-gradient(to right, rgba(0,0,0,0), rgba(0,0,0,0.1), rgba(0,0,0,0));
}

/* 代码块样式 */
code_pre {
  font-size: 14px;
  border-radius: 8px;
  padding: 1em;
  line-height: 1.5;
  margin: 10px 8px;
}`
                      updateConfig('customCSS', defaultTemplate)
                    }}
                  >
                    <FileTextIcon size={16} />
                    加载默认模板
                  </button>
                  <button
                    className="btn-group-item"
                    style={{ flex: 1 }}
                    onClick={() => {
                      showDialog({
                        type: 'confirm',
                        title: '清空自定义 CSS',
                        message: '确定要清空自定义 CSS 吗？',
                        onConfirm: () => {
                          updateConfig('customCSS', '')
                          closeDialog()
                        }
                      })
                    }}
                  >
                    <Trash2 size={16} />
                    清空
                  </button>
                  </div>
                <div className="config-inline-actions">
                  <button
                    className="btn-group-item"
                    style={{ flex: 1 }}
                    onClick={saveCustomTheme}
                  >
                    <Save size={16} />
                    保存主题
                  </button>
                  <button
                    className="btn-group-item"
                    style={{ flex: 1 }}
                    onClick={() => {
                      const names = Object.keys(customThemes)
                      if (names.length === 0) {
                        showDialog({
                          type: 'alert',
                          title: '提示',
                          message: '没有保存的自定义主题',
                          onConfirm: closeDialog
                        })
                        return
                      }
                      
                      // 显示主题列表，并提供删除功能
                      setDialog({
                        isOpen: true,
                        type: 'theme-list',
                        title: '主题管理',
                        message: '',
                        themes: customThemes,
                        onDelete: (themeName) => {
                          showDialog({
                            type: 'alert',
                            title: '确认删除',
                            message: `确定要删除主题 "${themeName}" 吗？`,
                            onConfirm: async () => {
                              try {
                                const res = await fetch('api/export-themes/delete', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ name: themeName }),
                                })
                                const data = await res.json()
                                if (!res.ok || !data.ok) {
                                  console.error('[ExportConfigPanel] 删除自定义主题失败:', data)
                                  showDialog({
                                    type: 'alert',
                                    title: '错误',
                                    message: '删除主题失败，请稍后重试',
                                    onConfirm: closeDialog,
                                  })
                                  return
                                }

                                const newThemes = { ...customThemes }
                                delete newThemes[themeName]
                                setCustomThemes(newThemes)

                                if (config.theme === 'custom' && config.customCSS === customThemes[themeName]) {
                                  onChange({
                                    ...config,
                                    theme: 'default',
                                    customCSS: ''
                                  })
                                }

                                showDialog({
                                  type: 'alert',
                                  title: '成功',
                                  message: `主题 "${themeName}" 已删除！`,
                                  onConfirm: closeDialog
                                })
                              } catch (e) {
                                console.error('[ExportConfigPanel] 删除自定义主题异常:', e)
                                showDialog({
                                  type: 'alert',
                                  title: '错误',
                                  message: '删除主题时发生错误',
                                  onConfirm: closeDialog,
                                })
                              }
                            }
                          })
                        },
                        onEdit: async (oldThemeName, newCSS, newThemeName) => {
                          // 如果主题名称改变了，需要删除旧的，添加新的
                          if (newThemeName && newThemeName !== oldThemeName) {
                            // 检查新名称是否已存在
                            if (customThemes[newThemeName]) {
                              showDialog({
                                type: 'alert',
                                title: '错误',
                                message: `主题名称 "${newThemeName}" 已存在，请使用其他名称`,
                                onConfirm: closeDialog
                              })
                              return
                            }
                            
                            try {
                              const saveRes = await fetch('api/export-themes/save', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: newThemeName, css: newCSS }),
                              })
                              const saveData = await saveRes.json()
                              if (!saveRes.ok || !saveData.ok) {
                                throw new Error(saveData?.message || '保存主题失败')
                              }

                              const deleteRes = await fetch('api/export-themes/delete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: oldThemeName }),
                              })
                              const deleteData = await deleteRes.json()
                              if (!deleteRes.ok || !deleteData.ok) {
                                throw new Error(deleteData?.message || '删除旧主题失败')
                              }

                              const newThemes = { ...customThemes }
                              delete newThemes[oldThemeName]
                              newThemes[newThemeName] = newCSS
                              setCustomThemes(newThemes)

                              if (config.theme === 'custom' && config.customCSS === customThemes[oldThemeName]) {
                                onChange({
                                  ...config,
                                  customCSS: newCSS
                                })
                              }

                              showDialog({
                                type: 'alert',
                                title: '成功',
                                message: `主题已重命名为 "${newThemeName}" 并更新！`,
                                onConfirm: closeDialog
                              })
                            } catch (e) {
                              console.error('[ExportConfigPanel] 重命名主题失败:', e)
                              showDialog({
                                type: 'alert',
                                title: '错误',
                                message: '重命名主题失败，请稍后重试',
                                onConfirm: closeDialog
                              })
                            }
                          } else {
                            try {
                              const res = await fetch('api/export-themes/save', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: oldThemeName, css: newCSS }),
                              })
                              const data = await res.json()
                              if (!res.ok || !data.ok) {
                                throw new Error(data?.message || '更新主题失败')
                              }

                              const newThemes = { ...customThemes, [oldThemeName]: newCSS }
                              setCustomThemes(newThemes)

                              if (config.theme === 'custom' && config.customCSS === customThemes[oldThemeName]) {
                                onChange({
                                  ...config,
                                  customCSS: newCSS
                                })
                              }

                              showDialog({
                                type: 'alert',
                                title: '成功',
                                message: `主题 "${oldThemeName}" 已更新！`,
                                onConfirm: closeDialog
                              })
                            } catch (e) {
                              console.error('[ExportConfigPanel] 更新主题失败:', e)
                              showDialog({
                                type: 'alert',
                                title: '错误',
                                message: '更新主题失败，请稍后重试',
                                onConfirm: closeDialog
                              })
                            }
                          }
                        },
                        onConfirm: closeDialog
                      })
                    }}
                  >
                    <FolderOpen size={16} />
                    管理主题
                  </button>
                </div>
              
                <button
                  className="btn-group-item"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={onOpenAIWriteTheme}
                >
                  <Sparkles size={16} />
                  打开 AI 对话（帮我写主题）
                </button>
                <button
                  className="btn-group-item"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={exportToCustomCSS}
                >
                  <Download size={16} />
                  导出当前配置到自定义 CSS
                </button>
              </div>
              </div>
            </>
          )}
          
          <AnimatedSelect
            label="字体"
            value={config.fontFamily || 'sans-serif'}
            options={fontOptions.map((opt) => ({ 
              ...opt, 
              label: opt.disabled ? opt.label : withCloudTag(opt.label) 
            }))}
            onChange={(value) => updateConfig('fontFamily', value)}
            renderOption={renderFontOption}
            renderValue={(option) => (
              <span style={{ fontFamily: getFontPreviewFamily(option?.value || config.fontFamily || 'sans-serif') }}>
                {option?.label || option?.value || config.fontFamily || 'sans-serif'}
              </span>
            )}
          />
          
          <AnimatedSelect
            label="字号"
            value={config.fontSize || '16px'}
            options={fontSizeOptions}
            onChange={(value) => updateConfig('fontSize', value)}
          />
          
          {/* 字体大小滑块 */}
          <div className="config-item">
            <label className="config-label">字体大小: {parseInt(config.fontSize) || 16}px</label>
            <ElasticSlider
              min={12}
              max={24}
              value={parseInt(config.fontSize) || 16}
              onChange={(value) => updateConfig('fontSize', value + 'px')}
            />
          </div>
          
          {/* 文本对齐 */}
          <div className="config-item">
            <label className="config-label">文本对齐</label>
            <div className="button-group">
              <button
                className={`btn-group-item ${(config.textAlign || 'left') === 'left' ? 'active' : ''}`}
                onClick={() => updateConfig('textAlign', 'left')}
              >
                ≡ 左对齐
              </button>
              <button
                className={`btn-group-item ${config.textAlign === 'center' ? 'active' : ''}`}
                onClick={() => updateConfig('textAlign', 'center')}
              >
                ≡ 居中
              </button>
              <button
                className={`btn-group-item ${config.textAlign === 'justify' ? 'active' : ''}`}
                onClick={() => updateConfig('textAlign', 'justify')}
              >
                ≡ 两端对齐
              </button>
            </div>
          </div>
          
          {/* 行高滑块 */}
          <div className="config-item">
            <label className="config-label">行高: {(config.lineHeight || 1.8).toFixed(1)}</label>
            <ElasticSlider
              min={10}
              max={30}
              value={Math.round((config.lineHeight || 1.8) * 10)}
              onChange={(value) => updateConfig('lineHeight', value / 10)}
            />
          </div>
        </ConfigSection>

        {/* 二、主题色 */}
        <ConfigSection title="主题色" icon={Palette}>
          <ColorPicker
            value={config.themeColor || ''}
            colors={themeColors}
            onChange={(value) => updateConfig('themeColor', value)}
            allowCustom={true}
          />
        </ConfigSection>

        {/* 三、细则样式管理 */}
        <ConfigSection title="细则样式管理" icon={Type}>
          {[
            'h1','h2','h3','h4','h5','h6',
            'p','strong','link',
            'ul','ol','blockquote',
            'codespan','code_pre','hr','image','bg'
          ].map((key) => (
            <ElementStyleItem
              key={key}
              elementKey={key}
              value={config.elementStyles?.[key] || {}}
              colors={fontColors}
              themeColor={config.themeColor || '#3daeff'}
              aiGenerating={aiGeneratingKey === key}
              aiStyleDirection={aiStyleDirection}
              aiRequirementDirection={aiRequirementDirection}
              strictUserIntent={strictUserIntent}
              onStyleDirectionChange={setAiStyleDirection}
              onRequirementDirectionChange={setAiRequirementDirection}
              onStrictUserIntentChange={setStrictUserIntent}
              onGenerateAI={generateElementStyleWithAI}
              onChange={(v) => {
                const newStyles = { ...config.elementStyles, [key]: v }
                updateConfig('elementStyles', newStyles)
              }}
            />
          ))}
        </ConfigSection>

        {/* 四、代码样式 */}
        <ConfigSection title="代码样式" icon={Code}>
          <Select
            label="代码块主题"
            value={config.codeTheme || 'arta'}
            options={codeThemeOptions}
            onChange={(value) => updateConfig('codeTheme', value)}
          />
          <Toggle
            label="Mac 代码块"
            checked={config.macCodeBlock || false}
            onChange={(value) => updateConfig('macCodeBlock', value)}
          />
        </ConfigSection>

        {/* 五、图注格式 */}
        <ConfigSection title="图注格式" icon={ImageIcon}>
          <RadioGroup
            value={config.captionFormat || 'title-first'}
            options={captionFormatOptions}
            onChange={(value) => updateConfig('captionFormat', value)}
          />
        </ConfigSection>

        {/* 六、段落格式 */}
        <ConfigSection title="段落格式" icon={FileText}>
          <Toggle
            label="段落首行缩进"
            checked={config.paragraphIndent || false}
            onChange={(value) => updateConfig('paragraphIndent', value)}
          />
          <Toggle
            label="段落两端对齐"
            checked={config.paragraphJustify || false}
            onChange={(value) => updateConfig('paragraphJustify', value)}
          />
        </ConfigSection>

        {/* 七、微信适配 */}
        <ConfigSection title="微信适配" icon={Smartphone}>
          <Toggle
            label="微信外链转底部引用"
            checked={config.wechatLinkToFootnote || false}
            onChange={(value) => updateConfig('wechatLinkToFootnote', value)}
          />
        </ConfigSection>

        {/* 其他选项 */}
        <ConfigSection title="其他选项" icon={MoreHorizontal}>
          <Toggle
            label="包含目录"
            checked={config.includeTOC || false}
            onChange={(value) => updateConfig('includeTOC', value)}
          />
        </ConfigSection>
      </div>

      <div className="panel-footer">
        <button 
          className="btn-reset"
          onClick={() => onChange({
            theme: 'default',
            customCSS: '',
            fontFamily: 'sans-serif',
            fontSize: '16px',
            textAlign: 'left',
            lineHeight: 1.8,
            themeColor: '',
            elementStyles: {
              h1: { color: '', preset: 'default', customCSS: '' },
              h2: { color: '', preset: 'default', customCSS: '' },
              h3: { color: '', preset: 'default', customCSS: '' },
              h4: { color: '', preset: 'default', customCSS: '' },
              h5: { color: '', preset: 'default', customCSS: '' },
              h6: { color: '', preset: 'default', customCSS: '' },
              p:          { color: '', preset: 'default', customCSS: '' },
              strong:     { color: '', preset: 'default', customCSS: '' },
              link:       { color: '', preset: 'default', customCSS: '' },
              ul:         { color: '', preset: 'default', customCSS: '' },
              ol:         { color: '', preset: 'default', customCSS: '' },
              blockquote: { color: '', preset: 'default', customCSS: '' },
              codespan:   { color: '', preset: 'default', customCSS: '' },
              code_pre:   { color: '', preset: 'default', customCSS: '' },
              hr:         { color: '', preset: 'default', customCSS: '' },
              image:      { color: '', preset: 'default', customCSS: '' },
              bg:         { color: '', preset: 'default', customCSS: '' },
            },
            codeTheme: 'github',
            macCodeBlock: false,
            captionFormat: 'title-first',
            paragraphIndent: false,
            paragraphJustify: false,
            wechatLinkToFootnote: false,
            includeTOC: false
          })}
        >
          重置配置
        </button>
      </div>
      
      {/* 自定义对话框 */}
      <CustomDialog
        isOpen={dialog.isOpen}
        onClose={closeDialog}
        onConfirm={dialog.onConfirm}
        title={dialog.title}
        message={dialog.message}
        type={dialog.type}
        placeholder={dialog.placeholder}
        defaultValue={dialog.defaultValue}
        themes={dialog.themes || {}}
        onDelete={dialog.onDelete}
        onEdit={dialog.onEdit}
      />
    </div>
  )
}

export default ExportConfigPanel
