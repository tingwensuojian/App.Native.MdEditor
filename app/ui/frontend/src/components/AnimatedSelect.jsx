import React, { useEffect, useRef, useState } from 'react'
import './AnimatedSelect.css'

function AnimatedSelect({
  label,
  value,
  options,
  onChange,
  wrapperClassName = 'config-item',
  labelClassName = 'config-label',
  disabled = false,
  renderOption,
  renderValue,
}) {
  const [open, setOpen] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const containerRef = useRef(null)
  const listRef = useRef(null)

  const selectedOpt = options.find((option) => option.value === value)

  const getEnabledOptionIndex = (start, step) => {
    let idx = start
    while (idx >= 0 && idx < options.length) {
      if (!options[idx]?.disabled) return idx
      idx += step
    }
    return -1
  }

  useEffect(() => {
    if (!open) return

    const handleOutsideClick = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  useEffect(() => {
    if (!open) return

    const idx = options.findIndex((option) => option.value === value)
    if (idx >= 0 && !options[idx]?.disabled) {
      setFocusedIdx(idx)
    } else {
      setFocusedIdx(getEnabledOptionIndex(0, 1))
    }

    const timer = setTimeout(() => {
      if (!listRef.current) return
      const item = listRef.current.querySelector('.asel-item.selected')
      if (item) {
        item.scrollIntoView({ block: 'nearest' })
      }
    }, 50)

    return () => clearTimeout(timer)
  }, [open, options, value])

  useEffect(() => {
    if (!open || focusedIdx < 0 || !listRef.current) return

    const items = listRef.current.querySelectorAll('.asel-item')
    if (items[focusedIdx]) {
      items[focusedIdx].scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIdx, open])

  const toggleOpen = () => {
    if (disabled) return
    setOpen((current) => !current)
  }

  const handleKeyDown = (event) => {
    if (disabled) return

    if (!open) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        setOpen(true)
        event.preventDefault()
      }
      return
    }

    if (event.key === 'ArrowDown') {
      setFocusedIdx((current) => {
        const start = current < 0 ? 0 : current + 1
        const next = getEnabledOptionIndex(start, 1)
        return next >= 0 ? next : current
      })
      event.preventDefault()
      return
    }

    if (event.key === 'ArrowUp') {
      setFocusedIdx((current) => {
        const start = current < 0 ? options.length - 1 : current - 1
        const prev = getEnabledOptionIndex(start, -1)
        return prev >= 0 ? prev : current
      })
      event.preventDefault()
      return
    }

    if (event.key === 'Enter' && focusedIdx >= 0 && !options[focusedIdx]?.disabled) {
      onChange(options[focusedIdx].value)
      setOpen(false)
      event.preventDefault()
      return
    }

    if (event.key === 'Escape') {
      setOpen(false)
      event.preventDefault()
    }
  }

  return (
    <div className={wrapperClassName} ref={containerRef}>
      {label && <label className={labelClassName}>{label}</label>}
      <div
        className={`asel-trigger${open ? ' open' : ''}${disabled ? ' disabled' : ''}`}
        tabIndex={disabled ? -1 : 0}
        onClick={toggleOpen}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-disabled={disabled}
      >
        <span className="asel-value">
          {renderValue
            ? renderValue(selectedOpt || { value, label: selectedOpt ? selectedOpt.label : value })
            : (selectedOpt ? selectedOpt.label : value)}
        </span>
        <span className={`asel-arrow${open ? ' open' : ''}`}></span>
      </div>

      {open && (
        <div className="asel-dropdown" ref={listRef}>
          <div className="asel-list">
            {options.map((option, idx) => (
              <div
                key={option.value}
                className={`asel-item${option.value === value ? ' selected' : ''}${idx === focusedIdx ? ' focused' : ''}${option.disabled ? ' disabled' : ''}`}
                style={{ animationDelay: `${idx * 30}ms` }}
                onMouseDown={(event) => {
                  event.preventDefault()
                  if (option.disabled) return
                  onChange(option.value)
                  setOpen(false)
                }}
                onMouseEnter={() => {
                  if (!option.disabled) setFocusedIdx(idx)
                }}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
              >
                {renderOption ? renderOption(option) : option.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AnimatedSelect
