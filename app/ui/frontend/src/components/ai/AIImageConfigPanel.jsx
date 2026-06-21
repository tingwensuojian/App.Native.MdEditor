import React from 'react'
import { X, TestTube, Info, Plus, Trash2 } from 'lucide-react'
import AnimatedSelect from '../AnimatedSelect'
import { AI_IMAGE_SERVICES, DEFAULT_IMAGE_CONFIG } from '../../constants/aiImageConfig'

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

export default function AIImageConfigPanel({ config, onConfigChange, onClose, onTestConnection }) {
  const [testing, setTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState(null)
  const [customModelInput, setCustomModelInput] = React.useState('')

  const currentService = AI_IMAGE_SERVICES.find((s) => s.value === config.type)
  const builtinModels = currentService?.models || []
  const customModels = Array.isArray(config.customModels?.[config.type]) ? config.customModels[config.type] : []
  const allModels = React.useMemo(() => {
    const seen = new Set()
    return [...builtinModels, ...customModels].filter((m) => m && !seen.has(m) && seen.add(m))
  }, [builtinModels, customModels])

  const handleAddCustomModel = () => {
    const name = customModelInput.trim()
    if (!name || allModels.includes(name)) return
    const next = { ...(config.customModels || {}), [config.type]: [...customModels, name] }
    setCustomModelInput('')
    onConfigChange({ customModels: next, model: name })
  }

  const handleRemoveCustomModel = (model) => {
    const next = customModels.filter((m) => m !== model)
    const nextCustom = { ...(config.customModels || {}), [config.type]: next }
    const remaining = [...builtinModels, ...next]
    const newModel = config.model === model ? (remaining[0] || '') : config.model
    onConfigChange({ customModels: nextCustom, model: newModel })
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const result = await onTestConnection()
    setTestResult(result)
    setTesting(false)
  }

  // 测试结果 3 秒后自动消失
  React.useEffect(() => {
    if (!testResult) return
    const t = setTimeout(() => setTestResult(null), 3000)
    return () => clearTimeout(t)
  }, [testResult])

  return (
    <div className="ai-config-panel">
      <div className="ai-config-header">
        <h3>AI 文生图</h3>
        <button className="ai-icon-btn" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="ai-config-content">
        <p className="ai-config-description">
          使用 AI 根据文字描述生成图像
        </p>

        <div className="config-field">
          <label>服务商</label>
          <AnimatedSelect
            value={config.type}
            onChange={(value) => {
              const service = AI_IMAGE_SERVICES.find((s) => s.value === value)
              const models = service?.models || []
              onConfigChange({
                type: value,
                endpoint: service?.endpoint ?? '',
                model: models[0] ?? '',
                size: service?.sizes?.[0] || '1024x1024',
              })
            }}
            options={AI_IMAGE_SERVICES.map((s) => ({ value: s.value, label: s.label }))}
          />
        </div>

        <div className="config-field">
          <label>API 端点</label>
          <input
            type="text"
            value={config.endpoint || ''}
            onChange={(e) => onConfigChange({ endpoint: e.target.value })}
            placeholder="https://proxy-ai.doocs.org/v1"
          />
        </div>

        {currentService?.needsApiKey && (
          <div className="config-field">
            <label>API Key</label>
            <input
              type="password"
              value={config.apiKey || ''}
              onChange={(e) => onConfigChange({ apiKey: e.target.value })}
              placeholder="sk-..."
            />
          </div>
        )}

        <div className="config-field">
          <label>模型</label>
          {(currentService?.models?.length ?? 0) > 0 || customModels.length > 0 ? (
            <>
              <AnimatedSelect
                value={config.model}
                onChange={(v) => onConfigChange({ model: v })}
                options={allModels.map((m) => ({ value: m, label: m }))}
              />
              <div className="config-custom-models">
                <div className="config-custom-models-add">
                  <input
                    type="text"
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    placeholder="输入模型名称并添加"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomModel()}
                  />
                  <button
                    type="button"
                    className="ai-btn ai-btn-secondary ai-btn-sm"
                    onClick={handleAddCustomModel}
                    disabled={!customModelInput.trim()}
                    title="添加自定义模型"
                  >
                    <Plus size={14} />
                    添加
                  </button>
                </div>
                {customModels.length > 0 && (
                  <div className="config-custom-models-list">
                    {customModels.map((m) => (
                      <span key={m} className="config-custom-model-tag">
                        <span
                          className="config-custom-model-tag-label"
                          onClick={() => onConfigChange({ model: m })}
                          title="点击使用"
                        >
                          {m}
                        </span>
                        <button
                          type="button"
                          className="ai-icon-btn ai-icon-btn-sm"
                          onClick={() => handleRemoveCustomModel(m)}
                          title="移除"
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <input
                type="text"
                value={config.model}
                onChange={(e) => onConfigChange({ model: e.target.value })}
                placeholder="输入模型名称"
              />
              <div className="config-custom-models">
                <div className="config-custom-models-add">
                  <input
                    type="text"
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    placeholder="添加常用模型"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomModel()}
                  />
                  <button
                    type="button"
                    className="ai-btn ai-btn-secondary ai-btn-sm"
                    onClick={handleAddCustomModel}
                    disabled={!customModelInput.trim()}
                    title="添加"
                  >
                    <Plus size={14} />
                    添加
                  </button>
                </div>
                {customModels.length > 0 && (
                  <div className="config-custom-models-list">
                    {customModels.map((m) => (
                      <span key={m} className="config-custom-model-tag">
                        <span
                          className="config-custom-model-tag-label"
                          onClick={() => onConfigChange({ model: m })}
                          title="点击使用"
                        >
                          {m}
                        </span>
                        <button
                          type="button"
                          className="ai-icon-btn ai-icon-btn-sm"
                          onClick={() => handleRemoveCustomModel(m)}
                          title="移除"
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="config-field">
          <label>图像尺寸</label>
          <AnimatedSelect
            value={config.size}
            onChange={(v) => onConfigChange({ size: v })}
            options={(currentService?.sizes || ['1024x1024']).map((s) => ({
              value: s,
              label: SIZE_LABELS[s] || s,
            }))}
          />
        </div>

        {config.type === 'builtin' && (
          <div className="config-hint" style={{ marginBottom: 16 }}>
            <Info size={12} />
            <span>默认图像服务免费使用，无需配置 API Key，支持 Kwai-Kolors/Kolors 模型。</span>
          </div>
        )}

        <div className="config-actions">
          <button className="ai-btn ai-btn-secondary" onClick={() => onConfigChange(DEFAULT_IMAGE_CONFIG)}>
            清空
          </button>
          <button
            className="ai-btn ai-btn-secondary"
            onClick={handleTest}
            disabled={testing}
          >
            <TestTube size={16} />
            {testing ? '测试中...' : '测试连接'}
          </button>
          <button className="ai-btn ai-btn-primary" onClick={onClose}>
            保存配置
          </button>
        </div>

        {testResult && (
          <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
            {testResult.message}
          </div>
        )}
      </div>
    </div>
  )
}
