/**
 * 文件历史记录兼容层
 * 保留旧文件名，实际能力已全部切换到后端 API。
 */

export {
  getFileHistory,
  saveFileHistory,
  deleteVersion as deleteHistoryVersion,
  clearAllVersions as clearFileHistory,
  clearAllVersions as clearAllHistory,
  formatHistoryTime,
  formatFileSize,
  calculateDiff,
} from './fileHistoryManagerV2'

export function getAllHistoryFiles() {
  console.warn('[fileHistoryManager] getAllHistoryFiles 已废弃，历史版本已迁移到后端 API')
  return []
}

