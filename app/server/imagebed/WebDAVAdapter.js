/**
 * WebDAV 图床适配器（OpenList/Alist 兼容）
 */

const crypto = require('crypto');
const ImageBedAdapter = require('./ImageBedAdapter');

class WebDAVAdapter extends ImageBedAdapter {
  constructor(config = {}) {
    super(config);
    this.type = 'webdav';
    this.name = config.name || 'WebDAV';
    this.baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
    this.publicBaseUrl = String(config.publicBaseUrl || '').replace(/\/+$/, '');
    this.urlQueries = String(config.urlQueries || '').trim();
    this.authType = String(config.authType || 'auto').toLowerCase();
    this.username = config.username || '';
    this.password = config.password || '';
    this.path = this.normalizePath(config.path || config.pathPrefix || 'images/');
    // publicPath/publicPathPrefix 已弃用：访问路径前缀应直接写入 publicBaseUrl
    this.useDatePath = config.useDatePath !== false;
  }

  normalizePath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return '';
    const p = rawPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    return p ? `${p}/` : '';
  }

  getAuthHeaders(extra = {}) {
    const headers = { ...extra };

    // 当前服务端实现采用标准 Basic；Auto 默认退化为 Basic
    if (this.authType === 'auto' || this.authType === 'basic') {
      if (this.username || this.password) {
        const token = Buffer.from(`${this.username}:${this.password}`).toString('base64');
        headers.Authorization = `Basic ${token}`;
      }
    }

    return headers;
  }

  withQueries(url) {
    if (!this.urlQueries) return url;
    const hasQ = url.includes('?');
    const q = this.urlQueries.replace(/^\?+/, '');
    return `${url}${hasQ ? '&' : '?'}${q}`;
  }

  generateFilename(originalName = 'image.jpg') {
    const ext = (originalName.split('.').pop() || 'jpg').toLowerCase();
    return `${crypto.randomBytes(8).toString('hex')}.${ext}`;
  }

  getDatePath() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}/`;
  }

  buildUploadPrefix() {
    if (!this.useDatePath) return this.path;
    return `${this.path}${this.getDatePath()}`;
  }

  buildPublicPrefix() {
    if (!this.useDatePath) return '';
    return this.getDatePath();
  }

  async ensureDir(relativeDir) {
    const segments = String(relativeDir || '').split('/').filter(Boolean);
    let current = '';
    for (const seg of segments) {
      current = `${current}${seg}/`;
      const dirUrl = this.withQueries(`${this.baseUrl}/${current}`);
      // MKCOL 已存在时可能返回 405/409，视为可继续
      const res = await fetch(dirUrl, {
        method: 'MKCOL',
        headers: this.getAuthHeaders(),
      });
      if (!(res.ok || res.status === 405 || res.status === 409)) {
        throw new Error(`MKCOL failed: HTTP ${res.status}`);
      }
    }
  }

  async validateConfig(config) {
    if (!config.baseUrl || !config.publicBaseUrl) {
      return { valid: false, error: 'Missing required fields: baseUrl, publicBaseUrl' };
    }

    const authType = String(config.authType || 'auto').toLowerCase();
    if (!['auto', 'basic', 'digest', 'ntlm'].includes(authType)) {
      return { valid: false, error: 'Invalid authType, must be one of: auto/basic/digest/ntlm' };
    }

    return { valid: true };
  }

  async testConnection() {
    try {
      const res = await fetch(this.withQueries(this.baseUrl), {
        method: 'PROPFIND',
        headers: this.getAuthHeaders({ Depth: '0' }),
      });
      if (res.ok || res.status === 207 || res.status === 405) return { success: true };
      return { success: false, error: `HTTP ${res.status}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  buildPublicObjectKey(filename) {
    const datePath = this.useDatePath ? this.getDatePath() : '';
    // 新规则：publicBaseUrl 已包含访问路径前缀，这里只拼接日期与文件名
    return `${datePath}${filename}`;
  }

  async upload(fileBuffer, options = {}) {
    try {
      const filename = this.generateFilename(options.filename);
      const dir = this.buildUploadPrefix();
      if (dir) await this.ensureDir(dir);
      const objectKey = `${dir}${filename}`;
      const putUrl = this.withQueries(`${this.baseUrl}/${objectKey}`);

      const res = await fetch(putUrl, {
        method: 'PUT',
        headers: this.getAuthHeaders({
          'Content-Type': options.mimeType || 'image/jpeg',
        }),
        body: fileBuffer,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

      const base = this.publicBaseUrl || this.baseUrl;
      const publicKey = this.buildPublicObjectKey(filename);
      const rawUrl = `${base}/${publicKey}`;
      const url = this.withQueries(rawUrl);

      console.log('[WebDAVAdapter] upload url mapping', {
        baseUrl: this.baseUrl,
        publicBaseUrl: this.publicBaseUrl,
        uploadPathPrefix: this.path,
        objectKey,
        publicKey,
        finalUrl: url,
      });
      return {
        url,
        filename,
        size: fileBuffer.length,
        originalName: options.filename,
        mimeType: options.mimeType || 'image/jpeg',
      };
    } catch (err) {
      throw new Error(`Failed to upload to WebDAV: ${err.message}`);
    }
  }

  async delete(url) {
    try {
      const raw = String(url || '').trim();
      if (!raw) return { success: false, error: 'Invalid URL' };

      let objectKey = '';
      const publicBase = this.publicBaseUrl || this.baseUrl;
      if (raw.startsWith(publicBase)) {
        objectKey = raw.slice(publicBase.length).replace(/^\/+/, '');
      } else if (raw.startsWith(this.baseUrl)) {
        objectKey = raw.slice(this.baseUrl.length).replace(/^\/+/, '');
      } else {
        objectKey = raw.replace(/^https?:\/\/[^/]+\//i, '');
      }

      const delUrl = this.withQueries(`${this.baseUrl}/${objectKey}`);
      const res = await fetch(delUrl, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });

      if (res.ok || res.status === 404) return { success: true };
      return { success: false, error: `HTTP ${res.status}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async list() {
    return { images: [], total: 0, hasMore: false };
  }
}

module.exports = WebDAVAdapter;
