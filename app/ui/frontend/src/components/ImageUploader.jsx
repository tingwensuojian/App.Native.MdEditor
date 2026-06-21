import React, { useState, useRef } from 'react';
import { Upload, X, Image, AlertTriangle } from 'lucide-react';
import './ImageUploader.css';

const ImageUploader = ({ onUploadSuccess, onClose }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length > 0) {
      uploadFiles(imageFiles);
    } else {
      setError('请拖拽图片文件');
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      uploadFiles(files);
    }
  };

  const uploadFiles = async (files) => {
    setError('');
    setUploading(true);
    setProgress(0);
    let hasUploadError = false;
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // 验证文件类型（支持 HEIC/HEIF）
      const isImage = file.type.startsWith('image/');
      const isHEIC = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
      
      if (!isImage && !isHEIC) {
        hasUploadError = true;
        setError(`${file.name} 不是图片文件`);
        continue;
      }

      // 验证文件大小（10MB）
      if (file.size > 10 * 1024 * 1024) {
        hasUploadError = true;
        setError(`${file.name} 超过 10MB 限制`);
        continue;
      }

      try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('api/image/upload', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();

        if (response.ok && result.ok) {
          successCount += 1;
          setProgress(((i + 1) / files.length) * 100);
          if (onUploadSuccess && result.images && result.images.length > 0) {
            // 后端返回的是 images 数组，取第一个图片
            onUploadSuccess(result.images[0]);
          }
        } else {
          hasUploadError = true;
          console.error('Upload failed:', response.status, result);
          setError(result.message || `上传失败 (${response.status})`);
        }
      } catch (err) {
        hasUploadError = true;
        console.error('Upload error:', err);
        setError('上传失败：' + err.message);
      }
    }

    setUploading(false);
    setProgress(0);
    
    // 只有本次全部成功且至少成功上传 1 个文件时才自动关闭
    if (successCount > 0 && !hasUploadError && onClose) {
      setTimeout(() => {
        onClose();
      }, 500);
    }
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData.items;
    const imageItems = [];

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageItems.push(items[i].getAsFile());
      }
    }

    if (imageItems.length > 0) {
      uploadFiles(imageItems);
    }
  };

  const handleOverlayClick = () => {
    onClose();
  };

  const handleCloseClick = () => {
    onClose();
  };

  const doOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleSelectFileClick = () => {
    doOpenFilePicker();
  };

  return (
    <div className="image-uploader-overlay" onClick={handleOverlayClick}>
      <div className="image-uploader-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="image-uploader-header">
          <h3><Upload size={20} /> 上传图片</h3>
          <button className="close-btn" onClick={handleCloseClick}><X size={20} /></button>
        </div>

        <div className="image-uploader-body">
          <div
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onPaste={handlePaste}
            tabIndex={0}
          >
            {uploading ? (
              <div className="upload-progress">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                </div>
                <p>上传中... {Math.round(progress)}%</p>
              </div>
            ) : (
              <>
                <div className="drop-zone-icon"><Image size={64} /></div>
                <p className="drop-zone-text">拖拽图片到这里</p>
                <p className="drop-zone-or">或</p>
                <button
                  className="select-file-btn"
                  onClick={handleSelectFileClick}
                >
                  选择文件
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.heic,.heif"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                <p className="drop-zone-hint">支持 JPG, PNG, GIF, WebP, HEIC（最大 10MB）</p>
              </>
            )}
          </div>

          {error && (
            <div className="upload-error">
              <AlertTriangle size={16} /> {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageUploader;
