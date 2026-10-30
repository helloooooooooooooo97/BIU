import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isMascotDancing, subscribeMascotDance } from '@biu/public-mascot'
import { ChatCount } from '@biu/biu-ui/chat-count'
import { SidebarFold } from '@biu/biu-ui/sidebar-fold'
import {
  bindSessionView,
  sessionAppPath,
  type SessionListItem,
  type SessionViewService,
} from '@biu/web-session-view'
import {
  PINNED_GROUP_KEY,
  UNGROUPED_PROJECT_KEY,
  UNGROUPED_TAG_KEY,
  buildSidebarSections,
  type SidebarGroupBy,
  type SidebarSectionKind,
} from '@biu/web-session-view'
import { useSidebarCollapseStore } from '@biu/web-session-view'
import { SidebarMascot } from '@biu/public-mascot'
import { resolveSessionMascot } from '@biu/public-mascot'
import { FolderGlyph } from '@biu/web-session-view/folder-glyph'
import { chromeIcon, chromeIconClass } from './chrome-icon.ts'
import { TagChip } from '@biu/biu-ui/tag-chip'
import { facetCatalogRevision, facetEmoji, facetLabel, pullFacets, subscribeFacetChrome } from '@biu/core-file-system/facet-catalog'
import { isChatPagePath, openOverlayComposer } from './chat-overlay.ts'
import { ShellSidebarFrame } from './shell-sidebar-frame.tsx'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  StarIcon,
  FolderIcon,
  TagIcon,
  FolderMinusIcon,
  BookmarkSlashIcon,
} from '@heroicons/react/16/solid'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { chatScrollRoot, sessionWindowFromHost, sessionWindowHidden, type SessionWindowSlice } from './session-window.ts'

/** 项目/标签分组视图的持久化 key。旧值 tag 仍按标签读。 */
const GROUP_BY_KEY = 'cordis.sidebar.groupBy'

function readGroupBy(): SidebarGroupBy {
  try {
    const stored = localStorage.getItem(GROUP_BY_KEY)
    return stored === 'tag' || stored === 'facet' ? 'facet' : 'project'
  } catch {
    return 'project'
  }
}

/** 每行标签徽标：最多显示 2 个，其余以 +N（剩余数量）展示。 */
function SessionTagBadges({ tags }: { tags?: string[] }) {
  const list = (tags ?? []).map((tag) => tag.trim()).filter(Boolean)
  if (!list.length) return null
  const shown = list.slice(0, 2)
  const extra = list.length - shown.length
  return (
    <span className="flex min-w-0 shrink-0 items-center gap-0.5 pl-0.5">
      {shown.map((tag) => {
        const emoji = facetEmoji(tag)
        return (
          <TagChip
            key={tag}
            id={tag}
            label={facetLabel(tag)}
            icon={emoji ? <span className="fsdb-record-emoji">{emoji}</span> : <TagIcon aria-hidden />}
          />
        )
      })}
      {extra > 0 ? (
        <span className="sidebar-tag shrink-0 rounded-sm px-0.5 opacity-80">
          +{extra}
        </span>
      ) : null}
    </span>
  )
}

const sessionRowMainClass =
  'flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[14px] leading-5'

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
  const identity = resolveSessionMascot(item.id, item.mascot)
  const pinned = Boolean(item.pinned)
  const inner = (
    <>
      <SidebarMascot
        size={20}
        sessionId={item.id}
        identity={identity}
        busy={busy}
        animate={false}
        dancing={dancing}
        title={dancing ? '跳舞中 🎉' : `${identity.shape} · ${identity.color}`}
      />
      <span className="sidebar-label min-w-0 flex-1 truncate font-medium">
        {item.title}
      </span>
      <SessionTagBadges tags={item.facet?.tags} />
    </>
  )
  return (
    <div
      className={`chat-session-row group${active ? ' is-active' : ''}${pinned ? ' is-pinned' : ''}`}
      data-biu-kind="session"
      data-biu-id={item.id}
      data-biu-label={item.title}
    >
      {onOpen ? (
        <button
          type="button"
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onClick={() => onOpen(item)}
          className={sessionRowMainClass}
        >
          {inner}
        </button>
      ) : (
        <Link
          to={sessionAppPath(item.id)}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          className={sessionRowMainClass}
        >
          {inner}
        </Link>
      )}
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
  const countRef = useRef(sessions.length)
  countRef.current = sessions.length
  const [slice, setSlice] = useState(() => sessionWindowHidden(sessions.length))

  const applySlice = useCallback((next: SessionWindowSlice) => {
    setSlice((prev) =>
      prev.start === next.start && prev.end === next.end && prev.padTop === next.padTop && prev.padBottom === next.padBottom
        ? prev
        : next,
    )
  }, [])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scroller = chatScrollRoot(host)
    applySlice(scroller ? sessionWindowFromHost(countRef.current, host, scroller) : sessionWindowHidden(countRef.current))
  }, [applySlice, sessions.length])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scroller = chatScrollRoot(host)
    if (!scroller) return
    let raf = 0
    const sync = () => applySlice(sessionWindowFromHost(countRef.current, host, scroller))
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        sync()
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
  }, [applySlice, sessions.length])

  return (
    <div
      ref={hostRef}
      className="sidebar-session-window"
      data-session-window=""
      data-session-window-start={slice.start}
      data-session-window-end={slice.end}
      data-session-window-count={sessions.length}
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
  visible: boolean
  narrow?: boolean
  showTags?: boolean
  variant?: 'page' | 'popover'
  routeSessionId: string | null
  useSessionView: ReturnType<typeof bindSessionView>
  sessionView: SessionViewService
  onCollapse?: () => void
  onExpand?: () => void
  onWidthChange?: (width: number) => void
  onActivate?: () => void
  embedded?: boolean
}

