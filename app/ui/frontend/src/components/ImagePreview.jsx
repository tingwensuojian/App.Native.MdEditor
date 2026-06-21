import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, Copy, Plus, Download, Trash2 } from 'lucide-react';
import './ImagePreview.css';
import { useAppUi } from '../context/AppUiContext';

const ImagePreview = ({ image, onInsert, onDelete, onClose }) => {
  const { showToast } = useAppUi();
  const [scale, setScale] = useState(1);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.max(0.5, Math.min(3, prev + delta)));
  };

  const doZoomIn = () => {
    setScale(prev => Math.min(3, prev + 0.2));
  };

  const doZoomOut = () => {
    setScale(prev => Math.max(0.5, prev - 0.2));
  };

  const doResetZoom = () => {
    setScale(1);
  };

  const doCopyImageLink = () => {
    navigator.clipboard.writeText(image.url);
    showToast('链接已复制到剪贴板', 'success');
  };

  const doDownloadImage = () => {
    const a = document.createElement('a');
    a.href = image.url;
    a.download = image.filename;
    a.click();
  };

  const doInsertImage = () => {
    onInsert(image);
  };

  const doDeleteImage = () => {
    onDelete(image);
    onClose();
  };

  const handleOverlayClick = () => {
    onClose();
  };

  const handleCloseClick = () => {
    onClose();
  };

  const handleZoomInClick = () => {
    doZoomIn();
  };

  const handleZoomOutClick = () => {
    doZoomOut();
  };

  const handleResetClick = () => {
    doResetZoom();
  };

  const handleCopyLinkClick = () => {
    doCopyImageLink();
  };

  const handleDownloadClick = () => {
    doDownloadImage();
  };

  const handleInsertClick = () => {
    doInsertImage();
  };

  const handleDeleteClick = () => {
    doDeleteImage();
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN');
  };

  return (
    <div className="image-preview-overlay" onClick={handleOverlayClick}>
      <div className="image-preview-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="image-preview-header">
          <div className="image-preview-title">{image.filename}</div>
          <button className="close-btn" onClick={handleCloseClick}><X size={20} /></button>
        </div>

        <div className="image-preview-body" onWheel={handleWheel}>
          <img
            src={image.url}
            alt={image.filename}
            style={{ transform: `scale(${scale})` }}
          />
        </div>

        <div className="image-preview-controls">
          <button className="control-btn" onClick={handleZoomOutClick} title="缩小">
            <ZoomOut size={18} />
          </button>
          <button className="control-btn" onClick={handleResetClick} title="重置">
            {Math.round(scale * 100)}%
          </button>
          <button className="control-btn" onClick={handleZoomInClick} title="放大">
            <ZoomIn size={18} />
          </button>
        </div>

        <div className="image-preview-footer">
          <div className="image-preview-info">
            {image.size && <span>{formatFileSize(image.size)}</span>}
            {image.uploadDate && <span>{formatDate(image.uploadDate)}</span>}
          </div>
          <div className="image-preview-actions">
            <button className="action-btn" onClick={handleCopyLinkClick}>
              <Copy size={16} /> 复制链接
            </button>
            <button className="action-btn" onClick={handleInsertClick}>
              <Plus size={16} /> 插入
            </button>
            <button className="action-btn" onClick={handleDownloadClick}>
              <Download size={16} /> 下载
            </button>
            <button className="action-btn delete-btn" onClick={handleDeleteClick}>
              <Trash2 size={16} /> 删除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImagePreview;
