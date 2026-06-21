/**
 * GitHub 图床适配器
 * 将图片存储到 GitHub 仓库
 */

const crypto = require('crypto');
const ImageBedAdapter = require('./ImageBedAdapter');

class GitHubAdapter extends ImageBedAdapter {
  constructor(config = {}) {
    super(config);
    this.type = 'github';
    this.name = config.name || 'GitHub';
    this.owner = config.owner;
    // 支持多仓库轮询：repos 数组优先，否则降级到单 repo
    this.repos = Array.isArray(config.repos) && config.repos.length > 0
      ? config.repos.filter(r => r && r.trim())
      : (config.repo ? [config.repo] : []);
    this.repo = this.repos[0] || '';
    this.branch = config.branch || 'main';
    this.token = config.token;
    // CDN 域名配置，默认使用 jsdelivr 加速
    this.cdnDomain = config.cdnDomain || 'jsdelivr';
    // 轮询索引（内存中，重启后从0开始）
    this._repoIndex = 0;
    // 确保 path 不以 / 开头，且以 / 结尾
    let path = config.path || 'images/';
    if (path.startsWith('/')) path = path.slice(1);
    if (!path || path === '/') path = 'images/';
    if (!path.endsWith('/')) path += '/';
    this.path = path;
    this.useDatePath = config.useDatePath !== false;
  }

  /**
   * 获取当前轮询仓库并推进索引
   */
  _getNextRepo() {
    if (this.repos.length === 0) return this.repo;
    if (this.repos.length === 1) return this.repos[0];
    const repo = this.repos[this._repoIndex % this.repos.length];
    this._repoIndex = (this._repoIndex + 1) % this.repos.length;
    return repo;
  }

