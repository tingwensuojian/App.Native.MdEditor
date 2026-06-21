/**
 * 图床适配器基类
 * 所有图床实现都需要继承此类并实现相关方法
 */

class ImageBedAdapter {
  constructor(config = {}) {
    this.config = config;
    this.name = config.name || 'Unknown';
    this.type = config.type || 'unknown';
  }

  /**
   * 初始化适配器
   * @param {Object} config - 配置对象
   */
  async init(config) {
    this.config = config;
  }

  /**
   * 验证配置是否有效
   * @param {Object} config - 配置对象
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async validateConfig(config) {
    return { valid: true };
  }

  /**
   * 测试连接
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async testConnection() {
    return { success: true };
  }

  /**
   * 上传图片
   * @param {Buffer|Stream} fileBuffer - 文件内容
   * @param {Object} options - 上传选项
   * @param {string} options.filename - 文件名
   * @param {string} options.mimeType - MIME 类型
   * @returns {Promise<{url: string, filename: string, size: number, width?: number, height?: number}>}
   */
  async upload(fileBuffer, options = {}) {
    throw new Error('upload() must be implemented');
  }

  /**
   * 删除图片
   * @param {string} url - 图片 URL
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async delete(url) {
    throw new Error('delete() must be implemented');
  }

  /**
   * 获取图片列表
   * @param {Object} options - 查询选项
   * @param {number} options.page - 页码（从 1 开始）
   * @param {number} options.limit - 每页数量
   * @returns {Promise<{images: Array, total: number, hasMore: boolean}>}
   */
  async list(options = {}) {
    return { images: [], total: 0, hasMore: false };
  }

  /**
   * 获取配置信息（不包含敏感信息）
   * @returns {Object}
   */
  getConfig() {
    const config = { ...this.config };
    // 移除敏感信息
    delete config.token;
    delete config.accessKey;
    delete config.secretKey;
    delete config.accessKeyId;
    delete config.accessKeySecret;
    delete config.secretId;
    return config;
  }

  /**
   * 获取适配器信息
   * @returns {Object}
   */
  getInfo() {
    return {
      type: this.type,
      name: this.name,
      config: this.getConfig(),
    };
  }
}

module.exports = ImageBedAdapter;
