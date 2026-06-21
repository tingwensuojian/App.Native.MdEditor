/**
 * 腾讯云 COS 图床适配器
 * 将图片存储到腾讯云 COS
 */

const crypto = require('crypto');
const ImageBedAdapter = require('./ImageBedAdapter');

class TencentCOSAdapter extends ImageBedAdapter {
  constructor(config = {}) {
    super(config);
    this.type = 'tencent';
    this.name = config.name || '腾讯云 COS';
    this.secretId = config.secretId;
    this.secretKey = config.secretKey;
    this.bucket = config.bucket;
    this.region = config.region;
    this.domain = config.domain;
    this.path = this.normalizePath(config.path || config.uploadPath || '');
    this.useDatePath = config.useDatePath !== false;
    this.client = null;
    this.initClient();
  }

  /**
   * 初始化腾讯云 COS 客户端
   */
  initClient() {
    try {
      const COS = require('cos-nodejs-sdk-v5');
      this.client = new COS({
        SecretId: this.secretId,
        SecretKey: this.secretKey,
      });
    } catch (err) {
      console.error('[TencentCOSAdapter] Failed to initialize COS client:', err);
    }
  }

  normalizePath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return '';
    const p = rawPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    return p ? `${p}/` : '';
  }

  getDatePath() {
    const now = new Date();
    const year = String(now.getFullYear());
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
        return decodeURIComponent((u.pathname || '').replace(/^\//, '')).split('?')[0].split('#')[0];
      }
    } catch (_) {}

    if (this.domain) {
      const domain = String(this.domain).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      const normalized = raw.replace(/^https?:\/\//i, '');
      if (normalized.startsWith(`${domain}/`)) {
        return normalized.slice(domain.length + 1).split('?')[0].split('#')[0];
      }
    }

    return raw.replace(/^\/+/, '').split('?')[0].split('#')[0];
  }

  deleteObjectByKey(key) {
    return new Promise((resolve) => {
      this.client.deleteObject({
        Bucket: this.bucket,
        Region: this.region,
        Key: key,
      }, (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  isPrefixEmpty(prefix, removedKeys = []) {
    return new Promise((resolve) => {
      this.client.getBucket({
        Bucket: this.bucket,
        Region: this.region,
        Prefix: prefix,
        MaxKeys: 100,
      }, (err, data) => {
        if (err) {
          resolve(false);
          return;
        }
        const objects = Array.isArray(data?.Contents) ? data.Contents : [];
        const remained = objects.filter((obj) => !removedKeys.includes(obj.Key));
        resolve(remained.length === 0);
      });
    });
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
   * 验证配置
   */
  async validateConfig(config) {
    if (!config.secretId || !config.secretKey || !config.bucket || !config.region) {
      return { valid: false, error: 'Missing required fields: secretId, secretKey, bucket, region' };
    }
    return { valid: true };
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      if (!this.client) {
        return { success: false, error: 'COS client not initialized' };
      }

      return new Promise((resolve) => {
        this.client.getBucket({
          Bucket: this.bucket,
          Region: this.region,
          MaxKeys: 1,
        }, (err, data) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        });
      });
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
    return `${this.buildUploadPrefix()}${uuid}.${ext}`;
  }

  /**
   * 上传图片
   */
  async upload(fileBuffer, options = {}) {
    try {
      if (!this.client) {
        throw new Error('COS client not initialized');
      }

      const filename = this.generateFilename(options.filename || 'image.jpg');

      return new Promise((resolve, reject) => {
        this.client.putObject({
          Bucket: this.bucket,
          Region: this.region,
          Key: filename,
          Body: fileBuffer,
          ContentType: options.mimeType || 'image/jpeg',
        }, (err, data) => {
          if (err) {
            reject(new Error(`Failed to upload to Tencent COS: ${err.message}`));
          } else {
            // 使用自定义域名或默认 COS 域名
            const domain = this.domain ? this.domain.replace(/\/+$/, '') : '';
            const url = domain
              ? `${domain}/${filename}`
              : `https://${this.bucket}.cos.${this.region}.myqcloud.com/${filename}`;

            resolve({
              url,
              filename,
              size: fileBuffer.length,
              originalName: options.filename,
              mimeType: options.mimeType || 'image/jpeg',
            });
          }
        });
      });
    } catch (err) {
      throw new Error(`Failed to upload to Tencent COS: ${err.message}`);
    }
  }

  /**
   * 删除图片
   */
  async delete(url) {
    try {
      if (!this.client) {
        return { success: false, error: 'COS client not initialized' };
      }

      let objectKey = this.extractObjectKeyFromUrl(url);
      if (!objectKey) {
        return { success: false, error: 'Invalid URL format' };
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

      return new Promise((resolve) => {
        this.client.getBucket({
          Bucket: this.bucket,
          Region: this.region,
          MaxKeys: maxKeys,
          Marker: marker,
        }, (err, data) => {
          if (err) {
            resolve({ images: [], total: 0, hasMore: false });
          } else {
            const images = (data.Contents || [])
              .filter(obj => /\.(jpg|jpeg|png|gif|webp)$/i.test(obj.Key))
              .map(obj => {
                const domain = this.domain ? this.domain.replace(/\/+$/, '') : '';
                const url = domain
                  ? `${domain}/${obj.Key}`
                  : `https://${this.bucket}.cos.${this.region}.myqcloud.com/${obj.Key}`;

                return {
                  filename: obj.Key,
                  url,
                  size: obj.Size,
                  mimeType: 'image/jpeg',
                  createdAt: new Date(obj.LastModified).getTime(),
                };
              });

            resolve({
              images,
              total: images.length,
              hasMore: data.IsTruncated === 'true',
              marker: data.NextMarker,
            });
          }
        });
      });
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
      bucket: this.bucket,
      region: this.region,
      domain: this.domain,
      path: this.path,
      useDatePath: this.useDatePath,
    };
  }
}

module.exports = TencentCOSAdapter;
