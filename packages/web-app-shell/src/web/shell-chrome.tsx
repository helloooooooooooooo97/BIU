import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowDownTrayIcon,
  ArrowRightStartOnRectangleIcon,
  BellIcon,
  CursorArrowRaysIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleStackIcon,
  ClipboardDocumentIcon,
  CloudIcon,
  ComputerDesktopIcon,
  Cog6ToothIcon,
  CameraIcon,
  EyeIcon,
  EyeSlashIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { AnchorMenu } from '@biu/biu-ui/anchor-menu'
import { TagChip } from '@biu/biu-ui/tag-chip'
import { ConfirmDialog } from '@biu/biu-ui/confirm-dialog'
import { chromeIcon } from './chrome-icon.ts'
import { applyNoticeClick, noticeIdOf } from './notice-open.ts'
import { readMainDataRoute } from '@biu/core-file-system/main-data-route'
import { persistTheme, readTheme, type ThemeMode } from './theme.ts'
import { persistWorkspaceProfile } from '@biu/biu-ui/workspace-profile'
import { useWorkspaceProfile } from '@biu/biu-ui/use-workspace-profile'
import { LayoutPrefsMenu } from '@biu/core-file-system/layout-prefs-menu'
import { getPagePrefs, hydratePagePrefs, subscribePageWidth } from '@biu/core-file-system/page-width'

import { BrandPrint, useBrandConfig } from './marketing-site/brand-mark.tsx'

const MarketingSite = lazy(() => import('./marketing-site/index.tsx').then((m) => ({ default: m.MarketingSite })))
import { clearWorkspaceId, readWorkspaceId, writeWorkspaceId } from './tenant-fetch.ts'

function isLandingPreview() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('landingPreview') === '1'
}

