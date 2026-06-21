import React, { useState, useRef, useCallback, useEffect } from 'react'
import { X, Upload, Link as LinkIcon, Image as ImageIcon, Settings, Folder, RefreshCw, Trash2, CheckSquare, Square, Star, ImageUp, Eye } from 'lucide-react'
import './ImageManagerDialog.css'
import { compressImage } from '../utils/imageCompressor'
import ImagePreviewDialog from './ImagePreviewDialog'
import ElasticSlider from './ElasticSlider'
import AnimatedSelect from './AnimatedSelect'
import ImagebedSettingsPanel from './ImagebedSettingsPanel'
import {
  DEFAULT_IMAGE_MANAGER_SETTINGS,
  loadImageManagerSettings,
  saveImageManagerSettings,
} from '../utils/settingsApi'

function ImageManagerDialog({ isOpen, onClose, onInsertImage, theme, onNotify, initialTab }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'upload') // upload, link, library, settings, compression
  const [imageUrl, setImageUrl] = useState('')
  const [imageAlt, setImageAlt] = useState('')
  const [imageTitle, setImageTitle] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [uploadedImages, setUploadedImages] = useState([])
  const [uploading, setUploading] = useState(false)
  const [libraryImages, setLibraryImages] = useState([])
  const [loadingLibrary, setLoadingLibrary] = useState(false)
  const [previewImage, setPreviewImage] = useState(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedImages, setSelectedImages] = useState([])
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [contextMenu, setContextMenu] = useState(null) // { x, y, image }
  const [defaultImagebed, setDefaultImagebed] = useState(null) // { id, name, type }
  const [imagebedConfigs, setImagebedConfigs] = useState([]) // 所有图床配置
  const [activeImagebed, setActiveImagebed] = useState(null) // 当前图片库选中的图床 id
  const [imagebedNotification, setImagebedNotification] = useState(null) // 图床选择通知
  const [testNotification, setTestNotification] = useState(null) // 测试连接通知
  const [uploadNotification, setUploadNotification] = useState(null) // 上传通知
  const [deleteNotification, setDeleteNotification] = useState(null) // 删除提示
  const [isClosing, setIsClosing] = useState(false)
  const longPressTimerRef = useRef(null)
  const longPressTriggeredRef = useRef(false)
  const fileInputRef = useRef(null)
  const recentUploadsRef = useRef(null)
  
  // 图片压缩设置
  const [imageSettings, setImageSettings] = useState({
    ...DEFAULT_IMAGE_MANAGER_SETTINGS,
  })
  const [hasSettingsChanges, setHasSettingsChanges] = useState(false)

  // 加载图片设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setImageSettings(await loadImageManagerSettings())
      } catch (err) {
        console.error('Failed to load image settings:', err)
      }
    }

    loadSettings()
  }, [])

  // 加载默认图床
  const loadDefaultImagebed = useCallback(async () => {
    try {
      const [defaultRes, listRes] = await Promise.all([
        fetch('api/imagebed/default'),
        fetch('api/imagebed/list'),
      ])
      const defaultResult = await defaultRes.json()
      const listResult = await listRes.json()
      if (defaultResult.ok && defaultResult.config) {
        setDefaultImagebed(defaultResult.config)
      }
      if (listResult.ok && listResult.configs) {
        setImagebedConfigs(listResult.configs)
        // 默认选中默认图床
        const def = defaultResult.ok && defaultResult.config
        if (def) {
          setActiveImagebed(def.id)
        } else if (listResult.configs.length > 0) {
          setActiveImagebed(listResult.configs[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to load default imagebed:', err)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadDefaultImagebed()
    }
  }, [isOpen, loadDefaultImagebed])

  // 处理图片设置变更
  const handleImageSettingChange = (key, value) => {
    setImageSettings(prev => ({ ...prev, [key]: value }))
    setHasSettingsChanges(true)
  }

  // 保存图片设置
  const doSaveImageSettings = async () => {
    try {
      await saveImageManagerSettings(imageSettings)
      setHasSettingsChanges(false)
      onNotify?.('图片设置已保存', 'success')
    } catch (err) {
      console.error('Failed to save image settings:', err)
      onNotify?.('图片设置保存失败', 'error')
    }
  }

  const sortLibraryImages = (images = []) => {
    return [...images].sort((a, b) => {
      const aTime = a.createdAt ? Number(a.createdAt) : 0
      const bTime = b.createdAt ? Number(b.createdAt) : 0
      if (aTime !== bTime) return bTime - aTime
      const aName = a.filename || a.originalName || ''
      const bName = b.filename || b.originalName || ''
      return bName.localeCompare(aName)
    })
  }

  // 加载图片库（根据当前选中图床）
  const loadLibraryImages = useCallback(async (imagebedId, force = false) => {
    const startedAt = Date.now()
    setLoadingLibrary(true)
    try {
      const bedId = imagebedId ?? activeImagebed
      let images = []

      if (!bedId) {
        const response = await fetch('api/image/list')
        const result = await response.json()
        if (result.ok) images = result.images || []
      } else {
        const bed = imagebedConfigs.find(c => c.id === bedId)
        if (bed && bed.type === 'local') {
          const response = await fetch('api/image/list')
          const result = await response.json()
          if (result.ok) images = result.images || []
        } else {
          const url = `api/imagebed/${bedId}/images${force ? '?force=true' : ''}`
          const response = await fetch(url)
          const result = await response.json()
          if (result.ok) images = result.images || []
        }
      }

      setLibraryImages(sortLibraryImages(images))
    } catch (error) {
      console.error('加载图片库错误:', error)
      setLibraryImages([])
    } finally {
      const elapsed = Date.now() - startedAt
      const minDuration = 350
      const delay = Math.max(0, minDuration - elapsed)
      if (delay > 0) {
        setTimeout(() => setLoadingLibrary(false), delay)
      } else {
        setLoadingLibrary(false)
      }
    }
  }, [activeImagebed, imagebedConfigs])

  // 打开时若指定了 initialTab，切换到该标签页
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab)
    }
  }, [isOpen, initialTab])

  // 当切换到图片库标签页或切换图床时加载图片
  useEffect(() => {
    if (isOpen && activeTab === 'library' && activeImagebed !== null) {
      loadLibraryImages(activeImagebed)
    }
  }, [isOpen, activeTab, activeImagebed, loadLibraryImages])

  // 当对话框关闭时清空输入
  useEffect(() => {
    if (!isOpen) {
      setImageUrl('')
      setImageAlt('')
      setImageTitle('')
    }
  }, [isOpen])


  const currentUploadImagebed = (() => {
    if (activeImagebed) {
      return imagebedConfigs.find(b => b.id === activeImagebed) || null
    }

    if (defaultImagebed?.id) {
      return imagebedConfigs.find(b => b.id === defaultImagebed.id) || defaultImagebed
    }

    return null
  })()

  // 处理文件上传
  const handleFileUpload = useCallback(async (files) => {
    if (!files || files.length === 0) return

    setUploading(true)
    const formData = new FormData()
    if (currentUploadImagebed?.id) {
      formData.append('imagebedId', String(currentUploadImagebed.id))
    }
    
    // 统计 HEIC 文件数量
    let heicCount = 0;
    for (let i = 0; i < files.length; i++) {
      const fileName = files[i].name.toLowerCase();
      if (fileName.endsWith('.heic') || fileName.endsWith('.heif')) {
        heicCount++;
      }
    }
    
    // 如果有 HEIC 文件，提前通知用户
    if (heicCount > 0) {
      console.log(`[HEIC] 检测到 ${heicCount} 个 HEIC 文件，准备通知用户`);
      console.log('[HEIC] onNotify 函数:', typeof onNotify, onNotify);
      onNotify?.(`检测到 ${heicCount} 个 HEIC 文件，将在服务器端自动转换为 JPEG`, 'info');
      console.log('[HEIC] 通知已调用');
    }
    
    for (let i = 0; i < files.length; i++) {
      let file = files[i]
      
      // 检查是否是 HEIC/HEIF 文件
      const isHEIC = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
      
      // 验证文件类型（HEIC 文件可能没有正确的 MIME 类型，所以特殊处理）
      if (!file.type.startsWith('image/') && !isHEIC) {
        onNotify?.(`文件 ${file.name} 不是图片格式`, 'error')
        continue
      }

      // 验证文件大小（使用配置的最大值）
      const maxSizeBytes = imageSettings.maxFileSize * 1024 * 1024
      if (file.size > maxSizeBytes) {
        onNotify?.(`文件 ${file.name} 超过 ${imageSettings.maxFileSize}MB 限制`, 'error')
        continue
      }

      // 压缩图片 - 使用当前设置
      try {
        // 检查是否是 HEIC/HEIF 文件
        const isHEIC = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
        
        if (imageSettings.imageCompression && !isHEIC) {
          const originalSize = file.size
          
          // 如果是按文件大小压缩，计算目标大小
          let targetSize = undefined
          if (imageSettings.imageCompressionMode === 'size') {
            targetSize = Math.round((originalSize / 1024) * (imageSettings.imageTargetSizePercent / 100))
            console.log(`原始文件: ${(originalSize / 1024).toFixed(1)}KB, 目标百分比: ${imageSettings.imageTargetSizePercent}%, 目标大小: ${targetSize}KB`)
          }
          
          file = await compressImage(file, {
            enabled: true,
            mode: imageSettings.imageCompressionMode,
            quality: imageSettings.imageQuality / 100,
            targetSize: targetSize,
            maxWidth: imageSettings.imageMaxWidth,
            maxHeight: imageSettings.imageMaxHeight
          })
          
          console.log(`压缩设置: 模式=${imageSettings.imageCompressionMode === 'quality' ? '按质量' : '按文件大小'}, 质量=${imageSettings.imageQuality}%, 最大尺寸=${imageSettings.imageMaxWidth}x${imageSettings.imageMaxHeight}`)
          console.log(`压缩结果: ${(originalSize / 1024).toFixed(1)}KB -> ${(file.size / 1024).toFixed(1)}KB`)
        } else {
          if (isHEIC) {
            console.log('HEIC 文件跳过压缩（将在服务器端转换）')
          } else {
            console.log('图片压缩已禁用')
          }
        }
      } catch (error) {
        console.error('图片压缩失败:', error)
        // 压缩失败，使用原文件
      }

      formData.append('images', file)
      console.log(`添加文件到 FormData: ${file.name}, 大小: ${file.size}`)
    }

    try {
      console.log('开始上传图片...')
      const response = await fetch('api/image/upload', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()
      console.log('服务器返回:', result)
      
      if (result.ok) {
        // 打印每个上传的图片信息
        result.images.forEach(img => {
          console.log(`上传成功: filename="${img.filename}", alt="${img.alt}", url="${img.url}"`)
        })

        const fallbackCount = Array.isArray(result.images)
          ? result.images.filter(img => !!img.fallback).length
          : 0

        setUploadedImages(prev => [...result.images, ...prev])
        // 如果当前在图片库标签页，刷新图片库
        if (activeTab === 'library') {
          loadLibraryImages()
        }

        if (fallbackCount > 0) {
          const successCount = result.images.length - fallbackCount
          const fallbackMsg = successCount > 0
            ? `⚠ 已上传 ${result.images.length} 张（其中 ${fallbackCount} 张图床失败，已自动保存到本地）`
            : `⚠ 图床上传失败，已自动保存到本地（${fallbackCount} 张）`
          setUploadNotification(fallbackMsg)
          onNotify?.('检测到图床上传失败，已自动降级保存到本地，请检查图床配置', 'warning')
        } else {
          setUploadNotification(`✓ 成功上传 ${result.images.length} 张图片`)
        }

        setTimeout(() => {
          setUploadNotification(null)
        }, 4500)
        
        // 自动滚动到上传的图片位置
        setTimeout(() => {
          if (recentUploadsRef.current) {
            recentUploadsRef.current.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'nearest' 
            })
          }
        }, 100)
      } else {
        setUploadNotification(`✗ 上传失败: ${result.error}`)
        setTimeout(() => {
          setUploadNotification(null)
        }, 3000)
      }
    } catch (error) {
      console.error('上传错误:', error)
      setUploadNotification('✗ 上传失败，请重试')
      setTimeout(() => {
        setUploadNotification(null)
      }, 3000)
    } finally {
      setUploading(false)
    }
  }, [imageSettings, activeTab, loadLibraryImages, onNotify, currentUploadImagebed])

  // 拖拽处理
  const handleDrag = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files)
    }
  }, [handleFileUpload])

  // 点击选择文件
  const doOpenFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleSelectClick = () => {
    doOpenFilePicker()
  }

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files)
    }
  }

  // 处理粘贴事件
  const handlePaste = useCallback((e) => {
    // 只在上传标签页处理粘贴
    if (activeTab !== 'upload') return

    const items = e.clipboardData?.items
    if (!items) return

    // 检查是否有图片文件
    let hasImage = false
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        hasImage = true
        const file = item.getAsFile()
        if (file) {
          handleFileUpload([file])
        }
        break
      }
    }

    // 如果没有图片文件，检查是否有文本（可能是图片链接）
    if (!hasImage) {
      const text = e.clipboardData?.getData('text')
      if (text && text.trim()) {
        // 简单判断是否是图片链接
        const imageUrlPattern = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i
        if (imageUrlPattern.test(text.trim())) {
          // 切换到图片链接标签页并填入链接
          setActiveTab('link')
          setImageUrl(text.trim())
          onNotify?.('已自动填入图片链接', 'success')
        }
      }
    }
  }, [activeTab, handleFileUpload, onNotify])

  // 添加粘贴事件监听
  useEffect(() => {
    if (isOpen && activeTab === 'upload') {
      window.addEventListener('paste', handlePaste)
      return () => {
        window.removeEventListener('paste', handlePaste)
      }
    }
  }, [isOpen, activeTab, handlePaste])

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false)
    }
  }, [isOpen])

  // 插入图片链接
  const doInsertImageLink = async () => {
    if (!imageUrl.trim()) {
      onNotify?.('请输入图片链接', 'error')
      return
    }

    const alt = imageAlt.trim() || '图片'
    const title = imageTitle.trim()
    
    // 如果有标题，使用 Markdown 的 title 语法
    const markdown = title 
      ? `![${alt}](${imageUrl} "${title}")`
      : `![${alt}](${imageUrl})`
    
    onInsertImage(markdown)

    // 同时保存到本地
    try {
      const proxyResponse = await fetch(`api/image/fetch-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imageUrl, alt })
      })
      if (proxyResponse.ok) {
        const result = await proxyResponse.json()
        if (result.ok) {
          onNotify?.('图片已插入并保存到本地', 'success')
        } else {
          onNotify?.('图片已插入，但保存到本地失败', 'warning')
        }
      } else {
        onNotify?.('图片已插入，但保存到本地失败', 'warning')
      }
    } catch (e) {
      onNotify?.('图片已插入，但保存到本地失败', 'warning')
    }

    onClose()
  }

  // 删除图片
  const doDeleteImage = useCallback(async (image) => {
    try {
      const bed = imagebedConfigs.find(c => c.id === activeImagebed)
      const isExternal = bed && bed.type !== 'local'
      setDeleteNotification(isExternal ? '正在删除，云端同步中' : '正在删除')

      const response = await fetch('api/image/delete-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{
            url: image.url,
            imagebedId: isExternal ? activeImagebed : undefined,
          }]
        })
      })
      const result = await response.json()

      if (result.ok) {
        loadLibraryImages()
        onNotify?.('图片已删除', 'success')
      } else {
        const firstError = Array.isArray(result.results) ? result.results.find(r => !r.ok) : null
        onNotify?.(`删除失败: ${firstError?.message || result.message || result.error}`, 'error')
      }
    } catch (error) {
      console.error('删除图片错误:', error)
      onNotify?.('删除失败，请重试', 'error')
    } finally {
      setTimeout(() => {
        setDeleteNotification(null)
      }, 2000)
    }
  }, [loadLibraryImages, activeImagebed, imagebedConfigs])

  // 批量删除图片
  const doBatchDeleteImages = useCallback(async () => {
    if (selectedImages.length === 0) {
      onNotify?.('请先选择要删除的图片', 'error')
      return
    }

    try {
      const bed = imagebedConfigs.find(c => c.id === activeImagebed)
      const isExternal = bed && bed.type !== 'local'

      setDeleteNotification(isExternal ? '正在删除，云端同步中' : '正在删除')

      const response = await fetch('api/image/delete-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedImages.map(image => ({
            url: image.url,
            imagebedId: isExternal ? activeImagebed : undefined,
          }))
        })
      })
      const result = await response.json()

      const successCount = result?.success || 0
      const failCount = result?.failed || 0

      loadLibraryImages()
      setSelectedImages([])
      setSelectionMode(false)
      setTimeout(() => {
        setDeleteNotification(null)
      }, isExternal ? 3000 : 1500)
      onNotify?.(`删除完成！成功: ${successCount}，失败: ${failCount}`, successCount > 0 ? 'success' : 'error')
    } catch (error) {
      console.error('批量删除错误:', error)
      onNotify?.('批量删除失败，请重试', 'error')
    }
  }, [selectedImages, loadLibraryImages, activeImagebed, imagebedConfigs])

  // 切换图片选择
  const doToggleImageSelection = useCallback((image) => {
    setSelectedImages(prev => {
      const isSelected = prev.some(img => img.url === image.url)
      if (isSelected) {
        return prev.filter(img => img.url !== image.url)
      } else {
        return [...prev, image]
      }
    })
  }, [])

  // 全选/取消全选
  const doToggleSelectAll = useCallback(() => {
    if (selectedImages.length === libraryImages.length) {
      setSelectedImages([])
    } else {
      setSelectedImages([...libraryImages])
    }
  }, [selectedImages, libraryImages])

  // 插入已上传的图片
  const doInsertUploadedImage = (image) => {
    const alt = image.alt || '图片'
    onInsertImage(`![${alt}](${image.url})`)
    onClose()
  }

  const handleInsertUploadedClick = (image) => {
    doInsertUploadedImage(image)
  }

  const requestClose = useCallback(() => {
    if (isClosing) return
    setIsClosing(true)
    window.setTimeout(() => {
      onClose()
    }, 180)
  }, [isClosing, onClose])

  const handleOverlayClick = () => {
    requestClose()
  }

  const handleCloseClick = () => {
    requestClose()
  }

  const handleCancelClick = () => {
    requestClose()
  }

  const handleConfirmClick = () => {
    if (activeTab === 'link') {
      doInsertImageLink()
      return
    }

    if (activeTab === 'compression') {
      doSaveImageSettings()
    }
  }

  const handleBatchDeleteClick = async () => {
    await doBatchDeleteImages()
  }

  const doOpenPreviewImage = (image) => {
    setPreviewImage(image)
  }

  const doClosePreviewImage = () => {
    setPreviewImage(null)
  }

  const doEnterSelectionMode = () => {
    setSelectionMode(true)
  }

  const doExitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedImages([])
  }

  const handleRefreshLibraryClick = () => {
    loadLibraryImages(activeImagebed, true)
  }

  const handlePreviewOpenClick = (e, image) => {
    e.stopPropagation()
    doOpenPreviewImage(image)
  }

  const handleImageSelectToggleClick = (image) => {
    doToggleImageSelection(image)
  }

  const handleLibraryImageClick = (image) => {
    if (selectionMode) {
      doToggleImageSelection(image)
      return
    }

    doOpenPreviewImage(image)
  }

  // 长按事件处理
  const handleImageTouchStart = (e, image) => {
    longPressTriggeredRef.current = false
    longPressTimerRef.current = setTimeout(() => {
      const touch = e.touches[0]
      setContextMenu({
        x: touch.clientX,
        y: touch.clientY,
        image: image
      })
      longPressTriggeredRef.current = true
    }, 500)
  }

  const handleImageTouchEnd = (e, image) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
    }

    // 如果触摸结束发生在操作按钮上（插入 / 删除 / 选择框），则不触发预览
    const target = e.target
    if (
      target.closest?.('.insert-image-btn') ||
      target.closest?.('.delete-image-btn') ||
      target.closest?.('.image-checkbox')
    ) {
      longPressTriggeredRef.current = false
      return
    }

    // 非长按视为点击预览（仅在未进入批量选择模式时）
    if (!longPressTriggeredRef.current && !selectionMode) {
      doOpenPreviewImage(image)
    }

    longPressTriggeredRef.current = false
  }

  const handleImageDeleteClick = (e, image) => {
    e.stopPropagation()
    doDeleteImage(image)
  }

  const handleContextMenuAction = (action) => {
    if (!contextMenu) return
    
    const image = contextMenu.image
    switch (action) {
      case 'delete':
        doDeleteImage(image)
        break
      default:
        break
    }
    setContextMenu(null)
  }

  const handleOverlayClickForMenu = (e) => {
    // 点击菜单外空白处关闭菜单
    if (contextMenu && e.target === e.currentTarget) {
      setContextMenu(null)
    }
  }

  const handleEnterSelectionModeClick = () => {
    doEnterSelectionMode()
  }

  const handleSelectAllClick = () => {
    doToggleSelectAll()
  }

  const handleCancelSelectionClick = () => {
    doExitSelectionMode()
  }

  const handlePreviewMaskClick = () => {
    doClosePreviewImage()
  }

  if (!isOpen) return null

  return (
    <>
    <div className={`image-manager-overlay ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div 
        className={`image-manager-dialog ${theme}`} 
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="image-manager-header">
          <h2>图片管理</h2>
          <button className="close-button" onClick={handleCloseClick}>
            <X size={20} />
          </button>
        </div>

        {/* 标签页 */}
        <div className="image-manager-tabs">
          <button
            className={`tab-button ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <Upload size={18} />
            <span>上传图片</span>
          </button>
          <button
            className={`tab-button ${activeTab === 'link' ? 'active' : ''}`}
            onClick={() => setActiveTab('link')}
          >
            <LinkIcon size={18} />
            <span>图片链接</span>
          </button>
          <button
            className={`tab-button ${activeTab === 'library' ? 'active' : ''}`}
            onClick={() => setActiveTab('library')}
          >
            <ImageIcon size={18} />
            <span>图片库</span>
          </button>
          <button
            className={`tab-button ${activeTab === 'compression' ? 'active' : ''}`}
            onClick={() => setActiveTab('compression')}
          >
            <ImageUp size={18} />
            <span>图片设置</span>
          </button>
          <button
            className={`tab-button ${activeTab === 'imagebed' ? 'active' : ''}`}
            onClick={() => setActiveTab('imagebed')}
          >
            <Settings size={18} />
            <span>图床设置</span>
          </button>
        </div>

        {/* 内容区域 */}
        <div className="image-manager-content">
          {/* 上传图片标签页 */}
          {activeTab === 'upload' && (
            <div className="upload-tab">
              <div
                className={`upload-area ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="upload-icon">
                  <Upload size={48} />
                </div>
                <h3>上传图片</h3>
                <p>拖拽图片到此处、点击选择文件或按 Ctrl+V 粘贴</p>
                <button 
                  className="select-button"
                  onClick={handleSelectClick}
                  disabled={uploading}
                >
                  <ImageIcon size={18} />
                  {uploading ? '上传中...' : '选择图片'}
                </button>
                <p className="upload-hint">
                  支持 JPG、PNG、GIF、WebP 格式，单个文件最大 {imageSettings.maxFileSize}MB<br />
                  粘贴图片链接将自动跳转到"图片链接"标签页
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileInputChange}
                />
              </div>

              <div className="current-storage">
                <Folder size={16} />
                <span>当前图床：</span>
                <strong>{currentUploadImagebed ? currentUploadImagebed.name : '加载中...'}</strong>
                {currentUploadImagebed?.isDefault && <span className="star"><Star size={16} fill="currentColor" /></span>}
                <button className="settings-icon-btn" onClick={() => setActiveTab('imagebed')} title="图床设置">
                  <Settings size={16} />
                </button>
              </div>

              {/* 最近上传 */}
              {uploadedImages.length > 0 && (
                <div className="recent-uploads" ref={recentUploadsRef}>
                  <h4>最近上传</h4>
                  <div className="image-grid">
                    {uploadedImages.map((image, index) => (
                      <div key={index} className="image-item recent-upload-item">
                        <img src={image.url} alt={image.alt || '图片'} />
                        <div className="image-overlay">
                          <button onClick={() => handleInsertUploadedClick(image)}>
                            插入
                          </button>
                        </div>
                        <button
                          className="insert-image-btn"
                          onClick={() => handleInsertUploadedClick(image)}
                          title="插入到文档"
                        >
                          插入
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 图片链接标签页 */}
          {activeTab === 'link' && (
            <div className="link-tab">
              <div className="form-group">
                <label>图片链接</label>
                <input
                  type="text"
                  placeholder="https://example.com/image.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleConfirmClick()}
                />
              </div>
              <div className="form-group">
                <label>图片描述（可选）</label>
                <input
                  type="text"
                  placeholder="图片描述"
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleConfirmClick()}
                />
              </div>
              <div className="form-group">
                <label>图片标题（可选）</label>
                <input
                  type="text"
                  placeholder="图片标题"
                  value={imageTitle}
                  onChange={(e) => setImageTitle(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleConfirmClick()}
                />
              </div>
            </div>
          )}

          {/* 图片库标签页 */}
          {activeTab === 'library' && (
            <div className="library-tab">
              <div className="library-header">
                <div className="library-imagebed-tabs">
                  {imagebedConfigs.map(bed => (
                    <button
                      key={bed.id}
                      className={`library-imagebed-tab ${activeImagebed === bed.id ? 'active' : ''}`}
                      onClick={() => setActiveImagebed(bed.id)}
                    >
                      {bed.name}
                      {bed.isDefault && <span className="default-badge">默认</span>}
                    </button>
                  ))}
                </div>
                <div className="library-header-right">
                  <span className="library-count">{libraryImages.length} 张</span>
                  <button
                    className={`refresh-button ${loadingLibrary ? 'spinning' : ''}`}
                    onClick={handleRefreshLibraryClick}
                    disabled={loadingLibrary}
                    title="刷新图片库"
                  >
                    <RefreshCw size={18} className={loadingLibrary ? 'spinning' : ''} />
                    刷新
                  </button>
                </div>
              </div>
              
              {loadingLibrary ? (
                <div className="loading-state">
                  <RefreshCw size={48} className="spinning" />
                  <p>加载中...</p>
                </div>
              ) : libraryImages.length === 0 ? (
                <div className="empty-state">
                  <ImageIcon size={64} />
                  <h3>图片库为空</h3>
                  <p>上传图片后会显示在这里</p>
                </div>
              ) : (
                <div className="image-grid">
                  {libraryImages.map((image, index) => {
                    const isSelected = selectedImages.some(img => img.url === image.url)
                    return (
                      <div 
                        key={index} 
                        className={`image-item ${selectionMode ? 'selection-mode' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleLibraryImageClick(image)}
                        onTouchStart={(e) => handleImageTouchStart(e, image)}
                        onTouchEnd={(e) => handleImageTouchEnd(e, image)}
                      >
                        {selectionMode && (
                          <div 
                            className="image-checkbox"
                            onClick={(e) => { e.stopPropagation(); handleImageSelectToggleClick(image) }}
                          >
                            {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                          </div>
                        )}
                        <img 
                          src={image.thumbUrl || image.url} 
                          alt={image.alt || image.filename || '图片'} 
                          loading="lazy"
                        />
                        {!selectionMode && (
                          <button 
                            className="delete-image-btn"
                            onClick={(e) => handleImageDeleteClick(e, image)}
                            title="删除图片"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        <div className="image-info">
                          <span className="image-filename" title={image.filename}>
                            {image.filename}
                          </span>
                          <span className="image-size">
                            {(image.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        {!selectionMode && (
                          <button
                            className="insert-image-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              doInsertUploadedImage(image)
                            }}
                            title="插入到文档"
                          >
                            插入
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 图片设置标签页 */}
          {activeTab === 'compression' && (
            <div className="compression-tab">
              <div className="compression-settings">
                <h3 className="section-title">图片压缩设置</h3>
                
                <div className="setting-item">
                  <div className="setting-label">
                    <label>自动压缩图片</label>
                    <p className="setting-description">上传图片时自动压缩以节省空间</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={imageSettings.imageCompression}
                      onChange={(e) => handleImageSettingChange('imageCompression', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {imageSettings.imageCompression && (
                  <>
                    <div className="setting-item">
                      <div className="setting-label">
                        <label>压缩模式</label>
                        <p className="setting-description">选择按质量或按文件大小压缩</p>
                      </div>
                      <AnimatedSelect
                        value={imageSettings.imageCompressionMode}
                        onChange={(value) => handleImageSettingChange('imageCompressionMode', value)}
                        options={[
                          { value: 'quality', label: '按质量压缩' },
                          { value: 'size', label: '按文件大小压缩' },
                        ]}
                        wrapperClassName="setting-select-control"
                      />
                    </div>

                    {imageSettings.imageCompressionMode === 'quality' ? (
                      <div className="setting-item slider-item">
                        <div className="setting-label">
                          <label>压缩质量</label>
                          <p className="setting-description">图片压缩质量（50-100，值越大质量越好，文件越大）</p>
                        </div>
                        <div className="slider-control">
                          <ElasticSlider
                            min={50}
                            max={100}
                            value={imageSettings.imageQuality}
                            onChange={(value) => handleImageSettingChange('imageQuality', value)}
                            className="quality-slider"
                          />
                          <span className="slider-value">
                            {imageSettings.imageQuality}%
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="setting-item slider-item">
                        <div className="setting-label">
                          <label>目标文件大小</label>
                          <p className="setting-description">压缩到原始文件大小的百分比（例如：30% 表示压缩到原大小的30%）</p>
                        </div>
                        <div className="slider-control">
                          <ElasticSlider
                            min={5}
                            max={80}
                            value={imageSettings.imageTargetSizePercent}
                            onChange={(value) => handleImageSettingChange('imageTargetSizePercent', value)}
                            className="quality-slider"
                          />
                          <span className="slider-value">
                            {imageSettings.imageTargetSizePercent}%
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="setting-item">
                      <div className="setting-label">
                        <label>最大宽度</label>
                        <p className="setting-description">图片最大宽度（像素）</p>
                      </div>
                      <input
                        type="number"
                        min="800"
                        max="4096"
                        step="100"
                        value={imageSettings.imageMaxWidth}
                        onChange={(e) => handleImageSettingChange('imageMaxWidth', parseInt(e.target.value))}
                        className="form-input"
                        style={{ width: '120px' }}
                      />
                    </div>

                    <div className="setting-item">
                      <div className="setting-label">
                        <label>最大高度</label>
                        <p className="setting-description">图片最大高度（像素）</p>
                      </div>
                      <input
                        type="number"
                        min="600"
                        max="4096"
                        step="100"
                        value={imageSettings.imageMaxHeight}
                        onChange={(e) => handleImageSettingChange('imageMaxHeight', parseInt(e.target.value))}
                        className="form-input"
                        style={{ width: '120px' }}
                      />
                    </div>
                  </>
                )}

                <div className="setting-item">
                  <div className="setting-label">
                    <label>最大文件大小</label>
                    <p className="setting-description">单个上传文件的最大大小（MB）</p>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={imageSettings.maxFileSize}
                    onChange={(e) => handleImageSettingChange('maxFileSize', parseInt(e.target.value))}
                    className="form-input"
                    style={{ width: '120px' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 图床设置标签页 */}
          {activeTab === 'imagebed' && (
            <div className="imagebed-tab">
              <ImagebedSettingsPanel
                onNotify={onNotify}
                theme={theme}
                onDefaultChanged={loadDefaultImagebed}
                onImagebedNotification={setImagebedNotification}
              />
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="image-manager-footer">
          <div className="footer-left">
            {uploadNotification && (
              <span className={`imagebed-notification ${uploadNotification.includes('✓') ? 'success' : 'error'}`}>
                {uploadNotification}
              </span>
            )}
            {imagebedNotification && (
              <span className="imagebed-notification">
                {imagebedNotification}
              </span>
            )}
            {deleteNotification && (
              <span className="imagebed-notification">
                {deleteNotification}
              </span>
            )}
          </div>
          <div className="footer-right-actions">
            {activeTab === 'library' && libraryImages.length > 0 && (
              <div className="footer-left-actions">
                {!selectionMode ? (
                  <button 
                    className="selection-mode-button"
                    onClick={handleEnterSelectionModeClick}
                    title="批量管理"
                  >
                    <CheckSquare size={18} />
                    批量管理
                  </button>
                ) : (
                  <>
                    <button 
                      className="select-all-button"
                      onClick={handleSelectAllClick}
                      title={selectedImages.length === libraryImages.length ? '取消全选' : '全选'}
                    >
                      {selectedImages.length === libraryImages.length ? <CheckSquare size={18} /> : <Square size={18} />}
                      {selectedImages.length === libraryImages.length ? '取消全选' : '全选'}
                    </button>
                    <button 
                      className="batch-delete-button"
                      onClick={handleBatchDeleteClick}
                      disabled={selectedImages.length === 0}
                      title="删除选中"
                    >
                      <Trash2 size={18} />
                      删除选中 ({selectedImages.length})
                    </button>
                    <button 
                      className="cancel-selection-button"
                      onClick={handleCancelSelectionClick}
                      title="取消选择"
                    >
                      取消
                    </button>
                  </>
                )}
              </div>
            )}
            {activeTab === 'link' ? (
              <>
                <button className="cancel-button" onClick={handleCancelClick}>
                  取消
                </button>
                <button className="insert-button" onClick={handleConfirmClick}>
                  插入图片
                </button>
              </>
            ) : (
              <>
                <button className="close-footer-button" onClick={handleCloseClick}>
                  关闭
                </button>
                {activeTab === 'compression' && (
                  <button 
                    className="save-settings-button"
                    onClick={handleConfirmClick}
                    disabled={!hasSettingsChanges}
                  >
                    保存设置
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* 上下文菜单 */}
    {contextMenu && (
      <>
        <div 
          className="image-context-menu-overlay"
          onClick={handleOverlayClickForMenu}
        />
        <div 
          className="image-context-menu"
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 10001
          }}
        >
          <button onClick={() => handleContextMenuAction('delete')}>
            <Trash2 size={16} /> 删除
          </button>
        </div>
      </>
    )}

    {/* 图片预览浮窗 */}
    {previewImage && (
      <div className="img-preview-mask" onClick={handlePreviewMaskClick}>
        <div className="img-preview-card" onClick={(e) => e.stopPropagation()}>
          <div className="img-preview-body">
            <img src={previewImage.url} alt={previewImage.name || '预览'} />
          </div>
        </div>
      </div>
    )}
    </>
  )
}

export default ImageManagerDialog