  /**
   * 验证配置
   */
  async validateConfig(config) {
    if (!config.owner || !config.repo || !config.token) {
      return { valid: false, error: 'Missing required fields: owner, repo, token' };
    }
    return { valid: true };
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      const response = await this.makeRequest('GET', `/repos/${this.owner}/${this.repo}`);
      if (response.ok) {
        return { success: true };
      } else {
        return { success: false, error: `GitHub API error: ${response.status}` };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * 发送 HTTP 请求到 GitHub API
   */
  async makeRequest(method, path, body = null) {
    const url = `https://api.github.com${path}`;
    const options = {
      method,
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'MdEditor-ImageBed',
      },
    };

    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
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
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  buildUploadPrefix() {
    const basePath = String(this.path || '').replace(/^\/+/, '').replace(/\/+$/, '');
    if (!this.useDatePath) return basePath;
    return basePath ? `${basePath}/${this.getDatePath()}` : this.getDatePath();
  }

  parseUrlInfo(url) {
    let m = url.match(/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^@]+)@([^/]+)\/(.+)$/);
    if (m) return { owner: m[1], repo: m[2], branch: m[3], filePath: m[4] };

    m = url.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
    if (m) return { owner: m[1], repo: m[2], branch: m[3], filePath: m[4] };

    m = url.match(/ghproxy\.com\/https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
    if (m) return { owner: m[1], repo: m[2], branch: m[3], filePath: m[4] };

    m = url.match(/raw\.fastgit\.org\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
    if (m) return { owner: m[1], repo: m[2], branch: m[3], filePath: m[4] };

    return null;
  }

  async deleteFileByPath(owner, repo, branch, filePath) {
    const getResponse = await this.makeRequest(
      'GET',
      `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`
    );

    if (!getResponse.ok || !getResponse?.data?.sha) {
      return { success: false, error: 'File not found' };
    }

    const deleteResponse = await this.makeRequest(
      'DELETE',
      `/repos/${owner}/${repo}/contents/${filePath}`,
      {
        message: `Delete image: ${filePath}`,
        sha: getResponse.data.sha,
        branch,
      }
    );

    return deleteResponse.ok
      ? { success: true }
      : { success: false, error: deleteResponse?.data?.message || 'Delete failed' };
  }

  async listDir(owner, repo, branch, dirPath) {
    const response = await this.makeRequest('GET', `/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`);
    if (!response.ok || !Array.isArray(response.data)) return null;
    return response.data;
  }

  async cleanupEmptyDirs(owner, repo, branch, filePath) {
    const segments = String(filePath || '').split('/').filter(Boolean);
    if (segments.length <= 1) return;

    const baseRoot = String(this.path || '').replace(/^\/+/, '').replace(/\/+$/, '');
    for (let i = segments.length - 1; i > 0; i -= 1) {
      const dirPath = segments.slice(0, i).join('/');
      if (baseRoot && !dirPath.startsWith(baseRoot)) break;

      const entries = await this.listDir(owner, repo, branch, dirPath);
      if (!entries) break;

      const markers = new Set(['.gitkeep', '.keep', '.placeholder']);
      const nonMarkerEntries = entries.filter((entry) => !markers.has(entry.name));
      if (nonMarkerEntries.length > 0) break;

      let removedAnyMarker = false;
      for (const entry of entries) {
        if (!markers.has(entry.name) || entry.type !== 'file') continue;
        const markerPath = `${dirPath}/${entry.name}`;
        const r = await this.deleteFileByPath(owner, repo, branch, markerPath);
        if (r.success) removedAnyMarker = true;
      }

      // 真空目录（无任何项）可以继续向上；仅标记文件目录删除标记后再继续
      if (entries.length > 0 && !removedAnyMarker) break;
    }
  }

  /**
   * 上传图片
   */
  async upload(fileBuffer, options = {}) {
    try {
      const filename = this.generateFilename(options.filename || 'image.jpg');
      
      // 轮询获取当前仓库
      const repo = this._getNextRepo();
      
      const uploadPrefix = this.buildUploadPrefix();
      const filePath = uploadPrefix ? `${uploadPrefix}/${filename}` : filename;
      console.log('[GitHubAdapter] 上传配置 - owner:', this.owner, 'repo:', repo, 'path:', this.path);
      console.log('[GitHubAdapter] 轮询仓库列表:', this.repos, '当前索引:', this._repoIndex);
      console.log('[GitHubAdapter] 生成的文件名:', filename);
      console.log('[GitHubAdapter] 最终路径:', filePath);
      const content = fileBuffer.toString('base64');

      const response = await this.makeRequest(
        'PUT',
        `/repos/${this.owner}/${repo}/contents/${filePath}`,
        {
          message: `Upload image: ${filename}`,
          content,
          branch: this.branch,
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.data.message}`);
      }

      // 根据配置的 CDN 域名构建 URL
      let url;
      switch (this.cdnDomain) {
        case 'jsdelivr':
          url = `https://cdn.jsdelivr.net/gh/${this.owner}/${repo}@${this.branch}/${filePath}`;
          break;
        case 'ghproxy':
          url = `https://ghproxy.com/https://raw.githubusercontent.com/${this.owner}/${repo}/${this.branch}/${filePath}`;
          break;
        case 'fastgit':
          url = `https://raw.fastgit.org/${this.owner}/${repo}/${this.branch}/${filePath}`;
          break;
        case 'raw':
        default:
          url = `https://raw.githubusercontent.com/${this.owner}/${repo}/${this.branch}/${filePath}`;
          break;
      }

      return {
        url,
        filename,
        size: fileBuffer.length,
        originalName: options.filename,
        mimeType: options.mimeType || 'image/jpeg',
      };
    } catch (err) {
      throw new Error(`Failed to upload to GitHub: ${err.message}`);
    }
  }

  /**
   * 删除图片
   */
  async delete(url) {
    try {
      const info = this.parseUrlInfo(url);
      if (!info?.filePath) {
        return { success: false, error: 'Cannot parse GitHub URL: ' + url };
      }

      const { owner, repo, branch, filePath } = info;
      const deleteResult = await this.deleteFileByPath(owner, repo, branch, filePath);
      if (!deleteResult.success) {
        return deleteResult;
      }

      await this.cleanupEmptyDirs(owner, repo, branch, filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * 获取图片列表（合并所有仓库）
   */
  async list(options = {}) {
    try {
      const allImages = [];

      for (const repo of this.repos) {
        try {
          // 递归获取 path 下所有图片（含子目录）
          const images = await this._listDir(repo, this.path);
          allImages.push(...images);
        } catch (err) {
          console.warn(`[GitHubAdapter] Failed to list repo ${repo}:`, err.message);
        }
      }

      // 按时间倒序
      allImages.sort((a, b) => b.createdAt - a.createdAt);

      return { images: allImages, total: allImages.length, hasMore: false };
    } catch (err) {
      return { images: [], total: 0, hasMore: false, error: err.message };
    }
  }

  parseDateFromPath(filePath) {
    if (!filePath) return 0;
    const match = filePath.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
    if (!match) return 0;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!year || !month || !day) return 0;
    return new Date(year, month - 1, day).getTime();
  }

  /**
   * 递归列出目录下所有图片
   */
  async _listDir(repo, dirPath) {
    const response = await this.makeRequest(
      'GET',
      `/repos/${this.owner}/${repo}/contents/${dirPath}?ref=${this.branch}`
    );

    if (!response.ok || !Array.isArray(response.data)) return [];

    const images = [];
    for (const item of response.data) {
      if (item.type === 'file' && /\.(jpg|jpeg|png|gif|webp)$/i.test(item.name)) {
        // 构建 CDN URL
        let url;
        const filePath = item.path;
        switch (this.cdnDomain) {
          case 'jsdelivr':
            url = `https://cdn.jsdelivr.net/gh/${this.owner}/${repo}@${this.branch}/${filePath}`;
            break;
          case 'ghproxy':
            url = `https://ghproxy.com/https://raw.githubusercontent.com/${this.owner}/${repo}/${this.branch}/${filePath}`;
            break;
          case 'fastgit':
            url = `https://raw.fastgit.org/${this.owner}/${repo}/${this.branch}/${filePath}`;
            break;
          case 'raw':
          default:
            url = `https://raw.githubusercontent.com/${this.owner}/${repo}/${this.branch}/${filePath}`;
            break;
        }
        images.push({
          filename: item.name,
          url,
          rawUrl: item.download_url,
          githubPath: filePath,
          repo,
          size: item.size,
          mimeType: 'image/jpeg',
          createdAt: this.parseDateFromPath(filePath),
        });
      } else if (item.type === 'dir') {
        const subImages = await this._listDir(repo, item.path);
        images.push(...subImages);
      }
    }
    return images;
  }

  /**
   * 获取配置信息
   */
  getConfig() {
    return {
      type: this.type,
      name: this.name,
      owner: this.owner,
      repo: this.repo,
      branch: this.branch,
      path: this.path,
      useDatePath: this.useDatePath,
    };
  }
}

module.exports = GitHubAdapter;
