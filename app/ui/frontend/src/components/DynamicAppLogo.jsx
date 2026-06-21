import React from 'react'
import markdownLogo from '../assets/markdown.svg'
import LogoMark from './LogoMark'

const DEFAULT_LOGO_CONFIG = {
  mode: 'about-svg', // 'about-svg' | 'markdown' | 'custom'
  customLogoUrl: '',
}

function normalizeLogoConfig(config) {
  const mode = config?.mode
  const customLogoUrl = typeof config?.customLogoUrl === 'string' ? config.customLogoUrl : ''

  if (mode === 'about-svg' || mode === 'markdown' || mode === 'custom') {
    return { mode, customLogoUrl }
  }

  return DEFAULT_LOGO_CONFIG
}

function DynamicAppLogo({ config, variant = 'toolbar', className = '' }) {
  const normalized = normalizeLogoConfig(config)
  const rootClassName = [
    'dynamic-app-logo',
    `dynamic-app-logo--${variant}`,
    className,
  ].filter(Boolean).join(' ')

  if (normalized.mode === 'custom' && normalized.customLogoUrl) {
    return (
      <div className={rootClassName}>
        <img src={normalized.customLogoUrl} alt="App Logo" className="dynamic-app-logo-img" />
      </div>
    )
  }

  if (normalized.mode === 'markdown') {
    return (
      <div className={rootClassName}>
        <img src={markdownLogo} alt="Markdown" className="dynamic-app-logo-img" />
      </div>
    )
  }

  return (
    <div className={rootClassName}>
      <LogoMark />
    </div>
  )
}

export default DynamicAppLogo
export { DEFAULT_LOGO_CONFIG, normalizeLogoConfig }
