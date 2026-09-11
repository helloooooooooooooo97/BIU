import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowDownTrayIcon,
  BellIcon,
  ChatBubbleLeftRightIcon,
  CircleStackIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/16/solid'
import { setChatOverlay } from './chat-overlay.ts'
import { chromeIcon } from './chrome-icon.ts'
import { readMainDataRoute } from '@biu/core-file-system/main-data-route'

export function ShellSettingsShortcuts() {
  return (
    <section data-testid="settings-shortcuts">
      <ul className="m-0 list-none p-0">
        <li className="flex items-center justify-between gap-3 px-2 py-1.5">
          <span>搜索</span>
          <span className="settings-muted">⌘F</span>
        </li>
        <li className="flex items-center justify-between gap-3 px-2 py-1.5">
          <span>快速选取</span>
          <span className="settings-muted">Ctrl+Q</span>
        </li>
        <li className="flex items-center justify-between gap-3 px-2 py-1.5">
          <span>选区送到对话</span>
          <span className="settings-muted">⌘L</span>
        </li>
      </ul>
      <p className="settings-muted m-0 px-2 pt-1">Windows 与 Linux 上 ⌘ 用 Ctrl。选取也可用 ⌘Q。编辑器内 ⌘F 为正文查找，⌘L 也可从选区气泡进入。</p>
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
      <p className="settings-muted mb-3">
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

function SideAction({
  title,
  active,
  testId,
  onClick,
  icon,
  children,
}: {
  title: string
  active?: boolean
  testId: string
  onClick: () => void
  icon: ReactNode
  children?: ReactNode
}) {
  return (
    <button
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
  const match = path.match(/^\/s\/([^/]+)/)
  return match ? decodeURIComponent(match[1]!) : ''
}

function noticeHref(row: NoticeRow) {
  return String(row.href ?? '').trim()
}

function noticeIsForSession(row: NoticeRow, sessionId: string) {
  if (!sessionId) return false
  const href = noticeHref(row)
  return href === `/s/${sessionId}` || href === `/s/${encodeURIComponent(sessionId)}`
}

function NoticeBell({
  open,
  onToggle,
}: {
  open: boolean
  onToggle: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [rows, setRows] = useState<NoticeRow[]>([])
  const looking = sessionIdFromPath(location.pathname)

  const load = useCallback(() => {
    void fetch('/api/db/list?path=/notices&sort=createdAt&dir=desc&limit=40')
      .then((res) => res.json() as Promise<{ items?: NoticeRow[] }>)
      .then((data) => setRows(Array.isArray(data.items) ? data.items : []))
      .catch(() => setRows([]))
  }, [])

  useEffect(() => {
    load()
    const onChange = () => load()
    window.addEventListener('fsdb:change', onChange)
    return () => window.removeEventListener('fsdb:change', onChange)
  }, [load])

  const unread = rows.filter((row) => row.read !== true && !noticeIsForSession(row, looking))
  const badge = unread.length > 99 ? '99+' : unread.length ? String(unread.length) : ''

  return (
    <div className="shell-side-pop-wrap">
      <SideAction
        title="通知"
        active={open}
        testId="chrome-notify"
        icon={<BellIcon {...chromeIcon} />}
        onClick={onToggle}
      >
        {badge ? (
          <span className="shell-notify-badge" data-testid="chrome-notify-badge">
            {badge}
          </span>
        ) : null}
      </SideAction>
      {open ? (
        <div className="shell-side-pop shell-notify-pop" role="dialog" aria-label="通知" data-testid="chrome-notify-pop">
          {rows.length ? (
            <ul className="shell-notify-list">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`shell-notify-item${row.read === true ? '' : ' is-unread'}`}
                    data-testid="chrome-notify-item"
                    onClick={() => {
                      const href = noticeHref(row)
                      void fetch('/api/db/update', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ path: `/notices/${row.id}`, content: { read: true } }),
                      }).then(() => load())
                      if (href) navigate(href)
                    }}
                  >
                    <span className="shell-notify-title">{row.title || '通知'}</span>
                    {row.body ? <span className="shell-notify-body">{row.body}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="shell-chrome-pop-empty">暂无通知</p>
          )}
        </div>
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
        onToggle={() => {
          setNotifyOpen((open) => !open)
        }}
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
        onClick={() => {
          setChatOverlay(false)
          navigate(agentHref)
        }}
      />
      <SideAction
        title="数据"
        active={activeId === 'database'}
        testId="chrome-data-panel"
        icon={<CircleStackIcon {...chromeIcon} />}
        onClick={() => {
          setChatOverlay(false)
          navigate(readMainDataRoute() || '/database')
        }}
      />
    </div>
  )
}
