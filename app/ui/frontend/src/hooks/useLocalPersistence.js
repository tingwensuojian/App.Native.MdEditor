import { useEffect, useCallback, useRef } from 'react'
import { saveFullState } from '../utils/localPersistence'

const safeStringify = (value) => {
  const seen = new WeakSet()

  return JSON.stringify(value, (key, currentValue) => {
    if (typeof currentValue === 'function') {
      return undefined
    }

    if (currentValue && typeof currentValue === 'object') {
      if (seen.has(currentValue)) {
        return '[Circular]'
      }
      seen.add(currentValue)
    }

    return currentValue
  })
}

/**
 * 本地持久化自动保存 Hook
 * 
 * @param {Object} state - 需要保存的状态对象
 * @param {number} delay - 防抖延迟时间（毫秒），默认 500ms
 * @param {boolean} enabled - 是否启用自动保存，默认 true
 */
export const useLocalPersistence = (state, delay = 500, enabled = true) => {
  const timeoutRef = useRef(null)
  const previousStateRef = useRef(state)

  // 防抖保存函数
  const debouncedSave = useCallback(() => {
    if (!enabled) return

    // 清除之前的定时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // 设置新的定时器
    timeoutRef.current = setTimeout(() => {
      saveFullState(state).then((ok) => {
        if (ok) {
          console.log('[LocalPersistence] State saved to database')
        }
      })
    }, delay)
  }, [state, delay, enabled])

  // 监听状态变化
  useEffect(() => {
    // 检查状态是否真的变化了，避免循环引用导致 JSON.stringify 崩溃
    const hasChanged = safeStringify(state) !== safeStringify(previousStateRef.current)
    
    if (hasChanged && enabled) {
      debouncedSave()
      previousStateRef.current = state
    }

    // 清理函数
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [state, debouncedSave, enabled])

  // 立即保存函数（不防抖）
  const saveNow = useCallback(() => {
    if (!enabled) return false

    // 清除防抖定时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    saveFullState(state).then((ok) => {
      if (ok) {
        console.log('[LocalPersistence] State saved immediately')
      }
    })
    return true
  }, [state, enabled])

  return { saveNow }
}

/**
 * 监听页面关闭/刷新事件，确保保存
 */
export const useBeforeUnload = (state, enabled = true) => {
  useEffect(() => {
    if (!enabled) return

    const handleBeforeUnload = (e) => {
      saveFullState(state, { keepalive: true }).then((ok) => {
        if (ok) {
          console.log('[LocalPersistence] State saved before unload')
        }
      })
    }

    // 监听页面关闭/刷新
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [state, enabled])
}

/**
 * 监听页面可见性变化，在页面隐藏时保存
 */
export const useVisibilityChange = (state, enabled = true) => {
  useEffect(() => {
    if (!enabled) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveFullState(state, { keepalive: true }).then((ok) => {
          if (ok) {
            console.log('[LocalPersistence] State saved on visibility change')
          }
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [state, enabled])
}
