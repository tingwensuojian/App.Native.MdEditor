import React, { useState, useCallback } from 'react';
import { Globe, FileText, File, FileCode, Image, FileType } from 'lucide-react';
import html2canvas from 'html2canvas';
import './Dialog.css';
import './ExportDialog.css';
import { useAppUi } from '../context/AppUiContext';

const ExportDialog = ({ onClose, content, currentPath, theme, previewHtml, exportConfig }) => {
  const { showToast } = useAppUi();
  const [exportFormat, setExportFormat] = useState('html');
  const [includeCSS, setIncludeCSS] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [fileName, setFileName] = useState('');
  const [isClosing, setIsClosing] = useState(false);

  // 初始化文件名
  React.useEffect(() => {
    if (currentPath) {
      const pathParts = currentPath.split('/');
      const name = pathParts[pathParts.length - 1];
      setFileName(name.replace(/\.md$/, ''));
    } else {
      setFileName('document');
    }
  }, [currentPath]);

  const getFileName = () => {
    return fileName || 'document';
  };

  // 计算文件大小 - 使用实际内容计算
  const getFileSize = () => {
    let size = 0;
    
    try {
      switch (exportFormat) {
        case 'html':
          const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName || 'document'}</title>
  ${includeCSS ? `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-light.min.css">
  <script>
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']],
        processEscapes: true,
        processEnvironments: true
      }
    };
  </script>
  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background-color: #ffffff;
    }
    .markdown-body {
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 45px;
    }
    @media (max-width: 767px) {
      .markdown-body {
        padding: 15px;
      }
    }
  </style>` : ''}
</head>
<body>
  <div class="markdown-body">
    ${previewHtml || ''}
  </div>
</body>
</html>`;
          size = new Blob([htmlContent]).size;
          break;
          
        case 'pdf':
          // PDF 大小估算：基于内容复杂度
          // PDF 文件包含：文档结构、字体嵌入、图片等
          // 通常是 HTML 内容的 2-5 倍
          const pdfBaseSize = new Blob([previewHtml || content]).size;
          // 基础 PDF 结构开销约 50KB
          const pdfOverhead = 50 * 1024;
          // 内容部分约为 HTML 的 3 倍（包含字体、格式等）
          size = pdfBaseSize * 3 + pdfOverhead;
          break;
          
        case 'word':
          // 生成实际的 Word 内容并计算大小
          const wordContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word' 
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${fileName || 'document'}</title>
        <style>
          body {
            font-family: 'Calibri', 'Arial', sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            margin: 1in;
          }
          h1 { font-size: 24pt; font-weight: bold; margin-top: 12pt; margin-bottom: 6pt; }
          h2 { font-size: 18pt; font-weight: bold; margin-top: 10pt; margin-bottom: 6pt; }
          h3 { font-size: 14pt; font-weight: bold; margin-top: 8pt; margin-bottom: 4pt; }
          h4 { font-size: 12pt; font-weight: bold; margin-top: 6pt; margin-bottom: 4pt; }
          p { margin-top: 0; margin-bottom: 8pt; }
          code { 
            font-family: 'Courier New', monospace; 
            background-color: #f6f8fa;
            padding: 2px 4px;
            border-radius: 3px;
          }
          pre {
            font-family: 'Courier New', monospace;
            background-color: #f6f8fa;
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 8pt 0;
          }
          blockquote {
            border-left: 4px solid #dfe2e5;
            padding-left: 16px;
            margin-left: 0;
            color: #57606a;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 8pt 0;
          }
          th, td {
            border: 1px solid #d0d7de;
            padding: 6px 13px;
            text-align: left;
          }
          th {
            background-color: #f6f8fa;
            font-weight: bold;
          }
          img {
            max-width: 100%;
            height: auto;
          }
          ul, ol {
            margin-top: 0;
            margin-bottom: 8pt;
            padding-left: 2em;
          }
          li {
            margin-bottom: 4pt;
          }
        </style>
      </head>
      <body>
        ${previewHtml || ''}
      </body>
      </html>
    `;
          size = new Blob(['\ufeff', wordContent]).size;
          break;
          
        case 'png':
          // PNG 大小估算：预览内容 × 3（图片通常比HTML大很多）
          size = (previewHtml?.length || content.length) * 3;
          break;
          
        case 'markdown':
          // Markdown 就是原始内容
          size = new Blob([content]).size;
          break;
          
        case 'text':
          // 纯文本就是原始内容
          size = new Blob([content]).size;
          break;
          
        default:
          size = new Blob([content]).size;
      }
    } catch (err) {
      console.error('计算文件大小失败:', err);
      size = content.length;
    }
    
    // 格式化显示
    if (size < 1024) {
      return `${size} B`;
    } else if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(2)} KB`;
    } else {
      return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    }
  };

  const inlineImagesInHtml = async (html) => {
    const container = document.createElement('div');
    container.innerHTML = html;

    const images = Array.from(container.querySelectorAll('img'));

    await Promise.all(
      images.map(async (img) => {
        const src = img.getAttribute('src');
        if (!src || src.startsWith('data:')) return;

        const isRelative = src.startsWith('/');
        const isLocalAbsolute = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(
          src
        );
        const isSameOrigin = src.startsWith(window.location.origin);

        if (!isRelative && !isLocalAbsolute && !isSameOrigin) return;

        try {
          let fetchUrl;
          if (isRelative || isSameOrigin) {
            fetchUrl = src;
          } else {
            fetchUrl = `api/proxy-image?url=${encodeURIComponent(src)}`;
          }

          const resp = await fetch(fetchUrl);
          if (!resp.ok) return;

          const blob = await resp.blob();
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });

          img.setAttribute('src', base64);
        } catch (e) {
          console.warn('[HTML导出] 图片转 base64 失败:', src, e);
        }
      })
    );

    return container.innerHTML;
  };

  const exportAsHTML = async () => {
    const fileName = getFileName();
    
    if (!previewHtml || previewHtml.trim() === '') {
      console.error('=== 导出错误 ===');
      console.error('previewHtml 为空，无法导出');
      showToast('导出失败：预览内容为空。请确保文档已正确渲染。', 'error');
      return;
    }
    
    // 获取当前页面中的主题样式
    const exportConfigStyleEl = document.getElementById('export-config-styles');
    const themeStyles = exportConfigStyleEl ? exportConfigStyleEl.textContent : '';
    
    console.log('=== 导出 HTML 调试信息 ===');
    console.log('exportConfig:', exportConfig);
    console.log('previewHtml 长度:', previewHtml.length);
    console.log('找到 export-config-styles 元素:', !!exportConfigStyleEl);
    console.log('主题样式长度:', themeStyles.length);
    console.log('主题样式内容（前 500 字符）:', themeStyles.substring(0, 500));
    
    // 获取代码高亮主题
    const codeThemeEl = document.getElementById('code-theme-style');
    const codeThemeHref = codeThemeEl ? codeThemeEl.href : '';
    
    console.log('找到 code-theme-style 元素:', !!codeThemeEl);
    console.log('代码主题链接:', codeThemeHref);
    console.log('=== 调试信息结束 ===');

    const inlinedHtml = await inlineImagesInHtml(previewHtml || '');
    
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName}</title>
  ${includeCSS ? `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-light.min.css">
  ${codeThemeHref ? `<link rel="stylesheet" href="${codeThemeHref}">` : ''}
  <script>
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']],
        processEscapes: true,
        processEnvironments: true
      }
    };
  </script>
  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background-color: #ffffff;
    }
    .markdown-body {
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 45px;
    }
    @media (max-width: 767px) {
      .markdown-body {
        padding: 15px;
      }
    }
    
    /* 导出配置的主题样式 */
    ${themeStyles}
    /* 强制注脚返回箭头 ↩ 显示为文本而非 emoji */
    .markdown-body .data-footnote-backref { font-family: monospace; font-variant-emoji: text; }
    .markdown-body .footnotes .data-footnote-backref g-emoji { font-family: monospace; font-variant-emoji: text; }
  </style>` : `<!-- 无样式导出：仅引入 KaTeX CSS 保证数学公式正确显示 -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">`}
