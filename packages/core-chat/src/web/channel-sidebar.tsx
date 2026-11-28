import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRightStartOnRectangleIcon,
  BellIcon,
  BellSlashIcon,
  BookmarkIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  EyeSlashIcon,
  HashtagIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  PlusIcon,
  RectangleStackIcon,
  TrashIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { Button } from '@biu/biu-ui'
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
import { SidebarMascot, resolveSessionMascot } from '@biu/public-mascot'
import {
  bindSessionView,
  channelAppPath,
  useSidebarCollapseStore,
  type SessionViewService,
} from '@biu/web-session-view'
import { SIDEBAR_ROW_MAIN_CLASS, SidebarRow, SidebarRowMain, type SidebarRowMenuItem } from '@biu/web-session-view/sidebar-row'
import {
  buildDefaultChannelName,
  type ChannelAccessMode,
  type ChannelAgentContextMode,
  type GroupChannelKind,
} from '../shared/channel-types.ts'
import {
  createChannel,
  deleteChannel,
  leaveChannel,
  loadChannels,
  markChannelRead,
  setChannelThreadFollow,
  updateChannelPreferences,
  useChannelStore,
} from './channel-store.ts'
import {
  fetchCollectionViews,
  resolveCollectionViewIds,
  type SavedCollectionViewOption,
} from './channel-view-import.ts'

type WorkspaceMemberRow = {
  id: string
  name: string
  email?: string
  avatar?: string
  status?: string
}

