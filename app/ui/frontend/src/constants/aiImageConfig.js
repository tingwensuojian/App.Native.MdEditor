// AI 文生图配置常量
// 服务商与 AI 对话保持一致，每家仅保留文生图模型

// 文生图模型 ID 特征（用于从 /v1/models 拉取结果中区分对话模型与图片模型）
const IMAGE_MODEL_PATTERNS = [
  /flux/i, /kolors/i, /dall-e/i, /wanx/i, /cogview/i, /black-forest/i,
  /schnell/i, /qwen-image/i, /stable-diffusion/i, /seedream/i,
  /flux\.1/i, /flux-1/i, /image-edit/i,
  /wan2\.6|wan2\.5|wan2\.2|z-image/i,
  /hunyuan-image/i, // 腾讯混元生图
]

export function isImageModel(modelId) {
  if (!modelId || typeof modelId !== 'string') return false
  return IMAGE_MODEL_PATTERNS.some((p) => p.test(modelId))
}

const DEFAULT_SIZES = ['1024x1024', '768x768', '512x512', '1024x768', '768x1024', '1280x720', '720x1280']

export const SIZE_LABELS = {
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

export const AI_IMAGE_SERVICES = [
  {
    value: 'builtin',
    label: '内置服务（免费）',
    endpoint: 'https://proxy-ai.doocs.org/v1',
    needsApiKey: false,
    models: ['Kwai-Kolors/Kolors'],
    sizes: DEFAULT_SIZES,
  },
  {
    value: 'hunyuan',
    label: '腾讯混元',
    endpoint: 'https://hunyuan.tencentcloudapi.com',
    needsApiKey: true,
    helpUrl: 'https://cloud.tencent.com/document/product/1729/105968',
    modelHint: 'API Key 填 SecretId:SecretKey（从腾讯云控制台-访问管理-API密钥获取）；hunyuan-image=混元生图，hunyuan-image-lite=文生图轻量版',
    models: ['hunyuan-image', 'hunyuan-image-lite'],
    sizes: ['1024x1024', '768x768', '768x1024', '1024x768', '1280x720', '720x1280', '768x1280', '1280x768', '1920x1080', '1080x1920'],
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1',
    needsApiKey: true,
    models: [], // DeepSeek 暂无文生图 API
    sizes: DEFAULT_SIZES,
  },
  {
    value: 'moonshot',
    label: '月之暗面（Kimi）',
    endpoint: 'https://api.moonshot.cn/v1',
    needsApiKey: true,
    models: [],
    sizes: DEFAULT_SIZES,
  },
  {
    value: 'aliyun-bailian',
    label: 'Aliyun Bailian',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    needsApiKey: true,
    models: ['wan2.6-t2i', 'wan2.5-t2i-preview', 'z-image-turbo'],
    sizes: DEFAULT_SIZES,
  },
  {
    value: 'wenxin',
    label: '百度千帆',
    endpoint: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
    needsApiKey: true,
    models: [],
    sizes: DEFAULT_SIZES,
  },
  {
    value: 'zhipu',
    label: '智谱 AI',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4',
    needsApiKey: true,
    models: [],
    sizes: DEFAULT_SIZES,
  },
  {
    value: 'siliconflow',
    label: '硅基流动',
    endpoint: 'https://api.siliconflow.cn/v1',
    needsApiKey: true,
    models: [], // 在线拉取，不默认配置
    sizes: DEFAULT_SIZES,
  },
  {
    value: 'doubao',
    label: '火山方舟（豆包）',
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3',
    needsApiKey: true,
    models: [], // Seedream API 格式不同，暂用自定义
    sizes: DEFAULT_SIZES,
  },
  {
    value: 'openai',
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    needsApiKey: true,
    models: [], // 在线拉取，不默认配置
    sizes: ['1024x1024', '1024x1792', '1792x1024', '512x512', '256x256'],
  },
  {
    value: 'ollama',
    label: 'Ollama',
    endpoint: 'http://localhost:11434/v1',
    needsApiKey: false,
    models: [],
    sizes: DEFAULT_SIZES,
  },
  {
    value: 'custom',
    label: '自定义（兼容 OpenAI Images API）',
    endpoint: '',
    needsApiKey: true,
    models: [], // 在线拉取，不默认配置
    sizes: [...DEFAULT_SIZES, '1920x1080', '1080x1920', '1024x1792', '1792x1024', '256x256'],
  },
]

/** 连通性检查专用默认图片模型（按服务商，用于测试图片 endpoint/apiKey 是否可用） */
export const CONNECTIVITY_TEST_DEFAULT_IMAGE_MODELS = {
  builtin: ['Kwai-Kolors/Kolors'],
  hunyuan: ['hunyuan-image-lite', 'hunyuan-image'],
  'aliyun-bailian': ['wan2.6-t2i', 'wan2.5-t2i-preview'],
  openai: ['dall-e-3', 'dall-e-2'],
  siliconflow: ['black-forest-labs/FLUX.1-schnell', 'black-forest-labs/FLUX.1-dev'],
  doubao: ['seedream-3.0'],
  custom: ['dall-e-2', 'black-forest-labs/FLUX.1-schnell'],
}

export const DEFAULT_IMAGE_CONFIG = {
  type: 'builtin',
  endpoint: 'https://proxy-ai.doocs.org/v1',
  endpoints: {}, // 各服务商图片代理地址 { [serviceType]: string }，与对话 endpoints 分离
  apiKeys: {}, // 各服务商图片专用 API Key（如腾讯混元图片需 SecretId:SecretKey，与对话不同）
  apiKey: '',
  model: 'Kwai-Kolors/Kolors',
  size: '1024x1024',
  customModels: {}, // 各服务商自定义模型 { [serviceType]: string[] }，每项为模型 ID
  customModelLabels: {}, // 自定义模型展示名称 { [serviceType]: { [modelId]: string } }，创建后可修改展示名
  verifiedImageModelsByService: {}, // 各服务商已启用的文生图模型 { [serviceType]: string[] }，与对话的 verifiedModelsByService 一致
}
