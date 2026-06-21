/**
 * 七牛云图床适配器
 * 将图片存储到七牛云 OSS
 */

const crypto = require('crypto');
const ImageBedAdapter = require('./ImageBedAdapter');

class QiniuAdapter extends ImageBedAdapter {
  constructor(config = {}) {
    super(config);
    this.type = 'qiniu';
    this.name = config.name || '七牛云';
    this.accessKey = config.accessKey;
    this.secretKey = config.secretKey;
    this.bucket = config.bucket;
    this.domain = this.normalizeDomain(config.domain);
    this.zone = config.zone || 'z0';
    this.path = config.path || config.uploadPath || '';
    this.useDatePath = config.useDatePath !== false;
    this.qiniu = null;
    this.initQiniu();
  }

  normalizeDomain(domain) {
    if (!domain || typeof domain !== 'string') return '';
    let trimmed = domain.trim();
    if (!trimmed) return '';
    // 七牛控制台有时会给出 "http(s)://..." 形式，实际应使用明确协议
    trimmed = trimmed
      .replace(/^http\(s\):\/\//i, 'https://')
      .replace(/^https\(s\):\/\//i, 'https://');
    return /^https?:\/\//i.test(trimmed) ? trimmed.replace(/\/+$/, '') : `https://${trimmed.replace(/\/+$/, '')}`;
  }

  normalizeZone(zone) {
    const value = `${zone || ''}`.trim();
    const aliasMap = {
      Zone_CN_East: 'z0',
      Zone_CN_East_2: 'cn-east-2',
      Zone_CN_North: 'z1',
      Zone_CN_South: 'z2',
      Zone_US_North: 'na0',
      Zone_Singapore: 'as0',
      z0: 'z0',
      'cn-east-2': 'cn-east-2',
      z1: 'z1',
      z2: 'z2',
      na0: 'na0',
      as0: 'as0',
    };
    return aliasMap[value] || 'z0';
  }

  normalizePathPrefix(path) {
    const raw = `${path || ''}`.trim();
    if (!raw || raw === '/') return '';
    const normalized = raw.replace(/^\/+/, '').replace(/\/+$/, '');
    return normalized ? `${normalized}/` : '';
  }

  getDatePath() {
    const now = new Date();
    const y = String(now.getFullYear());
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }

  buildUploadPrefix() {
    const basePrefix = this.normalizePathPrefix(this.path);
    if (!this.useDatePath) return basePrefix;
    return `${basePrefix}${this.getDatePath()}/`;
  }

  extractKeyFromUrl(url) {
    if (!url || typeof url !== 'string') return '';
    let normalizedUrl = url;
    try {
      normalizedUrl = decodeURIComponent(url);
    } catch (_) {}

    const domain = this.normalizeDomain(this.domain);
    if (domain && normalizedUrl.startsWith(`${domain}/`)) {
      return normalizedUrl.slice(domain.length + 1).split('?')[0].split('#')[0];
    }

    try {
      const parsed = new URL(normalizedUrl);
      return parsed.pathname.replace(/^\/+/, '').split('?')[0].split('#')[0];
    } catch (_) {
      return normalizedUrl.replace(/^\/+/, '').split('?')[0].split('#')[0];
    }
  }

  async deleteObjectByKey(key) {
    return new Promise((resolve) => {
      this.bucketManager.delete(this.bucket, key, (err, respBody, respInfo) => {
        if (err) {
          resolve({ success: false, error: err.message || String(err) });
          return;
        }
        if (respInfo?.statusCode === 200 || respInfo?.statusCode === 612) {
          resolve({ success: true });
          return;
        }
        resolve({ success: false, error: `Qiniu API error: ${respInfo?.statusCode || 'unknown'}` });
      });
    });
  }

  async isPrefixEmpty(prefix, removedKeys = []) {
    return new Promise((resolve) => {
      this.bucketManager.listPrefix(this.bucket, { prefix, limit: 100 }, (err, respBody, respInfo) => {
        if (err || respInfo?.statusCode !== 200) {
          resolve(false);
          return;
        }
        const items = Array.isArray(respBody?.items) ? respBody.items : [];
        const remained = items.filter((item) => !removedKeys.includes(item.key));
        resolve(remained.length === 0);
      });
    });
  }

  async cleanupEmptyPrefixes(objectKey) {
    const cleanedKeys = [];
    const segments = String(objectKey || '').split('/').filter(Boolean);
    if (segments.length <= 1) return;

    // 从最深层目录开始逐级向上清理，最多清到配置的上传根目录
    const baseRoot = this.normalizePathPrefix(this.path).replace(/\/+$/, '');
    for (let i = segments.length - 1; i > 0; i -= 1) {
      const prefix = `${segments.slice(0, i).join('/')}/`;
      if (baseRoot && !prefix.startsWith(`${baseRoot}/`) && prefix !== `${baseRoot}/`) {
        break;
      }

      // 目录在对象存储中是前缀，若前缀下已无对象则删除目录占位对象（若存在）
      const empty = await this.isPrefixEmpty(prefix, cleanedKeys);
      if (!empty) break;

      const markerResult = await this.deleteObjectByKey(prefix);
      if (markerResult.success) {
        cleanedKeys.push(prefix);
      }
    }
  }

  /**
   * 初始化七牛云 SDK
   */
  initQiniu() {
    try {
      const qiniu = require('qiniu');
      const mac = new qiniu.auth.digest.Mac(this.accessKey, this.secretKey);
      
      const config = new qiniu.conf.Config();
      const regionId = this.normalizeZone(this.zone);
      if (qiniu.httpc?.Region?.fromRegionId) {
        config.regionsProvider = qiniu.httpc.Region.fromRegionId(regionId);
      } else {
        const legacyZoneMap = {
          z0: 'Zone_z0',
          'cn-east-2': 'Zone_cn_east_2',
          z1: 'Zone_z1',
          z2: 'Zone_z2',
          na0: 'Zone_na0',
          as0: 'Zone_as0',
        };
        config.zone = qiniu.zone?.[legacyZoneMap[regionId] || 'Zone_z0'];
      }
      
      this.bucketManager = new qiniu.rs.BucketManager(mac, config);
      this.uploader = new qiniu.form_up.FormUploader(config);
      this.mac = mac;
      this.qiniu = qiniu;
    } catch (err) {
      console.error('[QiniuAdapter] Failed to initialize Qiniu SDK:', err);
    }
  }

  /**
   * 验证配置
   */
  async validateConfig(config) {
    if (!config.accessKey || !config.secretKey || !config.bucket || !config.domain) {
      return { valid: false, error: 'Missing required fields: accessKey, secretKey, bucket, domain' };
    }
    return { valid: true };
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      if (!this.bucketManager) {
        return { success: false, error: 'Qiniu SDK not initialized' };
      }

      return new Promise((resolve) => {
        this.bucketManager.listPrefix(this.bucket, { prefix: '', limit: 1 }, (err, respBody, respInfo) => {
          if (respInfo.statusCode === 200) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: `Qiniu API error: ${respInfo.statusCode}` });
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
    const prefix = this.buildUploadPrefix();
    return `${prefix}${uuid}.${ext}`;
  }

  /**
   * 生成上传 token
   */
  generateUploadToken() {
    const putPolicy = new this.qiniu.rs.PutPolicy({
      scope: this.bucket,
      expires: 3600,
    });
    return putPolicy.uploadToken(this.mac);
  }

  /**
   * 上传图片
   */
  async upload(fileBuffer, options = {}) {
    try {
      if (!this.uploader) {
        throw new Error('Qiniu SDK not initialized');
      }

      const filename = this.generateFilename(options.filename || 'image.jpg');
      const uploadToken = this.generateUploadToken();

      return new Promise((resolve, reject) => {
        const putExtra = new this.qiniu.form_up.PutExtra();
        
        this.uploader.put(uploadToken, filename, fileBuffer, putExtra, (err, respBody, respInfo) => {
          if (err) {
            reject(new Error(`Failed to upload to Qiniu: ${err.message}`));
          } else if (respInfo.statusCode === 200) {
            const uploadedKey = respBody?.key || filename;
            const url = `${this.domain}/${uploadedKey}`;
            resolve({
              url,
              filename: uploadedKey,
              size: fileBuffer.length,
              originalName: options.filename,
              mimeType: options.mimeType || 'image/jpeg',
            });
          } else {
            reject(new Error(`Qiniu API error: ${respInfo.statusCode}`));
          }
        });
      });
    } catch (err) {
      throw new Error(`Failed to upload to Qiniu: ${err.message}`);
    }
  }

  /**
   * 删除图片
   */
  async delete(url) {
    try {
      if (!this.bucketManager) {
        return { success: false, error: 'Qiniu SDK not initialized' };
      }

      const objectKey = this.extractKeyFromUrl(url);
      if (!objectKey) {
        return { success: false, error: 'Invalid object key' };
      }

      const deleteResult = await this.deleteObjectByKey(objectKey);
      if (!deleteResult.success) {
        return deleteResult;
      }

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
      if (!this.bucketManager) {
        return { images: [], total: 0, hasMore: false };
      }

      const limit = options.limit || 20;
      const marker = options.marker || '';

      return new Promise((resolve) => {
        this.bucketManager.listPrefix(this.bucket, { prefix: '', limit, marker }, (err, respBody, respInfo) => {
          if (respInfo.statusCode === 200) {
            const images = respBody.items
              .filter(item => /\.(jpg|jpeg|png|gif|webp)$/i.test(item.key))
              .map(item => ({
                filename: item.key,
                url: `${this.domain}/${item.key}`,
                size: item.fsize,
                mimeType: 'image/jpeg',
                createdAt: item.putTime / 10000, // 七牛时间戳单位是 100ns
              }));

            resolve({
              images,
              total: respBody.items.length,
              hasMore: respBody.markerNext ? true : false,
              marker: respBody.markerNext,
            });
          } else {
            resolve({ images: [], total: 0, hasMore: false });
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
      domain: this.domain,
      zone: this.zone,
      path: this.path,
      useDatePath: this.useDatePath,
    };
  }
}

module.exports = QiniuAdapter;
