import React, { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import AIChatPanel from './AIChatPanel'
import AIConfigPanel from './AIConfigPanel'
import AIImagePanel from './AIImagePanel'
import { useAIChat } from '../../hooks/ai/useAIChat'
import { useAIImage } from '../../hooks/ai/useAIImage'
import { aiStorage } from '../../utils/ai/aiStorage'
import { persistSetting } from '../../utils/settingsApi'
import { AI_IMAGE_SERVICES } from '../../constants/aiImageConfig'

export default function AIDialog({ isOpen, onClose, autoQuickCommandId, onConsumeAutoQuickCommand, getEditorContent, getSelectedText, onInsertImage, onInsertText, onOpenImageManager }) {
  const [showConfig, setShowConfig] = React.useState(false)
  const [mode, setMode] = React.useState('chat') // 'chat' | 'image'
  const [configPanelTab, setConfigPanelTab] = React.useState('chat') // 打开配置面板时默认标签：'chat' | 'image'
  const [rendered, setRendered] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)
  const closeTimerRef = useRef(null)

  const chat = useAIChat()
  const image = useAIImage()

  /** 配置变更时立即持久化到数据库，确保在关闭窗口前完成保存 */
  const handleChatConfigChange = (updates) => {
    chat.setConfig((prev) => {
      const next = { ...prev, ...updates }
      aiStorage.saveConfig(next).catch((e) => console.error('[AIDialog] 保存 AI 配置失败:', e))
      return next
    })
  }

  const handleImageConfigChange = (updates) => {
    image.setConfig((prev) => {
      const next = { ...prev, ...updates }
      persistSetting('aiImageConfig', next).catch((e) => console.error('[AIDialog] 保存文生图配置失败:', e))
      return next
    })
  }

  // 文生图配置：endpoint 优先用 imageConfig.endpoints（按服务商），apiKey 共用 chat；fetchedModelsByService、disabledProviders 从对话读取
  const effectiveImageConfig = React.useMemo(() => {
    const imgEp = image.config.endpoints?.[image.config.type] ?? image.config.endpoint ?? ''
    const chatEp = chat.config.endpoints?.[image.config.type] ?? ''
    const fallbackEp = AI_IMAGE_SERVICES.find((s) => s.value === image.config.type)?.endpoint || ''
    let finalEp = (imgEp && imgEp.trim()) || (chatEp && chatEp.trim()) || (image.config.endpoint && image.config.endpoint.trim()) || fallbackEp
    const isBuiltinProxy = /proxy-ai\.doocs\.org/i.test(finalEp)
    if (image.config.type && image.config.type !== 'builtin' && isBuiltinProxy) {
      finalEp = fallbackEp
    }
    const ak = image.config.apiKeys?.[image.config.type] ?? image.config.apiKey ?? chat.config.apiKeys?.[image.config.type] ?? chat.config.apiKey ?? ''
    return {
      ...image.config,
      endpoint: finalEp,
      apiKey: ak,
      fetchedModelsByService: chat.config.fetchedModelsByService,
      disabledProviders: chat.config.disabledProviders,
    }
  }, [image.config, image.config.endpoints, image.config.apiKeys, chat.config.endpoints, chat.config.apiKeys, chat.config.fetchedModelsByService, chat.config.disabledProviders])

  const openChatConfig = () => {
    setConfigPanelTab('chat')
    setMode('chat')
    setShowConfig(true)
  }

  const openImageConfig = () => {
    setConfigPanelTab('image')
    setMode('image')
    setShowConfig(true)
  }

  useEffect(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }

    if (isOpen) {
      setRendered(true)
      setIsClosing(false)
      return
    }

    if (!rendered || isClosing) return

    setIsClosing(true)
    closeTimerRef.current = window.setTimeout(() => {
      setRendered(false)
      setIsClosing(false)
      closeTimerRef.current = null
    }, 180)
  }, [isOpen, rendered, isClosing])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [])

  const requestClose = useCallback(() => {
    if (isClosing) return
    onClose()
  }, [isClosing, onClose])

  if (!rendered) return null

  return (
    <div className={`ai-dialog-overlay ${isClosing ? 'closing' : ''}`} onClick={requestClose}>
      <div className="ai-dialog" onClick={(e) => e.stopPropagation()}>
        {showConfig ? (
          <AIConfigPanel
            config={chat.config}
            onConfigChange={handleChatConfigChange}
            onClose={() => setShowConfig(false)}
            onTestConnection={chat.testConnection}
            imageConfig={image.config}
            onImageConfigChange={handleImageConfigChange}
            onTestConnectionImage={(overrides) => {
                const ep = overrides?.endpoint ?? effectiveImageConfig.endpoint
                const ak = overrides?.apiKey ?? effectiveImageConfig.apiKey
                return image.testConnection({ ...overrides, endpoint: ep, apiKey: ak })
              }}
            initialModelListTab={configPanelTab}
          />
        ) : mode === 'image' ? (
          <AIImagePanel
            config={effectiveImageConfig}
            prompt={image.prompt}
            setPrompt={image.setPrompt}
            generating={image.generating}
            resultUrl={image.resultUrl}
            resultUrls={image.resultUrls}
            error={image.error}
            history={image.history}
            onGenerate={(extra) => image.generateWithConfig(effectiveImageConfig, extra)}
            onCancel={image.cancel}
            onOpenConfig={openImageConfig}
            onClose={requestClose}
            onSwitchToChat={() => setMode('chat')}
            onInsertImage={onInsertImage}
            onImageConfigChange={handleImageConfigChange}
            onOpenImageManager={() => onOpenImageManager?.('library')}
            onDeleteHistory={image.removeHistoryItem}
            onSelectHistoryItem={(item) => {
              if (item?.url) image.setResultUrl?.(item.url)
              image.setResultUrls?.(item?.urls && item.urls.length > 0 ? item.urls : (item?.url ? [item.url] : []))
            }}
          />
        ) : (
          <AIChatPanel
            config={chat.config}
            onConfigChange={handleChatConfigChange}
            messages={chat.messages}
            isStreaming={chat.isStreaming}
            quoteFullContent={chat.quoteFullContent}
            onSendMessage={chat.sendMessage}
            onStopGeneration={chat.stopGeneration}
            onNewConversation={chat.newConversation}
            onLoadConversation={chat.loadConversation}
            onDeleteConversation={chat.deleteConversation}
            onGetAllConversations={chat.getAllConversations}
            onToggleQuoteFullContent={chat.setQuoteFullContent}
            onOpenConfig={openChatConfig}
            onClose={requestClose}
            onSwitchToImage={() => setMode('image')}
            autoQuickCommandId={autoQuickCommandId}
            onConsumeAutoQuickCommand={onConsumeAutoQuickCommand}
            getEditorContent={getEditorContent}
            getSelectedText={getSelectedText}
            onInsertText={onInsertText}
            onRegenerateReply={chat.regenerateReply}
          />
        )}
      </div>
    </div>
  )
}