if (typeof window !== 'undefined') {
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const preview = isLandingPreview()
    const token = preview ? '' : (localStorage.getItem('biu.account.token') ?? '')
    const workspaceId = preview ? '' : readWorkspaceId()
    if (!token && !workspaceId && !preview) return originalFetch(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`)
    if (workspaceId && !headers.has('x-biu-workspace-id')) headers.set('x-biu-workspace-id', workspaceId)
    return originalFetch(input, { ...init, credentials: preview ? 'omit' : init?.credentials, headers })
  }
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

function WorkspaceMemberProfile() {
  const profile = useWorkspaceProfile()
  const [name, setName] = useState(profile.name)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(profile.name)
  }, [profile.name])
  const initial = (profile.name.trim() || '用户').slice(0, 1)

  return (
    <section className="settings-account" data-testid="settings-account">
      <header className="settings-account-head">
        <h3 className="settings-account-title">我的成员资料</h3>
        <p className="settings-muted settings-account-lead">
          头像和空间昵称只用于当前空间，不会修改全局账号。
        </p>
      </header>
      <div className="settings-account-row">
        <div className="settings-account-copy">
          <p className="settings-account-label">照片</p>
          <p className="settings-muted settings-account-hint">点击更换。会出现在侧栏和分享页。</p>
        </div>
        <div className="settings-account-photo">
          <button
            type="button"
            className="settings-account-avatar"
            data-testid="settings-account-avatar"
            title="更换照片"
            aria-label="更换照片"
            onClick={() => fileRef.current?.click()}
          >
            {profile.avatar ? (
              <img src={profile.avatar} alt="" />
            ) : (
              <span className="settings-account-initial">{initial}</span>
            )}
            <span className="settings-account-avatar-veil" aria-hidden>
              <CameraIcon className="size-4" />
            </span>
          </button>
          {profile.avatar ? (
            <button
              type="button"
              className="settings-account-clear"
              data-testid="settings-account-clear-avatar"
              onClick={() => void persistWorkspaceProfile({ name: name.trim(), avatar: '' })}
            >
              移除
            </button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          data-testid="settings-account-avatar-file"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            void readAvatarFile(file).then((avatar) => {
              void persistWorkspaceProfile({ name: name.trim(), avatar })
            })
          }}
        />
      </div>
      <div className="settings-account-row">
        <div className="settings-account-copy">
          <label className="settings-account-label" htmlFor="settings-account-name">
            空间昵称
          </label>
          <p className="settings-muted settings-account-hint">只在当前工作区里使用，可以和别人重名。</p>
        </div>
        <input
          id="settings-account-name"
          className="settings-account-input"
          value={name}
          maxLength={40}
          placeholder="你的名字"
          data-testid="settings-account-name"
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            void persistWorkspaceProfile({ name: name.trim(), avatar: profile.avatar })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
      </div>
    </section>
  )
}

export function ShellSettingsAccount() {
  const [account, setAccount] = useState<{ name: string; email: string }>({ name: '', email: '' })
  const [cloud, setCloud] = useState<{
    available: boolean
    connected: boolean
    origin?: string
    account?: { id?: string; name?: string; email?: string }
    accounts: Array<{ id: string; name?: string; email?: string; origin?: string; active?: boolean }>
  }>({ available: false, connected: false, accounts: [] })
  const [cloudEmail, setCloudEmail] = useState('')
  const [cloudPassword, setCloudPassword] = useState('')
  const [cloudMessage, setCloudMessage] = useState('')
  const [sessions, setSessions] = useState<Array<Record<string, unknown>>>([])
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [message, setMessage] = useState('')
  const token = readAccountToken()
  const loadSessions = () =>
    accountFetch(token, '/api/account/agents')
      .then((body) => setSessions(((body.agents ?? body.sessions) as Array<Record<string, unknown>>) ?? []))
      .catch(() => setSessions([]))
  const loadCloud = () =>
    accountFetch(token, '/api/account/cloud')
      .then((body) =>
        setCloud({
          available: body.available === true,
          connected: body.connected === true,
          origin: typeof body.origin === 'string' ? body.origin : undefined,
          account:
            body.account && typeof body.account === 'object'
              ? (body.account as { id?: string; name?: string; email?: string })
              : undefined,
          accounts: Array.isArray(body.accounts)
            ? (body.accounts as Array<{ id: string; name?: string; email?: string; origin?: string; active?: boolean }>)
            : [],
        }),
      )
      .catch(() => setCloud({ available: false, connected: false, accounts: [] }))
  useEffect(() => {
    if (!token) return
    void getAccountMe(token)
      .then((body) => setAccount({ name: String(body.name ?? body.email ?? ''), email: String(body.email ?? '') }))
      .catch(() => setAccount({ name: '', email: '' }))
    void loadSessions()
    void loadCloud()
  }, [token])
  return (
    <section className="settings-account" data-testid="settings-account">
      <header className="settings-account-head">
        <h3 className="settings-account-title">账户</h3>
        <p className="settings-muted settings-account-lead">本地账号只管理这台设备的数据；云端账号是独立的可选连接。</p>
      </header>
      <div className="settings-account-row">
        <div className="settings-account-copy">
          <p className="settings-account-label">账号名</p>
          <p className="settings-muted settings-account-hint" data-testid="settings-account-global-name">
            {account.name || account.email || '未设置'}
          </p>
        </div>
      </div>
      <div className="settings-account-row">
        <div className="settings-account-copy">
          <p className="settings-account-label">云端账号</p>
          <p className="settings-muted settings-account-hint">可以关联多个云端账号，同一时间连接其中一个。断开后关联记录会保留。</p>
          {cloud.accounts.length ? (
            <div className="settings-cloud-accounts" data-testid="settings-cloud-accounts">
              {cloud.accounts.map((item) => (
                <div className="settings-member-row" key={`${item.origin ?? ''} ${item.id}`}>
                  <span className="settings-member-identity">
                    <strong>{item.email || item.name || '云端账号'}</strong>
                    <small>{item.active ? `已连接${item.origin ? ` · ${item.origin}` : ''}` : (item.origin || '未连接')}</small>
                  </span>
                  <span className="settings-member-controls">
                    {item.active ? (
                      <button
                        type="button"
                        className="settings-account-action"
                        onClick={() => {
                          setCloudMessage('')
                          void accountFetch(token, '/api/account/cloud', { method: 'DELETE' })
                            .then(() => {
                              setCloudMessage('已断开当前云端账号，关联记录还在。')
                              void loadCloud()
                              window.dispatchEvent(new Event(ACCOUNT_EVENT))
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
                              setCloudMessage('已切换云端账号。')
                              void loadCloud()
                              window.dispatchEvent(new Event(ACCOUNT_EVENT))
                            })
                            .catch((error) => setCloudMessage(error instanceof Error ? error.message : '连接失败'))
                        }}
                      >
                        连接
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {cloud.available ? (
            <div className="settings-cloud-connect">
              <form
                className="settings-cloud-login"
                onSubmit={(event) => {
                  event.preventDefault()
                  setCloudMessage('')
                  void accountFetch(token, '/api/account/cloud/login', {
                    method: 'POST',
                    body: JSON.stringify({ email: cloudEmail.trim(), password: cloudPassword }),
                  })
                    .then(() => {
                      setCloudPassword('')
                      setCloudMessage('云端账号已登录。')
                      void loadCloud()
                      window.dispatchEvent(new Event(ACCOUNT_EVENT))
                    })
                    .catch((error) => setCloudMessage(error instanceof Error ? error.message : '云端登录失败'))
                }}
              >
                <input
                  className="settings-account-input"
                  type="email"
                  placeholder="云端邮箱"
                  value={cloudEmail}
                  onChange={(event) => setCloudEmail(event.target.value)}
                />
                <input
                  className="settings-account-input"
                  type="password"
                  placeholder="云端密码"
                  value={cloudPassword}
                  onChange={(event) => setCloudPassword(event.target.value)}
                />
                <button className="settings-account-action" type="submit" disabled={!cloudEmail.trim() || !cloudPassword}>
                  登录并关联
                </button>
              </form>
              <div className="settings-cloud-sync">
                <p className="settings-muted settings-account-hint">
                  或使用本地邮箱 {account.email || '（未设置）'} 和当前登录密码创建并关联云端账号。创建后两边的密码分别修改。
                </p>
                <form
                  className="settings-cloud-login"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setCloudMessage('')
                    void accountFetch(token, '/api/account/cloud/sync-create', {
                      method: 'POST',
                      body: JSON.stringify({}),
                    })
                      .then(() => {
                        setCloudMessage('云端账号已创建并关联。')
                        void loadCloud()
                        window.dispatchEvent(new Event(ACCOUNT_EVENT))
                      })
                      .catch((error) => setCloudMessage(error instanceof Error ? error.message : '创建并关联失败'))
                  }}
                >
                  <button
                    className="settings-account-action"
                    type="submit"
                    data-testid="settings-cloud-sync-create"
                    disabled={!account.email}
                  >
                    创建并关联
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <p className="settings-muted settings-account-hint">当前没有配置中心服务，单机功能可以完整使用。</p>
          )}
          {cloudMessage ? <p className="settings-muted settings-account-hint">{cloudMessage}</p> : null}
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
      <form
        className="settings-account-row"
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
          <div className="settings-account-actions">
            <input className="settings-account-input" type="password" placeholder="当前密码" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
            <input className="settings-account-input" type="password" placeholder="新密码（至少 6 位）" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} />
            <button className="settings-account-action" type="submit">修改密码</button>
          </div>
          {message ? <p className="settings-muted settings-account-hint">{message}</p> : null}
        </div>
      </form>
      <div className="settings-account-row">
        <div className="settings-account-copy">
          <p className="settings-account-label">登录设备</p>
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
      </div>
    </section>
  )
}

const ACCOUNT_KEY = 'biu.account.token'
/** 校验失败后的重试间隔（ms）：退避三次，覆盖 dev server 重启的窗口。 */
const VERIFY_RETRY_DELAYS = [400, 1200, 3000] as const
const ACCOUNT_EVENT = 'biu:account-token'

function bridgeLegacyAccountCookie() {
  if (typeof localStorage === 'undefined' || typeof document === 'undefined') return
  const token = localStorage.getItem(ACCOUNT_KEY) ?? ''
  if (token) document.cookie = `biu_legacy_account=${encodeURIComponent(token)}; Path=/; SameSite=Strict`
}

bridgeLegacyAccountCookie()

export function readAccountToken() {
  if (typeof localStorage === 'undefined') return ''
  if (isLandingPreview()) return ''
  return localStorage.getItem(ACCOUNT_KEY) ?? ''
}

export function writeAccountToken(next: string) {
  if (!next && typeof window !== 'undefined') {
    void fetch('/api/account/logout', { method: 'POST' }).catch(() => undefined)
  }
  if (next) localStorage.setItem(ACCOUNT_KEY, next)
  else {
    localStorage.removeItem(ACCOUNT_KEY)
    clearWorkspaceId()
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCOUNT_EVENT))
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
  const [guestName, setGuestName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const workspaceInvite = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('workspaceInvite') ?? ''
  const guestInvite = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('guestInvite') ?? ''

  useEffect(() => {
    const sync = () => setToken(readAccountToken())
    window.addEventListener(ACCOUNT_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(ACCOUNT_EVENT, sync)
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
        .then(() => {
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
      <Suspense fallback={null}>
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
              body: JSON.stringify({ email: name.trim(), password }),
            })
              .then((body) => {
                clearWorkspaceId()
                writeAccountToken(String(body.token ?? ''))
                if (body.workspaceId) writeWorkspaceId(String(body.workspaceId))
                setPassword('')
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

type CollabWorkspace = { id: string; name: string; role: string; location?: 'device' | 'cloud' }
type CollabMember = { id: string; name: string; email?: string; role: string }
type CollabPresence = { accountId: string; name: string; collection: string; recordId: string }

function workspaceRoleLabel(role: string) {
  if (role === 'owner') return '所有者'
  if (role === 'admin') return '管理者'
  if (role === 'viewer') return '查看者'
  return '编辑者'
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
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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
const accountMeInflight = new Map<string, Promise<Record<string, unknown>>>()

/** One in-flight GET /api/account/me for AuthGate and the workspace switcher. */
export async function getAccountMe(token: string): Promise<Record<string, unknown>> {
  const pending = accountMeInflight.get(token)
  if (pending) return pending
  let request: Promise<Record<string, unknown>>
  request = accountFetch(token, '/api/account/me').then(
    (body) => {
      setTimeout(() => {
        if (accountMeInflight.get(token) === request) accountMeInflight.delete(token)
      }, ACCOUNT_ME_HOLD_MS)
      return body
    },
    (error) => {
      if (accountMeInflight.get(token) === request) accountMeInflight.delete(token)
      throw error
    },
  )
  accountMeInflight.set(token, request)
  return request
}

export function resetAccountMeGet() {
  accountMeInflight.clear()
}

export function ShellWorkspaceSwitcher({ onWorkspaceSettings }: { onWorkspaceSettings?: () => void }) {
  const [workspaces, setWorkspaces] = useState<CollabWorkspace[]>([])
  const [active, setActive] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [creatingLocation, setCreatingLocation] = useState<'device' | 'cloud' | null>(null)
  const [createError, setCreateError] = useState('')
  const [localAccount, setLocalAccount] = useState('')
  const [hostOnline, setHostOnline] = useState(false)
  const [cloudAccounts, setCloudAccounts] = useState<Array<{ id: string; email?: string; name?: string; origin?: string; active?: boolean }>>([])
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
          getAccountMe(token) as Promise<{ email?: string; name?: string; online?: boolean }>,
          accountFetch(token, '/api/account/cloud').catch(() => ({})) as Promise<{
            accounts?: Array<{ id: string; email?: string; name?: string; origin?: string; active?: boolean }>
          }>,
        ])
        if (cancelled) return
        setWorkspaces(listed.workspaces ?? [])
        const workspaceId = String(current.workspaceId ?? '')
        setActive(workspaceId)
        if (workspaceId) writeWorkspaceId(workspaceId)
        setLocalAccount(String(me.email || me.name || ''))
        setHostOnline(me.online === true)
        setCloudAccounts(Array.isArray(cloud.accounts) ? cloud.accounts : [])
      } catch {
        if (!cancelled) setWorkspaces([])
      }
    }
    void load()
    window.addEventListener(ACCOUNT_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(ACCOUNT_EVENT, load)
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
        {current.location === 'cloud'
          ? <CloudIcon aria-hidden className="shell-workspace-switch-icon" />
          : <ComputerDesktopIcon aria-hidden className="shell-workspace-switch-icon" />}
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
              const location = workspace.location ?? 'device'
              return (
                <button
                  key={workspace.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={workspace.id === active}
                  className={`shell-workspace-menu-item${workspace.id === active ? ' is-active' : ''}`}
                  onClick={() => switchTo(workspace.id)}
                >
                  {location === 'cloud'
                    ? <CloudIcon aria-hidden className="shell-workspace-menu-icon" />
                    : <ComputerDesktopIcon aria-hidden className="shell-workspace-menu-icon" />}
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
            {hostOnline ? null : (
              <div className="shell-workspace-menu-account" data-testid="shell-workspace-local-account">
                <ComputerDesktopIcon aria-hidden />
                <span className="shell-workspace-menu-copy">
                  <strong>{localAccount || '本机账号'}</strong>
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
            )}
            <div className="shell-workspace-menu-account" data-testid="shell-workspace-cloud-account">
              <CloudIcon aria-hidden />
              <span className="shell-workspace-menu-copy">
                <strong className={!hostOnline && !cloudAccounts.some((item) => item.active) ? 'is-empty' : ''}>
                  {hostOnline
                    ? (localAccount || '云端账号')
                    : (cloudAccounts.find((item) => item.active)?.email
                      || cloudAccounts.find((item) => item.active)?.name
                      || '暂时无账号')}
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
                      .then(() => window.dispatchEvent(new Event(ACCOUNT_EVENT)))
                      .catch(() => undefined)
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
                    window.dispatchEvent(new Event(ACCOUNT_EVENT))
                  })
                  .catch(() => undefined)
              }}
            >
              <CloudIcon aria-hidden className="shell-workspace-menu-icon" />
              <span className="shell-workspace-menu-copy">
                <strong>{item.email || item.name || '在线账号'}</strong>
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
  const [token, setToken] = useState(() => localStorage.getItem(ACCOUNT_KEY) ?? '')
  const [workspaces, setWorkspaces] = useState<CollabWorkspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [members, setMembers] = useState<CollabMember[]>([])
  const [inviteId, setInviteId] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'viewer'>('viewer')
  const [workspaceInviteUrl, setWorkspaceInviteUrl] = useState('')
  const [presence, setPresence] = useState<CollabPresence[]>([])
  const [pendingRemove, setPendingRemove] = useState<CollabMember | null>(null)
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
        remember('')
        setError(err instanceof Error ? err.message : '无法读取账号')
      }
    })()
    return () => {
      gone = true
    }
  }, [token])

  useEffect(() => {
    if (panel !== 'members' || !token || !workspaceId) return
    void loadWorkspace(token, workspaceId).catch((err) => {
      setError(err instanceof Error ? err.message : '无法读取工作区')
    })
  }, [panel, token, workspaceId, loadWorkspace])

  const currentWorkspace = workspaces.find((row) => row.id === workspaceId)
  const workspaceRole = currentWorkspace?.role
  const savedWorkspaceName = currentWorkspace?.name ?? ''
  const canManage = workspaceRole === 'owner' || workspaceRole === 'admin'
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
            : '管理当前空间的个人资料、成员和邀请。需要分类时，可贴标签并保存视图。'}
        </p>
      </header>
      {error ? <p className="settings-account-error" data-testid="settings-collab-error">{error}</p> : null}
      {panel === 'workspace' ? (
      <>
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
              window.dispatchEvent(new Event(ACCOUNT_EVENT))
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
              setDeleteName('')
              setError('')
              window.dispatchEvent(new Event(ACCOUNT_EVENT))
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
      <WorkspaceMemberProfile />
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
          <label className="settings-account-label" htmlFor="settings-collab-invite">空间成员</label>
          <p className="settings-muted settings-account-hint">
            所有者管理管理员；管理员可以邀请和移除普通成员。
          </p>
          <ul className="settings-account-people" data-testid="settings-collab-members">
            {members.length ? members.map((row) => (
              <li key={row.id} className="settings-member-row">
                <span className="settings-member-identity">
                  <strong title={row.name || row.email}>{row.name || row.email || '未命名成员'}</strong>
                  {row.email && row.email !== row.name ? <small title={row.email}>{row.email}</small> : null}
                </span>
                <span className="settings-member-controls">
                  {canChangeRoles && row.role !== 'owner' ? (
                  <select
                    className="settings-account-input settings-member-role"
                    aria-label={`修改 ${row.name || row.email} 的角色`}
                    value={row.role === 'admin' || row.role === 'viewer' ? row.role : 'member'}
                    onChange={(event) => {
                      const nextRole = event.target.value
                      void accountFetch(token, `/api/account/workspaces/${workspaceId}/members/${row.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ role: nextRole }),
                      })
                        .then((body) => {
                          setMembers(((body as { members?: CollabMember[] }).members) ?? [])
                          if (nextRole === 'owner') {
                            setWorkspaces((rows) => rows.map((workspace) =>
                              workspace.id === workspaceId ? { ...workspace, role: 'admin' } : workspace,
                            ))
                          }
                          setError('')
                        })
                        .catch((err) => setError(err instanceof Error ? err.message : '修改角色失败'))
                    }}
                  >
                    <option value="owner">所有者</option>
                    <option value="admin">管理者</option>
                    <option value="member">编辑者</option>
                    <option value="viewer">查看者（只读）</option>
                  </select>
                  ) : (
                    <span className="settings-member-role-label">
                      {row.role === 'owner' ? '所有者' : row.role === 'admin' ? '管理者' : row.role === 'viewer' ? '查看者' : '编辑者'}
                    </span>
                  )}
                  {canManage && row.role !== 'owner' && (workspaceRole === 'owner' || row.role === 'member' || row.role === 'viewer') ? (
                  <button
                    type="button"
                    className="settings-account-clear"
                    onClick={() => setPendingRemove(row)}
                  >
                    移除
                  </button>
                  ) : null}
                </span>
              </li>
            )) : <li className="settings-muted">当前空间还没有其他成员。</li>}
          </ul>
        </div>
        {canManage ? (
          <div className="settings-member-invite">
            <p className="settings-account-label">邀请成员</p>
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
            <p className="settings-account-label">邀请链接</p>
            <div className="settings-member-invite-row">
              <select
                className="settings-account-input"
                aria-label="邀请链接角色"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value === 'member' ? 'member' : 'viewer')}
              >
                <option value="viewer">查看者</option>
                <option value="member">编辑者</option>
              </select>
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
                      const url = new URL(String(body.path ?? '/'), window.location.origin).toString()
                      setWorkspaceInviteUrl(url)
                      await navigator.clipboard.writeText(url).catch(() => undefined)
                      setError('')
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : '生成邀请链接失败'))
                }}
              >
                生成链接
              </button>
            </div>
            {workspaceInviteUrl ? (
            <input
              className="settings-account-input settings-member-invite-url"
              aria-label="空间邀请链接"
              readOnly
              value={workspaceInviteUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
            ) : null}
          </div>
        ) : null}
      </form>
      <div className="settings-account-row">
        <div className="settings-account-copy">
          <p className="settings-account-label">正在看</p>
          <ul className="settings-account-people" data-testid="settings-collab-presence">
            {presence.length ? presence.map((row) => (
              <li key={row.accountId}>
                {row.name}
                {row.collection && row.recordId ? ` · ${row.collection}/${row.recordId}` : ''}
              </li>
            )) : <li className="settings-muted">打开工作区后，30 秒内有心跳的人会出现在这里。</li>}
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
  const [theme, setTheme] = useState(readTheme)
  const [pagePrefs, setPagePrefs] = useState(getPagePrefs)

  useEffect(() => subscribePageWidth(() => setPagePrefs(getPagePrefs())), [])
  useEffect(() => {
    void hydratePagePrefs().then(() => setPagePrefs(getPagePrefs()))
  }, [])

  const pick = (next: ThemeMode) => {
    persistTheme(next)
    setTheme(next)
  }

  return (
    <section data-testid="settings-appearance">
      <h3 className="settings-pane-title">外观</h3>
      <p className="settings-muted settings-pane-lead">色彩和布局。日间是浅色，夜间是深色；宽屏、目录和正文字号记在下面。</p>
      <div className="settings-theme-grid">
        <button
          type="button"
          className={`settings-theme-card${theme === 'light' ? ' is-on' : ''}`}
          data-theme-card="light"
          aria-pressed={theme === 'light'}
          data-testid="settings-theme-light"
          onClick={() => pick('light')}
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
          onClick={() => pick('dark')}
        >
          <span className="settings-theme-preview is-dark" aria-hidden />
          夜间模式
        </button>
      </div>
      <h4 className="settings-pane-subtitle">布局设计</h4>
      <p className="settings-muted settings-pane-lead">宽屏、悬浮目录和正文字号。重启后仍按上次选择。</p>
      <LayoutPrefsMenu prefs={pagePrefs} testPrefix="settings-layout" className="settings-page-prefs" />
    </section>
  )
}

