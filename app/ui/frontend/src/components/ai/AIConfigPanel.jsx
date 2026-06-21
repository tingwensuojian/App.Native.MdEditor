import React from 'react'
import { X, TestTube, Info, Plus, Trash2, Search, HelpCircle, Lock, Eye, EyeOff, MessageSquare, Image as ImageIcon, Pencil, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import AnimatedSelect from '../AnimatedSelect'
import ElasticSlider from '../ElasticSlider'
import { AI_SERVICES, AI_SERVICE_CATEGORIES, DEFAULT_CONFIG, CONNECTIVITY_TEST_DEFAULT_MODELS, CONNECTIVITY_TEST_EXCLUDED_PATTERNS } from '../../constants/aiConfig'
import { AI_IMAGE_SERVICES, DEFAULT_IMAGE_CONFIG, isImageModel, CONNECTIVITY_TEST_DEFAULT_IMAGE_MODELS } from '../../constants/aiImageConfig'

const API_KEY_MASK = '••••••••••••' // 已保存的 API Key 在页面上仅显示星号，不展示明文
const maskEndpoint = (value) => {
  if (typeof value !== 'string') return ''
  if (!value) return ''
  return '*'.repeat(value.length)
} // 已保存的 API 代理地址在页面上仅显示同长度星号，不展示明文

/** 检测是否为移动端视口 */
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const fn = () => setIsMobile(mq.matches)
    mq.addEventListener('change', fn)
    fn()
    return () => mq.removeEventListener('change', fn)
  }, [])
  return isMobile
}

const SIZE_LABELS = {
  '1024x1024': '正方形 (1024×1024)',
  '512x512': '小图 (512×512)',
  '768x768': '中图 (768×768)',
  '1024x768': '横版 4:3 (1024×768)',
  '768x1024': '竖版 4:3 (768×1024)',
  '1280x720': '横版 16:9 (1280×720)',
  '720x1280': '竖版 16:9 (720×1280)',
  '1920x1080': '全高清横版 (1920×1080)',
  '1080x1920': '全高清竖版 (1080×1920)',
  '1024x1792': '竖版 (1024×1792)',
  '1792x1024': '横版 (1792×1024)',
  '256x256': '缩略图 (256×256)',
}

