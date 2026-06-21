/**
 * 获取图片压缩设置
 */
import { loadImageManagerSettings } from './settingsApi'

const getCompressionSettings = async () => {
  try {
    const settings = await loadImageManagerSettings()
    return {
      enabled: settings.imageCompression !== false,
      mode: settings.imageCompressionMode || 'quality',
      quality: (settings.imageQuality || 80) / 100,
      targetSizePercent: settings.imageTargetSizePercent || 30,
      maxWidth: settings.imageMaxWidth || 1920,
      maxHeight: settings.imageMaxHeight || 1080,
    }
  } catch (error) {
    console.error('读取压缩设置失败:', error)
  }
  
  // 默认设置
  return {
    enabled: true,
    mode: 'quality',
    quality: 0.8,
    targetSizePercent: 30,
    maxWidth: 1920,
    maxHeight: 1080
  }
}

/**
 * 按质量压缩图片
 */
const compressByQuality = (canvas, file, quality) => {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const compressedFile = new File([blob], file.name, {
            type: file.type,
            lastModified: Date.now()
          })
          resolve(compressedFile)
        } else {
          resolve(file)
        }
      },
      file.type,
      quality
    )
  })
}

/**
 * 按目标文件大小压缩图片（二分查找最佳质量）
 */
const compressBySize = async (canvas, file, targetSizeKB) => {
  const targetBytes = targetSizeKB * 1024
  let minQuality = 0.1
  let maxQuality = 0.95
  let bestFile = file
  let iterations = 0
  const maxIterations = 10
  
  console.log(`目标文件大小: ${targetSizeKB}KB (${targetBytes} bytes)`)
  
  while (iterations < maxIterations && maxQuality - minQuality > 0.01) {
    const quality = (minQuality + maxQuality) / 2
    const compressedFile = await compressByQuality(canvas, file, quality)
    
    console.log(`尝试 #${iterations + 1}: 质量=${(quality * 100).toFixed(1)}%, 大小=${(compressedFile.size / 1024).toFixed(1)}KB`)
    
    if (compressedFile.size <= targetBytes) {
      bestFile = compressedFile
      minQuality = quality // 尝试更高质量
    } else {
      maxQuality = quality // 降低质量
    }
    
    iterations++
    
    // 如果已经很接近目标大小，提前退出
    if (Math.abs(compressedFile.size - targetBytes) < targetBytes * 0.1) {
      bestFile = compressedFile
      break
    }
  }
  
  return bestFile
}

/**
 * 压缩图片
 * @param {File} file - 原始图片文件
 * @param {Object} options - 压缩选项
 * @returns {Promise<File>} 压缩后的图片文件
 */
export const compressImage = (file, options = {}) => {
  return new Promise(async (resolve, reject) => {
    // 获取压缩设置
    const settings = await getCompressionSettings()
    
    // 合并选项
    const finalOptions = {
      enabled: options.enabled !== undefined ? options.enabled : settings.enabled,
      mode: options.mode || settings.mode,
      quality: options.quality !== undefined ? options.quality : settings.quality,
      targetSize: options.targetSize, // KB，如果提供则使用，否则根据百分比计算
      targetSizePercent: options.targetSizePercent || settings.targetSizePercent,
      maxWidth: options.maxWidth || settings.maxWidth,
      maxHeight: options.maxHeight || settings.maxHeight
    }
    
    // 如果禁用压缩，直接返回原文件
    if (!finalOptions.enabled) {
      console.log('图片压缩已禁用，使用原文件')
      resolve(file)
      return
    }
    
    console.log(`开始压缩图片: ${file.name}`)
    console.log(`原始大小: ${(file.size / 1024).toFixed(1)}KB`)
    console.log(`压缩模式: ${finalOptions.mode === 'quality' ? '按质量' : '按文件大小百分比'}`)
    if (finalOptions.mode === 'quality') {
      console.log(`压缩质量: ${Math.round(finalOptions.quality * 100)}%`)
    } else {
      // 如果没有提供 targetSize，根据百分比计算
      if (!finalOptions.targetSize) {
        finalOptions.targetSize = Math.round((file.size / 1024) * (finalOptions.targetSizePercent / 100))
      }
      console.log(`目标大小: ${finalOptions.targetSize}KB (${finalOptions.targetSizePercent}% of ${(file.size / 1024).toFixed(1)}KB)`)
    }
    console.log(`最大尺寸: ${finalOptions.maxWidth}x${finalOptions.maxHeight}`)

    const reader = new FileReader()
    reader.readAsDataURL(file)
    
    reader.onload = async (e) => {
      const img = new Image()
      img.src = e.target.result
      
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height
          
          // 计算缩放比例
          if (width > finalOptions.maxWidth || height > finalOptions.maxHeight) {
            const ratio = Math.min(finalOptions.maxWidth / width, finalOptions.maxHeight / height)
            width = Math.round(width * ratio)
            height = Math.round(height * ratio)
            console.log(`图片尺寸: ${img.width}x${img.height} -> ${width}x${height}`)
          } else {
            console.log(`图片尺寸: ${width}x${height} (无需缩放)`)
          }
          
          canvas.width = width
          canvas.height = height
          
          const ctx = canvas.getContext('2d')
          
          // 使用高质量缩放
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, 0, 0, width, height)
          
          let compressedFile
          
          // 根据模式选择压缩方式
          if (finalOptions.mode === 'size') {
            compressedFile = await compressBySize(canvas, file, finalOptions.targetSize)
          } else {
            compressedFile = await compressByQuality(canvas, file, finalOptions.quality)
          }
          
          console.log(`压缩后大小: ${(compressedFile.size / 1024).toFixed(1)}KB`)
          
          // 如果压缩后更大，使用原文件
          if (compressedFile.size < file.size) {
            const ratio = ((1 - compressedFile.size / file.size) * 100).toFixed(1)
            const actualPercent = ((compressedFile.size / file.size) * 100).toFixed(1)
            console.log(`✓ 图片已压缩: ${(file.size / 1024).toFixed(1)}KB -> ${(compressedFile.size / 1024).toFixed(1)}KB (减少 ${ratio}%, 实际大小为原始的 ${actualPercent}%)`)
            resolve(compressedFile)
          } else {
            console.log(`✗ 压缩后文件更大，使用原文件`)
            resolve(file)
          }
        } catch (error) {
          console.error('压缩过程出错:', error)
          resolve(file)
        }
      }
      
      img.onerror = () => {
        reject(new Error('图片加载失败'))
      }
    }
    
    reader.onerror = () => {
      reject(new Error('文件读取失败'))
    }
  })
}
