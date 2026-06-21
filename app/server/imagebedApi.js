/**
 * 图床 API 路由处理
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * 处理图床 API 请求
 */
function handleImagebedApi(req, res, pathname, query, body, imagebedManager, sendJson) {
  // GET /api/imagebed/list - 获取所有图床配置
  if (req.method === 'GET' && pathname === '/api/imagebed/list') {
    try {
      const configs = imagebedManager.getAllConfigs();
      sendJson(res, 200, { ok: true, configs });
    } catch (err) {
      console.error('[API] Error getting imagebed list:', err);
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  // GET /api/imagebed/default - 获取默认图床配置
  if (req.method === 'GET' && pathname === '/api/imagebed/default') {
    try {
      const configs = imagebedManager.getAllConfigs();
      const defaultConfig = configs.find(c => c.isDefault) || configs[0] || null;
      sendJson(res, 200, { ok: true, config: defaultConfig });
    } catch (err) {
      console.error('[API] Error getting default imagebed:', err);
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  // GET /api/imagebed/:id - 获取指定图床配置
  if (req.method === 'GET' && pathname.match(/^\/api\/imagebed\/\d+$/)) {
    try {
      const id = parseInt(pathname.split('/').pop());
      const includeSecrets = query.secrets === 'true';

      let config = null;
      if (includeSecrets) {
        if (!imagebedManager.isSecretsAccessAllowed(req)) {
          sendJson(res, 403, { ok: false, error: 'Secrets access denied' });
          return true;
        }
        config = imagebedManager.getConfigById(id, { includeSecrets: true });
      } else {
        const configs = imagebedManager.getAllConfigs();
        config = configs.find(c => c.id === id);
      }
      
      if (!config) {
        sendJson(res, 404, { ok: false, error: 'Imagebed not found' });
        return true;
      }
      
      sendJson(res, 200, { ok: true, config });
    } catch (err) {
      console.error('[API] Error getting imagebed:', err);
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  // POST /api/imagebed/add - 添加新图床
  if (req.method === 'POST' && pathname === '/api/imagebed/add') {
    try {
      const { name, type, config } = body;
      
      if (!name || !type || !config) {
        sendJson(res, 400, { ok: false, error: 'Missing required fields' });
        return true;
      }

      const id = imagebedManager.addConfig(name, type, config);
      sendJson(res, 200, { ok: true, id });
    } catch (err) {
      console.error('[API] Error adding imagebed:', err);
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  // PUT /api/imagebed/:id - 更新图床配置
  if (req.method === 'PUT' && pathname.match(/^\/api\/imagebed\/\d+$/)) {
    try {
      const id = parseInt(pathname.split('/').pop());
      const { name, config } = body;
      
      if (!name || !config) {
        sendJson(res, 400, { ok: false, error: 'Missing required fields' });
        return true;
      }

      imagebedManager.updateConfig(id, name, config);
      sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('[API] Error updating imagebed:', err);
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  // DELETE /api/imagebed/:id - 删除图床配置
  if (req.method === 'DELETE' && pathname.match(/^\/api\/imagebed\/\d+$/)) {
    try {
      const id = parseInt(pathname.split('/').pop());
      imagebedManager.deleteConfig(id);
      sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('[API] Error deleting imagebed:', err);
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  // POST /api/imagebed/:id/test - 测试图床连接
  if (req.method === 'POST' && pathname.match(/^\/api\/imagebed\/\d+\/test$/)) {
    try {
      const id = parseInt(pathname.split('/')[3]);
      imagebedManager.testConnection(id).then(result => {
        sendJson(res, 200, { ok: result.success, ...result });
      }).catch(err => {
        sendJson(res, 500, { ok: false, error: err.message });
      });
    } catch (err) {
      console.error('[API] Error testing imagebed:', err);
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  // PUT /api/imagebed/:id/default - 设置默认图床
  if (req.method === 'PUT' && pathname.match(/^\/api\/imagebed\/\d+\/default$/)) {
    try {
      const id = parseInt(pathname.split('/')[3]);
      imagebedManager.setDefaultConfig(id);
      sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('[API] Error setting default imagebed:', err);
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  // GET /api/imagebed/:id/images - 获取指定图床的图片列表
  if (req.method === 'GET' && pathname.match(/^\/api\/imagebed\/\d+\/images$/)) {
    try {
      const id = parseInt(pathname.split('/')[3]);
      const force = query.force === 'true';
      imagebedManager.listImages(id, force).then(result => {
        sendJson(res, 200, { ok: true, images: result.images || [], total: result.total || 0, fromCache: !!result.fromCache });
      }).catch(err => {
        sendJson(res, 500, { ok: false, error: err.message });
      });
    } catch (err) {
      console.error('[API] Error listing imagebed images:', err);
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  // GET /api/imagebed/:id/thumb/:imageId - 获取缩略图
  if (req.method === 'GET' && pathname.match(/^\/api\/imagebed\/\d+\/thumb\/[a-f0-9]+$/)) {
    try {
      const parts = pathname.split('/');
      const imageId = parts[5];
      const thumbPath = imagebedManager.cache.getThumbPath(imageId);
      if (!thumbPath || !fs.existsSync(thumbPath)) {
        sendJson(res, 404, { ok: false, error: 'Thumbnail not found' });
        return true;
      }
      const ext = path.extname(thumbPath).toLowerCase();
      const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
      const mime = mimeTypes[ext] || 'image/jpeg';
      const buf = fs.readFileSync(thumbPath);
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': buf.length,
        'Cache-Control': 'public, max-age=86400',
      });
      res.end(buf);
    } catch (err) {
      console.error('[API] Error serving thumb:', err);
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  // DELETE /api/imagebed/:id/images - 删除指定图床的图片
  if (req.method === 'DELETE' && pathname.match(/^\/api\/imagebed\/\d+\/images$/)) {
    try {
      const id = parseInt(pathname.split('/')[3]);
      const { url } = body;
      if (!url) {
        sendJson(res, 400, { ok: false, error: 'Missing url' });
        return true;
      }
      imagebedManager.deleteImageFromBed(id, url).then(result => {
        sendJson(res, 200, { ok: result.success, error: result.error });
      }).catch(err => {
        sendJson(res, 500, { ok: false, error: err.message });
      });
    } catch (err) {
      console.error('[API] Error deleting imagebed image:', err);
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  return false;
}

/**
 * 处理图片上传 API
 */
async function handleImageUploadApi(req, res, pathname, query, imagebedManager, sendJson, readMultipartBody) {
  // POST /api/image/upload - 上传图片
  if (req.method === 'POST' && pathname === '/api/image/upload') {
    try {
      const { files, fields } = await readMultipartBody(req);
      
      if (!files || files.length === 0) {
        sendJson(res, 400, { ok: false, error: 'No files uploaded' });
        return true;
      }

      const imagebedId = fields.imagebedId ? parseInt(fields.imagebedId) : undefined;
      const uploadedImages = [];

      for (const file of files) {
        try {
          const result = await imagebedManager.uploadImage(file.buffer, {
            filename: file.originalname,
            mimeType: file.mimetype,
            imagebedId,
          });

          uploadedImages.push({
            id: result.id,
            filename: result.filename,
            url: result.url,
            size: result.size,
            alt: file.originalname.replace(/\.[^.]+$/, ''),
          });
        } catch (err) {
          console.error('[API] Error uploading file:', err);
          // 继续处理其他文件
        }
      }

      if (uploadedImages.length === 0) {
        sendJson(res, 500, { ok: false, error: 'Failed to upload any files' });
        return true;
      }

      sendJson(res, 200, { ok: true, images: uploadedImages });
    } catch (err) {
      console.error('[API] Error in upload handler:', err);
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  return false;
}

/**
 * 处理图片管理 API
 */
function handleImageManagementApi(req, res, pathname, query, body, imagebedManager, sendJson) {
  // GET /api/image/list - 获取图片列表
  if (req.method === 'GET' && pathname === '/api/image/list') {
    try {
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 20;
      const imagebedId = query.imagebedId ? parseInt(query.imagebedId) : undefined;

      const result = imagebedManager.getImageList({ page, limit, imagebedId });
      sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      console.error('[API] Error getting image list:', err);
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  // DELETE /api/image/:id - 删除图片
  if (req.method === 'DELETE' && pathname.match(/^\/api\/image\/[a-f0-9]+$/)) {
    try {
      const id = pathname.split('/').pop();
      imagebedManager.deleteImage(id).then(result => {
        if (result.success) {
          sendJson(res, 200, { ok: true });
        } else {
          sendJson(res, 500, { ok: false, error: result.error });
        }
      }).catch(err => {
        sendJson(res, 500, { ok: false, error: err.message });
      });
    } catch (err) {
      console.error('[API] Error deleting image:', err);
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return true;
  }

  return false;
}

/**
 * 处理本地图片访问
 */
function handleLocalImageAccess(req, res, pathname, localAdapter) {
  // GET /api/image/local/:filename - 获取本地图片
  if (req.method === 'GET' && pathname.match(/^\/api\/image\/local\/.+$/)) {
    try {
      const filename = pathname.split('/').pop();
      const filePath = localAdapter.getImageFile(filename);
      
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
      };

      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      const fileBuffer = fs.readFileSync(filePath);

      res.writeHead(200, {
        'Content-Type': mimeType,
        'Content-Length': fileBuffer.length,
        'Cache-Control': 'public, max-age=31536000',
      });
      res.end(fileBuffer);
    } catch (err) {
      console.error('[API] Error accessing local image:', err);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Image not found' }));
    }
    return true;
  }

  return false;
}

module.exports = {
  handleImagebedApi,
  handleImageUploadApi,
  handleImageManagementApi,
  handleLocalImageAccess,
};
