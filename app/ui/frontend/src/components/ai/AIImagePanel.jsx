import React from 'react'
import { createPortal } from 'react-dom'
import { X, Settings, Image as ImageIcon, Search, Trash2, Loader2, MessageSquare, Check, ChevronDown, ChevronUp, Upload, RefreshCw, Play } from 'lucide-react'
import Resizer from '../Resizer'
import { AI_IMAGE_SERVICES, SIZE_LABELS, isImageModel } from '../../constants/aiImageConfig'

const INPUT_HEIGHT_MIN = 80
const INPUT_HEIGHT_MAX = 400
const INPUT_HEIGHT_DEFAULT = 180

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

/** 根据尺寸字符串渲染比例图标（正方形/横版/竖版） */
function SizeIcon({ size, className }) {
  const [w, h] = (size || '1024x1024').split('x').map(Number).filter(Boolean)
  if (!w || !h) return null
  const isSquare = w === h
  const isLandscape = w > h
  const box = 24
  let rw, rh
  if (isSquare) {
    rw = rh = 14
  } else if (isLandscape) {
    rw = box - 4
    rh = Math.round((box - 4) * h / w)
  } else {
    rh = box - 4
    rw = Math.round((box - 4) * w / h)
  }
  const x = (box - rw) / 2
  const y = (box - rh) / 2
  const dash = '2,2'
  const leftRightDashed = isSquare || isLandscape
  return (
    <svg className={className} width={box} height={box} viewBox={`0 0 ${box} ${box}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {leftRightDashed ? (
        <>
          <line x1={x} y1={y} x2={x} y2={y + rh} strokeDasharray={dash} />
          <line x1={x + rw} y1={y} x2={x + rw} y2={y + rh} strokeDasharray={dash} />
          <line x1={x} y1={y} x2={x + rw} y2={y} />
          <line x1={x} y1={y + rh} x2={x + rw} y2={y + rh} />
        </>
      ) : (
        <>
          <line x1={x} y1={y} x2={x + rw} y2={y} strokeDasharray={dash} />
          <line x1={x} y1={y + rh} x2={x + rw} y2={y + rh} strokeDasharray={dash} />
          <line x1={x} y1={y} x2={x} y2={y + rh} />
          <line x1={x + rw} y1={y} x2={x + rw} y2={y + rh} />
        </>
      )}
    </svg>
  )
}

export default function AIImagePanel({
  config,
  prompt,
  setPrompt,
  generating,
  resultUrl,
  resultUrls = [],
  error,
  history,
  onGenerate,
  onCancel,
  onOpenConfig,
  onClose,
  onSwitchToChat,
  onInsertImage,
  onImageConfigChange,
  onOpenImageManager,
  onDeleteHistory,
  onSelectHistoryItem,
}) {
  const sizeOptions = React.useMemo(() => {
    const svc = AI_IMAGE_SERVICES.find((s) => s.value === config?.type)
    const sizes = svc?.sizes || ['1024x1024']
    return sizes.map((s) => {
      const raw = SIZE_LABELS[s] || s
      const label = raw.includes(' (') ? raw.replace(' (', '\n(') : raw
      return { value: s, label }
    })
  }, [config?.type])

  /** 所有已启用服务商下已启用的文生图模型（与 AI 对话区模型选择逻辑一致） */
  const connectableImageModels = React.useMemo(() => {
    const disabled = new Set(config?.disabledProviders || [])
    const verified = config?.verifiedImageModelsByService || {}
    return AI_IMAGE_SERVICES.flatMap((s) => {
      if (disabled.has(s.value)) return []
      const list = verified[s.value]
      if (s.value === 'builtin') {
        const builtin = s.models || []
        const custom = Array.isArray(config?.customModels?.[s.value]) ? config.customModels[s.value] : []
        const full = [...builtin, ...custom].filter(Boolean)
        const seen = new Set()
        const all = full.filter((m) => !seen.has(m) && seen.add(m))
        const enabled = (list != null && list.length > 0) ? all.filter((m) => list.includes(m)) : all
        return enabled.map((model) => ({ serviceType: s.value, serviceLabel: s.label, model }))
      }
      const fetched = config?.fetchedModelsByService?.[s.value] || []
      const source = fetched.filter((m) => isImageModel(m))
      const custom = Array.isArray(config?.customModels?.[s.value]) ? config.customModels[s.value] : []
      const full = [...source, ...custom].filter(Boolean)
      const seen = new Set()
      const all = full.filter((m) => !seen.has(m) && seen.add(m))
      if (list == null || list.length === 0) return all.map((model) => ({ serviceType: s.value, serviceLabel: s.label, model }))
      return all.filter((m) => list.includes(m)).map((model) => ({ serviceType: s.value, serviceLabel: s.label, model }))
    })
  }, [config?.disabledProviders, config?.verifiedImageModelsByService, config?.customModels, config?.fetchedModelsByService])

  const [modelSearch, setModelSearch] = React.useState('')
  const filteredImageModels = React.useMemo(() => {
    if (!modelSearch.trim()) return connectableImageModels
    const q = modelSearch.trim().toLowerCase()
    return connectableImageModels.filter(
      (item) =>
        item.model.toLowerCase().includes(q) || item.serviceLabel.toLowerCase().includes(q)
    )
  }, [connectableImageModels, modelSearch])

  const groupedImageByService = React.useMemo(() => {
    const map = new Map()
    for (const item of filteredImageModels) {
      const key = item.serviceType
      if (!map.has(key)) map.set(key, { serviceType: item.serviceType, serviceLabel: item.serviceLabel, models: [] })
      map.get(key).models.push(item.model)
    }
    return Array.from(map.values())
  }, [filteredImageModels])

  const [showModelSwitcher, setShowModelSwitcher] = React.useState(false)
  const [modelSwitcherPosition, setModelSwitcherPosition] = React.useState({ top: 0, left: 0, useTop: true })
  const [modelSwitcherPositionReady, setModelSwitcherPositionReady] = React.useState(false)
  const modelSwitcherButtonRef = React.useRef(null)
  const modelSwitcherPopoverRef = React.useRef(null)

  // 浮框位置：优先显示在按钮下方；在上方时用 bottom 锚定，避免内容较少时与按钮间距过大
  React.useLayoutEffect(() => {
    if (!showModelSwitcher || !modelSwitcherButtonRef.current) {
      setModelSwitcherPositionReady(false)
      return
    }
    const rect = modelSwitcherButtonRef.current.getBoundingClientRect()
    const dropdownHeight = 320
    const dropdownWidth = 280
    const spaceAbove = rect.top - 8
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - dropdownWidth - 8))
    if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
      const top = Math.min(rect.bottom + 8, window.innerHeight - dropdownHeight - 8)
      setModelSwitcherPosition({ top, left, useTop: true })
    } else {
      const bottom = window.innerHeight - rect.top + 8
      setModelSwitcherPosition({ bottom, left, useTop: false })
    }
    setModelSwitcherPositionReady(true)
  }, [showModelSwitcher])

  React.useEffect(() => {
    if (!showModelSwitcher) return
    const onDocClick = (e) => {
      const inButton = modelSwitcherButtonRef.current?.contains(e.target)
      const inPopover = modelSwitcherPopoverRef.current?.contains(e.target)
      if (!inButton && !inPopover) setShowModelSwitcher(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('touchstart', onDocClick, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('touchstart', onDocClick)
    }
  }, [showModelSwitcher])

  const currentImageModel = config?.model || ''
  const currentImageServiceLabel = AI_IMAGE_SERVICES.find((s) => s.value === config?.type)?.label || ''
  const isCurrentImageModelAvailable = connectableImageModels.some(
    (m) => m.model === currentImageModel && m.serviceType === config?.type
  )
  const displayImageModelLabel =
    connectableImageModels.length === 0 || !isCurrentImageModelAvailable
      ? '选择模型'
      : currentImageServiceLabel && currentImageModel
        ? `${currentImageServiceLabel} / ${currentImageModel}`
        : currentImageModel || '选择模型'

  const inputRef = React.useRef(null)
  const [showHistory, setShowHistory] = React.useState(false)
  const [previewUrl, setPreviewUrl] = React.useState(null)
  const isMobile = useIsMobile()
  const [advancedOpen, setAdvancedOpen] = React.useState(false)

  // 种子、数量、参考图（UI 状态，API 暂仅支持单图）
  const [seed, setSeed] = React.useState(() => Math.floor(Math.random() * 1000000))
  const [count, setCount] = React.useState(1)
  const [referenceFiles, setReferenceFiles] = React.useState([])
  const [referencePreviews, setReferencePreviews] = React.useState([])
  const refFileInputRef = React.useRef(null)
  const [inputAreaHeight, setInputAreaHeight] = React.useState(INPUT_HEIGHT_DEFAULT)

  const handleInputResize = React.useCallback((delta) => {
    setInputAreaHeight((h) => Math.min(INPUT_HEIGHT_MAX, Math.max(INPUT_HEIGHT_MIN, h - delta)))
  }, [])

  const handleSeedRefresh = () => {
    const next = Math.floor(Math.random() * 1000000)
    setSeed(next)
  }

  const handleRefFiles = (e) => {
    const files = Array.from(e.target?.files || [])
    const valid = files.filter((f) => f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024)
    if (valid.length < files.length) return
    setReferenceFiles(valid)
    Promise.all(valid.map((f) => new Promise((res) => { const r = new FileReader(); r.onload = (ev) => res(ev.target.result); r.readAsDataURL(f) })))
      .then(setReferencePreviews)
    if (e.target && 'value' in e.target) e.target.value = ''
  }

  const removeRefFile = (idx) => {
    setReferenceFiles((prev) => prev.filter((_, i) => i !== idx))
    setReferencePreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = (e) => {
    e?.preventDefault()
    if (!prompt.trim() || generating) return
    const seedNum = typeof seed === 'number' ? seed : (parseInt(String(seed || ''), 10) || undefined)
    const extra = {
      seed: seedNum,
      count: Math.min(Math.max(1, count), 8),
      referenceImages: referencePreviews.length > 0 ? referencePreviews : undefined,
    }
    onGenerate?.(extra)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const currentSize = config?.size || '1024x1024'
  const countOptions = [1, 2, 4, 8]

  /** 高级设置内容（模型、尺寸、种子、数量、参考图），桌面在侧边栏、移动端在可折叠区 */
  const renderAdvancedContent = () => (
    <>
      {onImageConfigChange && (
        <div className="ai-image-sidebar-section">
          <div className="ai-image-sidebar-label">模型</div>
          <div className="ai-image-model-switcher-wrap">
            <button
              ref={modelSwitcherButtonRef}
              type="button"
              className="ai-image-model-select-btn"
              onClick={() => { setShowModelSwitcher((v) => !v); setModelSearch('') }}
              title="切换模型"
              disabled={generating}
            >
              <span className="ai-image-model-select-label">{displayImageModelLabel}</span>
              {showModelSwitcher ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showModelSwitcher && modelSwitcherPositionReady && createPortal(
              <div
                role="dialog"
                aria-label="切换文生图模型"
                className={`ai-model-switcher-dropdown ${document.querySelector('.app')?.classList.contains('theme-light') ? 'theme-light' : 'theme-dark'}`}
                style={{
                  position: 'fixed',
                  ...(modelSwitcherPosition.useTop
                    ? { top: modelSwitcherPosition.top }
                    : { bottom: modelSwitcherPosition.bottom }),
                  left: modelSwitcherPosition.left,
                  zIndex: 9999,
                  width: 280,
                  maxHeight: 320,
                }}
              >
                <div
                  ref={modelSwitcherPopoverRef}
                  className="ai-model-switcher-popover ai-model-switcher-popover-fixed"
                >
                  <div className="ai-model-switcher-search">
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="搜索模型"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="ai-model-switcher-list">
                    {groupedImageByService.length === 0 ? (
                      <div className="ai-model-switcher-empty">无匹配模型</div>
                    ) : (
                      groupedImageByService.map((group) => (
                        <div key={group.serviceType} className="ai-model-switcher-group">
                          <div className="ai-model-switcher-group-title">{group.serviceLabel}</div>
                          {group.models.map((model) => {
                            const svc = AI_IMAGE_SERVICES.find((s) => s.value === group.serviceType)
                            const sizes = svc?.sizes || ['1024x1024']
                            const firstSize = sizes[0] || '1024x1024'
                            return (
                              <button
                                key={`${group.serviceType}:${model}`}
                                type="button"
                                className={`ai-model-switcher-item${config?.type === group.serviceType && currentImageModel === model ? ' active' : ''}`}
                                onClick={() => {
                                  onImageConfigChange({
                                    type: group.serviceType,
                                    model,
                                    size: config?.type === group.serviceType ? (config?.size || firstSize) : firstSize,
                                  })
                                  setShowModelSwitcher(false)
                                }}
                              >
                                <span className="ai-model-switcher-item-label">{model}</span>
                                {config?.type === group.serviceType && currentImageModel === model && <Check size={16} />}
                              </button>
                            )
                          })}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>,
              document.body
            )}
          </div>
        </div>
      )}
      {onImageConfigChange && sizeOptions.length > 0 && (
        <div className="ai-image-sidebar-section">
          <div className="ai-image-sidebar-label">尺寸</div>
          <div className="ai-image-size-grid">
            {sizeOptions.slice(0, 6).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`ai-image-size-option${currentSize === opt.value ? ' active' : ''}`}
                onClick={() => onImageConfigChange({ size: opt.value })}
                disabled={generating}
                title={opt.label}
              >
                <SizeIcon size={opt.value} className="ai-image-size-icon" />
                <span className="ai-image-size-text">{opt.value}</span>
              </button>
            ))}
          </div>
          {sizeOptions.length > 6 && (
            <div className="ai-image-size-grid ai-image-size-grid-row2">
              {sizeOptions.slice(6, 10).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`ai-image-size-option${currentSize === opt.value ? ' active' : ''}`}
                  onClick={() => onImageConfigChange({ size: opt.value })}
                  disabled={generating}
                  title={opt.label}
                >
                  <SizeIcon size={opt.value} className="ai-image-size-icon" />
                  <span className="ai-image-size-text">{opt.value}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="ai-image-sidebar-section">
        <div className="ai-image-sidebar-label">
          种子
          <span className="ai-image-sidebar-hint">相同种子+相同提示词可复现相似图像</span>
        </div>
        <div className="ai-image-seed-row">
          <input
            type="text"
            className="ai-image-seed-input"
            placeholder="随机种子"
            value={seed}
            onChange={(e) => setSeed(e.target.value.replace(/\D/g, '').slice(0, 10) || '')}
            disabled={generating}
          />
          <button
            type="button"
            className="ai-image-seed-refresh"
            onClick={handleSeedRefresh}
            title="随机种子"
            disabled={generating}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
      <div className="ai-image-sidebar-section">
        <div className="ai-image-sidebar-label">
          图片数量
          <span className="ai-image-sidebar-hint">仅部分模型支持（如 Kolors、Fal、阿里云百炼、OpenAI 等）</span>
        </div>
        <div className="ai-image-count-row">
          {countOptions.map((n) => (
            <button
              key={n}
              type="button"
              className={`ai-image-count-option${count === n ? ' active' : ''}`}
              onClick={() => setCount(n)}
              disabled={generating}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="ai-image-sidebar-section ai-image-ref-section">
        <div className="ai-image-sidebar-label">
          参考图
          <span className="ai-image-sidebar-hint">并非所有模型和服务商都支持</span>
        </div>
        <div
          className="ai-image-ref-upload"
          onClick={() => refFileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragover') }}
          onDragLeave={(e) => { e.currentTarget.classList.remove('dragover') }}
          onDrop={(e) => {
            e.preventDefault()
            e.currentTarget.classList.remove('dragover')
            if (e.dataTransfer?.files?.length) handleRefFiles({ target: { files: e.dataTransfer.files } })
          }}
        >
          <input
            ref={refFileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleRefFiles}
            style={{ display: 'none' }}
          />
          <Upload size={24} className="ai-image-ref-upload-icon" />
          <span className="ai-image-ref-upload-text">点击或拖拽上传图片</span>
          <span className="ai-image-ref-upload-tip">支持多张，单张 ≤5MB</span>
        </div>
        {referencePreviews.length > 0 && (
          <div className="ai-image-ref-preview">
            {referencePreviews.map((url, i) => (
              <div key={i} className="ai-image-ref-preview-item">
                <img src={url} alt="" />
                <button
                  type="button"
                  className="ai-image-ref-remove"
                  onClick={(e) => { e.stopPropagation(); removeRefFile(i) }}
                  title="移除"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className={`ai-chat-panel ai-image-panel ai-image-panel-sidebar${isMobile ? ' ai-image-panel-mobile' : ''}`}>
      {/* 桌面端：左侧控制面板 */}
      {!isMobile && (
        <aside className="ai-image-sidebar">
          <div className="ai-image-sidebar-inner">
            {renderAdvancedContent()}
          </div>
        </aside>
      )}

      {/* 右侧主内容区 */}
      <div className="ai-image-main-wrap">
        <div className="ai-chat-header">
          <div className="ai-chat-title">
            <ImageIcon size={20} />
            <h3>绘画</h3>
          </div>
          <div className="ai-chat-actions">
            <button className="ai-icon-btn" onClick={onSwitchToChat} title="AI 对话">
              <MessageSquare size={18} />
            </button>
            <button className="ai-icon-btn" onClick={onOpenConfig} title="配置">
              <Settings size={18} />
            </button>
            <button
              className="ai-icon-btn"
              onClick={() => setShowHistory(!showHistory)}
              title="历史记录"
            >
              <Search size={18} />
            </button>
            <button className="ai-icon-btn" onClick={onClose} title="关闭">
              <X size={18} />
            </button>
          </div>
        </div>

        <p className="ai-image-desc">
          使用 AI 根据文字描述生成图像，生成结果会默认保存到
          {onOpenImageManager ? (
            <button type="button" className="ai-image-desc-link" onClick={onOpenImageManager}>
              本地图片库
            </button>
          ) : (
            '本地图片库'
          )}
        </p>

        <div className="ai-image-main">
          {generating ? (
            <div className="ai-image-loading">
              <Loader2 size={48} className="spin" />
              <p>正在生成图像...</p>
              <button className="ai-btn ai-btn-secondary" onClick={onCancel}>
                取消生成
              </button>
            </div>
          ) : resultUrl ? (
            <div className="ai-image-result">
              <div className={`ai-image-result-grid${(resultUrls.length || 1) > 1 ? ' multi' : ''}`}>
                {(resultUrls.length > 0 ? resultUrls : [resultUrl]).map((url, i) => (
                  <div key={i} className="ai-image-result-item">
                    <img src={url} alt={`生成结果 ${i + 1}`} />
                    {onInsertImage && (
                      <button
                        className="ai-btn ai-btn-secondary ai-image-insert-btn"
                        onClick={() => {
                          onInsertImage(url)
                          onClose?.()
                        }}
                      >
                        插入
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="ai-image-placeholder">
              <ImageIcon size={64} />
              <p>输入描述，点击生成</p>
            </div>
          )}
        </div>

        {error && (
          <div className="ai-image-error">
            {error}
          </div>
        )}

        {/* 拉动条：上拉可放大输入框（移动端隐藏） */}
        {!isMobile && <Resizer direction="horizontal" onResize={handleInputResize} />}

        <form
          className="ai-input-area ai-image-input-area-inline"
          style={{ height: inputAreaHeight, minHeight: INPUT_HEIGHT_MIN }}
          onSubmit={handleSubmit}
        >
          <div className="ai-input-box ai-image-input-box">
            <div className="ai-input-content">
              <div className="ai-input-text">
                <textarea
                  ref={inputRef}
                  className="ai-input ai-image-prompt-input"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="描述你想要生成的内容 (Enter 生成，Shift+Enter 换行)"
                  disabled={generating}
                  rows={3}
                />
              </div>
            </div>
            <div className="ai-input-footer">
              <button
                type="submit"
                className="ai-send-btn"
                disabled={!prompt.trim() || generating}
                title="生成"
              >
                {generating ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    <span>生成中</span>
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    <span>生成</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* 移动端：可折叠高级设置 */}
        {isMobile && (
          <>
            <button
              type="button"
              className="ai-image-advanced-toggle"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
            >
              高级设置
              {advancedOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            <div className={`ai-image-advanced-mobile${advancedOpen ? ' show' : ''}`}>
              <div className="ai-image-sidebar-inner">
                {renderAdvancedContent()}
              </div>
            </div>
          </>
        )}
      </div>

      {showHistory && history.length > 0 && (
        <div className="ai-image-history-overlay" onClick={() => setShowHistory(false)}>
          <div className="ai-image-history-panel" onClick={(e) => e.stopPropagation()}>
            <h4>历史记录</h4>
            <div className="ai-image-history-list">
              {history.map((item, i) => (
                <div
                  key={item.id ?? i}
                  className="ai-image-history-item"
                  onClick={() => onSelectHistoryItem?.(item)}
                >
                  <img
                    src={item.url}
                    alt=""
                    className="ai-image-history-thumb"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPreviewUrl(item.url)
                    }}
                    title="点击预览"
                  />
                  <span>{item.prompt}</span>
                  {onDeleteHistory && (
                    <button
                      type="button"
                      className="ai-image-history-delete"
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteHistory(item.id != null ? item.id : item)
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {previewUrl && (
        <div
          className="ai-image-preview-overlay"
          onClick={() => setPreviewUrl(null)}
        >
          <img src={previewUrl} alt="预览" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
