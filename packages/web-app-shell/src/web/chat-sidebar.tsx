import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Link, useNavigate } from 'react-router-dom'
import {
  SidebarMascot,
  isMascotDancing,
  resolveSessionMascot,
  subscribeMascotDance,
} from '@biu/public-mascot'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { apiFetch } from '@biu/biu-ui/api-client'
import { ChatCount } from '@biu/biu-ui/chat-count'
import { SidebarFold } from '@biu/biu-ui/sidebar-fold'
import { useActiveWorkspaceLocation } from './shell-chrome.tsx'
import {
  PINNED_GROUP_KEY,
  bindSessionView,
  buildSidebarSections,
  sessionAppPath,
  useSidebarCollapseStore,
  type SessionListItem,
  type SessionViewService,
  type SessionSidebarGroup,
  type SidebarSection,
  type SidebarSectionKind,
} from '@biu/web-session-view'
import { FolderGlyph } from '@biu/web-session-view/folder-glyph'
import { SIDEBAR_ROW_MAIN_CLASS, SidebarRow } from '@biu/web-session-view/sidebar-row'
import { chromeIcon, chromeIconClass } from './chrome-icon.ts'
import { isChatPagePath, openOverlayComposer } from './chat-overlay.ts'
import {
  ChevronRightIcon,
  FolderMinusIcon,
  PlusIcon,
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

type ChatMemberInfo = { id: string; name: string; avatar?: string }
const ACCOUNT_EVENT = 'biu:account-token'

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
        columns: 'title,name,email,avatar',
      })
      void Promise.all([
        apiFetch('/api/account/me').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        apiFetch(`/api/db/list?${params.toString()}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]).then(([me, listed]) => {
        if (cancelled) return
        setMyAccountId(String((me as { id?: string } | null)?.id ?? '').trim())
        const map = new Map<string, ChatMemberInfo>()
        const rows = Array.isArray((listed as { items?: unknown[] } | null)?.items)
          ? ((listed as { items: Array<Record<string, unknown>> }).items)
          : []
        for (const item of rows) {
          const id = String(item?.id ?? '').trim()
          if (!id) continue
          const name =
            String(item.name ?? '').trim() ||
            String(item.title ?? '').trim() ||
            String(item.email ?? '').trim() ||
            id.slice(0, 8)
          const avatar = typeof item.avatar === 'string' ? item.avatar.trim() : ''
          map.set(id, { id, name, ...(avatar ? { avatar } : {}) })
        }
        setMembersById(map)
      })
    }
    load()
    window.addEventListener(ACCOUNT_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(ACCOUNT_EVENT, load)
    }
  }, [isCloud])

  return { myAccountId, membersById }
}

const SessionRow = memo(function SessionRow({
  item,
  active,
  busy,
  dancing,
  creator,
  onDelete,
  onPin,
  onOpen,
}: {
  item: SessionListItem
  active: boolean
  busy: boolean
  dancing: boolean
  creator?: ChatMemberInfo | null
  onDelete: (item: SessionListItem) => void
  onPin: (item: SessionListItem) => void
  onOpen?: (item: SessionListItem) => void
}) {
  const pinned = Boolean(item.pinned)
  const label = (
    <span className="sidebar-label min-w-0 flex-1 truncate font-medium">{item.title}</span>
  )
  const main = onOpen ? (
    <button type="button" {...sessionRowMainProps} data-dock-tip={item.title} onClick={() => onOpen(item)}>
      <SessionRowMascot item={item} busy={busy} dancing={dancing} />
      {label}
    </button>
  ) : (
    <Link to={sessionAppPath(item.id)} {...sessionRowMainProps} data-dock-tip={item.title}>
      <SessionRowMascot item={item} busy={busy} dancing={dancing} />
      {label}
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
  return (
    <SidebarRow
      active={active}
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
  busySessions,
  dancing,
  creatorOf,
  onDelete,
  onPin,
  onOpen,
  iconRail,
}: {
  sessions: SessionListItem[]
  rowKey: string
  highlightId: string | null
  busySessions: Record<string, true>
  dancing: boolean
  creatorOf?: (item: SessionListItem) => ChatMemberInfo | null
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
  const count = sessions.length
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollEl,
    estimateSize: () => (iconRail ? SESSION_RAIL_ROW_PX : SESSION_ROW_PX),
    overscan: SESSION_WINDOW_OVERSCAN,
    scrollMargin: hostRef.current?.offsetTop ?? 0,
  })
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
        return (
          <div
            key={`${rowKey}:${item.id}`}
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
              busy={Boolean(busySessions[item.id])}
              dancing={dancing}
              creator={creatorOf?.(item) ?? null}
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
  useSessionView: ReturnType<typeof bindSessionView>
  sessionView: SessionViewService
  /** 弹层（小人菜单）里使用时：会话行变成按钮并关闭弹层，不再做页面跳转。 */
  popoverClose?: () => void
  iconRail?: boolean
}

/**
 * 独立订阅折叠态与 sessions：组展开/收缩只重渲侧栏，不拖垮 Shell 里的 Chat Markdown 主区。
 * 外框（品牌头、收起/展开、拖宽）由 Shell 的 ShellSidebarFrame 提供，这里只画列表本体。
 */
export const ChatSidebar = memo(function ChatSidebar({
  routeSessionId,
  useSessionView,
  sessionView,
  popoverClose,
  iconRail = false,
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
  const sections = useMemo(() => buildSidebarSections(sessions), [sessions])
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
    if (!group || group.key === PINNED_GROUP_KEY) return
    expandProjectGroup(group.key)
  }, [routeSessionId, sections, expandProjectGroup])

  const popover = Boolean(popoverClose)
  const highlightId = popover ? sessionId : routeSessionId
  // 已经在会话页里就直接换 session，否则把输入框拉起来（悬浮聊天），别把人踢出当前页面。
  const openSessionPath = useCallback(
    (id: string) => {
      if (isChatPagePath(window.location.pathname)) navigate(sessionAppPath(id))
      else openOverlayComposer()
    },
    [navigate],
  )

  const createChat = useCallback(
    (opts: { projectPath?: string } = {}) => {
      void sessionView.newSession(opts).then((id) => {
        popoverClose?.()
        openSessionPath(id)
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

  const list = (section: SidebarSection, rowKey: string, rows: SessionListItem[]) => (
    <WindowedSessionList
      sessions={rows}
      rowKey={rowKey}
      highlightId={highlightId}
      busySessions={busySessions}
      dancing={dancing}
      creatorOf={creatorOf}
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
                </div>

                <SidebarFold open={!sectionCollapsed}>
                  <div className="sidebar-section-rows flex min-w-0 flex-col pt-0.5">
                    {section.sessions ? list(section, 'pinned', section.sessions) : null}
                    {section.groups?.map((group) => {
                      const collapsed = Boolean(collapsedProjects[group.key])
                      const addLabel = group.kind === 'ungrouped' ? '在未分组下添加会话' : `在 ${group.label} 下添加会话`
                      return (
                        <div key={group.key} className="min-w-0">
                          <div className="sidebar-group-head">
                            <div
                              role="button"
                              tabIndex={0}
                              className="flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md text-left text-[14px] font-medium tracking-normal text-inherit outline-none hover:text-(--biu-color-text) focus-visible:ring-1 focus-visible:ring-(--biu-color-border)"
                              title={group.path ?? group.label}
                              aria-expanded={!collapsed}
                              onClick={() => toggleProjectGroup(group.key)}
                              onKeyDown={(event) => {
                                if (event.key !== 'Enter' && event.key !== ' ') return
                                event.preventDefault()
                                toggleProjectGroup(group.key)
                              }}
                            >
                              <GroupFoldGlyph group={group} collapsed={collapsed} />
                              <span className="sidebar-label min-w-0 flex-1 truncate">{group.label}</span>
                            </div>
                            <ChatCount count={group.sessions.length} />
                            <button
                              type="button"
                              className="sidebar-add"
                              title={addLabel}
                              aria-label={addLabel}
                              onClick={(event) => {
                                event.stopPropagation()
                                createChat(group.path ? { projectPath: group.path } : {})
                              }}
                            >
                              <PlusIcon {...chromeIcon} />
                            </button>
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
