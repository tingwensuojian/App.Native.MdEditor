/**
 * 历史版本管理模块
 * 负责保存、获取、删除文件的历史版本
 */

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { getDb } = require('./db')

/**
 * 获取历史存储目录（使用环境变量，不硬编码）
 */
function getHistoryDir() {
  // 优先使用环境变量（生产环境）
  const sharePaths = (process.env.TRIM_DATA_SHARE_PATHS || '').split(':')
  const historyPath = sharePaths.find(p => p.includes('/history'))
  
  // Fallback：使用相对路径（开发环境）
  return historyPath || path.join(__dirname, '../shares/history')
}

/**
 * 生成文件路径哈希（用于目录隔离）
 */
function getFileHash(filePath) {
  return crypto.createHash('md5').update(filePath).digest('hex').substring(0, 16)
}

/**
 * 获取文件的版本目录
 */
function getFileVersionDir(filePath) {
  const historyDir = getHistoryDir()
  const fileHash = getFileHash(filePath)
  return path.join(historyDir, fileHash)
}

/**
 * 保存版本快照
 * @param {string} filePath - 文件路径
 * @param {string} content - 文件内容
 * @param {string} label - 版本标签
 * @param {boolean} autoSaved - 是否自动保存
 * @returns {Object} 版本信息
 */
function saveVersion(filePath, content, label = '', autoSaved = true) {
  try {
    const versionDir = getFileVersionDir(filePath)
    
    // 确保目录存在
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true })
    }
    
    // 加载或创建版本索引
    const indexPath = path.join(versionDir, 'versions.json')
    let index = { 
      filePath, 
      currentVersion: 0, 
      versions: [] 
    }
    
    if (fs.existsSync(indexPath)) {
      const data = fs.readFileSync(indexPath, 'utf8')
      index = JSON.parse(data)
    }
    
    // 生成新版本号
    const versionNumber = index.currentVersion + 1
    const timestamp = Date.now()
    const fileName = `v${String(versionNumber).padStart(3, '0')}_${timestamp}.md`
    
    // 保存版本文件
    const versionFilePath = path.join(versionDir, fileName)
    fs.writeFileSync(versionFilePath, content, 'utf8')
    
    const lines = content.split('\n').length
    const size = Buffer.byteLength(content, 'utf8')

    // 更新文件本地索引（versions.json）
    index.currentVersion = versionNumber
    index.versions.unshift({
      versionNumber,
      fileName,
      timestamp,
      size,
      lines,
      label,
      autoSaved
    })
    
    // 无限制保留所有版本（不自动删除）
    // 用户可以通过UI手动删除不需要的版本
    
    // 保存索引
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8')

    // 更新数据库中的历史索引（history_index）
    try {
      const db = getDb()
      db.prepare(`
        INSERT INTO history_index (
          file_path, version_num, file_name, timestamp, size, lines, label, auto_saved
        ) VALUES (
          @file_path, @version_num, @file_name, @timestamp, @size, @lines, @label, @auto_saved
        )
        ON CONFLICT(file_path, version_num) DO UPDATE SET
          file_name = excluded.file_name,
          timestamp = excluded.timestamp,
          size = excluded.size,
          lines = excluded.lines,
          label = excluded.label,
          auto_saved = excluded.auto_saved
      `).run({
        file_path: filePath,
        version_num: versionNumber,
        file_name: fileName,
        timestamp,
        size,
        lines,
        label,
        auto_saved: autoSaved ? 1 : 0,
      })
    } catch (e) {
      console.error('[history_index] saveVersion db error:', e)
      // 不影响主流程
    }

    return { 
      ok: true,
      versionNumber, 
      fileName 
    }
  } catch (error) {
    console.error('Save version error:', error)
    throw error
  }
}

/**
 * 获取版本列表
 * @param {string} filePath - 文件路径
 * @returns {Array} 版本列表（包含行数差异）
 */
function getVersionList(filePath) {
  try {
    // 优先从数据库查询索引
    try {
      const db = getDb()
      const rows = db.prepare(`
        SELECT file_path, version_num, file_name, timestamp, size, lines, label, auto_saved
        FROM history_index
        WHERE file_path = ?
        ORDER BY version_num DESC
      `).all(filePath)

      if (rows && rows.length > 0) {
        const versions = rows.map(r => ({
          versionNumber: r.version_num,
          fileName: r.file_name,
          timestamp: r.timestamp,
          size: r.size,
          lines: r.lines,
          label: r.label,
          autoSaved: !!r.auto_saved,
        }))

        // 计算行数差异
        const versionMap = {}
        versions.forEach(v => {
          versionMap[v.versionNumber] = v
        })
        for (let i = 0; i < versions.length; i++) {
          const currentVersion = versions[i]
          const previousVersionNumber = currentVersion.versionNumber - 1
          if (previousVersionNumber > 0 && versionMap[previousVersionNumber]) {
            const previousVersion = versionMap[previousVersionNumber]
            currentVersion.linesDiff = currentVersion.lines - previousVersion.lines
          } else {
            currentVersion.linesDiff = 0
          }
        }

        return versions
      }
    } catch (e) {
      console.error('[history_index] getVersionList db error, fallback to JSON:', e)
    }

    // Fallback：使用本地 JSON 索引
    const versionDir = getFileVersionDir(filePath)
    const indexPath = path.join(versionDir, 'versions.json')
    
    if (!fs.existsSync(indexPath)) {
      return []
    }
    
    const data = fs.readFileSync(indexPath, 'utf8')
    const index = JSON.parse(data)
    
    const versions = index.versions || []
    
    // 创建版本号到版本对象的映射，方便查找
    const versionMap = {}
    versions.forEach(v => {
      versionMap[v.versionNumber] = v
    })
    
    // 计算每个版本相对于上一个版本的行数差异
    for (let i = 0; i < versions.length; i++) {
      const currentVersion = versions[i]
      const previousVersionNumber = currentVersion.versionNumber - 1
      
      // 查找上一个版本（版本号 = 当前版本号 - 1）
      if (previousVersionNumber > 0 && versionMap[previousVersionNumber]) {
        const previousVersion = versionMap[previousVersionNumber]
        // 计算行数差异
        currentVersion.linesDiff = currentVersion.lines - previousVersion.lines
      } else {
        // 第一个版本，没有差异
        currentVersion.linesDiff = 0
      }
    }
    
    return versions
  } catch (error) {
    console.error('Get version list error:', error)
    return []
  }
}

