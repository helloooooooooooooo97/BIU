import { readStorageString, removeStorageKey, writeStorageString } from '@biu/biu-ui/client-storage'
import { emitAppEvent, onAppEvent, onAppEvents } from '@biu/biu-ui/app-events'
import { apiFetch, registerApiRequestInterceptor } from '@biu/biu-ui/api-client'
import { KeyedSingleflight, registerWorkspaceCache } from '@biu/biu-ui/cache'
import { syncWorkspaceEndpoint } from '@biu/biu-ui/workspace-transport'
import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowPathIcon, ArrowRightStartOnRectangleIcon, BellIcon, ChatBubbleLeftRightIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, CircleStackIcon, ClipboardDocumentIcon, CloudIcon, ComputerDesktopIcon, Cog6ToothIcon, CameraIcon, EyeIcon, EyeSlashIcon, MagnifyingGlassIcon, PlusIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { AnchorMenu } from '@biu/biu-ui/anchor-menu'
import {
  AI_AVATAR_THEMES,
  AiAvatar,
  buildAiAvatarDataUrl,
  detectAiAvatarTheme,
} from '@biu/biu-ui/ai-avatar'
import {
  DEFAULT_WORKSPACE_AVATAR_PRESET_ID,
  WORKSPACE_AVATAR_PRESETS,
  WorkspaceAvatar,
  buildWorkspaceAvatarDataUrl,
  detectWorkspaceAvatarPreset,
} from '@biu/biu-ui/workspace-avatar'
import { TagChip } from '@biu/biu-ui/tag-chip'
import { ConfirmDialog } from '@biu/biu-ui/confirm-dialog'
import { chromeIcon } from './chrome-icon.ts'
import { applyNoticeClick, noticeIdOf } from './notice-open.ts'
import {
  THEME_ACCENTS,
  applyAccent,
  applyTheme,
  getThemeVersion,
  persistAccent,
  persistTheme,
  readAccent,
  readTheme,
  subscribeTheme,
  type ThemeAccent,
  type ThemeMode,
} from './theme.ts'
import {
  hydrateWorkspaceProfile,
  resetWorkspaceProfileHydrate,
  writeWorkspaceProfile,
} from '@biu/biu-ui/workspace-profile'
import { useWorkspaceProfile } from '@biu/biu-ui/use-workspace-profile'

import { BrandPrint, useBrandConfig } from './marketing-site/brand-mark.tsx'

const MarketingSite = lazy(() => import('./marketing-site/index.tsx').then((m) => ({ default: m.MarketingSite })))
import { clearWorkspaceId, readWorkspaceId, writeSessionWorkspaceId, writeWorkspaceId } from './tenant-fetch.ts'

function isLandingPreview() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('landingPreview') === '1'
}

