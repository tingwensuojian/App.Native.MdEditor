import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, File, Folder, Star, FileText, FileJson, MoreHorizontal, Image } from 'lucide-react';
import FavoritesPanel from './FavoritesPanel';
import FileSearchBox from './FileSearchBox';
import OutlinePanel from './OutlinePanel';
import HistoryPanel from './HistoryPanel';
import ContextMenu from './ContextMenu';
import RenameDialog from './RenameDialog';
import NewFolderDialog from './NewFolderDialog';
import FilePropertiesDialog from './FilePropertiesDialog';
import AnimatedList from './AnimatedList';
import { filterFileTree, highlightMatches } from '../utils/fileSearcher';
import { useDebounce } from '../hooks/useDebounce';
import { toggleFavorite, getFavorites, updateFavoritePath } from '../utils/favoritesManager';
import { loadSetting, parseStoredArray, persistSetting } from '../utils/settingsApi';
import { useAppUi } from '../context/AppUiContext';
import { getFormatFromPath, getFormatColorClass, FORMAT_IMAGE } from '../constants/fileFormats';
import './FileTree.css';

const FileTree = forwardRef(({ 
  onFileSelect, 
  currentPath,
  favorites,
  onOpenFavorite,
  onRemoveFavorite,
  onClearFavorites,
  onReorderFavorites,
  content,
  onHeadingClick,
  onVersionRestore,
  style,
  theme = 'light',
  compactInteractionMode = false
}, ref) => {
  const { showToast, requestConfirm } = useAppUi();
  const FILE_TREE_TABS = ['files', 'outline', 'history'];
  const [activeTab, setActiveTab] = useState('files'); // 'files', 'outline', 'history'
  const [tree, setTree] = useState([]);
  const [expanded, setExpanded] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedDirectoryPath, setFocusedDirectoryPath] = useState(null);
  const [touchPreviewPath, setTouchPreviewPath] = useState(null);
  const [longPressFeedbackPath, setLongPressFeedbackPath] = useState(null);
  const [toggleFeedbackPath, setToggleFeedbackPath] = useState(null);
  const debouncedQuery = useDebounce(searchQuery, 300);
  const pendingExpandPathsRef = useRef(new Set());
  const activeTabHydratedRef = useRef(false);
  const expandedHydratedRef = useRef(false);
  const expandedSaveTimerRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressFeedbackTimerRef = useRef(null);
  const toggleFeedbackTimerRef = useRef(null);
  const longPressStateRef = useRef({
    pointerId: null,
    nodePath: null,
    startX: 0,
    startY: 0,
    fired: false
  });
  const suppressClickPathRef = useRef(null);
  const createFolderRootRef = useRef(null); // 空白处新建文件夹的父目录（mdeditor）

  const handleSearchQueryChange = (nextQuery) => {
    setSearchQuery(nextQuery);
  };
  
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const safeFavorites = Array.isArray(favorites) ? favorites : [];

  useEffect(() => {
    const loadActiveTab = async () => {
      try {
        const savedTab = await loadSetting('fileTreeActiveTab', 'files');
        if (FILE_TREE_TABS.includes(savedTab)) {
          setActiveTab(savedTab);
        }
      } catch (error) {
        console.error('[FileTree] Failed to load active tab:', error);
      } finally {
        activeTabHydratedRef.current = true;
      }
    };

    loadActiveTab();
  }, []);

  useEffect(() => {
    if (!activeTabHydratedRef.current || !FILE_TREE_TABS.includes(activeTab)) {
      return;
    }

    persistSetting('fileTreeActiveTab', activeTab).catch((error) => {
      console.error('[FileTree] Failed to save active tab:', error);
    });
  }, [activeTab]);

  useEffect(() => {
    if (!expandedHydratedRef.current) {
      return undefined;
    }

    if (expandedSaveTimerRef.current) {
      clearTimeout(expandedSaveTimerRef.current);
    }

    expandedSaveTimerRef.current = setTimeout(() => {
      persistSetting('fileTreeExpandedPaths', Array.from(expanded)).catch((error) => {
        console.error('Failed to save expanded folders:', error);
      });
    }, 300);

    return () => {
      if (expandedSaveTimerRef.current) {
        clearTimeout(expandedSaveTimerRef.current);
      }
    };
  }, [expanded]);
  // 重命名对话框状态
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameNode, setRenameNode] = useState(null);

  // 新建文件夹对话框状态
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderParent, setNewFolderParent] = useState(null);

  // 文件属性对话框状态
  const [showPropertiesDialog, setShowPropertiesDialog] = useState(false);
  const [propertiesNode, setPropertiesNode] = useState(null);

  // 格式化文件大小显示
  const formatFileSize = (bytes) => {
    if (bytes === undefined || bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  // 格式化修改时间显示（简洁版）
  const formatModifyTime = (mtimeMs) => {
    if (!mtimeMs) return '';
    const date = new Date(mtimeMs);
    const now = new Date();
    const diff = now - date;
    
    // 今天内只显示时间
    if (diff < 24 * 60 * 60 * 1000) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    // 今年内显示月日
    if (date.getFullYear() === now.getFullYear()) {
      return `${date.getMonth() + 1}/${date.getDate()}`;
    }
    // 往年显示完整日期
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  };

  const openContextMenuAt = (x, y, node = null, type = undefined) => {
    setSelectedNode(node || null);
    setContextMenu({
      x,
      y,
      node: node
        ? {
            ...node,
            isFavorite: safeFavorites.some(item => item.path === node.path)
          }
        : null,
      type
    });
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const clearLongPressFeedbackTimer = () => {
    if (longPressFeedbackTimerRef.current) {
      clearTimeout(longPressFeedbackTimerRef.current);
      longPressFeedbackTimerRef.current = null;
    }
  };

  const clearToggleFeedbackTimer = () => {
    if (toggleFeedbackTimerRef.current) {
      clearTimeout(toggleFeedbackTimerRef.current);
      toggleFeedbackTimerRef.current = null;
    }
  };

  const triggerLongPressFeedback = (path) => {
    clearLongPressFeedbackTimer();
    setLongPressFeedbackPath(path);
    longPressFeedbackTimerRef.current = setTimeout(() => {
      setLongPressFeedbackPath(null);
      longPressFeedbackTimerRef.current = null;
    }, 360);

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(12);
    }
  };

  const triggerToggleFeedback = (path) => {
    clearToggleFeedbackTimer();
    setToggleFeedbackPath(path);
    toggleFeedbackTimerRef.current = setTimeout(() => {
      setToggleFeedbackPath(null);
      toggleFeedbackTimerRef.current = null;
    }, 260);
  };

  const resetLongPressState = () => {
    clearLongPressTimer();
    setTouchPreviewPath(null);
    longPressStateRef.current = {
      pointerId: null,
      nodePath: null,
      startX: 0,
      startY: 0,
      fired: false
    };
  };

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    refreshDirectory: loadDirectory,
    expandToPath: expandToPath
  }));

  // 展开到指定路径
  const expandToPath = async (targetPath) => {
    console.log('[FileTree] expandToPath called with:', targetPath)
    
    // 解析路径，获取所有父级目录
    const pathParts = targetPath.split('/').filter(Boolean)
    const newExpanded = new Set(expanded)
    
    // 逐级展开父目录
    let currentPath = ''
    let currentTree = tree
    
    for (let i = 0; i < pathParts.length - 1; i++) {
      currentPath += '/' + pathParts[i]
      newExpanded.add(currentPath)
      console.log('[FileTree] Expanding path:', currentPath)
      
      // 加载该目录（如果还没加载）
      const node = findNodeByPath(currentTree, currentPath)
      if (node && !node.children) {
        console.log('[FileTree] Loading directory:', currentPath)
        const success = await loadDirectory(currentPath)
        if (success) {
          // 等待一小段时间让状态更新
          await new Promise(resolve => setTimeout(resolve, 50))
          // 获取更新后的树（通过重新查找根节点）
          currentTree = await new Promise(resolve => {
            setTree(prevTree => {
              resolve(prevTree)
              return prevTree
            })
          })
        }
      }
    }
    
    console.log('[FileTree] Setting expanded paths:', Array.from(newExpanded))
    setExpanded(newExpanded)
    
    // 等待展开状态更新后滚动到目标节点
    setTimeout(() => {
      const targetElement = document.querySelector(`[data-path="${targetPath}"]`)
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
  }

  // 在树中查找节点
  const findNodeByPath = (nodes, targetPath) => {
    for (const node of nodes) {
      if (node.path === targetPath) {
        return node
      }
      if (node.children) {
        const found = findNodeByPath(node.children, targetPath)
        if (found) return found
      }
    }
    return null
  }

  // 加载根目录并恢复展开状态
  useEffect(() => {
    const initializeTree = async () => {
      let restoredExpanded = new Set();

      try {
        const savedExpanded = await loadSetting('fileTreeExpandedPaths', []);
        restoredExpanded = new Set(
          parseStoredArray(savedExpanded, []).filter((path) => typeof path === 'string' && path)
        );
        setExpanded(restoredExpanded);
      } catch (error) {
        console.error('[FileTree] Failed to load expanded folders:', error);
      } finally {
        expandedHydratedRef.current = true;
      }

      // 先加载根目录
      await loadDirectory('/');
      
      // 如果有持久化的展开状态，逐级加载这些文件夹
      if (restoredExpanded.size > 0) {
        // 获取当前合法的根目录列表
        let validRoots = [];
        try {
          const resp = await fetch('api/files?path=/');
          const data = await resp.json();
          if (data.ok) validRoots = data.items.map(item => item.path);
        } catch (e) {}

        // 过滤掉不在任何合法根目录下的路径
        const filteredPaths = Array.from(restoredExpanded).filter(p =>
          validRoots.some(root => p === root || p.startsWith(root + '/'))
        );

        if (filteredPaths.length !== restoredExpanded.size) {
          setExpanded(new Set(filteredPaths));
          restoredExpanded = new Set(filteredPaths);
        }

        console.log('[FileTree] Restoring expanded folders:', filteredPaths);
        
        // 将路径按层级排序（浅到深）
        const sortedPaths = filteredPaths.sort((a, b) => {
          const depthA = a.split('/').filter(Boolean).length;
          const depthB = b.split('/').filter(Boolean).length;
          return depthA - depthB;
        });
        
        // 逐级加载每个展开的文件夹
        for (const path of sortedPaths) {
          try {
            await loadDirectory(path);
            console.log('[FileTree] Loaded expanded folder:', path);
          } catch (error) {
            console.error('[FileTree] Failed to load folder:', path, error);
          }
        }
      }
    };
    
    initializeTree();
  }, []); // 只在组件挂载时执行一次

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => () => {
    clearLongPressTimer();
    clearLongPressFeedbackTimer();
    clearToggleFeedbackTimer();
  }, []);

  useEffect(() => {
    if (!compactInteractionMode) {
      setFocusedDirectoryPath(null);
    }
  }, [compactInteractionMode]);

  // 加载目录内容
  const loadDirectory = async (dirPath) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`api/files?path=${encodeURIComponent(dirPath)}`);
      const data = await response.json();
      
      if (!data.ok) {
        setError(data.message || '加载失败');
        return false;
      }
      
      if (dirPath === '/') {
        // 根目录
        setTree(data.items);
        createFolderRootRef.current = data.createFolderRoot || null;
      } else {
        // 更新树结构
        setTree(prevTree => updateTreeNode(prevTree, dirPath, data.items));
      }
      
      return true;
    } catch (err) {
      setError('网络错误');
      console.error('Load directory error:', err);
      return false;
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
    const { path } = node;

    if (pendingExpandPathsRef.current.has(path)) {
      return;
    }

    if (expanded.has(path)) {
      // 折叠：使用函数式更新，避免和异步展开竞争
      setExpanded(prevExpanded => {
        const nextExpanded = new Set(prevExpanded);
        nextExpanded.delete(path);
        return nextExpanded;
      });
      return;
    }

    pendingExpandPathsRef.current.add(path);

    try {
      // 展开：如果需要加载数据，先加载再更新状态
      if (!node.children) {
        const loaded = await loadDirectory(path);
        if (!loaded) {
          return;
        }
      }

      setExpanded(prevExpanded => {
        const nextExpanded = new Set(prevExpanded);
        nextExpanded.add(path);
        return nextExpanded;
      });
    } finally {
      pendingExpandPathsRef.current.delete(path);
    }
  };

  const doOpenNode = (node) => {
    if (node.type === 'file') {
      setFocusedDirectoryPath(null);
      onFileSelect(node.path, node);
    } else {
      if (compactInteractionMode) {
        setFocusedDirectoryPath(node.path);
        return;
      }
      toggleDirectory(node);
    }
  };

  // 处理文件点击
  const handleFileClick = (e, node) => {
    if (suppressClickPathRef.current === node.path) {
      suppressClickPathRef.current = null;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    doOpenNode(node);
  };

  // 处理右键菜单
  const handleContextMenu = (e, node) => {
    e.preventDefault();
    e.stopPropagation();

    openContextMenuAt(e.clientX, e.clientY, node);
  };

  // 处理文件树头部右键菜单
  const handleHeaderContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();

    openContextMenuAt(e.clientX, e.clientY, null, 'header');
  };

  // 处理空白区域右键菜单：显示头部菜单，新建文件夹时父级为 mdeditor 根目录
  const handleEmptyAreaContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenuAt(e.clientX, e.clientY, null, 'header');
  };

  const handleHeaderMenuButtonClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    openContextMenuAt(rect.right - 4, rect.bottom + 6, null, 'header');
  };

  const handleNodeMenuButtonClick = (e, node) => {
    e.preventDefault();
    e.stopPropagation();
    resetLongPressState();
    if (node.type === 'directory') {
      setFocusedDirectoryPath(node.path);
    }
    const rect = e.currentTarget.getBoundingClientRect();
    openContextMenuAt(rect.right - 4, rect.bottom + 6, node);
  };

  const handleDirectoryTogglePointerDown = (e) => {
    e.stopPropagation();
    resetLongPressState();
  };

  const handleDirectoryToggleClick = (e, node) => {
    e.preventDefault();
    e.stopPropagation();
    resetLongPressState();
    setFocusedDirectoryPath(node.path);
    triggerToggleFeedback(node.path);
    toggleDirectory(node);
  };

  const handleNodePointerDown = (e, node) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') {
      return;
    }

    if (e.button !== 0) {
      return;
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (error) {
      // 忽略不支持 pointer capture 的情况
    }

    resetLongPressState();
    const pressX = e.clientX;
    const pressY = e.clientY;
    setTouchPreviewPath(node.path);
    longPressStateRef.current = {
      pointerId: e.pointerId,
      nodePath: node.path,
      startX: pressX,
      startY: pressY,
      fired: false
    };

    longPressTimerRef.current = setTimeout(() => {
      const state = longPressStateRef.current;
      if (state.pointerId !== e.pointerId || state.nodePath !== node.path) {
        return;
      }

      longPressStateRef.current = { ...state, fired: true };
      suppressClickPathRef.current = node.path;
      setTouchPreviewPath(null);
      if (node.type === 'directory') {
        setFocusedDirectoryPath(node.path);
      }
      triggerLongPressFeedback(node.path);
      openContextMenuAt(pressX, pressY, node);
    }, 520);
  };

  const handleNodePointerMove = (e) => {
    const state = longPressStateRef.current;
    if (state.pointerId !== e.pointerId || state.fired) {
      return;
    }

    const deltaX = Math.abs(e.clientX - state.startX);
    const deltaY = Math.abs(e.clientY - state.startY);
    if (deltaX > 10 || deltaY > 10) {
      resetLongPressState();
    }
  };

  const handleNodePointerEnd = (e) => {
    const state = longPressStateRef.current;
    if (state.pointerId !== e.pointerId) {
      return;
    }

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (error) {
      // 忽略未捕获时的释放异常
    }

    resetLongPressState();
  };

  const doOpenRenameDialog = (node) => {
    setRenameNode(node);
    setShowRenameDialog(true);
  };

  const doOpenNewFolderDialog = (node) => {
    setNewFolderParent(node);
    setShowNewFolderDialog(true);
  };

  const doShowPropertiesDialog = (node) => {
    setPropertiesNode(node);
    setShowPropertiesDialog(true);
  };

  const doCloseRenameDialog = () => {
    setShowRenameDialog(false);
    setRenameNode(null);
  };

  const doCloseNewFolderDialog = () => {
    setShowNewFolderDialog(false);
    setNewFolderParent(null);
  };

  const doClosePropertiesDialog = () => {
    setShowPropertiesDialog(false);
    setPropertiesNode(null);
  };

  const doRefreshRootDirectory = async () => {
    await loadDirectory('/');
  };

  const doRefreshDirectory = async (node) => {
    await loadDirectory(node.path);
  };

  // 上传文件
  const doUploadFile = async (node) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const dirPath = node.path;
        showToast?.('正在上传: ' + file.name, 'info');
        
        const formData = new FormData();
        formData.append('path', dirPath);
        formData.append('file', file);
        
        const res = await fetch('/api/file/upload', {
          method: 'POST',
          body: formData
        });
        const d = await res.json();
        if (d.ok) {
          showToast?.('文件上传成功', 'success');
          await doRefreshDirectory(node);
        } else {
          showToast?.('上传失败: ' + (d.message || '未知错误'), 'error');
        }
      } catch (err) {
        showToast?.('上传失败: ' + (err.message || '未知错误'), 'error');
      }
      document.body.removeChild(input);
    };
    document.body.appendChild(input);
    input.click();
  };

  const doToggleFavoriteNode = async (node) => {
    await toggleFavorite(node.path, node.type);
    if (onReorderFavorites) {
      const latestFavorites = await getFavorites();
      onReorderFavorites(latestFavorites, { skipPersist: true });
    }
  };

  // 右键菜单操作处理
  const handleMenuAction = async (action) => {
    setContextMenu(null);
    
    // 处理头部菜单操作（含空白处右键）
    if (contextMenu?.type === 'header') {
      if (action === 'refresh') {
        await doRefreshRootDirectory();
      } else if (action === 'newfolder') {
        // 空白处新建文件夹：父级为 mdeditor 根目录（createFolderRoot，不在文件树中显示）
        const parentPath = createFolderRootRef.current
          || (tree.length > 0 && tree[0].path ? tree[0].path.replace(/\/[^/]+$/, '') : null);
        if (parentPath) {
          doOpenNewFolderDialog({ path: parentPath, type: 'directory', name: '' });
        } else {
          showToast?.('无法获取根目录，请刷新后重试', 'error');
        }
      }
      return;
    }
    
    if (!selectedNode) return;
    
    switch (action) {
      case 'open':
        doOpenNode(selectedNode);
        break;
        
      case 'rename':
        doOpenRenameDialog(selectedNode);
        break;
        
      case 'delete':
        await doDeleteNode(selectedNode);
        break;
        
      case 'copy':
        await doCopyNode(selectedNode);
        break;
        
      case 'cut':
        await doCutNode(selectedNode);
        break;
        
      case 'favorite':
        await doToggleFavoriteNode(selectedNode);
        break;
        
      case 'paste':
        if (selectedNode.type === 'directory') {
          await doPasteNode(selectedNode);
        }
        break;
        
      case 'newfolder':
        if (selectedNode.type === 'directory') {
          doOpenNewFolderDialog(selectedNode);
        }
        break;
        
      case 'refresh':
        if (selectedNode.type === 'directory') {
          await doRefreshDirectory(selectedNode);
        }
        break;

      case 'upload':
        if (selectedNode.type === 'directory') {
          await doUploadFile(selectedNode);
        }
        break;
                
      case 'properties':
        doShowPropertiesDialog(selectedNode);
        break;
        
      default:
        break;
    }
    
    setSelectedNode(null);
  };

  // 重命名文件/文件夹
  const doRenameNode = async (newName) => {
    if (!renameNode) return;
    
    try {
      const oldPath = renameNode.path;
      const pathParts = oldPath.split('/');
      pathParts[pathParts.length - 1] = newName;
      const newPath = pathParts.join('/');
      
      const response = await fetch('api/file/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newPath })
      });
      
      const data = await response.json();
      
      if (data.ok) {
        // 更新收藏夹中的路径
        await updateFavoritePath(oldPath, newPath);
        if (onReorderFavorites) {
          const latestFavorites = await getFavorites();
          onReorderFavorites(latestFavorites, { skipPersist: true });
        }
        
        // 刷新父目录
        const parentPath = pathParts.slice(0, -1).join('/') || '/';
        await loadDirectory(parentPath);
        
        // 如果重命名的是当前打开的文件，更新路径
        if (currentPath === oldPath) {
          onFileSelect(newPath);
        }
        showToast(`已重命名为 ${newName}`, 'success');
      } else {
        showToast(`重命名失败: ${data.message || data.code}`, 'error');
      }
    } catch (error) {
      console.error('Rename error:', error);
      showToast('重命名失败: 网络错误', 'error');
    }
    
    doCloseRenameDialog();
  };

  // 新建文件夹
  const doCreateFolder = async (folderName) => {
    if (!newFolderParent) return;
    
    try {
      const newPath = `${newFolderParent.path}/${folderName}`;
      
      const response = await fetch('api/folder/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newPath })
      });
      
      const data = await response.json();
      
      if (data.ok) {
        // 刷新：若父级为 mdeditor（createFolderRoot），刷新根；否则刷新父目录
        const isCreateUnderMdeditor = createFolderRootRef.current && newFolderParent.path === createFolderRootRef.current;
        await loadDirectory(isCreateUnderMdeditor ? '/' : newFolderParent.path);
        showToast(`已创建文件夹 ${folderName}`, 'success');
      } else {
        showToast(`创建文件夹失败: ${data.message || data.code}`, 'error');
      }
    } catch (error) {
      console.error('Create folder error:', error);
      showToast('创建文件夹失败: 网络错误', 'error');
    }
    
    doCloseNewFolderDialog();
  };

  // 删除文件/文件夹
  const doDeleteNode = async (node) => {
    const confirmMsg = node.type === 'directory' 
      ? `确定要删除文件夹 "${node.name}" 及其所有内容吗？`
      : `确定要删除文件 "${node.name}" 吗？`;
      
    const confirmed = await requestConfirm({
      title: node.type === 'directory' ? '删除文件夹' : '删除文件',
      message: confirmMsg,
      confirmText: '删除',
      confirmVariant: 'danger'
    });

    if (!confirmed) {
      return;
    }
    
    try {
      const response = await fetch('api/file/delete', {
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
        showToast('删除成功', 'success');
      } else {
        showToast(`删除失败: ${data.message || data.code}`, 'error');
      }
    } catch (error) {
      console.error('Delete error:', error);
      showToast('删除失败: 网络错误', 'error');
    }
  };

  // 复制文件/文件夹
  const doCopyNode = async (node) => {
    try {
      // 将路径存储到剪贴板（使用 localStorage 模拟）
      localStorage.setItem('clipboard', JSON.stringify({
        action: 'copy',
        path: node.path,
        type: node.type
      }));

      showToast(node.type === 'directory' ? '文件夹已复制' : '文件已复制', 'success');
    } catch (error) {
      console.error('Copy error:', error);
      showToast('复制失败', 'error');
    }
  };

  // 剪切文件/文件夹
  const doCutNode = async (node) => {
    try {
      // 将路径存储到剪贴板（使用 localStorage 模拟）
      localStorage.setItem('clipboard', JSON.stringify({
        action: 'cut',
        path: node.path,
        type: node.type
      }));

      showToast(node.type === 'directory' ? '文件夹已剪切' : '文件已剪切', 'success');
    } catch (error) {
      console.error('Cut error:', error);
      showToast('剪切失败', 'error');
    }
  };

  // 粘贴文件/文件夹
  const doPasteNode = async (targetNode) => {
    try {
      const clipboardData = localStorage.getItem('clipboard');
      if (!clipboardData) {
        showToast('剪贴板为空', 'warning');
        return;
      }
      
      const clipData = JSON.parse(clipboardData);
      const { action, path: sourcePath, type } = clipData;
      
      if (!sourcePath) {
        showToast('剪贴板数据无效', 'error');
        return;
      }
      
      // 构建目标路径
      const fileName = sourcePath.split('/').pop();
      const targetPath = `${targetNode.path}/${fileName}`;
      
      // 检查是否粘贴到自己
      if (sourcePath === targetPath) {
        showToast('不能粘贴到相同位置', 'warning');
        return;
      }
      
      // 检查是否粘贴到子目录（避免循环）
      if (type === 'directory' && targetPath.startsWith(sourcePath + '/')) {
        showToast('不能将文件夹粘贴到其子目录中', 'warning');
        return;
      }
      
      const apiEndpoint = action === 'cut' ? 'api/file/move' : 'api/file/copy';
      
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
        
        showToast(action === 'cut' ? '移动成功' : '复制成功', 'success');
      } else {
        showToast(`操作失败: ${data.message || data.code}`, 'error');
      }
    } catch (error) {
      console.error('Paste error:', error);
      showToast('粘贴失败: 网络错误', 'error');
    }
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

  // 根据文件类型获取图标（全格式支持）
  const getFileIcon = (filePath) => {
    const format = getFormatFromPath(filePath);
    if (format === 'md') return <FileText size={16} />;
    if (format === FORMAT_IMAGE) return <Image size={16} />;
    if (filePath.endsWith('.json')) return <FileJson size={16} />;
    return <File size={16} />;
  };

  /**
   * 方案一：动态缩进。层级越深缩进越小，避免深层文件显示不全。
   * 1–3 级 16px/级，4–6 级 12px/级，7 级及以上 8px/级。
   */
  const getIndentPx = (level, hasChildren) => {
    const base = hasChildren ? 4 : 8;
    if (level <= 2) return level * 16 + base;
    if (level <= 5) return 48 + (level - 3) * 12 + base;
    return 84 + (level - 6) * 8 + base;
  };

  // 渲染树节点
  const renderNode = (node, level = 0) => {
    const isExpanded = expanded.has(node.path);
    const isActive = currentPath === node.path;
    const hasChildren = node.type === 'directory';
    const children = node.children || [];
    const isFav = safeFavorites.some(item => item.path === node.path);
    const isFocusedDirectory = compactInteractionMode && hasChildren && focusedDirectoryPath === node.path;
    const isTouchPreview = touchPreviewPath === node.path;
    const hasLongPressFeedback = longPressFeedbackPath === node.path;
    const hasToggleFeedback = toggleFeedbackPath === node.path;
    const isMenuOpen = contextMenu?.node?.path === node.path;

    return (
      <div key={node.path} className="tree-node" data-path={node.path}>
        <div
          className={`tree-node-content ${isActive ? 'active' : ''} ${isFocusedDirectory ? 'focused-directory' : ''} ${isTouchPreview ? 'touch-preview' : ''} ${hasLongPressFeedback ? 'long-press-feedback' : ''} ${isMenuOpen ? 'menu-open' : ''}`}
          style={{ paddingLeft: `${getIndentPx(level, hasChildren)}px`, userSelect: 'none' }}
          onClick={(e) => handleFileClick(e, node)}
          onContextMenu={(e) => handleContextMenu(e, node)}
          onPointerDown={(e) => handleNodePointerDown(e, node)}
          onPointerMove={handleNodePointerMove}
          onPointerUp={handleNodePointerEnd}
          onPointerCancel={handleNodePointerEnd}
          onDragStart={(e) => e.preventDefault()}
        >
          {hasChildren && (
            <>
              <button
                className={`tree-node-toggle-btn ${isExpanded ? 'expanded' : ''} ${hasToggleFeedback ? 'toggle-feedback' : ''}`}
                onPointerDown={handleDirectoryTogglePointerDown}
                onClick={(e) => handleDirectoryToggleClick(e, node)}
                title={isExpanded ? `折叠 ${node.name}` : `展开 ${node.name}`}
                aria-label={isExpanded ? `折叠 ${node.name}` : `展开 ${node.name}`}
              >
                <ChevronRight size={16} />
              </button>
              <span className="tree-node-icon">
                <Folder size={16} />
              </span>
            </>
          )}
          {!hasChildren && (
            <span className="tree-node-icon">
              {getFileIcon(node.path)}
            </span>
          )}
          <div className="tree-node-text">
            <span className={`tree-node-name ${node.type === 'file' ? getFormatColorClass(node.path) : ''}`} title={node.path}>
              {debouncedQuery ? renderHighlightedName(node.name, debouncedQuery) : node.name}
            </span>
            {node.type === 'file' && (node.size !== undefined || node.mtime !== undefined) && (
              <span className="tree-node-meta">
                {node.size !== undefined && <span className="tree-node-size">{formatFileSize(node.size)}</span>}
                {node.mtime !== undefined && <span className="tree-node-mtime">{formatModifyTime(node.mtime)}</span>}
              </span>
            )}
            {isFocusedDirectory && (
              <span className="tree-node-focus-hint">
                点左侧箭头展开，长按或右侧更多操作
              </span>
            )}
          </div>
          {isFav && (
            <span className="tree-node-favorite" title="已收藏">
              <Star size={14} fill="currentColor" />
            </span>
          )}
          <button
            className="tree-node-more-btn"
            onClick={(e) => handleNodeMenuButtonClick(e, node)}
            title={`${node.name} 更多操作`}
            aria-label={`${node.name} 更多操作`}
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
        
        {hasChildren && isExpanded && children.length > 0 && (
          <div className={`tree-node-children ${hasToggleFeedback ? 'toggle-feedback' : ''}`}>
            {children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const filteredTree = filterTree([...tree], debouncedQuery);

  return (
    <div className={`file-tree ${compactInteractionMode ? 'compact-interaction-mode' : ''}`} style={style}>
      {/* 标签页导航 */}
      <div className="file-tree-tabs">
        <button 
          className={`file-tree-tab ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          文件
        </button>
        <button 
          className={`file-tree-tab ${activeTab === 'outline' ? 'active' : ''}`}
          onClick={() => setActiveTab('outline')}
        >
          大纲
        </button>
        <button 
          className={`file-tree-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          历史
        </button>
      </div>

      {/* 文件夹标签页内容 */}
      {activeTab === 'files' && (
        <>
          <div className="file-tree-header" onContextMenu={handleHeaderContextMenu}>
            <div className="file-tree-header-main">
              <FileSearchBox
                value={searchQuery}
                onChange={handleSearchQueryChange}
                onSearch={handleSearchQueryChange}
              />
              <button
                className="file-tree-menu-btn"
                onClick={handleHeaderMenuButtonClick}
                title="文件树更多操作"
                aria-label="文件树更多操作"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>

          </div>
          
          <FavoritesPanel
            favorites={safeFavorites}
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
            
            <AnimatedList delay={30}>
              {filteredTree.map(node => renderNode(node))}
            </AnimatedList>
          </div>
        </>
      )}

      {/* 大纲标签页内容 */}
      {activeTab === 'outline' && (
        <OutlinePanel 
          content={content || ''}
          onHeadingClick={onHeadingClick}
        />
      )}

      {/* 历史标签页内容 */}
      {activeTab === 'history' && (
        <HistoryPanel 
          currentPath={currentPath}
          theme={theme}
          onVersionRestore={onVersionRestore}
        />
      )}
      
      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          type={contextMenu.type}
          expanded={expanded}
          onAction={handleMenuAction}
          onClose={() => setContextMenu(null)}
        />
      )}
      
      {/* 重命名/新建文件夹/文件属性对话框 - 使用 Portal 渲染到 body，避免被文件树 overlay 的 will-change 限制定位，移动端/平板端可正确居中 */}
      {showRenameDialog && renameNode && createPortal(
        <div className={`theme-${theme}`}>
          <RenameDialog
            node={renameNode}
            onConfirm={doRenameNode}
            onCancel={doCloseRenameDialog}
            theme={theme}
          />
        </div>,
        document.body
      )}
      
      {showNewFolderDialog && newFolderParent && createPortal(
        <div className={`theme-${theme}`}>
          <NewFolderDialog
            parentPath={newFolderParent.path}
            onConfirm={doCreateFolder}
            onCancel={doCloseNewFolderDialog}
          />
        </div>,
        document.body
      )}

      {showPropertiesDialog && propertiesNode && createPortal(
        <div className={`theme-${theme}`}>
          <FilePropertiesDialog
            node={propertiesNode}
            onClose={doClosePropertiesDialog}
          />
        </div>,
        document.body
      )}
    </div>
  );
});

FileTree.displayName = 'FileTree';

// 使用 React.memo 优化性能，避免不必要的重渲染
export default React.memo(FileTree);
