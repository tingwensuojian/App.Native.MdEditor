/**
 * 本地存储适配器
 * 将图片存储在本地服务器
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ImageBedAdapter = require('./ImageBedAdapter');

class LocalAdapter extends ImageBedAdapter {
  constructor(config = {}) {
    super(config);
    this.type = 'local';
    this.name = config.name || '本地存储';
    
    // 本地存储路径
    this.basePath = config.basePath || this.getDefaultBasePath();
    this.useDatePath = config.useDatePath !== false;
    this.originalsDir = path.join(this.basePath, 'originals');
    this.thumbnailsDir = path.join(this.basePath, 'thumbnails');
    
    // 确保目录存在
    this.ensureDirectories();
  }

  /**
   * 获取默认的本地存储路径
   */
  getDefaultBasePath() {
    const trimVar = process.env.TRIM_PKGVAR;
    if (trimVar) {
      return path.join(trimVar, 'images');
    }
    
    // 开发环境
    const appRoot = path.join(__dirname, '../..');
    return path.join(appRoot, 'shares', 'images');
  }

  /**
   * 确保目录存在
   */
  ensureDirectories() {
    try {
      if (!fs.existsSync(this.basePath)) {
        fs.mkdirSync(this.basePath, { recursive: true });
      }
      if (!fs.existsSync(this.originalsDir)) {
        fs.mkdirSync(this.originalsDir, { recursive: true });
      }
      if (!fs.existsSync(this.thumbnailsDir)) {
        fs.mkdirSync(this.thumbnailsDir, { recursive: true });
      }
    } catch (err) {
      console.error('[LocalAdapter] Failed to create directories:', err);
    }
  }

  /**
   * 验证配置
   */
  async validateConfig(config) {
    try {
      const basePath = config.basePath || this.getDefaultBasePath();
      if (!fs.existsSync(basePath)) {
        fs.mkdirSync(basePath, { recursive: true });
      }
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      this.ensureDirectories();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * 生成唯一的文件名
   */
  generateFilename(originalName) {
    const ext = path.extname(originalName);
    const uuid = crypto.randomBytes(8).toString('hex');
    return `${uuid}${ext}`;
  }

  getDatePath() {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return path.join(year, month, day);
  }

  buildStoredRelativePath(filename) {
    return this.useDatePath ? path.join(this.getDatePath(), filename) : filename;
  }

  /**
   * 上传图片
   */
  async upload(fileBuffer, options = {}) {
    try {
      const filename = this.generateFilename(options.filename || 'image.jpg');
      const relativePath = this.buildStoredRelativePath(filename);
      const filePath = path.join(this.originalsDir, relativePath);

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      // 写入文件
      fs.writeFileSync(filePath, fileBuffer);
      
      // 获取文件大小
      const stats = fs.statSync(filePath);
      const size = stats.size;
      
      // 生成本地 URL（相对路径）
      const normalizedRelativePath = relativePath.split(path.sep).join('/');
      const url = `/api/image/local/${normalizedRelativePath}`;
      
      return {
        url,
        filename: normalizedRelativePath,
        size,
        originalName: options.filename,
        mimeType: options.mimeType || 'image/jpeg',
      };
    } catch (err) {
      throw new Error(`Failed to upload image: ${err.message}`);
    }
  }

  /**
   * 删除图片
   */
  async delete(url) {
    try {
      // 从 URL 中提取文件名
      const match = url.match(/\/api\/image\/local\/(.+)$/);
      if (!match) {
        return { success: false, error: 'Invalid URL format' };
      }
      
      const filename = decodeURIComponent(match[1]).replace(/^\/+/, '');
      const filePath = path.join(this.originalsDir, filename);
      const parsed = path.parse(filename);
      const thumbnailRelative = path.join(parsed.dir, `${parsed.name}_thumb${parsed.ext}`);
      const thumbnailPath = path.join(this.thumbnailsDir, thumbnailRelative);
      
      // 删除原始文件
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      // 删除缩略图
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
      }

      // 清理空目录（originalsDir/thumbnailsDir 下的年月日）
      this.cleanupEmptyDirs(path.dirname(filePath), this.originalsDir, this.useDatePath ? 3 : 0);
      this.cleanupEmptyDirs(path.dirname(thumbnailPath), this.thumbnailsDir, this.useDatePath ? 3 : 0);
      
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  cleanupEmptyDirs(startDir, baseDir, maxDepth = 3) {
    if (!startDir || !baseDir) return;
    let current = startDir;
    for (let i = 0; i < maxDepth; i += 1) {
      if (!current.startsWith(baseDir)) return;
      try {
        if (!fs.existsSync(current)) return;
        const entries = fs.readdirSync(current);
        if (entries.length > 0) return;
        fs.rmdirSync(current);
        current = path.dirname(current);
      } catch (_) {
        return;
      }
    }
  }

  /**
   * 获取图片列表
   */
  async list(options = {}) {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;

      const files = [];
      const walk = (dir, base = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        entries.forEach((entry) => {
          const rel = path.join(base, entry.name);
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full, rel);
            return;
          }
          if (entry.isFile()) files.push(rel);
        });
      };
      walk(this.originalsDir);

      files.sort((a, b) => {
        const sa = fs.statSync(path.join(this.originalsDir, a)).mtimeMs;
        const sb = fs.statSync(path.join(this.originalsDir, b)).mtimeMs;
        return sb - sa;
      });

      const total = files.length;
      const start = (page - 1) * limit;
      const end = start + limit;
      const paginatedFiles = files.slice(start, end);

      const images = paginatedFiles.map((relative) => {
        const filePath = path.join(this.originalsDir, relative);
        const stats = fs.statSync(filePath);
        const normalizedRelative = relative.split(path.sep).join('/');
        return {
          filename: normalizedRelative,
          url: `/api/image/local/${normalizedRelative}`,
          size: stats.size,
          mimeType: 'image/jpeg',
          createdAt: stats.mtime.getTime(),
        };
      });

      return {
        images,
        total,
        hasMore: end < total,
      };
    } catch (err) {
      return { images: [], total: 0, hasMore: false, error: err.message };
    }
  }

  /**
   * 获取图片文件
   */
  getImageFile(filename) {
    const safeRelative = decodeURIComponent(String(filename || '')).replace(/^\/+/, '');
    const filePath = path.join(this.originalsDir, safeRelative);
    
    // 安全检查：防止路径遍历
    const normalized = path.normalize(filePath);
    if (!normalized.startsWith(this.originalsDir)) {
      throw new Error('Invalid file path');
    }
    
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    
    return filePath;
  }

  /**
   * 获取配置信息
   */
  getConfig() {
    return {
      type: this.type,
      name: this.name,
      basePath: this.basePath,
      useDatePath: this.useDatePath,
    };
  }
}

module.exports = LocalAdapter;