export function formatSidebarTime(ts?: number, now = Date.now()): string {
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

function useWorkspaceMembers() {
  const [myAccountId, setMyAccountId] = useState('')
  const [members, setMembers] = useState<WorkspaceMemberRow[]>([])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      const params = new URLSearchParams({
        path: '/workspace-members',
        limit: '200',
        columns: 'title,email,avatar,status',
      })
      void Promise.all([
        apiFetch('/api/account/workspace-profile').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        apiFetch('/api/account/me').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        apiFetch(`/api/db/list?${params.toString()}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]).then(([wp, me, listed]) => {
        if (cancelled) return
        const myId = String(
          (wp as { accountId?: string } | null)?.accountId ?? (me as { id?: string } | null)?.id ?? '',
        ).trim()
        setMyAccountId(myId)
        const rows = Array.isArray((listed as { items?: unknown[] } | null)?.items)
          ? ((listed as { items: Array<Record<string, unknown>> }).items)
          : []
        const out: WorkspaceMemberRow[] = []
        for (const row of rows) {
          const id = String(row?.id ?? '').trim()
          if (!id) continue
          out.push({
            id,
            name: String(row.title ?? row.name ?? row.email ?? id.slice(0, 8)).trim(),
            email: typeof row.email === 'string' ? row.email.trim() : undefined,
            avatar: typeof row.avatar === 'string' ? row.avatar.trim() : undefined,
            status: typeof row.status === 'string' ? row.status : undefined,
          })
        }
        setMembers(out)
      })
    }
    load()
    const off = onAppEvents(['biu:account-token', 'biu:workspace-profile'], load)
    return () => {
      cancelled = true
      off()
    }
  }, [])

  return { myAccountId, members }
}

export const ChannelSidebarSections = memo(function ChannelSidebarSections({
  routeChannelId,
  iconRail = false,
  popoverClose,
  useSessionView,
}: {
  routeChannelId?: string | null
  iconRail?: boolean
  popoverClose?: () => void
  useSessionView?: ReturnType<typeof bindSessionView>
  sessionView?: SessionViewService
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const activeThreadId = useMemo(() => new URLSearchParams(location.search).get('thread') || '', [location.search])
  const channels = useChannelStore((s) => s.channels)
  const loaded = useChannelStore((s) => s.loaded)
  const collapsedMap = useSidebarCollapseStore((s) => s.collapsed)
  const toggleSection = useSidebarCollapseStore((s) => s.toggle)
  const { myAccountId, members } = useWorkspaceMembers()
  const [createOpen, setCreateOpen] = useState(false)
  const [disbandTarget, setDisbandTarget] = useState<{ id: string; name: string } | null>(null)
  const [disbanding, setDisbanding] = useState(false)
  const [expandedChannels, setExpandedChannels] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!loaded) void loadChannels()
  }, [loaded])

  const memberAvatarById = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of members) {
      if (m.avatar) map.set(m.id, m.avatar)
    }
    return map
  }, [members])

  const memberOnlineById = useMemo(() => {
    const set = new Set<string>()
    for (const m of members) {
      if (m.status === 'online') set.add(m.id)
    }
    return set
  }, [members])

  const peerMembers = useMemo(
    () => members.filter((m) => !myAccountId || m.id !== myAccountId),
    [members, myAccountId],
  )
  const selfName = useMemo(
    () => (myAccountId ? members.find((m) => m.id === myAccountId)?.name ?? '' : ''),
    [members, myAccountId],
  )

  const handleHideChannel = useCallback(
    async (channelId: string) => {
      try {
        await updateChannelPreferences(channelId, { hidden: true })
        if (routeChannelId === channelId) navigate('/')
      } catch {
        /* ignore */
      }
    },
    [navigate, routeChannelId],
  )

  const handleLeaveChannel = useCallback(
    async (channelId: string) => {
      try {
        await leaveChannel(channelId)
        if (routeChannelId === channelId) navigate('/')
      } catch {
        /* ignore */
      }
    },
    [navigate, routeChannelId],
  )

  const handleDisbandChannel = useCallback(async () => {
    if (!disbandTarget || disbanding) return
    setDisbanding(true)
    try {
      const targetId = disbandTarget.id
      await deleteChannel(targetId)
      setDisbandTarget(null)
      if (routeChannelId === targetId) navigate('/')
    } catch {
      /* ignore */
    } finally {
      setDisbanding(false)
    }
  }, [disbandTarget, disbanding, navigate, routeChannelId])

  const handleUnfollowThread = useCallback(
    async (channelId: string, rootId: string) => {
      try {
        await setChannelThreadFollow(channelId, rootId, false)
        if (routeChannelId === channelId && activeThreadId === rootId) {
          navigate(channelAppPath(channelId))
        }
      } catch {
        /* ignore */
      }
    },
    [activeThreadId, navigate, routeChannelId],
  )

  if (iconRail) {
    return (
      <div className="mb-1 flex flex-col gap-0.5 border-b border-(--biu-color-bg-muted) pb-1" data-testid="sidebar-channels-rail">
        <button
          type="button"
          className="chat-session-row w-full border-0 bg-transparent"
          title="新建聊天"
          aria-label="新建聊天"
          data-dock-tip="新建聊天"
          data-dock-tip-at="e"
          data-testid="sidebar-rail-create-channel"
          onClick={() => setCreateOpen(true)}
        >
          <span className="grid size-6 shrink-0 place-items-center">
            <UserGroupIcon className="size-4 opacity-85" aria-hidden />
          </span>
        </button>
        {channels.map((ch) => {
          const active = ch.id === routeChannelId
          const isDm = ch.kind === 'dm'
          const peerAvatar = isDm
            ? (ch.peerAccountId ? memberAvatarById.get(ch.peerAccountId) : undefined) || ch.peerAvatar
            : undefined
          const peerOnline = isDm && Boolean(ch.peerAccountId && memberOnlineById.has(ch.peerAccountId))
          const unread = !active ? (ch.unreadCount ?? 0) : 0
          const mentions = !active ? (ch.mentionCount ?? 0) : 0
          return (
            <Link
              key={ch.id}
              to={channelAppPath(ch.id)}
              className={`chat-session-row relative${active ? ' is-active' : ''}`}
              title={isDm ? ch.name : `# ${ch.name}`}
              aria-label={`聊天 ${ch.name}`}
              data-dock-tip={isDm ? ch.name : `# ${ch.name}`}
              data-dock-tip-at="e"
              onClick={() => popoverClose?.()}
            >
              <span className="relative grid size-6 shrink-0 place-items-center">
                {isDm ? (
                  peerAvatar ? (
                    <img src={peerAvatar} alt="" className="size-5 max-w-none shrink-0 rounded-full object-cover" />
                  ) : (
                    <AiAvatar seed={ch.peerAccountId || ch.id} size={20} className="shrink-0 rounded-full" />
                  )
                ) : ch.kind === 'announcement' ? (
                  <MegaphoneIcon className="size-3.5 opacity-80" aria-hidden />
                ) : ch.kind === 'forum' ? (
                  <RectangleStackIcon className="size-3.5 opacity-80" aria-hidden />
                ) : ch.accessMode === 'private' ? (
                  <LockClosedIcon className="size-3.5 opacity-80" aria-hidden />
                ) : (
                  <HashtagIcon className="size-4 opacity-80" aria-hidden />
                )}
                {peerOnline ? (
                  <span
                    className="absolute right-0 bottom-0 size-2 rounded-full bg-emerald-500 ring-[1.5px] ring-(--biu-color-bg-subtle)"
                    aria-hidden
                  />
                ) : null}
                {unread > 0 && !ch.muted ? (
                  <span
                    className={`absolute -top-0.5 -right-0.5 size-2 rounded-full ${mentions > 0 ? 'bg-rose-500' : 'bg-(--biu-color-text)'}`}
                    aria-hidden
                  />
                ) : null}
              </span>
            </Link>
          )
        })}
        {createOpen ? (
          <CreateChannelDialog
            members={peerMembers}
            myAccountId={myAccountId}
            selfName={selfName}
            useSessionView={useSessionView}
            onClose={() => setCreateOpen(false)}
            onCreated={(id) => {
              setCreateOpen(false)
              popoverClose?.()
              navigate(channelAppPath(id))
            }}
          />
        ) : null}
      </div>
    )
  }

  const channelsCollapsed = Boolean(collapsedMap['chat.section.channels'])
  const [channelPrefs, patchChannelPrefs, resetChannelPrefs] = useSidebarViewPrefs('biu.sidebar.channels.view', {
    groupBy: 'none',
    orderBy: 'updated',
    kind: 'all',
    status: 'all',
    showTime: true,
  })

  const visibleChannels = useMemo(() => {
    const filtered = channels.filter((ch) => {
      if (channelPrefs.kind === 'dm' && ch.kind !== 'dm') return false
      if (channelPrefs.kind === 'channel' && ch.kind === 'dm') return false
      if (channelPrefs.status === 'unread' && !((ch.unreadCount ?? 0) > 0 && ch.id !== routeChannelId)) return false
      if (channelPrefs.status === 'pinned' && !ch.pinned) return false
      return true
    })
    if (channelPrefs.orderBy === 'name') {
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    }
    return filtered
  }, [channelPrefs.kind, channelPrefs.orderBy, channelPrefs.status, channels, routeChannelId])

  const unreadChannels = useMemo(
    () => channels.filter((ch) => (ch.unreadCount ?? 0) > 0 && ch.id !== routeChannelId),
    [channels, routeChannelId],
  )

  const channelGroups = useMemo(() => {
    if (channelPrefs.groupBy === 'none') return null
    if (channelPrefs.groupBy === 'kind') {
      const dms = visibleChannels.filter((ch) => ch.kind === 'dm')
      const rooms = visibleChannels.filter((ch) => ch.kind !== 'dm')
      return [
        ...(dms.length ? [{ key: 'kind:dm', label: '私聊', rows: dms }] : []),
        ...(rooms.length ? [{ key: 'kind:channel', label: '群聊', rows: rooms }] : []),
      ]
    }
    const now = Date.now()
    const buckets = new Map<string, typeof visibleChannels>()
    for (const ch of visibleChannels) {
      const key = timeBucketForTimestamp(ch.lastMessageAt || ch.updatedAt, now)
      const list = buckets.get(key) ?? []
      list.push(ch)
      buckets.set(key, list)
    }
    return TIME_BUCKET_ORDER.flatMap(({ key, label }) => {
      const rows = buckets.get(key)
      return rows?.length ? [{ key: `time:${key}`, label, rows }] : []
    })
  }, [channelPrefs.groupBy, visibleChannels])

  const renderChannelItem = (ch: (typeof channels)[number]) => {
                const isDm = ch.kind === 'dm'
                const isChannelActive = ch.id === routeChannelId
                const active = isChannelActive && !activeThreadId
                const peerAvatar = isDm
                  ? (ch.peerAccountId ? memberAvatarById.get(ch.peerAccountId) : undefined) || ch.peerAvatar
                  : undefined
                const peerOnline = isDm && Boolean(ch.peerAccountId && memberOnlineById.has(ch.peerAccountId))
                const unread = !isChannelActive ? (ch.unreadCount ?? 0) : 0
                const mentions = !isChannelActive ? (ch.mentionCount ?? 0) : 0
                const hasUnreadEmphasis = unread > 0 && !ch.muted
                const timeLabel = formatSidebarTime(ch.lastMessageAt || ch.updatedAt)
                const subThreads = ch.threads ?? []
                const hasThreads = subThreads.length > 0
                const threadExpanded =
                  hasThreads &&
                  (expandedChannels[ch.id] ?? (isChannelActive && Boolean(activeThreadId)))
                const channelFace = (
                  <>
                    {isDm ? (
                      peerAvatar ? (
                        <img src={peerAvatar} alt="" className="size-[18px] max-w-none shrink-0 rounded-full object-cover" />
                      ) : (
                        <AiAvatar seed={ch.peerAccountId || ch.id} size={18} className="shrink-0 rounded-full" />
                      )
                    ) : ch.kind === 'announcement' ? (
                      <MegaphoneIcon className="size-3.5" data-testid={`sidebar-channel-icon-announcement-${ch.id}`} />
                    ) : ch.kind === 'forum' ? (
                      <RectangleStackIcon className="size-3.5" data-testid={`sidebar-channel-icon-forum-${ch.id}`} />
                    ) : ch.accessMode === 'private' ? (
                      <LockClosedIcon className="size-3.5" />
                    ) : (
                      <HashtagIcon className="size-3.5" />
                    )}
                    {peerOnline ? (
                      <span
                        className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-emerald-500 ring-[1.5px] ring-(--biu-color-bg-subtle)"
                        data-testid={`sidebar-dm-online-${ch.id}`}
                        aria-hidden
                      />
                    ) : null}
                  </>
                )
                const isOwnerOrManager = Boolean(
                  ch.canManage ?? (!myAccountId || ch.createdBy === myAccountId),
                )
                const channelMenuItems: SidebarRowMenuItem[] = [
                  ...(unread > 0
                    ? [
                        {
                          id: 'mark-read',
                          label: '标为已读',
                          icon: <CheckIcon className="size-4 shrink-0" />,
                          onSelect: () => void markChannelRead(ch.id),
                        },
                      ]
                    : []),
                  {
                    id: 'pin',
                    label: ch.pinned ? '取消置顶' : '置顶聊天',
                    icon: <BookmarkIcon className="size-4 shrink-0" />,
                    onSelect: () => void updateChannelPreferences(ch.id, { pinned: !ch.pinned }),
                  },
                  {
                    id: 'mute',
                    label: ch.muted ? '取消免打扰' : '消息免打扰',
                    icon: ch.muted ? (
                      <BellIcon className="size-4 shrink-0" />
                    ) : (
                      <BellSlashIcon className="size-4 shrink-0" />
                    ),
                    onSelect: () => void updateChannelPreferences(ch.id, { muted: !ch.muted }),
                  },
                  {
                    id: 'hide',
                    label: isDm ? '隐藏对话' : '隐藏聊天',
                    icon: <EyeSlashIcon className="size-4 shrink-0" />,
                    onSelect: () => void handleHideChannel(ch.id),
                  },
                  ...(!isDm
                    ? isOwnerOrManager
                      ? [
                          {
                            id: 'disband',
                            label: '解散聊天',
                            icon: <TrashIcon className="size-4 shrink-0" />,
                            danger: true,
                            onSelect: () => setDisbandTarget({ id: ch.id, name: ch.name }),
                          },
                        ]
                      : [
                          {
                            id: 'leave',
                            label: '退出聊天',
                            icon: <ArrowRightStartOnRectangleIcon className="size-4 shrink-0" />,
                            danger: true,
                            onSelect: () => void handleLeaveChannel(ch.id),
                          },
                        ]
                    : []),
                ]
                return (
                  <div key={ch.id} className="min-w-0">
                    <SidebarRow
                      active={active}
                      attrs={{
                        'data-biu-kind': 'channel',
                        'data-biu-id': ch.id,
                        'data-biu-label': ch.name,
                        'data-biu-title': ch.name,
                        'data-biu-path': `/channels/${ch.id}`,
                      }}
                      main={
                        <SidebarRowMain>
                          {hasThreads ? (
                            <button
                              type="button"
                              className="group/fold relative grid size-6 shrink-0 cursor-pointer place-items-center border-0 bg-transparent p-0 text-inherit"
                              title={threadExpanded ? `收起 ${ch.name} 的子话题` : `展开 ${ch.name} 的子话题`}
                              aria-label={threadExpanded ? `收起 ${ch.name} 的子话题` : `展开 ${ch.name} 的子话题`}
                              aria-expanded={threadExpanded}
                              data-testid={`sidebar-channel-threads-toggle-${ch.id}`}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setExpandedChannels((prev) => ({ ...prev, [ch.id]: !threadExpanded }))
                              }}
                            >
                              <span className={`sidebar-rail-icon sidebar-group-fold${isDm ? ' !size-[18px]' : ''}`}>
                                <span
                                  className={`sidebar-group-fold-face relative group-hover:hidden! group-hover/fold:hidden!${isDm ? ' !size-[18px]' : ''}`}
                                >
                                  {channelFace}
                                </span>
                                <span className="sidebar-group-fold-chevron group-hover:grid! group-hover/fold:grid!">
                                  <ChevronRightIcon
                                    className={`size-4 shrink-0 opacity-80 sidebar-chevron${threadExpanded ? ' is-open' : ''}`}
                                  />
                                </span>
                              </span>
                            </button>
                          ) : (
                            <span className="relative grid size-6 shrink-0 place-items-center" aria-hidden>
                              <span className={`sidebar-rail-icon relative${isDm ? ' !size-[18px]' : ' opacity-85'}`}>
                                {channelFace}
                              </span>
                            </span>
                          )}
                          <Link
                            to={channelAppPath(ch.id)}
                            className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-inherit no-underline"
                            title={ch.topic ? `${ch.name} · ${ch.topic}` : ch.name}
                            onClick={() => popoverClose?.()}
                          >
                            <span
                              className={`sidebar-label min-w-0 flex-1 truncate ${hasUnreadEmphasis ? 'font-semibold text-(--biu-color-text)' : 'font-medium'}`}
                            >
                              {ch.name}
                            </span>
                            {ch.pinned ? (
                              <BookmarkIcon
                                className="size-3 shrink-0 text-(--biu-color-text-subtle)"
                                title="已置顶"
                                data-testid={`sidebar-channel-pinned-${ch.id}`}
                              />
                            ) : null}
                            {ch.muted ? (
                              <BellSlashIcon
                                className="size-3 shrink-0 text-(--biu-color-text-subtle)"
                                title="已免打扰"
                                data-testid={`sidebar-channel-muted-${ch.id}`}
                              />
                            ) : null}
                            {mentions > 0 ? (
                              <span
                                className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white tabular-nums"
                                data-testid={`sidebar-channel-unread-${ch.id}`}
                                title={`${mentions} 条 @提及`}
                              >
                                @{mentions > 99 ? '99+' : mentions}
                              </span>
                            ) : unread > 0 && !ch.muted ? (
                              <span
                                className="shrink-0 rounded-full bg-(--biu-color-bg-muted) px-1.5 py-0.5 text-[10px] leading-none font-semibold text-(--biu-color-text) tabular-nums"
                                data-testid={`sidebar-channel-unread-${ch.id}`}
                                title={`${unread} 条未读消息`}
                              >
                                {unread > 99 ? '99+' : unread}
                              </span>
                            ) : null}
                            {channelPrefs.showTime && timeLabel ? (
                              <span
                                className="shrink-0 text-[11px] leading-none text-(--biu-color-text-subtle) tabular-nums"
                                data-testid="sidebar-channel-time"
                              >
                                {timeLabel}
                              </span>
                            ) : null}
                          </Link>
                        </SidebarRowMain>
                      }
                      menuItems={channelMenuItems}
                      moreLabel={`${ch.name} 更多操作`}
                    />
                    {hasThreads ? (
                      <SidebarFold open={threadExpanded} className="sidebar-session-list min-w-0">
                        <div className="flex min-w-0 flex-col" data-testid={`sidebar-channel-threads-${ch.id}`}>
                          {subThreads.map((t) => {
                            const threadActive = isChannelActive && activeThreadId === t.rootId
                            return (
                              <SidebarRow
                                key={t.rootId}
                                active={threadActive}
                                attrs={{
                                  'data-biu-kind': 'thread',
                                  'data-biu-id': `${ch.id}:${t.rootId}`,
                                  'data-biu-label': t.title,
                                  'data-biu-title': t.title,
                                  'data-biu-path': `/channels/${ch.id}`,
                                }}
                                main={
                                  <Link
                                    to={`${channelAppPath(ch.id)}?thread=${encodeURIComponent(t.rootId)}`}
                                    data-testid={`sidebar-thread-${t.rootId}`}
                                    className={SIDEBAR_ROW_MAIN_CLASS}
                                    title={`${t.title}（${t.replyCount} 条回复）`}
                                    onClick={() => popoverClose?.()}
                                  >
                                    <span className="grid size-6 shrink-0 place-items-center" aria-hidden>
                                      <span className="sidebar-rail-icon">
                                        <ChatBubbleLeftRightIcon className="size-3.5 opacity-75" />
                                      </span>
                                    </span>
                                    <span className="sidebar-label min-w-0 flex-1 truncate text-[13px]">
                                      {t.title}
                                    </span>
                                    <span className="shrink-0 text-[11px] leading-none text-(--biu-color-text-subtle) tabular-nums">
                                      {t.replyCount}
                                    </span>
                                  </Link>
                                }
                                menuItems={[
                                  {
                                    id: 'unfollow',
                                    label: '取消关注',
                                    icon: <BellSlashIcon className="size-4 shrink-0" />,
                                    onSelect: () => void handleUnfollowThread(ch.id, t.rootId),
                                  },
                                ]}
                                moreLabel={`${t.title} 更多操作`}
                              />
                            )
                          })}
                        </div>
                      </SidebarFold>
                    ) : null}
                  </div>
                )
  }

  return (
    <div className="space-y-1.5" data-testid="sidebar-slack-sections">
      {/* 聊天（包含多人聊天与已发起的成员私聊；右上角筛选 + 新建） */}
      <section className="min-w-0" data-testid="sidebar-channels-section">
        <div className="sidebar-section-head min-w-0">
          <button
            type="button"
            className="flex h-full min-h-8 min-w-0 flex-1 items-center gap-2 text-left text-[12px] font-bold tracking-wider"
            aria-expanded={!channelsCollapsed}
            onClick={() => toggleSection('chat.section.channels')}
          >
            <span className="min-w-0 flex-1 truncate tracking-normal">聊天</span>
          </button>
          <ChatCount count={visibleChannels.length} />
          <SidebarFilterMenu
            testId="sidebar-channels-filter"
            title="聊天分组、排序与筛选"
            grouping={{
              id: 'groupBy',
              label: '分组',
              value: channelPrefs.groupBy,
              defaultValue: 'none',
              options: [
                { value: 'none', label: '不分组' },
                { value: 'kind', label: '类型' },
                { value: 'updated', label: '更新时间' },
              ],
              onChange: (value) => patchChannelPrefs({ groupBy: value }),
            }}
            ordering={{
              id: 'orderBy',
              label: '排序',
              value: channelPrefs.orderBy,
              defaultValue: 'updated',
              options: [
                { value: 'updated', label: '最近活跃' },
                { value: 'name', label: '名称' },
              ],
              onChange: (value) => patchChannelPrefs({ orderBy: value }),
            }}
            shows={[
              {
                id: 'showTime',
                label: '显示时间',
                checked: channelPrefs.showTime,
                onChange: (checked) => patchChannelPrefs({ showTime: checked }),
              },
            ]}
            filters={[
              {
                id: 'kind',
                label: '类型',
                value: channelPrefs.kind,
                defaultValue: 'all',
                options: [
                  { value: 'all', label: '全部' },
                  { value: 'dm', label: '仅私聊' },
                  { value: 'channel', label: '仅群聊' },
                ],
                onChange: (value) => patchChannelPrefs({ kind: value }),
              },
              {
                id: 'status',
                label: '状态',
                value: channelPrefs.status,
                defaultValue: 'all',
                options: [
                  { value: 'all', label: '全部' },
                  { value: 'unread', label: '仅未读' },
                  { value: 'pinned', label: '仅置顶' },
                ],
                onChange: (value) => patchChannelPrefs({ status: value }),
              },
            ]}
            onResetFilters={resetChannelPrefs}
            action={{
              id: 'mark-all-read',
              label: '全部标为已读',
              disabled: unreadChannels.length === 0,
              onSelect: () => {
                for (const ch of unreadChannels) {
                  void markChannelRead(ch.id)
                }
              },
            }}
          />
          <button
            type="button"
            className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-transparent p-0 text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
            title="新建聊天"
            aria-label="新建聊天"
            data-testid="sidebar-create-channel"
            onClick={(event) => {
              event.stopPropagation()
              setCreateOpen(true)
            }}
          >
            <PlusIcon className="size-4 shrink-0" />
          </button>
        </div>

        <SidebarFold open={!channelsCollapsed}>
          {visibleChannels.length > 0 ? (
            <div className="sidebar-section-rows flex min-w-0 flex-col pt-0.5">
              {channelGroups
                ? channelGroups.map((group) => {
                    const collapseKey = `chat.channels.${group.key}`
                    const collapsed = Boolean(collapsedMap[collapseKey])
                    const isTime = group.key.startsWith('time:')
                    return (
                      <div key={group.key} className="min-w-0" data-testid={`sidebar-channels-group-${group.key}`}>
                        <div className="sidebar-group-head">
                          <div
                            role="button"
                            tabIndex={0}
                            className="flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md text-left text-[14px] font-medium tracking-normal text-inherit outline-none hover:text-(--biu-color-text) focus-visible:ring-1 focus-visible:ring-(--biu-color-border)"
                            title={group.label}
                            aria-expanded={!collapsed}
                            onClick={() => toggleSection(collapseKey)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return
                              event.preventDefault()
                              toggleSection(collapseKey)
                            }}
                          >
                            <span className="grid size-6 shrink-0 place-items-center" aria-hidden>
                              <span className="sidebar-rail-icon sidebar-group-fold">
                                <span className="sidebar-group-fold-face">
                                  {isTime ? (
                                    <ClockIcon className="size-4 shrink-0" />
                                  ) : group.key === 'kind:dm' ? (
                                    <ChatBubbleLeftRightIcon className="size-4 shrink-0" />
                                  ) : (
                                    <UserGroupIcon className="size-4 shrink-0" />
                                  )}
                                </span>
                                <span className="sidebar-group-fold-chevron">
                                  <ChevronRightIcon
                                    className={`size-4 shrink-0 opacity-80 sidebar-chevron${collapsed ? '' : ' is-open'}`}
                                  />
                                </span>
                              </span>
                            </span>
                            <span className="sidebar-label min-w-0 flex-1 truncate">{group.label}</span>
                          </div>
                          <ChatCount count={group.rows.length} />
                        </div>
                        <SidebarFold open={!collapsed} className="sidebar-session-list min-w-0">
                          {group.rows.map(renderChannelItem)}
                        </SidebarFold>
                      </div>
                    )
                  })
                : visibleChannels.map(renderChannelItem)}
            </div>
          ) : null}
        </SidebarFold>
      </section>

      {createOpen ? (
        <CreateChannelDialog
          members={peerMembers}
          myAccountId={myAccountId}
          selfName={selfName}
          useSessionView={useSessionView}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false)
            popoverClose?.()
            navigate(channelAppPath(id))
          }}
        />
      ) : null}

      {disbandTarget && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="biu-float-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="确认解散聊天"
              data-testid="sidebar-disband-confirm-dialog"
              onClick={() => {
                if (!disbanding) setDisbandTarget(null)
              }}
            >
              <div className="biu-float w-[min(400px,92vw)]" onClick={(e) => e.stopPropagation()}>
                <div className="biu-float-head">
                  <h2 className="biu-float-title">解散并删除聊天</h2>
                  <button
                    type="button"
                    className="biu-float-close"
                    title="关闭"
                    aria-label="关闭"
                    disabled={disbanding}
                    onClick={() => setDisbandTarget(null)}
                  >
                    <XMarkIcon className="size-4 shrink-0" />
                  </button>
                </div>
                <div className="px-4 py-3 text-[13px] leading-relaxed text-(--biu-color-text-muted)">
                  确认解散「<span className="font-medium text-(--biu-color-text)">{disbandTarget.name}</span>
                  」吗？解散后该聊天的所有消息、附件与讨论串将被永久清空，所有成员均无法再查看。
                </div>
                <div className="flex items-center justify-end gap-2 px-4 pb-4">
                  <Button
                    variant="secondary"
                    className="h-8 px-3 text-[12.5px]"
                    disabled={disbanding}
                    onClick={() => setDisbandTarget(null)}
                  >
                    取消
                  </Button>
                  <Button
                    variant="destructive"
                    className="h-8 px-3 text-[12.5px]"
                    disabled={disbanding}
                    data-testid="sidebar-disband-confirm-btn"
                    onClick={() => void handleDisbandChannel()}
                  >
                    {disbanding ? '解散中…' : '确认解散'}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
})

