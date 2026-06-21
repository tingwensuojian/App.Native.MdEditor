/**
 * 图床管理器
 * 管理多个图床配置和适配器实例
 */

const crypto = require('crypto');
const LocalAdapter = require('./LocalAdapter');
const GitHubAdapter = require('./GitHubAdapter');
const QiniuAdapter = require('./QiniuAdapter');
const AliyunOSSAdapter = require('./AliyunOSSAdapter');
const TencentCOSAdapter = require('./TencentCOSAdapter');
const WebDAVAdapter = require('./WebDAVAdapter');
const MinIOAdapter = require('./MinIOAdapter');
const CustomOSSAdapter = require('./CustomOSSAdapter');
const CustomAdapter = require('./CustomAdapter');
const ImageBedCache = require('./ImageBedCache');

class ImageBedManager {
  constructor(db, encryptionKey, secretsAccessChecker) {
    this.db = db;
    this.encryptionKey = encryptionKey;
    this.secretsAccessChecker = secretsAccessChecker;
    this.adapters = new Map(); // 缓存适配器实例
    this.cache = new ImageBedCache(db);
    this.initDatabase();
  }

  /**
   * 是否允许访问敏感配置
   */
  isSecretsAccessAllowed(req) {
    if (typeof this.secretsAccessChecker === 'function') {
      return !!this.secretsAccessChecker(req);
    }
    return false;
  }

