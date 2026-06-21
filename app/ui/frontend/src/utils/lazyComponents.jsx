// 懒加载组件配置
// 根据设备类型和使用场景按需加载组件

import React, { lazy } from 'react'
import { isMobile } from './performanceOptimization'

/**
 * Monaco Editor - 移动端可选不加载
 */
export const MonacoEditor = lazy(() => {
  if (isMobile()) {
    // 移动端返回轻量级编辑器
    return import('../components/LightweightEditor')
  }
  return import('@monaco-editor/react')
})

/**
 * 图片管理器 - 按需加载
 */
export const ImageManagerDialog = lazy(() => 
  import('../components/ImageManagerDialog')
)

/**
 * 导出对话框 - 按需加载
 */
export const ExportDialog = lazy(() => 
  import('../components/ExportDialog')
)

/**
 * 导出配置面板 - 按需加载
 */
export const ExportConfigPanel = lazy(() => 
  import('../components/ExportConfigPanel')
)

/**
 * 同步对话框 - 按需加载
 */
export const SyncDialog = lazy(() => 
  import('../components/SyncDialog')
)

/**
 * 文件历史对话框 - 按需加载
 */
export const FileHistoryDialog = lazy(() => 
  import('../components/FileHistoryDialog')
)

/**
 * 设置对话框 - 按需加载
 */
export const SettingsDialog = lazy(() => 
  import('../components/SettingsDialog')
)

/**
 * Markdown 帮助对话框 - 按需加载
 */
export const MarkdownHelpDialog = lazy(() => 
  import('../components/MarkdownHelpDialog')
)

/**
 * 快捷键对话框 - 按需加载
 */
export const ShortcutsDialog = lazy(() => 
  import('../components/ShortcutsDialog')
)

/**
 * 关于对话框 - 按需加载
 */
export const AboutDialog = lazy(() => 
  import('../components/AboutDialog')
)

/**
 * 表格插入对话框 - 按需加载
 */
export const TableInsertDialog = lazy(() => 
  import('../components/TableInsertDialog')
)

/**
 * 图片预览对话框 - 按需加载
 */
export const ImagePreviewDialog = lazy(() => 
  import('../components/ImagePreviewDialog')
)

/**
 * 加载占位符组件
 */
export const LoadingFallback = ({ message = '加载中...' }) => (
  <div className="loading-fallback" style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    color: '#666'
  }}>
    <div className="spinner" style={{
      width: '20px',
      height: '20px',
      border: '2px solid #f3f3f3',
      borderTop: '2px solid #3498db',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
      marginRight: '10px'
    }} />
    {message}
  </div>
)

/**
 * 懒加载包装器
 */
export const withLazyLoad = (Component, fallback) => {
  return (props) => (
    <React.Suspense fallback={fallback || <LoadingFallback />}>
      <Component {...props} />
    </React.Suspense>
  )
}

/**
 * 预加载组件
 */
export const preloadComponent = (componentLoader) => {
  componentLoader()
}

/**
 * 预加载常用组件
 */
export const preloadCommonComponents = () => {
  // 桌面端预加载常用组件
  if (!isMobile()) {
    setTimeout(() => {
      preloadComponent(() => import('../components/ImageManagerDialog'))
      preloadComponent(() => import('../components/ExportDialog'))
    }, 2000)
  }
}

export default {
  MonacoEditor,
  ImageManagerDialog,
  ExportDialog,
  ExportConfigPanel,
  SyncDialog,
  FileHistoryDialog,
  SettingsDialog,
  MarkdownHelpDialog,
  ShortcutsDialog,
  AboutDialog,
  TableInsertDialog,
  ImagePreviewDialog,
  LoadingFallback,
  withLazyLoad,
  preloadComponent,
  preloadCommonComponents
}
