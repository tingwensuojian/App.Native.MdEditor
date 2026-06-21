import React, { useState, useRef, useEffect } from 'react'
import './ElasticSlider.css'

const ElasticSlider = ({ min = 0, max = 100, value, onChange, className = '' }) => {
  const [isDragging, setIsDragging] = useState(false)
  const [localValue, setLocalValue] = useState(value)
  const sliderRef = useRef(null)
  const thumbRef = useRef(null)
  const activePointerId = useRef(null)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const getPercentage = (val) => {
    return ((val - min) / (max - min)) * 100
  }

  const updateValueFromClientX = (clientX) => {
    if (!sliderRef.current) return

    const rect = sliderRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    const percentage = rect.width === 0 ? 0 : x / rect.width
    const newValue = Math.round(min + percentage * (max - min))

    setLocalValue(newValue)
    onChange?.(newValue)
  }

  const updateValue = (e) => {
    updateValueFromClientX(e.clientX)
  }

  const handleThumbPointerDown = (e) => {
    if (!e.isPrimary) return
    if (e.pointerType === 'mouse' && e.button !== 0) return

    e.preventDefault()
    e.stopPropagation()
    activePointerId.current = e.pointerId
    setIsDragging(true)
    updateValue(e)

    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }

  const handlePointerMove = (e) => {
    if (!isDragging) return
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return

    updateValue(e)
  }

  const handlePointerUp = (e) => {
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    setIsDragging(false)
  }

  const handlePointerCancel = (e) => {
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    setIsDragging(false)
  }

  const handleTrackPointerDown = (e) => {
    if (!e.isPrimary) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (thumbRef.current?.contains(e.target)) return

    activePointerId.current = e.pointerId
    setIsDragging(true)
    updateValue(e)

    if (sliderRef.current?.setPointerCapture) {
      sliderRef.current.setPointerCapture(e.pointerId)
    }
  }

  useEffect(() => {
    if (!isDragging) return

    return () => {
      activePointerId.current = null
      setIsDragging(false)
    }
  }, [isDragging])

  const percentage = getPercentage(localValue)

  return (
    <div 
      className={`elastic-slider ${className} ${isDragging ? 'dragging' : ''}`}
      ref={sliderRef}
      onPointerDown={handleTrackPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="elastic-slider-track">
        <div 
          className="elastic-slider-fill"
          style={{ width: `${percentage}%` }}
        />
        <div 
          className="elastic-slider-thumb"
          ref={thumbRef}
          style={{ left: `${percentage}%` }}
          onPointerDown={handleThumbPointerDown}
        >
          <div className="elastic-slider-thumb-inner" />
        </div>
      </div>
    </div>
  )
}

export default ElasticSlider
