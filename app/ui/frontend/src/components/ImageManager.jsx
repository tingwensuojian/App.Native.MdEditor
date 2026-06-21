import React, { useState, useEffect } from 'react';
import { Image, X, Upload, Copy, Plus, Trash2 } from 'lucide-react';
import './ImageManager.css';
import ImageUploader from './ImageUploader';
import ImagePreview from './ImagePreview';
import { useAppUi } from '../context/AppUiContext';

const ImageManager = ({ onInsert, onClose }) => {
  const { showToast, requestConfirm } = useAppUi();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedImages, setSelectedImages] = useState(new Set());
  const [showUploader, setShowUploader] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    loadImages();
  }, [page, search]);

  const loadImages = async () => {
    setLoading(true);
    try {
      const response = await fetch(`api/images?page=${page}&limit=${limit}&search=${search}`);
      const result = await response.json();
      
      if (result.ok) {
        setImages(result.data.images);
        setTotal(result.data.total);
      }
    } catch (err) {
      console.error('加载图片失败:', err);
    }
    setLoading(false);
  };

  const doRefreshImages = () => {
    loadImages();
  };

  const doOpenImagePreview = (image) => {
    setPreviewImage(image);
  };

  const doInsertImage = (image) => {
    if (onInsert) {
      const filename = image.filename || image.url.split('/').pop();
      const altText = filename.replace(/\.[^.]+$/, '');
      onInsert(`![${altText}](${image.url})`);
    }
    onClose();
  };

  const doDeleteImage = async (image) => {
    const confirmed = await requestConfirm({
      title: '删除图片',
      message: `确定要删除 ${image.filename} 吗？`,
      confirmText: '删除'
    });

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`api/image?url=${encodeURIComponent(image.url)}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.ok) {
        loadImages();
      } else {
        showToast('删除失败：' + result.message, 'error');
      }
    } catch (err) {
      showToast('删除失败：' + err.message, 'error');
    }
  };

  const doCopyImageLink = (image) => {
    navigator.clipboard.writeText(image.url);
    showToast('链接已复制到剪贴板', 'success');
  };

  const handleUploadSuccess = () => {
    doRefreshImages();
  };

  const handleImageClick = (image) => {
    doOpenImagePreview(image);
  };

  const handleInsertClick = (image) => {
    doInsertImage(image);
  };

  const handleCopyLinkClick = (image) => {
    doCopyImageLink(image);
  };

  const handleDeleteClick = async (image) => {
    await doDeleteImage(image);
  };

  const doOpenUploaderDialog = () => {
    setShowUploader(true);
  };

  const doCloseUploaderDialog = () => {
    setShowUploader(false);
  };

  const doClosePreviewDialog = () => {
    setPreviewImage(null);
  };

  const handleOpenUploaderClick = () => {
    doOpenUploaderDialog();
  };

  const handleUploaderClose = () => {
    doCloseUploaderDialog();
  };

  const handlePreviewClose = () => {
    doClosePreviewDialog();
  };

  const handleOverlayClick = () => {
    onClose();
  };

  const handleCloseClick = () => {
    onClose();
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="image-manager-overlay" onClick={handleOverlayClick}>
      <div className="image-manager-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="image-manager-header">
          <h3><Image size={20} /> 图片管理器</h3>
          <button className="close-btn" onClick={handleCloseClick}><X size={20} /></button>
        </div>

        <div className="image-manager-toolbar">
          <input
            type="text"
            className="search-input"
            placeholder="搜索图片..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="upload-btn" onClick={handleOpenUploaderClick}>
            <Upload size={16} /> 上传图片
          </button>
        </div>

        <div className="image-manager-body">
          {loading ? (
            <div className="loading">加载中...</div>
          ) : images.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Image size={64} /></div>
              <p>还没有上传图片</p>
              <button className="upload-btn" onClick={handleOpenUploaderClick}>
                上传第一张图片
              </button>
            </div>
          ) : (
            <div className="image-grid">
              {images.map((image, index) => (
                <div key={index} className="image-card">
                  <div className="image-thumbnail" onClick={() => handleImageClick(image)}>
                    <img src={image.url} alt={image.filename} />
                  </div>
                  <div className="image-info">
                    <div className="image-filename" title={image.filename}>
                      {image.filename}
                    </div>
                    <div className="image-size">{formatFileSize(image.size)}</div>
                  </div>
                  <div className="image-actions">
                    <button
                      className="action-btn"
                      onClick={() => handleInsertClick(image)}
                      title="插入到编辑器"
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => handleCopyLinkClick(image)}
                      title="复制链接"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      className="action-btn delete-btn"
                      onClick={() => handleDeleteClick(image)}
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="image-manager-footer">
            <button
              className="page-btn"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              ← 上一页
            </button>
            <span className="page-info">
              第 {page} / {totalPages} 页（共 {total} 张）
            </span>
            <button
              className="page-btn"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              下一页 →
            </button>
          </div>
        )}
      </div>

      {showUploader && (
        <ImageUploader
          onUploadSuccess={handleUploadSuccess}
          onClose={handleUploaderClose}
        />
      )}

      {previewImage && (
        <ImagePreview
          image={previewImage}
          onInsert={doInsertImage}
          onDelete={doDeleteImage}
          onClose={handlePreviewClose}
        />
      )}
    </div>
  );
};

export default ImageManager;
