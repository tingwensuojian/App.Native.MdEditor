import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import FileBrowser from './FileBrowser';
import './SaveAsDialog.css';

const SaveAsDialog = ({ onClose, onConfirm, rootDirs, currentPath, theme, isSaveAs = true, initialFileName = '' }) => {
  const [fileName, setFileName] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [targetPath, setTargetPath] = useState('');
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // 设置文件名：保留用户输入/当前文件的后缀
    if (initialFileName) {
      // 从 NewFileDialog 传递过来的文件名（可带后缀）
      setFileName(initialFileName);
    } else if (currentPath) {
      // 从当前路径提取文件名（保留原后缀）
      const pathParts = currentPath.split('/');
      const currentFileName = pathParts[pathParts.length - 1];
      setFileName(currentFileName);
    }
  }, [rootDirs, currentPath, initialFileName]);

  const ensureDefaultExtension = (rawFileName) => {
    const trimmed = rawFileName.trim();
    if (!trimmed) return '';

    // 仅当用户未填写后缀时，默认补 .md
    const hasExtension = /\.[^./\\]+$/.test(trimmed);
    return hasExtension ? trimmed : `${trimmed}.md`;
  };

  const validateFileName = (rawFileName) => {
    const trimmed = rawFileName.trim();
    if (!trimmed) return '请输入文件名';

    // 禁止目录分隔符与常见非法字符
    if (/[\\/]/.test(trimmed)) {
      return '文件名不能包含 / 或 \\';
    }
    if (/[<>:"|?*]/.test(trimmed)) {
      return '文件名包含非法字符：< > : " | ? *';
    }

    // 禁止以点结尾（例如 "test."）
    if (trimmed.endsWith('.')) {
      return '文件名不能以点号结尾';
    }

    const finalName = ensureDefaultExtension(trimmed);
    if (!/\.[^./\\]+$/.test(finalName)) {
      return '后缀格式无效，请检查文件名';
    }

    return '';
  };

  const checkFileExists = async (path) => {
    try {
      const response = await fetch(`api/file?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      return data.ok; // 如果文件存在，返回 true
    } catch (err) {
      return false;
    }
  };

  const handlePathSelect = (path) => {
    setSelectedPath(path);
  };

  const saveToSelectedPath = async () => {
    const fileNameError = validateFileName(fileName);
    if (fileNameError) {
      setError(fileNameError);
      return;
    }

    if (!selectedPath) {
      setError('请选择保存位置');
      return;
    }

    // 用户可自定义后缀；未填写后缀时默认补 .md
    const finalFileName = ensureDefaultExtension(fileName);

    // 构建完整路径
    const fullPath = `${selectedPath}/${finalFileName}`;

    // 检查是否与当前文件相同
    if (fullPath === currentPath) {
      setError('目标路径与当前文件相同，请使用"保存"功能');
      return;
    }

    setLoading(true);
    setError('');

    // 检查文件是否已存在
    const exists = await checkFileExists(fullPath);
    
    if (exists) {
      // 文件已存在，显示覆盖确认
      setTargetPath(fullPath);
      setShowOverwriteConfirm(true);
      setLoading(false);
    } else {
      // 文件不存在，直接保存
      await performSaveAs(fullPath);
    }
  };

  const requestClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      requestClose();
    }, 180);
  }, [isClosing, onClose]);

  const performSaveAs = async (path) => {
    setLoading(true);
    setError('');

    try {
      onConfirm(path);
      requestClose();
    } catch (err) {
      setError('保存失败，请重试');
      console.error('Save as error:', err);
    } finally {
      setLoading(false);
    }
  };

  const confirmOverwriteSave = () => {
    setShowOverwriteConfirm(false);
    performSaveAs(targetPath);
  };

  const cancelOverwriteSave = () => {
    setShowOverwriteConfirm(false);
    setTargetPath('');
    setLoading(false);
  };

  const handleOverlayClick = () => {
    requestClose();
  };

  const handleCloseClick = () => {
    requestClose();
  };

  const handleCancelClick = () => {
    if (showOverwriteConfirm) {
      cancelOverwriteSave();
      return;
    }
    requestClose();
  };

  const handleConfirmClick = () => {
    if (showOverwriteConfirm) {
      confirmOverwriteSave();
      return;
    }
    saveToSelectedPath();
  };

  const getFullPath = () => {
    if (!selectedPath || !fileName.trim()) {
      return '';
    }
    const finalFileName = ensureDefaultExtension(fileName);
    return `${selectedPath}/${finalFileName}`;
  };

  return (
    <div className={`dialog-overlay compact-panel-overlay save-as-dialog-overlay theme-${theme} ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div
        className={`dialog-container compact-panel-dialog save-as-dialog ${showOverwriteConfirm ? 'overwrite-mode' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2>{isSaveAs ? '另存为' : '保存到'}</h2>
          <button className="dialog-close" onClick={handleCloseClick}>×</button>
        </div>

        <div className="dialog-body">
          {!showOverwriteConfirm ? (
            <div className="save-as-form">
              <div className="file-browser-container">
                <FileBrowser 
                  rootDirs={rootDirs}
                  theme={theme}
                  onPathSelect={handlePathSelect}
                  selectedPath={selectedPath}
                />
              </div>

              {error && <div className="error-message">{error}</div>}
            </div>
          ) : (
            <div className="overwrite-confirm">
              <div className="confirm-icon"><AlertTriangle size={48} /></div>
              <h3>文件已存在</h3>
              <p>目标位置已存在同名文件：</p>
              <div className="confirm-path">{targetPath}</div>
              <p>是否要覆盖现有文件？</p>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          {!showOverwriteConfirm ? (
            <>
              <div className="footer-left">
                <div className="file-name-input-footer">
                  <input
                    type="text"
                    value={fileName}
                    onChange={(e) => {
                      setFileName(e.target.value)
                      if (error) setError('')
                    }}
                    onKeyPress={(e) => e.key === 'Enter' && handleConfirmClick()}
                    placeholder="输入文件名"
                    className="form-input"
                    autoFocus
                  />
                  <span className="file-extension">默认 .md（可改后缀）</span>
                </div>
              </div>
              <div className="footer-right">
                <button className="btn-secondary" onClick={handleCancelClick}>取消</button>
                <button 
                  className="btn-primary" 
                  onClick={handleConfirmClick}
                  disabled={loading || !fileName.trim() || !selectedPath}
                >
                  {loading ? '保存中...' : (isSaveAs ? '另存为' : '保存')}
                </button>
              </div>
            </>
          ) : (
            <>
              <button className="btn-secondary" onClick={handleCancelClick}>取消</button>
              <button className="btn-danger" onClick={handleConfirmClick}>
                覆盖
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SaveAsDialog;
