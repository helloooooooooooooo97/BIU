import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  SidebarMascot,
  isMascotDancing,
  resolveSessionMascot,
  subscribeMascotDance,
} from '@biu/public-mascot'
import { ChatCount } from '@biu/biu-ui/chat-count'
import { SidebarFold } from '@biu/biu-ui/sidebar-fold'
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
import { chromeIcon, chromeIconClass } from './chrome-icon.ts'
import { isChatPagePath, openOverlayComposer } from './chat-overlay.ts'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderMinusIcon,
  PlusIcon,
  StarIcon,
} from '@heroicons/react/16/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import {
  chatScrollRoot,
  sessionHostScroll,
  sessionWindowHidden,
  sessionWindowSlice,
  sessionWindowUnchanged,
  type SessionWindowSlice,
} from './session-window.ts'

const sessionRowMainClass =
  'flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[14px] leading-5'

/** 弹层里的会话行改成按钮（点了要关弹层），页面里的行仍是真链接。 */
const sessionRowMainProps = {
  draggable: false,
  onDragStart: (event: DragEvent<HTMLElement>) => event.preventDefault(),
  className: sessionRowMainClass,
  'data-dock-tip-at': 'e',
} as const

const SessionRow = memo(function SessionRow({
  item,
  active,
  busy,
  dancing,
  onDelete,
  onPin,
  onOpen,
}: {
  item: SessionListItem
  active: boolean
  busy: boolean
  dancing: boolean
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
  return (
    <div
      className={`chat-session-row group${active ? ' is-active' : ''}${pinned ? ' is-pinned' : ''}`}
      data-biu-kind="session"
      data-biu-id={item.id}
      data-biu-label={item.title}
      data-dock-tip={item.title}
      data-dock-tip-at="e"
    >
      {main}
      <button
        type="button"
        className="chat-session-row-delete"
        aria-label={`Delete session ${item.title}`}
        title="Delete"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onDelete(item)
        }}
      >
        <TrashGlyph {...chromeIcon} />
      </button>
      <button
        type="button"
        className={`chat-session-row-star${pinned ? ' is-on' : ''}`}
        aria-pressed={pinned}
        aria-label={pinned ? `取消收藏 ${item.title}` : `收藏 ${item.title}`}
        title={pinned ? '取消收藏' : '收藏'}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onPin(item)
        }}
      >
        <StarIcon {...chromeIcon} />
      </button>
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
  busySessions,
  dancing,
  onDelete,
  onPin,
  onOpen,
}: {
  sessions: SessionListItem[]
  rowKey: string
  highlightId: string | null
  busySessions: Record<string, true>
  dancing: boolean
  onDelete: (item: SessionListItem) => void
  onPin: (item: SessionListItem) => void
  onOpen?: (item: SessionListItem) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const count = sessions.length
  const [slice, setSlice] = useState(() => sessionWindowHidden(count))
  const countRef = useRef(count)
  countRef.current = count
  const lastScroll = useRef({ top: Number.NaN, height: Number.NaN })

  const applySlice = useCallback((next: SessionWindowSlice) => {
    setSlice((prev) =>
      prev.start === next.start && prev.end === next.end && prev.padTop === next.padTop && prev.padBottom === next.padBottom
        ? prev
        : next,
    )
  }, [])

  const measure = useCallback(() => {
    const host = hostRef.current
    const scroller = host ? chatScrollRoot(host) : null
    const n = countRef.current
    if (!host || !scroller) {
      lastScroll.current = { top: Number.NaN, height: Number.NaN }
      applySlice(sessionWindowHidden(n))
      return
    }
    const metrics = sessionHostScroll(host, scroller)
    if (metrics.hidden) {
      lastScroll.current = { top: metrics.top, height: metrics.height }
      applySlice(sessionWindowHidden(n))
      return
    }
    if (
      Number.isFinite(lastScroll.current.top) &&
      sessionWindowUnchanged(n, lastScroll.current, metrics)
    ) {
      return
    }
    lastScroll.current = { top: metrics.top, height: metrics.height }
    applySlice(sessionWindowSlice(n, metrics.top, metrics.height))
  }, [applySlice])

  useLayoutEffect(() => {
    lastScroll.current = { top: Number.NaN, height: Number.NaN }
    measure()
  }, [measure, count])

  useEffect(() => {
    const host = hostRef.current
    const scroller = host ? chatScrollRoot(host) : null
    if (!host || !scroller) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        measure()
      })
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(onScroll)
    ro.observe(scroller)
    ro.observe(host)
    return () => {
      cancelAnimationFrame(raf)
      scroller.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [measure])

  return (
    <div
      ref={hostRef}
      className="sidebar-session-window"
      data-session-window=""
      data-session-window-start={slice.start}
      data-session-window-end={slice.end}
      data-session-window-count={count}
      style={{ paddingTop: slice.padTop, paddingBottom: slice.padBottom }}
    >
      {sessions.slice(slice.start, slice.end).map((item) => (
        <SessionRow
          key={`${rowKey}:${item.id}`}
          item={item}
          active={item.id === highlightId}
          busy={Boolean(busySessions[item.id])}
          dancing={dancing}
          onDelete={onDelete}
          onPin={onPin}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
})

export type ChatSidebarProps = {
  routeSessionId: string | null
  useSessionView: ReturnType<typeof bindSessionView>
  sessionView: SessionViewService
  /** 弹层（小人菜单）里使用时：会话行变成按钮并关闭弹层，不再做页面跳转。 */
  popoverClose?: () => void
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
  // 板块级收缩（点击标题可展开/收缩，不显示收缩按钮，层级靠 kind 图标表达）
  const [collapsedSections, setCollapsedSections] = useState<Partial<Record<SidebarSectionKind, boolean>>>({})
  const toggleSection = useCallback((kind: SidebarSectionKind) => {
    setCollapsedSections((prev) => ({ ...prev, [kind]: !prev[kind] }))
  }, [])
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

  const list = (section: SidebarSection, rowKey: string, rows: SessionListItem[]) => (
    <WindowedSessionList
      sessions={rows}
      rowKey={rowKey}
      highlightId={highlightId}
      busySessions={busySessions}
      dancing={dancing}
      onDelete={deleteChat}
      onPin={pinChat}
      onOpen={popover ? openSession : undefined}
    />
  )

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3" data-chat-scroll="">
      <div className="mt-2 space-y-1.5">
        {sections.map((section) => {
          const sectionCollapsed = Boolean(collapsedSections[section.kind])
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
                <div className="flex min-w-0 flex-col gap-px pt-0.5">
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
  const chevron = collapsed ? (
    <ChevronRightIcon className={chromeIconClass('opacity-80')} />
  ) : (
    <ChevronDownIcon className={chromeIconClass('opacity-80')} />
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
