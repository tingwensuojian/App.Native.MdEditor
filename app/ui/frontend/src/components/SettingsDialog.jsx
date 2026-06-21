import React, { useState, useEffect, useCallback } from 'react';
import AnimatedSelect from './AnimatedSelect';
import { getSettingsFontOptions } from '../constants/fontOptions';
import { DEFAULT_LOGO_CONFIG, normalizeLogoConfig } from './DynamicAppLogo';
import './Dialog.css';
import './SettingsDialog.css';

const SettingsDialog = ({ 
  onClose, 
  theme,
  themeMode,
  fontSize = 14,
  lineHeight = 24,
  fontFamily = 'JetBrains Mono',
  lineNumbers = true,
  wordWrap = true,
  syncPreviewWithEditor = true,
  enableSlashMenuReorder = false,
  enableFirstScreenLoader = true,
  appLogoConfig = DEFAULT_LOGO_CONFIG,
  showNewWindowButton = true,
  showExportConfigButton = true,
  showPublishButton = true,
  fontDownloadState = {},
  remoteFontFamilies = [],
  onRequestFontDownload,
  onRequestFontClearAndRetry,
  onThemeChange,
  onSave
}) => {
  const [settings, setSettings] = useState({
    // 这里的 theme 指的是“用户选择的主题模式”：system/light/dark
    theme: themeMode,
    fontSize,
    lineHeight,
    tabSize: 2,
    wordWrap,
    lineNumbers,
    fontFamily,
    // 编辑与预览联动（编辑滚动时预览是否跟随）
    syncPreviewWithEditor,
    enableSlashMenuReorder,
    enableFirstScreenLoader,
    appLogoConfig: normalizeLogoConfig(appLogoConfig),
    showNewWindowButton,
    showExportConfigButton,
    showPublishButton,
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // 弹窗中的设置项始终以父组件当前状态为准，避免显示默认值
    setSettings(prev => ({
      ...prev,
      theme: themeMode,
      fontSize,
      lineHeight,
      fontFamily,
      lineNumbers,
      wordWrap,
      syncPreviewWithEditor,
      enableSlashMenuReorder,
      enableFirstScreenLoader,
      appLogoConfig: normalizeLogoConfig(appLogoConfig),
      showNewWindowButton,
      showExportConfigButton,
      showPublishButton,
    }))
    setHasChanges(false)
  }, [
    themeMode,
    fontSize,
    lineHeight,
    fontFamily,
    lineNumbers,
    wordWrap,
    syncPreviewWithEditor,
    enableSlashMenuReorder,
    enableFirstScreenLoader,
    appLogoConfig,
    showNewWindowButton,
    showExportConfigButton,
    showPublishButton
  ]);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleLogoModeChange = (mode) => {
    const normalizedMode = mode === 'custom' || mode === 'about-svg' ? mode : 'markdown';

    setSettings(prev => ({
      ...prev,
      appLogoConfig: {
        ...prev.appLogoConfig,
        mode: normalizedMode,
        customLogoUrl: normalizedMode === 'custom' ? prev.appLogoConfig?.customLogoUrl || '' : prev.appLogoConfig?.customLogoUrl || '',
      },
    }));
    setHasChanges(true);
  };

  const handleCustomLogoUrlChange = (value) => {
    setSettings(prev => ({
      ...prev,
      appLogoConfig: {
        ...prev.appLogoConfig,
        mode: 'custom',
        customLogoUrl: value,
      },
    }));
    setHasChanges(true);
  };

  const clearCustomLogo = () => {
    setSettings(prev => ({
      ...prev,
      appLogoConfig: {
        ...prev.appLogoConfig,
        mode: 'custom',
        customLogoUrl: '',
      },
    }));
    setHasChanges(true);
  };

  const saveSettings = () => {
    // 回调设置值给父组件，由父组件负责持久化到数据库
    if (onSave) {
      onSave(settings);
    }

    // 如果主题变更，通知父组件触发主题切换逻辑
    if (settings.theme !== themeMode && onThemeChange) {
      onThemeChange(settings.theme);
    }

    setHasChanges(false);
    requestClose();
  };

  const doRestoreDefaults = () => {
    const defaultSettings = {
      theme: 'system',
      fontSize: 14,
      lineHeight: 24,
      tabSize: 2,
      wordWrap: true,
      lineNumbers: true,
      fontFamily: 'JetBrains Mono',
      syncPreviewWithEditor: true,
      enableSlashMenuReorder: false,
      enableFirstScreenLoader: true,
      appLogoConfig: { ...DEFAULT_LOGO_CONFIG },
      showNewWindowButton: true,
      showExportConfigButton: true,
      showPublishButton: true,
    };
    setSettings(defaultSettings);
    setHasChanges(true);
  };

  const requestClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      onClose();
    }, 180);
  }, [isClosing, onClose]);

  const handleOverlayClick = () => {
    requestClose();
  };

  const handleCloseClick = () => {
    requestClose();
  };

  const handleCancelClick = () => {
    requestClose();
  };

  const handleConfirmClick = () => {
    saveSettings();
  };

  const handleResetClick = () => {
    doRestoreDefaults();
  };


  const getFontPreviewFamily = (fontValue) => {
    switch (fontValue) {
      case '楷体':
      case 'KaiTi':
        return `'LXGW WenKai', 'KaiTi', 'STKaiti', 'Kaiti SC', serif`
      case '思源黑体':
        return `'Noto Sans SC', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif`
      case '思源宋体':
      case 'Noto Serif SC':
        return `'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif`
      case '霞鹜文楷':
        return `'LXGW WenKai', 'KaiTi', 'STKaiti', 'Kaiti SC', serif`
      case '阿里巴巴普惠体':
        return `'Alibaba PuHuiTi 3.0 55 Regular', 'Alibaba PuHuiTi', 'PingFang SC', 'Microsoft YaHei', sans-serif`
      case 'HarmonyOS Sans SC':
        return `'HarmonyOS Sans SC', 'HarmonyOS Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif`
      case 'Ma Shan Zheng':
        return `'Ma Shan Zheng', 'KaiTi', 'STKaiti', cursive`
      case 'JetBrains Mono':
      case 'Fira Code':
      case 'Source Code Pro':
      case 'IBM Plex Mono':
      case 'Cascadia Code':
      case 'Monaco':
      case 'Consolas':
        return `'${fontValue}', 'Fira Code', 'JetBrains Mono', 'Monaco', 'Consolas', monospace`
      case 'monospace':
        return 'monospace'
      default:
        return `'${fontValue}', sans-serif`
    }
  }

  const currentSelectedFont = settings.fontFamily || ''
  const isCurrentRemoteFont = remoteFontFamilies.includes(currentSelectedFont)
  const currentDownloadState = fontDownloadState?.[currentSelectedFont] || null

  const withCloudTag = (fontName) => {
    return fontName
  }

  const renderFontOption = (option) => {
    const isRemote = remoteFontFamilies.includes(option.value)
    const state = fontDownloadState?.[option.value] || null
    const progress = state?.progress || 0
    const canDownload = isRemote && state?.status !== 'loaded'

    return (
      <>
        <span style={{ fontFamily: getFontPreviewFamily(option.value) }}>{option.label}</span>
        {canDownload && (
          <button
            type="button"
            className="btn-secondary font-download-btn"
            aria-label={state?.status === 'loading' ? `正在下载 ${option.value}` : `下载 ${option.value}`}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onRequestFontDownload?.(option.value)
            }}
            style={{
              height: 24,
              width: 24,
              minWidth: 24,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
            }}
          >
            {state?.status === 'loading' ? (
              <span
                aria-hidden="true"
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: `conic-gradient(var(--primary-color, #3b82f6) ${progress * 3.6}deg, rgba(148,163,184,0.25) 0deg)`,
                  display: 'inline-block',
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    inset: 3,
                    borderRadius: '50%',
                    background: 'var(--panel-bg, #fff)',
                    display: 'block',
                  }}
                />
              </span>
            ) : (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
          </button>
        )}
      </>
    )
  }

  return (
    <div className={`dialog-overlay compact-panel-overlay theme-${theme} ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div className={`dialog-container compact-panel-dialog settings-dialog`} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>设置</h2>
          <button className="dialog-close" onClick={handleCloseClick}>×</button>
        </div>

        <div className="dialog-body">
          <div className="settings-form">
            {/* 通用设置 */}
            <div className="settings-section">
              <h3 className="section-title">通用</h3>
              
              <div className="setting-item">
                <div className="setting-label">
                  <label>主题</label>
                  <p className="setting-description">选择编辑器的外观主题</p>
                </div>
                <AnimatedSelect
                  value={settings.theme}
                  onChange={(value) => handleChange('theme', value)}
                  options={[
                    { value: 'system', label: '随系统' },
                    { value: 'light', label: '浅色' },
                    { value: 'dark', label: '深色' },
                  ]}
                  wrapperClassName="setting-select-control"
                />
              </div>
            </div>

            {/* 编辑器设置 */}
            <div className="settings-section">
              <h3 className="section-title">编辑器</h3>
              
              <div className="setting-item">
                <div className="setting-label">
                  <label>字体大小</label>
                  <p className="setting-description">编辑器字体大小（像素）</p>
                </div>
                <input
                  type="number"
                  min="10"
                  max="24"
                  value={settings.fontSize}
                  onChange={(e) => handleChange('fontSize', parseInt(e.target.value))}
                  className="form-input"
                  style={{ width: '100px' }}
                />
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <label>行高</label>
                  <p className="setting-description">编辑器行高（像素）</p>
                </div>
                <input
                  type="number"
                  min="16"
                  max="40"
                  value={settings.lineHeight}
                  onChange={(e) => handleChange('lineHeight', parseInt(e.target.value))}
                  className="form-input"
                  style={{ width: '100px' }}
                />
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <label>Tab 大小</label>
                  <p className="setting-description">Tab 键对应的空格数</p>
                </div>
                <input
                  type="number"
                  min="2"
                  max="8"
                  value={settings.tabSize}
                  onChange={(e) => handleChange('tabSize', parseInt(e.target.value))}
                  className="form-input"
                  style={{ width: '100px' }}
                />
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <label>字体</label>
                  <p className="setting-description">编辑器字体（云字体首次使用需要下载）</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <AnimatedSelect
                    value={settings.fontFamily}
                    onChange={(value) => handleChange('fontFamily', value)}
                    options={getSettingsFontOptions(withCloudTag)}
                    wrapperClassName="setting-select-control"
                    renderOption={renderFontOption}
                    renderValue={(option) => (
                      <span style={{ fontFamily: getFontPreviewFamily(option?.value || settings.fontFamily) }}>
                        {option?.label || option?.value || settings.fontFamily}
                      </span>
                    )}
                  />
                  {isCurrentRemoteFont && currentDownloadState?.status !== 'loaded' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <p
                        className="setting-description"
                        style={{
                          margin: 0,
                          color: currentDownloadState?.status === 'error'
                            ? 'var(--danger-color, #ef4444)'
                            : 'var(--text-secondary, #6b7280)',
                        }}
                      >
                        {currentDownloadState?.status === 'loading'
                          ? `正在下载 ${currentSelectedFont}...`
                          : currentDownloadState?.status === 'error'
                            ? `${currentSelectedFont} 下载失败，已回退系统字体`
                            : `${currentSelectedFont} 为云字体，可在下拉列表中点击“下载”`}
                      </p>
                      {currentDownloadState?.status === 'error' && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => onRequestFontClearAndRetry?.(currentSelectedFont)}
                          style={{ height: 28, padding: '0 10px', fontSize: 12 }}
                        >
                          清理缓存后重试
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <label>自动换行</label>
                  <p className="setting-description">长行自动换行显示</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.wordWrap}
                    onChange={(e) => handleChange('wordWrap', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <label>显示行号</label>
                  <p className="setting-description">在编辑器左侧显示行号</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.lineNumbers}
                    onChange={(e) => handleChange('lineNumbers', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <label>编辑-预览联动</label>
                  <p className="setting-description">左右联动：左边滑动时右边跟随，右边滑动时左边跟随</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.syncPreviewWithEditor}
                    onChange={(e) => handleChange('syncPreviewWithEditor', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <label>启用斜杠菜单拖拽排序</label>
                  <p className="setting-description">开启后，可在 / 命令菜单中拖拽调整条目顺序</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.enableSlashMenuReorder}
                    onChange={(e) => handleChange('enableSlashMenuReorder', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <label>启动时显示过渡页</label>
                  <p className="setting-description">开启后，应用启动时会显示“准备就绪”过渡页</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.enableFirstScreenLoader}
                    onChange={(e) => handleChange('enableFirstScreenLoader', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

            </div>

            <div className="settings-section">
              <h3 className="section-title">Logo</h3>

              <div className="setting-item">
                <div className="setting-label">
                  <label>主页 Logo</label>
                </div>
                <AnimatedSelect
                  value={settings.appLogoConfig?.mode || 'about-svg'}
                  onChange={handleLogoModeChange}
                  options={[
                    { value: 'about-svg', label: '动态 SVG Logo' },
                    { value: 'markdown', label: 'Markdown Logo' },
                    { value: 'custom', label: '自定义 URL' },
                  ]}
                  wrapperClassName="setting-select-control"
                />
              </div>

              {settings.appLogoConfig?.mode === 'custom' && (
                <>
                  <div className="setting-item">
                    <div className="setting-label">
                      <label>自定义 Logo URL</label>
                      <p className="setting-description">支持 http(s)、/images/...、data:image/...；建议使用透明背景 PNG/SVG</p>
                    </div>
                    <input
                      type="text"
                      value={settings.appLogoConfig?.customLogoUrl || ''}
                      onChange={(e) => handleCustomLogoUrlChange(e.target.value)}
                      placeholder="例如：https://example.com/logo.svg"
                      className="form-input"
                    />
                  </div>

                  {(settings.appLogoConfig?.customLogoUrl || '').trim() && (
                    <div className="setting-item">
                      <div className="setting-label">
                        <label>清空自定义 Logo</label>
                        <p className="setting-description">恢复到默认 Logo 显示</p>
                      </div>
                      <button type="button" className="btn-secondary" onClick={clearCustomLogo}>
                        清空
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 工具栏按钮 */}
            <div className="settings-section">
              <h3 className="section-title">工具栏按钮</h3>

              <div className="setting-item">
                <div className="setting-label">
                  <label>显示“新窗口”</label>
                  <p className="setting-description">控制顶部菜单栏“新窗口”入口是否显示</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.showNewWindowButton}
                    onChange={(e) => handleChange('showNewWindowButton', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <label>显示“导出配置”</label>
                  <p className="setting-description">控制顶部工具栏“导出配置”按钮是否显示</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.showExportConfigButton}
                    onChange={(e) => handleChange('showExportConfigButton', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <label>显示“发布”</label>
                  <p className="setting-description">控制顶部工具栏“发布到多平台”按钮是否显示</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.showPublishButton}
                    onChange={(e) => handleChange('showPublishButton', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={handleResetClick}>恢复默认</button>
          <div className="footer-right">
            <button className="btn-secondary" onClick={handleCancelClick}>取消</button>
            <button 
              className="btn-primary" 
              onClick={handleConfirmClick}
              disabled={!hasChanges}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;

