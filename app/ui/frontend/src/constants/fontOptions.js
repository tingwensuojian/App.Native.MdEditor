export const FONT_OPTION_GROUPS = {
  CN_RECOMMEND: '__group-cn-recommend__',
  CN_STYLE: '__group-cn-style__',
  MONO: '__group-mono__',
  GENERIC: '__group-generic__',
}

const BASE_FONTS = [
  { value: '思源黑体', label: '思源黑体', group: FONT_OPTION_GROUPS.CN_RECOMMEND, remote: true, scopes: ['settings'] },
  { value: '思源宋体', label: '思源宋体', group: FONT_OPTION_GROUPS.CN_RECOMMEND, remote: true, scopes: ['settings'] },
  { value: '霞鹜文楷', label: '霞鹜文楷', group: FONT_OPTION_GROUPS.CN_RECOMMEND, remote: true, scopes: ['settings'] },
  { value: '阿里巴巴普惠体', label: '阿里巴巴普惠体', group: FONT_OPTION_GROUPS.CN_RECOMMEND, remote: true, scopes: ['settings'] },
  { value: 'HarmonyOS Sans SC', label: 'HarmonyOS Sans SC', group: FONT_OPTION_GROUPS.CN_RECOMMEND, remote: true, scopes: ['settings'] },

  { value: '楷体', label: '楷体', group: FONT_OPTION_GROUPS.CN_STYLE, remote: true, scopes: ['settings'] },
  { value: 'Noto Serif SC', label: 'Noto Serif SC', group: FONT_OPTION_GROUPS.CN_STYLE, remote: true, scopes: ['settings'] },
  { value: 'Ma Shan Zheng', label: 'Ma Shan Zheng', group: FONT_OPTION_GROUPS.CN_STYLE, remote: true, scopes: ['settings'] },

  { value: 'JetBrains Mono', label: 'JetBrains Mono', group: FONT_OPTION_GROUPS.MONO, remote: true, scopes: ['settings'] },
  { value: 'Fira Code', label: 'Fira Code', group: FONT_OPTION_GROUPS.MONO, remote: true, scopes: ['settings'] },
  { value: 'Source Code Pro', label: 'Source Code Pro', group: FONT_OPTION_GROUPS.MONO, remote: true, scopes: ['settings'] },
  { value: 'IBM Plex Mono', label: 'IBM Plex Mono', group: FONT_OPTION_GROUPS.MONO, remote: true, scopes: ['settings'] },
  { value: 'Cascadia Code', label: 'Cascadia Code', group: FONT_OPTION_GROUPS.MONO, remote: true, scopes: ['settings'] },
  { value: 'Monaco', label: 'Monaco', group: FONT_OPTION_GROUPS.MONO, remote: false, scopes: ['settings'] },
  { value: 'Consolas', label: 'Consolas', group: FONT_OPTION_GROUPS.MONO, remote: false, scopes: ['settings'] },
  { value: 'monospace', label: '系统等宽字体', group: FONT_OPTION_GROUPS.MONO, remote: false, scopes: ['settings', 'export'] },

  { value: 'sans-serif', label: '无衬线', group: FONT_OPTION_GROUPS.GENERIC, remote: false, scopes: ['settings', 'export'] },
  { value: 'serif', label: '衬线', group: FONT_OPTION_GROUPS.GENERIC, remote: false, scopes: ['settings', 'export'] },
]

const SETTINGS_GROUP_HEADERS = [
  { value: FONT_OPTION_GROUPS.CN_RECOMMEND, label: '—— 推荐中文字体 ——' },
  { value: FONT_OPTION_GROUPS.CN_STYLE, label: '—— 中文手写/风格 ——' },
  { value: FONT_OPTION_GROUPS.MONO, label: '—— 编程等宽 ——' },
  { value: FONT_OPTION_GROUPS.GENERIC, label: '—— 通用族（导出同源） ——' },
]

export const getSettingsFontOptions = (withCloudTag) => {
  const byGroup = SETTINGS_GROUP_HEADERS.map((group) => {
    const options = BASE_FONTS
      .filter((item) => item.group === group.value && item.scopes.includes('settings'))
      .map((item) => ({
        value: item.value,
        label: item.remote ? withCloudTag(item.value) : item.label,
      }))

    return [
      { value: group.value, label: group.label, disabled: true },
      ...options,
    ]
  })

  return byGroup.flat()
}

export const getExportFontOptions = () => {
  return BASE_FONTS
    .filter((item) => item.scopes.includes('export') || item.scopes.includes('settings'))
    .map((item) => ({ value: item.value, label: item.label }))
}

// 新增：支持分组的导出字体选项
export const getExportFontOptionsWithGroups = () => {
  const byGroup = SETTINGS_GROUP_HEADERS.map((group) => {
    const options = BASE_FONTS
      .filter((item) => item.group === group.value && (item.scopes.includes('export') || item.scopes.includes('settings')))
      .map((item) => ({
        value: item.value,
        label: item.label,
      }))

    // 只有当该分组有可用选项时才返回分组标题
    if (options.length > 0) {
      return [
        { value: group.value, label: group.label, disabled: true },
        ...options,
      ]
    }
    return []
  })

  return byGroup.flat().filter(Boolean)
}