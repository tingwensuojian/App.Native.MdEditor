/**
 * 防抖函数
 * 在事件被触发n秒后再执行回调，如果在这n秒内又被触发，则重新计时
 * 
 * @param {Function} func - 需要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @param {boolean} immediate - 是否立即执行
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, wait = 300, immediate = false) {
  let timeout
  
  const debounced = function(...args) {
    const context = this
    
    const later = function() {
      timeout = null
      if (!immediate) func.apply(context, args)
    }
    
    const callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
    
    if (callNow) func.apply(context, args)
  }
  
  // 取消防抖
  debounced.cancel = function() {
    clearTimeout(timeout)
    timeout = null
  }
  
  return debounced
}

/**
 * 节流函数
 * 规定在一个单位时间内，只能触发一次函数。如果这个单位时间内触发多次函数，只有一次生效
 * 
 * @param {Function} func - 需要节流的函数
 * @param {number} wait - 等待时间（毫秒）
 * @param {Object} options - 配置选项
 * @param {boolean} options.leading - 是否在开始时执行
 * @param {boolean} options.trailing - 是否在结束时执行
 * @returns {Function} 节流后的函数
 */
export function throttle(func, wait = 16, options = {}) {
  let timeout, context, args, result
  let previous = 0
  
  const { leading = true, trailing = true } = options
  
  const later = function() {
    previous = leading === false ? 0 : Date.now()
    timeout = null
    result = func.apply(context, args)
    if (!timeout) context = args = null
  }
  
  const throttled = function(...params) {
    const now = Date.now()
    if (!previous && leading === false) previous = now
    
    const remaining = wait - (now - previous)
    context = this
    args = params
    
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      previous = now
      result = func.apply(context, args)
      if (!timeout) context = args = null
    } else if (!timeout && trailing !== false) {
      timeout = setTimeout(later, remaining)
    }
    
    return result
  }
  
  // 取消节流
  throttled.cancel = function() {
    clearTimeout(timeout)
    previous = 0
    timeout = context = args = null
  }
  
  return throttled
}

/**
 * 使用 requestAnimationFrame 实现的节流
 * 适用于滚动、resize 等高频事件
 * 
 * @param {Function} func - 需要节流的函数
 * @returns {Function} 节流后的函数
 */
export function rafThrottle(func) {
  let rafId = null
  let lastArgs = null
  
  const throttled = function(...args) {
    lastArgs = args
    
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        func.apply(this, lastArgs)
        rafId = null
        lastArgs = null
      })
    }
  }
  
  // 取消节流
  throttled.cancel = function() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
      lastArgs = null
    }
  }
  
  return throttled
}

/**
 * 防抖 Hook
 * 
 * @param {Function} callback - 回调函数
 * @param {number} delay - 延迟时间
 * @param {Array} deps - 依赖数组
 * @returns {Function} 防抖后的函数
 */
export function useDebounceCallback(callback, delay = 300, deps = []) {
  const callbackRef = React.useRef(callback)
  
  React.useEffect(() => {
    callbackRef.current = callback
  }, [callback])
  
  return React.useMemo(() => {
    const debouncedFn = debounce((...args) => {
      callbackRef.current(...args)
    }, delay)
    
    return debouncedFn
  }, [delay, ...deps])
}

/**
 * 节流 Hook
 * 
 * @param {Function} callback - 回调函数
 * @param {number} delay - 延迟时间
 * @param {Array} deps - 依赖数组
 * @returns {Function} 节流后的函数
 */
export function useThrottleCallback(callback, delay = 16, deps = []) {
  const callbackRef = React.useRef(callback)
  
  React.useEffect(() => {
    callbackRef.current = callback
  }, [callback])
  
  return React.useMemo(() => {
    const throttledFn = throttle((...args) => {
      callbackRef.current(...args)
    }, delay)
    
    return throttledFn
  }, [delay, ...deps])
}

/**
 * RAF 节流 Hook
 * 
 * @param {Function} callback - 回调函数
 * @param {Array} deps - 依赖数组
 * @returns {Function} 节流后的函数
 */
export function useRafThrottle(callback, deps = []) {
  const callbackRef = React.useRef(callback)
  
  React.useEffect(() => {
    callbackRef.current = callback
  }, [callback])
  
  return React.useMemo(() => {
    const throttledFn = rafThrottle((...args) => {
      callbackRef.current(...args)
    })
    
    return throttledFn
  }, deps)
}

// 导入 React（如果需要使用 Hook）
import React from 'react'

export default {
  debounce,
  throttle,
  rafThrottle,
  useDebounceCallback,
  useThrottleCallback,
  useRafThrottle
}
