import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ShoppingCart, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import './Dialog.css'
import './SyncDialog.css'
import {
  detectCOSE,
  getPlatforms,
  checkPlatformsProgressive,
  startSyncBatch,
  syncToPlatform,
} from '../utils/coseClient'
import { packContent, titleFromPath } from '../utils/contentPacker'
import { useAppUi } from '../context/AppUiContext'

const COSE_STORE_URL =
  'https://chromewebstore.google.com/detail/ilhikcdphhpjofhlnbojifbihhfmmhfk'

const PLATFORM_LOGIN_URLS = {
  wechat:       'https://mp.weixin.qq.com',
  juejin:       'https://juejin.cn/login',
  csdn:         'https://passport.csdn.net/login',
  zhihu:        'https://www.zhihu.com/signin',
  douyin:       'https://creator.douyin.com',
  xiaohongshu:  'https://creator.xiaohongshu.com',
  bilibili:     'https://passport.bilibili.com/login',
  toutiao:      'https://mp.toutiao.com/profile_v4/index',
  weibo:        'https://weibo.com/login.php',
  jianshu:      'https://www.jianshu.com/sign_in',
  segmentfault: 'https://segmentfault.com/user/login',
  oschina:      'https://www.oschina.net/login',
  cnblogs:      'https://passport.cnblogs.com/user/signin',
  infoq:        'https://www.infoq.cn/login',
  '51cto':      'https://blog.51cto.com',
  sspai:        'https://sspai.com/login',
  v2ex:         'https://www.v2ex.com/signin',
  baijiahe:     'https://baijiahao.baidu.com/builder/rc/login',
  penguin:      'https://om.qq.com/userAuth/index',
  sohu:         'https://mp.sohu.com/login',
  netease:      'https://dy.163.com/login.html',
  ifanr:        'https://ifanr.com/login',
}

const PLATFORM_CATEGORY = {
  wechat: 'media', zhihu: 'media', netease: 'media', weibo: 'media',
  sspai: 'media', douyin: 'media', toutiao: 'media', baijiahe: 'media',
  sohu: 'media', bilibili: 'media', xiaohongshu: 'media', penguin: 'media',
  csdn: 'blog', juejin: 'blog', '51cto': 'blog', oschina: 'blog',
  cnblogs: 'blog', jianshu: 'blog', segmentfault: 'blog', infoq: 'blog',
  v2ex: 'blog', ifanr: 'blog',
}

const CATEGORY_LABELS = {
  media: '媒体平台',
  blog:  '博客平台',
  other: '其他平台',
}

function extractFirstImage(md) {
  if (!md) return ''
  const m = md.match(/!\[[^\]]*\]\(([^)]+)\)/)
  return m ? m[1] : ''
}

function extractFirstTitle(md) {
  if (!md) return ''
  const m = md.match(/^#{1,6}\s+(.+)/m)
  return m ? m[1].trim() : ''
}

function extractFirstParagraph(md) {
  if (!md) return ''
  const lines = md.split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (t && !t.startsWith('#') && !t.startsWith('!') && !t.startsWith('>') && !t.startsWith('-') && !t.startsWith('*') && !t.startsWith('`')) {
      return t.slice(0, 120)
    }
  }
  return ''
}