/**
 * 获取版本内容
 * @param {string} filePath - 文件路径
 * @param {number} versionNumber - 版本号
 * @returns {Object} 版本信息和内容
 */
function getVersionContent(filePath, versionNumber) {
  try {
    const versionDir = getFileVersionDir(filePath)
    const indexPath = path.join(versionDir, 'versions.json')
    
    if (!fs.existsSync(indexPath)) {
      return null
    }
    
    const data = fs.readFileSync(indexPath, 'utf8')
    const index = JSON.parse(data)
    
    const version = index.versions.find(v => v.versionNumber === versionNumber)
    
    if (!version) {
      return null
    }
    
    const contentPath = path.join(versionDir, version.fileName)
    
    if (!fs.existsSync(contentPath)) {
      return null
    }
    
    const content = fs.readFileSync(contentPath, 'utf8')
    
    return {
      ...version,
      content
    }
  } catch (error) {
    console.error('Get version content error:', error)
    return null
  }
}

/**
 * 删除单个版本
 * @param {string} filePath - 文件路径
 * @param {number} versionNumber - 版本号
 * @returns {Object} 删除结果
 */
function deleteVersion(filePath, versionNumber) {
  try {
    const versionDir = getFileVersionDir(filePath)
    const indexPath = path.join(versionDir, 'versions.json')
    
    if (!fs.existsSync(indexPath)) {
      throw new Error('版本不存在')
    }
    
    const data = fs.readFileSync(indexPath, 'utf8')
    const index = JSON.parse(data)
    
    const version = index.versions.find(v => v.versionNumber === versionNumber)
    
    if (!version) {
      throw new Error('版本不存在')
    }
    
    // 删除版本文件
    const versionFilePath = path.join(versionDir, version.fileName)
    if (fs.existsSync(versionFilePath)) {
      fs.unlinkSync(versionFilePath)
    }
    
    // 更新本地索引
    index.versions = index.versions.filter(v => v.versionNumber !== versionNumber)
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8')

    // 从数据库中删除对应索引
    try {
      const db = getDb()
      db.prepare('DELETE FROM history_index WHERE file_path = ? AND version_num = ?')
        .run(filePath, versionNumber)
    } catch (e) {
      console.error('[history_index] deleteVersion db error:', e)
    }

    return { 
      ok: true,
      deleted: versionNumber 
    }
  } catch (error) {
    console.error('Delete version error:', error)
    throw error
  }
}

/**
 * 删除所有版本
 * @param {string} filePath - 文件路径
 * @returns {Object} 删除结果
 */
function clearAllVersions(filePath) {
  try {
    const versionDir = getFileVersionDir(filePath)
    
    if (!fs.existsSync(versionDir)) {
      return { 
        ok: true,
        cleared: 0 
      }
    }
    
    // 读取索引获取版本数量
    const indexPath = path.join(versionDir, 'versions.json')
    let count = 0
    
    if (fs.existsSync(indexPath)) {
      const data = fs.readFileSync(indexPath, 'utf8')
      const index = JSON.parse(data)
      count = index.versions.length
      
      // 删除所有版本文件
      index.versions.forEach(v => {
        const versionFilePath = path.join(versionDir, v.fileName)
        if (fs.existsSync(versionFilePath)) {
          fs.unlinkSync(versionFilePath)
        }
      })
    }
    
    // 删除整个目录
    fs.rmSync(versionDir, { recursive: true, force: true })

    // 删除数据库中的索引
    try {
      const db = getDb()
      db.prepare('DELETE FROM history_index WHERE file_path = ?').run(filePath)
    } catch (e) {
      console.error('[history_index] clearAllVersions db error:', e)
    }

    return { 
      ok: true,
      cleared: count 
    }
  } catch (error) {
    console.error('Clear all versions error:', error)
    throw error
  }
}

module.exports = {
  saveVersion,
  getVersionList,
  getVersionContent,
  deleteVersion,
  clearAllVersions
}
