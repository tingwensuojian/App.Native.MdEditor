/**
 * 自定义 OSS 适配器
 * 本质上是 CustomAdapter 的 OSS 语义封装
 */

const CustomAdapter = require('./CustomAdapter');

class CustomOSSAdapter extends CustomAdapter {
  constructor(config = {}) {
    const extraHeaders = { ...(config.headers || {}) };

    if (config.accessKey) {
      extraHeaders['X-Access-Key'] = config.accessKey;
    }
    if (config.secretKey) {
      extraHeaders['X-Secret-Key'] = config.secretKey;
    }
    if (config.bucket) {
      extraHeaders['X-Bucket'] = config.bucket;
    }
    if (config.region) {
      extraHeaders['X-Region'] = config.region;
    }

    super({
      ...config,
      headers: extraHeaders,
      uploadFieldName: config.uploadFieldName || 'file',
      responseUrlPath: config.responseUrlPath || 'url',
    });

    this.type = 'customoss';
    this.name = config.name || '自定义 OSS';
  }

  async validateConfig(config) {
    if (!config.uploadUrl) {
      return { valid: false, error: 'Missing required field: uploadUrl' };
    }
    return { valid: true };
  }
}

module.exports = CustomOSSAdapter;