  /**
   * 初始化数据库表
   */
  initDatabase() {
    // 图床配置表
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS imagebed_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        config_json TEXT NOT NULL,
        created_at INTEGER,
        updated_at INTEGER
      )
    `).run();

    // 图片记录表
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS imagebed_images (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        original_name TEXT,
        size INTEGER,
        mime_type TEXT,
        width INTEGER,
        height INTEGER,
        imagebed_id INTEGER NOT NULL,
        imagebed_type TEXT,
        imagebed_url TEXT,
        local_path TEXT,
        description TEXT,
        tags TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        FOREIGN KEY(imagebed_id) REFERENCES imagebed_configs(id)
      )
    `).run();

    // 初始化默认的本地存储配置
    this.ensureDefaultLocalConfig();
  }

  /**
   * 确保存在默认的本地存储配置
   */
  ensureDefaultLocalConfig() {
    try {
      const existing = this.db.prepare(
        'SELECT id FROM imagebed_configs WHERE type = ? AND is_default = 1'
      ).get('local');

      if (!existing) {
        const now = Date.now();
        this.db.prepare(`
          INSERT OR IGNORE INTO imagebed_configs (name, type, is_default, config_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('本地存储', 'local', 1, '{}', now, now);
      }
    } catch (err) {
      console.error('[ImageBedManager] Failed to ensure default local config:', err);
    }
  }

  /**
   * 加密配置
   */
  encryptConfig(config) {
    if (!this.encryptionKey) {
      return config;
    }

    try {
      const plaintext = JSON.stringify(config);
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();

      return {
        __enc: 'aes-gcm',
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        data: encrypted.toString('base64'),
      };
    } catch (err) {
      console.error('[ImageBedManager] Encryption failed:', err);
      return config;
    }
  }

  /**
   * 解密配置
   */
  decryptConfig(encrypted) {
    if (!encrypted || encrypted.__enc !== 'aes-gcm' || !this.encryptionKey) {
      return encrypted;
    }

    try {
      const iv = Buffer.from(encrypted.iv, 'base64');
      const tag = Buffer.from(encrypted.tag, 'base64');
      const data = Buffer.from(encrypted.data, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(tag);
      const plaintext = decipher.update(data) + decipher.final('utf8');
      return JSON.parse(plaintext);
    } catch (err) {
      console.error('[ImageBedManager] Decryption failed:', err);
      return encrypted;
    }
  }

  /**
   * 获取或创建适配器实例
   */
  async getAdapter(configId) {
    if (this.adapters.has(configId)) {
      return this.adapters.get(configId);
    }

    const config = this.db.prepare(
      'SELECT * FROM imagebed_configs WHERE id = ?'
    ).get(configId);

    if (!config) {
      throw new Error(`Imagebed config not found: ${configId}`);
    }

    let configData = JSON.parse(config.config_json);
    configData = this.decryptConfig(configData);

    console.log('[ImageBedManager] Initializing adapter', {
      id: config.id,
      name: config.name,
      type: config.type,
    });

    let adapter;
    switch (config.type) {
      case 'local':
        adapter = new LocalAdapter({ name: config.name, ...configData });
        break;
      case 'github':
        adapter = new GitHubAdapter({ name: config.name, ...configData });
        break;
      case 'qiniu':
        adapter = new QiniuAdapter({ name: config.name, ...configData });
        break;
      case 'aliyun':
        adapter = new AliyunOSSAdapter({ name: config.name, ...configData });
        break;
      case 'tencent':
        adapter = new TencentCOSAdapter({ name: config.name, ...configData });
        break;
      case 'webdav':
        adapter = new WebDAVAdapter({ name: config.name, ...configData });
        break;
      case 'MinIO':
        adapter = new MinIOAdapter({ name: config.name, ...configData });
        break;
      case 'customoss':
        adapter = new CustomOSSAdapter({ name: config.name, ...configData });
        break;
      case 'custom':
        adapter = new CustomAdapter({ name: config.name, ...configData });
        break;
      default:
        throw new Error(`Unknown imagebed type: ${config.type}`);
    }

    this.adapters.set(configId, adapter);
    return adapter;
  }

  /**
   * 移除敏感字段，避免对外暴露
   */
  sanitizeConfig(configData = {}) {
    const sanitized = { ...configData };
    delete sanitized.token;
    delete sanitized.accessKey;
    delete sanitized.secretKey;
    delete sanitized.accessKeyId;
    delete sanitized.accessKeySecret;
    delete sanitized.secretId;
    delete sanitized.secretKey;
    delete sanitized.password;
    delete sanitized.accessKey;
    delete sanitized.token;
    delete sanitized.headers;
    delete sanitized.headersJson;
    delete sanitized.refreshToken;
    return sanitized;
  }

  /**
   * 获取所有图床配置
   */
  getAllConfigs() {
    try {
      const configs = this.db.prepare(
        'SELECT id, name, type, config_json, is_default, created_at, updated_at FROM imagebed_configs ORDER BY is_default DESC, created_at ASC'
      ).all();

      return configs.map(config => {
        let configData = {};
        try {
          const parsed = JSON.parse(config.config_json);
          configData = this.decryptConfig(parsed);
        } catch (e) {
          // ignore parse errors
        }
        return {
          id: config.id,
          name: config.name,
          type: config.type,
          config: this.sanitizeConfig(configData),
          isDefault: config.is_default === 1,
          createdAt: config.created_at,
          updatedAt: config.updated_at,
        };
      });
    } catch (err) {
      console.error('[ImageBedManager] Failed to get all configs:', err);
      return [];
    }
  }

  /**
   * 获取单个图床配置
   */
  getConfigById(configId, options = {}) {
    const { includeSecrets = false } = options;
    try {
      const config = this.db.prepare(
        'SELECT id, name, type, config_json, is_default, created_at, updated_at FROM imagebed_configs WHERE id = ?'
      ).get(configId);

      if (!config) return null;

      let configData = {};
      try {
        const parsed = JSON.parse(config.config_json);
        configData = this.decryptConfig(parsed);
      } catch (e) {
        // ignore parse errors
      }

      return {
        id: config.id,
        name: config.name,
        type: config.type,
        config: includeSecrets ? configData : this.sanitizeConfig(configData),
        isDefault: config.is_default === 1,
        createdAt: config.created_at,
        updatedAt: config.updated_at,
      };
    } catch (err) {
      console.error('[ImageBedManager] Failed to get config by id:', err);
      return null;
    }
  }

  /**
   * 获取默认图床配置
   */
  getDefaultConfig() {
    try {
      const config = this.db.prepare(
        'SELECT id FROM imagebed_configs WHERE is_default = 1 LIMIT 1'
      ).get();

      return config ? config.id : null;
    } catch (err) {
      console.error('[ImageBedManager] Failed to get default config:', err);
      return null;
    }
  }

  /**
   * 设置默认图床
   */
  setDefaultConfig(configId) {
    try {
      const now = Date.now();
      this.db.prepare('UPDATE imagebed_configs SET is_default = 0').run();
      this.db.prepare(
        'UPDATE imagebed_configs SET is_default = 1, updated_at = ? WHERE id = ?'
      ).run(now, configId);
      return true;
    } catch (err) {
      console.error('[ImageBedManager] Failed to set default config:', err);
      return false;
    }
  }

  /**
   * 添加图床配置
   */
  addConfig(name, type, config) {
    try {
      const now = Date.now();
      const encryptedConfig = this.encryptConfig(config);
      const configJson = JSON.stringify(encryptedConfig);

      const result = this.db.prepare(`
        INSERT INTO imagebed_configs (name, type, is_default, config_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(name, type, 0, configJson, now, now);

      // 清除缓存
      this.adapters.delete(result.lastInsertRowid);

      return result.lastInsertRowid;
    } catch (err) {
      console.error('[ImageBedManager] Failed to add config:', err);
      throw err;
    }
  }

  /**
   * 更新图床配置
   */
  updateConfig(configId, name, config) {
    try {
      const now = Date.now();
      const encryptedConfig = this.encryptConfig(config);
      const configJson = JSON.stringify(encryptedConfig);

      this.db.prepare(`
        UPDATE imagebed_configs SET name = ?, config_json = ?, updated_at = ? WHERE id = ?
      `).run(name, configJson, now, configId);

      // 清除缓存
      this.adapters.delete(configId);

      return true;
    } catch (err) {
      console.error('[ImageBedManager] Failed to update config:', err);
      throw err;
    }
  }

  /**
   * 删除图床配置
   */
  deleteConfig(configId) {
    try {
      const removeConfig = this.db.transaction(() => {
        // 不允许删除默认配置
        const config = this.db.prepare(
          'SELECT is_default, name FROM imagebed_configs WHERE id = ?'
        ).get(configId);

        if (config && config.is_default === 1) {
          throw new Error('Cannot delete default imagebed');
        }

        // 删除缓存和缩略图目录
        if (config) {
          this.cache.deleteByBedId(configId, config.name);
        }

        // 删除关联图片记录，避免外键约束失败
        this.db.prepare('DELETE FROM imagebed_images WHERE imagebed_id = ?').run(configId);

        // 删除配置
        this.db.prepare('DELETE FROM imagebed_configs WHERE id = ?').run(configId);
      });

      removeConfig();
      this.adapters.delete(configId);

      return true;
    } catch (err) {
      console.error('[ImageBedManager] Failed to delete config:', err);
      throw err;
    }
  }

  /**
   * 测试图床连接
   */
  async testConnection(configId) {
    try {
      const adapter = await this.getAdapter(configId);
      return await adapter.testConnection();
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * 上传图片
   */
  async uploadImage(fileBuffer, options = {}) {
    try {
      const configId = options.imagebedId || this.getDefaultConfig();
      if (!configId) {
        throw new Error('No imagebed configured');
      }

      const adapter = await this.getAdapter(configId);
      console.log('[ImageBedManager] Upload using config', {
        configId,
        type: adapter.type,
        name: adapter.name,
        path: adapter.path,
      });
      const result = await adapter.upload(fileBuffer, options);

      // 保存图片记录
      const imageId = crypto.randomBytes(8).toString('hex');
      const now = Date.now();

      this.db.prepare(`
        INSERT INTO imagebed_images (
          id, filename, original_name, size, mime_type,
          imagebed_id, imagebed_type, imagebed_url,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        imageId,
        result.filename,
        options.filename,
        result.size,
        options.mimeType,
        configId,
        adapter.type,
        result.url,
        now,
        now
      );

      // 外部图床：立即写入缓存并尝试生成缩略图（不阻塞上传返回）
      if (adapter.type !== 'local') {
        const config = this.getAllConfigs().find(c => c.id === configId);
        const bedName = config?.name || adapter.name || 'unknown';
        this.cache.upsertImages(configId, bedName, [
          {
            filename: result.filename,
            url: result.url,
            size: result.size,
            mimeType: result.mimeType || options.mimeType || 'image/jpeg',
          },
        ]).catch(err => {
          console.error('[ImageBedManager] Failed to cache uploaded image:', err.message);
        });
      }

      return {
        id: imageId,
        ...result,
      };
    } catch (err) {
      console.error('[ImageBedManager] Failed to upload image:', err);
      throw err;
    }
  }

  /**
   * 删除图片
   */
  async deleteImage(imageId) {
    try {
      const image = this.db.prepare(
        'SELECT * FROM imagebed_images WHERE id = ?'
      ).get(imageId);

      if (!image) {
        throw new Error('Image not found');
      }

      const adapter = await this.getAdapter(image.imagebed_id);
      const result = await adapter.delete(image.imagebed_url);

      if (result.success) {
        this.db.prepare('DELETE FROM imagebed_images WHERE id = ?').run(imageId);
      }

      return result;
    } catch (err) {
      console.error('[ImageBedManager] Failed to delete image:', err);
      throw err;
    }
  }

  /**
   * 获取图片列表
   */
  getImageList(options = {}) {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const imagebedId = options.imagebedId;

      let query = 'SELECT * FROM imagebed_images';
      const params = [];

      if (imagebedId) {
        query += ' WHERE imagebed_id = ?';
        params.push(imagebedId);
      }

      query += ' ORDER BY created_at DESC';

      const total = this.db.prepare(
        query.replace('SELECT *', 'SELECT COUNT(*) as count')
      ).get(...params).count;

      const offset = (page - 1) * limit;
      query += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const images = this.db.prepare(query).all(...params);

      return {
        images: images.map(img => ({
          id: img.id,
          filename: img.filename,
          originalName: img.original_name,
          size: img.size,
          mimeType: img.mime_type,
          url: img.imagebed_url,
          imagebedType: img.imagebed_type,
          createdAt: img.created_at,
        })),
        total,
        hasMore: offset + limit < total,
      };
    } catch (err) {
      console.error('[ImageBedManager] Failed to get image list:', err);
      return { images: [], total: 0, hasMore: false };
    }
  }

  /**
   * 获取指定图床的图片列表（优先返回缓存，force=true 时强制刷新）
   */
  async listImages(configId, force = false) {
    try {
      const config = this.getAllConfigs().find(c => c.id === configId);
      if (!config) throw new Error(`Imagebed config not found: ${configId}`);

      // 本地存储不走缓存
      if (config.type === 'local') {
        const adapter = await this.getAdapter(configId);
        return await adapter.list();
      }

      // 有缓存且不强制刷新，直接返回缓存
      if (!force && this.cache.hasCachedImages(configId)) {
        const images = this.cache.getCachedImages(configId);
        return { images, total: images.length, fromCache: true };
      }

      // 优先刷新本地缩略图缓存，不直接依赖云端列表
      await this.cache.ensureThumbs(configId, config.name);

      // 有缓存则直接返回缓存（本地缩略图刷新后）
      if (this.cache.hasCachedImages(configId)) {
        const images = this.cache.getCachedImages(configId);
        return { images, total: images.length, fromCache: true };
      }

      // 无缓存时才从云端拉取
      const adapter = await this.getAdapter(configId);
      const result = await adapter.list();
      const images = result.images || [];

      // 异步写入缓存（不阻塞返回）
      this.cache.upsertImages(configId, config.name, images).catch(err => {
        console.error('[ImageBedManager] Failed to cache images:', err);
      });

      return { images, total: images.length, fromCache: false };
    } catch (err) {
      console.error('[ImageBedManager] Failed to list images:', err);
      // 若云端请求失败，尝试返回缓存
      if (this.cache.hasCachedImages(configId)) {
        const images = this.cache.getCachedImages(configId);
        return { images, total: images.length, fromCache: true, error: err.message };
      }
      return { images: [], total: 0 };
    }
  }

  /**
   * 删除指定图床的图片（通过 URL），同步删除缓存
   */
  async deleteImageFromBed(configId, url) {
    try {
      const adapter = await this.getAdapter(configId);
      const result = await adapter.delete(url);
      if (result.success) {
        // 同步删除本地缓存和缩略图
        this.cache.deleteByUrl(url);
      }
      return result;
    } catch (err) {
      console.error('[ImageBedManager] Failed to delete image from bed:', err);
      return { success: false, error: err.message };
    }
  }
}

module.exports = ImageBedManager;