export function ShellSettingsAbout() {
  return (
    <section data-testid="settings-about">
      <h3 className="settings-pane-title">关于</h3>
      <p className="settings-pane-title" style={{ fontSize: 14, fontWeight: 'var(--biu-font-weight-semibold)', margin: '18px 0 8px' }}>BIU</p>
      <p className="settings-muted m-0">Apache License 2.0。</p>
      <p className="settings-muted m-0" style={{ marginTop: 12 }}>
        public/grok-bot/ 角色素材归 xAI，不随 Apache-2.0 授权。详见 NOTICE.md。
      </p>
    </section>
  )
}

export function ShellSettingsShortcuts() {
  return (
    <section data-testid="settings-shortcuts">
      <h3 className="settings-pane-title">快捷键</h3>
      <p className="settings-muted settings-pane-lead">Windows 与 Linux 上 ⌘ 用 Ctrl。编辑器内 ⌘F 为正文查找，⌘⇧F 仍打开全局搜索。</p>
      <ul className="settings-shortcut-list">
        <li>
          <span>搜索</span>
          <span className="settings-kbd"><kbd>⌘</kbd><kbd>F</kbd> / <kbd>⌘</kbd><kbd>⇧</kbd><kbd>F</kbd></span>
        </li>
        <li>
          <span>快速选取</span>
          <span className="settings-kbd"><kbd>⌘</kbd><kbd>2</kbd></span>
        </li>
        <li>
          <span>选区送到对话</span>
          <span className="settings-kbd"><kbd>⌘</kbd><kbd>L</kbd></span>
        </li>
      </ul>
    </section>
  )
}