function CreateChannelDialog({
  members,
  myAccountId,
  selfName,
  useSessionView,
  onClose,
  onCreated,
}: {
  members: WorkspaceMemberRow[]
  myAccountId: string
  selfName: string
  useSessionView?: ReturnType<typeof bindSessionView>
  onClose: () => void
  onCreated: (channelId: string) => void
}) {
  const allSessions = useSessionView ? useSessionView((s) => s.sessions) : []
  const myAgents = useMemo(
    () => allSessions.filter((s) => !myAccountId || !s.createdBy || s.createdBy === myAccountId),
    [allSessions, myAccountId],
  )
  const [channelKind, setChannelKind] = useState<GroupChannelKind>('channel')
  const [customName, setCustomName] = useState('')
  const [search, setSearch] = useState('')
  const [accessMode, setAccessMode] = useState<ChannelAccessMode>('private')
  const [agentContextMode, setAgentContextMode] = useState<ChannelAgentContextMode>('summary')
  const [pickedMembers, setPickedMembers] = useState<string[]>([])
  const [pickedAgents, setPickedAgents] = useState<string[]>([])
  const [memberViews, setMemberViews] = useState<SavedCollectionViewOption[]>([])
  const [agentViews, setAgentViews] = useState<SavedCollectionViewOption[]>([])
  const [importingViewKey, setImportingViewKey] = useState<string | null>(null)
  const [viewImportNotice, setViewImportNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (members.length > 0) {
      void fetchCollectionViews('/workspace-members').then((list) => {
        if (!cancelled) setMemberViews(list)
      })
    }
    if (myAgents.length > 0) {
      void fetchCollectionViews('/agents').then((list) => {
        if (!cancelled) setAgentViews(list)
      })
    }
    return () => {
      cancelled = true
    }
  }, [members.length, myAgents.length])

  const handleImportFromView = async (type: 'account' | 'agent', view: SavedCollectionViewOption) => {
    if (importingViewKey) return
    const key = `${type}:${view.id}`
    setImportingViewKey(key)
    setError('')
    setViewImportNotice('')
    try {
      const path = type === 'account' ? '/workspace-members' : '/agents'
      const snapshot = await resolveCollectionViewIds(path, view.id)
      if (type === 'account') {
        const selectable = new Set(members.map((m) => m.id))
        const matched = snapshot.ids.filter((id) => id !== myAccountId && selectable.has(id))
        const already = new Set(pickedMembers)
        const newlyPicked = matched.filter((id) => !already.has(id))
        if (newlyPicked.length > 0) {
          setPickedMembers((prev) => [...prev, ...newlyPicked])
          const existingCount = matched.length - newlyPicked.length
          setViewImportNotice(
            `已按成员视图「${view.name}」静态勾选 ${newlyPicked.length} 位成员${
              existingCount > 0 ? `（${existingCount} 位已勾选）` : ''
            }`,
          )
        } else if (matched.length > 0) {
          setViewImportNotice(`成员视图「${view.name}」中的 ${matched.length} 位成员已全部勾选`)
        } else {
          setViewImportNotice(`成员视图「${view.name}」当前暂无可勾选的其他空间成员`)
        }
      } else {
        const ownAgentIds = new Set(myAgents.map((a) => a.id))
        const matched = snapshot.ids.filter((id) => ownAgentIds.has(id))
        const foreignCount = snapshot.ids.length - matched.length
        const already = new Set(pickedAgents)
        const newlyPicked = matched.filter((id) => !already.has(id))
        if (newlyPicked.length > 0) {
          setPickedAgents((prev) => [...prev, ...newlyPicked])
          const notes: string[] = []
          if (matched.length - newlyPicked.length > 0) notes.push(`${matched.length - newlyPicked.length} 个已勾选`)
          if (foreignCount > 0) notes.push(`${foreignCount} 个他人归属已忽略`)
          setViewImportNotice(
            `已按 Agent 视图「${view.name}」静态勾选 ${newlyPicked.length} 个 Agent${
              notes.length > 0 ? `（${notes.join('，')}）` : ''
            }`,
          )
        } else if (matched.length > 0) {
          setViewImportNotice(
            `Agent 视图「${view.name}」中归属你的 ${matched.length} 个 Agent 已全部勾选${
              foreignCount > 0 ? `（${foreignCount} 个他人归属已忽略）` : ''
            }`,
          )
        } else if (foreignCount > 0) {
          setViewImportNotice(`Agent 视图「${view.name}」中命中的 ${foreignCount} 个 Agent 均非本人归属，无法拉入`)
        } else {
          setViewImportNotice(`Agent 视图「${view.name}」当前暂无匹配的 Agent`)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImportingViewKey(null)
    }
  }

  const toggleItem = (list: string[], setList: (next: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  }

  const needle = search.trim().toLowerCase()
  const filteredMembers = useMemo(() => {
    if (!needle) return members
    return members.filter(
      (m) => m.name.toLowerCase().includes(needle) || (m.email?.toLowerCase().includes(needle) ?? false),
    )
  }, [members, needle])

  const filteredAgents = useMemo(() => {
    const list = !needle
      ? myAgents.slice(0, 50)
      : myAgents.filter((a) => a.title.toLowerCase().includes(needle))
    return list
  }, [myAgents, needle])

  const defaultName = useMemo(() => {
    const pickedHumanNames = pickedMembers
      .map((id) => members.find((m) => m.id === id)?.name ?? '')
      .filter(Boolean)
    const pickedAgentNames = pickedAgents
      .map((id) => myAgents.find((a) => a.id === id)?.title ?? '')
      .filter(Boolean)
    if (pickedHumanNames.length === 0 && pickedAgentNames.length === 0) {
      if (channelKind === 'announcement') return '新公告频道'
      if (channelKind === 'forum') return '新论坛频道'
    }
    const humanNames = selfName ? [selfName, ...pickedHumanNames] : pickedHumanNames
    return buildDefaultChannelName(humanNames, pickedAgentNames)
  }, [channelKind, members, myAgents, pickedAgents, pickedMembers, selfName])

  const hasSelection = pickedMembers.length + pickedAgents.length > 0
  const effectiveName = customName.trim() || defaultName
  const canCreate = channelKind !== 'channel' || hasSelection

  const submit = async () => {
    if (!canCreate || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const detail = await createChannel({
        name: effectiveName,
        kind: channelKind,
        accessMode,
        memberAccountIds: pickedMembers,
        agentIds: pickedAgents,
        ...(pickedAgents.length > 0 ? { agentContextMode } : {}),
      })
      onCreated(detail.channel.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="biu-float-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="新建聊天"
      data-testid="create-channel-dialog"
    >
      <div
        className="biu-float scfg-float !w-[min(480px,calc(100vw-32px))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="biu-float-head scfg-head">
          <h2 className="biu-float-title scfg-title">新建聊天</h2>
          <button
            type="button"
            className="biu-float-close"
            title="关闭"
            aria-label="关闭"
            onClick={onClose}
          >
            <XMarkIcon className="size-4 shrink-0" />
          </button>
        </div>

        <div className="scfg-body">
          {error ? (
            <div className="scfg-error" role="alert">
              {error}
            </div>
          ) : null}
          {viewImportNotice ? (
            <div
              className="mb-2 rounded-[9px] bg-emerald-500/12 px-2.5 py-1.5 text-[12px] text-emerald-400"
              data-testid="create-channel-view-import-notice"
            >
              {viewImportNotice}
            </div>
          ) : null}

          <div className="scfg-sections">
            <div className="scfg-section">
              <div className="flex gap-1.5" role="radiogroup" aria-label="频道模式">
                <Button
                  variant={channelKind === 'channel' ? 'default' : 'secondary'}
                  className="h-8 flex-1 text-[12px]"
                  data-testid="create-channel-kind-channel"
                  onClick={() => setChannelKind('channel')}
                >
                  <HashtagIcon className="size-3.5" />
                  <span>普通群聊</span>
                </Button>
                <Button
                  variant={channelKind === 'announcement' ? 'default' : 'secondary'}
                  className="h-8 flex-1 text-[12px]"
                  data-testid="create-channel-kind-announcement"
                  onClick={() => setChannelKind('announcement')}
                >
                  <MegaphoneIcon className="size-3.5" />
                  <span>公告</span>
                </Button>
                <Button
                  variant={channelKind === 'forum' ? 'default' : 'secondary'}
                  className="h-8 flex-1 text-[12px]"
                  data-testid="create-channel-kind-forum"
                  onClick={() => setChannelKind('forum')}
                >
                  <RectangleStackIcon className="size-3.5" />
                  <span>论坛</span>
                </Button>
              </div>
              <span className="scfg-hint">
                {channelKind === 'announcement'
                  ? '仅群主或管理员可发布顶层公告，成员可表情回应或在单条公告下展开讨论串。'
                  : channelKind === 'forum'
                    ? '按独立帖子分话题讨论，支持标题、标签与解决状态，Agent 上下文按帖隔离。'
                    : '实时流式对话，支持 @Agent 协作与消息讨论串。'}
              </span>

              {channelKind !== 'channel' ? (
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={channelKind === 'announcement' ? '频道名称（如：产品发版公告）…' : '频道名称（如：需求评审与讨论）…'}
                  data-testid="create-channel-name"
                  className="scfg-input"
                  maxLength={80}
                />
              ) : null}

              <div className="relative flex items-center">
                <MagnifyingGlassIcon
                  className="pointer-events-none absolute left-2.5 size-4 text-(--biu-color-icon)"
                  aria-hidden
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索空间成员或我的 Agent…"
                  autoFocus
                  data-testid="create-channel-search"
                  className="scfg-input !pl-8 !pr-8"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && search) {
                      e.stopPropagation()
                      setSearch('')
                    }
                  }}
                />
                {search ? (
                  <button
                    type="button"
                    className="absolute right-2 grid size-5 cursor-pointer place-items-center rounded border-0 bg-transparent p-0 text-(--biu-color-text-subtle) hover:text-(--biu-color-text)"
                    aria-label="清空搜索"
                    onClick={() => setSearch('')}
                  >
                    <XMarkIcon className="size-3.5" />
                  </button>
                ) : null}
              </div>

              <div className="flex gap-2">
                <Button
                  variant={accessMode === 'private' ? 'default' : 'secondary'}
                  className="h-8 flex-1 text-[12px]"
                  onClick={() => setAccessMode('private')}
                >
                  <LockClosedIcon className="size-3.5" />
                  <span>私密邀请</span>
                </Button>
                <Button
                  variant={accessMode === 'workspace' ? 'default' : 'secondary'}
                  className="h-8 flex-1 text-[12px]"
                  onClick={() => setAccessMode('workspace')}
                >
                  <HashtagIcon className="size-3.5" />
                  <span>空间公开</span>
                </Button>
              </div>
            </div>

            {members.length > 0 ? (
              <div className="scfg-section">
                <div className="scfg-tools-head">
                  <span className="scfg-label">邀请空间成员</span>
                  <span className="scfg-hint">已选 {pickedMembers.length} 人</span>
                </div>
                {memberViews.length > 0 ? (
                  <div className="mb-1.5 flex flex-wrap items-center gap-1" data-testid="create-import-member-views">
                    <span className="text-[11px] text-(--biu-color-text-subtle)">从成员视图导入（静态）：</span>
                    {memberViews.map((v) => {
                      const busyThis = importingViewKey === `account:${v.id}`
                      return (
                        <button
                          key={v.id}
                          type="button"
                          disabled={importingViewKey !== null}
                          data-testid={`create-import-member-view-${v.id}`}
                          title={`仅静态勾选视图「${v.name}」当前成员，不动态绑定视图`}
                          className="inline-flex h-6 cursor-pointer items-center rounded-[6px] border border-(--biu-color-border) bg-(--biu-color-bg-subtle) px-2 text-[11px] text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text) disabled:opacity-50"
                          onClick={() => void handleImportFromView('account', v)}
                        >
                          <span className="max-w-[140px] truncate">{busyThis ? '导入中…' : v.name}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                {filteredMembers.length === 0 ? (
                  <div className="scfg-hint">没有匹配的空间成员</div>
                ) : (
                  <ul className="scfg-tools-list max-h-36 overflow-y-auto">
                    {filteredMembers.map((m) => (
                      <li key={m.id} className="scfg-tool-row is-active">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            className="scfg-tool-check"
                            checked={pickedMembers.includes(m.id)}
                            onChange={() => toggleItem(pickedMembers, setPickedMembers, m.id)}
                          />
                          {m.avatar ? (
                            <img src={m.avatar} alt="" className="size-4.5 shrink-0 rounded-full object-cover" />
                          ) : (
                            <AiAvatar seed={m.id} size={18} className="shrink-0 rounded-full" />
                          )}
                          <span className="scfg-tool-name !font-sans">{m.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {myAgents.length > 0 ? (
              <div className="scfg-section">
                <div className="scfg-tools-head">
                  <span className="scfg-label">拉入我的 Agent</span>
                  <span className="scfg-hint">仅归属人可拉入 · 已选 {pickedAgents.length}</span>
                </div>
                {agentViews.length > 0 ? (
                  <div className="mb-1.5 flex flex-wrap items-center gap-1" data-testid="create-import-agent-views">
                    <span className="text-[11px] text-(--biu-color-text-subtle)">从 Agent 视图导入（静态）：</span>
                    {agentViews.map((v) => {
                      const busyThis = importingViewKey === `agent:${v.id}`
                      return (
                        <button
                          key={v.id}
                          type="button"
                          disabled={importingViewKey !== null}
                          data-testid={`create-import-agent-view-${v.id}`}
                          title={`仅静态勾选视图「${v.name}」内归属你的 Agent，不动态绑定视图`}
                          className="inline-flex h-6 cursor-pointer items-center rounded-[6px] border border-(--biu-color-border) bg-(--biu-color-bg-subtle) px-2 text-[11px] text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text) disabled:opacity-50"
                          onClick={() => void handleImportFromView('agent', v)}
                        >
                          <span className="max-w-[140px] truncate">{busyThis ? '导入中…' : v.name}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                {filteredAgents.length === 0 ? (
                  <div className="scfg-hint">没有匹配的 Agent</div>
                ) : (
                  <ul className="scfg-tools-list max-h-44 overflow-y-auto">
                    {filteredAgents.map((agent) => (
                      <li key={agent.id} className="scfg-tool-row is-active">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            className="scfg-tool-check"
                            checked={pickedAgents.includes(agent.id)}
                            onChange={() => toggleItem(pickedAgents, setPickedAgents, agent.id)}
                          />
                          <SidebarMascot
                            size={18}
                            sessionId={agent.id}
                            identity={resolveSessionMascot(agent.id, agent.mascot)}
                            animate={false}
                            title=""
                          />
                          <span className="scfg-tool-name !font-sans">{agent.title}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {pickedAgents.length > 0 ? (
                  <div className="scfg-field mt-2" data-testid="create-channel-agent-context-mode">
                    <div className="flex gap-2">
                      <Button
                        variant={agentContextMode === 'summary' ? 'default' : 'secondary'}
                        className="h-7 flex-1 text-[12px]"
                        data-testid="create-context-mode-summary"
                        onClick={() => setAgentContextMode('summary')}
                      >
                        同步工作摘要（只读）
                      </Button>
                      <Button
                        variant={agentContextMode === 'isolated' ? 'default' : 'secondary'}
                        className="h-7 flex-1 text-[12px]"
                        data-testid="create-context-mode-isolated"
                        onClick={() => setAgentContextMode('isolated')}
                      >
                        仅群聊隔离
                      </Button>
                    </div>
                    <span className="scfg-hint">
                      {agentContextMode === 'summary'
                        ? '单向只读投影项目与近期工作要点，群聊对话绝不写回你的 1v1 主工作台。'
                        : '仅看当前聊天消息，不带入 1v1 主工作台背景。'}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3 pt-3">
              <span
                className="scfg-hint min-w-0 truncate"
                data-testid="create-channel-default-name"
                title={canCreate ? `默认名称：${effectiveName}` : undefined}
              >
                {canCreate ? `${customName.trim() ? '名称：' : '默认名称：'}${effectiveName}` : '请选择成员或 Agent'}
              </span>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" onClick={onClose}>
                  取消
                </Button>
                <Button
                  data-testid="create-channel-submit"
                  disabled={!canCreate || submitting}
                  onClick={() => void submit()}
                >
                  {submitting
                    ? '创建中…'
                    : channelKind === 'announcement'
                      ? '创建公告'
                      : channelKind === 'forum'
                        ? '创建论坛'
                        : '创建聊天'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