if (typeof window !== 'undefined') {
  registerApiRequestInterceptor((_path, init) => {
    const preview = isLandingPreview()
    const token = preview ? '' : (readStorageString('biu.account.token') ?? '')
    const workspaceId = preview ? '' : readWorkspaceId()
    if (!token && !workspaceId && !preview) return init
    const headers = new Headers(init.headers)
    if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`)
    if (workspaceId && !headers.has('x-biu-workspace-id')) headers.set('x-biu-workspace-id', workspaceId)
    return { ...init, credentials: preview ? 'omit' : init.credentials, headers }
  })
}

async function readAvatarFile(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('无法读取图片'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    const size = 160
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法裁切头像')
    const edge = Math.min(image.width, image.height)
    ctx.drawImage(image, (image.width - edge) / 2, (image.height - edge) / 2, edge, edge, 0, 0, size, size)
    return canvas.toDataURL('image/jpeg', 0.84)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function ShellSettingsAccount() {
  const workspaceProfile = useWorkspaceProfile()
  const [account, setAccount] = useState<{ id: string; name: string; email: string; avatar: string; online: boolean }>({
    id: '',
    name: '',
    email: '',
    avatar: '',
    online: false,
  })
  const [accountName, setAccountName] = useState(() => workspaceProfile.name)
  const [profileMessage, setProfileMessage] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [aiVariant, setAiVariant] = useState(0)
  const avatarFileRef = useRef<HTMLInputElement>(null)
  const saveSeqRef = useRef(0)
  const token = readAccountToken()
  const currentName = workspaceProfile.name || workspaceProfile.fallbackName || account.name
  const currentAvatar = workspaceProfile.hydrated ? workspaceProfile.avatar : (workspaceProfile.avatar || account.avatar)
  const activeAiTheme = detectAiAvatarTheme(currentAvatar)
  const baseSeed = workspaceProfile.accountId || account.id || currentName || workspaceProfile.email || account.email || 'biu-ai'

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const load = () => {
      resetWorkspaceProfileHydrate()
      void Promise.all([
        getAccountMe(token).catch(() => null),
        hydrateWorkspaceProfile().catch(() => null),
      ]).then(([me, wp]) => {
        if (cancelled) return
        const nextAccount = me
          ? {
              id: String(me.id ?? ''),
              name: String(me.name ?? me.email ?? ''),
              email: String(me.email ?? ''),
              avatar: String(me.avatar ?? ''),
              online: me.online === true,
            }
          : { id: '', name: '', email: '', avatar: '', online: false }
        setAccount(nextAccount)
        setAccountName(wp?.name || wp?.fallbackName || nextAccount.name)
      })
    }
    load()
    const off = onAppEvent('biu:account-token', load)
    return () => {
      cancelled = true
      off()
    }
  }, [token])

  useEffect(() => {
    if (workspaceProfile.name || workspaceProfile.fallbackName) {
      setAccountName(workspaceProfile.name || workspaceProfile.fallbackName || '')
    }
  }, [workspaceProfile.name, workspaceProfile.fallbackName])

  const saveAccountProfile = (patch: { name?: string; avatar?: string }, successText: string) => {
    if (!token) return
    const seq = ++saveSeqRef.current
    const isAvatarOnly = patch.avatar !== undefined && patch.name === undefined
    const previousAccount = account
    const previousWorkspace = {
      name: workspaceProfile.name,
      avatar: currentAvatar,
      accountId: workspaceProfile.accountId,
      email: workspaceProfile.email,
      fallbackName: workspaceProfile.fallbackName,
      hydrated: workspaceProfile.hydrated,
    }
    const nextOptimistic = {
      name: patch.name !== undefined ? patch.name : workspaceProfile.name,
      avatar: patch.avatar !== undefined ? patch.avatar : currentAvatar,
      hydrated: true,
    }
    if (isAvatarOnly) {
      // Optimistically apply avatar without toggling disabled opacity across all swatches (eliminates flash).
      writeWorkspaceProfile(nextOptimistic)
      setAccount((prev) => ({ ...prev, avatar: patch.avatar ?? '' }))
      setProfileMessage(successText)
    } else {
      setSavingProfile(true)
      setProfileMessage('')
    }
    void accountFetch(token, '/api/account/workspace-profile', {
      method: 'POST',
      body: JSON.stringify(patch),
    })
      .then((body) => {
        if (seq !== saveSeqRef.current) return
        resetAccountMeGet()
        resetWorkspaceProfileHydrate()
        const savedName = String(body.name ?? nextOptimistic.name)
        const savedAvatar = String(body.avatar ?? '')
        const savedAccountId = typeof body.accountId === 'string' ? body.accountId : workspaceProfile.accountId
        const savedEmail = typeof body.email === 'string' ? body.email : workspaceProfile.email
        const savedFallbackName = typeof body.fallbackName === 'string' ? body.fallbackName : workspaceProfile.fallbackName
        writeWorkspaceProfile({
          name: savedName,
          avatar: savedAvatar,
          accountId: savedAccountId,
          email: savedEmail,
          fallbackName: savedFallbackName,
          hydrated: true,
        })
        setAccount((prev) => ({
          ...prev,
          email: String(body.email ?? prev.email),
          name: savedName || savedFallbackName || prev.name,
          avatar: savedAvatar,
        }))
        if (!isAvatarOnly) setAccountName(savedName || savedFallbackName || '')
        setProfileMessage(successText)
        emitAppEvent('biu:account-token', undefined)
      })
      .catch((error) => {
        if (seq !== saveSeqRef.current) return
        if (isAvatarOnly) {
          writeWorkspaceProfile(previousWorkspace)
          setAccount(previousAccount)
        }
        setProfileMessage(error instanceof Error ? error.message : '保存失败')
      })
      .finally(() => {
        if (!isAvatarOnly && seq === saveSeqRef.current) setSavingProfile(false)
      })
  }

  return (
    <section className="settings-account" data-testid="settings-account">
      <header className="settings-account-head">
        <h3 className="settings-account-title">账户</h3>
        <p className="settings-muted settings-account-lead">管理你在当前空间的昵称、头像与登录信息。</p>
      </header>
      <form
        className="settings-account-row settings-account-profile-row"
        onSubmit={(event) => {
          event.preventDefault()
          const next = accountName.trim()
          if (!next) {
            setProfileMessage('空间昵称不能为空')
            return
          }
          saveAccountProfile({ name: next }, '空间昵称已保存。')
        }}
      >
        <div className="settings-account-photo is-compact">
          <button
            type="button"
            className="settings-account-avatar is-compact"
            data-testid="settings-account-profile-avatar"
            title="更换头像"
            aria-label="更换头像"
            disabled={savingProfile}
            onClick={() => avatarFileRef.current?.click()}
          >
            {currentAvatar ? (
              <img src={currentAvatar} alt="" />
            ) : (
              <AiAvatar
                seed={baseSeed}
                className="settings-account-ai-avatar"
                data-testid="settings-account-default-avatar"
              />
            )}
            <span className="settings-account-avatar-veil" aria-hidden>
              <CameraIcon className="size-4" />
            </span>
          </button>
          {currentAvatar ? (
            <button
              type="button"
              className="settings-account-clear"
              data-testid="settings-account-reset-avatar"
              disabled={savingProfile}
              onClick={() => saveAccountProfile({ avatar: '' }, '已恢复默认头像。')}
            >
              恢复默认
            </button>
          ) : null}
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/*"
            hidden
            data-testid="settings-account-profile-avatar-file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              void readAvatarFile(file)
                .then((avatar) => saveAccountProfile({ avatar }, '头像已更新。'))
                .catch((error) => setProfileMessage(error instanceof Error ? error.message : '头像读取失败'))
            }}
          />
        </div>
        <div className="settings-account-profile-fields">
          <label className="settings-account-label" htmlFor="settings-account-global-name">空间昵称</label>
          <div className="settings-account-field-row">
            <input
              id="settings-account-global-name"
              className="settings-account-input"
              data-testid="settings-account-global-name"
              value={accountName}
              maxLength={40}
              placeholder="设置空间昵称"
              onChange={(event) => setAccountName(event.target.value)}
            />
            <button
              className="settings-account-action"
              type="submit"
              data-testid="settings-account-save-name"
              disabled={savingProfile || !accountName.trim() || accountName.trim() === currentName}
            >
              保存
            </button>
          </div>
          <p className="settings-muted settings-account-hint">
            {profileMessage || '仅用于当前空间，切换不同空间会展示对应空间的昵称与头像。'}
          </p>
        </div>
      </form>
      <div className="settings-account-row is-stacked settings-avatar-studio" data-testid="settings-avatar-studio">
        <div className="settings-avatar-group">
          <div className="settings-avatar-group-head">
            <span className="settings-account-label">头像</span>
            <button
              type="button"
              className="settings-avatar-shuffle"
              data-testid="settings-avatar-ai-shuffle"
              disabled={savingProfile}
              title="重新生成头像光晕构图"
              onClick={() => {
                const nextVariant = aiVariant + 1
                setAiVariant(nextVariant)
                const themeId = activeAiTheme || AI_AVATAR_THEMES[0]!.id
                saveAccountProfile(
                  { avatar: buildAiAvatarDataUrl(themeId, `${baseSeed}:${nextVariant}`) },
                  '已切换为新头像。',
                )
              }}
            >
              <ArrowPathIcon className="size-3.5" />
              <span>换一版</span>
            </button>
          </div>
          <div className="settings-avatar-swatches" role="group" aria-label="预设头像">
            {AI_AVATAR_THEMES.map((theme) => {
              const previewUrl = buildAiAvatarDataUrl(theme.id, `${baseSeed}:${aiVariant}`)
              return (
                <button
                  key={theme.id}
                  type="button"
                  className={`settings-avatar-swatch${activeAiTheme === theme.id ? ' is-on' : ''}`}
                  data-testid={`settings-avatar-theme-${theme.id}`}
                  title={theme.label}
                  aria-label={`选择${theme.label}头像`}
                  aria-pressed={activeAiTheme === theme.id}
                  disabled={savingProfile}
                  onClick={() => saveAccountProfile({ avatar: previewUrl }, `已切换为${theme.label}头像。`)}
                >
                  <img src={previewUrl} alt="" />
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="settings-account-row">
        <div className="settings-account-copy">
          <p className="settings-account-label">登录邮箱</p>
          <p className="settings-muted settings-account-hint" data-testid="settings-account-email">
            {account.email || '未设置'}
          </p>
        </div>
      </div>
    </section>
  )
}

export function ShellSettingsConnections() {
  const [account, setAccount] = useState<{ email: string; online: boolean }>({ email: '', online: false })
  const [cloud, setCloud] = useState<{
    available: boolean
    connected: boolean
    configuredOrigin: string
    origin?: string
    account?: { id?: string; name?: string; email?: string }
    accounts: Array<{ id: string; name?: string; email?: string; origin?: string; active?: boolean }>
  }>({ available: false, connected: false, configuredOrigin: '', accounts: [] })
  const [addingConnection, setAddingConnection] = useState(false)
  const [remoteOrigin, setRemoteOrigin] = useState('')
  const [originMessage, setOriginMessage] = useState('')
  const [cloudMode, setCloudMode] = useState<'login' | 'register'>('login')
  const [cloudName, setCloudName] = useState('')
  const [cloudEmail, setCloudEmail] = useState('')
  const [cloudPassword, setCloudPassword] = useState('')
  const [cloudMessage, setCloudMessage] = useState('')
  const token = readAccountToken()

  const loadCloud = () =>
    accountFetch(token, '/api/account/cloud')
      .then((body) => {
        const configuredOrigin = typeof body.configuredOrigin === 'string'
          ? body.configuredOrigin
          : (typeof body.origin === 'string' ? body.origin : '')
        const connected = body.connected === true
        setCloud({
          available: body.available === true,
          connected,
          configuredOrigin,
          origin: typeof body.origin === 'string' ? body.origin : undefined,
          account:
            body.account && typeof body.account === 'object'
              ? (body.account as { id?: string; name?: string; email?: string })
              : undefined,
          accounts: Array.isArray(body.accounts)
            ? (body.accounts as Array<{ id: string; name?: string; email?: string; origin?: string; active?: boolean }>)
            : [],
        })
        setRemoteOrigin((prev) => prev || configuredOrigin)
        if (connected || configuredOrigin) setAddingConnection(false)
      })
      .catch(() => setCloud({ available: false, connected: false, configuredOrigin: '', accounts: [] }))

  useEffect(() => {
    if (!token) return
    void getAccountMe(token)
      .then((body) => setAccount({ email: String(body.email ?? ''), online: body.online === true }))
      .catch(() => setAccount({ email: '', online: false }))
    void loadCloud()
  }, [token])

  const hasConnections = cloud.accounts.length > 0

  return (
    <section className="settings-account" data-testid="settings-connections">
      <header className="settings-account-head">
        <div className="settings-cloud-card-head">
          <div>
            <h3 className="settings-account-title">连接</h3>
            <p className="settings-muted settings-account-lead">
              本地账号与云端账号相互独立；可添加多个远程连接，每个远程服务器地址仅绑定一个云端账号，同一时间连接其中一个。
            </p>
          </div>
          {!account.online && cloud.available && hasConnections && !addingConnection ? (
            <button
              type="button"
              className="settings-account-action"
              data-testid="settings-cloud-add"
              onClick={() => {
                setOriginMessage('')
                setCloudMessage('')
                setRemoteOrigin('')
                setCloudName('')
                setCloudEmail('')
                setCloudPassword('')
                setAddingConnection(true)
              }}
            >
              添加远程连接
            </button>
          ) : null}
        </div>
      </header>
      {!account.online && cloud.available ? (
        <>
          {!hasConnections && !addingConnection ? (
            <div className="settings-cloud-empty" data-testid="settings-cloud-empty">
              <div className="settings-account-copy">
                <p className="settings-account-label">暂无远程连接</p>
                <p className="settings-muted settings-account-hint">
                  当前未连接远程主机。添加远程连接后，可在连接内配置远程服务器地址并绑定一个云端账号。
                </p>
              </div>
              <button
                type="button"
                className="settings-account-action"
                data-testid="settings-cloud-add"
                onClick={() => {
                  setOriginMessage('')
                  setCloudMessage('')
                  setRemoteOrigin(cloud.configuredOrigin || '')
                  setAddingConnection(true)
                }}
              >
                添加远程连接
              </button>
            </div>
          ) : null}

          {hasConnections ? (
            <div className="settings-cloud-list" data-testid="settings-cloud-accounts">
              {cloud.accounts.map((item) => (
                <div className="settings-cloud-card" key={`${item.origin ?? ''} ${item.id}`} data-testid="settings-cloud-card">
                  <div className="settings-cloud-card-head">
                    <div className="settings-cloud-card-title-row">
                      <p className="settings-account-label">{item.origin || '远程连接'}</p>
                      <span className={`settings-cloud-badge${item.active ? ' is-connected' : ''}`}>
                        {item.active ? '已连接' : '未连接'}
                      </span>
                    </div>
                    <span className="settings-member-controls">
                      {item.active ? (
                        <button
                          type="button"
                          className="settings-account-action"
                          data-testid="settings-cloud-disconnect"
                          onClick={() => {
                            setCloudMessage('')
                            void accountFetch(token, '/api/account/cloud', { method: 'DELETE' })
                              .then(() => {
                                setCloudMessage('已断开当前远程连接。')
                                void loadCloud()
                                emitAppEvent('biu:account-token', undefined)
                              })
                              .catch((error) => setCloudMessage(error instanceof Error ? error.message : '断开失败'))
                          }}
                        >
                          断开
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="settings-account-action"
                          onClick={() => {
                            setCloudMessage('')
                            void accountFetch(token, '/api/account/cloud/active', {
                              method: 'POST',
                              body: JSON.stringify({ remoteAccountId: item.id, origin: item.origin }),
                            })
                              .then(() => {
                                setCloudMessage('已切换远程连接。')
                                void loadCloud()
                                emitAppEvent('biu:account-token', undefined)
                              })
                              .catch((error) => setCloudMessage(error instanceof Error ? error.message : '连接失败'))
                          }}
                        >
                          连接
                        </button>
                      )}
                      <button
                        type="button"
                        className="settings-account-action"
                        data-testid="settings-cloud-remove"
                        onClick={() => {
                          setCloudMessage('')
                          const q = item.origin ? `?origin=${encodeURIComponent(item.origin)}` : ''
                          void accountFetch(token, `/api/account/cloud${q}`, { method: 'DELETE' })
                            .then(() => {
                              setCloudMessage('已移除远程连接。')
                              void loadCloud()
                              emitAppEvent('biu:account-token', undefined)
                            })
                            .catch((error) => setCloudMessage(error instanceof Error ? error.message : '移除失败'))
                        }}
                      >
                        移除
                      </button>
                    </span>
                  </div>
                  <div className="settings-member-row">
                    <span className="settings-member-identity">
                      <strong>{item.name || item.email || '云端账号'}</strong>
                      <small>
                        {item.name && item.email && item.name !== item.email ? item.email : '已绑定云端账号'}
                      </small>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {addingConnection ? (
            <div className="settings-cloud-card" data-testid="settings-cloud-add-card">
              <div className="settings-cloud-card-head">
                <div className="settings-cloud-card-title-row">
                  <p className="settings-account-label">新建远程连接</p>
                  <span className="settings-cloud-badge">未绑定账号</span>
                </div>
                <button
                  type="button"
                  className="settings-account-action"
                  data-testid="settings-cloud-cancel"
                  onClick={() => {
                    setOriginMessage('')
                    setCloudMessage('')
                    setRemoteOrigin('')
                    setAddingConnection(false)
                  }}
                >
                  取消
                </button>
              </div>

              <div className="settings-cloud-section">
                <div className="settings-account-copy">
                  <p className="settings-account-label">远程服务器地址</p>
                  <p className="settings-muted settings-account-hint">填写远端 BIU 服务地址，每个地址仅绑定一个云端账号。</p>
                </div>
                <form
                  className="settings-cloud-origin"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setOriginMessage('')
                    void accountFetch(token, '/api/account/cloud/config', {
                      method: 'POST',
                      body: JSON.stringify({ origin: remoteOrigin.trim() }),
                    })
                      .then((body) => {
                        const saved = typeof body.origin === 'string' ? body.origin : ''
                        setRemoteOrigin(saved)
                        setOriginMessage(saved ? `远程服务地址已保存：${saved}` : '已清除自定义远程服务地址。')
                      })
                      .catch((error) => setOriginMessage(error instanceof Error ? error.message : '保存远程服务地址失败'))
                  }}
                >
                  <input
                    className="settings-account-input"
                    type="url"
                    placeholder="https://cloud.example.com"
                    value={remoteOrigin}
                    data-testid="settings-cloud-origin"
                    onChange={(event) => setRemoteOrigin(event.target.value)}
                  />
                  <button
                    className="settings-account-action"
                    type="submit"
                    data-testid="settings-cloud-save-origin"
                  >
                    保存地址
                  </button>
                </form>
                {originMessage ? <p className="settings-muted settings-account-hint">{originMessage}</p> : null}
              </div>

              <div className="settings-cloud-section is-divided">
                <div className="settings-account-copy">
                  <p className="settings-account-label">云端账号</p>
                  <p className="settings-muted settings-account-hint">
                    登录或创建一个云端账号绑定到此远程连接；若该地址已有绑定账号，新绑定会替换原账号。
                  </p>
                </div>
                <div className="settings-cloud-connect">
                  <div className="settings-cloud-tabs" role="tablist" aria-label="云端账号操作方式">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={cloudMode === 'login'}
                      className={`settings-cloud-tab${cloudMode === 'login' ? ' is-active' : ''}`}
                      data-testid="settings-cloud-mode-login"
                      onClick={() => {
                        setCloudMode('login')
                        setCloudMessage('')
                      }}
                    >
                      登录已有云端账号
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={cloudMode === 'register'}
                      className={`settings-cloud-tab${cloudMode === 'register' ? ' is-active' : ''}`}
                      data-testid="settings-cloud-mode-register"
                      onClick={() => {
                        setCloudMode('register')
                        setCloudMessage('')
                      }}
                    >
                      单独创建云端账号
                    </button>
                  </div>
                  <form
                    className="settings-cloud-login"
                    onSubmit={(event) => {
                      event.preventDefault()
                      setCloudMessage('')
                      const path = cloudMode === 'register' ? '/api/account/cloud/register' : '/api/account/cloud/login'
                      const payload: Record<string, string> = {
                        email: cloudEmail.trim(),
                        password: cloudPassword,
                      }
                      if (remoteOrigin.trim()) payload.origin = remoteOrigin.trim()
                      if (cloudMode === 'register' && cloudName.trim()) payload.name = cloudName.trim()
                      void accountFetch(token, path, {
                        method: 'POST',
                        body: JSON.stringify(payload),
                      })
                        .then(() => {
                          setCloudPassword('')
                          if (cloudMode === 'register') setCloudName('')
                          setCloudMessage(cloudMode === 'register' ? '独立云端账号已创建并绑定。' : '云端账号已登录并绑定。')
                          setAddingConnection(false)
                          void loadCloud()
                          emitAppEvent('biu:account-token', undefined)
                        })
                        .catch((error) =>
                          setCloudMessage(error instanceof Error ? error.message : (cloudMode === 'register' ? '云端注册失败' : '云端登录失败')),
                        )
                    }}
                  >
                    {cloudMode === 'register' ? (
                      <input
                        className="settings-account-input"
                        type="text"
                        maxLength={40}
                        placeholder="云端账号名（可选）"
                        value={cloudName}
                        data-testid="settings-cloud-name"
                        onChange={(event) => setCloudName(event.target.value)}
                      />
                    ) : null}
                    <input
                      className="settings-account-input"
                      type="email"
                      placeholder="云端邮箱"
                      value={cloudEmail}
                      data-testid="settings-cloud-email"
                      onChange={(event) => setCloudEmail(event.target.value)}
                    />
                    <input
                      className="settings-account-input"
                      type="password"
                      placeholder={cloudMode === 'register' ? '云端密码（至少 6 位）' : '云端密码'}
                      value={cloudPassword}
                      data-testid="settings-cloud-password"
                      onChange={(event) => setCloudPassword(event.target.value)}
                    />
                    <button
                      className="settings-account-action"
                      type="submit"
                      data-testid="settings-cloud-submit"
                      disabled={!cloudEmail.trim() || !cloudPassword}
                    >
                      {cloudMode === 'register' ? '注册并绑定' : '登录并绑定'}
                    </button>
                  </form>
                  <div className="settings-cloud-sync">
                    <p className="settings-muted settings-account-hint">
                      或使用本地邮箱 {account.email || '（未设置）'} 和当前登录密码创建并绑定云端账号。创建后两边的密码分别修改。
                    </p>
                    <form
                      className="settings-cloud-login"
                      onSubmit={(event) => {
                        event.preventDefault()
                        setCloudMessage('')
                        const body = remoteOrigin.trim() ? { origin: remoteOrigin.trim() } : {}
                        void accountFetch(token, '/api/account/cloud/sync-create', {
                          method: 'POST',
                          body: JSON.stringify(body),
                        })
                          .then(() => {
                            setCloudMessage('云端账号已创建并绑定。')
                            setAddingConnection(false)
                            void loadCloud()
                            emitAppEvent('biu:account-token', undefined)
                          })
                          .catch((error) => setCloudMessage(error instanceof Error ? error.message : '创建并绑定失败'))
                      }}
                    >
                      <button
                        className="settings-account-action"
                        type="submit"
                        data-testid="settings-cloud-sync-create"
                        disabled={!account.email}
                      >
                        创建并绑定
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {cloudMessage ? <p className="settings-muted settings-account-hint">{cloudMessage}</p> : null}
        </>
      ) : (
        <div className="settings-account-row">
          <div className="settings-account-copy">
            <p className="settings-account-label">云端连接</p>
            <p className="settings-muted settings-account-hint">
              {account.online ? '当前已在云端服务模式运行。' : '当前没有配置中心服务，单机功能可以完整使用。'}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

export function ShellSettingsSecurity() {
  const [sessions, setSessions] = useState<Array<Record<string, unknown>>>([])
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [message, setMessage] = useState('')
  const token = readAccountToken()

  const loadSessions = () =>
    accountFetch(token, '/api/account/agents')
      .then((body) => setSessions(((body.agents ?? body.sessions) as Array<Record<string, unknown>>) ?? []))
      .catch(() => setSessions([]))

  useEffect(() => {
    if (!token) return
    void loadSessions()
  }, [token])

  return (
    <section className="settings-account" data-testid="settings-security">
      <header className="settings-account-head">
        <h3 className="settings-account-title">安全</h3>
        <p className="settings-muted settings-account-lead">管理当前账号的登录密码与已登录设备。</p>
      </header>
      <form
        className="settings-account-row is-stacked"
        onSubmit={(event) => {
          event.preventDefault()
          setMessage('')
          void accountFetch(token, '/api/account/password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, nextPassword }),
          })
            .then(() => {
              setCurrentPassword('')
              setNextPassword('')
              setMessage('密码已修改，其他设备已退出。')
              void loadSessions()
            })
            .catch((error) => setMessage(error instanceof Error ? error.message : '修改失败'))
        }}
      >
        <div className="settings-account-copy">
          <p className="settings-account-label">修改密码</p>
          <p className="settings-muted settings-account-hint">修改密码后，其他已登录设备会自动退出。</p>
        </div>
        <div className="settings-cloud-login">
          <input
            className="settings-account-input"
            type="password"
            placeholder="当前密码"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <input
            className="settings-account-input"
            type="password"
            placeholder="新密码（至少 6 位）"
            value={nextPassword}
            onChange={(event) => setNextPassword(event.target.value)}
          />
          <button className="settings-account-action" type="submit" disabled={!currentPassword || !nextPassword}>
            修改密码
          </button>
        </div>
        {message ? <p className="settings-muted settings-account-hint">{message}</p> : null}
      </form>
      <div className="settings-account-row is-stacked">
        <div className="settings-account-copy">
          <p className="settings-account-label">登录设备</p>
          <p className="settings-muted settings-account-hint">查看并移除已授权的登录会话。</p>
        </div>
        <div className="settings-account-sessions" data-testid="settings-account-sessions">
          {sessions.map((session) => (
            <div className="settings-member-row" key={String(session.id)}>
              <span>{String(session.device_name || '设备')}</span>
              <span className="settings-muted">
                {session.revoked_at
                  ? '已退出'
                  : `最近使用：${new Date(Number(session.last_seen_at)).toLocaleString()} · 到期：${new Date(Number(session.expires_at)).toLocaleString()}`}
              </span>
              {!session.revoked_at ? (
                <button
                  type="button"
                  className="settings-account-action"
                  onClick={() => {
                    void accountFetch(token, `/api/account/agents/${encodeURIComponent(String(session.id))}`, { method: 'DELETE' })
                      .then(loadSessions)
                  }}
                >
                  移除
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const ACCOUNT_KEY = 'biu.account.token'
/** 校验失败后的重试间隔（ms）：退避三次，覆盖 dev server 重启的窗口。 */
const VERIFY_RETRY_DELAYS = [400, 1200, 3000] as const

function bridgeLegacyAccountCookie() {
  if (typeof localStorage === 'undefined' || typeof document === 'undefined') return
  const token = readStorageString(ACCOUNT_KEY) ?? ''
  if (token) document.cookie = `biu_legacy_account=${encodeURIComponent(token)}; Path=/; SameSite=Strict`
}

bridgeLegacyAccountCookie()

export function readAccountToken() {
  if (typeof localStorage === 'undefined') return ''
  if (isLandingPreview()) return ''
  return readStorageString(ACCOUNT_KEY) ?? ''
}

export function writeAccountToken(next: string) {
  if (!next && typeof window !== 'undefined') {
    void apiFetch('/api/account/logout', { method: 'POST' }).catch((error) => {
      console.warn('[shell] logout request failed', error)
    })
  }
  if (next) writeStorageString(ACCOUNT_KEY, next)
  else {
    removeStorageKey(ACCOUNT_KEY)
    clearWorkspaceId()
  }
  if (typeof window !== 'undefined') emitAppEvent('biu:account-token', undefined)
}

function readAuthRoute(): 'login' | 'register' | null {
  if (typeof window === 'undefined') return null
  if (window.location.pathname === '/login') return 'login'
  if (window.location.pathname === '/register' || window.location.pathname === '/signup') return 'register'
  return null
}

function setBrowserPath(path: string, mode: 'push' | 'replace' = 'push') {
  if (typeof window === 'undefined' || window.location.pathname === path) return
  if (mode === 'replace') window.history.replaceState({}, '', path)
  else window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function AuthGate({ children }: { children: ReactNode }) {
  const brand = useBrandConfig()
  const initialRoute = readAuthRoute()
  const [token, setToken] = useState(readAccountToken)
  const [verified, setVerified] = useState(false)
  const [joining, setJoining] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>(initialRoute ?? 'login')
  const [authRoute, setAuthRoute] = useState<'login' | 'register' | null>(initialRoute)
  const [authOpen, setAuthOpen] = useState(Boolean(initialRoute))
  const [name, setName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [guestName, setGuestName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const workspaceInvite = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('workspaceInvite') ?? ''
  const guestInvite = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('guestInvite') ?? ''

  useEffect(() => {
    const sync = () => setToken(readAccountToken())
    const off = onAppEvent('biu:account-token', sync)
    window.addEventListener('storage', sync)
    return () => {
      off()
      window.removeEventListener('storage', sync)
    }
  }, [])

  useEffect(() => {
    const sync = () => {
      const next = readAuthRoute()
      setAuthRoute(next)
      setAuthOpen(Boolean(next))
      if (next) setMode(next)
    }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  function goAuth(next: 'login' | 'register') {
    setMode(next)
    setAuthOpen(true)
    setAuthRoute(next)
    const path = next === 'register' ? '/register' : '/login'
    setBrowserPath(path)
  }

  function leaveAuth() {
    setAuthOpen(false)
    setAuthRoute(null)
    setBrowserPath('/')
  }

  useEffect(() => {
    if (!token) {
      setVerified(false)
      return
    }
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    setVerified(false)
    const confirm = () => getAccountMe(token)

    // 网络类失败（dev server 重启、断网、5xx）退避重试。
    // 凭证失效（401/403）不重试 —— 重试也没用，直接清 token。
    const attempt = (round: number) => {
      void confirm()
        .catch(async (err) => {
          if (err instanceof Error && err.message === '不在这个空间') {
            clearWorkspaceId()
            return confirm()
          }
          throw err
        })
        .then(async () => {
          await syncWorkspaceEndpoint()
          if (live) setVerified(true)
        })
        .catch((err) => {
          if (!live) return
          if (isAuthFailure(err)) {
            // 凭证真的失效，才清 token。
            writeAccountToken('')
            setError(err instanceof Error ? err.message : '登录已失效')
            return
          }
          // 非凭证问题：保留 token，退避后重试，不踢出登录态。
          if (round < VERIFY_RETRY_DELAYS.length) {
            setError('网络异常，正在重试')
            timer = setTimeout(() => attempt(round + 1), VERIFY_RETRY_DELAYS[round])
            return
          }
          setError('网络异常，未能确认登录状态')
        })
    }
    attempt(0)

    return () => {
      live = false
      if (timer) clearTimeout(timer)
    }
  }, [token])

  useEffect(() => {
    if (!token || !verified || !workspaceInvite) return
    let live = true
    setJoining(true)
    void accountFetch(token, `/api/account/invites/${encodeURIComponent(workspaceInvite)}/accept`, { method: 'POST' })
      .then(() => {
        if (!live) return
        const url = new URL(window.location.href)
        url.searchParams.delete('workspaceInvite')
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
        setError('')
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : '无法加入空间')
      })
      .finally(() => {
        if (live) setJoining(false)
      })
    return () => {
      live = false
    }
  }, [token, verified, workspaceInvite])

  useEffect(() => {
    if (!token || !verified) return
    if (window.location.pathname !== '/login' && window.location.pathname !== '/register') return
    setBrowserPath('/', 'replace')
    setAuthRoute(null)
    setAuthOpen(false)
  }, [token, verified])

  if (isLandingPreview()) return children
  // 本地已有 token 就进应用。刷新不必先整页卡在「正在验证登录状态」等 /me。
  if (token && !joining) return children
  if (!token && !guestInvite) {
    return (
      <Suspense fallback={
        <div className="auth-gate" data-testid="auth-gate">
          <p className="auth-status">登录</p>
        </div>
      }>
        <MarketingSite
          onLogin={() => goAuth('login')}
          onStart={() => goAuth('register')}
          auth={{
            mode,
            onModeChange: (next) => {
              setMode(next)
              setAuthOpen(true)
              setAuthRoute(next)
              setBrowserPath(next === 'register' ? '/register' : '/login')
            },
            workspaceInvite: Boolean(workspaceInvite),
            onSubmit: async ({ email, password: secret }) => {
              const path = mode === 'register' ? '/api/account/register' : '/api/account/login'
              const body = await accountFetch('', path, {
                method: 'POST',
                body: JSON.stringify({ email, password: secret }),
              })
              clearWorkspaceId()
              writeAccountToken(String(body.token ?? ''))
              if (body.workspaceId) writeWorkspaceId(String(body.workspaceId))
              setPassword('')
              setError('')
            },
          }}
        />
      </Suspense>
    )
  }
  if (token) {
    return (
      <div className="auth-gate" data-testid="auth-verifying">
        <div className="site-print" aria-hidden>
          <BrandPrint config={brand} />
        </div>
        <p className="auth-status">正在验证登录状态</p>
      </div>
    )
  }

  return (
    <div className="auth-gate" data-testid="auth-gate">
      <div className="site-print" aria-hidden>
        <BrandPrint config={brand} />
      </div>
      {guestInvite ? (
        <form
          className="auth-panel"
          data-testid="auth-guest-invite"
          onSubmit={(event) => {
            event.preventDefault()
            setJoining(true)
            void accountFetch('', `/api/account/guest-invites/${encodeURIComponent(guestInvite)}/accept`, {
              method: 'POST',
              body: JSON.stringify({ name: guestName.trim() }),
            })
              .then((body) => {
                const url = new URL(window.location.href)
                url.searchParams.delete('guestInvite')
                window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
                writeAccountToken(String(body.token ?? ''))
                if (body.workspaceId) writeWorkspaceId(String(body.workspaceId))
                setError('')
              })
              .catch((err) => setError(err instanceof Error ? err.message : '临时访客链接无效'))
              .finally(() => setJoining(false))
          }}
        >
          <h2>访客进入</h2>
          {error ? <p className="auth-error">{error}</p> : null}
          <label className="auth-label">
            称呼
            <input
              className="auth-field"
              value={guestName}
              maxLength={40}
              placeholder="可选"
              data-testid="auth-guest-name"
              onChange={(event) => setGuestName(event.target.value)}
            />
          </label>
          <button type="submit" className="auth-go" disabled={joining}>
            {joining ? '正在进入' : '进入'}
          </button>
        </form>
      ) : (
        <form
          className="auth-panel"
          onSubmit={(event) => {
            event.preventDefault()
            const path = mode === 'register' ? '/api/account/register' : '/api/account/login'
            void accountFetch('', path, {
              method: 'POST',
              body: JSON.stringify({
                email: name.trim(),
                password,
                ...(mode === 'register' && accountName.trim() ? { name: accountName.trim() } : {}),
              }),
            })
              .then((body) => {
                clearWorkspaceId()
                writeAccountToken(String(body.token ?? ''))
                if (body.workspaceId) writeWorkspaceId(String(body.workspaceId))
                setPassword('')
                setAccountName('')
                setError('')
                if (window.location.pathname === '/login' || window.location.pathname === '/register') {
                  setBrowserPath('/', 'replace')
                  setAuthRoute(null)
                }
              })
              .catch((err) => setError(err instanceof Error ? err.message : '登录失败'))
          }}
        >
          <h2>{mode === 'register' ? '注册' : '登录'}</h2>
          {workspaceInvite ? <p className="auth-lead">登录或注册后加入这个空间。</p> : null}
          {error ? <p className="auth-error">{error}</p> : null}
          {mode === 'register' ? (
            <label className="auth-label">
              账号名
              <input
                className="auth-field"
                value={accountName}
                maxLength={40}
                placeholder="你的账号名（可选）"
                data-testid="auth-account-name"
                onChange={(event) => setAccountName(event.target.value)}
              />
            </label>
          ) : null}
          <label className="auth-label">
            邮箱
            <input
              className="auth-field"
              value={name}
              maxLength={40}
              placeholder="name@email.com"
              type={mode === 'register' ? 'email' : 'text'}
              autoComplete="username"
              data-testid="auth-name"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="auth-label">
            密码
            <input
              className="auth-field"
              type="password"
              value={password}
              placeholder={mode === 'register' ? '至少 6 位' : '密码'}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              data-testid="auth-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button type="submit" className="auth-go" data-testid="auth-submit">
            {mode === 'register' ? '注册' : '登录'}
          </button>
          <p className="auth-panel-footer">
            <button
              type="button"
              className="auth-switch"
              data-testid="auth-switch"
              onClick={() => goAuth(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'register' ? '已有账号，去登录' : '没有账号，去注册'}
            </button>
          </p>
          {workspaceInvite ? null : (
            <button type="button" className="auth-back" onClick={leaveAuth}>返回</button>
          )}
        </form>
      )}
    </div>
  )
}

type CollabWorkspace = { id: string; name: string; avatar?: string; role: string; location?: 'device' | 'cloud' }

export function useActiveWorkspaceLocation(): 'device' | 'cloud' {
  const [location, setLocation] = useState<'device' | 'cloud'>('device')
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const token = readAccountToken()
      if (!token) return
      try {
        const current = (await accountFetch(token, '/api/account/active')) as {
          workspaceId?: string
          location?: 'device' | 'cloud'
        }
        if (cancelled) return
        if (current.location === 'cloud' || current.location === 'device') {
          setLocation(current.location)
          return
        }
        const listed = (await accountFetch(token, '/api/account/workspaces')) as { workspaces?: CollabWorkspace[] }
        if (cancelled) return
        const id = String(current.workspaceId ?? '')
        const workspace = (listed.workspaces ?? []).find((item) => item.id === id)
        setLocation(workspace?.location === 'cloud' ? 'cloud' : 'device')
      } catch {
        if (!cancelled) setLocation('device')
      }
    }
    void load()
    const off = onAppEvent('biu:account-token', load)
    return () => {
      cancelled = true
      off()
    }
  }, [])
  return location
}

export function useActiveWorkspaceAvatar(): string {
  const [avatar, setAvatar] = useState('')
  const activeIdRef = useRef('')
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const token = readAccountToken()
      if (!token) {
        if (!cancelled) {
          activeIdRef.current = ''
          setAvatar('')
        }
        return
      }
      try {
        const [listed, current] = await Promise.all([
          accountFetch(token, '/api/account/workspaces') as Promise<{ workspaces?: CollabWorkspace[] }>,
          accountFetch(token, '/api/account/active') as Promise<{ workspaceId?: string }>,
        ])
        if (cancelled) return
        const id = String(current.workspaceId ?? '')
        activeIdRef.current = id
        const workspace = (listed.workspaces ?? []).find((item) => item.id === id) ?? (listed.workspaces ?? [])[0]
        setAvatar(workspace?.avatar?.trim() ?? '')
      } catch {
        if (!cancelled) setAvatar('')
      }
    }
    void load()
    const offToken = onAppEvent('biu:account-token', load)
    const offMeta = onAppEvent('biu:workspace-meta', (detail) => {
      if (!detail?.workspaceId) {
        void load()
        return
      }
      if (detail.workspaceId === activeIdRef.current && detail.avatar !== undefined) {
        setAvatar(detail.avatar.trim())
      }
    })
    return () => {
      cancelled = true
      offToken()
      offMeta()
    }
  }, [])
  return avatar
}
type CollabMember = { id: string; name: string; email?: string; avatar?: string; role: string }
type CollabPresence = { accountId: string; name: string; collection: string; recordId: string }

type SettingsSelectOption<T extends string = string> = {
  value: T
  label: string
  description?: string
}

function SettingsSelect<T extends string>({
  value,
  options,
  ariaLabel,
  className = '',
  menuMinWidth = 200,
  testId,
  onChange,
}: {
  value: T
  options: ReadonlyArray<SettingsSelectOption<T>>
  ariaLabel: string
  className?: string
  menuMinWidth?: number
  testId?: string
  onChange: (next: T) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selected = options.find((item) => item.value === value) ?? options[0]

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid={testId}
        className={`settings-select-trigger${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="settings-select-value">{selected?.label ?? value}</span>
        <ChevronDownIcon aria-hidden className="settings-select-chevron size-3.5" />
      </button>
      {open ? (
        <AnchorMenu
          anchor={triggerRef.current}
          onClose={() => setOpen(false)}
          className="settings-select-menu"
          role="listbox"
          aria-label={ariaLabel}
          minWidth={menuMinWidth}
          zIndex={420}
        >
          {options.map((opt) => {
            const active = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                className={`settings-select-option${active ? ' is-active' : ''}`}
                onClick={() => {
                  setOpen(false)
                  if (opt.value !== value) onChange(opt.value)
                }}
              >
                <span className="settings-select-option-copy">
                  <strong>{opt.label}</strong>
                  {opt.description ? <small>{opt.description}</small> : null}
                </span>
                {active ? <CheckIcon aria-hidden className="settings-select-check size-3.5" /> : null}
              </button>
            )
          })}
        </AnchorMenu>
      ) : null}
    </>
  )
}

const MEMBER_ROLE_OPTIONS: ReadonlyArray<SettingsSelectOption<'owner' | 'admin' | 'member' | 'viewer'>> = [
  { value: 'owner', label: '所有者', description: '转让空间所有权' },
  { value: 'admin', label: '管理者', description: '管理成员、设置与空间规则' },
  { value: 'member', label: '编辑者', description: '创建与编辑空间数据' },
  { value: 'viewer', label: '查看者', description: '仅只读查看获准内容' },
]

const INVITE_ROLE_OPTIONS: ReadonlyArray<SettingsSelectOption<'viewer' | 'member'>> = [
  { value: 'viewer', label: '查看者', description: '加入后仅可查看' },
  { value: 'member', label: '编辑者', description: '加入后可协作编辑' },
]

function workspaceRoleLabel(role: string) {
  if (role === 'owner') return '所有者'
  if (role === 'admin') return '管理者'
  if (role === 'viewer') return '查看者'
  return '编辑者'
}

function canManageWorkspaceRole(role: string | undefined) {
  return role === 'owner' || role === 'admin'
}

/** 进入一个空间时打开最近更新的会话。没有会话时回到首页。 */
export function defaultSessionPath(sessions: Array<{ id?: string; updatedAt?: number }>) {
  let best: { id: string; updatedAt: number } | undefined
  for (const item of sessions) {
    if (!item.id) continue
    const updatedAt = Number(item.updatedAt) || 0
    if (!best || updatedAt > best.updatedAt || (updatedAt === best.updatedAt && item.id.localeCompare(best.id) < 0)) {
      best = { id: item.id, updatedAt }
    }
  }
  return best ? `/agents/${encodeURIComponent(best.id)}` : '/'
}

/** 带 HTTP 状态码的请求错误，用于区分「凭证失效」和「网络/服务故障」。 */
export type AccountFetchError = Error & { status?: number }

/** 只有这两个状态码才算凭证真的失效，此时才应该清 token。 */
export function isAuthFailure(err: unknown): boolean {
  const status = (err as AccountFetchError | null)?.status
  return status === 401 || status === 403
}

async function accountFetch(token: string, path: string, init?: RequestInit) {
  const workspaceId = isLandingPreview() ? '' : readWorkspaceId()
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(workspaceId ? { 'x-biu-workspace-id': workspaceId } : {}),
      ...init?.headers,
    },
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) {
    // message 保持原样（调用方按文案判断），另附 status 供上层区分。
    const err = new Error(body.error || '请求失败') as AccountFetchError
    err.status = res.status
    throw err
  }
  return body as Record<string, unknown>
}

