import React, { useState, useEffect, useRef } from 'react'
import { Search, Clock } from 'lucide-react'
import { 
  highlightMatches, 
  getSearchHistory, 
  saveSearchHistory, 
  clearSearchHistory 
} from '../utils/fileSearcher'
import './FileSearchBox.css'

/**
 * 增强的文件搜索框组件
 */
function FileSearchBox({ value, onChange, onSearch }) {
  const [showHistory, setShowHistory] = useState(false)
  const [searchHistory, setSearchHistory] = useState([])
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const loadHistory = async () => {
      setSearchHistory(await getSearchHistory())
    }

    loadHistory()
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        !inputRef.current.contains(event.target)
      ) {
        setShowHistory(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = (e) => {
    onChange(e.target.value)
  }

  const handleInputFocus = () => {
    if (searchHistory.length > 0) {
      setShowHistory(true)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && value.trim()) {
      doSearch(value)
    } else if (e.key === 'Escape') {
      setShowHistory(false)
      inputRef.current.blur()
    }
  }

  const doSearch = async (query) => {
    if (query.trim()) {
      await saveSearchHistory(query)
      setSearchHistory(await getSearchHistory())
      if (onSearch) {
        onSearch(query)
      }
    }
    setShowHistory(false)
  }

  const doApplyHistoryQuery = async (query) => {
    onChange(query)
    await doSearch(query)
  }

  const handleHistoryItemClick = async (query) => {
    await doApplyHistoryQuery(query)
  }

  const doClearHistory = async () => {
    await clearSearchHistory()
    setSearchHistory([])
    setShowHistory(false)
  }

  const handleClearHistoryClick = async (e) => {
    e.stopPropagation()
    await doClearHistory()
  }

  const doClearInput = () => {
    onChange('')
    inputRef.current.focus()
  }

  const handleClearInputClick = () => {
    doClearInput()
  }

  const renderHighlightedText = (text, query) => {
    const parts = highlightMatches(text, query)
    return (
      <span>
        {parts.map((part, index) => (
          part.highlight ? (
            <mark key={index} className="search-highlight">{part.text}</mark>
          ) : (
            <span key={index}>{part.text}</span>
          )
        ))}
      </span>
    )
  }

  return (
    <div className="file-search-box">
      <div className="search-input-wrapper">
        <span className="search-icon"><Search size={16} /></span>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="搜索文件..."
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
        />
        {value && (
          <button
            className="search-clear-btn"
            onClick={handleClearInputClick}
            title="清空"
          >
            ×
          </button>
        )}
      </div>

      {showHistory && searchHistory.length > 0 && (
        <div ref={dropdownRef} className="search-history-dropdown">
          <div className="search-history-header">
            <span className="history-title">搜索历史</span>
            <button
              className="history-clear-btn"
              onClick={handleClearHistoryClick}
              title="清空历史"
            >
              清空
            </button>
          </div>
          <div className="search-history-list">
            {searchHistory.map((query, index) => (
              <div
                key={index}
                className="search-history-item"
                onClick={() => handleHistoryItemClick(query)}
              >
                <span className="history-icon"><Clock size={14} /></span>
                <span className="history-text">
                  {value ? renderHighlightedText(query, value) : query}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default FileSearchBox
