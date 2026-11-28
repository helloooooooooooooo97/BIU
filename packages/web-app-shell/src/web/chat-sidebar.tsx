import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  SidebarMascot,
  isMascotDancing,
  resolveSessionMascot,
  subscribeMascotDance,
} from '@biu/public-mascot'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { apiFetch } from '@biu/biu-ui/api-client'
import { onAppEvents } from '@biu/biu-ui/app-events'
import { ChatCount } from '@biu/biu-ui/chat-count'
import { SidebarFold } from '@biu/biu-ui/sidebar-fold'
import {
  SidebarFilterMenu,
  TIME_BUCKET_ORDER,
  timeBucketForTimestamp,
  useSidebarViewPrefs,
} from '@biu/biu-ui/sidebar-filter-menu'
import { useActiveWorkspaceLocation } from './shell-chrome.tsx'
import {
  bindSessionView,
  buildSidebarSections,
  folderNameFromPath,
  sessionActivityAt,
  sessionAppPath,
  useSidebarCollapseStore,
  type SessionListItem,
  type SessionViewService,
  type SessionSidebarGroup,
  type SidebarSection,
  type SidebarSectionKind,
} from '@biu/web-session-view'
import { FolderGlyph } from '@biu/web-session-view/folder-glyph'
import { SIDEBAR_ROW_MAIN_CLASS, SidebarRow, SidebarRowMain } from '@biu/web-session-view/sidebar-row'
import { chromeIcon, chromeIconClass } from './chrome-icon.ts'
import { isChatPagePath, openOverlayComposer } from './chat-overlay.ts'
import {
  ChevronRightIcon,
  ClockIcon,
  FolderMinusIcon,
  MapIcon,
  PlusIcon,
  SignalIcon,
  StarIcon,
} from '@heroicons/react/16/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
/** 与 web/sidebar.css 中 --biu-sidebar-row-height (32px) + margin-bottom (1px) 对齐 */
const SESSION_ROW_PX = 33
const SESSION_RAIL_ROW_PX = 36
const SESSION_WINDOW_OVERSCAN = 4

const sessionRowMainClass = SIDEBAR_ROW_MAIN_CLASS

/** 弹层里的会话行改成按钮（点了要关弹层），页面里的行仍是真链接。 */
const sessionRowMainProps = {
  draggable: false,
  onDragStart: (event: DragEvent<HTMLElement>) => event.preventDefault(),
  className: sessionRowMainClass,
  'data-dock-tip-at': 'e',
} as const

export function resolveSidebarGroupProjectPath(
  group: Pick<SessionSidebarGroup, 'kind' | 'label' | 'path'>,
  isCloudSpace: boolean,
): string | undefined {
  if (group.kind === 'ungrouped') return undefined
  const raw = group.path?.trim()
  if (!raw) return undefined
  if (!isCloudSpace) return raw
  if (raw === '/workspace' || raw.startsWith('/workspace/')) return raw
  // 云端空间里若历史分组还带着宿主机路径（如 /Users/.../hello），自动落到个人隔离目录 /workspace/<folder>
  const name = (group.label || folderNameFromPath(raw))
    .trim()
    .replace(/[/\\:\0\x00-\x1f]/g, '')
    .replace(/^\.+/, '')
    .slice(0, 100)
  return name ? `/workspace/${name}` : '/workspace'
}

type ChatMemberInfo = { id: string; name: string; avatar?: string }