/**
 * 独立订阅折叠态与 sessions：组展开/收缩只重渲侧栏，不拖垮 Shell 里的 Chat Markdown 主区。
 */
export const ChatSidebar = memo(function ChatSidebar({
  visible,
  narrow = false,
  showTags = false,
  variant = 'page',
  routeSessionId,
  useSessionView,
  sessionView,
  onCollapse,
  onExpand,
  onWidthChange,
  onActivate,
  embedded = false,
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
  // 数据分组视图：项目树 / 标签树（持久化记忆用户选择）
  const [groupBy, setGroupBy] = useState<SidebarGroupBy>(readGroupBy)
  const changeGroupBy = useCallback((next: SidebarGroupBy) => {
    setGroupBy(next)
    // 完整保存/恢复，不截断
    try {
      localStorage.setItem(GROUP_BY_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])
  // 板块并存：收藏 + (项目|标签)，由上而下
  const sections = useMemo(() => buildSidebarSections(sessions, groupBy), [sessions, groupBy])
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

  const highlightId = variant === 'popover' ? sessionId : routeSessionId

  const createChat = useCallback(
    (opts: { projectPath?: string } = {}) => {
      void sessionView.newSession(opts).then((id) => {
        onActivate?.()
        if (isChatPagePath(window.location.pathname)) {
          navigate(sessionAppPath(id))
          return
        }
        if (variant === 'popover') {
          openOverlayComposer()
          return
        }
        navigate(sessionAppPath(id))
      })
    },
    [navigate, onActivate, sessionView, variant],
  )

  const openSession = useCallback(
    (item: SessionListItem) => {
      void sessionView.load(item.id, { view: 'chat' })
      if (isChatPagePath(window.location.pathname)) {
        navigate(sessionAppPath(item.id))
      } else {
        openOverlayComposer()
      }
      onActivate?.()
    },
    [navigate, onActivate, sessionView],
  )

  const deleteChat = useCallback((item: SessionListItem) => {
    const wasActive = item.id === sessionId
    void sessionView.deleteSession(item.id).then(() => {
      if (variant === 'popover') return
      if (!wasActive) return
      const next = sessionView.get().sessionId
      navigate(next ? sessionAppPath(next) : '/')
    })
  }, [navigate, sessionId, sessionView, variant])

  const pinChat = useCallback(
    (item: SessionListItem) => {
      void sessionView.setSessionPinned(item.id, !item.pinned)
    },
    [sessionView],
  )

  const body = (
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3" data-chat-scroll="">
        <div className="mt-2 space-y-1.5">
          {sessions.length === 0 && groupBy !== 'project' ? null : (
            sections.map((section) => {
              const sectionCollapsed = Boolean(collapsedSections[section.kind])
              return (
                <section key={section.kind} className="min-w-0">
                  {/* 板块标题：收藏 / (项目|标签)，可点击整行展开/收缩；层级靠 kind 图标表达；悬浮时右侧露出分组切换 tab */}
                  <div className="sidebar-section-head min-w-0">
                      <button
                        type="button"
                        className="flex h-full min-h-8 min-w-0 flex-1 items-center gap-2 text-left text-[12px] font-bold tracking-wider"
                        aria-expanded={!sectionCollapsed}
                        onClick={() => toggleSection(section.kind)}
                      >
                        <span className="min-w-0 flex-1 truncate tracking-normal">{section.label}</span>
                      </button>
                    <ChatCount
                      count={
                        section.sessions
                          ? section.sessions.length
                          : section.groups?.reduce((sum, g) => sum + g.sessions.length, 0) ?? 0
                      }
                    />
                      {section.kind !== 'pinned' ? (
                        <div
                          className="sidebar-view-switch"
                          role="group"
                          aria-label="分组视图切换"
                        >
                          <button
                            type="button"
                            title="按项目分组"
                            aria-pressed={groupBy === 'project'}
                            className={`sidebar-view-switch-btn${groupBy === 'project' ? ' is-on' : ''}`}
                            onClick={() => changeGroupBy('project')}
                          >
                            <FolderIcon {...chromeIcon} />
                          </button>
                          <button
                            type="button"
                            title="按标签分组"
                            aria-pressed={groupBy === 'facet'}
                            className={`sidebar-view-switch-btn${groupBy === 'facet' ? ' is-on' : ''}`}
                            onClick={() => changeGroupBy('facet')}
                          >
                            <TagIcon {...chromeIcon} />
                          </button>
                        </div>
                      ) : null}
                  </div>

                  <SidebarFold open={!sectionCollapsed}>
                    <div className="flex min-w-0 flex-col gap-px pt-0.5">
                      {section.sessions
                        ? (
                          <WindowedSessionList
                            sessions={section.sessions}
                            rowKey="pinned"
                            highlightId={highlightId}
                            busySessions={busySessions}
                            dancing={dancing}
                            onDelete={deleteChat}
                            onPin={pinChat}
                            onOpen={variant === 'popover' ? openSession : undefined}
                          />
                        )
                        : section.groups?.map((group) => {
                          const collapsed = Boolean(collapsedProjects[group.key])
                          const isUngrouped = group.key === UNGROUPED_PROJECT_KEY || group.key === UNGROUPED_TAG_KEY
                          const canAddHere = group.kind === 'project' || group.kind === 'ungrouped'
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
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      toggleProjectGroup(group.key)
                                    }
                                  }}
                                >
                                  <span className="sidebar-rail-icon sidebar-group-fold" aria-hidden>
                                    <span className="sidebar-group-fold-face">
                                      {group.kind === 'pinned' ? (
                                        <StarIcon {...chromeIcon} />
                                      ) : group.key === UNGROUPED_PROJECT_KEY ? (
                                        <FolderMinusIcon className={chromeIconClass('opacity-80')} />
                                      ) : group.key === UNGROUPED_TAG_KEY ? (
                                        <BookmarkSlashIcon className={chromeIconClass('opacity-80')} />
                                      ) : group.kind === 'facet' ? (
                                        <TagIcon className={chromeIconClass('opacity-80')} />
                                      ) : (
                                        <FolderGlyph />
                                      )}
                                    </span>
                                    <span className="sidebar-group-fold-chevron">
                                      {collapsed ? (
                                        <ChevronRightIcon className={chromeIconClass('opacity-80')} />
                                      ) : (
                                        <ChevronDownIcon className={chromeIconClass('opacity-80')} />
                                      )}
                                    </span>
                                  </span>
                                  <span className="sidebar-label min-w-0 flex-1 truncate">{group.label}</span>
                                </div>
                                <ChatCount count={group.sessions.length} />
                                  {canAddHere ? (
                                    <button
                                      type="button"
                                      className="sidebar-add"
                                      title={isUngrouped ? '在未分组下添加聊天' : `在 ${group.label} 下添加聊天`}
                                      aria-label={isUngrouped ? '在未分组下添加聊天' : `在 ${group.label} 下添加聊天`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        createChat({
                                          ...(group.path ? { projectPath: group.path } : {}),
                                        })
                                      }}
                                    >
                                      <PlusIcon {...chromeIcon} />
                                    </button>
                                  ) : null}
                              </div>
                              <SidebarFold open={!collapsed} className="sidebar-session-list min-w-0">
                                <WindowedSessionList
                                  sessions={group.sessions}
                                  rowKey={group.key}
                                  highlightId={highlightId}
                                  busySessions={busySessions}
                                  dancing={dancing}
                                  onDelete={deleteChat}
                                  onPin={pinChat}
                                  onOpen={variant === 'popover' ? openSession : undefined}
                                />
                              </SidebarFold>
                            </div>
                          )
                        })
                      }
                    </div>
                  </SidebarFold>
                </section>
              )
            })
          )}
        </div>
      </div>
  )

  if (variant === 'popover') {
    return (
      <div
        className="brand-agent-menu chat-sidebar-popover"
        data-testid="dock-chat-sidebar"
        role="dialog"
        aria-label="聊天"
      >
        {body}
      </div>
    )
  }

  if (embedded) {
    return body
  }

  return (
    <ShellSidebarFrame
      visible={visible}
      narrow={narrow}
      showTags={showTags}
      onCollapse={onCollapse}
      onExpand={onExpand}
      onWidthChange={onWidthChange}
      testId="chat-sidebar"
    >
      {body}
    </ShellSidebarFrame>
  )
})
