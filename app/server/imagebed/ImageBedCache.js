/**
 * 图床缓存管理器
 * - 元数据缓存到 app.db（imagebed_cache 表）
 * - 缩略图保存到 {TRIM_PKGVAR}/thumbnails/{bedId}_{bedName}/
 * - 按需创建目录，不预声明
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// 缩略图最大尺寸
const THUMB_MAX_SIZE = 200

class ImageBedCache {
  constructor(db) {
    this.db = db
    this.thumbBaseDir = this._resolveThumbBaseDir()
    this._initSchema()
  }

  _resolveThumbBaseDir() {
    const trimVar = process.env.TRIM_PKGVAR
    if (trimVar) {
      return path.join(trimVar, 'thumbnails')
    }
    // 开发环境
    return path.join(__dirname, '../../var/thumbnails')
  }

  _initSchema() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS imagebed_cache (
        id           TEXT PRIMARY KEY,
        imagebed_id  INTEGER NOT NULL,
        filename     TEXT NOT NULL,
        url          TEXT NOT NULL,
        raw_url      TEXT,
        github_path  TEXT,
        repo         TEXT,
        size         INTEGER,
        mime_type    TEXT,
        thumb_path   TEXT,
        cached_at    INTEGER NOT NULL,
        created_at   INTEGER,
        FOREIGN KEY(imagebed_id) REFERENCES imagebed_configs(id) ON DELETE CASCADE
      )
    `).run()

    // 兼容旧表结构：补充 created_at 字段
    try {
      const columns = this.db.prepare('PRAGMA table_info(imagebed_cache)').all()
      const hasCreatedAt = columns.some(col => col.name === 'created_at')
      if (!hasCreatedAt) {
        this.db.prepare('ALTER TABLE imagebed_cache ADD COLUMN created_at INTEGER').run()
      }
    } catch (e) {
      console.warn('[ImageBedCache] Failed to ensure created_at column:', e.message)
    }

    // 索引加速查询
    this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_imagebed_cache_bed_id ON imagebed_cache(imagebed_id)
    `).run()
  }

  /**
   * 获取指定图床的缩略图目录（按需创建）
   */
  _getThumbDir(bedId, bedName) {
    // 清理 bedName 中不合法的路径字符
    const safeName = (bedName || 'unknown').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_')
    const dirName = `${bedId}_${safeName}`
    const thumbDir = path.join(this.thumbBaseDir, dirName)
    if (!fs.existsSync(thumbDir)) {
      fs.mkdirSync(thumbDir, { recursive: true })
    }
    return thumbDir
  }

  /**
   * 生成图片缓存 ID（基于 url 的 hash）
   */
  _makeId(url) {
    return crypto.createHash('md5').update(url).digest('hex')
  }

  /**
   * 从缓存读取图床图片列表
   */
  getCachedImages(bedId) {
    const rows = this.db.prepare(
      'SELECT * FROM imagebed_cache WHERE imagebed_id = ? ORDER BY COALESCE(created_at, cached_at) DESC'
    ).all(bedId)

    return rows.map(row => this._rowToImage(row))
  }

  async ensureThumbs(bedId, bedName) {
    const rows = this.db.prepare(
      'SELECT * FROM imagebed_cache WHERE imagebed_id = ?'
    ).all(bedId)

    for (const row of rows) {
      const hasThumb = row.thumb_path && fs.existsSync(row.thumb_path)
      if (hasThumb) continue
      try {
        const img = this._rowToImage(row)
        const thumbPath = await this._generateThumb(bedId, bedName, img)
        this.db.prepare('UPDATE imagebed_cache SET thumb_path = ? WHERE id = ?').run(thumbPath, row.id)
      } catch (e) {
        console.warn('[ImageBedCache] Failed to refresh thumb:', row.filename, e.message)
      }
    }
  }

  /**
   * 检查图床是否有缓存
   */
  hasCachedImages(bedId) {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM imagebed_cache WHERE imagebed_id = ?'
    ).get(bedId)
    return row && row.cnt > 0
  }

  /**
   * 将图片列表写入缓存（增量：只新增，不删除已存在的）
   * 返回新增数量
   */
  async upsertImages(bedId, bedName, images) {
    const now = Date.now()
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO imagebed_cache
        (id, imagebed_id, filename, url, raw_url, github_path, repo, size, mime_type, thumb_path, cached_at, created_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertMany = this.db.transaction(async (imgs) => {
      for (const img of imgs) {
        const id = this._makeId(img.url)
        // 先检查是否已有缩略图
        const existing = this.db.prepare('SELECT thumb_path FROM imagebed_cache WHERE id = ?').get(id)
        let thumbPath = existing?.thumb_path || null

        // 如果没有缩略图，异步下载生成
        if (!thumbPath) {
          try {
            thumbPath = await this._generateThumb(bedId, bedName, img)
          } catch (e) {
            console.warn('[ImageBedCache] Failed to generate thumb for', img.filename, e.message)
          }
        }

        const createdAt = Number(img.createdAt) || now
        insert.run(
          id,
          bedId,
          img.filename,
          img.url,
          img.rawUrl || null,
          img.githubPath || null,
          img.repo || null,
          img.size || 0,
          img.mimeType || 'image/jpeg',
          thumbPath,
          now,
          createdAt
        )
      }
    })

    await insertMany(images)
  }

  /**
   * 删除单条缓存记录及缩略图
   */
  deleteByUrl(url) {
    const id = this._makeId(url)
    const row = this.db.prepare('SELECT thumb_path FROM imagebed_cache WHERE id = ?').get(id)
    if (row?.thumb_path) {
      try {
        if (fs.existsSync(row.thumb_path)) fs.unlinkSync(row.thumb_path)
        const thumbDir = path.dirname(row.thumb_path)
        this._cleanupEmptyDirs(thumbDir, this.thumbBaseDir, 3)
      } catch (e) {
        console.warn('[ImageBedCache] Failed to delete thumb:', row.thumb_path, e.message)
      }
    }
    this.db.prepare('DELETE FROM imagebed_cache WHERE id = ?').run(id)
  }

  _cleanupEmptyDirs(startDir, baseDir, maxDepth = 3) {
    if (!startDir || !baseDir) return
    let current = startDir
    for (let i = 0; i < maxDepth; i += 1) {
      if (!current.startsWith(baseDir)) return
      try {
        if (!fs.existsSync(current)) return
        const entries = fs.readdirSync(current)
        if (entries.length > 0) return
        fs.rmdirSync(current)
        current = path.dirname(current)
      } catch (_) {
        return
      }
    }
  }

  /**
   * 删除整个图床的缓存和缩略图目录
   */
  deleteByBedId(bedId, bedName) {
    try {
      const thumbDir = path.join(this.thumbBaseDir, `${bedId}_${(bedName || 'unknown').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_')}`)
      if (fs.existsSync(thumbDir)) {
        fs.rmSync(thumbDir, { recursive: true, force: true })
      }
    } catch (e) {
      console.warn('[ImageBedCache] Failed to delete thumb dir:', e.message)
    }
    this.db.prepare('DELETE FROM imagebed_cache WHERE imagebed_id = ?').run(bedId)
  }

  /**
   * 下载图片并生成缩略图，返回本地路径
   */
  async _generateThumb(bedId, bedName, img) {
    const thumbDir = this._getThumbDir(bedId, bedName)
    const id = this._makeId(img.url)
    const thumbFilename = `${id}.jpg`
    const thumbPath = path.join(thumbDir, thumbFilename)

    if (fs.existsSync(thumbPath)) return thumbPath

    // 下载原图
    const fetchUrl = img.rawUrl || img.url
    const response = await fetch(fetchUrl)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())

    // 尝试用 sharp 生成缩略图，不可用时直接保存原图
    try {
      const sharp = require('sharp')
      await sharp(buffer)
        .resize(THUMB_MAX_SIZE, THUMB_MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toFile(thumbPath)
    } catch (e) {
      // sharp 不可用，直接保存原始内容
      fs.writeFileSync(thumbPath, buffer)
    }

    return thumbPath
  }

  /**
   * 将数据库行转为前端图片对象
   */
  _rowToImage(row) {
    return {
      id: row.id,
      filename: row.filename,
      url: row.url,
      rawUrl: row.raw_url,
      githubPath: row.github_path,
      repo: row.repo,
      size: row.size,
      mimeType: row.mime_type,
      thumbPath: row.thumb_path,
      // 前端访问缩略图的 URL
      thumbUrl: row.thumb_path ? `/api/imagebed/${row.imagebed_id}/thumb/${row.id}` : row.url,
      cachedAt: row.cached_at,
      createdAt: row.cached_at,
    }
  }

  /**
   * 根据 id 获取缩略图文件路径（供接口返回文件流）
   */
  getThumbPath(imageId) {
    const row = this.db.prepare('SELECT thumb_path FROM imagebed_cache WHERE id = ?').get(imageId)
    return row?.thumb_path || null
  }
}

module.exports = ImageBedCache
