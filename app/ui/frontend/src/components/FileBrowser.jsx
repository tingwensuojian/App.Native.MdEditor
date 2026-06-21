import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderOpen, ChevronRight, ChevronDown, Plus, X } from 'lucide-react';
import AnimatedList from './AnimatedList';
import './FileBrowser.css';

const FileBrowser = ({ rootDirs, theme, onPathSelect, selectedPath }) => {
  const [selectedRootDir, setSelectedRootDir] = useState(null);
  const [directoryTree, setDirectoryTree] = useState([]);
  const [expandedDirs, setExpandedDirs] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (rootDirs && rootDirs.length > 0) {
      const firstDir = rootDirs[0];
      setSelectedRootDir(firstDir);
      loadDirectoryTree(firstDir.path);
      // 默认选中根目录
      onPathSelect(firstDir.path);
    }
  }, [rootDirs]);

  // 递归加载目录树
  const loadDirectoryTree = async (rootPath) => {
    try {
      setLoading(true);
      setError('');
      
      const tree = await loadDirectoryRecursive(rootPath);
      setDirectoryTree(tree);
    } catch (err) {
      setError('加载目录失败');
      console.error('Load directory tree error:', err);
    } finally {
      setLoading(false);
    }
  };

  // 递归加载目录及其子目录
  const loadDirectoryRecursive = async (dirPath) => {
    try {
      const response = await fetch(`api/files?path=${encodeURIComponent(dirPath)}`);
      const data = await response.json();
      
      if (data.ok && data.items) {
        const dirs = data.items.filter(item => item.type === 'directory');
        
        // 为每个目录添加 children 属性，但不立即加载
        return dirs.map(dir => ({
          ...dir,
          children: null, // null 表示未加载，[] 表示已加载但为空
          hasChildren: true // 假设所有目录都可能有子目录
        }));
      }
      return [];
    } catch (err) {
      console.error('Load directory error:', err);
      return [];
    }
  };

  // 加载子目录
  const loadSubDirectory = async (dirPath) => {
    try {
      const response = await fetch(`api/files?path=${encodeURIComponent(dirPath)}`);
      const data = await response.json();
      
      if (data.ok && data.items) {
        const dirs = data.items.filter(item => item.type === 'directory');
        return dirs.map(dir => ({
          ...dir,
          children: null,
          hasChildren: true
        }));
      }
      return [];
    } catch (err) {
      console.error('Load subdirectory error:', err);
      return [];
    }
  };

  // 更新树中的节点
  const updateTreeNode = (nodes, targetPath, children) => {
    return nodes.map(node => {
      if (node.path === targetPath) {
        return { ...node, children, hasChildren: children.length > 0 };
      }
      if (node.children) {
        return { ...node, children: updateTreeNode(node.children, targetPath, children) };
      }
      return node;
    });
  };

  const doSelectRootDirectory = (dir) => {
    setSelectedRootDir(dir);
    loadDirectoryTree(dir.path);
    setExpandedDirs(new Set());
    onPathSelect(dir.path);
  };

  const handleRootDirClick = (dir) => {
    doSelectRootDirectory(dir);
  };

  const handleToggleExpand = async (e, dir) => {
    e.stopPropagation();
    
    const newExpanded = new Set(expandedDirs);
    
    if (expandedDirs.has(dir.path)) {
      // 折叠
      newExpanded.delete(dir.path);
    } else {
      // 展开
      newExpanded.add(dir.path);
      
      // 如果子目录未加载，则加载
      if (dir.children === null) {
        const children = await loadSubDirectory(dir.path);
        setDirectoryTree(prevTree => updateTreeNode(prevTree, dir.path, children));
      }
    }
    
    setExpandedDirs(newExpanded);
  };

  const doSelectDirectory = (dir) => {
    onPathSelect(dir.path);
  };

  const handleDirClick = (dir) => {
    doSelectDirectory(dir);
  };

  const doOpenNewFolderDialog = (parentPath) => {
    setNewFolderParent(parentPath);
    setNewFolderName('');
    setShowNewFolderDialog(true);
    setError('');
  };

  const handleNewFolderClick = (parentPath) => {
    doOpenNewFolderDialog(parentPath);
  };

  const doCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setError('请输入文件夹名称');
      return;
    }

    try {
      const folderPath = `${newFolderParent}/${newFolderName.trim()}`;
      
      const response = await fetch('api/folder/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath })
      });

      const data = await response.json();

      if (data.ok) {
        setShowNewFolderDialog(false);
        setNewFolderName('');
        setError('');
        
        // 重新加载目录树
        if (selectedRootDir) {
          loadDirectoryTree(selectedRootDir.path);
        }
      } else {
        setError(data.message || '创建文件夹失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
      console.error('Create folder error:', err);
    }
  };

  const handleOverlayClick = () => {
    setShowNewFolderDialog(false);
  };

  const handleCloseClick = () => {
    setShowNewFolderDialog(false);
  };

  const handleCancelClick = () => {
    setShowNewFolderDialog(false);
  };

  const handleConfirmClick = () => {
    doCreateFolder();
  };

  const renderDirectoryTree = (dirs, depth = 0) => {
    if (!dirs || dirs.length === 0) return null;

    return dirs.map((dir, index) => {
      const isExpanded = expandedDirs.has(dir.path);
      const isSelected = selectedPath === dir.path;
      const hasChildren = dir.hasChildren && dir.children !== null && dir.children.length > 0;

      return (
        <div key={dir.path} className="directory-item" style={{ '--item-index': index }}>
          <div 
            className={`directory-node ${isSelected ? 'selected' : ''}`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => handleDirClick(dir)}
          >
            {dir.hasChildren && (
              <button 
                className="expand-button"
                onClick={(e) => handleToggleExpand(e, dir)}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            )}
            {!dir.hasChildren && <span className="expand-placeholder"></span>}
            
            {isExpanded ? <FolderOpen size={28} className="folder-icon" /> : <Folder size={28} className="folder-icon" />}
            <span className="directory-name">{dir.name}</span>
          </div>
          
          {isExpanded && hasChildren && (
            <div className="directory-children">
              {renderDirectoryTree(dir.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className={`file-browser theme-${theme}`}>
      <div className="file-browser-sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">我的文件</span>
        </div>
        <div className="root-directories">
          <AnimatedList delay={50}>
            {rootDirs && rootDirs.map(dir => (
              <div
                key={dir.path}
                className={`root-directory ${selectedRootDir?.path === dir.path ? 'selected' : ''}`}
                onClick={() => handleRootDirClick(dir)}
              >
                <Folder size={28} className="folder-icon" />
                <span className="directory-name">{dir.name}</span>
              </div>
            ))}
          </AnimatedList>
        </div>
      </div>
      
      <div className="file-browser-content">
        <div className="content-header">
          <span className="content-title">{selectedRootDir?.name || '请选择目录'}</span>
          <button 
            className="btn-new-folder"
            onClick={() => handleNewFolderClick(selectedPath || selectedRootDir?.path)}
            disabled={!selectedRootDir}
            title="新建文件夹"
          >
            <Plus size={16} />
            新建文件夹
          </button>
        </div>
        
        {loading && (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <span>加载中...</span>
          </div>
        )}
        
        {error && !showNewFolderDialog && (
          <div className="error-message">{error}</div>
        )}
        
        {!loading && !error && directoryTree.length === 0 && (
          <div className="empty-state">
            <Folder size={48} className="empty-icon" />
            <span className="empty-text">此目录为空</span>
            <button 
              className="btn-secondary btn-sm"
              onClick={() => handleNewFolderClick(selectedPath || selectedRootDir?.path)}
            >
              创建第一个文件夹
            </button>
          </div>
        )}
        
        {!loading && !error && directoryTree.length > 0 && (
          <div className="directory-tree">
            <AnimatedList delay={30}>
              {renderDirectoryTree(directoryTree)}
            </AnimatedList>
          </div>
        )}
      </div>

      {showNewFolderDialog && createPortal(
        <div className={`new-folder-overlay theme-${theme || 'light'}`} onClick={handleOverlayClick}>
          <div className="new-folder-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>新建文件夹</h3>
              <button className="dialog-close" onClick={handleCloseClick}>
                <X size={20} />
              </button>
            </div>
            <div className="dialog-body">
              <div className="form-group">
                <label>文件夹名称</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleConfirmClick()}
                  placeholder="输入文件夹名称"
                  className="form-input"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>父目录</label>
                <div className="parent-path">{newFolderParent}</div>
              </div>
              {error && <div className="error-message">{error}</div>}
            </div>
            <div className="dialog-footer">
              <button className="btn-secondary" onClick={handleCancelClick}>取消</button>
              <button className="btn-primary" onClick={handleConfirmClick} disabled={!newFolderName.trim()}>
                创建
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default FileBrowser;
