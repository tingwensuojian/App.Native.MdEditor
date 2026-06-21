const ELEMENT_STYLE_SCENE = {
  h1: '一级标题，强调主标题层级与识别度',
  h2: '二级标题，作为章节分隔，风格要与 h1 协调',
  h3: '三级标题，层级清晰但不过度抢眼',
  h4: '四级标题，弱化层级但保持可读性',
  h5: '五级标题，轻量标题样式',
  h6: '六级标题，最弱层级标题样式',
  p: '正文段落，提升阅读舒适度和可读性',
  strong: '粗体文本，强调关键信息但不过分刺眼',
  link: '链接文本，突出可点击状态并保持整体协调',
  ul: '无序列表，控制缩进和行距，提升条目可读性',
  ol: '有序列表，控制编号阅读节奏与间距',
  blockquote: '引用块，突出引用语义并保持内容区分',
  codespan: '行内代码，小块高亮，保证与正文对比清晰',
  code_pre: '代码块容器，兼顾对比度、圆角、留白与可读性',
  hr: '分割线，弱化但有效分隔内容',
  image: '图片展示，优化边角、阴影与留白',
  bg: '整体背景（容器），可通过 background/clip-path 实现不规则形状',
}

const ELEMENT_STYLE_EXTRA_RULES = {
  link: '可包含 text-decoration、text-underline-offset、font-weight。不要使用伪类选择器。',
  code_pre: '可包含 background、border、border-radius、padding、box-shadow。',
  codespan: '可包含 background、padding、border-radius、font-family、font-size。',
  image: '可包含 border-radius、box-shadow、display、margin。',
  bg: '可使用 background/background-*、clip-path、border-radius、box-shadow、padding，必要时可加入滤镜与渐变。',
}

export function buildElementStylePrompt({
  elementKey,
  themeColor,
  preset,
  currentColor,
  currentCustomCSS,
  styleDirection,
  requirementDirection,
  strictUserIntent,
}) {
  const scene = ELEMENT_STYLE_SCENE[elementKey] || `${elementKey} 元素样式`
  const extraRules = ELEMENT_STYLE_EXTRA_RULES[elementKey] || ''

  const isGreenRequest = /绿|green/i.test(`${styleDirection || ''} ${requirementDirection || ''}`)

  return `你是一个资深前端设计工程师。请为 Markdown 导出主题中的元素生成 CSS 声明。\n\n任务元素：${elementKey}\n场景：${scene}\n当前主题色：${themeColor || '未设置'}\n当前预设：${preset || 'default'}\n当前颜色：${currentColor || '默认'}\n当前自定义CSS：${currentCustomCSS || '无'}\n用户风格方向：${styleDirection || '无（你可按简洁、现代、可读性优先生成）'}\n用户需求方向：${requirementDirection || '无'}\n严格遵循用户需求：${strictUserIntent ? '开启' : '关闭'}\n\n优先级要求（必须遵守）：\nA) 优先满足“用户需求方向”，其次才是默认审美。\nB) 用户提到背景/背景色/阴影/形状时，必须输出对应属性（如 background/background-color/box-shadow/clip-path）。\nC) 用户明确颜色时优先使用明确颜色值。${isGreenRequest ? '本次必须使用绿色作为主背景色（如 #22c55e / #16a34a / #10b981）。' : ''}\n${strictUserIntent ? 'D) 严格模式开启：不要自行改写用户意图，不要引入用户未要求的主视觉方向。' : 'D) 可在不违背用户方向的前提下做适度设计优化。'}\n\n输出要求（必须严格遵守）：\n1) 只输出 CSS 声明，不要输出选择器，不要输出解释，不要 markdown 代码块。\n2) 每行一个声明，结尾带分号。输出 4-12 条即可。\n3) 可结合 var(--theme-color, #4f46e5) 或 var(--md-primary-color)，但用户指定颜色时优先明确颜色值。\n4) 不要输出 @import、url(javascript:...)、expression()。\n5) 不要输出 !important。\n${extraRules ? `6) ${extraRules}` : ''}`
}
