import { useState, useEffect, useCallback, useRef } from 'react'
import { loadSetting, persistSetting } from '../../utils/settingsApi'
import { safeParseJsonResponse } from '../../utils/fetchUtils'
import { DEFAULT_IMAGE_CONFIG } from '../../constants/aiImageConfig'

export function useAIImage() {
  const [config, setConfig] = useState(DEFAULT_IMAGE_CONFIG)
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [resultUrl, setResultUrl] = useState(null)
  const [resultUrls, setResultUrls] = useState([])
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])
  const abortRef = useRef(null)
  const hasInitialConfigLoad = useRef(false)

  // 从数据库加载文生图历史
  useEffect(() => {
    fetch('api/ai/image/history')
      .then((r) => safeParseJsonResponse(r, { ok: false }))
      .then((data) => {
        if (data?.ok && Array.isArray(data?.items)) {
          setHistory(data.items.map((it) => ({ id: it.id, prompt: it.prompt, url: it.url, time: it.time })))
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadSetting('aiImageConfig', null).then((saved) => {
      if (saved && typeof saved === 'object') {
        const merged = {
          ...DEFAULT_IMAGE_CONFIG,
          ...saved,
          customModels: { ...(DEFAULT_IMAGE_CONFIG.customModels || {}), ...(saved.customModels || {}) },
          endpoints: { ...(DEFAULT_IMAGE_CONFIG.endpoints || {}), ...(saved.endpoints || {}) },
          apiKeys: { ...(DEFAULT_IMAGE_CONFIG.apiKeys || {}), ...(saved.apiKeys || {}) },
        }
        setConfig(merged)
      }
      hasInitialConfigLoad.current = true
    })
  }, [])

  // 配置（含自定义模型）持久化到服务器
  useEffect(() => {
    if (!hasInitialConfigLoad.current) return
    persistSetting('aiImageConfig', config).catch((err) => {
      console.error('[useAIImage] 保存文生图配置到服务器失败:', err)
    })
  }, [config])

  /** 使用指定配置发起生成（用于与对话共用 API 时传入合并后的 effectiveConfig） */
  const generateWithConfig = useCallback(async (overrideConfig, extraParams = {}) => {
    const text = prompt.trim()
    if (!text || generating) return
    const c = overrideConfig || config

    setGenerating(true)
    setError(null)
    setResultUrl(null)
    setResultUrls([])
    abortRef.current = new AbortController()

    const body = {
      endpoint: c.endpoint,
      apiKey: c.apiKey || undefined,
      model: c.model,
      size: c.size || '1024x1024',
      prompt: text,
    }
    if (extraParams.seed != null) body.seed = extraParams.seed
    if (extraParams.count != null) body.count = Math.min(Math.max(1, extraParams.count), 8)
    if (Array.isArray(extraParams.referenceImages) && extraParams.referenceImages.length > 0) {
      body.referenceImages = extraParams.referenceImages
    }

    try {
      const res = await fetch('api/ai/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      })
      const raw = await res.text()
      let data = {}
      try {
        data = raw ? JSON.parse(raw) : {}
      } catch (_) {
        data = { ok: false, message: res.status === 400 ? '请求参数有误，请检查模型与配置' : '生成失败' }
      }
      const debugInfo = data?.debug ?? data?._debug
      if (debugInfo) {
        console.warn('[AI 图片生成] 调试信息:', debugInfo)
      }
      let errMsg = data?.message || (res.status === 400 ? '请求参数有误，请检查模型与配置' : '生成失败')
      if (typeof errMsg === 'string' && /^\s*bad\s*request\s*$/i.test(errMsg)) {
        errMsg = '请求参数有误：请检查模型名、出图尺寸或 API Key 是否符合该服务商要求'
      }
      if (!data?.ok) {
        console.log('[AI 图片生成] 失败响应:', { ok: data?.ok, status: res.status, message: errMsg, code: data?.code })
        throw new Error(errMsg)
      }

      // 自动保存到图片库（不压缩），插入时使用本地路径
      const urls = Array.isArray(data.urls) && data.urls.length > 0 ? data.urls : (data.url ? [data.url] : [])
      let displayUrls = [...urls]
      if (urls.length > 0) {
        try {
          const saved = await Promise.all(
            urls.map((url) =>
              fetch('api/image/fetch-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, alt: 'AI生成' }),
              }).then((r) => r.json())
            )
          )
          displayUrls = saved.map((s, i) => (s?.ok && s?.url ? s.url : urls[i] || '')).filter(Boolean)
        } catch (_) {}
      }
      setResultUrl(displayUrls[0] || null)
      setResultUrls(displayUrls)
      const newItem = { prompt: text, url: displayUrls[0], urls: displayUrls, time: Date.now() }
      setHistory((h) => [newItem, ...h.slice(0, 49)])
      // 保存到数据库（多图时保存第一张）
      fetch('api/ai/image/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, url: displayUrls[0] }),
      })
        .then((r) => safeParseJsonResponse(r, { ok: false }))
        .then((data) => {
          if (data?.ok && data?.id) {
            setHistory((h) => h.map((it, i) => (i === 0 && !it.id ? { ...it, id: data.id } : it)))
          }
        })
        .catch(() => {})
    } catch (err) {
      if (err.name === 'AbortError') return
      let msg = err.message || '生成失败'
      if (/^\s*bad\s*request\s*$/i.test(msg)) msg = '请求参数有误：请检查模型名、出图尺寸或 API Key 是否符合该服务商要求'
      setError(msg)
    } finally {
      setGenerating(false)
      abortRef.current = null
    }
  }, [prompt, config, generating])

  const generate = useCallback(async () => {
    return generateWithConfig(config)
  }, [config, generateWithConfig])

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
  }, [])

  const testConnection = useCallback(async (overrides = {}) => {
    const model = overrides.model ?? config.model
    const endpoint = overrides.endpoint ?? config.endpoint
    const apiKey = overrides.apiKey ?? config.apiKey
    const reqBody = {
      endpoint,
      apiKey: apiKey || undefined,
      model,
      size: config.size || '1024x1024',
      prompt: '一只橘色的小猫坐在窗台上',
    }
    try {
      const isHunyuan = /hunyuan|tencentcloudapi\.com/i.test(endpoint || '') || /hunyuan-image/i.test(model || '')
      const keyStr = typeof apiKey === 'string' ? apiKey.trim() : ''
      const colonIdx = keyStr.indexOf(':')
      const secretIdLen = colonIdx >= 0 ? keyStr.slice(0, colonIdx).trim().length : 0
      const secretKeyLen = colonIdx >= 0 ? keyStr.slice(colonIdx + 1).trim().length : 0
      console.log('[AI 图片连通性测试] 请求参数:', { ...reqBody, apiKey: apiKey ? '***' : undefined })
      if (isHunyuan) {
        console.warn('[AI 图片连通性测试] 混元 Key 本地校验:', {
          keyLength: keyStr.length,
          hasColon: colonIdx >= 0,
          secretIdLength: secretIdLen,
          secretKeyLength: secretKeyLen,
          formatOk: colonIdx >= 0 && secretIdLen > 0 && secretKeyLen > 0,
        })
        if (keyStr.length === 0) {
          console.warn('[AI 图片连通性测试] 提示：API Key 为空，请先在图片配置中填写 SecretId:SecretKey 并保存')
        } else if (colonIdx < 0 || secretIdLen === 0 || secretKeyLen === 0) {
          console.warn('[AI 图片连通性测试] 提示：格式应为 SecretId:SecretKey（英文冒号连接，前后无空格）')
        }
      }
      const res = await fetch('api/ai/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      })
      const raw = await res.text()
      let data = {}
      try {
        data = raw ? JSON.parse(raw) : {}
      } catch (_) {
        if (!res.ok) data = { message: res.status === 400 ? '请求参数有误，请检查模型与配置' : '连接失败' }
      }
      // 调试信息输出到浏览器控制台
      const debugInfo = data?.debug ?? data?._debug
      if (debugInfo) {
        console.warn('[AI 图片连通性测试] 调试信息:', debugInfo)
        if (data?.code === 'INVALID_API_KEY' && debugInfo.receivedLength === 0) {
          console.warn('[AI 图片连通性测试] 提示：API Key 未传入或为空，请确认已选择腾讯混元服务商并在图片配置中填写 SecretId:SecretKey 后保存')
        }
      }
      console.log('[AI 图片连通性测试] 响应:', { ok: data?.ok, status: res.status, message: data?.message, code: data?.code })
      if (!data?.ok && !debugInfo) {
        console.warn('[AI 图片连通性测试] 完整响应体:', data)
      }
      let msg = data?.message || (res.status === 400 ? '请求参数有误，请检查模型与配置' : '连接失败')
      if (typeof msg === 'string' && /^\s*bad\s*request\s*$/i.test(msg)) {
        msg = '请求参数有误：请检查模型名、出图尺寸或 API Key 是否符合该服务商要求'
      }
      return data?.ok ? { success: true, message: '连接成功' } : { success: false, message: msg }
    } catch (e) {
      console.warn('[AI 图片连通性测试] 异常:', e)
      return { success: false, message: e.message || '连接失败' }
    }
  }, [config])

  const removeHistoryItem = useCallback(async (idOrItem) => {
    const id = typeof idOrItem === 'object' ? idOrItem?.id : idOrItem
    const match = (it) =>
      id != null ? it.id === id : typeof idOrItem === 'object' && it.prompt === idOrItem.prompt && it.url === idOrItem.url
    setHistory((h) => h.filter((it) => !match(it)))
    if (id != null) {
      try {
        await fetch(`api/ai/image/history/${id}`, { method: 'DELETE' })
      } catch (_) {}
    }
  }, [])

  return {
    config,
    setConfig,
    prompt,
    setPrompt,
    generating,
    resultUrl,
    setResultUrl,
    resultUrls,
    setResultUrls,
    error,
    history,
    generate,
    generateWithConfig,
    cancel,
    testConnection,
    removeHistoryItem,
  }
}
