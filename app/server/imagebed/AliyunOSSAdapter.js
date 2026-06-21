/**
 * 阿里云 OSS 图床适配器
 * 将图片存储到阿里云 OSS
 */

const crypto = require('crypto');
const ImageBedAdapter = require('./ImageBedAdapter');

class AliyunOSSAdapter extends ImageBedAdapter {
  constructor(config = {}) {
    super(config);
    this.type = 'aliyun';
    this.name = config.name || '阿里云 OSS';
    this.region = config.region;
    this.accessKeyId = config.accessKeyId;
    this.accessKeySecret = config.accessKeySecret;
    this.bucket = config.bucket;
    this.domain = config.domain;
    this.path = this.normalizePath(config.path || config.uploadPath || '');
    this.useDatePath = config.useDatePath !== false;
    this.client = null;
    this.initClient();
  }

  maskValue(value, head = 3, tail = 2) {
    if (!value || typeof value !== 'string') return '';
    if (value.length <= head + tail) return value.slice(0, 1) + '***';
    return value.slice(0, head) + '***' + value.slice(-tail);
  }

  normalizePath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return '';
    let p = rawPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!p) return '';
    return `${p}/`;
  }

  /**
   * 初始化阿里云 OSS 客户端
   */
  initClient() {
    try {
      if (!this.region || !this.accessKeyId || !this.accessKeySecret || !this.bucket) {
        const missing = [
          !this.region ? 'region' : null,
          !this.accessKeyId ? 'accessKeyId' : null,
          !this.accessKeySecret ? 'accessKeySecret' : null,
          !this.bucket ? 'bucket' : null,
        ].filter(Boolean);
        this.initError = `missing required config: ${missing.join(', ')}`;
        console.error('[AliyunOSSAdapter] OSS config invalid:', this.initError, {
          region: this.region,
          accessKeyId: this.maskValue(this.accessKeyId),
          accessKeySecret: this.maskValue(this.accessKeySecret),
          bucket: this.bucket,
          domain: this.domain || '',
        });
        return;
      }

      const OSS = require('ali-oss');
      if (!OSS) {
        throw new Error('ali-oss module not found. Please install it with "npm install ali-oss"');
      }
      this.client = new OSS({
        region: this.region,
        accessKeyId: this.accessKeyId,
        accessKeySecret: this.accessKeySecret,
        bucket: this.bucket,
        authorizationV4: true,
      });
      console.log('[AliyunOSSAdapter] OSS client initialized', {
        region: this.region,
        bucket: this.bucket,
        domain: this.domain || '',
        path: this.path || '',
        accessKeyId: this.maskValue(this.accessKeyId),
      });
    } catch (err) {
      console.error('[AliyunOSSAdapter] Failed to initialize OSS client:', err);
      this.initError = err.message;
    }
  }

  /**
   * 验证配置
   */
  async validateConfig(config) {
    if (!config.region || !config.accessKeyId || !config.accessKeySecret || !config.bucket) {
      return { valid: false, error: 'Missing required fields: region, accessKeyId, accessKeySecret, bucket' };
    }
    return { valid: true };
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      if (this.initError) {
        return { success: false, error: `OSS client initialization failed: ${this.initError}` };
      }
      if (!this.client) {
        const detail = {
          region: this.region,
          bucket: this.bucket,
          domain: this.domain || '',
          accessKeyId: this.maskValue(this.accessKeyId),
        };
        return { success: false, error: 'OSS client not initialized', detail };
      }

      await this.client.list({ 'max-keys': 1 });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * 生成唯一的文件名
   */
  generateFilename(originalName) {
    const ext = originalName.split('.').pop();
    const uuid = crypto.randomBytes(8).toString('hex');
    return `${uuid}.${ext}`;
  }

  getDatePath() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}/`;
  }

  buildUploadPrefix() {
    if (!this.useDatePath) return this.path;
    return `${this.path}${this.getDatePath()}`;
  }

  extractObjectKeyFromUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';

    try {
      if (/^https?:\/\//i.test(raw)) {
        const u = new URL(raw);
        return decodeURIComponent((u.pathname || '').replace(/^\//, ''));
      }
    } catch (_) {}

    if (this.domain) {
      const domainNorm = String(this.domain).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      const rawNorm = raw.replace(/^https?:\/\//i, '');
      if (rawNorm.startsWith(`${domainNorm}/`)) {
        return rawNorm.slice(domainNorm.length + 1).split('?')[0].split('#')[0];
      }
    }

    return raw.replace(/^\/+/, '').split('?')[0].split('#')[0];
  }

  async deleteObjectByKey(objectKey) {
    try {
      await this.client.delete(objectKey);
      return { success: true };
    } catch (err) {
      // 阿里云删除不存在对象通常也返回成功；若抛错则保守返回失败
      return { success: false, error: err.message };
    }
  }

  async isPrefixEmpty(prefix, removedKeys = []) {
    try {
      const result = await this.client.list({
        'max-keys': 100,
        prefix,
      });
      const objects = Array.isArray(result?.objects) ? result.objects : [];
      const remained = objects.filter((obj) => !removedKeys.includes(obj.name));
      return remained.length === 0;
    } catch (_) {
      return false;
    }
  }

  async cleanupEmptyPrefixes(objectKey) {
    const cleanedKeys = [];
    const segments = String(objectKey || '').split('/').filter(Boolean);
    if (segments.length <= 1) return;

    const baseRoot = String(this.path || '').replace(/\/+$/, '');
    for (let i = segments.length - 1; i > 0; i -= 1) {
      const prefix = `${segments.slice(0, i).join('/')}/`;
      if (baseRoot && !prefix.startsWith(`${baseRoot}/`) && prefix !== `${baseRoot}/`) {
        break;
      }

      const empty = await this.isPrefixEmpty(prefix, cleanedKeys);
      if (!empty) break;

      const markerDelete = await this.deleteObjectByKey(prefix);
      if (markerDelete.success) {
        cleanedKeys.push(prefix);
      }
    }
  }

  /**
   * 上传图片
   */
  async upload(fileBuffer, options = {}) {
    try {
      if (!this.client) {
        throw new Error('OSS client not initialized');
      }

      const filename = this.generateFilename(options.filename || 'image.jpg');
      const objectKey = `${this.buildUploadPrefix()}${filename}`;
      
      const result = await this.client.put(objectKey, fileBuffer, {
        headers: {
          'Content-Type': options.mimeType || 'image/jpeg',
        },
      });

      // 使用自定义域名或默认 OSS 域名
      const url = this.domain ? `${this.domain}/${objectKey}` : result.url;

      return {
        url,
        filename,
        size: fileBuffer.length,
        originalName: options.filename,
        mimeType: options.mimeType || 'image/jpeg',
      };
    } catch (err) {
      throw new Error(`Failed to upload to Aliyun OSS: ${err.message}`);
    }
  }

  /**
   * 删除图片
   */
  async delete(url) {
    try {
      if (!this.client) {
        return { success: false, error: 'OSS client not initialized' };
      }

      let objectKey = this.extractObjectKeyFromUrl(url);
      if (!objectKey) return { success: false, error: 'Cannot resolve object key from url' };

      if (objectKey.startsWith(`${this.bucket}/`)) {
        objectKey = objectKey.slice(this.bucket.length + 1);
      }

      if (this.path && !objectKey.startsWith(this.path)) {
        objectKey = `${this.path}${objectKey.replace(/^\/+/, '')}`;
      }

      const deleteResult = await this.deleteObjectByKey(objectKey);
      if (!deleteResult.success) return deleteResult;

      await this.cleanupEmptyPrefixes(objectKey);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * 获取图片列表
   */
  async list(options = {}) {
    try {
      if (!this.client) {
        return { images: [], total: 0, hasMore: false };
      }

      const maxKeys = options.limit || 20;
      const marker = options.marker || '';

      const result = await this.client.list({
        'max-keys': maxKeys,
        marker,
        prefix: this.path || undefined,
      });

      const images = result.objects
        ? result.objects
            .filter(obj => /\.(jpg|jpeg|png|gif|webp)$/i.test(obj.name))
            .map(obj => {
              const url = this.domain ? `${this.domain}/${obj.name}` : obj.url;
              const displayName = this.path && obj.name.startsWith(this.path)
                ? obj.name.slice(this.path.length)
                : obj.name;
              return {
                filename: displayName,
                url,
                size: obj.size,
                mimeType: 'image/jpeg',
                createdAt: new Date(obj.lastModified).getTime(),
              };
            })
        : [];

      return {
        images,
        total: images.length,
        hasMore: result.isTruncated,
        marker: result.nextMarker,
      };
    } catch (err) {
      return { images: [], total: 0, hasMore: false, error: err.message };
    }
  }

  /**
   * 获取配置信息
   */
  getConfig() {
    return {
      type: this.type,
      name: this.name,
      region: this.region,
      bucket: this.bucket,
      domain: this.domain,
      path: this.path,
      useDatePath: this.useDatePath,
    };
  }
}

module.exports = AliyunOSSAdapter;