function SyncDialog({ onClose, theme, currentPath, markdown, renderedHtml }) {
  const [isClosing, setIsClosing] = useState(false)
  const { showToast } = useAppUi()
  const themeClass = theme === 'light' ? 'theme-light' : theme === 'md3' ? 'theme-md3' : 'theme-dark'

  const [metaCover, setMetaCover] = useState('')
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDesc,  setMetaDesc]  = useState('')

  const [coseInstalled,  setCoseInstalled]  = useState(null)
  const [platforms,      setPlatforms]      = useState([])
  const [loginStatus,    setLoginStatus]    = useState({})
  const [detectProgress, setDetectProgress] = useState({ done: 0, total: 0 })
  const [detecting,      setDetecting]      = useState(false)
  const [selected,       setSelected]       = useState(new Set())
  const [syncResults,    setSyncResults]    = useState({})
  const [isSyncing,      setIsSyncing]      = useState(false)
  const [packingContent, setPackingContent] = useState(false)
  const [collapsed,      setCollapsed]      = useState({ media: false, blog: false, other: false })
  const abortRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const installed = await detectCOSE(2500)
      if (cancelled) return
      setCoseInstalled(installed)
      if (installed) loadPlatforms()
    })()
    return () => { cancelled = true }
  }, [])

  const loadPlatforms = useCallback(async () => {
    try {
      const res = await getPlatforms()
      const list = res?.platforms || []
      setPlatforms(list)
      setLoginStatus({})
      setSelected(new Set())
      setDetecting(true)
      setDetectProgress({ done: 0, total: list.length })
      await checkPlatformsProgressive(
        list,
        (data) => {
          const { platformId, result, completed, total } = data
          setLoginStatus(prev => ({ ...prev, [platformId]: result }))
          setDetectProgress({ done: completed, total })
          if (result?.loggedIn) {
            setSelected(prev => new Set([...prev, platformId]))
          }
        },
        () => setDetecting(false)
      )
    } catch (e) {
      console.error('[SyncDialog] loadPlatforms error:', e)
      setDetecting(false)
    }
  }, [])

  const grouped = (() => {
    const map = { media: [], blog: [], other: [] }
    for (const p of platforms) {
      const cat = PLATFORM_CATEGORY[p.id] || 'other'
      map[cat].push(p)
    }
    return map
  })()

  const categories = ['media', 'blog', 'other'].filter(c => grouped[c]?.length > 0)

  const isCatAllSelected = (cat) => {
    const ids = (grouped[cat] || []).map(p => p.id)
    return ids.length > 0 && ids.every(id => selected.has(id))
  }

  const toggleCatSelect = (cat) => {
    const ids = (grouped[cat] || []).map(p => p.id)
    setSelected(prev => {
      const next = new Set(prev)
      if (ids.every(id => next.has(id))) {
        ids.forEach(id => next.delete(id))
      } else {
        ids.forEach(id => next.add(id))
      }
      return next
    })
  }

  const togglePlatform = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === platforms.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(platforms.map(p => p.id)))
    }
  }

  const toggleCollapse = (cat) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  const doSyncToPlatforms = async () => {
    if (selected.size === 0 || isSyncing) return
    abortRef.current = false
    setIsSyncing(true)
    setSyncResults({})
    setPackingContent(true)
    let packed
    try {
      packed = await packContent({
        title: metaTitle || titleFromPath(currentPath),
        markdown,
        renderedHtml,
        cover: metaCover || undefined,
        description: metaDesc || undefined,
      })
    } catch (e) {
      setPackingContent(false)
      setIsSyncing(false)
      showToast('内容准备失败：' + e.message, 'error')
      return
    }
    setPackingContent(false)
    await startSyncBatch().catch(() => {})
    const targets = platforms.filter(p => selected.has(p.id))
    for (const platform of targets) {
      if (abortRef.current) break
      setSyncResults(prev => ({ ...prev, [platform.id]: { status: 'syncing' } }))
      try {
        const result = await syncToPlatform(platform.id, packed)
        setSyncResults(prev => ({
          ...prev,
          [platform.id]: { status: result?.success ? 'ok' : 'err', msg: result?.message || '' },
        }))
      } catch (e) {
        setSyncResults(prev => ({
          ...prev,
          [platform.id]: { status: 'err', msg: e.message },
        }))
      }
    }
    setIsSyncing(false)
  }

  const allSelected   = platforms.length > 0 && selected.size === platforms.length
  const selectedCount = selected.size
  const autoTitle     = titleFromPath(currentPath)

  const requestClose = useCallback(() => {
    if (isClosing) return
    setIsClosing(true)
    window.setTimeout(() => {
      onClose()
    }, 180)
  }, [isClosing, onClose])

  const handleOverlayClick = () => {
    if (!isSyncing) {
      requestClose()
    }
  }

  const handleCloseClick = () => {
    requestClose()
  }

  const handleConfirmClick = () => {
    doSyncToPlatforms()
  }

  // ── 未安装引导界面 ────────────────────────────────────────────────────
  if (coseInstalled === false) {
    return (
      <div className={`dialog-overlay ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
        <div className={`dialog-container sync-dialog ${themeClass}`} onClick={e => e.stopPropagation()}>
          <div className="dialog-header">
            <h2>发布到平台</h2>
            <button className="dialog-close" onClick={handleCloseClick}>×</button>
          </div>
          <div className="dialog-content">
            <div className="cose-install-guide">
              <div className="cose-install-icon">
                <img
                  src="https://github.com/doocs/cose/raw/main/assets/headerLight.svg"
                  alt="COSE"
                  className="cose-logo-img"
                  onError={e => { e.target.style.display = 'none' }}
                />
              </div>
              <h3>需要安装 COSE 扩展</h3>
              <p className="cose-install-desc">
                多平台同步功能由 <strong>COSE</strong>（Create Once, Sync Everywhere）
                Chrome 扩展提供支持，支持一键同步到 30+ 内容平台。
              </p>
              <div className="cose-platforms-preview">
                {['微信公众号','掘金','CSDN','知乎','抖音','小红书','B站','今日头条'].map(name => (
                  <span key={name} className="cose-platform-tag">{name}</span>
                ))}
                <span className="cose-platform-tag more">+22 个平台</span>
              </div>
              <div className="cose-install-steps">
                <div className="cose-step"><span className="step-num">1</span><span>点击下方按钮，跳转到 Chrome 扩展商店</span></div>
                <div className="cose-step"><span className="step-num">2</span><span>点击「添加到 Chrome」安装扩展（约 10 秒）</span></div>
                <div className="cose-step"><span className="step-num">3</span><span>安装完成后回到此页面，点击「已安装，重新检测」</span></div>
              </div>
              <div className="cose-install-actions">
                <a href={COSE_STORE_URL} target="_blank" rel="noopener noreferrer" className="btn-primary cose-install-btn">
                  <ShoppingCart size={16} /> 前往 Chrome 扩展商店安装
                </a>
                <button className="btn-secondary" onClick={() => { setCoseInstalled(null); detectCOSE(2500).then(ok => { setCoseInstalled(ok); if (ok) loadPlatforms() }) }}>
                  已安装，重新检测
                </button>
              </div>
              <details className="cose-dev-mode">
                <summary>开发者模式手动加载</summary>
                <ol>
                  <li>克隆仓库：<code>git clone https://github.com/doocs/cose.git</code></li>
                  <li>打开 Chrome，进入 <code>chrome://extensions/</code></li>
                  <li>开启右上角「开发者模式」</li>
                  <li>点击「加载已解压的扩展程序」，选择 <code>cose</code> 目录</li>
                </ol>
              </details>
            </div>
          </div>
          <div className="dialog-footer sync-footer">
            <div className="sync-footer-actions">
              <button className="btn-secondary" onClick={handleCloseClick}>关闭</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── 检测中 loading ────────────────────────────────────────────────────
  if (coseInstalled === null) {
    return (
      <div className={`dialog-overlay ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
        <div className={`dialog-container sync-dialog ${themeClass}`} onClick={e => e.stopPropagation()}>
          <div className="dialog-header">
            <h2>发布到平台</h2>
            <button className="dialog-close" onClick={handleCloseClick}>×</button>
          </div>
          <div className="dialog-content sync-loading-state">
            <div className="sync-spinner" />
            <p>正在检测 COSE 扩展...</p>
          </div>
        </div>
      </div>
    )
  }

  // ── 主界面 ────────────────────────────────────────────────────────────
  const hasSyncResults = Object.keys(syncResults).length > 0

  return (
    <div className={`dialog-overlay ${isClosing ? 'closing' : ''}`} onClick={handleOverlayClick}>
      <div className={`dialog-container sync-dialog ${themeClass}`} onClick={e => e.stopPropagation()}>

        {/* 头部 */}
        <div className="dialog-header">
          <div className="sync-header-left">
            <h2>发布到平台</h2>
            {autoTitle && <span className="sync-article-title">《{autoTitle}》</span>}
          </div>
          <button className="dialog-close" onClick={handleCloseClick} disabled={isSyncing}>×</button>
        </div>

        {/* 元信息配置区 */}
        <div className="sync-meta-section">
          <div className="sync-meta-row">
            <label className="sync-meta-label">封面</label>
            <input
              className="sync-meta-input"
              type="text"
              placeholder={extractFirstImage(markdown) || '自动提取第一张图'}
              value={metaCover}
              onChange={e => setMetaCover(e.target.value)}
              disabled={isSyncing}
            />
            {extractFirstImage(markdown) && !metaCover && (
              <button className="sync-meta-auto-btn" title="使用自动提取的图片"
                onClick={() => setMetaCover(extractFirstImage(markdown))}>↩</button>
            )}
          </div>
          <div className="sync-meta-row">
            <label className="sync-meta-label">标题</label>
            <input
              className="sync-meta-input"
              type="text"
              placeholder={extractFirstTitle(markdown) || autoTitle || '自动提取第一个标题'}
              value={metaTitle}
              onChange={e => setMetaTitle(e.target.value)}
              disabled={isSyncing}
            />
            {(extractFirstTitle(markdown) || autoTitle) && !metaTitle && (
              <button className="sync-meta-auto-btn" title="使用自动提取的标题"
                onClick={() => setMetaTitle(extractFirstTitle(markdown) || autoTitle)}>↩</button>
            )}
          </div>
          <div className="sync-meta-row sync-meta-row--desc">
            <label className="sync-meta-label">描述</label>
            <textarea
              className="sync-meta-input sync-meta-textarea"
              placeholder={extractFirstParagraph(markdown) || '自动提取第一个段落'}
              value={metaDesc}
              onChange={e => setMetaDesc(e.target.value)}
              disabled={isSyncing}
              rows={2}
            />
            {extractFirstParagraph(markdown) && !metaDesc && (
              <button className="sync-meta-auto-btn" title="使用自动提取的描述"
                onClick={() => setMetaDesc(extractFirstParagraph(markdown))}>↩</button>
            )}
          </div>
        </div>

        {/* 工具栏 */}
        <div className="sync-toolbar">
          <div className="sync-toolbar-left">
            <button className="sync-tool-btn" onClick={toggleSelectAll} disabled={isSyncing || platforms.length === 0}>
              {allSelected ? '取消全选' : '全选'}
            </button>
            <span className="sync-select-count">已选 {selectedCount} / {platforms.length}</span>
          </div>
          <button className="sync-tool-btn" onClick={loadPlatforms} disabled={isSyncing || detecting}>
            {detecting ? `检测中 ${detectProgress.done}/${detectProgress.total}` : '重新检测'}
          </button>
        </div>

        {/* 平台分组列表 */}
        <div className="dialog-content sync-platform-list">
          {platforms.length === 0 && !detecting && (
            <div className="sync-empty">暂无平台数据，请点击「重新检测」</div>
          )}
          {categories.map(cat => (
            <div key={cat} className="sync-category">
              <div className="sync-category-header" onClick={() => toggleCollapse(cat)}>
                <span className={`sync-category-arrow ${collapsed[cat] ? 'collapsed' : ''}`}>▼</span>
                <div
                  className={`sync-checkbox sync-checkbox-sm ${isCatAllSelected(cat) ? 'sync-checkbox-on' : ''}`}
                  onClick={e => { e.stopPropagation(); toggleCatSelect(cat) }}
                >
                  {isCatAllSelected(cat) && <svg viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span className="sync-category-label">{CATEGORY_LABELS[cat] || cat}</span>
                <span className="sync-category-count">{grouped[cat].length} 个平台</span>
              </div>
              {!collapsed[cat] && grouped[cat].map(platform => {
                const login       = loginStatus[platform.id]
                const result      = syncResults[platform.id]
                const isChecked   = selected.has(platform.id)
                const isDetecting = detecting && login === undefined
                return (
                  <div
                    key={platform.id}
                    className={`sync-platform-row ${isChecked ? 'checked' : ''} ${result?.status === 'ok' ? 'synced' : ''} ${result?.status === 'err' ? 'sync-failed' : ''}`}
                    onClick={() => !isSyncing && togglePlatform(platform.id)}
                  >
                    <div className={`sync-checkbox ${isChecked ? 'sync-checkbox-on' : ''}`}>
                      {isChecked && <svg viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <img className="sync-platform-icon" src={platform.icon} alt={platform.title} onError={e => { e.target.style.display = 'none' }} />
                    <span className="sync-platform-name">{platform.title || platform.name}</span>
                    <span className="sync-platform-status">
                      {result?.status === 'syncing' && <span className="status-syncing"><Loader2 size={13} className="spin-icon" /> 同步中...</span>}
                      {result?.status === 'ok'      && <span className="status-ok"><CheckCircle2 size={13} /> {result.msg || '已同步'}</span>}
                      {result?.status === 'err'     && <span className="status-err" title={result.msg}><XCircle size={13} /> {result.msg?.slice(0, 20) || '失败'}</span>}
                      {!result && isDetecting       && <span className="status-detecting">检测中...</span>}
                      {!result && !isDetecting && login?.loggedIn && (
                        <span className="status-loggedin">
                          {login.avatar && <img src={login.avatar} className="login-avatar" alt="" onError={e => { e.target.style.display='none' }} />}
                          <span className="login-username">{login.username || '已登录'}</span>
                        </span>
                      )}
                      {!result && !isDetecting && login && !login.loggedIn && (
                        <a
                          className="status-notlogin status-login-btn"
                          href={platform.loginUrl || PLATFORM_LOGIN_URLS[platform.id] || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                        >去登录</a>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* 底部 */}
        <div className="dialog-footer sync-footer">
          {packingContent && <span className="sync-packing-tip"><Loader2 size={13} className="spin-icon" /> 正在准备内容...</span>}
          {hasSyncResults && !isSyncing && (
            <span className="sync-done-tip">
              <CheckCircle2 size={13} /> {Object.values(syncResults).filter(r => r.status === 'ok').length} 成功
              {Object.values(syncResults).filter(r => r.status === 'err').length > 0 &&
                <span>，<XCircle size={13} /> {Object.values(syncResults).filter(r => r.status === 'err').length} 失败</span>}
            </span>
          )}
          <div className="sync-footer-actions">
            <button className="btn-secondary" onClick={handleCloseClick} disabled={isSyncing}>
              {isSyncing ? '同步中...' : '关闭'}
            </button>
            <button className="btn-primary" onClick={handleConfirmClick} disabled={isSyncing || selectedCount === 0}>
              {isSyncing
                ? `同步中 ${Object.keys(syncResults).length}/${selectedCount}`
                : `开始同步 (${selectedCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SyncDialog