export function ShellSettingsUpdate() {
  const [behind, setBehind] = useState(0)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | undefined>()

  useEffect(() => {
    void fetch('/api/update')
      .then((res) => res.json() as Promise<{ behind?: number }>)
      .then((data) => setBehind(Math.max(0, Number(data.behind) || 0)))
      .catch(() => { })
  }, [])

  const download = useCallback(async () => {
    if (busy) return
    if (behind <= 0) {
      setHint('相对于主分支暂时无最新提交版本')
      return
    }
    setBusy(true)
    setHint(undefined)
    try {
      const res = await fetch('/api/update', { method: 'POST' })
      const data = (await res.json()) as { error?: string; restarting?: boolean }
      if (!res.ok) throw new Error(data.error || '更新失败')
      setBehind(0)
      setHint('正在重启…')
    } catch (error) {
      setBusy(false)
      setHint(String(error))
    }
  }, [busy, behind])

  const badge = behind > 99 ? '99+' : String(behind)

  return (
    <section className="shell-settings-update" data-testid="settings-update">
      <h3 className="settings-pane-title">更新</h3>
      <p className="settings-muted settings-pane-lead">
        {behind > 0 ? `当前落后主分支 ${badge} 个提交。` : '已与主分支对齐。'}
      </p>
      <button
        type="button"
        className="shell-settings-update-btn"
        data-testid="settings-update-download"
        disabled={busy}
        onClick={() => void download()}
      >
        <ArrowDownTrayIcon className="size-4" />
        {busy ? '更新中…' : '下载更新'}
      </button>
      {hint ? (
        <p className="settings-muted mt-3 mb-0" role="status">
          {hint}
        </p>
      ) : null}
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

const MCP_CLIENTS: Array<{ id: string; name: string; blurb: string }> = [
  { id: 'cursor', name: 'Cursor', blurb: '把工作区交给 Cursor Agent 当 MCP 工具。' },
  { id: 'claude', name: 'Claude', blurb: 'Claude Desktop / Claude.ai 连进这个工作区。' },
  { id: 'chatgpt', name: 'ChatGPT', blurb: 'Custom GPT 或 Connector 填同一套 URL + token。' },
  { id: 'codex', name: 'Codex', blurb: 'CLI 用 Streamable HTTP，请求头带 Bearer。' },
]

function mcpSnippet(info: McpHostInfo, id: string) {
  const headers = { Authorization: `Bearer ${info.token}` }
  if (id === 'chatgpt') return JSON.stringify({ url: info.url, headers }, null, 2)
  return JSON.stringify({ mcpServers: { biu: { url: info.url, headers } } }, null, 2)
}

export function ShellSettingsMcp({ onLeave }: { onLeave?: () => void }) {
  const navigate = useNavigate()
  const [info, setInfo] = useState<McpHostInfo | null>(null)
  const [error, setError] = useState('')
  const [reveal, setReveal] = useState(false)
  const [copied, setCopied] = useState('')
  const [rotating, setRotating] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [allowedTools, setAllowedTools] = useState<string[]>(['db_list', 'db_read', 'db_stat', 'db_content'])
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
    void fetch('/api/mcp/info')
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
          const available = new Set(data.tools ?? [])
          setAllowedTools((current) => current.filter((tool) => available.has(tool)))
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
          await accountFetch(token, `/api/account/mcp/credentials/${encodeURIComponent(info.credentialId)}`, { method: 'DELETE' })
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
      const res = await fetch('/api/mcp/rotate', {
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
    <section className="settings-mcp" data-testid="settings-mcp">
      <h3 className="settings-pane-title">Biu MCP</h3>
      <p className="settings-muted settings-pane-lead">
        MCP 听在分享口（默认 0.0.0.0），局域网其它电脑用下面的地址 + token 即可调用。工作台本身仍只在本机。
      </p>
      {error ? (
        <p className="settings-muted settings-mcp-error" role="alert">
          {error}
        </p>
      ) : null}
      <h4 className="settings-pane-subtitle">连接</h4>
      <div className="settings-mcp-fields">
        <label className="settings-mcp-field">
          <span>局域网地址</span>
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
          <button
            type="button"
            className="settings-mcp-link"
            data-testid="settings-mcp-open-table"
            onClick={() => {
              onLeave?.()
              navigate('/mcp')
            }}
          >
            挂外部 MCP 服务器
          </button>
        </div>
      </div>
      <h4 className="settings-pane-subtitle">客户端</h4>
      <p className="settings-muted settings-pane-lead">复制配置后贴进对应产品。没有各家 OAuth 向导，接入就是带 Bearer 的同一条地址。</p>
      <div className="settings-mcp-grid">
        {MCP_CLIENTS.map((client) => (
          <article key={client.id} className="settings-mcp-card" data-testid={`settings-mcp-client-${client.id}`}>
            <span className="settings-mcp-mark" aria-hidden>
              {client.name.slice(0, 1)}
            </span>
            <div className="settings-mcp-card-copy">
              <strong>{client.name}</strong>
              <p>{client.blurb}</p>
            </div>
            <button
              type="button"
              className="settings-mcp-enable"
              disabled={!info?.token}
              data-testid={`settings-mcp-copy-${client.id}`}
              onClick={() => info && void copy(client.id, mcpSnippet(info, client.id))}
            >
              {copied === client.id ? '已复制' : '复制配置'}
            </button>
          </article>
        ))}
      </div>
      {info?.online ? (
        <>
          <h4 className="settings-pane-subtitle">允许的工具</h4>
          <div className="settings-mcp-grid" data-testid="settings-mcp-allowed-tools">
            {(info.tools ?? []).map((tool) => (
              <label key={tool} className="settings-mcp-card">
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
                      void accountFetch(readAccountToken(), `/api/account/mcp/credentials/${encodeURIComponent(String(credential.id))}`, { method: 'DELETE' })
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
    void fetch('/api/db/list?path=/notices&sort=createdAt&dir=desc&limit=40&columns=title,body,kind,read,href,createdAt')
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
    void fetch('/api/db/notices/clear', { method: 'POST' })
      .then(() => load())
      .catch(() => load())
  }

  const openRow = (row: NoticeRow) => {
    if (!row.id) return
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, read: true } : item)))
    const href = applyNoticeClick(row)
    void fetch('/api/db/update', {
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
  const navigate = useNavigate()
  const [notifyOpen, setNotifyOpen] = useState(false)

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
        title="代理"
        active={activeId === 'agent'}
        testId="chrome-chat-panel"
        icon={<CursorArrowRaysIcon {...chromeIcon} />}
        onClick={() => {
          navigate(agentHref)
        }}
      />
      <SideAction
        title="数据"
        active={activeId === 'database'}
        testId="chrome-data-panel"
        icon={<CircleStackIcon {...chromeIcon} />}
        onClick={() => {
          navigate(readMainDataRoute() || '/database')
        }}
      />
    </div>
  )
}