function useCloudSessionCreators(isCloud: boolean) {
  const [myAccountId, setMyAccountId] = useState('')
  const [membersById, setMembersById] = useState<Map<string, ChatMemberInfo>>(() => new Map())

  useEffect(() => {
    if (!isCloud) {
      setMyAccountId('')
      setMembersById(new Map())
      return
    }
    let cancelled = false
    const load = () => {
      const params = new URLSearchParams({
        path: '/workspace-members',
        limit: '500',
        columns: 'title,email,avatar',
      })
      void Promise.all([
        apiFetch('/api/account/workspace-profile').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        apiFetch('/api/account/me').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        apiFetch(`/api/db/list?${params.toString()}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]).then(([wp, me, listed]) => {
        if (cancelled) return
        setMyAccountId(String((wp as { accountId?: string } | null)?.accountId ?? (me as { id?: string } | null)?.id ?? '').trim())
        const map = new Map<string, ChatMemberInfo>()
        const rows = Array.isArray((listed as { items?: unknown[] } | null)?.items)
          ? ((listed as { items: Array<Record<string, unknown>> }).items)
          : []
        for (const item of rows) {
          const id = String(item?.id ?? '').trim()
          if (!id) continue
          const name =
            String(item.title ?? '').trim() ||
            String(item.name ?? '').trim() ||
            String(item.email ?? '').trim() ||
            id.slice(0, 8)
          const avatar = typeof item.avatar === 'string' ? item.avatar.trim() : ''
          map.set(id, { id, name, ...(avatar ? { avatar } : {}) })
        }
        setMembersById(map)
      })
    }
    load()
    const off = onAppEvents(['biu:account-token', 'biu:workspace-profile'], load)
    return () => {
      cancelled = true
      off()
    }
  }, [isCloud])

  return { myAccountId, membersById }
}

function formatSessionTime(ts?: number, now = Date.now()): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return ''
  const d = new Date(ts)
  const cur = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  if (
    d.getFullYear() === cur.getFullYear() &&
    d.getMonth() === cur.getMonth() &&
    d.getDate() === cur.getDate()
  ) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const yest = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - 1)
  if (
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  ) {
    return '昨天'
  }
  if (d.getFullYear() === cur.getFullYear()) return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

type AgentSubView = '' | 'trajectory' | 'usage'

const SESSION_SUB_ROWS_PX = SESSION_ROW_PX * 2 + 2

const SessionRow = memo(function SessionRow({
  item,
  active,
  activeView = '',
  expanded = false,
  canExpand = false,
  busy,
  dancing,
  creator,
  showTime = true,
  onToggleExpand,
  onDelete,
  onPin,
  onOpen,
}: {
  item: SessionListItem
  active: boolean
  activeView?: AgentSubView
  expanded?: boolean
  canExpand?: boolean
  busy: boolean
  dancing: boolean
  creator?: ChatMemberInfo | null
  showTime?: boolean
  onToggleExpand?: (id: string) => void
  onDelete: (item: SessionListItem) => void
  onPin: (item: SessionListItem) => void
  onOpen?: (item: SessionListItem) => void
}) {
  const pinned = Boolean(item.pinned)
  const timeLabel = showTime ? formatSessionTime(item.updatedAt) : ''
  const label = (
    <span className="sidebar-label min-w-0 flex-1 truncate font-medium">{item.title}</span>
  )
  const timeNode = timeLabel ? (
    <span
      className="shrink-0 text-[11px] leading-none text-(--biu-color-text-subtle) tabular-nums"
      data-testid="sidebar-session-time"
    >
      {timeLabel}
    </span>
  ) : null
  const main = onOpen ? (
    <button type="button" {...sessionRowMainProps} data-dock-tip={item.title} onClick={() => onOpen(item)}>
      <SessionRowMascot item={item} busy={busy} dancing={dancing} />
      {label}
      {timeNode}
    </button>
  ) : canExpand && onToggleExpand ? (
    <SidebarRowMain>
      <button
        type="button"
        className="group/fold relative grid size-6 shrink-0 cursor-pointer place-items-center border-0 bg-transparent p-0 text-inherit"
        title={expanded ? `收起 ${item.title} 的轨迹与用量` : `展开 ${item.title} 的轨迹与用量`}
        aria-label={expanded ? `收起 ${item.title} 的轨迹与用量` : `展开 ${item.title} 的轨迹与用量`}
        aria-expanded={expanded}
        data-testid={`sidebar-session-fold-${item.id}`}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onToggleExpand(item.id)
        }}
      >
        <span className="sidebar-rail-icon sidebar-group-fold">
          <span className="sidebar-group-fold-face relative group-hover:hidden! group-hover/fold:hidden!">
            <SessionRowMascot item={item} busy={busy} dancing={dancing} />
          </span>
          <span className="sidebar-group-fold-chevron group-hover:grid! group-hover/fold:grid!">
            <ChevronRightIcon
              className={`size-4 shrink-0 opacity-80 sidebar-chevron${expanded ? ' is-open' : ''}`}
            />
          </span>
        </span>
      </button>
      <Link
        to={sessionAppPath(item.id)}
        draggable={false}
        onDragStart={(event: DragEvent<HTMLElement>) => event.preventDefault()}
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-inherit no-underline"
        data-dock-tip={item.title}
        data-dock-tip-at="e"
      >
        {label}
        {timeNode}
      </Link>
    </SidebarRowMain>
  ) : (
    <Link to={sessionAppPath(item.id)} {...sessionRowMainProps} data-dock-tip={item.title}>
      <SessionRowMascot item={item} busy={busy} dancing={dancing} />
      {label}
      {timeNode}
    </Link>
  )
  const creatorTrail = creator ? (
    <span
      className="sidebar-creator-avatar"
      data-testid="sidebar-session-creator-avatar"
      title={`创建人：${creator.name}`}
      aria-label={`创建人：${creator.name}`}
    >
      {creator.avatar ? <img src={creator.avatar} alt="" /> : <AiAvatar seed={creator.id} size={16} />}
    </span>
  ) : null
  const rowActive = active && !activeView
  return (
    <div className="min-w-0">
      <SidebarRow
        active={rowActive}
        pinned={pinned}
        main={main}
        trail={creatorTrail}
        onDelete={() => onDelete(item)}
        deleteLabel={`Delete session ${item.title}`}
        deleteIcon={<TrashGlyph {...chromeIcon} />}
        onStar={() => onPin(item)}
        starOn={pinned}
        starLabel={pinned ? `取消收藏 ${item.title}` : `收藏 ${item.title}`}
        starIcon={<StarIcon {...chromeIcon} />}
        attrs={{
          'data-biu-kind': 'session',
          'data-biu-id': item.id,
          'data-biu-label': item.title,
          'data-dock-tip': item.title,
          'data-dock-tip-at': 'e',
        }}
      />
      {canExpand && expanded ? (
        <SidebarFold open animate={false} className="sidebar-session-list min-w-0">
          <div className="flex min-w-0 flex-col" data-testid={`sidebar-session-subviews-${item.id}`}>
            <SidebarRow
              active={active && activeView === 'trajectory'}
              attrs={{
                'data-biu-kind': 'trajectory',
                'data-biu-id': item.id,
                'data-biu-label': `${item.title} · 轨迹`,
              }}
              main={
                <Link
                  to={`${sessionAppPath(item.id)}?view=trajectory`}
                  data-testid={`sidebar-session-trajectory-${item.id}`}
                  className={SIDEBAR_ROW_MAIN_CLASS}
                  title={`查看 ${item.title} 的运行轨迹`}
                >
                  <span className="grid size-6 shrink-0 place-items-center" aria-hidden>
                    <span className="sidebar-rail-icon">
                      <MapIcon className="size-3.5 opacity-75" />
                    </span>
                  </span>
                  <span className="sidebar-label min-w-0 flex-1 truncate text-[13px]">轨迹</span>
                </Link>
              }
            />
            <SidebarRow
              active={active && activeView === 'usage'}
              attrs={{
                'data-biu-kind': 'usage',
                'data-biu-id': item.id,
                'data-biu-label': `${item.title} · 用量`,
              }}
              main={
                <Link
                  to={`${sessionAppPath(item.id)}?view=usage`}
                  data-testid={`sidebar-session-usage-${item.id}`}
                  className={SIDEBAR_ROW_MAIN_CLASS}
                  title={`查看 ${item.title} 的 Token 用量`}
                >
                  <span className="grid size-6 shrink-0 place-items-center" aria-hidden>
                    <span className="sidebar-rail-icon">
                      <SignalIcon className="size-3.5 opacity-75" />
                    </span>
                  </span>
                  <span className="sidebar-label min-w-0 flex-1 truncate text-[13px]">用量</span>
                </Link>
              }
            />
          </div>
        </SidebarFold>
      ) : null}
    </div>
  )
})

const SessionRowMascot = memo(function SessionRowMascot({
  item,
  busy,
  dancing,
}: {
  item: SessionListItem
  busy: boolean
  dancing: boolean
}) {
  return (
    <SidebarMascot
      size={20}
      sessionId={item.id}
      identity={resolveSessionMascot(item.id, item.mascot)}
      busy={busy}
      animate={false}
      dancing={dancing}
      title={item.title}
    />
  )
})

const WindowedSessionList = memo(function WindowedSessionList({
  sessions,
  rowKey,
  highlightId,
  activeView = '',
  expandedSessions,
  onToggleExpand,
  busySessions,
  dancing,
  creatorOf,
  showTime = true,
  onDelete,
  onPin,
  onOpen,
  iconRail,
}: {
  sessions: SessionListItem[]
  rowKey: string
  highlightId: string | null
  activeView?: AgentSubView
  expandedSessions?: Record<string, boolean>
  onToggleExpand?: (id: string) => void
  busySessions: Record<string, true>
  dancing: boolean
  creatorOf?: (item: SessionListItem) => ChatMemberInfo | null
  showTime?: boolean
  onDelete: (item: SessionListItem) => void
  onPin: (item: SessionListItem) => void
  onOpen?: (item: SessionListItem) => void
  iconRail?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)
  const bindHost = useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node
    setScrollEl(node?.closest('[data-chat-scroll]') as HTMLElement | null)
  }, [])
  const canExpand = !iconRail && !onOpen && Boolean(onToggleExpand)
  const isRowExpanded = useCallback(
    (id: string) => {
      if (!canExpand) return false
      const explicit = expandedSessions?.[id]
      if (explicit !== undefined) return explicit
      return Boolean(id === highlightId && activeView)
    },
    [activeView, canExpand, expandedSessions, highlightId],
  )
  const count = sessions.length
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollEl,
    estimateSize: (index) => {
      if (iconRail) return SESSION_RAIL_ROW_PX
      const item = sessions[index]
      if (item && isRowExpanded(item.id)) return SESSION_ROW_PX + SESSION_SUB_ROWS_PX
      return SESSION_ROW_PX
    },
    overscan: SESSION_WINDOW_OVERSCAN,
    scrollMargin: hostRef.current?.offsetTop ?? 0,
  })
  useLayoutEffect(() => {
    virtualizer.measure()
  }, [virtualizer, expandedSessions, highlightId, activeView, iconRail])
  const items = virtualizer.getVirtualItems()
  const start = items[0]?.index ?? 0
  const end = items.length ? (items[items.length - 1]?.index ?? 0) + 1 : 0

  return (
    <div
      ref={bindHost}
      className="sidebar-session-window"
      data-session-window=""
      data-session-window-start={start}
      data-session-window-end={end}
      data-session-window-count={count}
      style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
    >
      {items.map((row) => {
        const item = sessions[row.index]
        if (!item) return null
        const expanded = isRowExpanded(item.id)
        return (
          <div
            key={`${rowKey}:${item.id}`}
            data-index={row.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            <SessionRow
              item={item}
              active={item.id === highlightId}
              activeView={item.id === highlightId ? activeView : ''}
              expanded={expanded}
              canExpand={canExpand}
              busy={Boolean(busySessions[item.id])}
              dancing={dancing}
              creator={creatorOf?.(item) ?? null}
              showTime={showTime}
              onToggleExpand={onToggleExpand}
              onDelete={onDelete}
              onPin={onPin}
              onOpen={onOpen}
            />
          </div>
        )
      })}
    </div>
  )
})

export type ChatSidebarProps = {
  routeSessionId: string | null
  routeChannelId?: string | null
  useSessionView: ReturnType<typeof bindSessionView>
  sessionView: SessionViewService
  /** 弹层（小人菜单）里使用时：会话行变成按钮并关闭弹层，不再做页面跳转。 */
  popoverClose?: () => void
  iconRail?: boolean
  /** 置于「代理」上方的 Slack 风格群聊与成员私聊分区（由 core-chat 槽位注入）。 */
  channelsHeader?: ReactNode
  /** 置于「项目」下方的文档树形分区（由 core-file-system 槽位注入）。 */
  docsFooter?: ReactNode
}

/**
 * 独立订阅折叠态与 sessions：组展开/收缩只重渲侧栏，不拖垮 Shell 里的 Chat Markdown 主区。
 * 外框（品牌头、收起/展开、拖宽）由 Shell 的 ShellSidebarFrame 提供，这里只画列表本体。
 */
export const ChatSidebar = memo(function ChatSidebar({
  routeSessionId,
  routeChannelId,
  useSessionView,
  sessionView,
  popoverClose,
  iconRail = false,
  channelsHeader,
  docsFooter,
}: ChatSidebarProps) {
  const navigate = useNavigate()
  const sessions = useSessionView((state) => state.sessions)
  const sessionId = useSessionView((state) => state.sessionId)
  // 用签名订阅，避免 busySessions 对象引用抖动导致整栏重渲
  const busySignature = useSessionView((state) =>
    Object.keys(state.busySessions)
      .sort()
      .join(','),
  )
  const busySessions = useMemo(() => {
    const map: Record<string, true> = {}
    if (!busySignature) return map
    for (const id of busySignature.split(',')) {
      if (id) map[id] = true
    }
    return map
  }, [busySignature])
  const collapsedProjects = useSidebarCollapseStore((state) => state.collapsed)
  const toggleProjectGroup = useSidebarCollapseStore((state) => state.toggle)
  const expandProjectGroup = useSidebarCollapseStore((state) => state.expand)
  const [agentPrefs, patchAgentPrefs, resetAgentPrefs] = useSidebarViewPrefs('biu.sidebar.agents.view', {
    groupBy: 'project',
    orderBy: 'updated',
    status: 'all',
    starred: 'all',
    showTime: true,
  })
  const filteredSessions = useMemo(() => {
    const filtered = sessions.filter((item) => {
      if (agentPrefs.status === 'busy' && !busySessions[item.id]) return false
      if (agentPrefs.status === 'idle' && busySessions[item.id]) return false
      if (agentPrefs.starred === 'starred' && !item.pinned) return false
      return true
    })
    if (agentPrefs.orderBy === 'name') {
      return [...filtered].sort(
        (a, b) => a.title.localeCompare(b.title, 'zh-CN') || sessionActivityAt(b) - sessionActivityAt(a),
      )
    }
    return filtered
  }, [agentPrefs.orderBy, agentPrefs.starred, agentPrefs.status, busySessions, sessions])
  const sections = useMemo(() => {
    const base = buildSidebarSections(filteredSessions)
    const sortRows = (rows: SessionListItem[]) =>
      agentPrefs.orderBy === 'name'
        ? [...rows].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN') || a.id.localeCompare(b.id))
        : rows
    if (agentPrefs.groupBy === 'project') {
      if (agentPrefs.orderBy === 'name') {
        return base.map((sec) => ({
          ...sec,
          ...(sec.sessions ? { sessions: sortRows(sec.sessions) } : {}),
          ...(sec.groups
            ? { groups: sec.groups.map((g) => ({ ...g, sessions: sortRows(g.sessions) })) }
            : {}),
        }))
      }
      return base
    }
    const out: SidebarSection[] = []
    const pinnedSec = base.find((sec) => sec.kind === 'pinned')
    if (pinnedSec) {
      out.push({ ...pinnedSec, sessions: sortRows(pinnedSec.sessions ?? []) })
    }
    if (agentPrefs.groupBy === 'none') {
      out.push({ kind: 'project', label: '代理', sessions: sortRows(filteredSessions) })
      return out
    }
    // groupBy === 'updated'
    const now = Date.now()
    const bucketMap = new Map<string, SessionListItem[]>()
    for (const item of filteredSessions) {
      const bucket = timeBucketForTimestamp(sessionActivityAt(item), now)
      const list = bucketMap.get(bucket) ?? []
      list.push(item)
      bucketMap.set(bucket, list)
    }
    const groups: SessionSidebarGroup[] = TIME_BUCKET_ORDER.flatMap(({ key, label }) => {
      const rows = bucketMap.get(key)
      if (!rows?.length) return []
      const sorted = sortRows(rows)
      return [
        {
          key: `time:${key}`,
          label,
          sessions: sorted,
          updatedAt: sorted.reduce((max, item) => Math.max(max, sessionActivityAt(item)), 0),
          kind: 'ungrouped' as const,
        },
      ]
    })
    out.push({ kind: 'project', label: '代理', groups })
    return out
  }, [agentPrefs.groupBy, agentPrefs.orderBy, filteredSessions])
  const railSessions = useMemo(() => {
    if (!iconRail) return []
    const seen = new Set<string>()
    const flat: SessionListItem[] = []
    for (const section of sections) {
      if (section.sessions) {
        for (const item of section.sessions) {
          if (seen.has(item.id)) continue
          seen.add(item.id)
          flat.push(item)
        }
      }
      if (section.groups) {
        for (const group of section.groups) {
          for (const item of group.sessions) {
            if (seen.has(item.id)) continue
            seen.add(item.id)
            flat.push(item)
          }
        }
      }
    }
    return flat
  }, [iconRail, sections])
  const toggleSection = useCallback((kind: SidebarSectionKind) => {
    toggleProjectGroup(`chat.section.${kind}`)
  }, [toggleProjectGroup])
  const dancing = useSyncExternalStore(
    subscribeMascotDance,
    () => isMascotDancing(),
    () => false,
  )
  const prevRouteSessionRef = useRef<string | null>(null)

  // 仅在「切到」另一会话时展开其所在组；列表刷新不会顶开用户刚折叠的组
  useLayoutEffect(() => {
    const prev = prevRouteSessionRef.current
    prevRouteSessionRef.current = routeSessionId
    if (!routeSessionId || prev === routeSessionId) return
    const group = sections
      .flatMap((section) => section.groups ?? [])
      .find((item) => item.sessions.some((row) => row.id === routeSessionId))
    if (!group) return
    expandProjectGroup(group.key)
  }, [routeSessionId, sections, expandProjectGroup])

  const popover = Boolean(popoverClose)
  const highlightId = routeChannelId ? null : popover ? sessionId : routeSessionId
  // 已经在会话页里就直接换 session，否则把输入框拉起来（悬浮聊天），别把人踢出当前页面。
  const openSessionPath = useCallback(
    (id: string) => {
      if (isChatPagePath(window.location.pathname)) navigate(sessionAppPath(id))
      else openOverlayComposer()
    },
    [navigate],
  )

  const createChat = useCallback(
    (opts: { projectPath?: string; createProject?: boolean } = {}) => {
      void sessionView
        .newSession(opts)
        .then((id) => {
          popoverClose?.()
          openSessionPath(id)
        })
        .catch((error) => {
          console.warn('[chat-sidebar] failed to create session', error)
        })
    },
    [openSessionPath, popoverClose, sessionView],
  )

  const openSession = useCallback(
    (item: SessionListItem) => {
      void sessionView.load(item.id, { view: 'chat' })
      openSessionPath(item.id)
      popoverClose?.()
    },
    [openSessionPath, popoverClose, sessionView],
  )

  const deleteChat = useCallback(
    (item: SessionListItem) => {
      const wasActive = item.id === sessionId
      void sessionView.deleteSession(item.id).then(() => {
        if (popover || !wasActive) return
        const next = sessionView.get().sessionId
        navigate(next ? sessionAppPath(next) : '/')
      })
    },
    [navigate, popover, sessionId, sessionView],
  )

  const pinChat = useCallback(
    (item: SessionListItem) => {
      void sessionView.setSessionPinned(item.id, !item.pinned)
    },
    [sessionView],
  )

  const workspaceLocation = useActiveWorkspaceLocation()
  const isCloudSpace = workspaceLocation === 'cloud'
  const { myAccountId, membersById } = useCloudSessionCreators(isCloudSpace)
  const creatorOf = useCallback(
    (item: SessionListItem): ChatMemberInfo | null => {
      if (!isCloudSpace || !myAccountId) return null
      const creatorId = item.createdBy?.trim()
      if (!creatorId || creatorId === myAccountId) return null
      const member = membersById.get(creatorId)
      return member ?? { id: creatorId, name: creatorId.slice(0, 8) }
    },
    [isCloudSpace, myAccountId, membersById],
  )

  const location = useLocation()
  const activeAgentView: AgentSubView = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('view')
    return raw === 'trajectory' || raw === 'usage' ? raw : ''
  }, [location.search])
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({})
  const toggleSessionExpand = useCallback(
    (id: string) => {
      setExpandedSessions((prev) => {
        const current = prev[id] ?? Boolean(id === highlightId && activeAgentView)
        return { ...prev, [id]: !current }
      })
    },
    [activeAgentView, highlightId],
  )

  const list = (section: SidebarSection, rowKey: string, rows: SessionListItem[]) => (
    <WindowedSessionList
      sessions={rows}
      rowKey={rowKey}
      highlightId={highlightId}
      activeView={activeAgentView}
      expandedSessions={expandedSessions}
      onToggleExpand={popover ? undefined : toggleSessionExpand}
      busySessions={busySessions}
      dancing={dancing}
      creatorOf={creatorOf}
      showTime={agentPrefs.showTime}
      onDelete={deleteChat}
      onPin={pinChat}
      onOpen={popover ? openSession : undefined}
      iconRail={iconRail}
    />
  )

  const body = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sidebar-create-agent-head">
        <button
          type="button"
          className="sidebar-create-agent"
          aria-label="添加 Agent"
          data-dock-tip="添加 Agent"
          data-dock-tip-at="e"
          onClick={() => createChat()}
        >
          <PlusIcon {...chromeIcon} />
          <span className="sidebar-label">添加 Agent</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3" data-chat-scroll="">
        {iconRail ? (
          <div className="min-w-0">
            {channelsHeader}
            <WindowedSessionList
              sessions={railSessions}
              rowKey="rail"
              highlightId={highlightId}
              busySessions={busySessions}
              dancing={dancing}
              onDelete={deleteChat}
              onPin={pinChat}
              onOpen={popover ? openSession : undefined}
              iconRail
            />
          </div>
        ) : (
        <div className="mt-2 space-y-1.5">
          {channelsHeader}
          {sections.map((section) => {
            const sectionCollapsed = Boolean(collapsedProjects[`chat.section.${section.kind}`])
            const count =
              section.sessions?.length ?? section.groups?.reduce((sum, group) => sum + group.sessions.length, 0) ?? 0
            return (
              <section key={section.kind} className="min-w-0">
                <div className="sidebar-section-head min-w-0">
                  <button
                    type="button"
                    className="flex h-full min-h-8 min-w-0 flex-1 items-center gap-2 text-left text-[12px] font-bold tracking-wider"
                    aria-expanded={!sectionCollapsed}
                    onClick={() => toggleSection(section.kind)}
                  >
                    <span className="min-w-0 flex-1 truncate tracking-normal">{section.label}</span>
                  </button>
                  <ChatCount count={count} />
                  {section.kind === 'project' ? (
                    <>
                      <SidebarFilterMenu
                        testId="sidebar-agents-filter"
                        title="代理分组、排序与筛选"
                        grouping={{
                          id: 'groupBy',
                          label: '分组',
                          value: agentPrefs.groupBy,
                          defaultValue: 'project',
                          options: [
                            { value: 'project', label: '项目' },
                            { value: 'updated', label: '更新时间' },
                            { value: 'none', label: '不分组' },
                          ],
                          onChange: (value) => patchAgentPrefs({ groupBy: value }),
                        }}
                        ordering={{
                          id: 'orderBy',
                          label: '排序',
                          value: agentPrefs.orderBy,
                          defaultValue: 'updated',
                          options: [
                            { value: 'updated', label: '最近活跃' },
                            { value: 'name', label: '名称' },
                          ],
                          onChange: (value) => patchAgentPrefs({ orderBy: value }),
                        }}
                        shows={[
                          {
                            id: 'showTime',
                            label: '显示时间',
                            checked: agentPrefs.showTime,
                            onChange: (checked) => patchAgentPrefs({ showTime: checked }),
                          },
                        ]}
                        filters={[
                          {
                            id: 'status',
                            label: '状态',
                            value: agentPrefs.status,
                            defaultValue: 'all',
                            options: [
                              { value: 'all', label: '全部' },
                              { value: 'busy', label: '运行中' },
                              { value: 'idle', label: '空闲' },
                            ],
                            onChange: (value) => patchAgentPrefs({ status: value }),
                          },
                          {
                            id: 'starred',
                            label: '收藏',
                            value: agentPrefs.starred,
                            defaultValue: 'all',
                            options: [
                              { value: 'all', label: '全部' },
                              { value: 'starred', label: '仅收藏' },
                            ],
                            onChange: (value) => patchAgentPrefs({ starred: value }),
                          },
                        ]}
                        onResetFilters={resetAgentPrefs}
                      />
                      <button
                        type="button"
                        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-transparent p-0 text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
                        title="添加 Agent"
                        aria-label="添加 Agent"
                        data-testid="sidebar-create-agent"
                        onClick={(event) => {
                          event.stopPropagation()
                          createChat()
                        }}
                      >
                        <PlusIcon className="size-4 shrink-0" />
                      </button>
                    </>
                  ) : null}
                </div>

                <SidebarFold open={!sectionCollapsed}>
                  <div className="sidebar-section-rows flex min-w-0 flex-col pt-0.5">
                    {section.sessions ? list(section, section.kind === 'pinned' ? 'pinned' : 'flat', section.sessions) : null}
                    {section.groups?.map((group) => {
                      const collapsed = Boolean(collapsedProjects[group.key])
                      const isTimeGroup = group.key.startsWith('time:')
                      const addLabel = group.kind === 'ungrouped' ? '在未分组下添加会话' : `在 ${group.label} 下添加会话`
                      return (
                        <div key={group.key} className="min-w-0">
                          <div className="sidebar-group-head">
                            <div
                              role="button"
                              tabIndex={0}
                              className="flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md text-left text-[14px] font-medium tracking-normal text-inherit outline-none hover:text-(--biu-color-text) focus-visible:ring-1 focus-visible:ring-(--biu-color-border)"
                              title={group.path ?? group.label}
                              aria-expanded={!collapsed}
                              onClick={() => toggleProjectGroup(group.key)}
                              onKeyDown={(event) => {
                                if (event.key !== 'Enter' && event.key !== ' ') return
                                event.preventDefault()
                                toggleProjectGroup(group.key)
                              }}
                            >
                              <span className="grid size-6 shrink-0 place-items-center" aria-hidden>
                                {isTimeGroup ? (
                                  <span className="sidebar-rail-icon sidebar-group-fold">
                                    <span className="sidebar-group-fold-face">
                                      <ClockIcon {...chromeIcon} />
                                    </span>
                                    <span className="sidebar-group-fold-chevron">
                                      <ChevronRightIcon
                                        className={chromeIconClass(`opacity-80 sidebar-chevron${collapsed ? '' : ' is-open'}`)}
                                      />
                                    </span>
                                  </span>
                                ) : (
                                  <GroupFoldGlyph group={group} collapsed={collapsed} />
                                )}
                              </span>
                              <span className="sidebar-label min-w-0 flex-1 truncate">{group.label}</span>
                            </div>
                            <ChatCount count={group.sessions.length} />
                            {!isTimeGroup ? (
                              <button
                                type="button"
                                className="sidebar-add"
                                title={addLabel}
                                aria-label={addLabel}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  const projectPath = resolveSidebarGroupProjectPath(group, isCloudSpace)
                                  createChat(projectPath ? { projectPath, createProject: isCloudSpace } : {})
                                }}
                              >
                                <PlusIcon {...chromeIcon} />
                              </button>
                            ) : null}
                          </div>
                          <SidebarFold open={!collapsed} className="sidebar-session-list min-w-0">
                            {list(section, group.key, group.sessions)}
                          </SidebarFold>
                        </div>
                      )
                    })}
                  </div>
                </SidebarFold>
              </section>
            )
          })}
          {docsFooter}
        </div>
        )}
      </div>
    </div>
  )

  if (!popoverClose) return body

  return (
    <div
      className="brand-agent-menu chat-sidebar-popover"
      data-testid="dock-chat-sidebar"
      role="dialog"
      aria-label="会话"
    >
      {body}
    </div>
  )
})

/** 分组头的「脸 + 折叠箭头」：hover/聚焦时脸让位给箭头。 */
const GroupFoldGlyph = memo(function GroupFoldGlyph({
  group,
  collapsed,
}: {
  group: SessionSidebarGroup
  collapsed: boolean
}) {
  const chevron = (
    <ChevronRightIcon
      className={chromeIconClass(`opacity-80 sidebar-chevron${collapsed ? '' : ' is-open'}`)}
    />
  )
  return (
    <span className="sidebar-rail-icon sidebar-group-fold" aria-hidden>
      <span className="sidebar-group-fold-face">
        {group.kind === 'ungrouped' ? (
          <FolderMinusIcon className={chromeIconClass('opacity-80')} />
        ) : (
          <FolderGlyph />
        )}
      </span>
      <span className="sidebar-group-fold-chevron">{chevron}</span>
    </span>
  )
})
