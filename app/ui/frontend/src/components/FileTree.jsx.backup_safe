import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import FavoritesPanel from './FavoritesPanel';
import FileSearchBox from './FileSearchBox';
import ContextMenu from './ContextMenu';
import RenameDialog from './RenameDialog';
import NewFolderDialog from './NewFolderDialog';
import { filterFileTree, highlightMatches } from '../utils/fileSearcher';
import { useDebounce } from '../hooks/useDebounce';
import { toggleFavorite, isFavorite, updateFavoritePath } from '../utils/favoritesManager';
import './FileTree.css';

const FileTree = forwardRef(({ 
  onFileSelect, 
  currentPath,
  favorites,
  onOpenFavorite,
  onRemoveFavorite,
  onClearFavorites,
  onReorderFavorites
}, ref) => {
  const [tree, setTree] = useState([]);
  const [expanded, setExpanded] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);
  
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  
  // 重命名对话框状态
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameNode, setRenameNode] = useState(null);

  // 新建文件夹对话框状态
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderParent, setNewFolderParent] = useState(null);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    refreshDirectory: loadDirectory
  }));

  // 加载根目录
  useEffect(() => {
    loadDirectory('/');
  }, []);

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // 加载目录内容
  const loadDirectory = async (dirPath) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/files?path=${encodeURIComponent(dirPath)}`);
      const data = await response.json();
      
      if (!data.ok) {
        setError(data.message || '加载失败');
        return;
      }
      
      if (dirPath === '/') {
        // 根目录
        setTree(data.items);
      } else {
        // 更新树结构
        setTree(prevTree => updateTreeNode(prevTree, dirPath, data.items));
      }
    } catch (err) {
      setError('网络错误');
      console.error('Load directory error:', err);
    } finally {
      setLoading(false);
    }
  };

  // 更新树节点
  const updateTreeNode = (nodes, targetPath, children) => {
    return nodes.map(node => {
      if (node.path === targetPath) {
        return { ...node, children };
      }
      if (node.children) {
        return { ...node, children: updateTreeNode(node.children, targetPath, children) };
      }
      return node;
    });
  };

  // 切换目录展开/折叠
  const toggleDirectory = async (node) => {
    const newExpanded = new Set(expanded);
    
    if (expanded.has(node.path)) {
      // 折叠
      newExpanded.delete(node.path);
    } else {
      // 展开
      newExpanded.add(node.path);
      // 如果还没有加载子节点，则加载
      if (!node.children) {
        await loadDirectory(node.path);
      }
    }
    
    setExpanded(newExpanded);
  };

  // 处理文件点击
  const handleFileClick = (node) => {
    if (node.type === 'file') {
      onFileSelect(node.path);
    } else {
      toggleDirectory(node);
    }
  };

  // 处理右键菜单
  const handleContextMenu = (e, node) => {
    e.preventDefault();
    e.stopPropagation();
    
    setSelectedNode(node);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node
    });
  };

  // 处理空白区域右键菜单（显示根目录菜单）
  const handleEmptyAreaContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 如果有根目录，使用第一个根目录
    if (tree.length > 0 && tree[0].type === 'directory') {
      setSelectedNode(tree[0]);
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        node: tree[0]
      });
    }
  };

  // 右键菜单操作处理
  const handleMenuAction = async (action) => {
    if (!selectedNode) return;
    
    setContextMenu(null);
    
    switch (action) {
      case 'open':
        if (selectedNode.type === 'file') {
          onFileSelect(selectedNode.path);
        } else {
          toggleDirectory(selectedNode);
        }
        break;
        
      case 'rename':
        setRenameNode(selectedNode);
        setShowRenameDialog(true);
        break;
        
      case 'delete':
        await handleDelete(selectedNode);
        break;
        
      case 'copy':
        await handleCopy(selectedNode);
        break;
        
      case 'cut':
        await handleCut(selectedNode);
        break;
        
      case 'favorite':
        toggleFavorite(selectedNode.path, selectedNode.type);
        // 刷新收藏夹显示
        if (onReorderFavorites) {
          const { getFavorites } = await import('../utils/favoritesManager');
          onReorderFavorites(getFavorites());
        }
        break;
        
      case 'paste':
        if (selectedNode.type === 'directory') {
          await handlePaste(selectedNode);
        }
        break;
        
      case 'newfolder':
        if (selectedNode.type === 'directory') {
          setNewFolderParent(selectedNode);
          setShowNewFolderDialog(true);
        }
        break;
        
      case 'refresh':
        if (selectedNode.type === 'directory') {
          await loadDirectory(selectedNode.path);
        }
        break;
        
      case 'properties':
        handleShowProperties(selectedNode);
        break;
        
      default:
        break;
    }
    
    setSelectedNode(null);
  };

  // 重命名文件/文件夹
  const handleRename = async (newName) => {
    if (!renameNode) return;
    
    try {
      const oldPath = renameNode.path;
      const pathParts = oldPath.split('/');
      pathParts[pathParts.length - 1] = newName;
      const newPath = pathParts.join('/');
      
      const response = await fetch('/api/file/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newPath })
      });
      
      const data = await response.json();
      
      if (data.ok) {
        // 更新收藏夹中的路径
        updateFavoritePath(oldPath, newPath);
        if (onReorderFavorites) {
          const { getFavorites } = await import('../utils/favoritesManager');
          onReorderFavorites(getFavorites());
        }
        
        // 刷新父目录
        const parentPath = pathParts.slice(0, -1).join('/') || '/';
        await loadDirectory(parentPath);
        
        // 如果重命名的是当前打开的文件，更新路径
        if (currentPath === oldPath) {
          onFileSelect(newPath);
        }
      } else {
        alert(`重命名失败: ${data.message || data.code}`);
      }
    } catch (error) {
      console.error('Rename error:', error);
      alert('重命名失败: 网络错误');
    }
    
    setShowRenameDialog(false);
    setRenameNode(null);
  };

  // 新建文件夹
  const handleNewFolder = async (folderName) => {
    if (!newFolderParent) return;
    
    try {
      const newPath = `${newFolderParent.path}/${folderName}`;
      
      const response = await fetch('/api/folder/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newPath })
      });
      
      const data = await response.json();
      
      if (data.ok) {
        // 刷新父目录
        await loadDirectory(newFolderParent.path);
      } else {
        alert(`创建文件夹失败: ${data.message || data.code}`);
      }
    } catch (error) {
      console.error('Create folder error:', error);
      alert('创建文件夹失败: 网络错误');
    }
    
    setShowNewFolderDialog(false);
    setNewFolderParent(null);
  };

  // 删除文件/文件夹
  const handleDelete = async (node) => {
    const confirmMsg = node.type === 'directory' 
      ? `确定要删除文件夹 "${node.name}" 及其所有内容吗？`
      : `确定要删除文件 "${node.name}" 吗？`;
      
    if (!window.confirm(confirmMsg)) {
      return;
    }
    
    try {
      const response = await fetch('/api/file/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: node.path })
      });
      
      const data = await response.json();
      
      if (data.ok) {
        // 刷新父目录
        const pathParts = node.path.split('/');
        const parentPath = pathParts.slice(0, -1).join('/') || '/';
        await loadDirectory(parentPath);
        
        // 如果删除的是当前打开的文件，清空编辑器
        if (currentPath === node.path) {
          onFileSelect('');
        }
      } else {
        alert(`删除失败: ${data.message || data.code}`);
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('删除失败: 网络错误');
    }
  };

  // 复制文件/文件夹
  const handleCopy = async (node) => {
    try {
      // 将路径存储到剪贴板（使用 localStorage 模拟）
      localStorage.setItem('clipboard', JSON.stringify({
        action: 'copy',
        path: node.path,
        type: node.type
      }));
      
      // 显示提示
      const msg = node.type === 'directory' ? '文件夹已复制' : '文件已复制';
      console.log(msg);
    } catch (error) {
      console.error('Copy error:', error);
    }
  };

  // 剪切文件/文件夹
  const handleCut = async (node) => {
    try {
      // 将路径存储到剪贴板（使用 localStorage 模拟）
      localStorage.setItem('clipboard', JSON.stringify({
        action: 'cut',
        path: node.path,
        type: node.type
      }));
      
      // 显示提示
      const msg = node.type === 'directory' ? '文件夹已剪切' : '文件已剪切';
      console.log(msg);
    } catch (error) {
      console.error('Cut error:', error);
    }
  };

  // 粘贴文件/文件夹
  const handlePaste = async (targetNode) => {
    try {
      const clipboardData = localStorage.getItem('clipboard');
      if (!clipboardData) {
        alert('剪贴板为空');
        return;
      }
      
      const clipData = JSON.parse(clipboardData);
      const { action, path: sourcePath, type } = clipData;
      
      if (!sourcePath) {
        alert('剪贴板数据无效');
        return;
      }
      
      // 构建目标路径
      const fileName = sourcePath.split('/').pop();
      const targetPath = `${targetNode.path}/${fileName}`;
      
      // 检查是否粘贴到自己
      if (sourcePath === targetPath) {
        alert('不能粘贴到相同位置');
        return;
      }
      
      // 检查是否粘贴到子目录（避免循环）
      if (type === 'directory' && targetPath.startsWith(sourcePath + '/')) {
        alert('不能将文件夹粘贴到其子目录中');
        return;
      }
      
      const apiEndpoint = action === 'cut' ? '/api/file/move' : '/api/file/copy';
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath, targetPath })
      });
      
      const data = await response.json();
      
      if (data.ok) {
        // 如果是剪切，清空剪贴板
        if (action === 'cut') {
          localStorage.removeItem('clipboard');
        }
        
        // 刷新目标目录
        await loadDirectory(targetNode.path);
        
        // 如果是剪切，也刷新源目录
        if (action === 'cut') {
          const sourceParent = sourcePath.split('/').slice(0, -1).join('/') || '/';
          if (sourceParent !== targetNode.path) {
            await loadDirectory(sourceParent);
          }
        }
        
        const msg = action === 'cut' ? '移动成功' : '复制成功';
        alert(msg);
      } else {
        alert(`操作失败: ${data.message || data.code}`);
      }
    } catch (error) {
      console.error('Paste error:', error);
      alert('粘贴失败: 网络错误');
    }
  };

  // 显示属性
  const handleShowProperties = (node) => {
    const props = [
      `名称: ${node.name}`,
      `路径: ${node.path}`,
      `类型: ${node.type === 'directory' ? '文件夹' : '文件'}`
    ];
    
    if (node.size !== undefined) {
      props.push(`大小: ${formatFileSize(node.size)}`);
    }
    
    alert(props.join('\n'));
  };

  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // 过滤树节点（搜索）
  const filterTree = (nodes, query) => {
    return filterFileTree(nodes, query);
  };

  // 渲染高亮的文件名
  const renderHighlightedName = (name, query) => {
    const parts = highlightMatches(name, query);
    return (
      <>
        {parts.map((part, index) => (
          part.highlight ? (
            <mark key={index} className="tree-node-highlight">{part.text}</mark>
          ) : (
            <span key={index}>{part.text}</span>
          )
        ))}
      </>
    );
  };

  // 渲染树节点
  const renderNode = (node, level = 0) => {
    const isExpanded = expanded.has(node.path);
    const isActive = currentPath === node.path;
    const hasChildren = node.type === 'directory';
    const children = node.children || [];
    const isFav = isFavorite(node.path);

    return (
      <div key={node.path} className="tree-node">
        <div
          className={`tree-node-content ${isActive ? 'active' : ''}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => handleFileClick(node)}
          onContextMenu={(e) => handleContextMenu(e, node)}
        >
          {hasChildren && (
            <span className={`tree-node-icon ${isExpanded ? 'expanded' : ''}`}>
              ▶
            </span>
          )}
          {!hasChildren && <span className="tree-node-icon">📄</span>}
          <span className="tree-node-name" title={node.path}>
            {debouncedQuery ? renderHighlightedName(node.name, debouncedQuery) : node.name}
          </span>
          {isFav && <span className="tree-node-favorite" title="已收藏">★</span>}
        </div>
        
        {hasChildren && isExpanded && children.length > 0 && (
          <div className="tree-node-children">
            {children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const filteredTree = filterTree([...tree], debouncedQuery);

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <h3>文件</h3>
        <FileSearchBox
          value={searchQuery}
          onChange={setSearchQuery}
          onSearch={setSearchQuery}
        />
      </div>
      
      <FavoritesPanel
        favorites={favorites || []}
        onOpenFavorite={onOpenFavorite}
        onRemoveFavorite={onRemoveFavorite}
        onClearFavorites={onClearFavorites}
        onReorderFavorites={onReorderFavorites}
        currentPath={currentPath}
      />
      
      <div className="file-tree-content" onContextMenu={handleEmptyAreaContextMenu}>
        {loading && tree.length === 0 && (
          <div className="file-tree-loading">加载中...</div>
        )}
        
        {error && (
          <div className="file-tree-error">{error}</div>
        )}
        
        {!loading && !error && filteredTree.length === 0 && (
          <div className="file-tree-empty">
            {searchQuery ? '未找到匹配的文件' : '暂无文件'}
          </div>
        )}
        
        {filteredTree.map(node => renderNode(node))}
      </div>
      
      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onAction={handleMenuAction}
          onClose={() => setContextMenu(null)}
        />
      )}
      
      {/* 重命名对话框 */}
      {showRenameDialog && renameNode && (
        <RenameDialog
          node={renameNode}
          onConfirm={handleRename}
          onCancel={() => {
            setShowRenameDialog(false);
            setRenameNode(null);
          }}
        />
      )}
      
      {/* 新建文件夹对话框 */}
      {showNewFolderDialog && newFolderParent && (
        <NewFolderDialog
          parentPath={newFolderParent.path}
          onConfirm={handleNewFolder}
          onCancel={() => {
            setShowNewFolderDialog(false);
            setNewFolderParent(null);
          }}
        />
      )}
    </div>
  );
});

FileTree.displayName = 'FileTree';

export default FileTree;
