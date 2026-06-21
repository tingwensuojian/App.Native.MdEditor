/**
 * 原生 MinIO 图床适配器（S3 兼容）
 */

const path = require('path');
const crypto = require('crypto');
const { Client } = require('minio');
const ImageBedAdapter = require('./ImageBedAdapter');

class MinIOAdapter extends ImageBedAdapter {
  constructor(config = {}) {
    super(config);
    this.type = 'MinIO';
    this.name = config.name || 'MinIO';

    this.endPoint = config.endPoint || config.endpoint || '';
    this.port = Number(config.port || 0) || undefined;
    this.useSSL = Boolean(config.useSSL);
    this.accessKey = config.accessKey || '';
    this.secretKey = config.secretKey || '';
    this.bucket = config.bucket || '';
    this.path = this.normalizePath(config.path || 'images/');
    this.publicBaseUrl = config.publicBaseUrl || '';
    this.useDatePath = config.useDatePath !== false;

    this.client = new Client({
      endPoint: this.endPoint,
      port: this.port,
      useSSL: this.useSSL,
      accessKey: this.accessKey,
      secretKey: this.secretKey,
    });
  }

  normalizePath(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed || trimmed === '/') return '';
    return trimmed.replace(/^\/+/, '').replace(/\/+$/, '') + '/';
  }

  getDatePath() {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}/`;
  }

  buildObjectName(filename) {
    const datePath = this.useDatePath ? this.getDatePath() : '';
    return `${this.path}${datePath}${filename}`;
  }

  generateFilename(originalName) {
    const ext = path.extname(originalName || '');
    const uuid = crypto.randomBytes(8).toString('hex');
    return `${uuid}${ext || '.jpg'}`;
  }

  buildPublicUrl(objectName) {
    const normalizedObjectName = String(objectName || '').replace(/^\/+/, '');

    if (this.publicBaseUrl) {
      const base = this.publicBaseUrl.replace(/\/+$/, '');
      const basePath = (() => {
        try {
          return new URL(base).pathname || '/';
        } catch {
          return '/';
        }
      })();

      const pathHasBucket = basePath
        .split('/')
        .filter(Boolean)
        .includes(this.bucket);

      if (pathHasBucket) {
        return `${base}/${normalizedObjectName}`;
      }

      return `${base}/${this.bucket}/${normalizedObjectName}`;
    }

    const protocol = this.useSSL ? 'https' : 'http';
    const portPart = this.port ? `:${this.port}` : '';
    return `${protocol}://${this.endPoint}${portPart}/${this.bucket}/${normalizedObjectName}`;
  }

  extractObjectNameFromUrl(url) {
    try {
      const parsed = new URL(url);
      let pathname = decodeURIComponent(parsed.pathname || '');

      if (this.publicBaseUrl) {
        const basePath = new URL(this.publicBaseUrl).pathname || '/';
        if (pathname.startsWith(basePath)) {
          pathname = pathname.slice(basePath.length);
        }

        pathname = pathname.replace(/^\/+/, '');
        const bucketPrefix = `${this.bucket}/`;
        if (pathname.startsWith(bucketPrefix)) {
          pathname = pathname.slice(bucketPrefix.length);
        }

        return pathname;
      }

      const bucketPrefix = `/${this.bucket}/`;
      if (pathname.startsWith(bucketPrefix)) {
        return pathname.slice(bucketPrefix.length);
      }

      return pathname.replace(/^\/+/, '');
    } catch {
      return String(url || '').replace(/^\/+/, '');
    }
  }

  async validateConfig(config) {
    const required = ['endPoint', 'accessKey', 'secretKey', 'bucket'];
    for (const key of required) {
      if (!config[key]) {
        return { valid: false, error: `Missing required field: ${key}` };
      }
    }
    return { valid: true };
  }

  async testConnection() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        return { success: false, error: `Bucket not found: ${this.bucket}` };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async upload(fileBuffer, options = {}) {
    try {
      const filename = this.generateFilename(options.filename || 'image.jpg');
      const objectName = this.buildObjectName(filename);

      const metaData = {
        'Content-Type': options.mimeType || 'application/octet-stream',
      };

      await this.client.putObject(this.bucket, objectName, fileBuffer, metaData);

      return {
        url: this.buildPublicUrl(objectName),
        filename: objectName,
        size: fileBuffer.length,
        originalName: options.filename,
        mimeType: options.mimeType || 'application/octet-stream',
      };
    } catch (err) {
      throw new Error(`Failed to upload to MinIO: ${err.message}`);
    }
  }

  async delete(url) {
    try {
      const objectName = this.extractObjectNameFromUrl(url);
      if (!objectName) {
        return { success: false, error: 'Invalid object url' };
      }

      await this.client.removeObject(this.bucket, objectName);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async list(options = {}) {
    try {
      const prefix = this.path || '';
      const stream = this.client.listObjectsV2(this.bucket, prefix, true);
      const items = [];

      const allObjects = await new Promise((resolve, reject) => {
        const acc = [];
        stream.on('data', (obj) => acc.push(obj));
        stream.on('end', () => resolve(acc));
        stream.on('error', reject);
      });

      allObjects.forEach((obj) => {
        if (!obj || !obj.name) return;
        items.push({
          filename: obj.name,
          url: this.buildPublicUrl(obj.name),
          size: obj.size || 0,
          mimeType: 'image/jpeg',
          createdAt: obj.lastModified ? new Date(obj.lastModified).getTime() : Date.now(),
        });
      });

      items.sort((a, b) => b.createdAt - a.createdAt);
      const page = options.page || 1;
      const limit = options.limit || 20;
      const start = (page - 1) * limit;
      const end = start + limit;

      return {
        images: items.slice(start, end),
        total: items.length,
        hasMore: end < items.length,
      };
    } catch (err) {
      return { images: [], total: 0, hasMore: false, error: err.message };
    }
  }

  getConfig() {
    return {
      type: this.type,
      name: this.name,
      endPoint: this.endPoint,
      port: this.port,
      useSSL: this.useSSL,
      bucket: this.bucket,
      path: this.path,
      publicBaseUrl: this.publicBaseUrl,
      useDatePath: this.useDatePath,
    };
  }
}

module.exports = MinIOAdapter;
