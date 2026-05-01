#!/usr/bin/env node

/**
 * App.Native.MdEditor 后端服务（CommonJS 版本）
 * - 提供健康检查接口
 * - 文件读写 API
 * - 静态文件服务（前端构建产物）
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let pdfParse = null;
try {
  pdfParse = require('pdf-parse');
} catch (_) {}
const historyManager = require('./historyManager');
const imageConverter = require('./imageConverter');
const { getDb } = require('./db');
const { ImageBedManager } = require('./imagebed');
const { handleImagebedApi } = require('./imagebedApi');
const { extractOfficePreview } = require('./officeHandler');
const { handleAuthRoutes } = require('./authRoutes');
const { requireAuth, optionalAuth } = require('./authMiddleware');

const PORT = process.env.PORT || process.env.TRIM_SERVICE_PORT || 18089;

// 模型拉取过滤：仅保留对话 + 图片模型，排除音频/ASR/embedding/TTS 等
const IMAGE_MODEL_PATTERNS = [/flux/i, /kolors/i, /dall-e/i, /wanx/i, /cogview/i, /black-forest/i, /schnell/i, /qwen-image/i, /stable-diffusion/i, /seedream/i, /flux\.1/i, /flux-1/i, /image-edit/i, /wan2\.6|wan2\.5|wan2\.2|z-image/i];
const EXCLUDED_MODEL_PATTERNS = [/audio/i, /-asr$/i, /embedding/i, /embed/i, /whisper/i, /tts/i, /speech/i, /moderation/i, /transcri/i];
function isImageModel(id) { return IMAGE_MODEL_PATTERNS.some((p) => p.test(id)); }
function isExcludedModel(id) { return EXCLUDED_MODEL_PATTERNS.some((p) => p.test(id)); }
function isChatOrImageModel(id) { return isImageModel(id) || !isExcludedModel(id); }

// AES-GCM 加密密钥：优先使用环境变量 AI_CONFIG_ENCRYPTION_KEY（32 字节 hex 或 44 字节 base64），否则使用固定盐派生（仅适合单机）
const AI_CONFIG_ENC_KEY_LEN = 32;
function getAiConfigEncryptionKey() {
  const envKey = process.env.AI_CONFIG_ENCRYPTION_KEY;
  if (envKey && typeof envKey === 'string') {
    const buf = Buffer.from(envKey, 'hex');
    if (buf.length === AI_CONFIG_ENC_KEY_LEN) return buf;
    const b64 = Buffer.from(envKey, 'base64');
    if (b64.length === AI_CONFIG_ENC_KEY_LEN) return b64;
  }
  return crypto.scryptSync('md-editor-ai-config-default-salt', 'salt', AI_CONFIG_ENC_KEY_LEN);
}

const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const ENC_PREFIX = 'aes-gcm';

function encryptAesGcm(plaintext) {
  if (typeof plaintext !== 'string') return null;
  const key = getAiConfigEncryptionKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LEN });
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    __enc: ENC_PREFIX,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  };
}

function decryptAesGcm(payload) {
  if (!payload || payload.__enc !== ENC_PREFIX || !payload.iv || !payload.tag || !payload.data) return null;
  try {
    const key = getAiConfigEncryptionKey();
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const data = Buffer.from(payload.data, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LEN });
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final('utf8');
  } catch (e) {
    return null;
  }
}

function isEncryptedApiKey(v) {
  return v && typeof v === 'object' && v.__enc === ENC_PREFIX;
}
const STATIC_DIR = path.join(__dirname, '../ui/frontend/dist');

// 共享路径解析：fnOS 用 TRIM_APPNAME 推导 shares，开发环境用相对路径
const SHARES_BASE = process.env.TRIM_APPNAME
  ? path.join('/var/apps', process.env.TRIM_APPNAME, 'shares')
  : path.join(__dirname, '../shares');

function getSharePathsFromEnv() {
  const out = [];
  const add = (raw) => {
    if (!raw) return;
    raw.split(':').forEach(p => {
      const t = (p || '').trim();
      if (t && !out.includes(t)) out.push(t.replace(/\/+$/, ''));
    });
  };
  add(process.env.TRIM_DATA_ACCESSIBLE_PATHS);
  add(process.env.TRIM_DATA_SHARE_PATHS);
  return out;
}

function getSharePath(shareName) {
  const all = getSharePathsFromEnv();
  const found = all.find(p => p.endsWith('/' + shareName) || p.includes('/' + shareName + '/'));
  if (found) return found;
  return path.join(SHARES_BASE, shareName);
}

const FONT_CACHE_DIR = process.env.TRIM_PKGVAR
  ? path.join(process.env.TRIM_PKGVAR, 'font-cache')
  : path.join(__dirname, '../var', 'font-cache');
const LEGACY_FONT_CACHE_DIR = path.join(SHARES_BASE, 'mdeditor', 'font-cache');
const FONT_CACHE_SETTING_KEY = 'fontLocalCache';

const FONT_SOURCE_MAP = {
  'JetBrains Mono': {
    type: 'file',
    urls: ['https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2'],
    loadedFamily: 'JetBrains Mono',
  },
  'Fira Code': {
    type: 'file',
    urls: ['https://cdn.jsdelivr.net/npm/@fontsource/fira-code/files/fira-code-latin-400-normal.woff2'],
    loadedFamily: 'Fira Code',
  },
  'Source Code Pro': {
    type: 'file',
    urls: ['https://cdn.jsdelivr.net/npm/@fontsource/source-code-pro/files/source-code-pro-latin-400-normal.woff2'],
    loadedFamily: 'Source Code Pro',
  },
  'IBM Plex Mono': {
    type: 'file',
    urls: ['https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'],
    loadedFamily: 'IBM Plex Mono',
  },
  'Cascadia Code': {
    type: 'file',
    urls: ['https://cdn.jsdelivr.net/npm/@fontsource/cascadia-code/files/cascadia-code-latin-400-normal.woff2'],
    loadedFamily: 'Cascadia Code',
  },
  '楷体': {
    type: 'css',
    urls: [
      'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css',
      'https://unpkg.com/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css',
    ],
    loadedFamily: 'LXGW WenKai',
  },
  'KaiTi': {
    type: 'css',
    urls: [
      'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css',
      'https://unpkg.com/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css',
    ],
    loadedFamily: 'LXGW WenKai',
  },
  '霞鹜文楷': {
    type: 'css',
    urls: [
      'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css',
      'https://unpkg.com/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css',
    ],
    loadedFamily: 'LXGW WenKai',
  },
  '思源黑体': {
    type: 'css',
    urls: [
      'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400&display=swap',
      'https://fonts.loli.net/css2?family=Noto+Sans+SC:wght@400&display=swap',
    ],
    loadedFamily: 'Noto Sans SC',
  },
  '思源宋体': {
    type: 'css',
    urls: [
      'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400&display=swap',
      'https://fonts.loli.net/css2?family=Noto+Serif+SC:wght@400&display=swap',
    ],
    loadedFamily: 'Noto Serif SC',
  },
  'Noto Serif SC': {
    type: 'css',
    urls: [
      'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400&display=swap',
      'https://fonts.loli.net/css2?family=Noto+Serif+SC:wght@400&display=swap',
    ],
    loadedFamily: 'Noto Serif SC',
  },
  '阿里巴巴普惠体': {
    type: 'css',
    urls: [
      'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap',
      'https://fonts.loli.net/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap',
    ],
    loadedFamily: 'Noto Sans SC',
  },
  'HarmonyOS Sans SC': {
    type: 'css',
    urls: [
      'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap',
      'https://fonts.loli.net/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap',
    ],
    loadedFamily: 'Noto Sans SC',
  },
  'Ma Shan Zheng': {
    type: 'css',
    urls: [
      'https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap',
      'https://fonts.loli.net/css2?family=Ma+Shan+Zheng&display=swap',
    ],
    loadedFamily: 'Ma Shan Zheng',
  },
};

function ensureFontCacheDir() {
  if (!fs.existsSync(FONT_CACHE_DIR)) fs.mkdirSync(FONT_CACHE_DIR, { recursive: true });
}

function moveLegacyFontCacheIfNeeded() {
  try {
    if (!fs.existsSync(LEGACY_FONT_CACHE_DIR) || !fs.statSync(LEGACY_FONT_CACHE_DIR).isDirectory()) return;
    ensureFontCacheDir();
    const entries = fs.readdirSync(LEGACY_FONT_CACHE_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const src = path.join(LEGACY_FONT_CACHE_DIR, entry.name);
      const dest = path.join(FONT_CACHE_DIR, entry.name);
      if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    }
  } catch (e) {
    console.warn('[font-cache] migrate legacy cache skipped:', e.message);
  }
}

function toSafeSlug(input) {
  return String(input || '').replace(/\s+/g, '-').replace(/[^\w\-\u4e00-\u9fa5]/g, '').toLowerCase() || 'font';
}

function readFontCacheSetting() {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(FONT_CACHE_SETTING_KEY);
  if (!row?.value) return {};
  try {
    const parsed = JSON.parse(row.value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeFontCacheSetting(next) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  stmt.run({ key: FONT_CACHE_SETTING_KEY, value: JSON.stringify(next || {}) });
}

function clearFontCacheByFamily(family) {
  const normalized = String(family || '').trim();
  if (!normalized) {
    return { ok: false, code: 'INVALID_FAMILY', message: '字体名称不能为空' };
  }

  ensureFontCacheDir();
  const cacheMap = readFontCacheSetting();
  const entry = cacheMap[normalized] || {};
  const slug = toSafeSlug(normalized);

  const candidates = new Set();
  [
    entry.fileName,
    entry.cssFileName,
  ].forEach((name) => {
    if (name && typeof name === 'string') candidates.add(name);
  });

  try {
    const allFiles = fs.readdirSync(FONT_CACHE_DIR, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name);

    allFiles.forEach((name) => {
      if (name === `${slug}.css` || name.startsWith(`${slug}-`)) {
        candidates.add(name);
      }
    });

    candidates.forEach((name) => {
      if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) return;
      const target = path.join(FONT_CACHE_DIR, name);
      if (fs.existsSync(target) && fs.statSync(target).isFile()) {
        fs.unlinkSync(target);
      }
    });

    if (cacheMap[normalized]) {
      delete cacheMap[normalized];
      writeFontCacheSetting(cacheMap);
    }

    return { ok: true, removed: Array.from(candidates) };
  } catch (e) {
    return { ok: false, code: 'FONT_CACHE_CLEAR_ERROR', message: e.message };
  }
}

async function fetchFirstSuccessful(urls, asText = false) {
  let lastErr = null;
  for (const u of urls) {
    try {
      const res = await fetch(u);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = asText ? await res.text() : Buffer.from(await res.arrayBuffer());
      return { ok: true, url: u, payload };
    } catch (e) {
      lastErr = e;
    }
  }
  return { ok: false, error: lastErr };
}

// 授权目录解析：Folder 为文件树根，mdeditor 根目录支持在空白处新建文件夹
function getAllowedRoots() {
  const roots = [];
  const accessible = process.env.TRIM_DATA_ACCESSIBLE_PATHS || '';
  if (accessible) {
    accessible.split(':').forEach(p => {
      if (p) roots.push(p.trim());
    });
  }
  const sharesFolder = path.join(SHARES_BASE, 'Folder');
  if (fs.existsSync(sharesFolder) && !roots.includes(sharesFolder)) {
    roots.push(sharesFolder);
  }
  const mdeditorRoot = path.join(SHARES_BASE, 'mdeditor');
  if (fs.existsSync(mdeditorRoot) && !roots.includes(mdeditorRoot)) {
    roots.push(mdeditorRoot);
  }
  return roots;
}

function isUnderRoot(target, root) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function resolveSafePathBase(requestedPath) {
  if (!requestedPath || typeof requestedPath !== 'string') {
    throw new Error('INVALID_PATH');
  }
  if (!requestedPath.startsWith('/')) {
    throw new Error('PATH_MUST_BE_ABSOLUTE');
  }
  const normalized = path.normalize(requestedPath);
  const roots = getAllowedRoots();
  if (!roots.length) {
    throw new Error('NO_ALLOWED_ROOTS');
  }
  for (const root of roots) {
    if (isUnderRoot(normalized, root)) {
      return normalized;
    }
  }
  throw new Error('PATH_NOT_ALLOWED');
}

function resolveSafePathForRequest(req, requestedPath) {
  const safePath = resolveSafePathBase(requestedPath);
  const currentUser = req.currentUser || optionalAuth(req);
  if (!currentUser || currentUser.username !== 'admin' || currentUser.role !== 'admin') {
    throw new Error('UNAUTHORIZED');
  }

  return safePath;
}

// CORS 允许头（飞牛 NAS 等环境下应用可能被嵌入或反向代理，需支持跨域）
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req, res, maxBytes = 1024 * 64) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > maxBytes) {
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
        reject(new Error('PAYLOAD_TOO_LARGE'));
      }
    });

    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
        reject(new Error('INVALID_JSON'));
      }
    });

    req.on('error', reject);
  });
}

// 初始化图床管理器
// 说明：编辑图床时前端会请求 /api/imagebed/:id?secrets=true 以回填密钥字段，
// 这里显式允许读取敏感配置，并复用现有 AES-GCM 密钥能力保证落库加密。
const imagebedManager = new ImageBedManager(
  getDb(),
  getAiConfigEncryptionKey(),
  () => true
);

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  // multipart 表单解析函数
  async function readMultipartBodyLocal(req, boundary) {
    return new Promise((resolve, reject) => {
      const busboy = require('busboy');
      const bb = busboy({ 
        headers: { 
          'content-type': `multipart/form-data; boundary=${boundary}` 
        } 
      });
      const files = [];
      const fields = {};
      
      bb.on('file', (name, file, info) => {
        const chunks = [];
        file.on('data', chunk => chunks.push(chunk));
        file.on('end', () => {
          files.push({ 
            name, 
            buffer: Buffer.concat(chunks), 
            info 
          });
        });
      });
      
      bb.on('field', (name, val) => { 
        fields[name] = val; 
      });
      
      bb.on('finish', () => resolve({ files, fields }));
      bb.on('error', reject);
      
      req.pipe(bb);
    });
  }

  // CORS 预检：OPTIONS 请求直接返回 204
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // 健康检查
  if (parsed.pathname === '/health') {
    sendJson(res, 200, { ok: true, app: 'App.Native.MdEditor' });
    return;
  }

  if (parsed.pathname === '/api/service-port' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, port: String(PORT) });
    return;
  }

  if (handleAuthRoutes(req, res, parsed, sendJson, readJsonBody)) {
    return;
  }

  if (parsed.pathname.startsWith('/api/')) {
    const authWhitelist = [
      '/api/auth/login',
      '/api/auth/logout',
      '/api/auth/me',
      '/api/service-port',
    ];
    const skipAuth = authWhitelist.includes(parsed.pathname);
    if (!skipAuth) {
      if (!requireAuth(req, res, sendJson)) {
        return;
      }
    } else {
      optionalAuth(req);
    }
  }

  // 图床 API 路由
  if (parsed.pathname.startsWith('/api/imagebed')) {
    console.log('[DEBUG] Imagebed API request:', parsed.pathname, req.method);
    try {
      // 读取请求体（但 multipart 请求除外，因为需要流式处理）
      let body = '';
      const contentType = req.headers['content-type'] || '';
      const isMultipart = contentType.includes('multipart/form-data');
      
      if ((req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') && !isMultipart) {
        body = await new Promise((resolve, reject) => {
          let data = '';
          req.on('data', chunk => data += chunk);
          req.on('end', () => resolve(data));
          req.on('error', reject);
        });
        try {
          body = JSON.parse(body || '{}');
        } catch {
          body = {};
        }
      }
      
      // 调用图床 API 处理
      console.log('[DEBUG] Calling handleImagebedApi with imagebedManager:', !!imagebedManager);
      const handled = handleImagebedApi(req, res, parsed.pathname, parsed.query, body, imagebedManager, sendJson);
      console.log('[DEBUG] handleImagebedApi returned:', handled);
      if (handled) return;
    } catch (err) {
      console.error('[Imagebed API Error]', err);
      sendJson(res, 500, { ok: false, error: err.message });
      return;
    }
  }

  // 获取系统主题：GET /api/system/theme
  if (parsed.pathname === '/api/system/theme' && req.method === 'GET') {
    // 飞牛NAS的主题设置存储在浏览器的 localStorage 中
    // 我们需要读取 Chrome/Chromium 的 localStorage 数据库
    // 路径通常是: ~/.config/chromium/Default/Local Storage/leveldb/
    // 或: ~/.config/google-chrome/Default/Local Storage/leveldb/
    
    const { exec } = require('child_process');
    
    // 尝试通过命令行工具读取 localStorage
    // 使用 sqlite3 或直接读取 LevelDB
    const command = `
      # 尝试从多个可能的位置读取
      for db in ~/.config/chromium/Default/Local\ Storage/leveldb/*.ldb ~/.config/google-chrome/Default/Local\ Storage/leveldb/*.ldb; do
        if [ -f "$db" ]; then
          strings "$db" | grep -o 'fnos-theme-mode.*[0-9]\\+' | head -1
        fi
      done
    `;
    
    exec(command, (error, stdout, stderr) => {
      let themeMode = '10'; // 默认浅色
      
      if (!error && stdout) {
        // 从输出中提取主题模式值
        const match = stdout.match(/fnos-theme-mode.*?(\d+)/);
        if (match && match[1]) {
          themeMode = match[1];
        }
      }
      
      sendJson(res, 200, { 
        ok: true, 
        themeMode: themeMode,
        source: stdout ? 'localStorage' : 'default'
      });
    });
    return;
  }

  // 应用设置：GET /api/settings（返回时对 aiConfig.apiKey 解密）
  if (parsed.pathname === '/api/settings' && req.method === 'GET') {
    try {
      const db = getDb();
      const rows = db.prepare('SELECT key, value FROM settings').all();
      const settings = {};
      for (const row of rows) {
        try {
          settings[row.key] = JSON.parse(row.value);
        } catch {
          settings[row.key] = row.value;
        }
      }
      if (settings.aiConfig && typeof settings.aiConfig === 'object' && settings.aiConfig.apiKey !== undefined) {
        const ak = settings.aiConfig.apiKey;
        if (isEncryptedApiKey(ak)) {
          const plain = decryptAesGcm(ak);
          settings.aiConfig = { ...settings.aiConfig, apiKey: plain != null ? plain : '' };
        }
      }
      if (settings.aiImageConfig && typeof settings.aiImageConfig === 'object' && settings.aiImageConfig.apiKey !== undefined) {
        const ak = settings.aiImageConfig.apiKey;
        if (isEncryptedApiKey(ak)) {
          const plain = decryptAesGcm(ak);
          settings.aiImageConfig = { ...settings.aiImageConfig, apiKey: plain != null ? plain : '' };
        }
      }
      sendJson(res, 200, { ok: true, settings });
    } catch (e) {
      console.error('[api/settings][GET] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '读取设置失败' });
    }
    return;
  }

  // 应用设置：POST /api/settings  { key, value }
  if (parsed.pathname === '/api/settings' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 1024 * 64) {
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
      }
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
        return;
      }
      const key = body && body.key;
      let value = body && Object.prototype.hasOwnProperty.call(body, 'value') ? body.value : undefined;
      if (!key) {
        sendJson(res, 400, { ok: false, code: 'MISSING_KEY', message: '缺少 key 字段' });
        return;
      }
      if (key === 'aiConfig' && value && typeof value === 'object' && typeof value.apiKey === 'string' && value.apiKey.length > 0) {
        if (!isEncryptedApiKey(value.apiKey)) {
          const encrypted = encryptAesGcm(value.apiKey);
          if (encrypted) value = { ...value, apiKey: encrypted };
        }
      }
      if (key === 'aiImageConfig' && value && typeof value === 'object' && typeof value.apiKey === 'string' && value.apiKey.length > 0) {
        if (!isEncryptedApiKey(value.apiKey)) {
          const encrypted = encryptAesGcm(value.apiKey);
          if (encrypted) value = { ...value, apiKey: encrypted };
        }
      }
      try {
        const db = getDb();
        const stmt = db.prepare(`
          INSERT INTO settings (key, value)
          VALUES (@key, @value)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `);
        const stored = JSON.stringify(value ?? null);
        stmt.run({ key, value: stored });
        sendJson(res, 200, { ok: true });
      } catch (e) {
        console.error('[api/settings][POST] error:', e);
        sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '保存设置失败' });
      }
    });
    return;
  }

  // 字体本地缓存状态：GET /api/font-cache/status
  if (parsed.pathname === '/api/font-cache/status' && req.method === 'GET') {
    try {
      moveLegacyFontCacheIfNeeded();
      ensureFontCacheDir();
      const cacheMap = readFontCacheSetting();
      sendJson(res, 200, { ok: true, cache: cacheMap, basePath: FONT_CACHE_DIR });
    } catch (e) {
      console.error('[api/font-cache/status][GET] error:', e);
      sendJson(res, 500, { ok: false, code: 'FONT_CACHE_STATUS_ERROR', message: '读取字体缓存状态失败' });
    }
    return;
  }

  // 清理指定字体缓存：POST /api/font-cache/clear  { family }
  if (parsed.pathname === '/api/font-cache/clear' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, res, 1024 * 16);
      const family = (body?.family || '').trim();
      const result = clearFontCacheByFamily(family);
      if (!result.ok) {
        sendJson(res, 400, { ok: false, code: result.code, message: result.message || '清理字体缓存失败' });
        return;
      }
      sendJson(res, 200, { ok: true, family, removed: result.removed || [] });
    } catch (e) {
      if (e.message === 'PAYLOAD_TOO_LARGE' || e.message === 'INVALID_JSON') return;
      console.error('[api/font-cache/clear][POST] error:', e);
      sendJson(res, 500, { ok: false, code: 'FONT_CACHE_CLEAR_ERROR', message: '清理字体缓存失败' });
    }
    return;
  }

  // 下载字体到本地：POST /api/font-cache/download  { family }
  if (parsed.pathname === '/api/font-cache/download' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, res, 1024 * 16);
      const family = (body?.family || '').trim();
      if (!family || !FONT_SOURCE_MAP[family]) {
        sendJson(res, 400, { ok: false, code: 'INVALID_FAMILY', message: '不支持的字体' });
        return;
      }

      ensureFontCacheDir();
      const source = FONT_SOURCE_MAP[family];
      const slug = toSafeSlug(family);
      const cacheMap = readFontCacheSetting();

      if (source.type === 'file') {
        const result = await fetchFirstSuccessful(source.urls || [], false);
        if (!result.ok) {
          sendJson(res, 500, { ok: false, code: 'FONT_DOWNLOAD_FAILED', message: '字体下载失败' });
          return;
        }

        const fileName = `${slug}.woff2`;
        const filePath = path.join(FONT_CACHE_DIR, fileName);
        fs.writeFileSync(filePath, result.payload);

        cacheMap[family] = {
          status: 'cached',
          type: 'file',
          loadedFamily: source.loadedFamily || family,
          localUrl: `/font-cache/${encodeURIComponent(fileName)}`,
          fileName,
          updatedAt: Date.now(),
        };
        writeFontCacheSetting(cacheMap);
        sendJson(res, 200, { ok: true, family, entry: cacheMap[family] });
        return;
      }

      if (source.type === 'css') {
        const cssRes = await fetchFirstSuccessful(source.urls || [], true);
        if (!cssRes.ok) {
          sendJson(res, 500, { ok: false, code: 'FONT_DOWNLOAD_FAILED', message: '字体样式下载失败' });
          return;
        }
        let cssText = String(cssRes.payload || '');

        const urlRegex = /url\((['"]?)([^)'"\s]+)\1\)/g;
        const matches = [];
        let m;
        while ((m = urlRegex.exec(cssText)) !== null) {
          matches.push(m[2]);
        }

        for (const rawUrl of matches) {
          const absoluteUrl = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, cssRes.url).toString();
          const download = await fetchFirstSuccessful([absoluteUrl], false);
          if (!download.ok) continue;

          let ext = path.extname(new URL(absoluteUrl).pathname) || '.woff2';
          if (!ext || ext.length > 8) ext = '.woff2';
          const fontFileName = `${slug}-${crypto.createHash('md5').update(absoluteUrl).digest('hex').slice(0, 8)}${ext}`;
          const fontFilePath = path.join(FONT_CACHE_DIR, fontFileName);
          fs.writeFileSync(fontFilePath, download.payload);

          cssText = cssText.split(rawUrl).join(`/font-cache/${encodeURIComponent(fontFileName)}`);
        }

        const cssFileName = `${slug}.css`;
        const cssFilePath = path.join(FONT_CACHE_DIR, cssFileName);
        fs.writeFileSync(cssFilePath, cssText, 'utf8');

        cacheMap[family] = {
          status: 'cached',
          type: 'css',
          loadedFamily: source.loadedFamily || family,
          localCssUrl: `/font-cache/${encodeURIComponent(cssFileName)}`,
          cssFileName,
          updatedAt: Date.now(),
        };
        writeFontCacheSetting(cacheMap);
        sendJson(res, 200, { ok: true, family, entry: cacheMap[family] });
        return;
      }

      sendJson(res, 400, { ok: false, code: 'INVALID_SOURCE', message: '字体源配置无效' });
    } catch (e) {
      if (e.message === 'PAYLOAD_TOO_LARGE' || e.message === 'INVALID_JSON') return;
      console.error('[api/font-cache/download][POST] error:', e);
      sendJson(res, 500, { ok: false, code: 'FONT_CACHE_ERROR', message: '字体下载失败' });
    }
    return;
  }

  // 应用编辑状态：GET /api/app-state
  if (parsed.pathname === '/api/app-state' && req.method === 'GET') {
    try {
      const db = getDb();
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('appState');
      let state = {};

      if (row?.value) {
        try {
          state = JSON.parse(row.value);
        } catch {
          state = {};
        }
      }

      sendJson(res, 200, { ok: true, state });
    } catch (e) {
      console.error('[api/app-state][GET] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '读取编辑状态失败' });
    }
    return;
  }

  // AI 会话历史：GET /api/ai/conversations
  if (parsed.pathname === '/api/ai/conversations' && req.method === 'GET') {
    try {
      const db = getDb();
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('aiConversations');
      let conversations = {};
      if (row?.value) {
        try {
          conversations = JSON.parse(row.value);
        } catch {
          conversations = {};
        }
      }
      sendJson(res, 200, { ok: true, conversations });
    } catch (e) {
      console.error('[api/ai/conversations][GET] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '读取会话历史失败' });
    }
    return;
  }

  // AI 会话历史：POST /api/ai/conversations  { conversations }
  if (parsed.pathname === '/api/ai/conversations' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, res, 1024 * 1024 * 2);
      const conversations = body && typeof body.conversations === 'object' ? body.conversations : {};
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO settings (key, value) VALUES (@key, @value)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `);
      stmt.run({ key: 'aiConversations', value: JSON.stringify(conversations) });
      sendJson(res, 200, { ok: true });
    } catch (e) {
      if (e.message === 'PAYLOAD_TOO_LARGE' || e.message === 'INVALID_JSON') return;
      console.error('[api/ai/conversations][POST] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '保存会话历史失败' });
    }
    return;
  }

  // AI 当前会话：GET /api/ai/current-conversation
  if (parsed.pathname === '/api/ai/current-conversation' && req.method === 'GET') {
    try {
      const db = getDb();
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('aiCurrentConversation');
      let messages = [];
      if (row?.value) {
        try {
          messages = JSON.parse(row.value);
        } catch {
          messages = [];
        }
      }
      sendJson(res, 200, { ok: true, messages });
    } catch (e) {
      console.error('[api/ai/current-conversation][GET] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '读取当前会话失败' });
    }
    return;
  }

  // AI 当前会话：POST /api/ai/current-conversation  { messages }
  if (parsed.pathname === '/api/ai/current-conversation' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, res, 1024 * 1024 * 2);
      const messages = Array.isArray(body?.messages) ? body.messages : [];
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO settings (key, value) VALUES (@key, @value)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `);
      stmt.run({ key: 'aiCurrentConversation', value: JSON.stringify(messages) });
      sendJson(res, 200, { ok: true });
    } catch (e) {
      if (e.message === 'PAYLOAD_TOO_LARGE' || e.message === 'INVALID_JSON') return;
      console.error('[api/ai/current-conversation][POST] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '保存当前会话失败' });
    }
    return;
  }

  // AI 模型列表拉取：POST /api/ai/models/fetch（从服务商 API 拉取 /v1/models，OpenAI 兼容格式）
  // 过滤规则：仅保留对话模型 + 图片模型，排除音频/ASR/embedding/TTS 等
  if (parsed.pathname === '/api/ai/models/fetch' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, res, 1024 * 8);
      const { endpoint, apiKey, serviceType, modelListTab } = body || {};
      const ep = (endpoint || '').replace(/\/$/, '');
      if (!ep || !ep.startsWith('http')) {
        sendJson(res, 400, { ok: false, code: 'INVALID_PARAMS', message: '缺少有效的 endpoint' });
        return;
      }
      // 腾讯混元：API 不提供 /v1/models 接口，直接返回静态模型列表（参考 https://cloud.tencent.com/document/product/1729/104753、105968）
      const HUNYUAN_CHAT_MODELS = [
        'hunyuan-2.0-thinking-20251109', 'hunyuan-2.0-instruct-20251111', 'hunyuan-t1-latest',
        'hunyuan-a13b', 'hunyuan-turbos-latest', 'hunyuan-lite', 'hunyuan-translation',
        'hunyuan-translation-lite', 'hunyuan-large-role-latest',
        'hunyuan-vision-1.5-instruct', 'hunyuan-t1-vision-20250916', 'hunyuan-turbos-vision-video',
      ];
      const HUNYUAN_IMAGE_MODELS = ['hunyuan-image', 'hunyuan-image-lite']; // 混元生图、文生图轻量版
      if (serviceType === 'hunyuan') {
        const models = [...HUNYUAN_CHAT_MODELS, ...HUNYUAN_IMAGE_MODELS];
        sendJson(res, 200, { ok: true, models, imageOnly: modelListTab === 'image' });
        return;
      }
      let url = ep.endsWith('/models') ? ep : ep + '/models';
      // 百度千帆：模型列表仅在 qianfan.baidubce.com/v2/models，旧文心 aip 地址无此接口；统一走千帆 API
      if (serviceType === 'wenxin') {
        url = 'https://qianfan.baidubce.com/v2/models';
      }
      // 硅基流动支持 sub_type=text-to-image 仅拉取文生图模型（文档：type/image, sub_type/text-to-image|image-to-image）
      const isSiliconFlow = ep.includes('siliconflow.cn') || ep.includes('siliconflow.com');
      if (isSiliconFlow && modelListTab === 'image') {
        url += (url.includes('?') ? '&' : '?') + 'sub_type=text-to-image';
      }
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
        headers['Authorization'] = 'Bearer ' + apiKey.trim();
      }
      const fetchRes = await fetch(url, { method: 'GET', headers });
      if (!fetchRes.ok) {
        const rawText = await fetchRes.text();
        if (serviceType === 'wenxin') {
          console.warn('[api/ai/models/fetch] 百度千帆拉取失败:', fetchRes.status, url, rawText?.slice(0, 200));
        }
        let errMsg = fetchRes.statusText || '拉取模型列表失败';
        try {
          const errData = rawText ? JSON.parse(rawText) : {};
          errMsg = errData?.error?.message || errData?.message || errMsg;
        } catch (_) {
          if (rawText && rawText.length < 300) errMsg = rawText;
        }
        if (fetchRes.status === 401 || fetchRes.status === 403) {
          errMsg = serviceType === 'wenxin'
            ? '认证失败：请使用千帆控制台创建的 API Key（需配置 V2 应用 appid），格式如 bce-v3/ALTAK-xxx/xxx'
            : '认证失败：请检查 API Key 是否已填写且有效';
        }
        sendJson(res, fetchRes.status, { ok: false, code: 'UPSTREAM_ERROR', message: errMsg });
        return;
      }
      const data = await fetchRes.json().catch(() => ({}));
      const rawList = data?.data || data?.models || data?.result || [];
      const allIds = Array.isArray(rawList)
        ? rawList
          .map((m) => (typeof m === 'string' ? m : m?.id || m?.model || m?.name))
          .filter(Boolean)
        : [];
      const models = allIds.filter(isChatOrImageModel);
      if (serviceType === 'wenxin' && models.length === 0 && allIds.length === 0 && rawList.length > 0) {
        console.warn('[api/ai/models/fetch] 百度千帆返回数据但解析后为空，原始 data 结构:', JSON.stringify(Object.keys(data || {})), 'rawList 长度:', rawList.length);
      }
      sendJson(res, 200, { ok: true, models, imageOnly: isSiliconFlow && modelListTab === 'image' });
    } catch (e) {
      console.error('[api/ai/models/fetch] error:', e.message);
      sendJson(res, 500, {
        ok: false,
        code: 'ERROR',
        message: e.message || '拉取模型列表失败',
      });
    }
    return;
  }

  // AI 对话代理：POST /api/ai/chat/proxy（解决浏览器直连时的 SSL/CORS 问题）
  if (parsed.pathname === '/api/ai/chat/proxy' && req.method === 'POST') {
    let body;
    try {
      body = await readJsonBody(req, res, 1024 * 64);
      const { endpoint, apiKey, model, messages, temperature, maxTokens, stream } = body || {};
      if (!endpoint || !model || !Array.isArray(messages)) {
        sendJson(res, 400, { ok: false, code: 'INVALID_PARAMS', message: '缺少 endpoint、model 或 messages' });
        return;
      }
      const ep = (endpoint || '').replace(/\/$/, '');
      const needsKey = /siliconflow\.(cn|com)|api\.openai\.com|deepseek|volces\.com|qianfan\.baidubce\.com/i.test(ep);
      if (needsKey && (!apiKey || typeof apiKey !== 'string' || !apiKey.trim())) {
        sendJson(res, 400, { ok: false, code: 'MISSING_API_KEY', message: '该服务商需要填写并保存 API Key 后再测试连接' });
        return;
      }
      const url = ep.endsWith('/chat/completions') ? ep : ep + '/chat/completions';
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey && typeof apiKey === 'string' && apiKey.trim()) headers['Authorization'] = 'Bearer ' + apiKey.trim();
      const payload = {
        model,
        messages,
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        max_tokens: typeof maxTokens === 'number' ? maxTokens : 1536,
        stream: !!stream,
      };

      const fetchRes = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!fetchRes.ok) {
        let errMsg = fetchRes.statusText || 'AI 服务请求失败';
        try {
          const rawText = await fetchRes.text();
          try {
            const errData = JSON.parse(rawText);
            // 火山方舟/OpenAI/DeepSeek 等格式: { error: { message, code, type } } 或 { message }
            errMsg = errData?.error?.message || errData?.message || errMsg;
            if (errData?.error?.code) errMsg = `[${errData.error.code}] ${errMsg}`;
          } catch (_) {
            if (rawText && rawText.length < 500) errMsg = rawText;
          }
        } catch (readErr) {
          // 读取错误响应体失败时，按状态码给出明确提示，避免误报为 500
          if (fetchRes.status === 401 || fetchRes.status === 403) {
            errMsg = '认证失败：API key 错误或已失效，请检查或在 DeepSeek 控制台重新创建 API key';
          } else if (fetchRes.status === 402) {
            errMsg = '余额不足，请充值后重试';
          } else if (fetchRes.status === 429) {
            errMsg = '请求过于频繁，请稍后重试';
          }
        }
        // 401/403 且消息过于笼统时，改为认证失败说明
        const isGenericAuth = !errMsg || /^(Unauthorized|Forbidden|Internal Server Error|AI 服务请求失败|认证失败)$/i.test(String(errMsg).trim());
        if ((fetchRes.status === 401 || fetchRes.status === 403) && isGenericAuth) {
          errMsg = '认证失败：请检查该服务商的 API Key 是否已填写、已保存且未过期';
        }
        // 400 + asr：选用了语音/音频模型（ASR），期望音频输入，不支持纯文本（不限 endpoint，含代理/中转）
        if (fetchRes.status === 400 && /asr|dedicated task.*asr/i.test(String(errMsg))) {
          errMsg = '当前模型为语音/音频模型，不支持纯文本输入。请选择文本对话模型（如 qwen-turbo、qwen-plus）进行连通性测试或对话。';
        }
        // 404：上游 API 地址返回未找到，多为 endpoint 配置错误或 model 无效
        if (fetchRes.status === 404) {
          const isVolcArk = /ark\.\w+\.volces\.com/i.test(ep);
          if (isVolcArk) {
            errMsg = '火山方舟返回 404：model 需填写推理接入点 ID（ep-xxxx）或带日期后缀的模型 ID。请在火山方舟控制台创建接入点或从模型广场复制完整 Model ID';
          } else {
            errMsg = '您配置的 API 地址返回 404，请检查 endpoint 是否正确（应为完整地址，如 https://api.openai.com/v1 或 https://dashscope.aliyuncs.com/compatible-mode/v1）';
          }
        }
        console.error('[api/ai/chat/proxy] upstream error:', fetchRes.status, url, errMsg);
        sendJson(res, fetchRes.status, {
          ok: false,
          code: 'UPSTREAM_ERROR',
          message: errMsg,
        });
        return;
      }

      if (payload.stream) {
        res.writeHead(200, {
          'Content-Type': fetchRes.headers.get('content-type') || 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        const { Readable } = require('stream');
        if (fetchRes.body) {
          Readable.fromWeb(fetchRes.body).pipe(res);
        } else {
          res.end();
        }
      } else {
        const data = await fetchRes.json().catch(() => ({}));
        sendJson(res, 200, data);
      }
    } catch (e) {
      const ep = (typeof body?.endpoint === 'string' ? body.endpoint : '').replace(/\/$/, '');
      const detail = e.cause?.message || e.cause?.code || e.message || '';
      // 详细日志便于在 NAS 上排查：查看 TRIM_PKGVAR/md-editor.log 或应用日志
      console.error('[api/ai/chat/proxy] error:', e.message, 'endpoint:', ep || '(none)', 'cause:', detail);
      if (e.stack) console.error('[api/ai/chat/proxy] stack:', e.stack);
      let msg = e.message || 'AI 服务请求失败（网络异常或代理内部错误）';
      if (detail && (String(detail).includes('ENOTFOUND') || String(detail).includes('ECONNREFUSED') || String(detail).includes('ETIMEDOUT') || String(detail).includes('fetch'))) {
        msg = `网络异常：无法连接 AI 服务（${detail}），请检查 NAS 外网或 DNS`;
      }
      sendJson(res, 500, {
        ok: false,
        code: 'ERROR',
        message: msg,
      });
    }
    return;
  }

  // AI 文生图：POST /api/ai/image/generate  { endpoint, apiKey, model, size, prompt, seed?, count?, referenceImages? }
  if (parsed.pathname === '/api/ai/image/generate' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, res, 1024 * 1024 * 6); // 6MB，支持 base64 参考图
      const { endpoint, apiKey, model, size, prompt: promptRaw, seed, count, referenceImages, _debug } = body || {};
      const prompt = typeof promptRaw === 'string' ? promptRaw.trim() : '';
      if (!endpoint || typeof endpoint !== 'string' || !endpoint.trim()) {
        sendJson(res, 400, { ok: false, code: 'INVALID_PARAMS', message: '缺少 API 代理地址，请在配置中填写 endpoint', debug: { reason: 'missing_endpoint' } });
        return;
      }
      if (!prompt) {
        sendJson(res, 400, { ok: false, code: 'INVALID_PARAMS', message: '缺少提示词 prompt' });
        return;
      }
      const ep = (endpoint || '').replace(/\/$/, '');
      const modelStr = (model && typeof model === 'string') ? model : '';
      const isHunyuanModel = /hunyuan-image/i.test(modelStr || '');
      const isHunyuanImage = isHunyuanModel || /hunyuan\.tencentcloudapi\.com/i.test(ep) || (/tencentcloudapi\.com/i.test(ep) && /hunyuan/i.test(ep));
      const isFal = ep.includes('fal.run') || ep.includes('fal.ai');
      const isSiliconFlow = ep.includes('siliconflow.cn') || ep.includes('siliconflow.com');
      const isBailian = /dashscope(-intl|-us)?\.aliyuncs\.com/i.test(ep);
      const useSiliconFlowFormat = isSiliconFlow || /FLUX|Kolors|black-forest|siliconflow/i.test(modelStr);
      const refImg = Array.isArray(referenceImages) && referenceImages.length > 0 ? referenceImages[0] : null;
      const n = Math.min(Math.max(1, parseInt(count, 10) || 1), 8);
      const seedNum = seed != null ? parseInt(seed, 10) : undefined;

      const apiKeyStr = typeof apiKey === 'string' ? apiKey.trim() : '';
      if (isSiliconFlow && !apiKeyStr) {
        sendJson(res, 400, { ok: false, code: 'MISSING_API_KEY', message: '硅基流动需要填写并保存 API Key 后再测试或生成' });
        return;
      }
      if (isBailian && !apiKeyStr) {
        sendJson(res, 400, { ok: false, code: 'MISSING_API_KEY', message: '阿里云百炼需要填写并保存 API Key 后再测试或生成' });
        return;
      }
      if (isHunyuanImage && !apiKeyStr) {
        sendJson(res, 400, { ok: false, code: 'MISSING_API_KEY', message: '腾讯混元图片需填写 SecretId:SecretKey（格式：在 API Key 中填入 密钥ID:密钥Key，从腾讯云控制台-访问管理-API密钥 获取）' });
        return;
      }

      if (isHunyuanImage) {
        const trimmed = (apiKeyStr || '').trim();
        const colonIdx = trimmed.indexOf(':');
        let secretId = '';
        let secretKey = '';
        if (colonIdx >= 0) {
          secretId = trimmed.slice(0, colonIdx).trim();
          secretKey = trimmed.slice(colonIdx + 1).trim();
        }
        if (!secretId || !secretKey) {
          const debugInfo = {
            receivedLength: trimmed.length,
            hasColon: colonIdx >= 0,
            secretIdLength: secretId.length,
            secretKeyLength: secretKey.length,
          };
          sendJson(res, 400, {
            ok: false,
            code: 'INVALID_API_KEY',
            message: '腾讯混元图片 API Key 格式应为 SecretId:SecretKey（中间用英文冒号连接，无空格），请从腾讯云控制台-访问管理-API密钥 获取',
            debug: debugInfo,
          });
          return;
        }
        const resSize = (size || '768x768').replace('x', ':');
        const isLite = /hunyuan-image-lite|lite/i.test(modelStr);
        try {
          const { hunyuan } = require('tencentcloud-sdk-nodejs-hunyuan');
          const HunyuanClient = hunyuan.v20230901.Client;
          const client = new HunyuanClient({
            credential: { secretId, secretKey },
            region: 'ap-guangzhou',
          });
          if (isLite) {
            const testPrompt = (prompt && prompt.trim().length >= 1 ? prompt : '一只橘色的小猫坐在窗台上').slice(0, 256);
            const resp = await client.TextToImageLite({
              Prompt: testPrompt,
              Resolution: resSize,
              RspImgType: 'url',
            });
            const raw = resp?.ResultImage ?? resp?.Response?.ResultImage;
            if (!raw || typeof raw !== 'string') {
              const keys = resp ? Object.keys(resp) : [];
              const errInfo = resp?.Error || resp?.Response?.Error;
              const errMsg = errInfo?.Message || errInfo?.Code;
              const debugInfo = {
                endpoint: ep,
                model: modelStr,
                hasColonInKey: apiKeyStr.includes(':'),
                respKeys: keys,
                hasResultImage: !!resp?.ResultImage,
                hasResponse: !!resp?.Response,
                hasResponseResultImage: !!resp?.Response?.ResultImage,
                resultImageType: typeof resp?.ResultImage,
                error: errMsg,
                requestId: resp?.RequestId,
              };
              const userMsg = errMsg
                ? (errMsg.includes('IllegalDetected') ? '内容可能涉及敏感信息，请更换提示词重试' : errMsg)
                : '未返回图像数据。请确认：1) SecretId:SecretKey 正确 2) 已开通混元生图服务 3) 账户有余额或免费额度';
              sendJson(res, 500, { ok: false, code: 'NO_IMAGE', message: userMsg, debug: debugInfo });
              return;
            }
            const img = raw.startsWith('data:') ? raw : raw;
            sendJson(res, 200, { ok: true, url: img, urls: [img], b64: img.startsWith('data:') });
          } else {
            const submitResp = await client.SubmitHunyuanImageJob({
              Prompt: prompt.slice(0, 1024),
              Resolution: resSize,
              Num: Math.min(Math.max(1, n), 4),
            });
            const jobId = submitResp?.JobId;
            if (!jobId) {
              sendJson(res, 500, { ok: false, code: 'NO_JOB_ID', message: '提交任务失败' });
              return;
            }
            for (let i = 0; i < 60; i++) {
              await new Promise((r) => setTimeout(r, 2000));
              const queryResp = await client.QueryHunyuanImageJob({ JobId: jobId });
              const statusCode = queryResp?.JobStatusCode;
              const imgs = Array.isArray(queryResp?.ResultImage) ? queryResp.ResultImage : [];
              if (statusCode === '5' && imgs.length > 0) {
                const img = imgs[0];
                sendJson(res, 200, { ok: true, url: img, urls: imgs, b64: img.startsWith('data:') });
                return;
              }
              if (statusCode === '4') {
                const errMsg = queryResp?.JobErrorMsg || queryResp?.JobErrorCode || '任务失败';
                sendJson(res, 500, { ok: false, code: 'JOB_FAILED', message: errMsg });
                return;
              }
            }
            sendJson(res, 504, { ok: false, code: 'TIMEOUT', message: '任务超时' });
          }
        } catch (hunyuanErr) {
          const errMsg = hunyuanErr?.message || hunyuanErr?.code || String(hunyuanErr);
          const friendly = /AuthFailure|InvalidParameter|SecretId|SecretKey|credential/i.test(errMsg)
            ? '认证失败：请检查 SecretId:SecretKey 格式是否正确，从腾讯云控制台-访问管理-API密钥 获取'
            : errMsg;
          const debugInfo = { endpoint: ep, model: modelStr, hasColonInKey: apiKeyStr.includes(':'), error: errMsg };
          sendJson(res, 500, { ok: false, code: 'UPSTREAM_ERROR', message: friendly, debug: debugInfo });
        }
        return;
      }

      let url, headers, payload;
      if (isBailian) {
        // 阿里云百炼万相文生图：https://www.alibabacloud.com/help/zh/model-studio/text-to-image-v2-api-reference
        // 端点格式与 compatible-mode 不同，需使用 /api/v1/services/aigc/multimodal-generation/generation
        const base = ep.replace(/\/compatible-mode\/v1\/?$/, '').replace(/\/$/, '');
        url = base + '/api/v1/services/aigc/multimodal-generation/generation';
        headers = { 'Content-Type': 'application/json' };
        if (apiKeyStr) headers['Authorization'] = 'Bearer ' + apiKeyStr;
        const sizeMap = {
          '1024x1024': '1280*1280', '768x768': '1280*1280', '512x512': '1280*1280',
          '1024x768': '1472*1104', '768x1024': '1104*1472',
          '1280x720': '1696*960', '720x1280': '960*1696',
          '1920x1080': '1696*960', '1080x1920': '960*1696',
        };
        const bailianSize = sizeMap[size] || '1280*1280';
        const wanModel = /wan2\.6|wan2\.5|wan2\.2|z-image/i.test(modelStr) ? modelStr : 'wan2.6-t2i';
        payload = {
          model: wanModel,
          input: {
            messages: [{ role: 'user', content: [{ text: prompt }] }],
          },
          parameters: {
            prompt_extend: true,
            watermark: false,
            n: Math.min(n, 4),
            negative_prompt: '',
            size: bailianSize,
          },
        };
        if (typeof seedNum === 'number' && !isNaN(seedNum)) payload.parameters.seed = seedNum;
      } else if (isFal) {
        url = 'https://fal.run/fal-ai/kolors';
        headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = 'Key ' + apiKey;
        const sizeMap = {
          '1024x1024': 'square_hd', '512x512': 'square', '768x768': 'portrait_4_3',
          '1024x768': 'landscape_4_3', '768x1024': 'portrait_4_3',
          '1280x720': 'landscape_16_9', '720x1280': 'portrait_16_9',
          '1920x1080': 'landscape_16_9', '1080x1920': 'portrait_16_9',
        };
        payload = { prompt, image_size: sizeMap[size] || 'square_hd', num_images: Math.min(Math.max(1, n), 8) };
        if (refImg) payload.image = refImg;
        if (typeof seedNum === 'number' && !isNaN(seedNum)) payload.seed = seedNum;
      } else if (useSiliconFlowFormat) {
        // 硅基流动 API：https://docs.siliconflow.cn/cn/api-reference/images/images-generations
        // Qwen-Image-Edit 不支持 image_size；Kolors 支持 batch_size/guidance_scale；响应 images[].url 有效期 1 小时
        url = ep + '/images/generations';
        headers = { 'Content-Type': 'application/json' };
        if (apiKeyStr) headers['Authorization'] = 'Bearer ' + apiKeyStr;
        const isKolors = /Kolors|Kwai-Kolors/i.test(modelStr);
        const isQwenImageEdit = /Qwen-Image-Edit|Qwen\/Qwen-Image/i.test(modelStr);
        const isSchnell = /FLUX\.1-schnell|schnell/i.test(modelStr);
        const refImgs = Array.isArray(referenceImages) ? referenceImages.slice(0, 3) : (refImg ? [refImg] : []);
        payload = {
          model: modelStr || 'black-forest-labs/FLUX.1-schnell',
          prompt,
          num_inference_steps: isQwenImageEdit ? 20 : (isSchnell ? 20 : 28),
        };
        if (!isQwenImageEdit) {
          payload.image_size = size || '1024x1024';
        }
        if (isQwenImageEdit) {
          payload.cfg = 4;
          refImgs.forEach((img, i) => { payload[i === 0 ? 'image' : `image${i + 1}`] = img; });
        } else if (isKolors) {
          payload.batch_size = Math.min(Math.max(1, n), 4);
          payload.num_inference_steps = 20;
          payload.guidance_scale = 7.5;
          if (refImg) payload.image = refImg;
        } else {
          payload.negative_prompt = 'city, street, buildings, urban, neon signs, cars, crowded';
          if (refImg) payload.image = refImg;
        }
        if (typeof seedNum === 'number' && !isNaN(seedNum)) payload.seed = seedNum;
      } else {
        url = ep + '/images/generations';
        headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
        payload = { model: model || 'dall-e-2', prompt, n: Math.min(n, 4), size: size || '1024x1024' };
        if (refImg) payload.image = refImg;
        if (typeof seedNum === 'number' && !isNaN(seedNum)) payload.seed = seedNum;
      }

      const fetchRes = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await fetchRes.json().catch(() => ({}));

      if (!fetchRes.ok) {
        const upstreamMsg = data?.message || data?.detail || data?.error?.message || (typeof data?.data === 'string' ? data.data : null);
        let errMsg = upstreamMsg || fetchRes.statusText || '图像生成失败';
        if (typeof errMsg !== 'string') errMsg = String(errMsg || '');
        errMsg = errMsg.trim();
        if ((fetchRes.status === 401 || fetchRes.status === 403) && (!errMsg || /^(Unauthorized|Forbidden|Illegal operation)$/i.test(errMsg))) {
          errMsg = '认证失败或服务限制：请检查 API Key 是否有效；内置免费代理可能不支持文生图，建议使用硅基流动等需 API Key 的服务';
        } else if (fetchRes.status === 400) {
          const isBuiltin = /proxy-ai\.doocs\.org/i.test(ep);
          if (isBuiltin && (!errMsg || errMsg.length < 20)) {
            errMsg = '内置免费代理可能不支持文生图或已限流，建议切换到硅基流动并填写 API Key 后使用';
          } else if (!errMsg || errMsg.length < 5) {
            errMsg = '请求参数有误：请检查模型名、出图尺寸或提示词是否符合该服务商 API 要求';
          }
        }
        const debugInfo = { endpoint: ep, model: modelStr, size, upstreamStatus: fetchRes.status, upstreamMessage: data?.message, upstreamData: data?.data, upstreamCode: data?.code, upstreamDetail: data?.detail };
        sendJson(res, fetchRes.status, {
          ok: false,
          code: 'UPSTREAM_ERROR',
          message: errMsg || '图像生成失败',
          debug: debugInfo,
        });
        return;
      }

      let imgUrls = [];
      let b64;
      if (Array.isArray(data?.images) && data.images.length > 0) {
        imgUrls = data.images.map((img) => img?.url).filter(Boolean);
      } else if (data?.output?.choices?.[0]?.message?.content) {
        // 百炼万相等：content 为数组时每项含 image，支持多图；单图时 content 可能为对象
        const content = data.output.choices[0].message.content;
        imgUrls = Array.isArray(content)
          ? content.map((c) => c?.image).filter(Boolean)
          : (content?.image ? [content.image] : []);
      } else if (Array.isArray(data?.data) && data.data.length > 0) {
        imgUrls = data.data.map((d) => {
          if (d?.url) return d.url;
          if (d?.b64_json) return 'data:image/png;base64,' + d.b64_json;
          return null;
        }).filter(Boolean);
        b64 = imgUrls.length > 0 && imgUrls[0].startsWith('data:');
      }

      if (imgUrls.length === 0) {
        const tcErr = data?.Response?.Error;
        const tcMsg = tcErr?.Message || tcErr?.Code;
        if (tcErr || /tencentcloud|hunyuan|MissingParameter|Version/i.test(JSON.stringify(data || {}))) {
          const debugInfo = { endpoint: ep, model: modelStr, tcError: tcMsg, rawKeys: data ? Object.keys(data) : [] };
          sendJson(res, 500, {
            ok: false,
            code: 'NO_IMAGE',
            message: tcMsg || '请确认：API 代理地址为 https://hunyuan.tencentcloudapi.com，API Key 为 SecretId:SecretKey 格式，且已选模型 hunyuan-image-lite',
            debug: debugInfo,
          });
          return;
        }
        const debugInfo = { endpoint: ep, model: modelStr, rawKeys: data ? Object.keys(data) : [], rawPreview: data ? JSON.stringify(data).slice(0, 500) : null };
        sendJson(res, 500, { ok: false, code: 'NO_IMAGE', message: '未返回图像数据', debug: debugInfo });
        return;
      }
      const firstUrl = imgUrls[0];
      const result = b64
        ? { ok: true, url: firstUrl, urls: imgUrls, b64: true }
        : { ok: true, url: firstUrl, urls: imgUrls, b64: false };
      sendJson(res, 200, result);
    } catch (e) {
      sendJson(res, 500, { ok: false, code: 'ERROR', message: e.message || '图像生成失败', debug: { error: e.message } });
    }
    return;
  }

  // 文生图历史：GET /api/ai/image/history
  if (parsed.pathname === '/api/ai/image/history' && req.method === 'GET') {
    try {
      const db = getDb();
      const rows = db.prepare('SELECT id, prompt, url, created_at FROM ai_image_history ORDER BY created_at DESC LIMIT 50').all();
      const items = rows.map(r => ({ id: r.id, prompt: r.prompt, url: r.url, time: r.created_at }));
      sendJson(res, 200, { ok: true, items });
    } catch (e) {
      console.error('[api/ai/image/history][GET] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '读取历史失败' });
    }
    return;
  }

  // 文生图历史：POST /api/ai/image/history  { prompt, url }
  if (parsed.pathname === '/api/ai/image/history' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = body ? JSON.parse(body) : {};
        const prompt = data?.prompt;
        const url = data?.url;
        if (!prompt || !url) {
          sendJson(res, 400, { ok: false, message: '缺少 prompt 或 url' });
          return;
        }
        const db = getDb();
        const stmt = db.prepare('INSERT INTO ai_image_history (prompt, url, created_at) VALUES (?, ?, ?)');
        const result = stmt.run(prompt, url, Date.now());
        sendJson(res, 200, { ok: true, id: result.lastInsertRowid });
      } catch (e) {
        console.error('[api/ai/image/history][POST] error:', e);
        sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '保存历史失败' });
      }
    });
    return;
  }

  // 文生图历史：DELETE /api/ai/image/history/:id
  const aiImageHistoryDeleteMatch = parsed.pathname.match(/^\/api\/ai\/image\/history\/(\d+)$/);
  if (aiImageHistoryDeleteMatch && req.method === 'DELETE') {
    const id = parseInt(aiImageHistoryDeleteMatch[1], 10);
    if (!id) {
      sendJson(res, 400, { ok: false, message: '无效的 id' });
      return;
    }
    try {
      const db = getDb();
      db.prepare('DELETE FROM ai_image_history WHERE id = ?').run(id);
      sendJson(res, 200, { ok: true });
    } catch (e) {
      console.error('[api/ai/image/history][DELETE] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '删除失败' });
    }
    return;
  }

  // 应用编辑状态：POST /api/app-state  { state, replace }
  if (parsed.pathname === '/api/app-state' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, res, 1024 * 1024 * 2);
      const nextState = body && typeof body.state === 'object' && body.state !== null ? body.state : null;
      const replace = !!body?.replace;

      if (!nextState) {
        sendJson(res, 400, { ok: false, code: 'MISSING_STATE', message: '缺少 state 字段' });
        return;
      }

      const db = getDb();
      let mergedState = nextState;

      if (!replace) {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('appState');
        let currentState = {};
        if (row?.value) {
          try {
            currentState = JSON.parse(row.value);
          } catch {
            currentState = {};
          }
        }
        mergedState = { ...currentState, ...nextState };
      }

      const stmt = db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (@key, @value)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `);
      stmt.run({ key: 'appState', value: JSON.stringify(mergedState) });

      sendJson(res, 200, { ok: true, state: mergedState });
    } catch (e) {
      if (e.message === 'PAYLOAD_TOO_LARGE' || e.message === 'INVALID_JSON') {
        return;
      }
      console.error('[api/app-state][POST] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '保存编辑状态失败' });
    }
    return;
  }

  // 导出配置预设：GET /api/export-presets
  if (parsed.pathname === '/api/export-presets' && req.method === 'GET') {
    try {
      const db = getDb();
      const rows = db.prepare('SELECT id, name, is_default, config_json, created_at, updated_at, last_used_at FROM export_presets ORDER BY is_default DESC, last_used_at DESC, updated_at DESC').all();
      const presets = rows.map(row => ({
        id: row.id,
        name: row.name,
        isDefault: !!row.is_default,
        config: JSON.parse(row.config_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastUsedAt: row.last_used_at,
      }));
      sendJson(res, 200, { ok: true, presets });
    } catch (e) {
      console.error('[api/export-presets][GET] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '读取导出配置失败' });
    }
    return;
  }

  // 导出配置预设：GET /api/export-presets/active
  if (parsed.pathname === '/api/export-presets/active' && req.method === 'GET') {
    try {
      const db = getDb();
      const row = db.prepare(`
        SELECT id, name, is_default, config_json, created_at, updated_at, last_used_at
        FROM export_presets
        ORDER BY is_default DESC, last_used_at DESC, updated_at DESC
        LIMIT 1
      `).get();
      if (!row) {
        sendJson(res, 200, { ok: true, preset: null });
        return;
      }
      const preset = {
        id: row.id,
        name: row.name,
        isDefault: !!row.is_default,
        config: JSON.parse(row.config_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastUsedAt: row.last_used_at,
      };
      sendJson(res, 200, { ok: true, preset });
    } catch (e) {
      console.error('[api/export-presets/active][GET] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '读取当前导出配置失败' });
    }
    return;
  }

  // 导出配置预设：POST /api/export-presets  { name, config }
  if (parsed.pathname === '/api/export-presets' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 1024 * 256) {
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
      }
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
        return;
      }
      const name = body && body.name;
      const config = body && body.config;
      const isDefault = body && body.isDefault ? 1 : 0;
      if (!name || !config) {
        sendJson(res, 400, { ok: false, code: 'MISSING_FIELDS', message: '缺少 name 或 config 字段' });
        return;
      }
      try {
        const db = getDb();
        const now = Date.now();
        const insert = db.prepare(`
          INSERT INTO export_presets (name, is_default, config_json, created_at, updated_at, last_used_at)
          VALUES (@name, @is_default, @config_json, @ts, @ts, @ts)
        `);
        const info = insert.run({
          name,
          is_default: isDefault,
          config_json: JSON.stringify(config),
          ts: now,
        });
        sendJson(res, 200, { ok: true, id: info.lastInsertRowid });
      } catch (e) {
        console.error('[api/export-presets][POST] error:', e);
        sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '保存导出配置失败' });
      }
    });
    return;
  }

  // 导出配置自定义主题：GET /api/export-themes
  if (parsed.pathname === '/api/export-themes' && req.method === 'GET') {
    try {
      const db = getDb();
      const rows = db.prepare('SELECT name, css FROM export_custom_themes ORDER BY name ASC').all();
      const themes = {};
      for (const row of rows) {
        themes[row.name] = row.css;
      }
      sendJson(res, 200, { ok: true, themes });
    } catch (e) {
      console.error('[api/export-themes][GET] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '读取自定义主题失败' });
    }
    return;
  }

  // 导出配置自定义主题：POST /api/export-themes/save  { name, css }
  if (parsed.pathname === '/api/export-themes/save' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 1024 * 64) {
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
      }
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
        return;
      }
      const name = body && body.name;
      const css = body && body.css;
      if (!name || typeof css !== 'string') {
        sendJson(res, 400, { ok: false, code: 'MISSING_FIELDS', message: '缺少 name 或 css 字段' });
        return;
      }
      try {
        const db = getDb();
        const now = Date.now();
        const stmt = db.prepare(`
          INSERT INTO export_custom_themes (name, css, created_at, updated_at)
          VALUES (@name, @css, @ts, @ts)
          ON CONFLICT(name) DO UPDATE SET css = excluded.css, updated_at = excluded.updated_at
        `);
        stmt.run({ name, css, ts: now });
        sendJson(res, 200, { ok: true });
      } catch (e) {
        console.error('[api/export-themes/save][POST] error:', e);
        sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '保存自定义主题失败' });
      }
    });
    return;
  }

  // 导出配置自定义主题：POST /api/export-themes/delete  { name }
  if (parsed.pathname === '/api/export-themes/delete' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 1024 * 16) {
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
      }
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
        return;
      }
      const name = body && body.name;
      if (!name) {
        sendJson(res, 400, { ok: false, code: 'MISSING_NAME', message: '缺少 name 字段' });
        return;
      }
      try {
        const db = getDb();
        const stmt = db.prepare('DELETE FROM export_custom_themes WHERE name = ?');
        stmt.run(name);
        sendJson(res, 200, { ok: true });
      } catch (e) {
        console.error('[api/export-themes/delete][POST] error:', e);
        sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '删除自定义主题失败' });
      }
    });
    return;
  }

  // ==================== 最近文件 / 收藏夹 ====================

  // 最近文件：GET /api/recent-files
  if (parsed.pathname === '/api/recent-files' && req.method === 'GET') {
    try {
      const db = getDb();
      const rows = db.prepare(`
        SELECT path, name, last_opened, open_count
        FROM recent_files
        ORDER BY last_opened DESC
        LIMIT 100
      `).all();
      sendJson(res, 200, { ok: true, items: rows });
    } catch (e) {
      console.error('[api/recent-files][GET] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '读取最近文件失败' });
    }
    return;
  }

  // 最近文件：记录打开 /api/recent-files/open
  if (parsed.pathname === '/api/recent-files/open' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => { raw += chunk.toString('utf8'); });
    req.on('end', () => {
      try {
        const { path: filePath, name } = JSON.parse(raw || '{}');
        if (!filePath) {
          sendJson(res, 400, { ok: false, code: 'MISSING_PATH', message: '缺少文件路径' });
          return;
        }
        const db = getDb();
        const now = Date.now();
        const stmt = db.prepare(`
          INSERT INTO recent_files (path, name, last_opened, open_count)
          VALUES (@path, @name, @ts, 1)
          ON CONFLICT(path) DO UPDATE SET
            name = excluded.name,
            last_opened = excluded.last_opened,
            open_count = recent_files.open_count + 1
        `);
        stmt.run({
          path: filePath,
          name: name || require('path').basename(filePath),
          ts: now,
        });
        sendJson(res, 200, { ok: true });
      } catch (e) {
        console.error('[api/recent-files/open][POST] error:', e);
        sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '更新最近文件失败' });
      }
    });
    return;
  }

  // 最近文件：清空 /api/recent-files/clear
  if (parsed.pathname === '/api/recent-files/clear' && req.method === 'POST') {
    try {
      const db = getDb();
      db.prepare('DELETE FROM recent_files').run();
      sendJson(res, 200, { ok: true });
    } catch (e) {
      console.error('[api/recent-files/clear][POST] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '清空最近文件失败' });
    }
    return;
  }

  // 收藏夹：GET /api/favorites
  if (parsed.pathname === '/api/favorites' && req.method === 'GET') {
    try {
      const db = getDb();
      const rows = db.prepare(`
        SELECT id, path, name, type, added_at, order_index
        FROM favorites
        ORDER BY order_index ASC, added_at DESC
      `).all();
      sendJson(res, 200, { ok: true, items: rows });
    } catch (e) {
      console.error('[api/favorites][GET] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '读取收藏夹失败' });
    }
    return;
  }

  // 收藏夹：切换收藏 /api/favorites/toggle
  if (parsed.pathname === '/api/favorites/toggle' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => { raw += chunk.toString('utf8'); });
    req.on('end', () => {
      try {
        const { path: filePath, name, type } = JSON.parse(raw || '{}');
        if (!filePath) {
          sendJson(res, 400, { ok: false, code: 'MISSING_PATH', message: '缺少路径' });
          return;
        }
        const db = getDb();
        const existing = db.prepare('SELECT id FROM favorites WHERE path = ?').get(filePath);
        if (existing) {
          db.prepare('DELETE FROM favorites WHERE path = ?').run(filePath);
          sendJson(res, 200, { ok: true, favorited: false });
        } else {
          const count = db.prepare('SELECT COUNT(*) AS c FROM favorites').get().c || 0;
          const stmt = db.prepare(`
            INSERT INTO favorites (path, name, type, added_at, order_index)
            VALUES (@path, @name, @type, @ts, @order_index)
          `);
          stmt.run({
            path: filePath,
            name: name || require('path').basename(filePath),
            type: type || 'file',
            ts: Date.now(),
            order_index: count,
          });
          sendJson(res, 200, { ok: true, favorited: true });
        }
      } catch (e) {
        console.error('[api/favorites/toggle][POST] error:', e);
        sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '更新收藏夹失败' });
      }
    });
    return;
  }

  // 收藏夹：重排顺序 /api/favorites/reorder  { items: [{ id, order_index }] }
  if (parsed.pathname === '/api/favorites/reorder' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => { raw += chunk.toString('utf8'); });
    req.on('end', () => {
      try {
        const { items } = JSON.parse(raw || '{}');
        if (!Array.isArray(items)) {
          sendJson(res, 400, { ok: false, code: 'INVALID_ITEMS', message: 'items 必须是数组' });
          return;
        }
        const db = getDb();
        const stmt = db.prepare('UPDATE favorites SET order_index = @order_index WHERE id = @id');
        const tx = db.transaction((rows) => {
          rows.forEach(r => stmt.run(r));
        });
        tx(items);
        sendJson(res, 200, { ok: true });
      } catch (e) {
        console.error('[api/favorites/reorder][POST] error:', e);
        sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '更新收藏顺序失败' });
      }
    });
    return;
  }

  // 收藏夹：清空 /api/favorites/clear
  if (parsed.pathname === '/api/favorites/clear' && req.method === 'POST') {
    try {
      const db = getDb();
      db.prepare('DELETE FROM favorites').run();
      sendJson(res, 200, { ok: true });
    } catch (e) {
      console.error('[api/favorites/clear][POST] error:', e);
      sendJson(res, 500, { ok: false, code: 'DB_ERROR', message: '清空收藏夹失败' });
    }
    return;
  }


  // 媒体文件服务：GET /api/media?path=/abs/path/to/image.jpg
  // 直接返回文件内容，用于图片等资源的直接访问
  if (parsed.pathname === '/api/media' && req.method === 'GET') {
    const requestedPath = parsed.query.path;
    if (!requestedPath) {
      sendJson(res, 400, { ok: false, message: '缺少 path 参数' });
      return;
    }
    try {
      const safePath = resolveSafePathForRequest(req, requestedPath);
      const ext = path.extname(safePath).toLowerCase();
      const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon'
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      fs.readFile(safePath, (err, buf) => {
        if (err) {
          if (err.code === 'ENOENT') {
            sendJson(res, 404, { ok: false, message: '文件不存在' });
          } else if (err.code === 'EACCES') {
            sendJson(res, 403, { ok: false, message: '无权限读取文件' });
          } else {
            sendJson(res, 500, { ok: false, message: '读取文件失败' });
          }
          return;
        }
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': buf.length,
          'Cache-Control': 'public, max-age=3600'
        });
        res.end(buf);
      });
    } catch (e) {
      const code = e && e.message;
      if (code === 'PATH_NOT_ALLOWED') {
        sendJson(res, 403, { ok: false, message: '目标路径不在授权目录内' });
      } else {
        sendJson(res, 400, { ok: false, message: '无效路径' });
      }
    }
    return;
  }

  // 文件读取：GET /api/file?path=/abs/path/to/file&mode=text|binary|hex
  // mode 默认 text（utf8），binary 返回 base64，hex 返回十六进制字符串
  if (parsed.pathname === '/api/file' && req.method === 'GET') {
    const requestedPath = parsed.query.path;
    const mode = (parsed.query.mode || 'text').toLowerCase();
    try {
      const safePath = resolveSafePathForRequest(req, requestedPath);
      const isPdf = safePath.toLowerCase().endsWith('.pdf');
      if (mode === 'text' && isPdf && pdfParse) {
        fs.readFile(safePath, (err, buf) => {
          if (err) {
            if (err.code === 'ENOENT') {
              sendJson(res, 404, { ok: false, code: 'NOT_FOUND', message: '文件不存在' });
            } else if (err.code === 'EACCES') {
              sendJson(res, 403, { ok: false, code: 'EACCES', message: '无权限读取文件' });
            } else {
              sendJson(res, 500, { ok: false, code: 'READ_ERROR', message: '读取文件失败' });
            }
            return;
          }
          const { PDFParse } = pdfParse;
          const parser = new PDFParse({ data: buf });
          parser.getText().then((result) => {
            sendJson(res, 200, { ok: true, path: safePath, content: result?.text || '', encoding: 'utf8', extracted: true });
          }).catch((pdfErr) => {
            console.error('[pdf-parse] 提取失败:', pdfErr.message);
            sendJson(res, 200, { ok: true, path: safePath, content: '', encoding: 'utf8', extracted: false, message: 'PDF 文本提取失败' });
          });
        });
      } else if (mode === 'text') {
        fs.readFile(safePath, 'utf8', (err, content) => {
          if (err) {
            if (err.code === 'ENOENT') {
              sendJson(res, 404, { ok: false, code: 'NOT_FOUND', message: '文件不存在' });
            } else if (err.code === 'EACCES') {
              sendJson(res, 403, { ok: false, code: 'EACCES', message: '无权限读取文件' });
            } else {
              sendJson(res, 500, { ok: false, code: 'READ_ERROR', message: '读取文件失败' });
            }
            return;
          }
          sendJson(res, 200, { ok: true, path: safePath, content, encoding: 'utf8' });
        });
      } else {
        fs.readFile(safePath, (err, buf) => {
          if (err) {
            if (err.code === 'ENOENT') {
              sendJson(res, 404, { ok: false, code: 'NOT_FOUND', message: '文件不存在' });
            } else if (err.code === 'EACCES') {
              sendJson(res, 403, { ok: false, code: 'EACCES', message: '无权限读取文件' });
            } else {
              sendJson(res, 500, { ok: false, code: 'READ_ERROR', message: '读取文件失败' });
            }
            return;
          }
          if (mode === 'hex') {
            const hex = buf.toString('hex');
            sendJson(res, 200, { ok: true, path: safePath, content: hex, encoding: 'hex' });
          } else {
            const base64 = buf.toString('base64');
            sendJson(res, 200, { ok: true, path: safePath, content: base64, encoding: 'base64' });
          }
        });
      }
    } catch (e) {
      const code = e && e.message;
      if (code === 'PATH_NOT_ALLOWED') {
        sendJson(res, 403, { ok: false, code, message: '目标路径不在授权目录内' });
      } else if (code === 'PATH_MUST_BE_ABSOLUTE') {
        sendJson(res, 400, { ok: false, code, message: '需要提供绝对路径' });
      } else {
        sendJson(res, 400, { ok: false, code: code || 'INVALID_PATH', message: '无效路径或未配置授权目录' });
      }
    }
    return;
  }

  // Office 文件提取预览：GET /api/file/office/extract?path=/abs/path/to/file&format=docx|xlsx
  if (parsed.pathname === '/api/file/office/extract' && req.method === 'GET') {
    const requestedPath = parsed.query.path
    const format = (parsed.query.format || '').toLowerCase()
    const sheetIndexParam = parsed.query.sheetIndex
    const rowOffsetParam = parsed.query.rowOffset
    const rowLimitParam = parsed.query.rowLimit

    try {
      if (!requestedPath) {
        sendJson(res, 400, { ok: false, code: 'MISSING_PATH', message: '缺少 path 参数' })
        return
      }
      if (!['docx', 'xlsx'].includes(format)) {
        sendJson(res, 400, { ok: false, code: 'OFFICE_FORMAT_UNSUPPORTED', message: '不支持的 Office 格式', httpStatus: 400 })
        return
      }

      const safePath = resolveSafePathForRequest(req, requestedPath)
      const sheetIndex = sheetIndexParam !== undefined ? parseInt(String(sheetIndexParam), 10) : 0
      const rowOffset = rowOffsetParam !== undefined ? parseInt(String(rowOffsetParam), 10) : 0
      const rowLimit = rowLimitParam !== undefined ? parseInt(String(rowLimitParam), 10) : undefined
      const result = await extractOfficePreview(safePath, format, {
        sheetIndex: Number.isFinite(sheetIndex) ? sheetIndex : 0,
        rowOffset: Number.isFinite(rowOffset) ? rowOffset : 0,
        rowLimit: (rowLimit !== undefined && Number.isFinite(rowLimit)) ? rowLimit : undefined,
      })
      const statusCode = result && result.ok ? 200 : (result.httpStatus || 400)
      sendJson(res, statusCode, result)
      return
    } catch (e) {
      const message = e && e.message ? e.message : 'OFFICE_LOAD_ERROR'
      if (message === 'PATH_NOT_ALLOWED') {
        sendJson(res, 403, { ok: false, code: message, message: '目标路径不在授权目录内' })
      } else {
        sendJson(res, 400, { ok: false, code: 'OFFICE_LOAD_ERROR', message: 'Office 预览加载失败' })
      }
      return
    }
  }

  // 媒体文件服务：GET /api/media?path=/abs/path/to/image.jpg
  // 直接返回文件内容，用于图片等资源的直接访问
  if (parsed.pathname === '/api/media' && req.method === 'GET') {
    const requestedPath = parsed.query.path;
    if (!requestedPath) {
      sendJson(res, 400, { ok: false, message: '缺少 path 参数' });
      return;
    }
    try {
      const safePath = resolveSafePathForRequest(req, requestedPath);
      const ext = path.extname(safePath).toLowerCase();
      const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon'
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      
      fs.readFile(safePath, (err, buf) => {
        if (err) {
          if (err.code === 'ENOENT') {
            sendJson(res, 404, { ok: false, message: '文件不存在' });
          } else if (err.code === 'EACCES') {
            sendJson(res, 403, { ok: false, message: '无权限读取文件' });
          } else {
            sendJson(res, 500, { ok: false, message: '读取文件失败' });
          }
          return;
        }
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': buf.length,
          'Cache-Control': 'public, max-age=3600'
        });
        res.end(buf);
      });
    } catch (e) {
      const code = e && e.message;
      if (code === 'PATH_NOT_ALLOWED') {
        sendJson(res, 403, { ok: false, message: '目标路径不在授权目录内' });
      } else {
        sendJson(res, 400, { ok: false, message: '无效路径' });
      }
    }
    return;
  }

  // 文件列表：GET /api/files?path=/abs/path/to/dir
  if (parsed.pathname === '/api/files' && req.method === 'GET') {
    const requestedPath = parsed.query.path || '/';
    try {
      const safePath = requestedPath === '/' ? null : resolveSafePathForRequest(req, requestedPath);
      const roots = getAllowedRoots();
      
      // 如果请求根目录：用户授权路径 + mdeditor 子目录（Folder、新建文件夹等），不显示 mdeditor 本身
      if (!safePath) {
        const mdeditorRoot = path.join(SHARES_BASE, 'mdeditor');
        const sharesFolder = path.join(SHARES_BASE, 'Folder');
        const rootDirs = [];
        // 1. 用户授权路径（排除 mdeditor、排除 sharesFolder 避免与 mdeditor 子目录重复）
        roots
          .filter(root => {
            if (root === mdeditorRoot || path.basename(root) === 'mdeditor') return false;
            if (root === sharesFolder && fs.existsSync(mdeditorRoot)) return false;
            try {
              return fs.existsSync(root) && fs.statSync(root).isDirectory();
            } catch {
              return false;
            }
          })
          .forEach(root => rootDirs.push({ name: path.basename(root), path: root, type: 'directory', isRoot: true }));
        // 2. mdeditor 子目录（Folder、新建文件夹等），images/history 已过滤，避免与用户路径重复
        const existingPaths = new Set(rootDirs.map(d => d.path));
        if (fs.existsSync(mdeditorRoot)) {
          try {
            const entries = fs.readdirSync(mdeditorRoot, { withFileTypes: true });
            entries
              .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'images' && e.name !== 'history')
              .forEach(e => {
                const p = path.join(mdeditorRoot, e.name);
                if (!existingPaths.has(p)) {
                  existingPaths.add(p);
                  rootDirs.push({ name: e.name, path: p, type: 'directory', isRoot: true });
                }
              });
          } catch (_) {}
        }
        rootDirs.sort((a, b) => a.name.localeCompare(b.name));
        sendJson(res, 200, {
          ok: true,
          path: '/',
          items: rootDirs,
          createFolderRoot: fs.existsSync(mdeditorRoot) ? mdeditorRoot : (rootDirs[0]?.path || null)
        });
        return;
      }
      
      // 读取目录内容
      fs.readdir(safePath, { withFileTypes: true }, (err, entries) => {
        if (err) {
          if (err.code === 'ENOENT') {
            sendJson(res, 404, { ok: false, code: 'NOT_FOUND', message: '目录不存在' });
          } else if (err.code === 'EACCES') {
            sendJson(res, 403, { ok: false, code: 'EACCES', message: '无权限访问目录' });
          } else {
            sendJson(res, 500, { ok: false, code: 'READ_ERROR', message: '读取目录失败' });
          }
          return;
        }
        
        const items = entries
          .filter(entry => {
            if (entry.name.startsWith('.')) return false;
            // 全格式支持：展示所有文件，不再仅限 .md
            // images、history 为内部目录，默认不在文件树中显示
            if (entry.isDirectory() && (entry.name === 'images' || entry.name === 'history')) return false;
            return true;
          })
          .map(entry => {
            const fullPath = path.join(safePath, entry.name);
            const item = {
              name: entry.name,
              path: fullPath,
              type: entry.isDirectory() ? 'directory' : 'file',
              isRoot: false
            };
            if (entry.isFile()) {
              try {
                const stat = fs.statSync(fullPath);
                item.size = stat.size;
                item.mtime = stat.mtimeMs;
              } catch (_) {}
            }
            return item;
          })
          .sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          });
        
        sendJson(res, 200, { ok: true, path: safePath, items });
      });
    } catch (e) {
      const code = e && e.message;
      if (code === 'PATH_NOT_ALLOWED') {
        sendJson(res, 403, { ok: false, code, message: '目标路径不在授权目录内' });
      } else if (code === 'PATH_MUST_BE_ABSOLUTE') {
        sendJson(res, 400, { ok: false, code, message: '需要提供绝对路径' });
      } else {
        sendJson(res, 400, { ok: false, code: code || 'INVALID_PATH', message: '无效路径或未配置授权目录' });
      }
    }
    return;
  }

  // 文件重命名：POST /api/file/rename
  if (parsed.pathname === '/api/file/rename' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 1024 * 1024) {
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
      }
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
        return;
      }
      const oldPath = body && body.oldPath;
      const newPath = body && body.newPath;
      try {
        const safeOldPath = resolveSafePathForRequest(req, oldPath);
        const safeNewPath = resolveSafePathForRequest(req, newPath);
        
        if (!fs.existsSync(safeOldPath)) {
          sendJson(res, 404, { ok: false, code: 'NOT_FOUND', message: '源文件不存在' });
          return;
        }
        
        if (fs.existsSync(safeNewPath)) {
          sendJson(res, 409, { ok: false, code: 'ALREADY_EXISTS', message: '目标文件已存在' });
          return;
        }
        
        fs.mkdir(path.dirname(safeNewPath), { recursive: true }, (mkErr) => {
          if (mkErr) {
            sendJson(res, 500, { ok: false, code: 'MKDIR_FAILED', message: '创建目录失败' });
            return;
          }
          
          fs.rename(safeOldPath, safeNewPath, (renameErr) => {
            if (renameErr) {
              if (renameErr.code === 'EACCES') {
                sendJson(res, 403, { ok: false, code: 'EACCES', message: '无权限重命名文件' });
              } else {
                sendJson(res, 500, { ok: false, code: 'RENAME_ERROR', message: '重命名失败' });
              }
              return;
            }
            sendJson(res, 200, { ok: true, oldPath: safeOldPath, newPath: safeNewPath });
          });
        });
      } catch (e) {
        const code = e && e.message;
        if (code === 'PATH_NOT_ALLOWED') {
          sendJson(res, 403, { ok: false, code, message: '目标路径不在授权目录内' });
        } else if (code === 'PATH_MUST_BE_ABSOLUTE') {
          sendJson(res, 400, { ok: false, code, message: '需要提供绝对路径' });
        } else {
          sendJson(res, 400, { ok: false, code: code || 'INVALID_PATH', message: '无效路径' });
        }
      }
    });
    return;
  }

  // 文件删除：POST /api/file/delete
  if (parsed.pathname === '/api/file/delete' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 1024 * 1024) {
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
      }
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
        return;
      }
      const requestedPath = body && body.path;
      try {
        const safePath = resolveSafePathForRequest(req, requestedPath);
        
        if (!fs.existsSync(safePath)) {
          sendJson(res, 404, { ok: false, code: 'NOT_FOUND', message: '文件不存在' });
          return;
        }
        
        const stats = fs.statSync(safePath);
        
        if (stats.isDirectory()) {
          fs.rm(safePath, { recursive: true, force: true }, (rmErr) => {
            if (rmErr) {
              if (rmErr.code === 'EACCES') {
                sendJson(res, 403, { ok: false, code: 'EACCES', message: '无权限删除目录' });
              } else {
                sendJson(res, 500, { ok: false, code: 'DELETE_ERROR', message: '删除目录失败' });
              }
              return;
            }
            sendJson(res, 200, { ok: true, path: safePath, type: 'directory' });
          });
        } else {
          fs.unlink(safePath, (unlinkErr) => {
            if (unlinkErr) {
              if (unlinkErr.code === 'EACCES') {
                sendJson(res, 403, { ok: false, code: 'EACCES', message: '无权限删除文件' });
              } else {
                sendJson(res, 500, { ok: false, code: 'DELETE_ERROR', message: '删除文件失败' });
              }
              return;
            }
            sendJson(res, 200, { ok: true, path: safePath, type: 'file' });
          });
        }
      } catch (e) {
        const code = e && e.message;
        if (code === 'PATH_NOT_ALLOWED') {
          sendJson(res, 403, { ok: false, code, message: '目标路径不在授权目录内' });
        } else if (code === 'PATH_MUST_BE_ABSOLUTE') {
          sendJson(res, 400, { ok: false, code, message: '需要提供绝对路径' });
        } else {
          sendJson(res, 400, { ok: false, code: code || 'INVALID_PATH', message: '无效路径' });
        }
      }
    });
    return;
  }

  // 复制文件/文件夹：POST /api/file/copy
  if (parsed.pathname === '/api/file/copy' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 1024 * 1024) {
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
      }
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
        return;
      }
      const sourcePath = body && body.sourcePath;
      const targetPath = body && body.targetPath;
      try {
        const safeSourcePath = resolveSafePathForRequest(req, sourcePath);
        const safeTargetPath = resolveSafePathForRequest(req, targetPath);
        
        if (!fs.existsSync(safeSourcePath)) {
          sendJson(res, 404, { ok: false, code: 'NOT_FOUND', message: '源文件不存在' });
          return;
        }
        
        if (fs.existsSync(safeTargetPath)) {
          sendJson(res, 409, { ok: false, code: 'ALREADY_EXISTS', message: '目标文件已存在' });
          return;
        }
        
        // 确保目标目录存在
        fs.mkdir(path.dirname(safeTargetPath), { recursive: true }, (mkErr) => {
          if (mkErr) {
            sendJson(res, 500, { ok: false, code: 'MKDIR_FAILED', message: '创建目录失败' });
            return;
          }
          
          // 复制文件或目录
          const stats = fs.statSync(safeSourcePath);
          if (stats.isDirectory()) {
            // 复制目录（递归）
            const copyDir = (src, dest) => {
              fs.mkdirSync(dest, { recursive: true });
              const entries = fs.readdirSync(src, { withFileTypes: true });
              for (const entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                if (entry.isDirectory()) {
                  copyDir(srcPath, destPath);
                } else {
                  fs.copyFileSync(srcPath, destPath);
                }
              }
            };
            
            try {
              copyDir(safeSourcePath, safeTargetPath);
              sendJson(res, 200, { ok: true, sourcePath: safeSourcePath, targetPath: safeTargetPath });
            } catch (copyErr) {
              sendJson(res, 500, { ok: false, code: 'COPY_ERROR', message: '复制失败' });
            }
          } else {
            // 复制文件
            fs.copyFile(safeSourcePath, safeTargetPath, (copyErr) => {
              if (copyErr) {
                if (copyErr.code === 'EACCES') {
                  sendJson(res, 403, { ok: false, code: 'EACCES', message: '无权限复制文件' });
                } else {
                  sendJson(res, 500, { ok: false, code: 'COPY_ERROR', message: '复制失败' });
                }
                return;
              }
              sendJson(res, 200, { ok: true, sourcePath: safeSourcePath, targetPath: safeTargetPath });
            });
          }
        });
      } catch (e) {
        const code = e && e.message;
        if (code === 'PATH_NOT_ALLOWED') {
          sendJson(res, 403, { ok: false, code, message: '目标路径不在授权目录内' });
        } else if (code === 'PATH_MUST_BE_ABSOLUTE') {
          sendJson(res, 400, { ok: false, code, message: '需要提供绝对路径' });
        } else {
          sendJson(res, 400, { ok: false, code: code || 'INVALID_PATH', message: '无效路径' });
        }
      }
    });
    return;
  }

  // 移动文件/文件夹：POST /api/file/move
  if (parsed.pathname === '/api/file/move' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 1024 * 1024) {
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
      }
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
        return;
      }
      const sourcePath = body && body.sourcePath;
      const targetPath = body && body.targetPath;
      try {
        const safeSourcePath = resolveSafePathForRequest(req, sourcePath);
        const safeTargetPath = resolveSafePathForRequest(req, targetPath);
        
        if (!fs.existsSync(safeSourcePath)) {
          sendJson(res, 404, { ok: false, code: 'NOT_FOUND', message: '源文件不存在' });
          return;
        }
        
        if (fs.existsSync(safeTargetPath)) {
          sendJson(res, 409, { ok: false, code: 'ALREADY_EXISTS', message: '目标文件已存在' });
          return;
        }
        
        // 确保目标目录存在
        fs.mkdir(path.dirname(safeTargetPath), { recursive: true }, (mkErr) => {
          if (mkErr) {
            sendJson(res, 500, { ok: false, code: 'MKDIR_FAILED', message: '创建目录失败' });
            return;
          }
          
          // 移动文件或目录
          fs.rename(safeSourcePath, safeTargetPath, (moveErr) => {
            if (moveErr) {
              if (moveErr.code === 'EACCES') {
                sendJson(res, 403, { ok: false, code: 'EACCES', message: '无权限移动文件' });
              } else {
                sendJson(res, 500, { ok: false, code: 'MOVE_ERROR', message: '移动失败' });
              }
              return;
            }
            sendJson(res, 200, { ok: true, sourcePath: safeSourcePath, targetPath: safeTargetPath });
          });
        });
      } catch (e) {
        const code = e && e.message;
        if (code === 'PATH_NOT_ALLOWED') {
          sendJson(res, 403, { ok: false, code, message: '目标路径不在授权目录内' });
        } else if (code === 'PATH_MUST_BE_ABSOLUTE') {
          sendJson(res, 400, { ok: false, code, message: '需要提供绝对路径' });
        } else {
          sendJson(res, 400, { ok: false, code: code || 'INVALID_PATH', message: '无效路径' });
        }
      }
    });
    return;
  }

  // 创建文件夹：POST /api/folder/create
  if (parsed.pathname === '/api/folder/create' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 1024 * 1024) {
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
      }
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
        return;
      }
      const requestedPath = body && body.path;
      try {
        const safePath = resolveSafePathForRequest(req, requestedPath);
        
        if (fs.existsSync(safePath)) {
          sendJson(res, 409, { ok: false, code: 'ALREADY_EXISTS', message: '文件夹已存在' });
          return;
        }
        
        fs.mkdir(safePath, { recursive: true }, (mkErr) => {
          if (mkErr) {
            if (mkErr.code === 'EACCES') {
              sendJson(res, 403, { ok: false, code: 'EACCES', message: '无权限创建文件夹' });
            } else {
              sendJson(res, 500, { ok: false, code: 'MKDIR_FAILED', message: '创建文件夹失败' });
            }
            return;
          }
          sendJson(res, 200, { ok: true, path: safePath });
        });
      } catch (e) {
        const code = e && e.message;
        if (code === 'PATH_NOT_ALLOWED') {
          sendJson(res, 403, { ok: false, code, message: '目标路径不在授权目录内' });
        } else if (code === 'PATH_MUST_BE_ABSOLUTE') {
          sendJson(res, 400, { ok: false, code, message: '需要提供绝对路径' });
        } else {
          sendJson(res, 400, { ok: false, code: code || 'INVALID_PATH', message: '无效路径' });
        }
      }
    });
    return;
  }

  // 图片转换器状态：GET /api/image/converter/status
  if (parsed.pathname === '/api/image/converter/status' && req.method === 'GET') {
    try {
      const status = await imageConverter.getConverterStatus();
      sendJson(res, 200, status);
    } catch (err) {
      console.error('Converter status error:', err);
      sendJson(res, 500, { ok: false, message: '获取转换器状态失败' });
    }
    return;
  }

  // 图片列表：GET /api/image/list
  if (parsed.pathname === '/api/image/list' && req.method === 'GET') {
    try {
      const imagesBaseDir = getSharePath('images');
      
      if (!fs.existsSync(imagesBaseDir)) {
        sendJson(res, 200, { ok: true, images: [] });
        return;
      }
      
      const images = [];
      
      // 递归扫描图片目录
      function scanDirectory(dir, baseUrl = '/images') {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(imagesBaseDir, fullPath);
            const urlPath = baseUrl + '/' + relPath.replace(/\\\\/g, '/');
            
            if (entry.isDirectory()) {
              scanDirectory(fullPath, baseUrl);
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) {
                const stats = fs.statSync(fullPath);
                images.push({
                  url: urlPath,
                  filename: entry.name,
                  size: stats.size,
                  mtime: stats.mtime.toISOString(),
                  alt: entry.name.replace(/\.[^.]+$/, '')
                });
              }
            }
          }
        } catch (err) {
          console.error('Error scanning directory:', dir, err);
        }
      }
      
      scanDirectory(imagesBaseDir);
      
      // 按修改时间倒序排列（最新的在前）
      images.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
      
      sendJson(res, 200, { ok: true, images });
    } catch (err) {
      console.error('Image list error:', err);
      sendJson(res, 500, { ok: false, code: 'LIST_ERROR', message: '获取图片列表失败' });
    }
    return;
  }

  // 批量删除图片：POST /api/image/delete-batch
  // body: { items: [{ url: string, imagebedId?: number|string }] }
  if (parsed.pathname === '/api/image/delete-batch' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req, res, 1024 * 1024);
      const items = body && body.items;

      if (!Array.isArray(items) || items.length === 0) {
        sendJson(res, 400, { ok: false, code: 'INVALID_ITEMS', message: 'items 必须是非空数组' });
        return;
      }

      const results = [];

      async function deleteLocalByUrl(imageUrl) {
        let pathname = '';
        try {
          if (/^https?:\/\//i.test(imageUrl)) {
            const parsedUrl = new URL(imageUrl);
            pathname = parsedUrl.pathname;
          } else {
            pathname = String(imageUrl);
          }
        } catch (_) {
          pathname = String(imageUrl || '');
        }

        pathname = pathname.split('?')[0].split('#')[0];
        try { pathname = decodeURIComponent(pathname); } catch (_) {}

        const isImagesPath = pathname.startsWith('/images/');
        const isLocalApiPath = pathname.startsWith('/api/image/local/');
        if (!pathname || (!isImagesPath && !isLocalApiPath)) {
          return { ok: false, code: 'SKIP_LOCAL', message: '非本地图片路径，跳过本地删除' };
        }

        const relativePath = isImagesPath
          ? pathname.replace(/^\/images\/?/, '')
          : pathname.replace(/^\/api\/image\/local\/?/, '');

        const baseImagesPath = getSharePath('images');
        const imagePath = isImagesPath
          ? path.join(baseImagesPath, relativePath)
          : path.join(baseImagesPath, 'originals', relativePath);

        // 兼容旧版本硬编码路径
        const legacyBasePath = '/var/apps/App.Native.MdEditor2/shares/images';
        const legacyImagePath = isImagesPath
          ? path.join(legacyBasePath, relativePath)
          : path.join(legacyBasePath, 'originals', relativePath);

        const resolvedPath = fs.existsSync(imagePath) ? imagePath : legacyImagePath;
        if (!fs.existsSync(resolvedPath)) {
          return { ok: false, code: 'NOT_FOUND', message: '图片不存在' };
        }

        await fs.promises.unlink(resolvedPath);
        return { ok: true };
      }

      for (const item of items) {
        const imageUrl = item && item.url;
        const imagebedIdRaw = item && item.imagebedId;
        const imagebedId = imagebedIdRaw === undefined || imagebedIdRaw === null || imagebedIdRaw === ''
          ? undefined
          : Number(imagebedIdRaw);

        if (!imageUrl || typeof imageUrl !== 'string') {
          results.push({ ok: false, url: imageUrl, code: 'INVALID_URL', message: '无效的图片URL' });
          continue;
        }

        const entry = { ok: true, url: imageUrl, local: undefined, remote: undefined };

        // 远端（图床）删除：有 imagebedId 才尝试
        if (imagebedId !== undefined && Number.isFinite(imagebedId)) {
          try {
            const r = await imagebedManager.deleteImageFromBed(imagebedId, imageUrl);
            entry.remote = { ok: !!r.success, message: r.error || undefined };
            if (!r.success) entry.ok = false;
          } catch (e) {
            entry.remote = { ok: false, message: e && e.message ? e.message : '远端删除失败' };
            entry.ok = false;
          }
        }

        // 本地删除：仅对 /images 或 /api/image/local 生效
        try {
          const r = await deleteLocalByUrl(imageUrl);
          entry.local = r;
          if (r && r.ok === false && r.code !== 'SKIP_LOCAL') entry.ok = false;
        } catch (e) {
          entry.local = { ok: false, code: 'DELETE_ERROR', message: e && e.message ? e.message : '本地删除失败' };
          entry.ok = false;
        }

        results.push(entry);
      }

      const success = results.filter(r => r.ok).length;
      const failed = results.length - success;

      sendJson(res, 200, { ok: failed === 0, success, failed, results });
    } catch (err) {
      console.error('Image delete-batch error:', err);
      try {
        sendJson(res, 500, { ok: false, code: 'DELETE_BATCH_ERROR', message: '批量删除失败' });
      } catch (_) {}
    }
    return;
  }

  // 图片删除：DELETE /api/image/delete
  if (parsed.pathname === '/api/image/delete' && req.method === 'DELETE') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 1024 * 1024) {
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
      }
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
        return;
      }
      
      let imageUrl = body && body.url;
      if (!imageUrl) {
        sendJson(res, 400, { ok: false, code: 'INVALID_URL', message: '无效的图片URL' });
        return;
      }

      let pathname = '';
      try {
        if (/^https?:\/\//i.test(imageUrl)) {
          const parsedUrl = new URL(imageUrl);
          pathname = parsedUrl.pathname;
        } else {
          pathname = String(imageUrl);
        }
      } catch (_) {
        pathname = String(imageUrl || '');
      }

      pathname = pathname.split('?')[0].split('#')[0];
      try { pathname = decodeURIComponent(pathname); } catch (_) {}

      const isImagesPath = pathname.startsWith('/images/');
      const isLocalApiPath = pathname.startsWith('/api/image/local/');
      if (!pathname || (!isImagesPath && !isLocalApiPath)) {
        sendJson(res, 400, { ok: false, code: 'INVALID_URL', message: '无效的图片URL' });
        return;
      }

      const relativePath = isImagesPath
        ? pathname.replace(/^\/images\/?/, '')
        : pathname.replace(/^\/api\/image\/local\/?/, '');
      
      try {
        const baseImagesPath = getSharePath('images');
        const imagePath = isImagesPath
          ? path.join(baseImagesPath, relativePath)
          : path.join(baseImagesPath, 'originals', relativePath);

        // 兼容旧版本硬编码路径
        const legacyBasePath = '/var/apps/App.Native.MdEditor2/shares/images';
        const legacyImagePath = isImagesPath
          ? path.join(legacyBasePath, relativePath)
          : path.join(legacyBasePath, 'originals', relativePath);
        
        // 检查文件是否存在（兼容旧路径）
        const resolvedPath = fs.existsSync(imagePath) ? imagePath : legacyImagePath;
        if (!fs.existsSync(resolvedPath)) {
          sendJson(res, 404, { ok: false, code: 'NOT_FOUND', message: '图片不存在' });
          return;
        }
        
        // 删除文件
        fs.unlink(resolvedPath, (err) => {
          if (err) {
            if (err.code === 'EACCES') {
              sendJson(res, 403, { ok: false, code: 'EACCES', message: '无权限删除图片' });
            } else {
              sendJson(res, 500, { ok: false, code: 'DELETE_ERROR', message: '删除图片失败' });
            }
            return;
          }
          sendJson(res, 200, { ok: true, url: imageUrl });
        });
      } catch (err) {
        console.error('Image delete error:', err);
        sendJson(res, 500, { ok: false, code: 'DELETE_ERROR', message: '删除失败' });
      }
    });
    return;
  }



  // PlantUML 渲染为 SVG：POST /api/plantuml/svg
  if (parsed.pathname === '/api/plantuml/svg' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 512 * 1024) {
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
      }
    });

    req.on('end', async () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
        return;
      }

      const code = body && body.code;
      if (!code || typeof code !== 'string') {
        sendJson(res, 400, { ok: false, code: 'MISSING_CODE', message: '缺少 code 参数' });
        return;
      }

      try {
        // PlantUML 官方服务对 POST /plantuml/svg 往往会返回 302，且浏览器端会受到 CORS 影响。
        // 后端统一使用「编码后 GET」方式，避免重定向与跨域问题。
        const zlib = require('zlib');
        const encode6bit = (b) => {
          if (b < 10) return String.fromCharCode(48 + b);
          b -= 10;
          if (b < 26) return String.fromCharCode(65 + b);
          b -= 26;
          if (b < 26) return String.fromCharCode(97 + b);
          b -= 26;
          if (b === 0) return '-';
          if (b === 1) return '_';
          return '?';
        };
        const append3bytes = (b1, b2, b3) => {
          const c1 = b1 >> 2;
          const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
          const c3 = ((b2 & 0xF) << 2) | (b3 >> 6);
          const c4 = b3 & 0x3F;
          return '' + encode6bit(c1 & 0x3F) + encode6bit(c2 & 0x3F) + encode6bit(c3 & 0x3F) + encode6bit(c4 & 0x3F);
        };
        const encodePlantUml = (text) => {
          const data = zlib.deflateRawSync(Buffer.from(text, 'utf8'));
          let out = '';
          for (let i = 0; i < data.length; i += 3) {
            if (i + 2 === data.length) out += append3bytes(data[i], data[i + 1], 0);
            else if (i + 1 === data.length) out += append3bytes(data[i], 0, 0);
            else out += append3bytes(data[i], data[i + 1], data[i + 2]);
          }
          return out;
        };

        const encoded = encodePlantUml(code);
        const upstreamUrl = `https://www.plantuml.com/plantuml/svg/${encoded}`;
        const upstream = await fetch(upstreamUrl, {
          method: 'GET',
          headers: {
            'Accept': 'image/svg+xml,text/plain;q=0.9,*/*;q=0.8',
          },
          redirect: 'follow',
        });

        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => '');
          sendJson(res, 502, {
            ok: false,
            code: 'PLANTUML_UPSTREAM_ERROR',
            message: `PlantUML 服务错误: ${upstream.status}`,
            details: (errText || '').slice(0, 500),
            upstreamStatus: upstream.status,
            upstreamType: upstream.headers.get('content-type') || '',
            upstreamUrl: upstream.url || '',
          });
          return;
        }

        const svg = await upstream.text();
        const normalized = (svg || '').trim();
        const hasSvgTag = /<svg[\s>]/i.test(normalized);

        // 官方服务在某些网络环境会返回 HTML/网关页；失败时回退到 Kroki。
        if (!normalized || !hasSvgTag) {
          const kroki = await fetch('https://kroki.io/plantuml/svg', {
            method: 'POST',
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Accept': 'image/svg+xml,text/plain;q=0.9,*/*;q=0.8',
            },
            body: code,
            redirect: 'follow',
          });

          if (!kroki.ok) {
            const krokiErr = await kroki.text().catch(() => '');
            sendJson(res, 502, {
              ok: false,
              code: 'PLANTUML_INVALID_RESPONSE',
              message: 'PlantUML 返回内容不是 SVG，且 Kroki 回退失败',
              details: normalized.slice(0, 200),
              upstreamStatus: upstream.status,
              upstreamType: upstream.headers.get('content-type') || '',
              upstreamUrl: upstream.url || '',
              fallbackStatus: kroki.status,
              fallbackType: kroki.headers.get('content-type') || '',
              fallbackDetails: (krokiErr || '').slice(0, 200),
            });
            return;
          }

          const krokiSvg = (await kroki.text()).trim();
          if (!/<svg[\s>]/i.test(krokiSvg)) {
            sendJson(res, 502, {
              ok: false,
              code: 'PLANTUML_INVALID_RESPONSE',
              message: 'PlantUML 与 Kroki 均未返回 SVG',
              details: krokiSvg.slice(0, 200),
              upstreamStatus: upstream.status,
              upstreamType: upstream.headers.get('content-type') || '',
              upstreamUrl: upstream.url || '',
              fallbackStatus: kroki.status,
              fallbackType: kroki.headers.get('content-type') || '',
            });
            return;
          }

          sendJson(res, 200, { ok: true, svg: krokiSvg, source: 'kroki' });
          return;
        }

        sendJson(res, 200, { ok: true, svg: normalized, source: 'plantuml' });
      } catch (err) {
        console.error('PlantUML render error:', err);
        sendJson(res, 500, { ok: false, code: 'PLANTUML_RENDER_ERROR', message: 'PlantUML 渲染失败' });
      }
    });
    return;
  }

  // 数学公式渲染为 SVG：POST /api/math/svg
  if (parsed.pathname === '/api/math/svg' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 64 * 1024) {
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
      }
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
        return;
      }

      const latex = body && body.latex;
      const display = body && body.display === true;

      if (!latex || typeof latex !== 'string') {
        sendJson(res, 400, { ok: false, code: 'MISSING_LATEX', message: '缺少 latex 参数' });
        return;
      }

      try {
        const katex = require(path.join(__dirname, '../ui/frontend/node_modules/katex/dist/katex.min.js'));
        const rendered = katex.renderToString(latex, {
          throwOnError: false,
          displayMode: display,
          output: 'html'
        });

        if (!global._katexCss) {
          const cssPath = path.join(__dirname, '../ui/frontend/node_modules/katex/dist/katex.min.css');
          try { global._katexCss = fs.readFileSync(cssPath, 'utf8'); } catch(e) { global._katexCss = ''; }
        }

        const charCount = latex.length;
        const width = display ? Math.max(300, Math.min(800, charCount * 12 + 60)) : Math.max(60, Math.min(400, charCount * 10 + 20));
        const height = display ? 80 : 32;

        const svgContent = [
          '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"',
          ' width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">',
          '<defs><style>',
          global._katexCss,
          'body{margin:0;padding:0;background:transparent;}',
          '.katex{font-size:' + (display ? '1.3em' : '1em') + ';}',
          '.katex-display{margin:0;text-align:center;}',
          '</style></defs>',
          '<foreignObject width="100%" height="100%">',
          '<div xmlns="http://www.w3.org/1999/xhtml" style="display:' + (display ? 'flex' : 'inline-flex') + ';align-items:center;justify-content:center;width:' + width + 'px;height:' + height + 'px;overflow:visible;">',
          rendered,
          '</div></foreignObject></svg>'
        ].join('');

        const mathDir = '/tmp/md-editor-math';
        if (!fs.existsSync(mathDir)) fs.mkdirSync(mathDir, { recursive: true });

        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(latex + String(display)).digest('hex').substring(0, 12);
        const filename = 'math_' + hash + '.svg';
        const filepath = path.join(mathDir, filename);
        fs.writeFileSync(filepath, svgContent, 'utf8');

        // 同时返回 base64 编码的 SVG 内容，供前端内联使用
        const svgBase64 = Buffer.from(svgContent, 'utf8').toString('base64');
        sendJson(res, 200, { ok: true, url: '/math-svg/' + filename, width, height, svgBase64 });
      } catch (err) {
        console.error('Math SVG render error:', err);
        sendJson(res, 500, { ok: false, code: 'RENDER_ERROR', message: '渲染失败: ' + err.message });
      }
    });
    return;
  }

  // 数学公式 SVG 静态文件服务：/math-svg/...
  if (parsed.pathname.startsWith('/math-svg/')) {
    try {
      const filename = path.basename(parsed.pathname);
      if (!filename.endsWith('.svg') || filename.includes('..')) {
        res.writeHead(400); res.end('Bad Request'); return;
      }
      const filepath = path.join('/tmp/md-editor-math', filename);
      if (fs.existsSync(filepath)) {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
        res.end(fs.readFileSync(filepath));
        return;
      }
    } catch (err) {
      console.error('Math SVG serve error:', err);
    }
    res.writeHead(404); res.end('Not Found'); return;
  }

  // 图片 URL 抓取保存：POST /api/image/fetch-url  { url, alt }，支持 http(s) 与 data: 格式，不压缩
  if (parsed.pathname === '/api/image/fetch-url' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { url, alt } = JSON.parse(body);
        if (!url) {
          sendJson(res, 400, { ok: false, message: '缺少 url 参数' });
          return;
        }

        let buffer;
        let contentType = '';

        if (url.startsWith('data:')) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (!match) {
            sendJson(res, 400, { ok: false, message: 'data URL 格式无效' });
            return;
          }
          contentType = match[1];
          buffer = Buffer.from(match[2], 'base64');
        } else {
          // 下载远程图片
          const https = require('https');
          const http = require('http');
          const client = url.startsWith('https') ? https : http;

          const download = () => new Promise((resolve, reject) => {
            client.get(url, { timeout: 15000 }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
              // 跟随重定向（最多一次）
              const redirectUrl = response.headers.location;
              const rc = redirectUrl.startsWith('https') ? https : http;
              rc.get(redirectUrl, { timeout: 15000 }, (r2) => {
                const chunks = [];
                r2.on('data', c => chunks.push(c));
                r2.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: r2.headers['content-type'] || '' }));
                r2.on('error', reject);
              }).on('error', reject);
              return;
            }
            const chunks = [];
            response.on('data', c => chunks.push(c));
            response.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: response.headers['content-type'] || '' }));
            response.on('error', reject);
          }).on('error', reject);
        });
          const downloaded = await download();
          buffer = downloaded.buffer;
          contentType = downloaded.contentType;
        }

        // 确定扩展名
        let ext = '.jpg';
        if (contentType && contentType.includes('png')) ext = '.png';
        else if (contentType && contentType.includes('gif')) ext = '.gif';
        else if (contentType && contentType.includes('webp')) ext = '.webp';
        else if (contentType && contentType.includes('svg')) ext = '.svg';
        else if (url && url.startsWith('data:')) {
          const m = url.match(/^data:image\/(\w+)/);
          if (m) ext = '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
        } else if (url) {
          const urlExt = url.split('?')[0].split('.').pop().toLowerCase();
          if (['jpg','jpeg','png','gif','webp','svg'].includes(urlExt)) ext = '.' + (urlExt === 'jpeg' ? 'jpg' : urlExt);
        }

        // 存储路径
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const imagesDir = path.join(getSharePath('images'), year.toString(), month, day);
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

        const timestamp = Date.now();
        const random = Math.random().toString(36).slice(2, 8);
        const filename = `${timestamp}_${random}_fetched${ext}`;
        const filePath = path.join(imagesDir, filename);
        fs.writeFileSync(filePath, buffer);

        const imageUrl = `/images/${year}/${month}/${day}/${filename}`;
        sendJson(res, 200, { ok: true, url: imageUrl, filename, size: buffer.length });
      } catch (e) {
        console.error('fetch-url 失败:', e);
        sendJson(res, 500, { ok: false, message: e.message });
      }
    });
    return;
  }

  // 图片上传：POST /api/image/upload
  if (parsed.pathname === '/api/image/upload' && req.method === 'POST') {
    console.log('[Upload] 收到上传请求，Content-Type:', req.headers['content-type']);
    console.log('[Upload] 请求对象状态 - readable:', req.readable, 'readableLength:', req.readableLength);
    
    const contentType = req.headers['content-type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      sendJson(res, 400, { ok: false, code: 'INVALID_CONTENT_TYPE', message: '需要 multipart/form-data' });
      return;
    }
    
    // 简单的 multipart 解析（与 git 63328a6 一致）
    let boundary = (contentType.split('boundary=')[1] || '').trim();
    boundary = boundary.replace(/^["']|["']$/g, '').split(';')[0].trim(); // 移除引号及 ; 后内容
    if (!boundary) {
      sendJson(res, 400, { ok: false, code: 'NO_BOUNDARY', message: '缺少 boundary' });
      return;
    }
    
    console.log('[Upload] Boundary:', boundary);
    let rawData = Buffer.alloc(0);
    let dataReceived = false;
    
    req.on('data', chunk => {
      dataReceived = true;
      console.log('[Upload] 收到数据块:', chunk.length, '字节');
      rawData = Buffer.concat([rawData, chunk]);
      if (rawData.length > 10 * 1024 * 1024) { // 10MB 限制
        console.log('[Upload] 文件过大，中止');
        sendJson(res, 413, { ok: false, code: 'FILE_TOO_LARGE', message: '文件过大' });
        req.destroy();
      }
    });
    
    req.on('end', async () => {
      console.log('[Upload] 数据接收完成，总大小:', rawData.length, '字节，dataReceived:', dataReceived);
      if (!dataReceived) {
        console.log('[Upload] 警告：没有收到任何数据块！');
      }
      try {
        // 使用 Buffer 处理，避免编码问题
        const boundaryBuffer = Buffer.from('--' + boundary);
        const parts = [];
        let start = 0;
        
        // 分割 multipart 数据
        while (true) {
          const boundaryIndex = rawData.indexOf(boundaryBuffer, start);
          if (boundaryIndex === -1) break;
          
          const nextBoundaryIndex = rawData.indexOf(boundaryBuffer, boundaryIndex + boundaryBuffer.length);
          if (nextBoundaryIndex === -1) break;
          
          parts.push(rawData.slice(boundaryIndex + boundaryBuffer.length, nextBoundaryIndex));
          start = nextBoundaryIndex;
        }
        
        const uploadedImages = [];

        // 先扫描所有 parts，提取普通字段（如 imagebedId）
        let requestedImagebedId = null;
        for (const part of parts) {
          const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
          if (headerEnd === -1) continue;
          const headerSection = part.slice(0, headerEnd).toString('utf8');
          if (!headerSection.includes('Content-Disposition')) continue;
          // 只处理非文件字段（没有 filename=）
          if (headerSection.includes('filename=')) continue;
          const nameMatch = headerSection.match(/name="([^"]+)"/);
          if (!nameMatch) continue;
          const fieldName = nameMatch[1];
          const fieldValue = part.slice(headerEnd + 4, part.length - 2).toString('utf8').trim();
          if (fieldName === 'imagebedId' && fieldValue) {
            requestedImagebedId = parseInt(fieldValue);
          }
        }

        // 确定实际使用的图床
        let useImagebed = null;
        if (requestedImagebedId) {
          try {
            const configs = imagebedManager.getAllConfigs();
            useImagebed = configs.find(c => c.id === requestedImagebedId) || null;
          } catch (e) { /* ignore */ }
        }
        if (!useImagebed) {
          try {
            const configs = imagebedManager.getAllConfigs();
            useImagebed = configs.find(c => c.isDefault) || configs[0] || null;
          } catch (e) { /* ignore */ }
        }

        const useExternalImagebed = useImagebed && useImagebed.type !== 'local';
        console.log('[Upload] 使用图床:', useImagebed ? `${useImagebed.name} (${useImagebed.type})` : '本地存储');
        console.log('[Upload] 开始处理文件部分...');

        // 创建图片存储目录（本地存储备用）
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        
        // 使用共享 images 目录
        const imagesDir = path.join(getSharePath('images'), year.toString(), month, day);
        
        // 确保目录存在（与 git 63328a6 一致）
        if (!fs.existsSync(imagesDir)) {
          fs.mkdirSync(imagesDir, { recursive: true });
        }
        
        for (const part of parts) {
          // 查找 Content-Disposition 头
          const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
          if (headerEnd === -1) continue;
          
          const headerSection = part.slice(0, headerEnd).toString('utf8');
          
          console.log('Header section:', headerSection);
          
          if (!headerSection.includes('Content-Disposition')) continue;
          
          // 提取文件名 - 处理编码问题
          // 注意：headerSection 已经是 UTF-8 字符串，但文件名可能是 Latin-1 编码的
          const filenameMatch = headerSection.match(/filename="([^"]+)"|filename\*=UTF-8''([^;\r\n]+)/);
          if (!filenameMatch) continue;
          
          // 优先使用 RFC 5987 编码的文件名（filename*），否则使用普通文件名
          let originalFilename = filenameMatch[2] ? decodeURIComponent(filenameMatch[2]) : filenameMatch[1];
          
          console.log('=== 文件名解码开始 ===');
          console.log('原始匹配:', originalFilename);
          
          // 浏览器的 FormData 使用 Latin-1 编码发送文件名
          // 但是 headerSection.toString('utf8') 已经尝试用 UTF-8 解码了
          // 我们需要从原始 Buffer 中重新提取文件名
          try {
            // 在原始 Buffer 中查找 filename="
            const filenameStart = part.indexOf(Buffer.from('filename="'));
            if (filenameStart !== -1) {
              const nameStart = filenameStart + 10; // 'filename="' 的长度
              const nameEnd = part.indexOf(Buffer.from('"'), nameStart);
              
              if (nameEnd !== -1) {
                // 提取文件名的原始字节
                const filenameBytes = part.slice(nameStart, nameEnd);
                console.log('文件名字节:', filenameBytes.toString('hex'));
                
                // 用 UTF-8 解码
                originalFilename = filenameBytes.toString('utf8');
                console.log('UTF-8 解码后:', originalFilename);
              }
            }
          } catch (e) {
            console.error('文件名解码错误:', e);
          }
          
          console.log('最终文件名:', originalFilename);
          console.log('=== 文件名解码结束 ===');

          
          const ext = path.extname(originalFilename).toLowerCase();
          
          // 检查是否是 HEIC/HEIF 格式
          const isHEIC = ['.heic', '.heif'].includes(ext);
          
          // 验证文件类型
          if (!isHEIC && !['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
            continue;
          }
          
          // 生成唯一文件名 - 清理特殊字符
          const timestamp = Date.now();
          const random = Math.random().toString(36).substring(2, 8);
          const baseFilename = path.basename(originalFilename, ext);
          
          // 清理文件名：移除特殊字符，替换空格为下划线
          const cleanBaseFilename = baseFilename
            .replace(/[^\w\u4e00-\u9fa5.-]/g, '_')  // 保留字母、数字、中文、点和横线
            .replace(/_{2,}/g, '_')  // 多个下划线替换为一个
            .replace(/^_|_$/g, '');  // 移除首尾下划线
          
          // 提取文件内容
          const contentStart = headerEnd + 4; // \r\n\r\n 的长度
          const contentEnd = part.length - 2; // 去掉末尾的 \r\n
          
          if (contentStart >= part.length) continue;
          
          let fileContent = part.slice(contentStart, contentEnd);
          let finalExt = ext;
          let convertedFrom = null;
          
          // 如果是 HEIC/HEIF，转换为 JPEG
          if (isHEIC) {
            try {
              console.log(`检测到 HEIC/HEIF 文件: ${originalFilename}，开始转换...`);
              const convertResult = await imageConverter.convertImage(fileContent, originalFilename, {
                format: 'jpeg',
                quality: 85
              });
              
              fileContent = convertResult.buffer;
              finalExt = '.jpg';
              convertedFrom = 'HEIC';
              
              console.log(`HEIC 转换完成: ${convertResult.originalSize} -> ${convertResult.convertedSize} bytes`);
            } catch (convertErr) {
              console.error('HEIC 转换失败:', convertErr);
              // 转换失败，跳过此文件
              continue;
            }
          }
          
          const safeFilename = `${timestamp}_${random}_${cleanBaseFilename}${finalExt}`;

          const imageInfo = { filename: originalFilename, size: fileContent.length, alt: baseFilename };
          if (convertedFrom) imageInfo.convertedFrom = convertedFrom;

          if (useExternalImagebed) {
            // 上传到外部图床（GitHub 等）
            console.log('[Upload] 上传到外部图床:', useImagebed.name);
            try {
              console.log('[Upload] 调用 imagebedManager.uploadImage...');
              const result = await imagebedManager.uploadImage(fileContent, {
                filename: safeFilename,
                mimeType: finalExt === '.jpg' ? 'image/jpeg' : `image/${finalExt.slice(1)}`,
                imagebedId: useImagebed.id,
              });
              console.log('[Upload] 外部图床上传成功:', result.url);
              imageInfo.url = result.url;
              imageInfo.size = result.size || fileContent.length;
            } catch (uploadErr) {
              console.error('[Upload] 外部图床上传失败:', uploadErr);
              // 降级到本地存储
              const filepath = path.join(imagesDir, safeFilename);
              fs.writeFileSync(filepath, fileContent);
              imageInfo.url = `/images/${year}/${month}/${day}/${safeFilename}`;
              imageInfo.fallback = true;
            }
          } else {
            // 本地存储
            console.log('[Upload] 上传到本地存储');
            const filepath = path.join(imagesDir, safeFilename);
            fs.writeFileSync(filepath, fileContent);
            imageInfo.url = `/images/${year}/${month}/${day}/${safeFilename}`;
          }

          uploadedImages.push(imageInfo);
          
          console.log('添加到上传列表:', {
            url: imageInfo.url,
            filename: originalFilename,
            cleanFilename: safeFilename,
            alt: baseFilename,
            convertedFrom: convertedFrom
          });
        }
        
        if (uploadedImages.length === 0) {
          sendJson(res, 400, { ok: false, code: 'NO_IMAGES', message: '没有有效的图片文件' });
          return;
        }
        
        console.log('准备返回 JSON，图片数量:', uploadedImages.length);
        console.log('JSON 字符串:', JSON.stringify({ ok: true, images: uploadedImages }));
        
        sendJson(res, 200, { ok: true, images: uploadedImages });
      } catch (err) {
        console.error('Image upload error:', err);
        const msg = err.code === 'EACCES'
          ? '无权限写入图片目录，请检查 shares/images 权限'
          : ('上传失败: ' + (err.message || String(err)));
        sendJson(res, 500, { ok: false, code: 'UPLOAD_ERROR', message: msg });
      }
    });
    return;
  }

  if (parsed.pathname === '/api/file' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 2 * 1024 * 1024) {
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
      }
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
        return;
      }
      const requestedPath = body && body.path;
      const content = typeof body.content === 'string' ? body.content : '';
      const encoding = body.encoding || 'utf8'; // utf8 | base64
      try {
        const safePath = resolveSafePathForRequest(req, requestedPath);
        fs.mkdir(path.dirname(safePath), { recursive: true }, (mkErr) => {
          if (mkErr) {
            sendJson(res, 500, { ok: false, code: 'MKDIR_FAILED', message: '创建目录失败' });
            return;
          }
          const writeContent = encoding === 'base64' ? Buffer.from(content, 'base64') : content;
          const writeCb = (wErr) => {
            if (wErr) {
              if (wErr.code === 'EACCES') {
                sendJson(res, 403, { ok: false, code: 'EACCES', message: '无权限写入文件' });
              } else {
                sendJson(res, 500, { ok: false, code: 'WRITE_ERROR', message: '写入文件失败' });
              }
              return;
            }
            sendJson(res, 200, { ok: true, path: safePath });
          };
          if (encoding === 'base64') {
            fs.writeFile(safePath, writeContent, writeCb);
          } else {
            fs.writeFile(safePath, writeContent, 'utf8', writeCb);
          }
        });
      } catch (e) {
        const code = e && e.message;
        if (code === 'PATH_NOT_ALLOWED') {
          sendJson(res, 403, { ok: false, code, message: '目标路径不在授权目录内' });
        } else if (code === 'PATH_MUST_BE_ABSOLUTE') {
          sendJson(res, 400, { ok: false, code, message: '需要提供绝对路径' });
        } else {
          sendJson(res, 400, { ok: false, code: code || 'INVALID_PATH', message: '无效路径或未配置授权目录' });
        }
      }
    });
    return;
  }

  // ==================== 历史版本 API ====================
  
  // 保存版本：POST /api/file/history/save
  if (parsed.pathname === '/api/file/history/save' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 10 * 1024 * 1024) { // 限制10MB
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const { filePath, content, label, autoSaved } = JSON.parse(raw || '{}');
        
        // 验证文件路径
        try {
          resolveSafePathForRequest(req, filePath);
        } catch (error) {
          sendJson(res, 403, { ok: false, code: 'PATH_NOT_ALLOWED', message: '无权访问此文件' });
          return;
        }
        
        const result = historyManager.saveVersion(filePath, content, label || '', autoSaved !== false);
        sendJson(res, 200, result);
      } catch (error) {
        console.error('Save history error:', error);
        sendJson(res, 500, { ok: false, message: error.message });
      }
    });
    return;
  }

  // 获取版本列表：GET /api/file/history/list?path=xxx
  if (parsed.pathname === '/api/file/history/list' && req.method === 'GET') {
    try {
      const filePath = parsed.query.path;
      
      if (!filePath) {
        sendJson(res, 400, { ok: false, message: '缺少文件路径参数' });
        return;
      }
      
      // 验证文件路径
      try {
        resolveSafePathForRequest(req, filePath);
      } catch (error) {
        sendJson(res, 403, { ok: false, code: 'PATH_NOT_ALLOWED', message: '无权访问此文件' });
        return;
      }
      
      const versions = historyManager.getVersionList(filePath);
      sendJson(res, 200, { ok: true, versions });
    } catch (error) {
      console.error('Get version list error:', error);
      sendJson(res, 500, { ok: false, message: error.message });
    }
    return;
  }

  // 获取版本内容：GET /api/file/history/version?path=xxx&version=1
  if (parsed.pathname === '/api/file/history/version' && req.method === 'GET') {
    try {
      const filePath = parsed.query.path;
      const versionNumber = parseInt(parsed.query.version);
      
      if (!filePath || !versionNumber) {
        sendJson(res, 400, { ok: false, message: '缺少必要参数' });
        return;
      }
      
      // 验证文件路径
      try {
        resolveSafePathForRequest(req, filePath);
      } catch (error) {
        sendJson(res, 403, { ok: false, code: 'PATH_NOT_ALLOWED', message: '无权访问此文件' });
        return;
      }
      
      const version = historyManager.getVersionContent(filePath, versionNumber);
      
      if (version) {
        sendJson(res, 200, { ok: true, ...version });
      } else {
        sendJson(res, 404, { ok: false, message: '版本不存在' });
      }
    } catch (error) {
      console.error('Get version content error:', error);
      sendJson(res, 500, { ok: false, message: error.message });
    }
    return;
  }

  // 删除单个版本：POST /api/file/history/delete
  if (parsed.pathname === '/api/file/history/delete' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => { raw += chunk.toString('utf8'); });
    req.on('end', () => {
      try {
        const { filePath, versionNumber } = JSON.parse(raw || '{}');
        
        if (!filePath || !versionNumber) {
          sendJson(res, 400, { ok: false, message: '缺少必要参数' });
          return;
        }
        
        // 验证文件路径
        try {
          resolveSafePathForRequest(req, filePath);
        } catch (error) {
          sendJson(res, 403, { ok: false, code: 'PATH_NOT_ALLOWED', message: '无权访问此文件' });
          return;
        }
        
        const result = historyManager.deleteVersion(filePath, versionNumber);
        sendJson(res, 200, result);
      } catch (error) {
        console.error('Delete version error:', error);
        sendJson(res, 500, { ok: false, message: error.message });
      }
    });
    return;
  }

  // 删除所有版本：POST /api/file/history/clear
  if (parsed.pathname === '/api/file/history/clear' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => { raw += chunk.toString('utf8'); });
    req.on('end', () => {
      try {
        const { filePath } = JSON.parse(raw || '{}');
        
        if (!filePath) {
          sendJson(res, 400, { ok: false, message: '缺少文件路径参数' });
          return;
        }
        
        // 验证文件路径
        try {
          resolveSafePathForRequest(req, filePath);
        } catch (error) {
          sendJson(res, 403, { ok: false, code: 'PATH_NOT_ALLOWED', message: '无权访问此文件' });
          return;
        }
        
        const result = historyManager.clearAllVersions(filePath);
        sendJson(res, 200, result);
      } catch (error) {
        console.error('Clear all versions error:', error);
        sendJson(res, 500, { ok: false, message: error.message });
      }
    });
    return;
  }

  // ==================== 静态文件服务 ====================

  // 下载外部图片到本地：POST /api/download-image
  if (parsed.pathname === '/api/download-image' && req.method === 'POST') {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 1024 * 1024) {
        raw = '';
        sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: '内容过大' });
        req.destroy();
      }
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
        return;
      }
      
      const imageUrl = body && body.url;
      const targetDir = body && body.targetDir;
      
      if (!imageUrl) {
        sendJson(res, 400, { ok: false, code: 'MISSING_URL', message: '缺少 url 参数' });
        return;
      }
      
      if (!targetDir) {
        sendJson(res, 400, { ok: false, code: 'MISSING_TARGET_DIR', message: '缺少 targetDir 参数' });
        return;
      }
      
      // 验证目标目录
      let safeTargetDir;
      try {
        safeTargetDir = resolveSafePathForRequest(req, targetDir);
      } catch (e) {
        const code = e && e.message;
        sendJson(res, 403, { ok: false, code: code || 'INVALID_PATH', message: '目标目录无效或不在授权范围内' });
        return;
      }
      
      // 验证 URL 格式
      let targetUrl;
      try {
        targetUrl = new URL(imageUrl);
        if (!['http:', 'https:'].includes(targetUrl.protocol)) {
          sendJson(res, 400, { ok: false, code: 'INVALID_PROTOCOL', message: '仅支持 http/https 协议' });
          return;
        }
      } catch (e) {
        sendJson(res, 400, { ok: false, code: 'INVALID_URL', message: '无效的 URL' });
        return;
      }
      
      // 生成本地文件名
      const urlPath = targetUrl.pathname;
      const ext = path.extname(urlPath) || '.png';
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const fileName = `downloaded_${timestamp}_${random}${ext}`;
      const localPath = path.join(safeTargetDir, fileName);
      
      // 确保目标目录存在
      fs.mkdir(safeTargetDir, { recursive: true }, (mkErr) => {
        if (mkErr) {
          sendJson(res, 500, { ok: false, code: 'MKDIR_FAILED', message: '创建目录失败' });
          return;
        }
        
        // 下载图片
        const protocol = targetUrl.protocol === 'https:' ? require('https') : require('http');
        const file = fs.createWriteStream(localPath);
        
        const downloadReq = protocol.get(imageUrl, (downloadRes) => {
          if (downloadRes.statusCode !== 200) {
            fs.unlink(localPath, () => {});
            sendJson(res, downloadRes.statusCode, { 
              ok: false, 
              code: 'DOWNLOAD_ERROR', 
              message: `下载失败: ${downloadRes.statusCode}` 
            });
            return;
          }
          
          downloadRes.pipe(file);
          
          file.on('finish', () => {
            file.close(() => {
              sendJson(res, 200, { 
                ok: true, 
                originalUrl: imageUrl,
                localPath: localPath,
                fileName: fileName
              });
            });
          });
        });
        
        downloadReq.on('error', (err) => {
          fs.unlink(localPath, () => {});
          console.error('Download error:', err);
          sendJson(res, 500, { 
            ok: false, 
            code: 'DOWNLOAD_ERROR', 
            message: '下载失败: ' + err.message 
          });
        });
        
        file.on('error', (err) => {
          fs.unlink(localPath, () => {});
          console.error('File write error:', err);
          sendJson(res, 500, { 
            ok: false, 
            code: 'WRITE_ERROR', 
            message: '写入文件失败: ' + err.message 
          });
        });
        
        // 设置超时
        downloadReq.setTimeout(30000, () => {
          downloadReq.destroy();
          file.close(() => {
            fs.unlink(localPath, () => {});
          });
          sendJson(res, 504, { 
            ok: false, 
            code: 'TIMEOUT', 
            message: '下载超时' 
          });
        });
      });
    });
    return;
  }

  // 图片代理服务：GET /api/proxy-image?url=https://example.com/image.png
  if (parsed.pathname === '/api/proxy-image' && req.method === 'GET') {
    const imageUrl = parsed.query.url;
    
    if (!imageUrl) {
      sendJson(res, 400, { ok: false, code: 'MISSING_URL', message: '缺少 url 参数' });
      return;
    }
    
    // 验证 URL 格式
    let targetUrl;
    try {
      targetUrl = new URL(imageUrl);
      if (!['http:', 'https:'].includes(targetUrl.protocol)) {
        sendJson(res, 400, { ok: false, code: 'INVALID_PROTOCOL', message: '仅支持 http/https 协议' });
        return;
      }
    } catch (e) {
      sendJson(res, 400, { ok: false, code: 'INVALID_URL', message: '无效的 URL' });
      return;
    }
    
    // 使用 http/https 模块代理请求
    const protocol = targetUrl.protocol === 'https:' ? require('https') : require('http');
    
    const proxyReq = protocol.get(imageUrl, (proxyRes) => {
      // 检查响应状态
      if (proxyRes.statusCode !== 200) {
        sendJson(res, proxyRes.statusCode, { 
          ok: false, 
          code: 'PROXY_ERROR', 
          message: `代理请求失败: ${proxyRes.statusCode}` 
        });
        return;
      }
      
      // 转发响应头
      const contentType = proxyRes.headers['content-type'] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      });
      
      // 转发响应体
      proxyRes.pipe(res);
    });
    
    proxyReq.on('error', (err) => {
      console.error('Proxy request error:', err);
      if (!res.headersSent) {
        sendJson(res, 500, { 
          ok: false, 
          code: 'PROXY_ERROR', 
          message: '代理请求失败: ' + err.message 
        });
      }
    });
    
    // 设置超时
    proxyReq.setTimeout(10000, () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        sendJson(res, 504, { 
          ok: false, 
          code: 'TIMEOUT', 
          message: '代理请求超时' 
        });
      }
    });
    
    return;
  }

  // 静态文件服务

  // 字体本地缓存静态文件服务：/font-cache/...
  if (parsed.pathname.startsWith('/font-cache/')) {
    try {
      ensureFontCacheDir();
      const fileName = decodeURIComponent(parsed.pathname.replace(/^\/font-cache\//, ''));
      if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
        res.writeHead(400);
        res.end('Bad Request');
        return;
      }
      const filePath = path.join(FONT_CACHE_DIR, fileName);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.css': 'text/css; charset=utf-8',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
          '.ttf': 'font/ttf',
          '.otf': 'font/otf',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(500);
            res.end('Internal Server Error');
            return;
          }
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
          });
          res.end(data);
        });
        return;
      }
    } catch (e) {
      console.error('[font-cache][static] error:', e);
    }
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // 图片静态文件服务：/images/...
  if (parsed.pathname.startsWith('/images/')) {
    try {
      // 解码 URL 路径以处理中文文件名
      const decodedPathname = decodeURIComponent(parsed.pathname);
      const baseImagesPath = getSharePath('images');
      const imagePath = path.join(baseImagesPath, decodedPathname.substring('/images/'.length));
      const legacyImagePath = path.join('/var/apps/App.Native.MdEditor2/shares/images', decodedPathname.substring('/images/'.length));
      
      console.log('Image request:', imagePath);
      
      const resolvedPath = (fs.existsSync(imagePath) ? imagePath : legacyImagePath);
      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
        const ext = path.extname(resolvedPath).toLowerCase();
        const mimeTypes = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        
        fs.readFile(resolvedPath, (err, data) => {
          if (err) {
            res.writeHead(500);
            res.end('Internal Server Error');
            return;
          }
          res.writeHead(200, { 
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000'
          });
          res.end(data);
        });
        return;
      }
    } catch (err) {
      console.error('Image serve error:', err);
    }
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const staticPath = path.join(STATIC_DIR, parsed.pathname === '/' ? 'index.html' : parsed.pathname);
  
  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    const ext = path.extname(staticPath);
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.mjs': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const headers = { 'Content-Type': contentType };
    // index.html 不缓存，避免手机端拿到旧 HTML 去请求已删除的 hash 资源导致白屏
    if (ext === '.html') {
      headers['Cache-Control'] = 'no-cache, max-age=0, must-revalidate';
    } else if (parsed.pathname.startsWith('/assets/')) {
      // Vite hash 资源：长期缓存（移动端二次打开明显加速）
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else if (
      parsed.pathname.startsWith('/code-themes/') ||
      parsed.pathname.startsWith('/katex/') ||
      parsed.pathname.startsWith('/mathjax/')
    ) {
      // 稳定静态资源：短期缓存即可，避免频繁重复下载
      headers['Cache-Control'] = 'public, max-age=86400';
    }
    fs.readFile(staticPath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, headers);
      res.end(data);
    });
    return;
  }

  // SPA 回退
  if (!parsed.pathname.startsWith('/api') && !parsed.pathname.startsWith('/health')) {
    const indexPath = path.join(STATIC_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      fs.readFile(indexPath, 'utf8', (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end('Internal Server Error');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, max-age=0, must-revalidate'
        });
        res.end(data);
      });
      return;
    }
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

// 显式绑定 0.0.0.0，与 web/fpk 的 python -m http.server --bind 0.0.0.0 一致，确保局域网内手机/PC 均可访问
server.listen(PORT, '0.0.0.0', () => {
  console.log(`App.Native.MdEditor backend listening on port ${PORT}`);
  console.log(`Static files: ${STATIC_DIR}`);
});
