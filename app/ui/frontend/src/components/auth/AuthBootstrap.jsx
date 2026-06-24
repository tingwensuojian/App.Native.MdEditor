import React, { useCallback, useEffect, useState } from 'react'
import App from '../../App.jsx'
import LoginPage from './LoginPage.jsx'
import FirstScreenLoader from '../FirstScreenLoader'
import { fetchAuthStatus, login, logout } from '../../utils/authApi'

const getSystemTheme = () => {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const getFnosThemeMode = () => {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('DesktopConfig-1000')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const theme = parsed?.userPreference?.theme
    if (theme === 10) return 'light'
    if (theme === 20) return 'dark'
    if (theme === 30) return 'system'
  } catch {
    // ignore
  }
  return null
}

const resolveTheme = () => {
  const fnosThemeMode = getFnosThemeMode()
  if (fnosThemeMode) {
    return fnosThemeMode === 'system' ? getSystemTheme() : fnosThemeMode
  }

  try {
    const saved = localStorage.getItem('md-editor-theme')
    if (saved === 'dark' || saved === 'light') return saved
    return getSystemTheme()
  } catch {
    return 'light'
  }
}

const isFirstScreenLoaderEnabled = () => {
  if (typeof window === 'undefined') return false
  try {
    const saved = localStorage.getItem('md-editor-enable-first-screen-loader')
    if (saved === 'true') return true
    if (saved === 'false') return false
  } catch {
    // ignore
  }
  return false
}

function AuthBootstrap() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [theme, setTheme] = useState(() => resolveTheme())

  const loadStatus = useCallback(async () => {
    try {
      const state = await fetchAuthStatus()
      setUser(state?.authenticated ? state.user : null)
    } catch {
      // 认证状态探测失败时视为未登录，保持在登录页
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const syncTheme = () => {
      setTheme(resolveTheme())
    }

    syncTheme()

    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onMediaChange = () => syncTheme()
    const onStorage = (event) => {
      if (!event || event.key === 'md-editor-theme' || event.key === 'DesktopConfig-1000') {
        syncTheme()
      }
    }

    if (media) {
      if (typeof media.addEventListener === 'function') media.addEventListener('change', onMediaChange)
      else if (typeof media.addListener === 'function') media.addListener(onMediaChange)
    }
    window.addEventListener('storage', onStorage)

    // 同 Tab 下 localStorage 变更不会触发 storage 事件，轮询兜底 fnOS 主题变化
    const timer = window.setInterval(syncTheme, 600)

    return () => {
      if (media) {
        if (typeof media.removeEventListener === 'function') media.removeEventListener('change', onMediaChange)
        else if (typeof media.removeListener === 'function') media.removeListener(onMediaChange)
      }
      window.removeEventListener('storage', onStorage)
      window.clearInterval(timer)
    }
  }, [])

  const handleLogin = useCallback(async (username, password) => {
    const nextUser = await login(username, password)
    setUser(nextUser)
  }, [])

  const handleLogout = useCallback(async () => {
    await logout()
    setUser(null)
  }, [])

  if (loading) {
    if (isFirstScreenLoaderEnabled()) {
      return <FirstScreenLoader message="准备就绪" theme={theme} />
    }
    return null
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} theme={theme} />
  }

  return <App authUser={user} onLogout={handleLogout} />
}

export default AuthBootstrap