export default function AIConfigPanel({
  config,
  onConfigChange,
  onClose,
  onTestConnection,
  imageConfig,
  onImageConfigChange,
  onTestConnectionImage,
  initialModelListTab = 'chat',
}) {
  const [testing, setTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState(null)
  const [showAddCustomModelDialog, setShowAddCustomModelDialog] = React.useState(false)
  const [addModelIdInput, setAddModelIdInput] = React.useState('')
  const [addModelDisplayNameInput, setAddModelDisplayNameInput] = React.useState('')
  const [configSearch, setConfigSearch] = React.useState('') // 顶部搜索：同时过滤服务商与模型
  const [showApiKey, setShowApiKey] = React.useState(false) // 对话 API Key 是否显示明文（否则显示星号）
  const [showImageApiKey, setShowImageApiKey] = React.useState(false) // 文生图 API Key 是否显示明文
  const [showEndpoint, setShowEndpoint] = React.useState(false) // API 代理地址是否显示明文（否则脱敏）
  const [viewingService, setViewingService] = React.useState(config?.type || 'builtin')
  const [modelListTab, setModelListTab] = React.useState(initialModelListTab) // 模型列表下：'chat' | 'image'
  const [imageCustomModelInput, setImageCustomModelInput] = React.useState('')
  const [showAddImageModelDialog, setShowAddImageModelDialog] = React.useState(false)
  const [addImageModelIdInput, setAddImageModelIdInput] = React.useState('')
  const [addImageModelDisplayNameInput, setAddImageModelDisplayNameInput] = React.useState('')
  const [imageTesting, setImageTesting] = React.useState(false)
  const [imageTestResult, setImageTestResult] = React.useState(null)
  const [rowTestResult, setRowTestResult] = React.useState(null) // 模型列表行内连通性检查结果：{ modelId, result }
  const [rowImageTestResult, setRowImageTestResult] = React.useState(null) // 图片模型列表行内连通性检查结果
  const [editingChatModel, setEditingChatModel] = React.useState(null) // 正在编辑的对话自定义模型名
  const [editingChatModelValue, setEditingChatModelValue] = React.useState('')
  const [editingImageModelInList, setEditingImageModelInList] = React.useState(null) // 图片标签下列表中正在编辑的模型
  const [editingImageModelInListValue, setEditingImageModelInListValue] = React.useState('')
  const [editingImageFormModel, setEditingImageFormModel] = React.useState(null) // 文生图主表单中正在编辑的自定义模型
  const [editingImageFormModelValue, setEditingImageFormModelValue] = React.useState('')
  const [fetchingModels, setFetchingModels] = React.useState(false) // 正在拉取模型列表
  const [fetchModelsError, setFetchModelsError] = React.useState(null) // 拉取失败提示
  const mainContentRef = React.useRef(null)
  const isMobile = useIsMobile()
  const [mobileApiOpen, setMobileApiOpen] = React.useState(true)
  const [mobileModelsOpen, setMobileModelsOpen] = React.useState(false)
  const [mobileServiceSelectOpen, setMobileServiceSelectOpen] = React.useState(false)
  const mobileServiceWrapRef = React.useRef(null)

  const handleClose = () => {
    setShowApiKey(false)
    setShowImageApiKey(false)
    setShowEndpoint(false)
    onClose()
  }

  /** 仅保存（掩码 API Key），不关闭面板 */
  const handleSave = () => {
    setShowApiKey(false)
    setShowImageApiKey(false)
    setShowEndpoint(false)
  }

  React.useEffect(() => {
    setModelListTab(initialModelListTab)
  }, [initialModelListTab])

  // 侧栏仅切换“正在查看/编辑”的服务，不改变对话当前使用的 config.type
  React.useEffect(() => {
    setViewingService((prev) => (config?.type != null ? config.type : prev))
  }, [config?.type])

  React.useEffect(() => {
    if (!showEndpoint) return
    const t = setTimeout(() => setShowEndpoint(false), 8000)
    return () => clearTimeout(t)
  }, [showEndpoint])

  const currentService = AI_SERVICES.find((s) => s.value === viewingService)
  // 对话模型：内置用预设，其他从拉取结果中排除文生图模型
  const builtinModels = React.useMemo(() => {
    if (viewingService === 'builtin') return currentService?.models || []
    const fetched = config.fetchedModelsByService?.[viewingService] || []
    return fetched.filter((m) => !isImageModel(m))
  }, [viewingService, currentService?.models, config.fetchedModelsByService])
  const customModels = Array.isArray(config.customModels?.[viewingService]) ? config.customModels[viewingService] : []
  const allModels = React.useMemo(() => {
    const seen = new Set()
    return [...builtinModels, ...customModels].filter((m) => m && !seen.has(m) && seen.add(m))
  }, [builtinModels, customModels])

  const getChatModelDisplayLabel = (modelId) =>
    (config.customModelLabels?.[viewingService]?.[modelId] || modelId).trim() || modelId

  const verifiedSet = React.useMemo(() => {
    const list = config.verifiedModelsByService?.[viewingService] || []
    return new Set(list)
  }, [config.verifiedModelsByService, viewingService])

  const configSearchLower = configSearch.trim().toLowerCase()
  const disabledSet = React.useMemo(
    () => new Set(config.disabledProviders || []),
    [config.disabledProviders]
  )
  /** 已启用 = 服务商头部开关为 ON（不在 disabledProviders 中），与模型列表内开关无关 */
  const enabledValueSet = React.useMemo(() => {
    return new Set(AI_SERVICES.filter((s) => !disabledSet.has(s.value)).map((s) => s.value))
  }, [disabledSet])
  const isProviderEnabled = !disabledSet.has(viewingService)
  const setProviderEnabled = (on) => {
    const list = config.disabledProviders || []
    const next = on ? list.filter((t) => t !== viewingService) : [...new Set([...list, viewingService])]
    onConfigChange({ disabledProviders: next })
  }

  /** 已启用：服务商头部开关为 ON 的服务，用于侧栏顶部展示 */
  const enabledSidebarServices = React.useMemo(() => {
    return AI_SERVICES.filter(
      (s) =>
        enabledValueSet.has(s.value) &&
        (!configSearchLower || s.label.toLowerCase().includes(configSearchLower))
    )
  }, [enabledValueSet, configSearchLower])

  /** 按分类整理：只包含当前搜索匹配且在 AI_SERVICES 中存在的服务（顺序见 AI_SERVICE_CATEGORIES） */
  const categorizedSidebarItems = React.useMemo(() => {
    return AI_SERVICE_CATEGORIES.map((cat) => {
      const services = cat.values
        .map((value) => AI_SERVICES.find((s) => s.value === value))
        .filter(Boolean)
        .filter((s) => !configSearchLower || s.label.toLowerCase().includes(configSearchLower))
      return { ...cat, services }
    }).filter((cat) => cat.services.length > 0)
  }, [configSearchLower])

  /** 移动端服务商下拉选项：已启用优先，其余按分类顺序 */
  const mobileServiceOptions = React.useMemo(() => {
    const seen = new Set()
    const out = []
    for (const s of enabledSidebarServices) {
      if (!seen.has(s.value)) { seen.add(s.value); out.push(s) }
    }
    for (const cat of categorizedSidebarItems) {
      for (const s of cat.services) {
        if (!seen.has(s.value)) { seen.add(s.value); out.push(s) }
      }
    }
    return out
  }, [enabledSidebarServices, categorizedSidebarItems])

  const filteredModels = React.useMemo(() => {
    if (!configSearch.trim()) return allModels
    const q = configSearch.trim().toLowerCase()
    return allModels.filter((m) => m.toLowerCase().includes(q))
  }, [allModels, configSearch])

  const chatModelCount = React.useMemo(() => {
    const verified = config?.verifiedModelsByService || {}
    return AI_SERVICES.filter(
      (s) =>
        !disabledSet.has(s.value) &&
        (s.value === 'builtin' || (verified[s.value]?.length > 0))
    ).reduce((n, s) => n + (verified[s.value]?.length || 0), 0)
  }, [config?.verifiedModelsByService, disabledSet])

  const imageModelCount = React.useMemo(() => {
    if (!imageConfig?.type) return 0
    const svc = AI_IMAGE_SERVICES.find((s) => s.value === imageConfig.type)
    let source
    if (imageConfig.type === 'builtin') {
      source = svc?.models || []
    } else {
      const fetched = config?.fetchedModelsByService?.[imageConfig.type] || []
      source = fetched.filter((m) => isImageModel(m))
    }
    const custom = Array.isArray(imageConfig.customModels?.[imageConfig.type]) ? imageConfig.customModels[imageConfig.type].length : 0
    return source.length + custom
  }, [imageConfig?.type, imageConfig?.customModels, config?.fetchedModelsByService])

  /** 当前选中的服务商下：对话模型数、图片模型数、合计（用于模型列表标题与标签） */
  const chatModelCountForViewing = allModels.length
  const imageModelCountForViewing = React.useMemo(() => {
    const svc = AI_IMAGE_SERVICES.find((s) => s.value === viewingService)
    let source
    if (viewingService === 'builtin') {
      source = svc?.models || []
    } else {
      const fetched = config?.fetchedModelsByService?.[viewingService] || []
      source = fetched.filter((m) => isImageModel(m))
    }
    const custom = Array.isArray(imageConfig?.customModels?.[viewingService]) ? imageConfig.customModels[viewingService].length : 0
    return source.length + custom
  }, [imageConfig?.customModels, viewingService, config?.fetchedModelsByService])
  const totalModelCountForViewing = chatModelCountForViewing + imageModelCountForViewing

  const verifiedListForViewing = config.verifiedModelsByService?.[viewingService] || []
  /** 连通性检查选项（对话）：默认测试模型 + 已验证 + 在线拉取/内置；排除音频/ASR/embedding 等 */
  const testModelOptions = React.useMemo(() => {
    const defaults = CONNECTIVITY_TEST_DEFAULT_MODELS[viewingService] || []
    const seen = new Set()
    let list = [...defaults, ...verifiedListForViewing, ...allModels].filter((m) => m && !seen.has(m) && seen.add(m))
    list = list.filter((m) => !CONNECTIVITY_TEST_EXCLUDED_PATTERNS.some((p) => p.test(m)))
    return list
  }, [viewingService, verifiedListForViewing, allModels])
  const [testModelSelect, setTestModelSelect] = React.useState('')

  const getViewingApiKey = () =>
    config.apiKeys?.[viewingService] ?? config.apiKey ?? ''
  const getViewingEndpoint = () =>
    config.endpoints?.[viewingService] ?? currentService?.endpoint ?? config.endpoint ?? ''
  /** 图片代理地址：优先用图片专用配置，未配置时使用图片服务默认地址（如腾讯混元图片用 hunyuan.tencentcloudapi.com） */
  const getViewingImageEndpoint = () =>
    imageConfig?.endpoints?.[viewingService] ?? AI_IMAGE_SERVICES.find((s) => s.value === viewingService)?.endpoint ?? getViewingEndpoint() ?? imageConfig?.endpoint ?? ''
  /** 图片 API Key：优先用图片专用（如混元需 SecretId:SecretKey），否则共用对话 */
  const getViewingImageApiKey = () =>
    imageConfig?.apiKeys?.[viewingService] ?? imageConfig?.apiKey ?? getViewingApiKey()

  const handleTest = async (overrideModel) => {
    const modelToTest = overrideModel ?? testModelSelect
    if (!modelToTest) return
    setTesting(true)
    if (overrideModel) setRowTestResult(null)
    else setTestResult(null)
    const result = await onTestConnection({
      type: viewingService,
      apiKey: getViewingApiKey(),
      endpoint: getViewingEndpoint(),
      model: modelToTest,
    })
    if (overrideModel) setRowTestResult({ modelId: overrideModel, result })
    else setTestResult(result)
    setTesting(false)
    /* 连通性检查通过后不自动启用模型，由用户自行在模型列表中点击使用按钮 */
  }

  const handleOpenAddCustomModelDialog = () => {
    setAddModelIdInput('')
    setAddModelDisplayNameInput('')
    setShowAddCustomModelDialog(true)
  }

  const handleConfirmAddCustomModel = () => {
    const id = addModelIdInput.trim()
    if (!id || allModels.includes(id)) return
    const next = { ...(config.customModels || {}), [viewingService]: [...customModels, id] }
    const labels = config.customModelLabels || {}
    const serviceLabels = { ...(labels[viewingService] || {}) }
    if (addModelDisplayNameInput.trim()) serviceLabels[id] = addModelDisplayNameInput.trim()
    const nextLabels = { ...labels, [viewingService]: serviceLabels }
    onConfigChange({ customModels: next, customModelLabels: nextLabels })
    setShowAddCustomModelDialog(false)
  }

  const toggleModelEnabled = (model, e) => {
    e.stopPropagation()
    if (!viewingService) return
    const verified = config.verifiedModelsByService || {}
    const list = verified[viewingService] || []
    const nextList = list.includes(model)
      ? list.filter((m) => m !== model)
      : [...list, model]
    onConfigChange({
      verifiedModelsByService: { ...verified, [viewingService]: nextList },
    })
  }

  const handleRemoveCustomModel = (model) => {
    const next = customModels.filter((m) => m !== model)
    const nextCustom = { ...(config.customModels || {}), [viewingService]: next }
    const labels = config.customModelLabels || {}
    const serviceLabels = { ...(labels[viewingService] || {}) }
    delete serviceLabels[model]
    const nextLabels = { ...labels, [viewingService]: serviceLabels }
    const remaining = [...builtinModels, ...next]
    const newModel =
      config.type === viewingService && config.model === model ? (remaining[0] || '') : config.model
    onConfigChange({
      customModels: nextCustom,
      customModelLabels: nextLabels,
      ...(config.type === viewingService && { model: newModel }),
    })
  }

  /** 仅修改展示名称，模型 ID 创建后不可修改 */
  const handleRenameChatCustom = (modelId, newDisplayName) => {
    const trimmed = newDisplayName.trim()
    const labels = config.customModelLabels || {}
    const serviceLabels = { ...(labels[viewingService] || {}) }
    if (trimmed) serviceLabels[modelId] = trimmed
    else delete serviceLabels[modelId]
    const nextLabels = { ...labels, [viewingService]: serviceLabels }
    onConfigChange({ customModelLabels: nextLabels })
    setEditingChatModel(null)
  }

  const selectService = (type) => {
    if (!AI_SERVICES.some((s) => s.value === type)) return
    setViewingService(type)
    setFetchModelsError(null)
    mainContentRef.current?.scrollTo({ top: 0 })
  }

  /** 在线拉取模型列表，同时更新对话模型和图片模型，保存到 config.fetchedModelsByService，增量合并 */
  const handleFetchModels = async () => {
    if (viewingService === 'builtin') return
    const endpoint = modelListTab === 'image' ? getViewingImageEndpoint() : getViewingEndpoint()
    if (!endpoint || !endpoint.startsWith('http')) {
      setFetchModelsError('请先填写 API 代理地址')
      return
    }
    setFetchingModels(true)
    setFetchModelsError(null)
    try {
      const res = await fetch('api/ai/models/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          apiKey: getViewingApiKey(),
          serviceType: viewingService,
          modelListTab: modelListTab === 'image' ? 'image' : 'chat',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.ok) {
        setFetchModelsError(data?.message || '拉取失败')
        return
      }
      const fetched = Array.isArray(data.models) ? data.models : []
      const existing = config.fetchedModelsByService?.[viewingService] || []
      const merged = [...new Set([...existing, ...fetched])]
      onConfigChange({
        fetchedModelsByService: {
          ...(config.fetchedModelsByService || {}),
          [viewingService]: merged,
        },
      })
      setFetchModelsError(null)
    } catch (e) {
      setFetchModelsError(e?.message || '拉取失败')
    } finally {
      setFetchingModels(false)
    }
  }

  const currentImageService = imageConfig && AI_IMAGE_SERVICES.find((s) => s.value === imageConfig.type)
  /** 当前侧栏服务商对应的文生图服务（用于图片子标签的尺寸等） */
  const imageServiceForViewing = AI_IMAGE_SERVICES.find((s) => s.value === viewingService)
  const imageBuiltinModels = currentImageService?.models || []
  const imageCustomModels = Array.isArray(imageConfig?.customModels?.[imageConfig?.type]) ? imageConfig.customModels[imageConfig.type] : []
  const imageAllModels = React.useMemo(() => {
    const seen = new Set()
    return [...imageBuiltinModels, ...imageCustomModels].filter((m) => m && !seen.has(m) && seen.add(m))
  }, [imageBuiltinModels, imageCustomModels])

  const handleImageAddCustomModel = () => {
    const name = imageCustomModelInput.trim()
    if (!name || !imageConfig?.type || !onImageConfigChange) return
    if (imageAllModels.includes(name)) return
    const custom = imageConfig.customModels || {}
    const list = custom[imageConfig.type] || []
    onImageConfigChange({ customModels: { ...custom, [imageConfig.type]: [...list, name] }, model: name })
    setImageCustomModelInput('')
  }

  const handleImageRemoveCustomModel = (model) => {
    if (!imageConfig?.type || !onImageConfigChange) return
    const custom = { ...(imageConfig.customModels || {}), [imageConfig.type]: (imageConfig.customModels?.[imageConfig.type] || []).filter((m) => m !== model) }
    const remaining = [...imageBuiltinModels, ...(custom[imageConfig.type] || [])]
    const newModel = imageConfig.model === model ? (remaining[0] || '') : imageConfig.model
    onImageConfigChange({ customModels: custom, model: newModel })
  }

  const handleRenameImageFormCustom = (oldName, newName) => {
    const trimmed = newName.trim()
    if (!trimmed || !imageConfig?.type || !onImageConfigChange) {
      setEditingImageFormModel(null)
      return
    }
    if (trimmed === oldName) {
      setEditingImageFormModel(null)
      return
    }
    const list = imageConfig.customModels?.[imageConfig.type] || []
    if (list.includes(trimmed)) {
      setEditingImageFormModel(null)
      return
    }
    const next = list.map((m) => (m === oldName ? trimmed : m))
    const custom = { ...(imageConfig.customModels || {}), [imageConfig.type]: next }
    onImageConfigChange({
      customModels: custom,
      ...(imageConfig.model === oldName && { model: trimmed }),
    })
    setEditingImageFormModel(null)
  }

  const removeImageCustomInList = (model) => {
    if (!onImageConfigChange || !imageConfig) return
    const custom = imageConfig.customModels || {}
    const list = (custom[viewingService] || []).filter((m) => m !== model)
    const nextCustom = { ...custom, [viewingService]: list }
    const labels = imageConfig.customModelLabels || {}
    const serviceLabels = { ...(labels[viewingService] || {}) }
    delete serviceLabels[model]
    const nextLabels = { ...labels, [viewingService]: serviceLabels }
    const svc = AI_IMAGE_SERVICES.find((s) => s.value === viewingService)
    const builtin = svc?.models || []
    const remaining = [...builtin, ...list]
    const newModel = imageConfig.type === viewingService && imageConfig.model === model ? (remaining[0] || '') : imageConfig.model
    onImageConfigChange({
      customModels: nextCustom,
      customModelLabels: nextLabels,
      ...(imageConfig.type === viewingService && { model: newModel }),
    })
  }

  /** 仅修改文生图自定义模型的展示名称，模型 ID 创建后不可修改 */
  const handleRenameImageModelInList = (modelId, newDisplayName) => {
    const trimmed = newDisplayName.trim()
    if (!onImageConfigChange || !imageConfig) {
      setEditingImageModelInList(null)
      return
    }
    const labels = imageConfig.customModelLabels || {}
    const serviceLabels = { ...(labels[viewingService] || {}) }
    if (trimmed) serviceLabels[modelId] = trimmed
    else delete serviceLabels[modelId]
    const nextLabels = { ...labels, [viewingService]: serviceLabels }
    onImageConfigChange({ customModelLabels: nextLabels })
    setEditingImageModelInList(null)
  }

  const handleImageTest = async (overrideModel) => {
    if (!onTestConnectionImage) return
    setImageTesting(true)
    setImageTestResult(null)
    const overrides = overrideModel != null ? { model: overrideModel } : {}
    if (viewingService) {
      overrides.endpoint = getViewingImageEndpoint() || config.endpoints?.[viewingService] || imageConfig?.endpoint
      overrides.apiKey = getViewingImageApiKey()
    }
    const result = await onTestConnectionImage(overrides)
    setImageTesting(false)
    if (overrideModel) setRowImageTestResult({ modelId: overrideModel, result })
    if (result?.success) {
      const modelId = overrideModel || overrides.model
      if (onImageConfigChange && imageConfig && viewingService && modelId) {
        const verified = imageConfig.verifiedImageModelsByService || {}
        const list = verified[viewingService] ?? []
        if (!list.includes(modelId)) {
          onImageConfigChange({ verifiedImageModelsByService: { ...verified, [viewingService]: [...list, modelId] } })
        }
      }
      if (onConfigChange && config?.disabledProviders?.includes(viewingService)) {
        onConfigChange({ disabledProviders: config.disabledProviders.filter((t) => t !== viewingService) })
      }
    }
  }

  /** 表单区图片连通性检查（与 handleTest 对应，用于图片 tab） */
  const handleImageTestForm = async () => {
    if (!onTestConnectionImage || !testModelSelect) return
    setImageTesting(true)
    setImageTestResult(null)
    const overrides = {
      model: testModelSelect,
      endpoint: getViewingImageEndpoint() || imageConfig?.endpoint,
      apiKey: getViewingImageApiKey(),
    }
    const result = await onTestConnectionImage(overrides)
    setImageTestResult(result)
    setImageTesting(false)
    if (result?.success) {
      if (onImageConfigChange && imageConfig && viewingService && testModelSelect) {
        const verified = imageConfig.verifiedImageModelsByService || {}
        const list = verified[viewingService] ?? []
        if (!list.includes(testModelSelect)) {
          onImageConfigChange({ verifiedImageModelsByService: { ...verified, [viewingService]: [...list, testModelSelect] } })
        }
      }
      if (onConfigChange && config?.disabledProviders?.includes(viewingService)) {
        onConfigChange({ disabledProviders: config.disabledProviders.filter((t) => t !== viewingService) })
      }
    }
  }

  /** 表单区连通性检查：根据 tab 调用对话或图片 API */
  const handleFormConnectivityTest = () => {
    if (modelListTab === 'image') handleImageTestForm()
    else handleTest()
  }

  const handleOpenAddImageModelDialog = () => {
    setAddImageModelIdInput('')
    setAddImageModelDisplayNameInput('')
    setShowAddImageModelDialog(true)
  }

  /** 在模型列表-图片标签下通过弹窗添加文生图模型（当前服务商） */
  const handleConfirmAddImageModel = () => {
    const id = addImageModelIdInput.trim()
    if (!id || !onImageConfigChange || imageModelFullListForViewing.includes(id)) return
    const svc = AI_IMAGE_SERVICES.find((s) => s.value === viewingService)
    const custom = imageConfig?.customModels || {}
    const list = custom[viewingService] || []
    const nextCustom = { ...custom, [viewingService]: [...list, id] }
    const labels = imageConfig?.customModelLabels || {}
    const serviceLabels = { ...(labels[viewingService] || {}) }
    if (addImageModelDisplayNameInput.trim()) serviceLabels[id] = addImageModelDisplayNameInput.trim()
    const nextLabels = { ...labels, [viewingService]: serviceLabels }
    if (imageConfig?.type === viewingService) {
      onImageConfigChange({ customModels: nextCustom, customModelLabels: nextLabels, model: id })
    } else {
      onImageConfigChange({
        type: viewingService,
        endpoint: svc?.endpoint ?? '',
        model: id,
        size: svc?.sizes?.[0] || '1024x1024',
        customModels: nextCustom,
        customModelLabels: nextLabels,
      })
    }
    setShowAddImageModelDialog(false)
  }

  /** 模型列表-图片标签：当前服务商下的自定义模型列表（用于判断是否显示编辑/删除） */
  const imageCustomModelsForViewing = React.useMemo(
    () => Array.from(new Set(imageConfig?.customModels?.[viewingService] || [])),
    [imageConfig?.customModels, viewingService]
  )

  const getImageModelDisplayLabel = (modelId) =>
    (imageConfig?.customModelLabels?.[viewingService]?.[modelId] || modelId)?.trim() || modelId

  /** 模型列表-图片标签：当前服务商下全部文生图模型。内置用预设，其他从拉取结果中仅保留文生图模型；有预设时作为兜底 */
  const imageModelFullListForViewing = React.useMemo(() => {
    if (!imageConfig) return []
    const svc = AI_IMAGE_SERVICES.find((s) => s.value === viewingService)
    let source
    if (viewingService === 'builtin') {
      source = svc?.models || []
    } else {
      const fetched = config.fetchedModelsByService?.[viewingService] || []
      source = fetched.filter((m) => isImageModel(m))
      if (source.length === 0 && Array.isArray(svc?.models) && svc.models.length > 0) {
        source = svc.models
      }
    }
    const custom = Array.isArray(imageConfig.customModels?.[viewingService]) ? imageConfig.customModels[viewingService] : []
    return [...source, ...custom].filter(Boolean)
  }, [imageConfig, viewingService, config.fetchedModelsByService])

  /** 连通性检查选项（图片）：默认图片模型 + 已验证 + 当前服务商图片模型列表 */
  const imageTestModelOptionsForForm = React.useMemo(() => {
    const defaults = CONNECTIVITY_TEST_DEFAULT_IMAGE_MODELS[viewingService] || []
    const verified = imageConfig?.verifiedImageModelsByService?.[viewingService] || []
    const full = imageModelFullListForViewing || []
    const seen = new Set()
    return [...defaults, ...verified, ...full].filter((m) => m && !seen.has(m) && seen.add(m))
  }, [viewingService, imageConfig?.verifiedImageModelsByService, imageModelFullListForViewing])
  /** 表单连通性检查：根据当前 tab 切换选项 */
  const formTestModelOptions = modelListTab === 'image' ? imageTestModelOptionsForForm : testModelOptions
  React.useEffect(() => {
    const first = formTestModelOptions[0]
    setTestModelSelect((prev) => (formTestModelOptions.includes(prev) ? prev : first || ''))
  }, [viewingService, modelListTab, formTestModelOptions])

  /** 切换到图片子标签时，将文生图当前服务商同步为侧栏所选 */
  React.useEffect(() => {
    if (modelListTab !== 'image' || !imageConfig || !onImageConfigChange || imageConfig.type === viewingService) return
    const svc = AI_IMAGE_SERVICES.find((s) => s.value === viewingService)
    const firstModel = imageModelFullListForViewing[0] || imageConfig.model || ''
    const firstSize = svc?.sizes?.[0] || imageConfig.size || '1024x1024'
    onImageConfigChange({ type: viewingService, model: firstModel, size: firstSize })
  }, [modelListTab, viewingService, imageConfig?.type, onImageConfigChange, imageModelFullListForViewing])

  /** 模型列表-图片标签：当前服务商的文生图模型列表（含顶部搜索过滤） */
  const imageModelListForViewing = React.useMemo(() => {
    if (!configSearch.trim()) return imageModelFullListForViewing
    const q = configSearch.trim().toLowerCase()
    return imageModelFullListForViewing.filter((m) => m.toLowerCase().includes(q))
  }, [imageModelFullListForViewing, configSearch])

  /** 当前服务商下已启用的文生图模型集合（未配置时视为全部启用） */
  const verifiedImageSetForViewing = React.useMemo(() => {
    const list = imageConfig?.verifiedImageModelsByService?.[viewingService]
    const full = imageModelFullListForViewing
    if (!full.length) return new Set()
    if (list == null || list.length === 0) return new Set(full)
    return new Set(list)
  }, [imageConfig?.verifiedImageModelsByService, viewingService, imageModelFullListForViewing])

  const toggleImageModelEnabled = (model, e) => {
    e.stopPropagation()
    if (!onImageConfigChange || !imageConfig) return
    const verified = imageConfig.verifiedImageModelsByService || {}
    const current = verified[viewingService] ?? imageModelFullListForViewing
    const nextList = current.includes(model)
      ? current.filter((m) => m !== model)
      : [...current, model]
    onImageConfigChange({
      verifiedImageModelsByService: { ...verified, [viewingService]: nextList },
    })
  }

  React.useEffect(() => {
    if (!testResult) return
    const t = setTimeout(() => setTestResult(null), 3000)
    return () => clearTimeout(t)
  }, [testResult])

  React.useEffect(() => {
    if (!showEndpoint) return
    const t = setTimeout(() => setShowEndpoint(false), 8000)
    return () => clearTimeout(t)
  }, [showEndpoint])

  React.useEffect(() => {
    if (!imageTestResult) return
    const t = setTimeout(() => setImageTestResult(null), 3000)
    return () => clearTimeout(t)
  }, [imageTestResult])

  React.useEffect(() => {
    if (!rowTestResult) return
    const t = setTimeout(() => setRowTestResult(null), 3000)
    return () => clearTimeout(t)
  }, [rowTestResult])

  React.useEffect(() => {
    if (!rowImageTestResult) return
    const t = setTimeout(() => setRowImageTestResult(null), 3000)
    return () => clearTimeout(t)
  }, [rowImageTestResult])

  React.useEffect(() => {
    if (!mobileServiceSelectOpen) return
    const onDocClick = (e) => {
      if (mobileServiceWrapRef.current && !mobileServiceWrapRef.current.contains(e.target)) {
        setMobileServiceSelectOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('touchstart', onDocClick, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('touchstart', onDocClick)
    }
  }, [mobileServiceSelectOpen])

  return (
    <div className={`ai-config-panel${isMobile ? ' ai-config-panel-mobile' : ''}`}>
      <div className="ai-config-header">
        <h3>AI 配置</h3>
        <button className="ai-icon-btn" onClick={handleClose} title="关闭">
          <X size={18} />
        </button>
      </div>

      <div className="ai-config-topbar">
        <div className="ai-config-search-wrap">
          <Search size={16} />
          <input
            type="text"
            placeholder="搜索服务商或模型..."
            value={configSearch}
            onChange={(e) => setConfigSearch(e.target.value)}
          />
        </div>
      </div>

      {/* 移动端：顶部服务商下拉选择，替代左侧边栏 */}
      {isMobile && (
        <div className="ai-config-mobile-service-wrap" ref={mobileServiceWrapRef}>
          <button
            type="button"
            className="ai-config-mobile-service-trigger"
            onClick={() => setMobileServiceSelectOpen((v) => !v)}
            aria-expanded={mobileServiceSelectOpen}
          >
            <span>{currentService?.label ?? '选择服务商'}</span>
            {mobileServiceSelectOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {mobileServiceSelectOpen && (
            <div className="ai-config-mobile-service-dropdown">
              {mobileServiceOptions.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`ai-config-mobile-service-item${viewingService === s.value ? ' active' : ''}`}
                  onClick={() => {
                    selectService(s.value)
                    setMobileServiceSelectOpen(false)
                  }}
                >
                  <span className={`ai-config-sidebar-dot${enabledValueSet.has(s.value) ? ' enabled' : ''}`} />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="ai-config-body">
        {!isMobile && (
        <aside className="ai-config-sidebar">
          {enabledSidebarServices.length > 0 && (
                <div className="ai-config-sidebar-group">
                  <div className="ai-config-sidebar-group-title">已启用</div>
                  {enabledSidebarServices.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      className={`ai-config-sidebar-item${viewingService === s.value ? ' active' : ''}`}
                      onClick={() => selectService(s.value)}
                    >
                      <span className="ai-config-sidebar-dot enabled" />
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {categorizedSidebarItems.map((cat) => (
                <div key={cat.id} className="ai-config-sidebar-group">
                  <div className="ai-config-sidebar-group-title">{cat.label}</div>
                  {cat.services.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      className={`ai-config-sidebar-item${viewingService === s.value ? ' active' : ''}`}
                      onClick={() => selectService(s.value)}
                    >
                      <span
                        className={`ai-config-sidebar-dot${enabledValueSet.has(s.value) ? ' enabled' : ''}`}
                      />
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
              ))}
        </aside>
        )}

        <div className="ai-config-right-panel">
        <div className="ai-config-main" ref={mainContentRef}>
          <div className="ai-config-main-header">
            <div className="ai-config-main-header-title-wrap">
              <h4 className="ai-config-main-title">{currentService?.label ?? '服务'}</h4>
              {currentService?.helpUrl ? (
                <a
                  href={currentService.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ai-icon-btn"
                  title={`查看 ${currentService.label} API 文档`}
                >
                  <HelpCircle size={18} />
                </a>
              ) : null}
            </div>
            <div className="ai-config-main-header-actions">
              <button
                type="button"
                className={`ai-config-provider-toggle${isProviderEnabled ? ' on' : ''}`}
                onClick={() => setProviderEnabled(!isProviderEnabled)}
                title={isProviderEnabled ? '已启用，点击关闭' : '已关闭，点击启用'}
              >
                <span className="ai-config-provider-toggle-track">
                  <span className="ai-config-provider-toggle-thumb" />
                </span>
              </button>
            </div>
          </div>

          {/* 模型标签页：移到顶部，API Key 上方 */}
          <div className="ai-config-maintabs-wrap">
            <div className="ai-config-maintabs">
              <button
                type="button"
                className={`ai-config-maintab${modelListTab === 'chat' ? ' active' : ''}`}
                onClick={() => setModelListTab('chat')}
              >
                <MessageSquare size={16} />
                <span>对话 ({chatModelCountForViewing})</span>
              </button>
              <button
                type="button"
                className={`ai-config-maintab${modelListTab === 'image' ? ' active' : ''}`}
                onClick={() => setModelListTab('image')}
              >
                <ImageIcon size={16} />
                <span>图片 ({imageModelCountForViewing})</span>
              </button>
            </div>
          </div>

          {/* 移动端：API 配置可折叠 */}
          <div className={isMobile ? 'ai-config-mobile-section' : 'ai-config-main-form'}>
            {isMobile && (
              <button
                type="button"
                className="ai-config-mobile-section-toggle"
                onClick={() => setMobileApiOpen((v) => !v)}
                aria-expanded={mobileApiOpen}
              >
                API 配置
                {mobileApiOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            )}
            {(isMobile ? mobileApiOpen : true) && (
            <div className="ai-config-main-form">
            {currentService?.needsApiKey && (
              <div className="config-field config-field-vertical">
                <label className="config-field-label">API Key</label>
                <p className="config-field-desc">
                  {modelListTab === 'image' && imageServiceForViewing?.modelHint ? (
                    <>
                      {imageServiceForViewing.modelHint.split('SecretId:SecretKey').map((part, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="config-field-desc-highlight">SecretId:SecretKey</span>}
                          {part}
                        </React.Fragment>
                      ))}
                    </>
                  ) : (
                    `请填写你的 ${currentService?.label} API Key，如无请先至服务商控制台获取。保存后仅显示星号，点击「显示」可查看或编辑。`
                  )}
                </p>
                <div className="config-input-with-icon">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={showApiKey ? (modelListTab === 'image' ? getViewingImageApiKey() : getViewingApiKey()) : ((modelListTab === 'image' ? getViewingImageApiKey() : getViewingApiKey()) ? API_KEY_MASK : '')}
                    onChange={(e) => {
                      const val = e.target.value
                      if (modelListTab === 'image' && onImageConfigChange) {
                        onImageConfigChange({ apiKeys: { ...(imageConfig?.apiKeys || {}), [viewingService]: val } })
                      } else {
                        onConfigChange({ apiKeys: { ...(config.apiKeys || {}), [viewingService]: val } })
                      }
                    }}
                    onFocus={() => { const k = modelListTab === 'image' ? getViewingImageApiKey() : getViewingApiKey(); if (k && !showApiKey) setShowApiKey(true) }}
                    readOnly={!showApiKey && !!(modelListTab === 'image' ? getViewingImageApiKey() : getViewingApiKey())}
                    placeholder={`${currentService?.label} API Key`}
                  />
                  <button
                    type="button"
                    className="ai-icon-btn"
                    onClick={() => setShowApiKey((v) => !v)}
                    title={showApiKey ? '隐藏' : '显示'}
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            <div className="config-field config-field-vertical">
              <label className="config-field-label">API 代理地址</label>
              <p className="config-field-desc">必须包含 http(s)://</p>
              {modelListTab === 'chat' ? (
                <div className="config-input-with-icon">
                  <input
                    type="text"
                    value={showEndpoint ? getViewingEndpoint() : maskEndpoint(getViewingEndpoint())}
                    onChange={(e) =>
                      onConfigChange({
                        endpoints: { ...(config.endpoints || {}), [viewingService]: e.target.value },
                      })
                    }
                    onFocus={() => { const v = getViewingEndpoint(); if (v && !showEndpoint) setShowEndpoint(true) }}
                    readOnly={!showEndpoint && !!getViewingEndpoint()}
                    placeholder={currentService?.endpoint || 'https://api.example.com/v1'}
                  />
                  <button
                    type="button"
                    className="ai-icon-btn"
                    onClick={() => setShowEndpoint((v) => !v)}
                    title={showEndpoint ? '隐藏' : '显示'}
                  >
                    {showEndpoint ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              ) : (
                <>
                  <div className="config-input-with-icon">
                    <input
                      type="text"
                      value={showEndpoint ? getViewingImageEndpoint() : maskEndpoint(getViewingImageEndpoint())}
                      onChange={(e) =>
                        onImageConfigChange?.({
                          endpoints: { ...(imageConfig?.endpoints || {}), [viewingService]: e.target.value },
                        })
                      }
                      onFocus={() => { const v = getViewingImageEndpoint(); if (v && !showEndpoint) setShowEndpoint(true) }}
                      readOnly={!showEndpoint && !!getViewingImageEndpoint()}
                      placeholder={AI_IMAGE_SERVICES.find((s) => s.value === viewingService)?.endpoint || 'https://api.example.com/v1'}
                    />
                    <button
                      type="button"
                      className="ai-icon-btn"
                      onClick={() => setShowEndpoint((v) => !v)}
                      title={showEndpoint ? '隐藏' : '显示'}
                    >
                      {showEndpoint ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="config-hint" style={{ marginTop: 6, fontSize: 12, color: 'var(--muted-color, #8b949e)' }}>
                    {imageServiceForViewing?.modelHint || '不同服务商可能需要更换图片的代理地址，请参考各服务商文档'}
                  </p>
                </>
              )}
            </div>

            <div className="config-field config-field-vertical config-connectivity">
              <label className="config-field-label">连通性检查</label>
              <p className="config-field-desc">测试 API Key 与代理地址是否正确填写{modelListTab === 'image' ? '（图片接口）' : ''}</p>
              <div className="config-connectivity-row">
                <div className="config-connectivity-select">
                  <AnimatedSelect
                    value={testModelSelect}
                    onChange={(value) => setTestModelSelect(value)}
                    options={formTestModelOptions.map((m) => ({ value: m, label: m }))}
                  />
                </div>
                <button
                  type="button"
                  className="ai-btn ai-btn-secondary"
                  onClick={handleFormConnectivityTest}
                  disabled={modelListTab === 'image' ? imageTesting : testing}
                >
                  <TestTube size={14} />
                  {(modelListTab === 'image' ? imageTesting : testing) ? '检查中...' : '检查'}
                </button>
              </div>
            </div>

            <div className="config-security-note">
              <Lock size={14} />
              <span>
                您的秘钥与代理地址等将使用{' '}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://datatracker.ietf.org/doc/html/draft-ietf-avt-srtp-aes-gcm-01"
                  style={{ marginInline: 4 }}
                >
                  AES-GCM
                </a>{' '}
                加密算法进行加密
              </span>
            </div>

            {(modelListTab === 'image' ? imageTestResult : testResult) && (
              <div className={`test-result ${(modelListTab === 'image' ? imageTestResult : testResult)?.success ? 'success' : 'error'}`}>
                {(modelListTab === 'image' ? imageTestResult : testResult)?.message}
              </div>
            )}
          </div>
            )}
          </div>

          {/* 移动端：模型列表可折叠 */}
          <div className={isMobile ? 'ai-config-mobile-section' : ''}>
            {isMobile && (
              <button
                type="button"
                className="ai-config-mobile-section-toggle"
                onClick={() => setMobileModelsOpen((v) => !v)}
                aria-expanded={mobileModelsOpen}
              >
                模型列表
                {mobileModelsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            )}
            {(isMobile ? mobileModelsOpen : true) && (
          <div className="ai-config-models">
            <div className="ai-config-models-header">
              <span className="ai-config-models-title">模型列表</span>
              <span className="ai-config-models-count">
                共 {totalModelCountForViewing} 个模型
              </span>
              {viewingService !== 'builtin' && (
                <button
                  type="button"
                  className="ai-btn ai-btn-secondary ai-btn-sm ai-config-fetch-models-btn"
                  onClick={handleFetchModels}
                  disabled={fetchingModels}
                  title="从服务商 API 在线拉取模型列表，拉取后保存到数据库，后续无需再拉取；再次拉取可增量添加新模型"
                >
                  <RefreshCw size={14} className={fetchingModels ? 'spin' : ''} />
                  {fetchingModels ? '拉取中...' : '获取模型列表'}
                </button>
              )}
            </div>
            {fetchModelsError && (
              <div className="test-result error" style={{ marginBottom: 8 }}>
                {fetchModelsError}
              </div>
            )}
            {modelListTab === 'chat' && (
              <>
                <div className="ai-config-models-list">
                  {filteredModels.length === 0 ? (
                    <div className="ai-config-models-empty">
                      {viewingService !== 'builtin' && !(config.fetchedModelsByService?.[viewingService]?.length)
                        ? '暂无模型，请点击上方「获取模型列表」在线拉取'
                        : '无匹配模型'}
                    </div>
                  ) : (
                    filteredModels.map((model) => {
                      const isCustomChat = customModels.includes(model)
                      const isEditing = editingChatModel === model
                      return (
                        <div
                          key={isEditing ? `edit-${model}` : model}
                          className={`ai-config-model-item${config.type === viewingService && config.model === model ? ' active' : ''}`}
                        >
                          {isEditing ? (
                            <input
                              className="config-custom-model-edit-input ai-config-model-edit-inline"
                              value={editingChatModelValue}
                              onChange={(e) => setEditingChatModelValue(e.target.value)}
                              onBlur={() => handleRenameChatCustom(model, editingChatModelValue)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameChatCustom(model, editingChatModelValue)
                                if (e.key === 'Escape') setEditingChatModel(null)
                              }}
                              autoFocus
                            />
                          ) : (
                            <span className="ai-config-model-name" title={model}>
                              {getChatModelDisplayLabel(model)}
                            </span>
                          )}
                          {!isEditing && (
                            <div className="ai-config-model-item-actions">
                              {rowTestResult?.modelId === model && (
                                <span className={`ai-config-model-row-popover ${rowTestResult.result?.success ? 'success' : 'error'}`} title={rowTestResult.result?.message}>
                                  {rowTestResult.result?.message}
                                </span>
                              )}
                              <button
                                type="button"
                                className="ai-icon-btn ai-icon-btn-sm ai-config-model-check-btn"
                                onClick={(e) => { e.stopPropagation(); handleTest(model) }}
                                disabled={testing}
                                title="连通性检查"
                              >
                                <TestTube size={14} />
                              </button>
                              {isCustomChat && (
                                <>
                                  <button
                                    type="button"
                                    className="ai-icon-btn ai-icon-btn-sm"
                                    onClick={() => { setEditingChatModel(model); setEditingChatModelValue(getChatModelDisplayLabel(model)) }}
                                    title="修改展示名称"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    className="ai-icon-btn ai-icon-btn-sm"
                                    onClick={() => handleRemoveCustomModel(model)}
                                    title="删除"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                className={`ai-config-model-toggle${verifiedSet.has(model) ? ' on' : ''}`}
                                onClick={(e) => toggleModelEnabled(model, e)}
                                title={verifiedSet.has(model) ? '已启用，点击关闭' : '点击启用'}
                              >
                                <span className="ai-config-model-toggle-track">
                                  <span className="ai-config-model-toggle-thumb" />
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
                <div className="config-custom-models">
                  <div className="config-custom-models-add">
                    <button
                      type="button"
                      className="ai-btn ai-btn-secondary ai-btn-sm"
                      onClick={handleOpenAddCustomModelDialog}
                      title="创建自定义 AI 模型"
                    >
                      <Plus size={14} />
                      添加
                    </button>
                  </div>
                  {showAddCustomModelDialog && (
                    <div className="ai-config-dialog-overlay" onClick={() => setShowAddCustomModelDialog(false)}>
                      <div className="ai-config-dialog ai-config-add-model-dialog" onClick={(e) => e.stopPropagation()}>
                        <h3 className="ai-config-dialog-title">创建自定义 AI 模型</h3>
                        <div className="config-field config-field-vertical">
                          <label className="config-field-label">* 模型 ID</label>
                          <input
                            type="text"
                            className="config-input"
                            value={addModelIdInput}
                            onChange={(e) => setAddModelIdInput(e.target.value)}
                            placeholder="请输入模型 id,例如 gpt-4o 或 claude-3.5-sonnet"
                            autoFocus
                          />
                          <p className="config-hint">创建后不可修改,调用AI时将作为模型 id 使用</p>
                        </div>
                        <div className="config-field config-field-vertical">
                          <label className="config-field-label">模型展示名称</label>
                          <input
                            type="text"
                            className="config-input"
                            value={addModelDisplayNameInput}
                            onChange={(e) => setAddModelDisplayNameInput(e.target.value)}
                            placeholder="请输入模型的展示名称,例如 ChatGPT、GPT-4等"
                          />
                        </div>
                        <div className="ai-config-dialog-actions">
                          <button type="button" className="ai-btn ai-btn-secondary" onClick={() => setShowAddCustomModelDialog(false)}>取消</button>
                          <button
                            type="button"
                            className="ai-btn ai-btn-primary"
                            onClick={handleConfirmAddCustomModel}
                            disabled={!addModelIdInput.trim() || allModels.includes(addModelIdInput.trim())}
                          >
                            确定
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            {modelListTab === 'image' && (
              <div className="ai-config-models-image-tab">
                {imageConfig && onImageConfigChange ? (
                  <>
                    <div className="ai-config-models-list">
                      {imageModelListForViewing.length === 0 ? (
                        <div className="ai-config-models-empty">
                          {viewingService !== 'builtin' && !(config.fetchedModelsByService?.[viewingService]?.length)
                            ? '暂无模型，请点击上方「获取模型列表」在线拉取'
                            : imageConfig.type !== viewingService
                              ? '当前文生图未选本服务商，添加模型将自动切换到此服务'
                              : viewingService !== 'builtin' && (config.fetchedModelsByService?.[viewingService]?.length || 0) > 0 && imageModelFullListForViewing.length === 0
                                ? '服务商暂无图片相关模型'
                                : '暂无模型，可在下方添加'}
                        </div>
                      ) : (
                        imageModelListForViewing.map((model) => {
                          const isCustom = imageCustomModelsForViewing.includes(model)
                          const isEditing = editingImageModelInList === model
                          return (
                            <div
                              key={isEditing ? `edit-${model}` : model}
                              className={`ai-config-model-item${imageConfig.type === viewingService && imageConfig.model === (isEditing ? model : model) ? ' active' : ''}`}
                            >
                              {isEditing ? (
                                <input
                                  className="config-custom-model-edit-input ai-config-model-edit-inline"
                                  value={editingImageModelInListValue}
                                  onChange={(e) => setEditingImageModelInListValue(e.target.value)}
                                  onBlur={() => handleRenameImageModelInList(model, editingImageModelInListValue)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRenameImageModelInList(model, editingImageModelInListValue)
                                    if (e.key === 'Escape') setEditingImageModelInList(null)
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <span className="ai-config-model-name" title={model}>{getImageModelDisplayLabel(model)}</span>
                              )}
                              {!isEditing && (
                                <div className="ai-config-model-item-actions">
                                  {rowImageTestResult?.modelId === model && (
                                    <span className={`ai-config-model-row-popover ${rowImageTestResult.result?.success ? 'success' : 'error'}`} title={rowImageTestResult.result?.message}>
                                      {rowImageTestResult.result?.message}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    className="ai-icon-btn ai-icon-btn-sm ai-config-model-check-btn"
                                    onClick={(e) => { e.stopPropagation(); handleImageTest(model) }}
                                    disabled={imageTesting || imageConfig?.type !== viewingService}
                                    title={imageConfig?.type === viewingService ? '连通性检查' : '请先在文生图配置中选中本服务商'}
                                  >
                                    <TestTube size={14} />
                                  </button>
                                  {isCustom && (
                                    <>
                                      <button
                                        type="button"
                                        className="ai-icon-btn ai-icon-btn-sm"
                                        onClick={() => { setEditingImageModelInList(model); setEditingImageModelInListValue(getImageModelDisplayLabel(model)) }}
                                        title="修改展示名称"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        className="ai-icon-btn ai-icon-btn-sm"
                                        onClick={() => removeImageCustomInList(model)}
                                        title="删除"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    className={`ai-config-model-toggle${verifiedImageSetForViewing.has(model) ? ' on' : ''}`}
                                    onClick={(e) => toggleImageModelEnabled(model, e)}
                                    title={verifiedImageSetForViewing.has(model) ? '已启用，点击关闭' : '点击启用'}
                                  >
                                    <span className="ai-config-model-toggle-track">
                                      <span className="ai-config-model-toggle-thumb" />
                                    </span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                    <div className="config-custom-models">
                      <div className="config-custom-models-add">
                        <button
                          type="button"
                          className="ai-btn ai-btn-secondary ai-btn-sm"
                          onClick={handleOpenAddImageModelDialog}
                          title="创建自定义 AI 模型"
                        >
                          <Plus size={14} />
                          添加
                        </button>
                      </div>
                      {showAddImageModelDialog && (
                        <div className="ai-config-dialog-overlay" onClick={() => setShowAddImageModelDialog(false)}>
                          <div className="ai-config-dialog ai-config-add-model-dialog" onClick={(e) => e.stopPropagation()}>
                            <h3 className="ai-config-dialog-title">创建自定义 AI 模型</h3>
                            <div className="config-field config-field-vertical">
                              <label className="config-field-label">* 模型 ID</label>
                              <input
                                type="text"
                                className="config-input"
                                value={addImageModelIdInput}
                                onChange={(e) => setAddImageModelIdInput(e.target.value)}
                                placeholder="请输入模型 id, 例如 gpt-4o 或 claude-3.5-sonnet"
                                autoFocus
                              />
                              <p className="config-hint">创建后不可修改, 调用 AI 时将作为模型 id 使用</p>
                            </div>
                            <div className="config-field config-field-vertical">
                              <label className="config-field-label">模型展示名称</label>
                              <input
                                type="text"
                                className="config-input"
                                value={addImageModelDisplayNameInput}
                                onChange={(e) => setAddImageModelDisplayNameInput(e.target.value)}
                                placeholder="请输入模型的展示名称, 例如 ChatGPT、GPT-4 等"
                              />
                            </div>
                            <div className="ai-config-dialog-actions">
                              <button type="button" className="ai-btn ai-btn-secondary" onClick={() => setShowAddImageModelDialog(false)}>取消</button>
                              <button
                                type="button"
                                className="ai-btn ai-btn-primary"
                                onClick={handleConfirmAddImageModel}
                                disabled={!addImageModelIdInput.trim() || imageModelFullListForViewing.includes(addImageModelIdInput.trim())}
                              >
                                确定
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="ai-config-models-empty">
                    <p>暂无文生图配置</p>
                  </div>
                )}
              </div>
            )}

          </div>
            )}
          </div>

          {modelListTab === 'chat' && (
            <>
              <div className="ai-config-main-form">
                <p className="config-field-global-hint">以下参数对所有模型生效</p>
                <div className="config-field">
                  <label>
                    温度
                    <span className="config-value">{config.temperature}</span>
                  </label>
                  <ElasticSlider
                    min={0}
                    max={20}
                    value={Math.round((config.temperature ?? DEFAULT_CONFIG.temperature) * 10)}
                    onChange={(v) => onConfigChange({ temperature: v / 10 })}
                  />
                  <div className="config-hint">
                    <Info size={12} />
                    <span>控制随机性，0-2，较小值使输出更确定，较大值使其更随机。</span>
                  </div>
                </div>
                <div className="config-field">
                  <label>
                    最大 Token 数
                    <span className="config-value">{config.maxTokens}</span>
                  </label>
                  <ElasticSlider
                    min={256}
                    max={4096}
                    value={config.maxTokens ?? DEFAULT_CONFIG.maxTokens}
                    onChange={(v) => onConfigChange({ maxTokens: Math.round(v / 256) * 256 })}
                  />
                  <div className="config-hint">
                    <Info size={12} />
                    <span>控制回复长度</span>
                  </div>
                </div>
              </div>
            </>
          )}

          </div>
        {/* 保存与重置按钮：固定在右侧面板底部，左侧服务列表贯穿全高 */}
        <div className="ai-config-actions-fixed">
          <button
            type="button"
            className="ai-btn ai-btn-secondary"
            onClick={() =>
              onConfigChange({
                temperature: DEFAULT_CONFIG.temperature,
                maxTokens: DEFAULT_CONFIG.maxTokens,
              })
            }
            title="将温度、最大 Token 数恢复为默认值"
          >
            重置为默认参数
          </button>
          <button
            type="button"
            className="ai-btn ai-btn-primary"
            onClick={handleSave}
          >
            保存
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
