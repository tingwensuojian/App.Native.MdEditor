import React, { useState, useCallback } from 'react'
import { X } from 'lucide-react'
import './TableInsertDialog.css'

function TableInsertDialog({ onClose, onInsert, theme }) {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)
  const [headers, setHeaders] = useState(Array(3).fill('表头'))
  const [cells, setCells] = useState(Array(3).fill(Array(3).fill('')))

  const handleRowsChange = (delta) => {
    const newRows = Math.max(2, Math.min(10, rows + delta))
    setRows(newRows)
    
    // 调整表头数组
    if (newRows > headers.length) {
      setHeaders([...headers, ...Array(newRows - headers.length).fill('表头')])
    } else {
      setHeaders(headers.slice(0, newRows))
    }
    
    // 调整单元格数组
    if (newRows > cells.length) {
      setCells([...cells, ...Array(newRows - cells.length).fill(Array(cols).fill(''))])
    } else {
      setCells(cells.slice(0, newRows))
    }
  }

  const handleColsChange = (delta) => {
    const newCols = Math.max(2, Math.min(10, cols + delta))
    setCols(newCols)
    
    // 调整单元格数组
    const newCells = cells.map(row => {
      if (newCols > row.length) {
        return [...row, ...Array(newCols - row.length).fill('')]
      } else {
        return row.slice(0, newCols)
      }
    })
    setCells(newCells)
  }

  const handleHeaderChange = (index, value) => {
    const newHeaders = [...headers]
    newHeaders[index] = value
    setHeaders(newHeaders)
  }

  const handleCellChange = (rowIndex, colIndex, value) => {
    const newCells = cells.map((row, rIdx) => {
      if (rIdx === rowIndex) {
        return row.map((cell, cIdx) => cIdx === colIndex ? value : cell)
      }
      return row
    })
    setCells(newCells)
  }

  const insertTableMarkdown = () => {
    // 生成 Markdown 表格
    let markdown = '| '
    
    // 表头行
    for (let i = 0; i < cols; i++) {
      markdown += (headers[i] || '表头') + ' | '
    }
    markdown += '\n'
    
    // 分隔行
    markdown += '|'
    for (let i = 0; i < cols; i++) {
      markdown += '------|'
    }
    markdown += '\n'
    
    // 数据行
    for (let i = 0; i < rows; i++) {
      markdown += '| '
      for (let j = 0; j < cols; j++) {
        markdown += (cells[i]?.[j] || '') + ' | '
      }
      markdown += '\n'
    }
    
    onInsert(markdown)
    onClose()
  }

  const [isClosing, setIsClosing] = useState(false)

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

  const handleCancelClick = () => {
    requestClose()
  }

  const handleConfirmClick = () => {
    insertTableMarkdown()
  }

  return (
    <div className={`table-insert-overlay ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div 
        className={`table-insert-dialog ${theme}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="table-insert-header">
          <h3>插入表格</h3>
          <button className="close-button" onClick={handleCloseClick}>
            <X size={20} />
          </button>
        </div>

        {/* 行列控制 */}
        <div className="table-size-controls">
          <div className="size-control">
            <label>行数</label>
            <div className="counter">
              <button onClick={() => handleRowsChange(-1)} disabled={rows <= 2}>−</button>
              <span>{rows}</span>
              <button onClick={() => handleRowsChange(1)} disabled={rows >= 10}>+</button>
            </div>
          </div>
          <div className="size-control">
            <label>列数</label>
            <div className="counter">
              <button onClick={() => handleColsChange(-1)} disabled={cols <= 2}>−</button>
              <span>{cols}</span>
              <button onClick={() => handleColsChange(1)} disabled={cols >= 10}>+</button>
            </div>
          </div>
        </div>

        {/* 表格预览和编辑 */}
        <div className="table-preview">
          <table>
            <thead>
              <tr>
                {Array(cols).fill(0).map((_, i) => (
                  <th key={i}>
                    <input
                      type="text"
                      value={headers[i] || ''}
                      onChange={(e) => handleHeaderChange(i, e.target.value)}
                      placeholder="表头"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array(rows).fill(0).map((_, i) => (
                <tr key={i}>
                  {Array(cols).fill(0).map((_, j) => (
                    <td key={j}>
                      <input
                        type="text"
                        value={cells[i]?.[j] || ''}
                        onChange={(e) => handleCellChange(i, j, e.target.value)}
                        placeholder=""
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 底部按钮 */}
        <div className="table-insert-footer">
          <button className="cancel-button" onClick={handleCancelClick}>
            取消
          </button>
          <button className="confirm-button" onClick={handleConfirmClick}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

export default TableInsertDialog
