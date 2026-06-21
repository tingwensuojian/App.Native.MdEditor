import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, RotateCw, Download } from 'lucide-react';
import './PdfViewer.css';

// 动态导入pdfjs-dist以减少初始包体积
const loadPdfJs = async () => {
  // 直接导入整个模块，而不是使用默认导出
  const pdfjsModule = await import('pdfjs-dist');
  const pdfjsLib = pdfjsModule.default || pdfjsModule;
  
  // 配置 worker - 使用 Vite 兼容的方式
  if (typeof pdfjsLib.GlobalWorkerOptions !== 'undefined') {
    // 动态导入 worker 文件来获取正确的 URL
    const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  }
  
  return pdfjsLib;
};

const PdfViewer = ({ pdfBase64, fileName = 'document.pdf', theme = 'light', onReady, onError }) => {
  const [pdfDocument, setPdfDocument] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [renderingPage, setRenderingPage] = useState(null);
  const [pdfJsLib, setPdfJsLib] = useState(null);
  const renderDebounceRef = useRef(null);
  const renderPageRef = useRef(null);
  const lastFitWidthRef = useRef(null);
  const initialRenderDelayRef = useRef(null);

  const canvasRef = useRef(null);
  const renderIdRef = useRef(0);
  const pdfDocumentRef = useRef(null);
  const renderTaskRef = useRef(null);
  const currentRenderKeyRef = useRef(null); // 用于去重：避免同一 page/scale/rotation 的重复渲染导致 cancel 抖动
  const lastCompletedRenderKeyRef = useRef(null); // 用于去重：已渲染过且无进行中的渲染则跳过
  const cancelReasonRef = useRef(''); // 便于定位“PDF 渲染被取消”究竟是哪个分支触发的
  const autoRenderFrozenRef = useRef(false); // 首次渲染完成后冻结自动重渲染，避免后续触发导致空白/二次抖动

  const lastPdfNameLoadedRef = useRef(null); // 仅用于“首次打开后不再重复加载”的保护
  const isPdfLoadingForNameRef = useRef(false); // 防止同一文件名下并发/重复触发 loadPdf
  const hasLoadedForNameRef = useRef(false); // 同一 fileName 已成功加载过 => 后续不再重复 loadPdf

  // 新增：容器尺寸检查和防抖处理
  const containerRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const isContainerReadyRef = useRef(false);
  const hasRenderedOnceRef = useRef(false);

  // 检查容器是否准备好 - 添加更严格的检查
  const checkContainerReady = useCallback(() => {
    if (!containerRef.current) return false;
    
    const rect = containerRef.current.getBoundingClientRect();
    // 确保容器有合理的尺寸（避免微小尺寸导致的渲染问题）
    return rect.width > 50 && rect.height > 50;
  }, []);

  // 新增：检查容器尺寸是否稳定
  const checkContainerStable = useCallback(() => {
    if (!containerRef.current) return false;
    
    const rect = containerRef.current.getBoundingClientRect();
    // 检查是否为有效尺寸且不是过渡状态
    const isValidSize = rect.width > 50 && rect.height > 50;
    const isNotTransitioning = !containerRef.current.classList.contains('transitioning');
    
    return isValidSize && isNotTransitioning;
  }, []);

  // 监听容器尺寸变化
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        // 只有当尺寸变化超过一定阈值时才触发重渲染
        const rect = entry.contentRect;
        if (rect.width > 10 && rect.height > 10) {
          // 防抖处理，避免频繁重渲染
          if (renderDebounceRef.current) {
            clearTimeout(renderDebounceRef.current);
          }
          renderDebounceRef.current = setTimeout(() => {
            isContainerReadyRef.current = true;
            // 避免首次加载阶段重复触发导致的 cancel 抖动：只在至少渲染过一次之后再响应尺寸变化。
            if (!hasRenderedOnceRef.current) return;
            // 首次渲染完成后冻结自动触发，避免二次抖动/空白
            if (autoRenderFrozenRef.current) return;
            // 触发重新渲染
            if (pdfDocument && currentPage >= 1 && currentPage <= totalPages && canvasRef.current) {
              renderPage(currentPage);
            }
          }, 100); // 100ms防抖延迟
        }
      }
    });

    observer.observe(containerRef.current);
    resizeObserverRef.current = observer;

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      if (renderDebounceRef.current) {
        clearTimeout(renderDebounceRef.current);
      }
    };
  }, [pdfDocument, currentPage, totalPages, checkContainerReady]);

  // 加载 PDF.js 库
  const loadPdfJsLib = useCallback(async () => {
    if (pdfJsLib) return pdfJsLib;
    
    try {
      const loadedPdfJsLib = await loadPdfJs();
      setPdfJsLib(loadedPdfJsLib);
      return loadedPdfJsLib;
    } catch (err) {
      console.error('PDF.js 加载失败:', err);
      setError('PDF.js 加载失败，请稍后重试');
      setIsLoading(false);
      if (onError) onError(err);
      throw err;
    }
  }, [pdfJsLib, onError]);

  // 加载 PDF 文档
  const loadPdf = useCallback(async (pdfDataUrl) => {
    try {
      const lib = await loadPdfJsLib();
      
      // 每次加载新 PDF 都重新开启“首次渲染后冻结自动重渲染”的流程
      autoRenderFrozenRef.current = false;
      hasRenderedOnceRef.current = false;
      lastCompletedRenderKeyRef.current = null;
      currentRenderKeyRef.current = null;
      cancelReasonRef.current = '';
      
      // 移除 data URL 前缀，只保留 base64 数据
      const base64Data = pdfDataUrl.split(',')[1];
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 资源 URL 必须兼容“子路径部署”（不能写死以 / 开头）
      const appBaseUrl = new URL(import.meta.env.BASE_URL || './', window.location.href);
      const cMapUrl = new URL('cmaps/', appBaseUrl).toString();
      const standardFontDataUrl = new URL('standard_fonts/', appBaseUrl).toString();

      const loadingTask = lib.getDocument({
        data: bytes,
        cMapUrl,
        cMapPacked: true,
        standardFontDataUrl,
      });
      const pdfDoc = await loadingTask.promise;
      
      setPdfDocument(pdfDoc);
      pdfDocumentRef.current = pdfDoc;
      setTotalPages(pdfDoc.numPages);
      setCurrentPage(1);
      setIsLoading(false);
      setError(null);
      
      if (onReady) onReady();
      return true;
    } catch (err) {
      console.error('PDF 加载失败:', err);
      setError(`PDF 加载失败: ${err.message}`);
      setIsLoading(false);
      if (onError) onError(err);
      return false;
    }
  }, [loadPdfJsLib, onReady, onError]);

  // 渲染指定页
  const renderPage = useCallback(async (pageNum) => {
    if (!pdfDocument || !canvasRef.current) return;

    const renderKey = `${pageNum}|${scale}|${rotation}`;
    // 去重策略：
    // 1) 若正在渲染且下一次请求 key 完全相同，则直接返回，避免重复 cancel（导致抖动）
    if (renderTaskRef.current && currentRenderKeyRef.current === renderKey) {
      return;
    }
    // 2) 若已完成同一 key 的渲染，且当前没有渲染任务，则跳过（避免重复清空 canvas）
    if (!renderTaskRef.current && lastCompletedRenderKeyRef.current === renderKey) {
      return;
    }

    // 取消任何正在进行的渲染任务
    if (renderTaskRef.current) {
      cancelReasonRef.current = 'new-render';
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    currentRenderKeyRef.current = renderKey;

    // 防止旧渲染覆盖新渲染
    const currentRenderId = ++renderIdRef.current;
    setRenderingPage(pageNum);

    try {
      const page = await pdfDocument.getPage(pageNum);
      
      // 再次检查 canvas 是否存在（防止在异步操作期间组件卸载）
      if (!canvasRef.current) {
        return;
      }
      
      const context = canvasRef.current.getContext('2d');

      // 清空 canvas 避免残留内容
      context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      const viewport = page.getViewport({ scale, rotation });

      // 设置 canvas 尺寸
      canvasRef.current.height = viewport.height;
      canvasRef.current.width = viewport.width;

      // 检查是否是最新的渲染请求（避免旧的渲染覆盖新的）
      if (currentRenderId !== renderIdRef.current) {
        return;
      }

      // 渲染 PDF 页面
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;
      
      // 等待渲染完成
      await renderTask.promise;

      // 再次检查是否是最新的渲染请求和 canvas 存在
      if (currentRenderId !== renderIdRef.current || !canvasRef.current) {
        return;
      }

      // 清除当前渲染任务引用和渲染状态
      renderTaskRef.current = null;
      if (currentRenderId === renderIdRef.current) {
        setRenderingPage(null);
        lastCompletedRenderKeyRef.current = renderKey;
        hasRenderedOnceRef.current = true;
        
        // 首次渲染完成后冻结自动触发：
        // - ResizeObserver 可能在 canvas 尺寸设置后又触发 renderPage，导致 cancel 抖动/空白
        // - window resize 可能触发 fit width 改变 scale，进而二次 render
        autoRenderFrozenRef.current = true;
        if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect();
          resizeObserverRef.current = null;
        }
      }
    } catch (err) {
      // 处理用户取消的情况
      if (err.name === 'RenderingCancelledException') {
        console.log('PDF 渲染被取消:', cancelReasonRef.current || 'unknown');
        // 不设置错误状态，因为这是正常操作
      } else {
        console.error('PDF 页面渲染失败:', err);
        setError(`页面渲染失败: ${err.message}`);
      }
      
      // 清除渲染任务引用和状态
      renderTaskRef.current = null;
      currentRenderKeyRef.current = null;
      if (currentRenderId === renderIdRef.current) {
        setRenderingPage(null);
      }
    }
  }, [pdfDocument, scale, rotation]);

  useEffect(() => {
    renderPageRef.current = renderPage;
  }, [renderPage]);

  // 初始渲染和页面切换 - 添加延迟确保容器稳定
  useEffect(() => {
    if (pdfDocument && currentPage >= 1 && currentPage <= totalPages && canvasRef.current) {
      // 延迟初始渲染，确保容器布局完成
      if (initialRenderDelayRef.current) {
        clearTimeout(initialRenderDelayRef.current);
      }
      initialRenderDelayRef.current = setTimeout(() => {
        // 使用更严格的稳定性检查
        if (checkContainerStable()) {
          renderPage(currentPage);
        } else if (checkContainerReady()) {
          // 如果不稳定但尺寸合理，也尝试渲染
          renderPage(currentPage);
        }
      }, 150); // 150ms延迟确保布局稳定
    }

    return () => {
      if (initialRenderDelayRef.current) {
        clearTimeout(initialRenderDelayRef.current);
      }
    };
  }, [pdfDocument, currentPage, totalPages, renderPage, checkContainerReady, checkContainerStable]);

  // 清理未完成的渲染/定时器
  useEffect(() => {
    return () => {
      if (renderTaskRef.current) {
        cancelReasonRef.current = 'unmount';
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      if (renderDebounceRef.current) {
        clearTimeout(renderDebounceRef.current);
      }
      if (initialRenderDelayRef.current) {
        clearTimeout(initialRenderDelayRef.current);
      }
    };
  }, []);

  // 当 PDF Base64 数据变化时重新加载
  useEffect(() => {
    if (!pdfBase64) return;

    // 需求：只保证“首次打开 PDF 时”的稳定显示；
    // 同一份 PDF（用 fileName 作为标记）不要重复触发 loadPdf，从而避免第二次抖动。
    if (fileName !== lastPdfNameLoadedRef.current) {
      // 换了文件名 => 允许重新加载
      lastPdfNameLoadedRef.current = fileName;
      isPdfLoadingForNameRef.current = false;
      hasLoadedForNameRef.current = false;
    }

    // 已经加载成功且当前文档仍在 => 不再触发 loadPdf
    // 防止出现：load 被跳过但 isLoading 仍卡在 true 的情况（桌面端表现为“永远加载中”）
    const alreadyHaveDoc = !!pdfDocumentRef.current;
    const shouldSkipLoad =
      hasLoadedForNameRef.current &&
      fileName === lastPdfNameLoadedRef.current &&
      alreadyHaveDoc;
    if (shouldSkipLoad) {
      setIsLoading(false);
      return;
    }

    if (isPdfLoadingForNameRef.current) return;

    isPdfLoadingForNameRef.current = true;
    setIsLoading(true);

    void loadPdf(pdfBase64).then((ok) => {
      if (ok) {
        // 标记：同一文件名下只加载一次
        lastPdfNameLoadedRef.current = fileName;
        hasLoadedForNameRef.current = true;
      }
    }).finally(() => {
      isPdfLoadingForNameRef.current = false;
    });
  }, [pdfBase64, fileName, loadPdf]);

  // 翻页控制
  const handlePrevious = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  }, [currentPage]);

  const handleNext = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  }, [currentPage, totalPages]);

  const handlePageChange = useCallback((value) => {
    const pageNum = parseInt(value, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
    }
  }, [totalPages]);

  // 缩放控制
  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(prev * 1.2, 3.0));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prev => Math.max(prev / 1.2, 0.5));
  }, []);

  const handleFitWidth = useCallback(async () => {
    if (!canvasRef.current || !pdfDocument) return;
    
    try {
      // 获取第一页来计算视口
      const firstPage = await pdfDocument.getPage(1);
      const containerWidth = canvasRef.current.parentElement?.clientWidth || 800;
      const viewport = firstPage.getViewport({ scale: 1 });
      const fitScale = containerWidth / viewport.width;
      const nextScale = Math.max(0.5, Math.min(fitScale, 3.0));
      const prevScale = lastFitWidthRef.current ?? scale;
      
      // 仅在变化明显时更新，避免抖动
      if (Math.abs(nextScale - prevScale) > 0.02) {
        lastFitWidthRef.current = nextScale;
        setScale(nextScale);
      }
    } catch (err) {
      console.error('Fit width calculation failed:', err);
    }
  }, [pdfDocument, scale]);

  const handleFitPage = useCallback(() => {
    setScale(1.0);
  }, []);

  // 旋转控制
  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  // 下载控制
  const handleDownload = useCallback(() => {
    if (!pdfBase64) return;
    
    const link = document.createElement('a');
    link.href = pdfBase64;
    link.download = fileName || 'document.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [pdfBase64, fileName]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!pdfDocument) return;
      
      switch(e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          handlePrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNext();
          break;
        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleZoomIn();
          }
          break;
        case '-':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleZoomOut();
          }
          break;
        case 'r':
        case 'R':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleRotate();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrevious, handleNext, handleZoomIn, handleZoomOut, handleRotate, pdfDocument]);

  // 自动适应容器宽度（防抖）
  useEffect(() => {
    const handleResize = () => {
      // 首次渲染完成后冻结自动触发，避免改变 scale 导致二次 render/cancel
      if (autoRenderFrozenRef.current) return;
      if (pdfDocument && checkContainerReady()) {
        if (renderDebounceRef.current) {
          clearTimeout(renderDebounceRef.current);
        }
        renderDebounceRef.current = setTimeout(() => {
          handleFitWidth();
        }, 80);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [pdfDocument, handleFitWidth, checkContainerReady]);

  if (error) {
    return (
      <div className={`pdf-viewer pdf-viewer-${theme} pdf-viewer-error`}>
        <div className="pdf-error-message">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`pdf-viewer pdf-viewer-${theme} pdf-viewer-loading`}>
        <div className="pdf-loading-spinner"></div>
        <p>正在加载 PDF...</p>
      </div>
    );
  }

  return (
    <div 
      className={`pdf-viewer pdf-viewer-${theme}`}
      ref={containerRef}
    >
      {/* 工具栏 */}
      <div className="pdf-toolbar">
        {/* 翻页控制 */}
        <div className="pdf-page-control">
          <button 
            className="pdf-toolbar-btn"
            onClick={handlePrevious}
            disabled={currentPage <= 1}
            title="上一页 (←)"
          >
            <ChevronLeft size={20} />
          </button>
          
          <div className="pdf-page-input">
            <input
              type="number"
              min="1"
              max={totalPages}
              value={currentPage}
              onChange={(e) => handlePageChange(e.target.value)}
              disabled={renderingPage !== null}
            />
            <span className="pdf-page-separator">/</span>
            <span className="pdf-total-pages">{totalPages}</span>
          </div>
          
          <button 
            className="pdf-toolbar-btn"
            onClick={handleNext}
            disabled={currentPage >= totalPages}
            title="下一页 (→)"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* 缩放控制 */}
        <div className="pdf-zoom-control">
          <button 
            className="pdf-toolbar-btn"
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            title="缩小 (Ctrl/Cmd + -)"
          >
            <ZoomOut size={20} />
          </button>
          
          <span className="pdf-zoom-level">{Math.round(scale * 100)}%</span>
          
          <button 
            className="pdf-toolbar-btn"
            onClick={handleZoomIn}
            disabled={scale >= 3.0}
            title="放大 (Ctrl/Cmd + +)"
          >
            <ZoomIn size={20} />
          </button>
          
          <button 
            className="pdf-toolbar-btn"
            onClick={handleFitWidth}
            title="适合宽度"
          >
            <Maximize2 size={20} />
          </button>
        </div>

        {/* 其他操作 */}
        <div className="pdf-other-control">
          <button 
            className="pdf-toolbar-btn"
            onClick={handleRotate}
            title="旋转 (Ctrl/Cmd + R)"
          >
            <RotateCw size={20} />
          </button>
          
          <button 
            className="pdf-toolbar-btn"
            onClick={handleDownload}
            title="下载 PDF"
          >
            <Download size={20} />
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="pdf-content">
        <canvas 
          ref={canvasRef} 
          className="pdf-canvas"
          style={{ display: isLoading ? 'none' : 'block' }}
        />
      </div>
    </div>
  );
};

export default PdfViewer;