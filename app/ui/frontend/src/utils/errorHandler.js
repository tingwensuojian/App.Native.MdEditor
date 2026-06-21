/**
 * 错误处理工具
 * 提供统一的错误处理和友好的错误提示
 */

/**
 * 错误类型映射
 */
const ERROR_TYPES = {
  NETWORK: 'network',
  FILE_NOT_FOUND: 'file_not_found',
  PERMISSION_DENIED: 'permission_denied',
  FILE_TOO_LARGE: 'file_too_large',
  INVALID_PATH: 'invalid_path',
  SAVE_FAILED: 'save_failed',
  LOAD_FAILED: 'load_failed',
  RENDER_FAILED: 'render_failed',
  UNKNOWN: 'unknown'
}

/**
 * 错误信息模板
 */
const ERROR_MESSAGES = {
  [ERROR_TYPES.NETWORK]: {
    title: '网络错误',
    message: '无法连接到服务器，请检查网络连接',
    suggestion: '请稍后重试或检查网络设置'
  },
  [ERROR_TYPES.FILE_NOT_FOUND]: {
    title: '文件未找到',
    message: '无法找到指定的文件',
    suggestion: '请确认文件路径是否正确，或文件是否已被删除'
  },
  [ERROR_TYPES.PERMISSION_DENIED]: {
    title: '权限不足',
    message: '没有权限访问该文件或目录',
    suggestion: '请检查文件权限设置或联系管理员'
  },
  [ERROR_TYPES.FILE_TOO_LARGE]: {
    title: '文件过大',
    message: '文件大小超过限制',
    suggestion: '建议将大文件拆分为多个小文件'
  },
  [ERROR_TYPES.INVALID_PATH]: {
    title: '路径无效',
    message: '文件路径格式不正确',
    suggestion: '请使用正确的文件路径格式'
  },
  [ERROR_TYPES.SAVE_FAILED]: {
    title: '保存失败',
    message: '无法保存文件',
    suggestion: '请检查磁盘空间和文件权限'
  },
  [ERROR_TYPES.LOAD_FAILED]: {
    title: '加载失败',
    message: '无法加载文件内容',
    suggestion: '请检查文件是否损坏或格式是否正确'
  },
  [ERROR_TYPES.RENDER_FAILED]: {
    title: '渲染失败',
    message: 'Markdown 渲染出错',
    suggestion: '请检查文档语法是否正确'
  },
  [ERROR_TYPES.UNKNOWN]: {
    title: '未知错误',
    message: '发生了未知错误',
    suggestion: '请尝试刷新页面或联系技术支持'
  }
}

/**
 * 根据错误对象判断错误类型
 */
export function detectErrorType(error) {
  if (!error) return ERROR_TYPES.UNKNOWN

  const errorMessage = error.message?.toLowerCase() || ''
  const errorCode = error.code?.toUpperCase() || ''

  // 网络错误
  if (errorMessage.includes('network') || errorMessage.includes('fetch') || 
      errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT') {
    return ERROR_TYPES.NETWORK
  }

  // 文件未找到
  if (errorMessage.includes('not found') || errorCode === 'ENOENT' || 
      errorCode === 'NOT_FOUND') {
    return ERROR_TYPES.FILE_NOT_FOUND
  }

  // 权限错误
  if (errorMessage.includes('permission') || errorMessage.includes('access denied') ||
      errorCode === 'EACCES' || errorCode === 'EPERM') {
    return ERROR_TYPES.PERMISSION_DENIED
  }

  // 文件过大
  if (errorMessage.includes('too large') || errorMessage.includes('file size') ||
      errorCode === 'EFBIG') {
    return ERROR_TYPES.FILE_TOO_LARGE
  }

  // 路径无效
  if (errorMessage.includes('invalid path') || errorMessage.includes('path') ||
      errorCode === 'INVALID_PATH') {
    return ERROR_TYPES.INVALID_PATH
  }

  // 保存失败
  if (errorMessage.includes('save') || errorMessage.includes('write')) {
    return ERROR_TYPES.SAVE_FAILED
  }

  // 加载失败
  if (errorMessage.includes('load') || errorMessage.includes('read')) {
    return ERROR_TYPES.LOAD_FAILED
  }

  // 渲染失败
  if (errorMessage.includes('render') || errorMessage.includes('parse')) {
    return ERROR_TYPES.RENDER_FAILED
  }

  return ERROR_TYPES.UNKNOWN
}

/**
 * 格式化错误信息
 */
export function formatError(error, context = {}) {
  const errorType = detectErrorType(error)
  const template = ERROR_MESSAGES[errorType]

  return {
    type: errorType,
    title: template.title,
    message: context.customMessage || template.message,
    suggestion: template.suggestion,
    details: error.message,
    timestamp: new Date().toISOString(),
    context
  }
}

/**
 * 生成用户友好的错误提示文本
 */
export function getUserFriendlyMessage(error, context = {}) {
  const formattedError = formatError(error, context)
  
  let message = `${formattedError.title}\n\n${formattedError.message}`
  
  if (formattedError.suggestion) {
    message += `\n\n建议：${formattedError.suggestion}`
  }
  
  if (context.showDetails && formattedError.details) {
    message += `\n\n详细信息：${formattedError.details}`
  }
  
  return message
}

/**
 * 记录错误日志
 */
export function logError(error, context = {}) {
  const formattedError = formatError(error, context)
  
  console.group(`[ERROR] ${formattedError.title}`)
  console.error('错误类型:', formattedError.type)
  console.error('错误信息:', formattedError.message)
  console.error('建议:', formattedError.suggestion)
  console.error('详细信息:', formattedError.details)
  if (Object.keys(context).length > 0) {
    console.error('上下文:', context)
  }
  console.error('时间戳:', formattedError.timestamp)
  console.groupEnd()
  
  return formattedError
}

/**
 * 处理错误并显示提示
 */
export function handleError(error, context = {}, showToast = null) {
  const formattedError = logError(error, context)
  
  if (showToast) {
    showToast(getUserFriendlyMessage(error, context), 'error')
  }
  
  return formattedError
}

export { ERROR_TYPES }
