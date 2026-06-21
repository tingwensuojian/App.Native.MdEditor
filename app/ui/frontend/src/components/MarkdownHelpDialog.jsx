import React, { useState, useCallback } from 'react'
import './Dialog.css'
import './MarkdownHelpDialog.css'

function MarkdownHelpDialog({ onClose, theme }) {
  const [isClosing, setIsClosing] = useState(false)

  const getThemeClass = () => {
    if (theme === 'light') return 'theme-light'
    if (theme === 'md3') return 'theme-md3'
    return 'theme-dark'
  }

  const requestClose = useCallback(() => {
    if (isClosing) return
    setIsClosing(true)
    window.setTimeout(() => {
      onClose()
    }, 180)
  }, [isClosing, onClose])

  const handleOverlayClick = () => {
    requestClose()
  }

  const handleCloseClick = () => {
    requestClose()
  }

  return (
    <div className={`dialog-overlay compact-panel-overlay ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div className={`dialog-container compact-panel-dialog markdown-help-dialog ${getThemeClass()}`} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Markdown 语法帮助</h2>
          <button className="dialog-close" onClick={handleCloseClick}>×</button>
        </div>
        
        <div className="dialog-content markdown-help-content">
          <section className="help-section">
            <h3>标题</h3>
            <div className="help-example">
              <code># 一级标题</code>
              <code>## 二级标题</code>
              <code>### 三级标题</code>
            </div>
          </section>

          <section className="help-section">
            <h3>文本格式</h3>
            <div className="help-example">
              <code>**粗体文本**</code>
              <code>*斜体文本*</code>
              <code>~~删除线~~</code>
              <code>`行内代码`</code>
            </div>
          </section>

          <section className="help-section">
            <h3>列表</h3>
            <div className="help-example">
              <code>- 无序列表项</code>
              <code>1. 有序列表项</code>
              <code>- [ ] 任务列表（未完成）</code>
              <code>- [x] 任务列表（已完成）</code>
            </div>
          </section>

          <section className="help-section">
            <h3>链接和图片</h3>
            <div className="help-example">
              <code>[链接文本](https://example.com)</code>
              <code>![图片描述](https://example.com/image.jpg)</code>
            </div>
          </section>

          <section className="help-section">
            <h3>引用</h3>
            <div className="help-example">
              <code>&gt; 这是一段引用文本</code>
            </div>
          </section>

          <section className="help-section">
            <h3>代码块</h3>
            <div className="help-example">
              <pre>```javascript
function hello() {'{'}
  console.log('Hello World')
{'}'}
```</pre>
            </div>
          </section>

          <section className="help-section">
            <h3>表格</h3>
            <div className="help-example">
              <pre>| 列1 | 列2 |
|-----|-----|
| 内容 | 内容 |</pre>
            </div>
          </section>

          <section className="help-section">
            <h3>数学公式</h3>
            <div className="help-example">
              <code>行内公式：$E = mc^2$</code>
              <pre>块级公式：
$$
\int_{'{-\\infty}'}^{'{\\infty}'} e^{'{-x^2}'} dx = \sqrt{'{\\pi}'}
$$</pre>
            </div>
          </section>

          <section className="help-section">
            <h3>Mermaid 图表</h3>
            <div className="help-example">
              <pre>```mermaid
graph LR
    A[开始] --&gt; B[处理]
    B --&gt; C[结束]
```</pre>
            </div>
          </section>

          <section className="help-section">
            <h3>分隔线</h3>
            <div className="help-example">
              <code>---</code>
            </div>
          </section>
        </div>

        <div className="dialog-footer">
          <button className="btn-primary" onClick={handleCloseClick}>关闭</button>
        </div>
      </div>
    </div>
  )
}

export default MarkdownHelpDialog
