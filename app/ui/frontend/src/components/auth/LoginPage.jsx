import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import DynamicAppLogo from '../DynamicAppLogo'
import './LoginPage.css'

function LoginPage({ onLogin, theme = 'light' }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('请输入用户名和密码')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await onLogin(username.trim(), password)
    } catch (err) {
      setError(err?.message || '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`auth-login-page theme-${theme}`}>
      <form className="auth-login-card" onSubmit={handleSubmit}>
        <div className="auth-login-logo-wrap">
          <div className="auth-login-logo-circle">
            <DynamicAppLogo variant="about" />
          </div>
        </div>

        <h1>登录</h1>
        <p className="auth-login-subtitle">请输入账号密码后继续使用</p>

        <label>
          用户名
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            disabled={submitting}
          />
        </label>

        <label>
          密码
          <div className="form-input-with-icon auth-password-input-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={submitting}
            />
            <button
              type="button"
              className="form-icon-btn auth-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              title={showPassword ? '隐藏密码' : '显示密码'}
              disabled={submitting}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        {error ? <div className="auth-login-error">{error}</div> : null}

        <div className="auth-login-help">
          忘记账号或密码？请在系统设置-应用配置中修改，
          应用配置后会自动重启并生效。
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? '登录中...' : '登录'}
        </button>
      </form>
    </div>
  )
}

export default LoginPage
