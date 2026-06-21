// AI 服务调用工具
export class AIService {
  constructor(config) {
    this.config = config
  }

  // 更新配置
  updateConfig(config) {
    this.config = { ...this.config, ...config }
  }

  // 发送消息（流式响应）
  async sendMessage(messages, onChunk, onComplete, onError) {
    const { endpoint, apiKey, model, temperature, maxTokens } = this.config

    try {
      // 构建请求 URL
      const url = endpoint.endsWith('/chat/completions')
        ? endpoint
        : `${endpoint}/chat/completions`

      // 构建请求体
      const payload = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }

      // 构建请求头
      const headers = {
        'Content-Type': 'application/json',
      }

      // 如果需要 API Key
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`
      }

      // 发送请求
      const response = await fetch('api/ai/chat/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          apiKey: apiKey || undefined,
          model,
          messages,
          temperature,
          maxTokens,
          stream: true,
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        const msg = errData?.message || errData?.error?.message || `${response.status} ${response.statusText}`
        throw new Error(msg)
      }

      // 处理流式响应
      await this.handleStreamResponse(response, onChunk, onComplete, onError)
    } catch (error) {
      console.error('AI 服务调用失败:', error)
      onError?.(error)
    }
  }

  // 处理流式响应
  async handleStreamResponse(response, onChunk, onComplete, onError) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue

          try {
            // 移除 "data: " 前缀
            const jsonStr = trimmed.startsWith('data: ')
              ? trimmed.slice(6)
              : trimmed

            const data = JSON.parse(jsonStr)
            const delta = data.choices?.[0]?.delta || {}

            // 处理内容
            if (delta.content) {
              onChunk?.(delta.content)
            }

            // 处理推理过程（DeepSeek R1）
            if (delta.reasoning_content) {
              onChunk?.(delta.reasoning_content, 'reasoning')
            }
          } catch (parseError) {
            console.warn('解析 SSE 数据失败:', parseError, trimmed)
          }
        }
      }

      onComplete?.()
    } catch (error) {
      console.error('处理流式响应失败:', error)
      onError?.(error)
    }
  }

  // 测试连接（通过后端代理，避免 SSL/CORS 问题）
  // overrides: { type, endpoint, apiKey, model } 来自配置面板连通性检查
  async testConnection(overrides = {}) {
    const endpoint = overrides.endpoint ?? this.config.endpoint
    const apiKey = overrides.apiKey ?? this.config.apiKey
    let model = overrides.model ?? this.config.model
    // DashScope/百炼：强制使用 qwen-turbo 测试，避免选中音频模型导致 asr 报错
    if (['aliyun-bailian', 'qwen'].includes(overrides.type)) {
      model = 'qwen-turbo'
    }

    try {
      const response = await fetch('api/ai/chat/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          apiKey: apiKey || undefined,
          model,
          messages: [{ role: 'user', content: 'ping' }],
          temperature: 0,
          maxTokens: 1,
          stream: false,
        }),
      })

      if (response.ok) {
        const data = await response.json().catch(() => ({}))
        if (data?.error) {
          return { success: false, message: data.error.message || '连接失败' }
        }
        return { success: true, message: '连接成功' }
      } else {
        const data = await response.json().catch(() => ({}))
        let msg = data?.message || `连接失败: ${response.status} ${response.statusText}`
        // 404 且无后端错误信息时，可能是后端未启动；有 message 时多为上游 endpoint 返回 404
        if (response.status === 404 && !data?.message) {
          msg = 'AI 对话代理接口未就绪，请执行 bash build-and-deploy.sh --local 更新后端并重启应用'
        }
        return { success: false, message: msg }
      }
    } catch (error) {
      return {
        success: false,
        message: `连接失败: ${error.message}`,
      }
    }
  }
}
