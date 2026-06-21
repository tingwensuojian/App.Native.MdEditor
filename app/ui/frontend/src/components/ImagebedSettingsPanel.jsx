/**
 * 图床设置面板组件
 * 用于管理多个图床配置
 */

import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Check, X, RefreshCw, Radio, Circle, PencilLine, MousePointerClick, Github, FolderClosed, CloudUpload, Network, Boxes, Database } from 'lucide-react'
import './ImagebedSettingsPanel.css'
import AddImagebedDialog from './AddImagebedDialog'

function ImagebedSettingsPanel({ onNotify, theme = 'light', onDefaultChanged, onImagebedNotification }) {
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingConfig, setEditingConfig] = useState(null)
  const [testingId, setTestingId] = useState(null)
  const [editingLoading, setEditingLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pendingDeleteConfig, setPendingDeleteConfig] = useState(null)

  // 加载图床配置
  const loadConfigs = async () => {
    setLoading(true)
    try {
      const response = await fetch('api/imagebed/list')
      const result = await response.json()
      
      if (result.ok) {
        setConfigs(result.configs || [])
      } else {
        onNotify?.('加载图床配置失败', 'error')
      }
    } catch (err) {
      console.error('Failed to load imagebed configs:', err)
      onNotify?.('加载图床配置失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  // 初始化加载
  useEffect(() => {
    loadConfigs()
  }, [])

  // 删除图床
  const handleDelete = (config) => {
    setPendingDeleteConfig(config)
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = async () => {
    if (!pendingDeleteConfig) return
    try {
      const response = await fetch(`api/imagebed/${pendingDeleteConfig.id}`, {
        method: 'DELETE',
      })
      const result = await response.json()

      if (result.ok) {
        onNotify?.('图床已删除', 'success')
        loadConfigs()
      } else {
        onNotify?.('删除失败', 'error')
      }
    } catch (err) {
      console.error('Failed to delete imagebed:', err)
      onNotify?.('删除失败', 'error')
    } finally {
      setShowDeleteConfirm(false)
      setPendingDeleteConfig(null)
    }
  }

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false)
    setPendingDeleteConfig(null)
  }

  // 测试连接
  const handleTest = async (id) => {
    setTestingId(id)
    try {
      const response = await fetch(`api/imagebed/${id}/test`, {
        method: 'POST',
      })
      const result = await response.json()

      if (result.success) {
        onNotify?.('连接成功', 'success')
      } else {
        onNotify?.(`连接失败: ${result.error}`, 'error')
      }
    } catch (err) {
      console.error('Failed to test imagebed:', err)
      onNotify?.('连接失败', 'error')
    } finally {
      setTestingId(null)
    }
  }

  // 设置默认图床
  const handleSetDefault = async (id) => {
    try {
      const response = await fetch(`api/imagebed/${id}/default`, {
        method: 'PUT',
      })
      const result = await response.json()

      if (result.ok) {
        // 显示通知到对话框底部，而不是桌面
        onImagebedNotification?.('✓ 已设置为默认图床')
        // 3秒后清除通知
        setTimeout(() => {
          onImagebedNotification?.(null)
        }, 3000)
        loadConfigs()
        onDefaultChanged?.()
      } else {
        onNotify?.('设置失败', 'error')
      }
    } catch (err) {
      console.error('Failed to set default imagebed:', err)
      onNotify?.('设置失败', 'error')
    }
  }

  // 编辑图床
  const handleEdit = async (config) => {
    setEditingLoading(true)
    try {
      const response = await fetch(`api/imagebed/${config.id}?secrets=true`)
      const result = await response.json()

      if (result.ok && result.config) {
        setEditingConfig(result.config)
      } else {
        setEditingConfig(config)
        onNotify?.('无法读取密钥，已使用脱敏配置', 'warning')
      }
    } catch (err) {
      console.error('Failed to load imagebed secrets:', err)
      setEditingConfig(config)
      onNotify?.('无法读取密钥，已使用脱敏配置', 'warning')
    } finally {
      setEditingLoading(false)
      setShowEditDialog(true)
    }
  }

  // 保存编辑
  const handleSaveEdit = async (name, config) => {
    try {
      const response = await fetch(`api/imagebed/${editingConfig.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config }),
      })
      const result = await response.json()

      if (result.ok) {
        onNotify?.('图床已更新', 'success')
        setShowEditDialog(false)
        setEditingConfig(null)
        loadConfigs()
      } else {
        onNotify?.('更新失败', 'error')
      }
    } catch (err) {
      console.error('Failed to update imagebed:', err)
      onNotify?.('更新失败', 'error')
    }
  }

  return (
    <div className={`imagebed-settings-panel ${theme}`}>
      <div className="settings-header">
        <h3>已配置的图床</h3>
        <button 
          className="refresh-btn"
          onClick={loadConfigs}
          disabled={loading}
          title="刷新"
        >
          <RefreshCw size={18} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <RefreshCw size={32} className="spinning" />
          <p>加载中...</p>
        </div>
      ) : configs.length === 0 ? (
        <div className="empty-state">
          <p>还没有配置任何图床</p>
          <button 
            className="add-btn"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus size={18} />
            添加第一个图床
          </button>
        </div>
      ) : (
        <div className="configs-list">
          {configs.map(config => (
            <div key={config.id} className={`config-item ${config.isDefault ? 'default' : ''}`}>
              <div className="config-header">
                <div className="config-info">
                  <div className="config-name">
                    {config.type === 'github' && <Github size={16} className="default-icon" />}
                    {config.type === 'local' && <FolderClosed size={16} className="default-icon" />}
                    {config.type === 'aliyun' && (
                      <svg
                        viewBox="0 0 1433 1024"
                        className="default-icon aliyun-icon"
                        width="16"
                        height="16"
                        aria-hidden="true"
                      >
                        <path
                          d="M257.024 757.658a66.97 66.97 0 0 1-51.917-65.536V331.776c2.253-32.768 22.528-58.368 51.815-65.536l322.355-72.5L613.069 51.2h-374.17C105.984 51.2 0 161.178 0 296.858v425.676c0 135.578 108.237 247.91 238.9 247.91h374.169l-33.792-142.642-322.355-70.144zM1194.598 51.2H818.176l33.792 142.643 322.355 72.602c29.287 6.963 51.815 32.768 51.815 65.536v360.14c-2.253 32.769-22.528 58.369-51.815 65.537l-322.355 72.499L818.176 972.8h376.422c130.765 0 239.002-109.978 239.002-247.91V296.858C1431.347 161.075 1325.363 51.2 1194.7 51.2zM579.174 493.26h275.047v35.124H579.277v-35.123z"
                          fill="currentColor"
                        />
                      </svg>
                    )}
                    {config.type === 'qiniu' && (
                      <svg
                        viewBox="0 0 1532 1024"
                        className="default-icon qiniu-icon"
                        width="16"
                        height="16"
                        aria-hidden="true"
                      >
                        <path
                          d="M0.303407 0h28.065186c15.094519 3.792593 29.354667 10.998519 39.215407 23.286519 86.243556 100.200296 194.484148 181.134222 314.481778 236.430222-5.840593-50.669037-12.743111-101.262222-18.280297-152.007111 33.754074-3.489185 70.618074 12.667259 82.223408 46.497185 15.701333 48.165926 26.851556 97.697185 41.111704 146.318222 173.624889 54.46163 363.254519 57.268148 537.941333 5.840593 169.832296-49.379556 324.342519-149.276444 439.789037-283.230815 9.784889-12.212148 23.969185-19.342222 38.987852-23.134815h27.989333c-49.910519 147.683556-149.655704 276.631704-272.914963 371.067259-199.793778 154.055111-472.860444 204.344889-715.207111 135.243852 28.292741 101.869037 56.357926 203.813926 85.257482 305.531259 5.461333 31.706074 27.45837 62.881185 61.819259 65.384297 58.102519 1.972148 116.356741 0.075852 174.459259 0.910222 28.368593 1.744593 59.088593-13.50163 69.025185-41.263408 18.583704-55.978667 28.444444-114.915556 50.744889-169.680592 27.685926-63.563852 96.104296-104.296296 165.281185-98.531556-11.757037 98.910815-23.286519 197.82163-35.877926 296.580741-11.301926 78.051556-71.149037 154.282667-154.510222 158.757926H611.51763c-92.690963-5.082074-152.917333-96.331852-157.847704-182.423704-15.701333-129.554963-31.706074-259.034074-47.786667-388.513185C220.122074 360.978963 68.114963 196.835556 0.303407 0z"
                          fill="currentColor"
                        />
                      </svg>
                    )}
                    {config.type === 'tencent' && (
                      <svg
                        viewBox="0 0 1024 1024"
                        className="default-icon tencent-icon"
                        width="16"
                        height="16"
                        aria-hidden="true"
                      >
                        <path
                          d="M465.46176 165.888a349.184 349.184 0 0 0-126.976 46.592l-9.728 5.632a235.52 235.52 0 0 0-20.992 15.36 303.104 303.104 0 0 0-86.528 108.032 344.064 344.064 0 0 0-21.504 60.928c-3.072 10.752-7.168 15.36-13.312 15.36A334.336 334.336 0 0 0 102.45376 451.584a388.096 388.096 0 0 0-51.2 41.984 212.992 212.992 0 0 0-51.2 143.36 208.384 208.384 0 0 0 68.608 157.696 227.84 227.84 0 0 0 96.256 55.808c40.448 10.752 28.672 10.24 345.6 10.24 266.752 0 293.888 0 311.808-3.072a334.848 334.848 0 0 0 57.856-14.848l9.728-4.608a264.704 264.704 0 0 0 47.616-29.184A222.208 222.208 0 0 0 1024.05376 636.416a261.632 261.632 0 0 0-13.312-73.216 27.136 27.136 0 0 1-3.072-8.192 198.656 198.656 0 0 0-19.968-37.376l-9.728-12.288a167.424 167.424 0 0 0-38.4-38.4 173.568 173.568 0 0 0-43.008-28.16l-9.216-4.096a494.08 494.08 0 0 0-51.2-17.408 358.4 358.4 0 0 0-37.888-3.072 216.576 216.576 0 0 0-76.8 7.68l-20.992 7.168a239.104 239.104 0 0 0-51.2 26.112 1382.4 1382.4 0 0 0-108.544 92.672q-95.744 88.576-192.512 176.128l-37.376 34.816-16.896 16.384h-34.304c-18.944 0-42.496 0-51.2-4.096a138.24 138.24 0 0 1-112.128-97.28 185.344 185.344 0 0 1 0-67.072 150.528 150.528 0 0 1 47.616-71.68 168.448 168.448 0 0 1 93.696-33.28 179.712 179.712 0 0 1 114.176 51.2l22.528 18.944 22.528 18.944a59.904 59.904 0 0 0 15.36 11.264c3.584 0 11.776-6.656 40.96-33.28a197.12 197.12 0 0 0 25.088-26.112 109.056 109.056 0 0 0-17.408-19.456l-23.552-19.456c-3.584-4.096-40.448-32.256-59.392-46.08a256 256 0 0 0-64-31.744 70.656 70.656 0 0 1-18.944-8.704 228.864 228.864 0 0 1 17.92-51.2 239.104 239.104 0 0 1 51.2-64 216.064 216.064 0 0 1 83.968-44.032L468.02176 256a173.056 173.056 0 0 1 44.032-4.096A171.52 171.52 0 0 1 563.25376 256a224.256 224.256 0 0 1 96.256 46.08A240.128 240.128 0 0 1 706.61376 358.4a150.016 150.016 0 0 0 10.24 15.36 64.512 64.512 0 0 0 14.848 0 370.688 370.688 0 0 1 45.056-4.096c35.84 0 36.864 0 29.184-15.36a123.904 123.904 0 0 1-6.656-14.848 75.264 75.264 0 0 0-7.168-14.848 81.92 81.92 0 0 1-5.632-9.728 364.544 364.544 0 0 0-40.448-51.2 320 320 0 0 0-90.112-64l-23.04-10.752a310.272 310.272 0 0 0-37.376-11.776 354.816 354.816 0 0 0-130.56-8.192z m350.208 338.944a139.776 139.776 0 0 1 80.896 45.568 115.2 115.2 0 0 1 32.768 84.48 82.944 82.944 0 0 1-4.608 40.448 124.928 124.928 0 0 1-24.064 45.568 147.456 147.456 0 0 1-76.288 47.104 406.528 406.528 0 0 1-41.984 4.608H434.74176a563.2 563.2 0 0 1 48.64-47.104L545.84576 665.6c22.016-20.48 107.008-97.792 119.296-108.032l12.8-11.776a245.76 245.76 0 0 1 43.008-29.184 177.152 177.152 0 0 1 26.112-10.24l17.408-5.12a199.68 199.68 0 0 1 51.2 0z m0 0"
                          fill="currentColor"
                        />
                      </svg>
                    )}
                    {config.type === 'custom' && <CloudUpload size={16} className="default-icon" />}
                    {config.type === 'webdav' && <Network size={16} className="default-icon" />}
                    {config.type === 'MinIO' && (
                      <svg
                        viewBox="0 0 1024 1024"
                        className="default-icon minio-icon"
                        width="16"
                        height="16"
                        aria-hidden="true"
                      >
                        <path d="M682.016 55.84l192.736 216.64c0.864 0.864 0.864 2.048 0 2.944a4.704 4.704 0 0 1-4.928 0.128l-0.224-0.128-249.632-178.784 62.048-40.8z" fill="currentColor" />
                        <path d="M256.32 638.976c42.304-61.472 99.776-117.44 169.888-165.44a851.84 851.84 0 0 1 84.928-51.168v126.176L256.32 638.976z m-147.008 116.928l401.824-140.224v321.088l90.432 80.736V582.88l54.912-19.488c134.496-46.496 188.576-159.04 120.768-251.36a204.864 204.864 0 0 0-45.856-44.736l-206.816-148.48c-17.152-12.704-16.16-32.576 2.272-44.448 18.592-11.808 47.552-11.136 64.832 1.536l29.056 20.736 61.248-40.928C608.672-9.632 518.656-1.376 466.976 31.296c-52.928 34.272-55.456 91.456-5.728 127.872l209.088 149.6c70.24 51.776 66.08 132.864-9.28 181.12a199.552 199.552 0 0 1-31.584 16.288l-28.384 10.08v-202.88c-252.064 89.184-432.64 251.328-491.84 441.792v0.736z" fill="currentColor" />
                        <path d="M601.568 582.752v65.632l-90.432 31.52V614.72l90.432-31.968z" fill="currentColor" />
                      </svg>
                    )}
                    {config.type === 'customoss' && <Database size={16} className="default-icon" />}
                    {config.type !== 'github' && config.type !== 'local' && config.type !== 'aliyun' && config.type !== 'qiniu' && config.type !== 'tencent' && config.type !== 'custom' && config.type !== 'webdav' && config.type !== 'MinIO' && config.type !== 'customoss' && (
                      <Circle size={16} className="default-icon" />
                    )}
                    <span>{config.name}</span>
                  </div>
                  <div className="config-type">{config.type}</div>
                </div>
                <div className="config-actions">
                  {config.isDefault && <span className="default-badge">默认</span>}
                  <button
                    className="action-btn edit-btn"
                    onClick={() => handleEdit(config)}
                    title={editingLoading ? '加载中...' : '编辑'}
                    disabled={editingLoading}
                  >
                    <PencilLine size={16} />
                  </button>
                  {!config.isDefault && (
                    <button
                      className="action-btn default-btn"
                      onClick={() => handleSetDefault(config.id)}
                      title="设置为默认"
                    >
                      <MousePointerClick size={16} />
                    </button>
                  )}
                  <button
                    className="action-btn delete-btn"
                    onClick={() => handleDelete(config)}
                    disabled={config.isDefault}
                    title={config.isDefault ? '默认图床不能删除' : '删除'}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button 
        className="add-imagebed-btn"
        onClick={() => setShowAddDialog(true)}
      >
        <Plus size={18} />
        添加新图床
      </button>

      {showAddDialog && (
        <AddImagebedDialog
          onClose={() => setShowAddDialog(false)}
          onSuccess={() => {
            setShowAddDialog(false)
            loadConfigs()
          }}
          onNotify={onNotify}
          theme={theme}
          onTestNotification={onImagebedNotification}
        />
      )}

      {showEditDialog && editingConfig && (
        <AddImagebedDialog
          onClose={() => {
            setShowEditDialog(false)
            setEditingConfig(null)
          }}
          onSuccess={() => {
            setShowEditDialog(false)
            setEditingConfig(null)
            loadConfigs()
          }}
          onNotify={onNotify}
          theme={theme}
          editingConfig={editingConfig}
          onSaveEdit={handleSaveEdit}
          onTestNotification={onImagebedNotification}
        />
      )}

      {showDeleteConfirm && pendingDeleteConfig && (
        <div className={`imagebed-delete-overlay ${theme}`}>
          <div className={`imagebed-delete-dialog ${theme}`}>
            <div className="delete-dialog-header">确认删除</div>
            <div className="delete-dialog-body">
              将删除图床“{pendingDeleteConfig.name}”，此操作不可恢复。
            </div>
            <div className="delete-dialog-actions">
              <button className="delete-dialog-btn cancel" onClick={handleCancelDelete}>
                取消
              </button>
              <button className="delete-dialog-btn confirm" onClick={handleConfirmDelete}>
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImagebedSettingsPanel
