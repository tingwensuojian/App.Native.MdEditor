/**
 * 自定义图床适配器
 * 支持任何兼容的 API 接口
 */

const crypto = require('crypto');
const ImageBedAdapter = require('./ImageBedAdapter');

class CustomAdapter extends ImageBedAdapter {
  constructor(config = {}) {
    super(config);
    this.type = 'custom';
    this.name = config.name || '自定义图床';
    this.uploadUrl = config.uploadUrl;
    this.deleteUrl = config.deleteUrl;
    this.listUrl = config.listUrl;
    this.headers = config.headers || {};
    this.uploadFieldName = config.uploadFieldName || 'file';
    this.responseUrlPath = config.responseUrlPath || 'url';
  }

  /**
   * 验证配置
   */
  async validateConfig(config) {
    if (!config.uploadUrl) {
      return { valid: false, error: 'Missing required field: uploadUrl' };
    }
    return { valid: true };
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      const response = await fetch(this.uploadUrl, {
        method: 'OPTIONS',
        headers: this.headers,
      });

      if (response.ok || response.status === 405) {
        // 405 Method Not Allowed 也表示服务器可达
        return { success: true };
      } else {
        return { success: false, error: `HTTP ${response.status}` };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * 从响应中提取 URL
   */
  extractUrlFromResponse(response, path) {
    const keys = path.split('.');
    let value = response;

    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return null;
      }
    }

    return typeof value === 'string' ? value : null;
  }

  /**
   * 上传图片
   */
  async upload(fileBuffer, options = {}) {
    try {
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: options.mimeType || 'image/jpeg' });
      formData.append(this.uploadFieldName, blob, options.filename || 'image.jpg');

      const response = await fetch(this.uploadUrl, {
        method: 'POST',
        headers: this.headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const url = this.extractUrlFromResponse(data, this.responseUrlPath);

      if (!url) {
        throw new Error(`Cannot extract URL from response using path: ${this.responseUrlPath}`);
      }

      return {
        url,
        filename: options.filename || 'image.jpg',
        size: fileBuffer.length,
        originalName: options.filename,
        mimeType: options.mimeType || 'image/jpeg',
      };
    } catch (err) {
      throw new Error(`Failed to upload to custom imagebed: ${err.message}`);
    }
  }

  /**
   * 删除图片
   */
  async delete(url) {
    try {
      if (!this.deleteUrl) {
        return { success: false, error: 'Delete URL not configured' };
      }

      const response = await fetch(this.deleteUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify({ url }),
      });

      if (response.ok) {
        return { success: true };
      } else {
        return { success: false, error: `HTTP ${response.status}` };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * 获取图片列表
   */
  async list(options = {}) {
    try {
      if (!this.listUrl) {
        return { images: [], total: 0, hasMore: false };
      }

      const page = options.page || 1;
      const limit = options.limit || 20;
      const url = new URL(this.listUrl);
      url.searchParams.append('page', page);
      url.searchParams.append('limit', limit);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: this.headers,
      });

      if (!response.ok) {
        return { images: [], total: 0, hasMore: false };
      }

      const data = await response.json();

      // 假设响应格式为 { images: [...], total: number, hasMore: boolean }
      return {
        images: data.images || [],
        total: data.total || 0,
        hasMore: data.hasMore || false,
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
      uploadUrl: this.uploadUrl,
      deleteUrl: this.deleteUrl,
      listUrl: this.listUrl,
      uploadFieldName: this.uploadFieldName,
      responseUrlPath: this.responseUrlPath,
    };
  }
}

module.exports = CustomAdapter;