const ACCOUNT_ME_HOLD_MS = 400
const accountMeSingleflight = new KeyedSingleflight<string, Record<string, unknown>>()

/** One in-flight GET /api/account/me for AuthGate and the workspace switcher. */
export async function getAccountMe(token: string): Promise<Record<string, unknown>> {
  return accountMeSingleflight.run(token, () => accountFetch(token, '/api/account/me'), {
    holdMs: ACCOUNT_ME_HOLD_MS,
  })
}

export function resetAccountMeGet() {
  accountMeSingleflight.clear()
}

registerWorkspaceCache('shell-account-me', resetAccountMeGet)

export function ShellWorkspaceSwitcher({ onWorkspaceSettings }: { onWorkspaceSettings?: () => void }) {
  const workspaceProfile = useWorkspaceProfile()
  const [workspaces, setWorkspaces] = useState<CollabWorkspace[]>([])
  const [active, setActive] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [creatingLocation, setCreatingLocation] = useState<'device' | 'cloud' | null>(null)
  const [createError, setCreateError] = useState('')
  const [localAccount, setLocalAccount] = useState('')
  const [localAvatar, setLocalAvatar] = useState('')
  const [localAccountId, setLocalAccountId] = useState('')
  const [hostOnline, setHostOnline] = useState(false)
  const [cloudAccounts, setCloudAccounts] = useState<Array<{ id: string; email?: string; name?: string; avatar?: string; origin?: string; active?: boolean }>>([])
  const [cloudMenuOpen, setCloudMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cloudExpandRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const token = readAccountToken()
      if (!token) return
      try {
        const [listed, current, me, cloud] = await Promise.all([
          accountFetch(token, '/api/account/workspaces') as Promise<{ workspaces?: CollabWorkspace[] }>,
          accountFetch(token, '/api/account/active') as Promise<{ workspaceId?: string }>,
          getAccountMe(token) as Promise<{ id?: string; email?: string; name?: string; avatar?: string; online?: boolean }>,
          accountFetch(token, '/api/account/cloud').catch(() => ({})) as Promise<{
            accounts?: Array<{ id: string; email?: string; name?: string; avatar?: string; origin?: string; active?: boolean }>
          }>,
        ])
        if (cancelled) return
        setWorkspaces(listed.workspaces ?? [])
        const workspaceId = String(current.workspaceId ?? '')
        setActive(workspaceId)
        if (workspaceId) writeSessionWorkspaceId(workspaceId)
        setLocalAccount(String(me.name || me.email || ''))
        setLocalAvatar(String(me.avatar ?? ''))
        setLocalAccountId(String(me.id ?? ''))
        setHostOnline(me.online === true)
        setCloudAccounts(Array.isArray(cloud.accounts) ? cloud.accounts : [])
      } catch {
        if (!cancelled) setWorkspaces([])
      }
    }
    void load()
    const offAccount = onAppEvent('biu:account-token', load)
    const offWorkspaceMeta = onAppEvent('biu:workspace-meta', (detail) => {
      if (!detail?.workspaceId) {
        void load()
        return
      }
      setWorkspaces((rows) =>
        rows.map((row) =>
          row.id === detail.workspaceId
            ? {
                ...row,
                ...(detail.name !== undefined ? { name: detail.name } : {}),
                ...(detail.avatar !== undefined ? { avatar: detail.avatar } : {}),
              }
            : row,
        ),
      )
    })
    return () => {
      cancelled = true
      offAccount()
      offWorkspaceMeta()
    }
  }, [])

  if (!workspaces.length) return null
  const current = workspaces.find((workspace) => workspace.id === active) ?? workspaces[0]!
  const switchTo = (workspaceId: string) => {
    const token = readAccountToken()
    setOpen(false)
    if (!token || !workspaceId || workspaceId === active) return
    setActive(workspaceId)
    writeWorkspaceId(workspaceId)
    void accountFetch(token, '/api/account/active', {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    })
      .then(() => syncWorkspaceEndpoint(workspaceId))
      .then(() => accountFetch(token, '/api/agents'))
      .then((body) => {
        const sessions = (body as { sessions?: Array<{ id?: string; updatedAt?: number }> }).sessions ?? []
        window.location.assign(defaultSessionPath(sessions))
      })
      .catch(() => window.location.assign('/'))
  }
  const createWorkspace = (location: 'device' | 'cloud') => {
    const token = readAccountToken()
    if (!token || creatingLocation) return
    const name = location === 'device' ? '本机空间' : '云端空间'
    setCreateError('')
    setCreatingLocation(location)
    void accountFetch(token, '/api/account/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, location }),
    })
      .then(async (body) => {
        const created = body as CollabWorkspace
        writeWorkspaceId(created.id)
        await accountFetch(token, '/api/account/active', {
          method: 'POST',
          body: JSON.stringify({ workspaceId: created.id }),
        })
        await syncWorkspaceEndpoint(created.id)
        const listed = await accountFetch(token, '/api/agents') as { sessions?: Array<{ id?: string; updatedAt?: number }> }
        window.location.assign(defaultSessionPath(listed.sessions ?? []))
      })
      .catch((error) => {
        setCreatingLocation(null)
        setCreateError(error instanceof Error ? error.message : '创建失败')
      })
  }
  return (
    <div className="shell-workspace-switch-wrap">
      <button
        ref={triggerRef}
        type="button"
        className={`shell-workspace-switcher${open ? ' is-open' : ''}`}
        aria-label="切换空间"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="shell-workspace-switcher"
        onClick={() => setOpen((value) => !value)}
      >
        {current.avatar?.trim() ? (
          <img
            src={current.avatar.trim()}
            alt=""
            className="shell-workspace-switch-icon is-avatar"
            data-testid="shell-workspace-switch-avatar"
          />
        ) : (
          <WorkspaceAvatar
            size={18}
            className="shell-workspace-switch-icon is-avatar"
            data-testid="shell-workspace-switch-avatar"
          />
        )}
        <span className="shell-workspace-switch-copy">
          <strong>{current.name}</strong>
        </span>
      </button>
      {open ? (
        <AnchorMenu
          anchor={triggerRef.current}
          onClose={() => {
            setOpen(false)
            setCloudMenuOpen(false)
          }}
          inside={(node) => node instanceof Element && Boolean(node.closest('.shell-workspace-cloud-accounts'))}
          placement="bottom"
          minWidth={240}
          zIndex={100}
          className="shell-workspace-menu"
          role="menu"
          aria-label="选择空间"
          data-testid="shell-workspace-menu"
        >
          <div className="shell-workspace-menu-list">
            {workspaces.map((workspace) => {
              const avatar = workspace.avatar?.trim()
              return (
                <button
                  key={workspace.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={workspace.id === active}
                  className={`shell-workspace-menu-item${workspace.id === active ? ' is-active' : ''}`}
                  onClick={() => switchTo(workspace.id)}
                >
                  {avatar ? (
                    <img src={avatar} alt="" className="shell-workspace-menu-icon is-avatar" />
                  ) : (
                    <WorkspaceAvatar size={18} className="shell-workspace-menu-icon is-avatar" />
                  )}
                  <span className="shell-workspace-menu-copy">
                    <strong>{workspace.name}</strong>
                  </span>
                  <small className="shell-workspace-menu-role">
                    <TagChip id={workspace.role} label={workspaceRoleLabel(workspace.role)} />
                  </small>
                </button>
              )
            })}
          </div>
          <div className="shell-workspace-menu-actions">
            <button
              type="button"
              className="shell-workspace-menu-action"
              disabled={Boolean(creatingLocation)}
              onClick={() => {
                setCreateError('')
                if (hostOnline) {
                  createWorkspace('cloud')
                  return
                }
                setOpen(false)
                setCreating(true)
              }}
            >
              <PlusIcon className="size-4" />
              <span>{hostOnline && creatingLocation ? '正在创建…' : '创建空间'}</span>
            </button>
            {hostOnline && createError ? <p className="shell-workspace-create-error" role="alert">{createError}</p> : null}
            <button
              type="button"
              className="shell-workspace-menu-action"
              onClick={() => {
                setOpen(false)
                onWorkspaceSettings?.()
              }}
            >
              <Cog6ToothIcon className="size-4" />
              <span>空间设置</span>
            </button>
            {hostOnline ? null : (() => {
              const isDeviceActive = current.location !== 'cloud'
              const localShownName = isDeviceActive
                ? (workspaceProfile.name || workspaceProfile.fallbackName || localAccount || '本机账号')
                : (localAccount || '本机账号')
              const localShownAvatar = isDeviceActive
                ? (workspaceProfile.hydrated ? workspaceProfile.avatar : (workspaceProfile.avatar || localAvatar))
                : localAvatar
              return (
              <div className="shell-workspace-menu-account" data-testid="shell-workspace-local-account">
                <span className="shell-workspace-account-avatar" aria-hidden>
                  {localShownAvatar ? (
                    <img src={localShownAvatar} alt="" />
                  ) : (
                    <AiAvatar seed={(isDeviceActive && workspaceProfile.accountId) || localAccountId || localShownName || 'biu-ai'} />
                  )}
                </span>
                <span className="shell-workspace-menu-copy">
                  <strong>{localShownName}</strong>
                </span>
                <button
                  type="button"
                  aria-label="退出"
                  data-testid="shell-workspace-local-logout"
                  onClick={() => {
                    setOpen(false)
                    writeAccountToken('')
                  }}
                >
                  <ArrowRightStartOnRectangleIcon aria-hidden />
                </button>
              </div>
              )
            })()}
            {(() => {
              const activeCloud = cloudAccounts.find((item) => item.active)
              const isCloudActive = current.location === 'cloud'
              const shownName = workspaceProfile.name || workspaceProfile.fallbackName || localAccount
              const shownAvatar = workspaceProfile.hydrated ? workspaceProfile.avatar : (workspaceProfile.avatar || localAvatar)
              const cloudShownAvatar = isCloudActive
                ? (workspaceProfile.hydrated ? workspaceProfile.avatar : (workspaceProfile.avatar || activeCloud?.avatar || ''))
                : (activeCloud?.avatar || '')
              const cloudShownName = isCloudActive
                ? (workspaceProfile.name || workspaceProfile.fallbackName || activeCloud?.name || activeCloud?.email || '暂时无账号')
                : (activeCloud?.name || activeCloud?.email || '暂时无账号')
              return (
                <div className="shell-workspace-menu-account" data-testid="shell-workspace-cloud-account">
                  {hostOnline ? (
                    <span className="shell-workspace-account-avatar" aria-hidden>
                      {shownAvatar ? (
                        <img src={shownAvatar} alt="" />
                      ) : (
                        <AiAvatar seed={workspaceProfile.accountId || localAccountId || shownName || 'biu-ai'} />
                      )}
                    </span>
                  ) : activeCloud ? (
                    <span className="shell-workspace-account-avatar" aria-hidden>
                      {cloudShownAvatar ? (
                        <img src={cloudShownAvatar} alt="" />
                      ) : (
                        <AiAvatar seed={(isCloudActive && workspaceProfile.accountId) || activeCloud.id || cloudShownName || activeCloud.email || 'biu-ai'} />
                      )}
                    </span>
                  ) : (
                    <CloudIcon aria-hidden />
                  )}
                  <span className="shell-workspace-menu-copy">
                    <strong className={!hostOnline && !activeCloud ? 'is-empty' : ''}>
                      {hostOnline ? (shownName || '云端账号') : cloudShownName}
                    </strong>
                  </span>
                  <span className="shell-workspace-menu-account-actions">
                    <button
                      type="button"
                      aria-label="退出"
                      data-testid="shell-workspace-cloud-logout"
                      onClick={() => {
                        if (hostOnline) {
                          setOpen(false)
                          writeAccountToken('')
                          return
                        }
                        const token = readAccountToken()
                        void accountFetch(token, '/api/account/cloud', { method: 'DELETE' })
                          .then(() => emitAppEvent('biu:account-token', undefined))
                          .catch((error) => {
                            console.warn('[shell] cloud logout failed', error)
                          })
                      }}
                    >
                      <ArrowRightStartOnRectangleIcon aria-hidden />
                    </button>
                    {hostOnline ? null : (
                      <button
                        ref={cloudExpandRef}
                        type="button"
                        aria-label="更多在线账号"
                        aria-expanded={cloudMenuOpen}
                        data-testid="shell-workspace-cloud-expand"
                        onClick={() => setCloudMenuOpen((value) => !value)}
                      >
                        <ChevronRightIcon aria-hidden />
                      </button>
                    )}
                  </span>
                </div>
              )
            })()}
          </div>
        </AnchorMenu>
      ) : null}
      {open && cloudMenuOpen && !hostOnline ? (
        <AnchorMenu
          anchor={cloudExpandRef.current}
          onClose={() => setCloudMenuOpen(false)}
          placement="right"
          minWidth={220}
          zIndex={120}
          className="shell-workspace-menu shell-workspace-cloud-accounts"
          role="menu"
          aria-label="在线账号"
          data-testid="shell-workspace-cloud-accounts"
        >
          {cloudAccounts.length ? cloudAccounts.map((item) => (
            <button
              key={`${item.origin ?? ''} ${item.id}`}
              type="button"
              className={`shell-workspace-menu-item${item.active ? ' is-active' : ''}`}
              onClick={() => {
                const token = readAccountToken()
                void accountFetch(token, '/api/account/cloud/active', {
                  method: 'POST',
                  body: JSON.stringify({ remoteAccountId: item.id, origin: item.origin }),
                })
                  .then(() => {
                    setCloudMenuOpen(false)
                    emitAppEvent('biu:account-token', undefined)
                  })
                  .catch((error) => {
                    console.warn('[shell] cloud account switch failed', item.id, error)
                  })
              }}
            >
              <span className="shell-workspace-account-avatar" aria-hidden>
                {item.avatar ? (
                  <img src={item.avatar} alt="" />
                ) : (
                  <AiAvatar seed={item.id || item.name || item.email || 'biu-ai'} />
                )}
              </span>
              <span className="shell-workspace-menu-copy">
                <strong>{item.name || item.email || '在线账号'}</strong>
              </span>
            </button>
          )) : <p className="shell-workspace-cloud-empty">暂无在线账号</p>}
        </AnchorMenu>
      ) : null}
      {creating && typeof document !== 'undefined' ? createPortal(
        <div
          className="shell-workspace-create-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !creatingLocation) setCreating(false)
          }}
        >
          <section className="shell-workspace-create-dialog" role="dialog" aria-modal="true" aria-label="创建新空间">
            <header>
              <div>
                <h2>创建新空间</h2>
                <p>选择数据保存的位置，创建后也可以继续添加其他空间。</p>
              </div>
              <button
                type="button"
                aria-label="关闭"
                disabled={Boolean(creatingLocation)}
                onClick={() => setCreating(false)}
              >
                <XMarkIcon className="size-4" />
              </button>
            </header>
            <div className="shell-workspace-create-cards">
              <button
                type="button"
                className="shell-workspace-create-card"
                disabled={Boolean(creatingLocation)}
                onClick={() => createWorkspace('device')}
              >
                <span className="shell-workspace-create-card-icon"><ComputerDesktopIcon aria-hidden /></span>
                <strong>本机空间</strong>
                <small>数据只保存在当前设备，不上传云端。可通过局域网链接临时分享。</small>
                <em>{creatingLocation === 'device' ? '正在创建…' : '创建本机空间'}</em>
              </button>
              <button
                type="button"
                className="shell-workspace-create-card"
                disabled={Boolean(creatingLocation)}
                onClick={() => createWorkspace('cloud')}
              >
                <span className="shell-workspace-create-card-icon"><CloudIcon aria-hidden /></span>
                <strong>云端空间</strong>
                <small>数据保存在云端，可使用成员、权限和在线协作功能。</small>
                <em>{creatingLocation === 'cloud' ? '正在创建…' : '创建云端空间'}</em>
              </button>
            </div>
            {createError ? <p className="shell-workspace-create-error" role="alert">{createError}</p> : null}
          </section>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

export function ShellSettingsCollab({ panel = 'members' }: { panel?: 'workspace' | 'members' }) {
  const [token, setToken] = useState(() => readStorageString(ACCOUNT_KEY) ?? '')
  const [workspaces, setWorkspaces] = useState<CollabWorkspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [members, setMembers] = useState<CollabMember[]>([])
  const [inviteId, setInviteId] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'viewer'>('viewer')
  const [workspaceInviteUrl, setWorkspaceInviteUrl] = useState('')
  const [inviteCopied, setInviteCopied] = useState(false)
  const [presence, setPresence] = useState<CollabPresence[]>([])
  const [pendingRemove, setPendingRemove] = useState<CollabMember | null>(null)
  const [pendingTransferOwner, setPendingTransferOwner] = useState<CollabMember | null>(null)
  const [transferConfirmName, setTransferConfirmName] = useState('')
  const [deleteName, setDeleteName] = useState('')
  const [error, setError] = useState('')

  const remember = (next: string) => {
    setToken(next)
    writeAccountToken(next)
  }

  const loadWorkspace = useCallback(async (current: string, id: string) => {
    if (!current || !id) {
      setMembers([])
      setPresence([])
      return
    }
    const listed = await accountFetch(current, `/api/account/workspaces/${id}/members`) as { members?: CollabMember[] }
    setMembers(listed.members ?? [])
    const here = (await accountFetch(current, '/api/account/presence', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: id }),
    })) as { presence?: CollabPresence[] }
    setPresence(here.presence ?? [])
  }, [])

  useEffect(() => {
    if (!token) {
      setWorkspaces([])
      return
    }
    let gone = false
    void (async () => {
      try {
        const listed = (await accountFetch(token, '/api/account/workspaces')) as { workspaces?: CollabWorkspace[] }
        const active = (await accountFetch(token, '/api/account/active')) as { workspaceId?: string }
        if (gone) return
        const rows = listed.workspaces ?? []
        const nextWorkspaceId = String(active.workspaceId || rows[0]?.id || '')
        setWorkspaces(rows)
        setWorkspaceId(nextWorkspaceId)
        setWorkspaceName(rows.find((row) => row.id === nextWorkspaceId)?.name ?? '')
        setDeleteName('')
        setError('')
      } catch (err) {
        if (gone) return
        if (isAuthFailure(err)) remember('')
        setError(err instanceof Error ? err.message : '无法读取账号')
      }
    })()
    return () => {
      gone = true
    }
  }, [token])

  useEffect(() => {
    if (panel !== 'members' || !token || !workspaceId) return
    const sync = () => {
      void loadWorkspace(token, workspaceId).catch((err) => {
        setError(err instanceof Error ? err.message : '无法读取工作区')
      })
    }
    sync()
    return onAppEvents(['biu:workspace-profile', 'biu:account-token'], sync)
  }, [panel, token, workspaceId, loadWorkspace])

  const currentWorkspace = workspaces.find((row) => row.id === workspaceId)
  const workspaceRole = currentWorkspace?.role
  const savedWorkspaceName = currentWorkspace?.name ?? ''
  const currentWorkspaceAvatar = currentWorkspace?.avatar?.trim() ?? ''
  const activeWorkspaceAvatarPreset = currentWorkspaceAvatar
    ? detectWorkspaceAvatarPreset(currentWorkspaceAvatar)
    : DEFAULT_WORKSPACE_AVATAR_PRESET_ID
  const workspaceAvatarFileRef = useRef<HTMLInputElement | null>(null)
  const [savingWorkspaceAvatar, setSavingWorkspaceAvatar] = useState(false)
  const saveWorkspaceAvatar = (avatar: string) => {
    if (!token || !workspaceId || !canManage) return
    setSavingWorkspaceAvatar(true)
    void accountFetch(token, `/api/account/workspaces/${workspaceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ avatar }),
    })
      .then((body) => {
        const updated = body as CollabWorkspace
        setWorkspaces((rows) => rows.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)))
        setError('')
        emitAppEvent('biu:workspace-meta', {
          workspaceId: updated.id,
          name: updated.name,
          avatar: updated.avatar ?? '',
        })
      })
      .catch((err) => setError(err instanceof Error ? err.message : '保存空间头像失败'))
      .finally(() => setSavingWorkspaceAvatar(false))
  }
  const canManage = canManageWorkspaceRole(workspaceRole)
  const canDeleteWorkspace = workspaceRole === 'owner'
  const canChangeRoles = workspaceRole === 'owner'
  const removePendingMember = () => {
    if (!pendingRemove) return
    const accountId = pendingRemove.id
    setPendingRemove(null)
    void accountFetch(token, `/api/account/workspaces/${workspaceId}/members/${accountId}`, {
      method: 'DELETE',
    })
      .then((body) => {
        setMembers(((body as { members?: CollabMember[] }).members) ?? [])
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : '移除成员失败'))
  }

  return (
    <section className="settings-account" data-testid="settings-collab">
      <header className="settings-account-head">
        <h3 className="settings-account-title">{panel === 'workspace' ? '空间设置' : '成员设置'}</h3>
        <p className="settings-muted settings-account-lead">
          {panel === 'workspace'
            ? '设置当前选中的空间。空间切换和新建空间请使用左上角菜单。'
            : '管理当前空间的成员角色、邀请方式与在线状态。'}
        </p>
      </header>
      {error ? <p className="settings-account-error" data-testid="settings-collab-error">{error}</p> : null}
      {panel === 'workspace' ? (
      <>
      <div className="settings-account-row">
        <div className="settings-account-copy">
          <span className="settings-account-label">空间头像</span>
          <p className="settings-muted settings-account-hint">
            {canManage ? '设置当前空间的头像，将展示在侧边栏与空间数据入口。' : '只有空间所有者或管理者可以修改空间头像。'}
          </p>
        </div>
        <div className="settings-account-photo is-compact">
          <button
            type="button"
            className="settings-account-avatar is-compact"
            data-testid="settings-workspace-avatar"
            title={canManage ? '更换空间头像' : '空间头像'}
            aria-label="更换空间头像"
            disabled={!canManage || savingWorkspaceAvatar}
            onClick={() => workspaceAvatarFileRef.current?.click()}
          >
            {currentWorkspaceAvatar ? (
              <img src={currentWorkspaceAvatar} alt="" />
            ) : (
              <WorkspaceAvatar
                className="settings-account-ai-avatar"
                data-testid="settings-workspace-default-avatar"
              />
            )}
            {canManage ? (
              <span className="settings-account-avatar-veil" aria-hidden>
                <CameraIcon className="size-4" />
              </span>
            ) : null}
          </button>
          {canManage && currentWorkspaceAvatar ? (
            <button
              type="button"
              className="settings-account-clear"
              data-testid="settings-workspace-reset-avatar"
              disabled={savingWorkspaceAvatar}
              onClick={() => saveWorkspaceAvatar('')}
            >
              恢复默认
            </button>
          ) : null}
          <input
            ref={workspaceAvatarFileRef}
            type="file"
            accept="image/*"
            hidden
            data-testid="settings-workspace-avatar-file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              void readAvatarFile(file)
                .then((dataUrl) => saveWorkspaceAvatar(dataUrl))
                .catch((err) => setError(err instanceof Error ? err.message : '无法读取头像图片'))
            }}
          />
        </div>
      </div>
      <div className="settings-account-row is-stacked settings-avatar-studio" data-testid="settings-workspace-avatar-studio">
        <div className="settings-avatar-group">
          <div className="settings-avatar-group-head">
            <span className="settings-account-label">预设头像</span>
          </div>
          <div className="settings-avatar-swatches" role="group" aria-label="空间预设头像">
            {WORKSPACE_AVATAR_PRESETS.map((preset) => {
              const previewUrl = buildWorkspaceAvatarDataUrl(preset.id)
              const isSelected = activeWorkspaceAvatarPreset === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`settings-avatar-swatch${isSelected ? ' is-on' : ''}`}
                  data-testid={`settings-workspace-avatar-preset-${preset.id}`}
                  title={preset.label}
                  aria-label={`选择${preset.label}空间头像`}
                  aria-pressed={isSelected}
                  disabled={!canManage || savingWorkspaceAvatar}
                  onClick={() =>
                    saveWorkspaceAvatar(
                      preset.id === DEFAULT_WORKSPACE_AVATAR_PRESET_ID ? '' : previewUrl,
                    )
                  }
                >
                  <img src={previewUrl} alt="" />
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <form
        className="settings-account-row"
        onSubmit={(event) => {
          event.preventDefault()
          if (!token || !workspaceId || !canManage || !workspaceName.trim()) return
          void accountFetch(token, `/api/account/workspaces/${workspaceId}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: workspaceName }),
          })
            .then((body) => {
              const updated = body as CollabWorkspace
              setWorkspaces((rows) => rows.map((row) => row.id === updated.id ? updated : row))
              setError('')
              emitAppEvent('biu:workspace-meta', {
                workspaceId: updated.id,
                name: updated.name,
                avatar: updated.avatar ?? '',
              })
            })
            .catch((err) => setError(err instanceof Error ? err.message : '保存失败'))
        }}
      >
        <div className="settings-account-copy">
          <label className="settings-account-label" htmlFor="settings-collab-workspace">空间名称</label>
          <p className="settings-muted settings-account-hint" data-testid="settings-current-workspace">
            {canManage ? '修改当前选中空间的名称。' : '只有空间所有者或管理者可以修改名称。'}
          </p>
        </div>
        <div className="settings-account-actions">
          <input
            id="settings-collab-workspace"
            className="settings-account-input"
            value={workspaceName}
            maxLength={40}
            placeholder="空间名称"
            data-testid="settings-collab-workspace"
            disabled={!canManage}
            onChange={(event) => setWorkspaceName(event.target.value)}
          />
          <button
            type="submit"
            className="settings-account-action"
            disabled={!token || !workspaceId || !canManage || !workspaceName.trim()}
            data-testid="settings-collab-save"
          >
            保存
          </button>
        </div>
      </form>
      {canDeleteWorkspace ? (
      <form
        className="settings-account-row"
        onSubmit={(event) => {
          event.preventDefault()
          if (!token || !workspaceId || deleteName !== savedWorkspaceName) return
          void accountFetch(token, `/api/account/workspaces/${workspaceId}`, {
            method: 'DELETE',
            body: JSON.stringify({ name: deleteName }),
          })
            .then((body) => {
              const nextId = String((body as { activeWorkspaceId?: string }).activeWorkspaceId ?? '')
              setWorkspaces((rows) => {
                const remaining = rows.filter((row) => row.id !== workspaceId)
                setWorkspaceName(remaining.find((row) => row.id === nextId)?.name ?? '')
                return remaining
              })
              setWorkspaceId(nextId)
              if (nextId) writeWorkspaceId(nextId)
              else clearWorkspaceId()
              setDeleteName('')
              setError('')
              emitAppEvent('biu:account-token', undefined)
            })
            .catch((err) => setError(err instanceof Error ? err.message : '删除空间失败'))
        }}
      >
        <div className="settings-account-copy">
          <label className="settings-account-label" htmlFor="settings-workspace-delete-name">删除空间</label>
          <p className="settings-muted settings-account-hint">
            删除后无法恢复。请重新输入空间名称「{savedWorkspaceName}」确认。该空间下的页面、任务、代理和其他数据会永久删除。
          </p>
        </div>
        <div className="settings-account-actions">
          <input
            id="settings-workspace-delete-name"
            className="settings-account-input"
            value={deleteName}
            maxLength={40}
            placeholder="输入空间名称"
            data-testid="settings-workspace-delete-name"
            onChange={(event) => setDeleteName(event.target.value)}
          />
          <button
            type="submit"
            className="settings-account-action is-danger"
            disabled={!token || !workspaceId || deleteName !== savedWorkspaceName}
            data-testid="settings-workspace-delete"
          >
            删除空间
          </button>
        </div>
      </form>
      ) : null}
      </>
      ) : null}
      {panel === 'members' ? (
      <>
      <form
        className="settings-account-row settings-members-section"
        onSubmit={(event) => {
          event.preventDefault()
          if (!token || !workspaceId || !inviteId.trim()) return
          void accountFetch(token, `/api/account/workspaces/${workspaceId}/members`, {
            method: 'POST',
            body: JSON.stringify({ email: inviteId.trim() }),
          })
            .then((body) => {
              setMembers(((body as { members?: CollabMember[] }).members) ?? [])
              setInviteId('')
              setError('')
            })
            .catch((err) => setError(err instanceof Error ? err.message : '邀请失败'))
        }}
      >
        <div className="settings-account-copy">
          <div className="settings-member-section-head">
            <label className="settings-account-label" htmlFor="settings-collab-invite">空间成员</label>
            {members.length ? <span className="settings-member-count">{members.length}</span> : null}
          </div>
          <p className="settings-muted settings-account-hint">
            所有者管理管理员；管理员可以邀请和移除普通成员。
          </p>
          <ul className="settings-account-people settings-member-list" data-testid="settings-collab-members">
            {members.length ? members.map((row) => (
              <li key={row.id} className="settings-member-row">
                <span className="settings-member-person">
                  <span className="settings-member-avatar" aria-hidden>
                    {row.avatar ? (
                      <img src={row.avatar} alt="" />
                    ) : (
                      <AiAvatar seed={row.id || row.name || row.email || 'biu-ai'} />
                    )}
                  </span>
                  <span className="settings-member-identity">
                    <strong title={row.name || row.email}>{row.name || row.email || '未命名成员'}</strong>
                    {row.email && row.email !== row.name ? <small title={row.email}>{row.email}</small> : null}
                  </span>
                </span>
                <span className="settings-member-controls">
                  {canChangeRoles && row.role !== 'owner' ? (
                  <SettingsSelect
                    className="settings-member-role"
                    ariaLabel={`修改 ${row.name || row.email} 的角色`}
                    testId={`settings-member-role-${row.id}`}
                    value={row.role === 'admin' || row.role === 'viewer' ? row.role : 'member'}
                    options={MEMBER_ROLE_OPTIONS}
                    menuMinWidth={210}
                    onChange={(nextRole) => {
                      if (nextRole === 'owner') {
                        setPendingTransferOwner(row)
                        setTransferConfirmName('')
                        return
                      }
                      void accountFetch(token, `/api/account/workspaces/${workspaceId}/members/${row.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ role: nextRole }),
                      })
                        .then((body) => {
                          setMembers(((body as { members?: CollabMember[] }).members) ?? [])
                          setError('')
                        })
                        .catch((err) => setError(err instanceof Error ? err.message : '修改角色失败'))
                    }}
                  />
                  ) : (
                    <span className="settings-member-role-label">
                      {workspaceRoleLabel(row.role)}
                    </span>
                  )}
                  {canManage && row.role !== 'owner' && (workspaceRole === 'owner' || row.role === 'member' || row.role === 'viewer') ? (
                  <button
                    type="button"
                    className="settings-account-clear settings-member-remove"
                    onClick={() => setPendingRemove(row)}
                  >
                    移除
                  </button>
                  ) : null}
                </span>
              </li>
            )) : <li className="settings-muted settings-member-empty">当前空间还没有其他成员。</li>}
          </ul>
        </div>
        {canManage ? (
          <div className="settings-member-invite">
            <div className="settings-member-invite-block">
              <div className="settings-member-invite-copy">
                <p className="settings-account-label">邀请成员</p>
                <p className="settings-muted settings-account-hint">通过登录邮箱直接将已有账号加入空间。</p>
              </div>
              <div className="settings-member-invite-row">
                <input
                  id="settings-collab-invite"
                  className="settings-account-input"
                  value={inviteId}
                  placeholder="成员的登录邮箱"
                  type="email"
                  data-testid="settings-collab-invite"
                  onChange={(event) => setInviteId(event.target.value)}
                />
                <button type="submit" className="settings-account-action" disabled={!token || !workspaceId || !inviteId.trim()}>
                  邀请
                </button>
              </div>
            </div>
            <div className="settings-member-invite-block">
              <div className="settings-member-invite-copy">
                <p className="settings-account-label">邀请链接</p>
                <p className="settings-muted settings-account-hint">选择默认权限并生成 7 天有效的加入链接。</p>
              </div>
              <div className="settings-member-invite-row is-link-row">
                <SettingsSelect
                  className="settings-invite-role"
                  ariaLabel="邀请链接角色"
                  testId="settings-invite-role"
                  value={inviteRole}
                  options={INVITE_ROLE_OPTIONS}
                  menuMinWidth={190}
                  onChange={(next) => setInviteRole(next)}
                />
                <button
                  type="button"
                  className="settings-account-action"
                  data-testid="settings-collab-invite-link"
                  onClick={() => {
                    void accountFetch(token, `/api/account/workspaces/${workspaceId}/invites`, {
                      method: 'POST',
                      body: JSON.stringify({ role: inviteRole, expiresInHours: 168 }),
                    })
                      .then(async (body) => {
                        const url =
                          typeof body.url === 'string' && body.url.trim()
                            ? body.url.trim()
                            : new URL(String(body.path ?? '/'), window.location.origin).toString()
                        setWorkspaceInviteUrl(url)
                        setInviteCopied(true)
                        window.setTimeout(() => setInviteCopied(false), 1800)
                        await navigator.clipboard.writeText(url).catch(() => undefined)
                        setError('')
                      })
                      .catch((err) => setError(err instanceof Error ? err.message : '生成邀请链接失败'))
                  }}
                >
                  {inviteCopied ? '已复制链接' : '生成链接'}
                </button>
              </div>
              {workspaceInviteUrl ? (
                <div className="settings-member-invite-url-row">
                  <input
                    className="settings-account-input settings-member-invite-url"
                    aria-label="空间邀请链接"
                    readOnly
                    value={workspaceInviteUrl}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="settings-account-action"
                    onClick={() => {
                      void navigator.clipboard.writeText(workspaceInviteUrl).then(() => {
                        setInviteCopied(true)
                        window.setTimeout(() => setInviteCopied(false), 1800)
                      }).catch(() => undefined)
                    }}
                  >
                    {inviteCopied ? <CheckIcon aria-hidden className="size-3.5" /> : <ClipboardDocumentIcon aria-hidden className="size-3.5" />}
                    <span>{inviteCopied ? '已复制' : '复制'}</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>
      <div className="settings-account-row">
        <div className="settings-account-copy">
          <div className="settings-member-section-head">
            <p className="settings-account-label">正在看</p>
            {presence.length ? <span className="settings-member-count">{presence.length}</span> : null}
          </div>
          <ul className="settings-account-people settings-presence-list" data-testid="settings-collab-presence">
            {presence.length ? presence.map((row) => {
              const member = members.find((m) => m.id === row.accountId)
              const displayName = member?.name || row.name
              return (
                <li key={row.accountId} className="settings-presence-pill">
                  <span className="settings-presence-dot" aria-hidden />
                  <span className="settings-presence-avatar" aria-hidden>
                    {member?.avatar ? (
                      <img src={member.avatar} alt="" />
                    ) : (
                      <AiAvatar seed={row.accountId || displayName || 'biu-ai'} />
                    )}
                  </span>
                  <span className="settings-presence-name">{displayName}</span>
                  {row.collection && row.recordId ? (
                    <span className="settings-presence-path">{row.collection}/{row.recordId}</span>
                  ) : null}
                </li>
              )
            }) : <li className="settings-muted">打开工作区后，30 秒内有心跳的人会出现在这里。</li>}
          </ul>
        </div>
      </div>
      </>
      ) : null}
      {pendingRemove ? (
        <ConfirmDialog
          title="移除空间成员"
          message={<>确定将“{pendingRemove.name || pendingRemove.email || '该成员'}”移出当前空间吗？移除后，对方将无法继续访问空间数据。</>}
          confirmLabel="移除成员"
          danger
          testId="settings-member-remove-dialog"
          onCancel={() => setPendingRemove(null)}
          onConfirm={removePendingMember}
        />
      ) : null}
      {pendingTransferOwner ? (
        <ConfirmDialog
          title="移交空间所有者"
          message={(
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0 }}>
                确定将空间「{savedWorkspaceName}」的所有者移交给「{pendingTransferOwner.name || pendingTransferOwner.email || '该成员'}」吗？移交后你将降级为管理员，且<strong>此操作不可撤回</strong>。
              </p>
              <input
                type="text"
                className="settings-account-input"
                value={transferConfirmName}
                placeholder={`请输入空间名称「${savedWorkspaceName}」以确认`}
                aria-label="输入空间名称以确认移交"
                data-testid="settings-member-transfer-owner-input"
                onChange={(event) => setTransferConfirmName(event.target.value)}
              />
            </div>
          )}
          confirmLabel="确认移交"
          danger
          confirmDisabled={!savedWorkspaceName || transferConfirmName.trim() !== savedWorkspaceName}
          testId="settings-member-transfer-owner-dialog"
          onCancel={() => {
            setPendingTransferOwner(null)
            setTransferConfirmName('')
          }}
          onConfirm={() => {
            if (!savedWorkspaceName || transferConfirmName.trim() !== savedWorkspaceName) return
            const target = pendingTransferOwner
            setPendingTransferOwner(null)
            setTransferConfirmName('')
            void accountFetch(token, `/api/account/workspaces/${workspaceId}/members/${target.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ role: 'owner' }),
            })
              .then((body) => {
                setMembers(((body as { members?: CollabMember[] }).members) ?? [])
                setWorkspaces((rows) => rows.map((workspace) =>
                  workspace.id === workspaceId ? { ...workspace, role: 'admin' } : workspace,
                ))
                setError('')
              })
              .catch((err) => setError(err instanceof Error ? err.message : '移交所有者失败'))
          }}
        />
      ) : null}
    </section>
  )
}

export function ShellSettingsWorkspace() {
  return <ShellSettingsCollab panel="workspace" />
}

export function ShellSettingsMembers() {
  return <ShellSettingsCollab panel="members" />
}

export function ShellSettingsAppearance() {
  useSyncExternalStore(subscribeTheme, getThemeVersion, () => 0)
  const theme = readTheme()
  const accent = readAccent()

  const pickTheme = (next: ThemeMode) => {
    applyTheme(next)
    void persistTheme(next).catch(() => {})
  }

  const pickAccent = (next: ThemeAccent) => {
    applyAccent(next)
    void persistAccent(next).catch(() => {})
  }

  return (
    <section className="settings-account" data-testid="settings-appearance">
      <header className="settings-account-head">
        <h3 className="settings-account-title">样式</h3>
        <p className="settings-muted settings-account-lead">调整日间/夜间模式和界面主题色。</p>
      </header>
      <div className="settings-account-row is-stacked">
        <div className="settings-account-copy">
          <p className="settings-account-label">日间与夜间模式</p>
          <p className="settings-muted settings-account-hint">日间为浅色界面，夜间为深色界面。</p>
        </div>
        <div className="settings-theme-grid">
          <button
            type="button"
            className={`settings-theme-card${theme === 'light' ? ' is-on' : ''}`}
            data-theme-card="light"
            aria-pressed={theme === 'light'}
            data-testid="settings-theme-light"
            onClick={() => pickTheme('light')}
          >
            <span className="settings-theme-preview is-light" aria-hidden />
            日间模式
          </button>
          <button
            type="button"
            className={`settings-theme-card${theme === 'dark' ? ' is-on' : ''}`}
            data-theme-card="dark"
            aria-pressed={theme === 'dark'}
            data-testid="settings-theme-dark"
            onClick={() => pickTheme('dark')}
          >
            <span className="settings-theme-preview is-dark" aria-hidden />
            夜间模式
          </button>
        </div>
      </div>
      <div className="settings-account-row is-stacked">
        <div className="settings-account-copy">
          <p className="settings-account-label">主题</p>
          <p className="settings-muted settings-account-hint">选择全局强调色，应用于按钮、开关、选中框与高亮。</p>
        </div>
        <div className="settings-accent-grid" role="group" aria-label="主题色" data-testid="settings-accent-grid">
          {THEME_ACCENTS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`settings-accent-chip${accent === item.id ? ' is-on' : ''}`}
              aria-pressed={accent === item.id}
              data-testid={`settings-accent-${item.id}`}
              onClick={() => pickAccent(item.id)}
            >
              <span className="settings-accent-dot" style={{ background: item.colorVar }} aria-hidden />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

const KBD_LABEL: Record<string, string> = {
  cmd: '⌘',
  shift: '⇧',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  enter: 'Enter',
  tab: 'Tab',
  esc: 'Esc',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
  backslash: '\\',
}

const KBD_PATH: Record<string, string> = {
  cmd: 'M6 6H4.25A1.75 1.75 0 1 1 6 4.25V6zm0 0h4m0 0h1.75A1.75 1.75 0 1 0 10 4.25V6m0 0v4m0 0h1.75A1.75 1.75 0 1 1 10 11.75V10m0 0H6m0 0H4.25A1.75 1.75 0 1 0 6 11.75V10m0 0V6',
  shift: 'M8 3.2 13.4 9H10.5v3.8H5.5V9H2.6z',
  up: 'M4 9.5 8 5.5l4 4',
  down: 'M4 6.5 8 10.5l4-4',
  left: 'M9.5 4 5.5 8l4 4',
  right: 'M6.5 4 10.5 8l-4 4',
  enter: 'M11.2 3.4v5.4H4.4m0 0 2.3-2.3M4.4 8.8l2.3 2.3',
  tab: 'M2.6 8h7.2m0 0-2.1-2.1M9.8 8 7.7 10.1M13.4 4.2v7.6',
  delete: 'M6.1 4.2h7.2v7.6H6.1L3.2 8zM8 6.5l3 3m0-3-3 3',
}

function SettingsKbdIcon({ name }: { name: string }) {
  const d = KBD_PATH[name]
  if (!d) return <>{KBD_LABEL[name] ?? name}</>
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d={d}
        fill={name === 'shift' ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={name === 'shift' ? 0 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SettingsKbd({ keys }: { keys: string[] }) {
  return (
    <span className="settings-kbd">
      {keys.map((key, index) =>
        key === '/' ? (
          <span key={`${key}-${index}`} className="settings-kbd-or">
            /
          </span>
        ) : (
          <kbd key={`${key}-${index}`} data-kbd={key} title={KBD_LABEL[key] ?? key}>
            <SettingsKbdIcon name={key} />
          </kbd>
        ),
      )}
    </span>
  )
}

export function ShellSettingsShortcuts() {
  return (
    <section className="settings-account" data-testid="settings-shortcuts">
      <header className="settings-account-head">
        <h3 className="settings-account-title">快捷键</h3>
        <p className="settings-muted settings-account-lead">Windows 与 Linux 上 ⌘ 用 Ctrl。编辑器内 ⌘F 为正文查找，⌘⇧F 仍打开全局搜索。</p>
      </header>
      <h4 className="settings-pane-subtitle">全局</h4>
      <ul className="settings-shortcut-list">
        <li>
          <span>搜索</span>
          <SettingsKbd keys={['cmd', 'F', '/', 'cmd', 'shift', 'F']} />
        </li>
        <li>
          <span>快速选取</span>
          <SettingsKbd keys={['cmd', '2']} />
        </li>
        <li>
          <span>编辑器内送到会话</span>
          <SettingsKbd keys={['cmd', 'L']} />
        </li>
        <li>
          <span>左右栏切换</span>
          <SettingsKbd keys={['cmd', 'backslash']} />
        </li>
      </ul>
      <h4 className="settings-pane-subtitle">表格</h4>
      <p className="settings-muted settings-pane-lead">先点选一个单元格，再按键。</p>
      <ul className="settings-shortcut-list">
        <li>
          <span>移动格子</span>
          <SettingsKbd keys={['up', 'down', 'left', 'right']} />
        </li>
        <li>
          <span>展开 / 收起子记录</span>
          <SettingsKbd keys={['shift', 'right', '/', 'shift', 'left']} />
        </li>
        <li>
          <span>下一格 / 上一格</span>
          <SettingsKbd keys={['tab', '/', 'shift', 'tab']} />
        </li>
        <li>
          <span>行首 / 行末</span>
          <SettingsKbd keys={['home', '/', 'end']} />
        </li>
        <li>
          <span>编辑</span>
          <SettingsKbd keys={['enter']} />
        </li>
        <li>
          <span>新建</span>
          <SettingsKbd keys={['shift', 'enter']} />
        </li>
        <li>
          <span>面包屑上一级</span>
          <SettingsKbd keys={['cmd', 'left']} />
        </li>
        <li>
          <span>标题在当前页打开</span>
          <SettingsKbd keys={['cmd', 'enter']} />
        </li>
        <li>
          <span>标题在右侧打开</span>
          <SettingsKbd keys={['cmd', 'shift', 'enter']} />
        </li>
        <li>
          <span>文字 / 数字直接编辑</span>
          <span className="settings-kbd">字母或数字</span>
        </li>
        <li>
          <span>清空单元格</span>
          <SettingsKbd keys={['delete']} />
        </li>
        <li>
          <span>动作列进入</span>
          <SettingsKbd keys={['up', 'down', 'left', 'right']} />
        </li>
        <li>
          <span>动作列执行</span>
          <SettingsKbd keys={['enter']} />
        </li>
        <li>
          <span>退出编辑</span>
          <SettingsKbd keys={['esc']} />
        </li>
      </ul>
    </section>
  )
}

type McpHostInfo = {
  url: string
  localUrl?: string
  bind?: string
  token: string
  tools?: string[]
  clients?: Record<string, unknown>
  note?: string
  online?: boolean
  workspaceId?: string
  credentialId?: string
}

function mcpSnippet(info: McpHostInfo) {
  const headers: Record<string, string> = { Authorization: `Bearer ${info.token}` }
  if (!info.online && info.workspaceId) headers['x-biu-workspace-id'] = info.workspaceId
  return JSON.stringify({ mcpServers: { biu: { url: info.url, headers } } }, null, 2)
}

export function ShellSettingsMcp(_props?: { onLeave?: () => void }) {
  const [info, setInfo] = useState<McpHostInfo | null>(null)
  const [error, setError] = useState('')
  const [reveal, setReveal] = useState(false)
  const [copied, setCopied] = useState('')
  const [rotating, setRotating] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [allowedTools, setAllowedTools] = useState<string[]>([])
  const [credentials, setCredentials] = useState<Array<Record<string, unknown>>>([])
  const [auditEvents, setAuditEvents] = useState<Array<Record<string, unknown>>>([])

  const loadCredentialData = useCallback((workspaceId: string) => {
    const token = readAccountToken()
    void Promise.all([
      accountFetch(token, `/api/account/mcp/credentials?workspaceId=${encodeURIComponent(workspaceId)}`),
      accountFetch(token, `/api/account/mcp/audit?workspaceId=${encodeURIComponent(workspaceId)}`).catch(() => ({ events: [] })),
    ]).then(([credentialsBody, auditBody]) => {
      setCredentials((credentialsBody.credentials as Array<Record<string, unknown>>) ?? [])
      setAuditEvents((auditBody.events as Array<Record<string, unknown>>) ?? [])
    })
  }, [])

  const load = useCallback(() => {
    void apiFetch('/api/mcp/info')
      .then(async (res) => {
        const data = (await res.json()) as McpHostInfo & { error?: string }
        if (!res.ok) throw new Error(data.error || '无法读取 MCP 连接信息')
        setInfo({
          url: data.url,
          localUrl: data.localUrl,
          bind: data.bind,
          token: data.token,
          tools: data.tools,
          clients: data.clients,
          note: data.note,
          online: data.online,
          workspaceId: data.workspaceId,
        })
        if (data.online) {
          setAllowedTools(data.tools ?? [])
        }
        if (data.online && data.workspaceId) loadCredentialData(data.workspaceId)
        setError('')
      })
      .catch((err) => setError(String(err instanceof Error ? err.message : err)))
  }, [loadCredentialData])

  useEffect(() => {
    load()
  }, [load])

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      window.setTimeout(() => setCopied((prev) => (prev === key ? '' : prev)), 1600)
    } catch {
      setError('无法复制，请重试')
    }
  }

  async function rotate() {
    if (!info || rotating) return
    setConfirmRotate(false)
    setRotating(true)
    try {
      if (info.online) {
        const token = readAccountToken()
        if (info.credentialId) {
          const q = info.workspaceId ? `?workspaceId=${encodeURIComponent(info.workspaceId)}` : ''
          await accountFetch(token, `/api/account/mcp/credentials/${encodeURIComponent(info.credentialId)}${q}`, { method: 'DELETE' })
        }
        const created = await accountFetch(token, '/api/account/mcp/credentials', {
          method: 'POST',
          body: JSON.stringify({ workspaceId: info.workspaceId, expiresInHours: 24 * 90, allowedTools }),
        })
        setInfo({
          ...info,
          token: String(created.token ?? ''),
          credentialId: String(created.id ?? ''),
        })
        setReveal(true)
        loadCredentialData(String(info.workspaceId ?? ''))
        setError('')
        return
      }
      const res = await apiFetch('/api/mcp/rotate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${info.token}` },
      })
      const data = (await res.json()) as McpHostInfo & { error?: string }
      if (!res.ok) throw new Error(data.error || '无法轮换 token')
      setInfo({
        url: data.url,
        localUrl: data.localUrl ?? info.localUrl,
        bind: data.bind,
        token: data.token,
        tools: info.tools,
        clients: data.clients,
        note: info.note,
        workspaceId: data.workspaceId ?? info.workspaceId,
      })
      setError('')
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
    } finally {
      setRotating(false)
    }
  }

  const tokenShown = info ? (reveal ? info.token : '•'.repeat(Math.min(28, info.token.length))) : ''

  return (
    <section className="settings-account settings-mcp" data-testid="settings-mcp">
      <header className="settings-account-head">
        <h3 className="settings-account-title">BIU MCP</h3>
        <p className="settings-muted settings-account-lead">
          {info?.online
            ? '当前为云端空间，MCP 地址指向远程主机；请先为当前空间生成专属 token（支持工具白名单、撤销与调用审计）。'
            : '当前为本机空间，MCP 听在分享口（默认 0.0.0.0），局域网其它电脑用下面的地址 + token 即可调用，配置已锁定到当前本机空间。'}
        </p>
      </header>
      {error ? (
        <p className="settings-muted settings-mcp-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="settings-mcp-subtitle-row">
        <h4 className="settings-pane-subtitle">连接</h4>
        <button
          type="button"
          className="settings-mcp-copy-config"
          disabled={!info?.token}
          data-testid="settings-mcp-copy-config"
          onClick={() => info && void copy('config', mcpSnippet(info))}
        >
          {copied === 'config' ? <CheckIcon className="size-3.5" /> : <ClipboardDocumentIcon className="size-3.5" />}
          <span>{copied === 'config' ? '已复制' : '复制配置'}</span>
        </button>
      </div>
      <div className="settings-mcp-fields">
        <label className="settings-mcp-field">
          <span>{info?.online ? '云端地址' : '局域网地址'}</span>
          <div className="settings-mcp-field-row">
            <input readOnly value={info?.url ?? ''} data-testid="settings-mcp-url" className="settings-mcp-input" />
            <button
              type="button"
              className="settings-mcp-icon-btn"
              disabled={!info?.token}
              data-testid="settings-mcp-copy-url"
              title={copied === 'url' ? '已复制' : '复制地址'}
              aria-label={copied === 'url' ? '已复制' : '复制地址'}
              onClick={() => info && void copy('url', info.url)}
            >
              {copied === 'url' ? <CheckIcon className="size-4" /> : <ClipboardDocumentIcon className="size-4" />}
            </button>
          </div>
        </label>
        {info?.localUrl && info.localUrl !== info.url ? (
          <label className="settings-mcp-field">
            <span>本机地址</span>
            <div className="settings-mcp-field-row">
              <input readOnly value={info.localUrl} data-testid="settings-mcp-local-url" className="settings-mcp-input" />
            </div>
          </label>
        ) : null}
        <label className="settings-mcp-field">
          <span>Token</span>
          <div className="settings-mcp-field-row">
            <input
              readOnly
              value={tokenShown}
              data-testid="settings-mcp-token"
              className="settings-mcp-input"
              spellCheck={false}
            />
            <button
              type="button"
              className="settings-mcp-icon-btn"
              disabled={!info?.token}
              data-testid="settings-mcp-reveal"
              title={reveal ? '隐藏 token' : '显示 token'}
              aria-label={reveal ? '隐藏 token' : '显示 token'}
              onClick={() => setReveal((on) => !on)}
            >
              {reveal ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
            <button
              type="button"
              className="settings-mcp-icon-btn"
              disabled={!info}
              data-testid="settings-mcp-copy-token"
              title={copied === 'token' ? '已复制' : '复制 token'}
              aria-label={copied === 'token' ? '已复制' : '复制 token'}
              onClick={() => info && void copy('token', info.token)}
            >
              {copied === 'token' ? <CheckIcon className="size-4" /> : <ClipboardDocumentIcon className="size-4" />}
            </button>
          </div>
        </label>
        <div className="settings-mcp-actions">
          <button
            type="button"
            className="settings-mcp-rotate"
            disabled={!info || rotating}
            data-testid="settings-mcp-rotate"
            onClick={() => setConfirmRotate(true)}
          >
            {rotating ? '正在生成…' : info?.token ? '重新生成 token' : '生成空间 token'}
          </button>
        </div>
      </div>
      {info?.online ? (
        <>
          <h4 className="settings-pane-subtitle">允许的工具</h4>
          <div className="settings-mcp-grid" data-testid="settings-mcp-allowed-tools">
            {(info.tools ?? []).map((tool) => (
              <label key={tool} className="settings-mcp-card settings-mcp-tool-card">
                <input
                  type="checkbox"
                  checked={allowedTools.includes(tool)}
                  onChange={(event) =>
                    setAllowedTools((current) =>
                      event.target.checked ? [...new Set([...current, tool])] : current.filter((name) => name !== tool),
                    )
                  }
                />
                <code>{tool}</code>
              </label>
            ))}
          </div>
          <h4 className="settings-pane-subtitle">空间凭证</h4>
          <div className="settings-mcp-fields" data-testid="settings-mcp-credentials">
            {credentials.map((credential) => (
              <div className="settings-mcp-field-row" key={String(credential.id)}>
                <code>{String(credential.id)}</code>
                <span className="settings-muted">
                  {credential.revoked_at ? '已撤销' : `到期：${new Date(Number(credential.expires_at)).toLocaleString()}`}
                </span>
                {!credential.revoked_at ? (
                  <button
                    type="button"
                    className="settings-mcp-rotate"
                    onClick={() => {
                      const q = info.workspaceId ? `?workspaceId=${encodeURIComponent(info.workspaceId)}` : ''
                      void accountFetch(readAccountToken(), `/api/account/mcp/credentials/${encodeURIComponent(String(credential.id))}${q}`, { method: 'DELETE' })
                        .then(() => loadCredentialData(String(info.workspaceId ?? '')))
                    }}
                  >
                    撤销
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <h4 className="settings-pane-subtitle">最近调用</h4>
          <div className="settings-mcp-fields" data-testid="settings-mcp-audit">
            {auditEvents.map((event) => (
              <div className="settings-mcp-field-row" key={String(event.id)}>
                <code>{String(event.tool_name)}</code>
                <span className="settings-muted">{event.success ? '成功' : '失败'}</span>
                <span className="settings-muted">{new Date(Number(event.created_at)).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {confirmRotate ? (
        <ConfirmDialog
          title={info?.token ? '重新生成 MCP token' : '生成空间 MCP token'}
          message={info?.token ? '重新生成后，当前 token 会立即失效，需要重新复制并更新客户端配置。' : '这个 token 只允许访问当前空间，并会在 90 天后过期。'}
          confirmLabel={info?.token ? '重新生成' : '生成'}
          danger
          testId="settings-mcp-rotate-dialog"
          onCancel={() => setConfirmRotate(false)}
          onConfirm={() => void rotate()}
        />
      ) : null}
    </section>
  )
}

function SideAction({
  title,
  active,
  testId,
  onClick,
  icon,
  children,
  buttonRef,
}: {
  title: string
  active?: boolean
  testId: string
  onClick: () => void
  icon: ReactNode
  children?: ReactNode
  buttonRef?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`app-side-actions-item${active ? ' is-active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      data-dock-tip={title}
      data-dock-tip-at="e"
      data-testid={testId}
      onClick={onClick}
    >
      <span className="app-side-actions-icon" aria-hidden>
        {icon}
      </span>
      <span className="app-side-actions-label">{title}</span>
      {children}
    </button>
  )
}

type NoticeRow = {
  id: string
  title?: string
  body?: string
  kind?: string
  read?: boolean
  href?: string
}

function sessionIdFromPath(path: string) {
  const match = path.match(/^\/agents\/([^/]+)/)
  return match ? decodeURIComponent(match[1]!) : ''
}

function noticeHref(row: NoticeRow) {
  return String(row.href ?? '').trim()
}

function noticeIsForSession(row: NoticeRow, sessionId: string) {
  if (!sessionId) return false
  const href = noticeHref(row)
  return href === `/agents/${sessionId}` || href === `/agents/${encodeURIComponent(sessionId)}`
}

function NoticeBody({ body }: { body: string }) {
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean)
  return (
    <span className="shell-notify-body">
      {lines.map((line, index) => {
        const image = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)
        if (image) {
          return <img key={index} className="shell-notify-asset" src={image[2]} alt={image[1] || '附件'} />
        }
        const link = line.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
        if (link) {
          return (
            <span key={index} className="shell-notify-file">
              {link[1]}
            </span>
          )
        }
        return <span key={index}>{line}</span>
      })}
    </span>
  )
}

function noticeKindLabel(kind?: string) {
  if (kind === 'approval') return '审批'
  if (kind === 'task') return '任务'
  if (kind === 'session') return '代理'
  return ''
}

function NoticeBell({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [rows, setRows] = useState<NoticeRow[]>([])
  const looking = sessionIdFromPath(location.pathname)

  const load = useCallback(() => {
    void apiFetch('/api/db/list?path=/notices&sort=createdAt&dir=desc&limit=40&columns=title,body,kind,read,href,createdAt')
      .then((res) => res.json() as Promise<{ items?: Array<Record<string, unknown>> }>)
      .then((data) => {
        const items = Array.isArray(data.items) ? data.items : []
        setRows(
          items.flatMap((item) => {
            const id = noticeIdOf(item)
            if (!id) return []
            return [{
              id,
              title: String(item.title ?? ''),
              body: String(item.body ?? ''),
              kind: String(item.kind ?? ''),
              read: item.read === true,
              href: String(item.href ?? ''),
            }]
          }),
        )
      })
      .catch(() => setRows([]))
  }, [])

  const pulled = useRef(false)
  useEffect(() => {
    if (!open) return
    pulled.current = true
    load()
  }, [load, open])

  useEffect(() => {
    let timer = 0
    const onChange = (event: Event) => {
      if (!pulled.current) return
      if ((event as CustomEvent<{ views?: boolean }>).detail?.views) return
      window.clearTimeout(timer)
      timer = window.setTimeout(load, 8000)
    }
    window.addEventListener('fsdb:change', onChange)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('fsdb:change', onChange)
    }
  }, [load])

  const unread = rows.filter((row) => row.read !== true && !noticeIsForSession(row, looking))
  const inbox = rows.filter((row) => row.read !== true)
  const badge = unread.length > 99 ? '99+' : unread.length ? String(unread.length) : ''
  const triggerRef = useRef<HTMLButtonElement>(null)

  const clearAll = () => {
    setRows([])
    void apiFetch('/api/db/notices/clear', { method: 'POST' })
      .then(() => load())
      .catch(() => load())
  }

  const openRow = (row: NoticeRow) => {
    if (!row.id) return
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, read: true } : item)))
    const href = applyNoticeClick(row)
    void apiFetch('/api/db/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: `/notices/${row.id}`, content: { read: true } }),
    })
      .then(() => load())
      .catch(() => load())
    onOpenChange(false)
    if (!href) return
    navigate(href)
  }

  return (
    <div className="shell-side-pop-wrap">
      <SideAction
        title="通知"
        active={open}
        testId="chrome-notify"
        icon={<BellIcon {...chromeIcon} />}
        buttonRef={triggerRef}
        onClick={() => onOpenChange(!open)}
      >
        {badge ? (
          <span className="shell-notify-badge" data-testid="chrome-notify-badge">
            {badge}
          </span>
        ) : null}
      </SideAction>
      {open ? (
        <AnchorMenu
          anchor={triggerRef.current}
          onClose={() => onOpenChange(false)}
          placement="right"
          minWidth={320}
          zIndex={80}
          className="shell-side-pop shell-notify-pop"
          role="dialog"
          aria-label="通知"
          data-testid="chrome-notify-pop"
        >
          <div className="shell-notify-head">
            <span className="shell-notify-head-title">通知</span>
            <div className="shell-notify-head-actions">
              {inbox.length ? (
                <button
                  type="button"
                  className="shell-notify-clear"
                  data-testid="chrome-notify-clear"
                  title="全部已读并清空"
                  aria-label="全部已读并清空"
                  onClick={() => clearAll()}
                >
                  <CheckIcon className="size-3.5" aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                className="shell-notify-all"
                data-testid="chrome-notify-all"
                onClick={() => {
                  onOpenChange(false)
                  navigate('/database/notices')
                }}
              >
                查看全部
              </button>
            </div>
          </div>
          {inbox.length ? (
            <ul className="shell-notify-list">
              {inbox.map((row) => {
                const kind = noticeKindLabel(row.kind)
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={`shell-notify-item${row.read === true ? '' : ' is-unread'}`}
                      data-testid="chrome-notify-item"
                      onClick={() => openRow(row)}
                    >
                      {kind ? <span className="shell-notify-kind">{kind}</span> : null}
                      <span className="shell-notify-title">{row.title || '通知'}</span>
                      {row.body ? <NoticeBody body={row.body} /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="shell-chrome-pop-empty">暂无通知</p>
          )}
        </AnchorMenu>
      ) : null}
    </div>
  )
}

/** 公共入口：聊天与数据侧栏共用。 */
export function ShellSidePlaces({
  activeId,
  agentHref,
  onSettings,
  onSearch,
  searchOpen = false,
}: {
  activeId: string
  agentHref: string
  onSettings: () => void
  onSearch?: () => void
  searchOpen?: boolean
}) {
  const [notifyOpen, setNotifyOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="app-side-actions shell-side-places" role="navigation" aria-label="面板" data-testid="shell-side-places">
      <SideAction
        title="搜索"
        active={searchOpen}
        testId="chrome-search"
        icon={<MagnifyingGlassIcon {...chromeIcon} />}
        onClick={() => {
          setNotifyOpen(false)
          onSearch?.()
        }}
      />
      <NoticeBell
        open={notifyOpen}
        onOpenChange={setNotifyOpen}
      />
      <SideAction
        title="设置"
        testId="chrome-settings"
        icon={<Cog6ToothIcon {...chromeIcon} />}
        onClick={onSettings}
      />
      <SideAction
        title="会话"
        active={activeId === 'agent'}
        testId="chrome-chat-panel"
        icon={<ChatBubbleLeftRightIcon {...chromeIcon} />}
        onClick={() => navigate(agentHref)}
      />
      <SideAction
        title="数据"
        active={activeId === 'database'}
        testId="chrome-data-panel"
        icon={<CircleStackIcon {...chromeIcon} />}
        onClick={() => navigate('/database')}
      />
    </div>
  )
}

export function ShellSidebarAccount({
  narrow = false,
  onOpenAccount,
}: {
  narrow?: boolean
  onOpenAccount?: () => void
}) {
  const workspaceProfile = useWorkspaceProfile()
  const [account, setAccount] = useState<{ id: string; name: string; email: string; avatar: string } | null>(null)

  useEffect(() => {
    if (isLandingPreview()) return
    let cancelled = false
    const load = () => {
      const token = readAccountToken()
      if (!token) {
        if (!cancelled) setAccount(null)
        return
      }
      resetWorkspaceProfileHydrate()
      void hydrateWorkspaceProfile()
      void getAccountMe(token)
        .then((body) => {
          if (cancelled) return
          const id = String(body.id ?? '')
          const name = String(body.name ?? body.email ?? '')
          const email = String(body.email ?? '')
          const avatar = String(body.avatar ?? '')
          if (!id && !name && !email) {
            setAccount(null)
            return
          }
          setAccount({ id, name, email, avatar })
        })
        .catch(() => undefined)
    }
    load()
    const off = onAppEvent('biu:account-token', load)
    return () => {
      cancelled = true
      off()
    }
  }, [])

  if (!account) return null
  const displayName = workspaceProfile.name || workspaceProfile.fallbackName || account.name || account.email || '账户'
  const displayAvatar = workspaceProfile.hydrated ? workspaceProfile.avatar : (workspaceProfile.avatar || account.avatar)
  const displayEmail = workspaceProfile.email || account.email
  const displaySeed = workspaceProfile.accountId || account.id || displayName || 'biu-ai'
  const showEmail = Boolean(displayEmail && displayEmail !== displayName)

  return (
    <div className="shell-sidebar-account-wrap" data-biu-ignore>
      <button
        type="button"
        className="shell-sidebar-account"
        data-testid="shell-sidebar-account"
        data-dock-tip={narrow ? displayName : undefined}
        title={narrow ? undefined : (showEmail ? `${displayName} (${displayEmail})` : displayName)}
        aria-label={`个人账户：${displayName}`}
        onClick={onOpenAccount}
      >
        <span className="shell-sidebar-account-avatar" aria-hidden>
          {displayAvatar ? (
            <img src={displayAvatar} alt="" />
          ) : (
            <AiAvatar
              seed={displaySeed}
              className="shell-sidebar-account-ai-avatar"
            />
          )}
        </span>
        <span className="shell-sidebar-account-meta">
          <strong className="shell-sidebar-account-name">{displayName}</strong>
          {showEmail ? <small className="shell-sidebar-account-email">{displayEmail}</small> : null}
        </span>
      </button>
    </div>
  )
}