</head>
<body>
  <div class="markdown-body">
    ${inlinedHtml}
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAsPDF = async () => {
    try {
      // 检查 previewHtml 是否为空
      if (!previewHtml || previewHtml.trim() === '') {
        console.error('=== 导出错误 ===');
        console.error('previewHtml 为空，无法导出 PDF');
        setError('导出失败：预览内容为空。请确保文档已正确渲染。');
        return;
      }
      
      // 使用浏览器的打印功能生成 PDF
      const fileName = getFileName();
      
      // 创建一个临时窗口用于打印
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setError('无法打开打印窗口，请检查浏览器弹窗设置');
        return;
      }
      
      // 获取当前页面中的主题样式
      const exportConfigStyleEl = document.getElementById('export-config-styles');
      const themeStyles = exportConfigStyleEl ? exportConfigStyleEl.textContent : '';
      
      // 获取代码高亮主题
      const codeThemeEl = document.getElementById('code-theme-style');
      const codeThemeHref = codeThemeEl ? codeThemeEl.href : '';
      
      const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-light.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  ${codeThemeHref ? `<link rel="stylesheet" href="${codeThemeHref}">` : ''}
  <style>
    @media print {
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body {
        margin: 0;
        padding: 20px;
        background-color: white;
      }
      .markdown-body {
        max-width: 100%;
        padding: 0;
      }
    }
    body {
      margin: 0;
      padding: 20px;
      background-color: #ffffff;
    }
    .markdown-body {
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 45px;
    }
    
    /* 导出配置的主题样式 */
    ${themeStyles}
    /* 强制注脚返回箭头 ↩ 显示为文本而非 emoji */
    .markdown-body .data-footnote-backref { font-family: monospace; font-variant-emoji: text; }
    .markdown-body .footnotes .data-footnote-backref g-emoji { font-family: monospace; font-variant-emoji: text; }
  </style>
</head>
<body>
  <div class="markdown-body">
    ${previewHtml || ''}
  </div>
  <script>
    // 等待所有样式表加载完成后再打印
    function waitForStylesheets() {
      var links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      if (links.length === 0) {
        window.print();
        setTimeout(function() { window.close(); }, 100);
        return;
      }
      var loaded = 0;
      var total = links.length;
      function onLoad() {
        loaded++;
        if (loaded >= total) {
          setTimeout(function() {
            window.print();
            setTimeout(function() { window.close(); }, 100);
          }, 300);
        }
      }
      links.forEach(function(link) {
        if (link.sheet) {
          onLoad();
        } else {
          link.addEventListener('load', onLoad);
          link.addEventListener('error', onLoad);
        }
      });
    }
    window.onload = function() {
      waitForStylesheets();
    };
  </script>
</body>
</html>`;

      if (!printWindow || !printWindow.document || typeof printWindow.document.write !== 'function') {
        setError('无法打开打印窗口（移动端可能拦截了 window.open）');
        setLoading(false);
        return;
      }

      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      setStatus('PDF 导出窗口已打开，请在打印对话框中选择"另存为 PDF"');
    } catch (err) {
      setError('PDF 导出失败: ' + err.message);
    }
  };

  const exportAsPNG = async () => {
    try {
      setLoading(true);
      setError('');

      if (!previewHtml) {
        setError('没有可导出的内容');
        setLoading(false);
        return;
      }

      setStatus('正在生成图片...');

      const el = document.querySelector('.markdown-body');
      if (!el) {
        setError('找不到预览区，请确保文档已渲染');
        setLoading(false);
        return;
      }

      // 截图前将预览区滚动到顶部，避免内容被裁切
      const previewPane = el.closest('.preview-pane') || el.parentElement;
      const savedScrollTop = previewPane ? previewPane.scrollTop : 0;
      const savedScrollLeft = previewPane ? previewPane.scrollLeft : 0;
      if (previewPane) {
        previewPane.scrollTop = 0;
        previewPane.scrollLeft = 0;
      }

      // 直接将计算后的颜色写到内联 style，html2canvas 克隆 DOM 时内联样式权重最高
      // 避免 stylesheet 优先级冲突问题
      const inlineStyleMap = new Map();
      const imgOrigSrcs = new Map();

      // 定义需要强制设置的元素及其样式
      const styleRules = [
        { selector: null, el: el, styles: { backgroundColor: '#ffffff', color: '#24292f', padding: '40px 48px' } },
        ...Array.from(el.querySelectorAll('th')).map(node => ({ el: node, styles: { backgroundColor: '#f6f8fa', color: '#24292f' } })),
        ...Array.from(el.querySelectorAll('td')).map(node => ({ el: node, styles: { backgroundColor: '#ffffff', color: '#24292f' } })),
        ...Array.from(el.querySelectorAll('tr')).map((node, i) => ({ el: node, styles: { backgroundColor: i % 2 === 1 ? '#f6f8fa' : '#ffffff' } })),
        ...Array.from(el.querySelectorAll('.mermaid')).map(node => ({ el: node, styles: { backgroundColor: '#ffffff' } })),
        ...Array.from(el.querySelectorAll('pre')).map(node => ({ el: node, styles: { backgroundColor: '#f6f8fa' } })),
        ...Array.from(el.querySelectorAll('pre code')).map(node => ({ el: node, styles: { backgroundColor: 'transparent', color: '#333333' } })),
        ...Array.from(el.querySelectorAll('code:not(pre code)')).map(node => ({ el: node, styles: { backgroundColor: '#f0f0f0', color: '#333333' } })),
        ...Array.from(el.querySelectorAll('svg')).map(node => ({ el: node, styles: { backgroundColor: 'transparent' } })),
        // 脚注区域：强制设置颜色，避免 CSS 变量在 html2canvas 中失效
        ...Array.from(el.querySelectorAll('.footnotes-section')).map(node => ({ el: node, styles: { color: '#24292f', borderTopColor: '#d1d9e0' } })),
        ...Array.from(el.querySelectorAll('.footnotes-section h3')).map(node => ({ el: node, styles: { color: '#24292f', fontSize: '1.2em' } })),
        ...Array.from(el.querySelectorAll('.footnotes-list')).map(node => ({ el: node, styles: { color: '#59636e' } })),
        ...Array.from(el.querySelectorAll('.footnotes-list li')).map(node => ({ el: node, styles: { color: '#59636e' } })),
        // GFM footnotes 的 sr-only 标题（<h2 class="sr-only">Footnotes</h2>）在截图时不可见，强制显示
        ...Array.from(el.querySelectorAll('.sr-only, [class*="sr-only"]')).map(node => ({ el: node, styles: {
          position: 'static',
          width: 'auto',
          height: 'auto',
          overflow: 'visible',
          clip: 'auto',
          whiteSpace: 'normal',
          color: '#24292f',
          fontSize: '1.2em',
          fontWeight: '600',
          marginBottom: '0.5em',
        } })),
      ];

      styleRules.forEach(({ el: node, styles }) => {
        const saved = {};
        Object.keys(styles).forEach(prop => {
          saved[prop] = node.style[prop];
          node.style[prop] = styles[prop];
        });
        inlineStyleMap.set(node, saved);
      });

      // Mac 代码块：::before 伪元素的 box-shadow 圆点 html2canvas 不支持
      // 截图前注入真实 DOM 圆点，截图后移除
      const macDots = [];
      if (exportConfig && exportConfig.macCodeBlock) {
        Array.from(el.querySelectorAll('pre')).forEach(pre => {
          const dotsWrap = document.createElement('span');
          dotsWrap.style.cssText = 'position:absolute;top:10px;left:12px;display:flex;gap:8px;pointer-events:none;z-index:10;';
          const colors = ['#ff5f56', '#ffbd2e', '#27c93f'];
          colors.forEach(color => {
            const dot = document.createElement('span');
            dot.style.cssText = `display:inline-block;width:12px;height:12px;border-radius:50%;background:${color};`;
            dotsWrap.appendChild(dot);
          });
          pre.appendChild(dotsWrap);
          macDots.push(dotsWrap);
        });
      }

      try {
        await new Promise(resolve => setTimeout(resolve, 50));

        // 处理外部图片 CORS 问题：通过后端代理转为 base64
        const imgEls = Array.from(el.querySelectorAll('img'));
        await Promise.all(imgEls.map(async (img) => {
          const src = img.getAttribute('src');
          if (!src || src.startsWith('data:') || src.startsWith('/') || src.startsWith(window.location.origin)) return;
          try {
            const resp = await fetch(`api/proxy-image?url=${encodeURIComponent(src)}`);
            if (resp.ok) {
              const blob = await resp.blob();
              const base64 = await new Promise((res) => {
                const reader = new FileReader();
                reader.onload = () => res(reader.result);
                reader.readAsDataURL(blob);
              });
              imgOrigSrcs.set(img, src);
              img.src = base64;
            }
          } catch (e) {
            // 代理失败则保持原 src，html2canvas 会跳过
            console.warn('[PNG导出] 图片代理失败:', src, e);
          }
        }));

        setStatus('正在渲染...');

        const canvas = await html2canvas(el, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          allowTaint: false,
          logging: false,
          imageTimeout: 15000,
          removeContainer: true,
          foreignObjectRendering: false
        });

        setStatus('正在保存...');
        const fileName = getFileName();
        canvas.toBlob((blob) => {
          if (!blob) { setError('生成图片失败'); setLoading(false); return; }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${fileName}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setTimeout(() => { onClose(); }, 500);
        }, 'image/png');

      } finally {
        // 还原所有内联样式
        inlineStyleMap.forEach((saved, node) => {
          Object.keys(saved).forEach(prop => {
            node.style[prop] = saved[prop];
          });
        });
        // 还原图片原始 src
        imgOrigSrcs.forEach((src, img) => {
          img.src = src;
        });
        // 移除注入的 Mac 代码块圆点
        macDots.forEach(dot => dot.parentNode && dot.parentNode.removeChild(dot));
        // 还原滚动位置
        if (previewPane) {
          previewPane.scrollTop = savedScrollTop;
          previewPane.scrollLeft = savedScrollLeft;
        }
      }

    } catch (err) {
      setError('PNG 导出失败: ' + err.message);
      console.error('[PNG导出] 错误:', err);
      setLoading(false);
    }
  };

  const exportAsMarkdown = () => {
    const fileName = getFileName();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAsText = () => {
    const fileName = getFileName();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAsWord = () => {
    const fileName = getFileName();
    
    // 创建 Word 文档的 HTML 内容（使用 MIME 类型让 Word 识别）
    const wordContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word' 
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${fileName}</title>
        <style>
          body {
            font-family: 'Calibri', 'Arial', sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            margin: 1in;
          }
          h1 { font-size: 24pt; font-weight: bold; margin-top: 12pt; margin-bottom: 6pt; }
          h2 { font-size: 18pt; font-weight: bold; margin-top: 10pt; margin-bottom: 6pt; }
          h3 { font-size: 14pt; font-weight: bold; margin-top: 8pt; margin-bottom: 4pt; }
          h4 { font-size: 12pt; font-weight: bold; margin-top: 6pt; margin-bottom: 4pt; }
          p { margin-top: 0; margin-bottom: 8pt; }
          code { 
            font-family: 'Courier New', monospace; 
            background-color: #f6f8fa;
            padding: 2px 4px;
            border-radius: 3px;
          }
          pre {
            font-family: 'Courier New', monospace;
            background-color: #f6f8fa;
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 8pt 0;
          }
          blockquote {
            border-left: 4px solid #dfe2e5;
            padding-left: 16px;
            margin-left: 0;
            color: #57606a;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 8pt 0;
          }
          th, td {
            border: 1px solid #d0d7de;
            padding: 6px 13px;
            text-align: left;
          }
          th {
            background-color: #f6f8fa;
            font-weight: bold;
          }
          img {
            max-width: 100%;
            height: auto;
          }
          ul, ol {
            margin-top: 0;
            margin-bottom: 8pt;
            padding-left: 2em;
          }
          li {
            margin-bottom: 4pt;
          }
        </style>
      </head>
      <body>
        ${previewHtml || ''}
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', wordContent], { 
      type: 'application/msword;charset=utf-8' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportDocument = async () => {
    setLoading(true);
    setError('');

    try {
      switch (exportFormat) {
        case 'html':
          await exportAsHTML();
          setTimeout(() => {
            onClose();
          }, 500);
          break;
        case 'pdf':
          await exportAsPDF();
          setTimeout(() => {
            onClose();
          }, 1000);
          break;
        case 'png':
          await exportAsPNG();
          break;
        case 'markdown':
          exportAsMarkdown();
          setTimeout(() => {
            onClose();
          }, 500);
          break;
        case 'text':
          exportAsText();
          setTimeout(() => {
            onClose();
          }, 500);
          break;
        case 'word':
          exportAsWord();
          setTimeout(() => {
            onClose();
          }, 500);
          break;
        default:
          setError('不支持的导出格式');
      }
    } catch (err) {
      setError('导出失败: ' + err.message);
      console.error('Export error:', err);
    } finally {
      setLoading(false);
    }
  };

  const requestClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      onClose();
    }, 180);
  }, [isClosing, onClose]);

  const handleOverlayClick = () => {
    requestClose();
  };

  const handleCloseClick = () => {
    requestClose();
  };

  const handleCancelClick = () => {
    requestClose();
  };

  const handleConfirmClick = () => {
    exportDocument();
  };

  return (
    <div className={`dialog-overlay compact-panel-overlay theme-${theme} ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div className="dialog-container compact-panel-dialog export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>导出文档</h2>
          <button className="dialog-close" onClick={handleCloseClick}>×</button>
        </div>

        <div className="dialog-body">
          <div className="export-form">
            <div className="form-group">
              <label>导出格式</label>
              <div className="format-options">
                <label className={`format-option ${exportFormat === 'html' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="format"
                    value="html"
                    checked={exportFormat === 'html'}
                    onChange={(e) => setExportFormat(e.target.value)}
                  />
                  <div className="format-card">
                    <div className="format-icon"><Globe size={32} /></div>
                    <div className="format-info">
                      <h4>HTML</h4>
                      <p>网页格式，可在浏览器中打开</p>
                    </div>
                  </div>
                </label>

                <label className={`format-option ${exportFormat === 'pdf' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="format"
                    value="pdf"
                    checked={exportFormat === 'pdf'}
                    onChange={(e) => setExportFormat(e.target.value)}
                  />
                  <div className="format-card">
                    <div className="format-icon"><File size={32} /></div>
                    <div className="format-info">
                      <h4>PDF</h4>
                      <p>便携式文档格式</p>
                    </div>
                  </div>
                </label>

                <label className={`format-option ${exportFormat === 'word' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="format"
                    value="word"
                    checked={exportFormat === 'word'}
                    onChange={(e) => setExportFormat(e.target.value)}
                  />
                  <div className="format-card">
                    <div className="format-icon"><FileType size={32} /></div>
                    <div className="format-info">
                      <h4>Word</h4>
                      <p>Microsoft Word 文档</p>
                    </div>
                  </div>
                </label>

                <label className={`format-option ${exportFormat === 'png' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="format"
                    value="png"
                    checked={exportFormat === 'png'}
                    onChange={(e) => setExportFormat(e.target.value)}
                  />
                  <div className="format-card">
                    <div className="format-icon"><Image size={32} /></div>
                    <div className="format-info">
                      <h4>PNG 图片</h4>
                      <p>高清图片格式</p>
                    </div>
                  </div>
                </label>

                <label className={`format-option ${exportFormat === 'markdown' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="format"
                    value="markdown"
                    checked={exportFormat === 'markdown'}
                    onChange={(e) => setExportFormat(e.target.value)}
                  />
                  <div className="format-card">
                    <div className="format-icon"><FileCode size={32} /></div>
                    <div className="format-info">
                      <h4>Markdown</h4>
                      <p>原始 Markdown 文件</p>
                    </div>
                  </div>
                </label>

                <label className={`format-option ${exportFormat === 'text' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="format"
                    value="text"
                    checked={exportFormat === 'text'}
                    onChange={(e) => setExportFormat(e.target.value)}
                  />
                  <div className="format-card">
                    <div className="format-icon"><FileText size={32} /></div>
                    <div className="format-info">
                      <h4>纯文本</h4>
                      <p>TXT 文本文件</p>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {exportFormat === 'html' && (
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeCSS}
                    onChange={(e) => setIncludeCSS(e.target.checked)}
                  />
                  <span>包含样式表（推荐）</span>
                </label>
                <p className="form-hint">包含 CSS 样式可以确保导出的 HTML 正确显示</p>
              </div>
            )}

            {exportFormat === 'png' && (
              <div className="form-group">
                <p className="form-hint">将以 1200px 宽度导出高清图片（2倍分辨率，确保清晰，文件大小为估算值）</p>
              </div>
            )}

            {exportFormat === 'word' && (
              <div className="form-group">
                <p className="form-hint">导出为 Word 文档格式（.doc），可在 Microsoft Word 中打开编辑（文件大小为估算值）</p>
              </div>
            )}

            {exportFormat === 'pdf' && (
              <div className="form-group">
                <p className="form-hint">将打开浏览器打印对话框，请选择"另存为 PDF"（文件大小为估算值）</p>
              </div>
            )}

            <div className="export-info">
              <div className="info-item file-name-item">
                <span className="info-label">文件名:</span>
                <input
                  type="text"
                  className="file-name-input"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="请输入文件名"
                />
                <span className="file-extension">.{exportFormat === 'markdown' ? 'md' : exportFormat === 'text' ? 'txt' : exportFormat === 'word' ? 'doc' : exportFormat}</span>
              </div>
              <div className="info-item">
                <span className="info-label">大小:</span>
                <span className="info-value">{getFileSize()}</span>
              </div>
            </div>

            {status && !error && <div className="status-message">{status}</div>}
            {error && <div className="error-message">{error}</div>}
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={handleCancelClick}>取消</button>
          <button 
            className="btn-primary" 
            onClick={handleConfirmClick}
            disabled={loading}
          >
            {loading ? '导出中...' : '导出'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;

