import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftIcon,
  ArrowRightStartOnRectangleIcon,
  AtSymbolIcon,
  BellIcon,
  BellSlashIcon,
  BoltIcon,
  BookmarkIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PaperAirplaneIcon,
  PlusIcon,
  ArrowPathIcon,
  SparklesIcon,
  StarIcon,
  TrashIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { apiFetch } from '@biu/biu-ui/api-client'
import { readStorageString, writeStorageString } from '@biu/biu-ui/client-storage'
import { getWorkspaceEndpoint } from '@biu/biu-ui/workspace-transport'
import { pickPreview } from '@biu/core-pick/web'
import { SidebarMascot, resolveSessionMascot } from '@biu/public-mascot'
import type { bindSessionView } from '@biu/web-session-view'
import type {
  ChannelAgentActivity,
  ChannelAgentContextMode,
  ChannelMemberView,
  ChannelMention,
  ChannelMessageView,
  ChannelSavedMessageView,
  ChannelSearchHit,
  ChannelSummary,
  ChannelWebhookView,
} from '../shared/channel-types.ts'
import {
  addChannelMember,
  createChannelWebhook,
  deleteChannel,
  deleteChannelWebhook,
  leaveChannel,
  loadChannelWebhooks,
  removeChannelMember,
  rotateChannelWebhook,
  syncChannelToAgent,
  testChannelWebhook,
  updateChannelAgentContextMode,
  updateChannelPreferences,
  updateChannelWebhook,
} from './channel-store.ts'
import { MarkdownBody } from './markdown.tsx'

export type ChannelFloatingTab = 'roster' | 'search' | 'pins' | 'saved' | 'summary' | 'manage' | 'agent-card'

const PIN_STORAGE_KEY = 'channel.floatingSidebar.pinned'
const HOVER_CLOSE_DELAY_MS = 160
const MAX_RAIL_AVATARS = 6

/**
 * 视觉尺寸补偿常量：
 * StaticMascotMark 内置 viewBox（-15 -15 259 259）带有约 22% 留白且为异形轮廓，
 * 人类头像为满幅正圆，因此给 Agent 放大约 1.25x 放入同一光学格内，使两者视觉体量完全等大。
 */
const RAIL_SLOT_PX = 24
const RAIL_HUMAN_PX = 22
const RAIL_AGENT_PX = 28

const ROW_SLOT_PX = 28
const ROW_HUMAN_PX = 24
const ROW_AGENT_PX = 30

function readInitialPinned(): boolean {
  try {
    return readStorageString(PIN_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writePinned(pinned: boolean) {
  try {
    writeStorageString(PIN_STORAGE_KEY, pinned ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function RosterAvatar({ avatar, seed, size = ROW_HUMAN_PX }: { avatar?: string; seed: string; size?: number }) {
  const clean = avatar?.trim()
  if (clean) {
    return (
      <img
        src={clean}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return <AiAvatar seed={seed || 'biu-ai'} size={size} className="shrink-0 rounded-full" />
}

function formatCompactTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const hhmm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (sameDay) return hhmm
  return `${d.getMonth() + 1}/${d.getDate()} ${hhmm}`
}

export type ChannelFloatingSummaryState = {
  loading: boolean
  summary: string
  messageCount: number
  scopeLabel: string
  error: string
}

export type ChannelFloatingSidebarProps = {
  channelId?: string
  channel: ChannelSummary | undefined
  isDm: boolean
  members: ChannelMemberView[]
  activities: ChannelAgentActivity[]
  myAccountId: string
  canManageMembers: boolean
  pinnedMessageCount: number
  useSessionView?: ReturnType<typeof bindSessionView>
  /** 外部指定的活跃功能 Tab（null 表示由悬停/图钉自然控制成员面板） */
  activeTab?: ChannelFloatingTab | null
  onChangeTab?: (tab: ChannelFloatingTab | null) => void
  /** 他人 Agent 只读名片（原地展示在右侧悬浮面板内） */
  inspectedAgentCard?: ChannelMemberView | null
  onCloseAgentCard?: () => void
  resolveAvatar: (accountId?: string, serverAvatar?: string) => string | undefined
  isOnline: (accountId?: string) => boolean
  onMention: (mention: ChannelMention) => void
  onAgentClick: (agentId: string) => void
  onOpenDm: (accountId: string) => void
  onOpenManageMembers?: () => void
  onLeftChannel?: () => void
  // 聊天记录与搜索（面板内原地展示）
  messages?: ChannelMessageView[]
  searchQuery?: string
  onSearchQueryChange?: (q: string) => void
  searchSenderId?: string
  onSearchSenderChange?: (senderId: string) => void
  searchHits?: ChannelSearchHit[]
  searching?: boolean
  onJumpToMessage?: (msgId: string) => void
  // 置顶消息（面板内原地展示）
  pinnedMessages?: ChannelMessageView[]
  onOpenPins?: () => void
  onUnpinMessage?: (msgId: string) => void
  // 收藏消息（面板内原地展示）
  savedMessages?: ChannelSavedMessageView[]
  onOpenSaved?: () => void
  onJumpToSavedMessage?: (item: ChannelSavedMessageView) => void
  onUnsaveMessage?: (item: ChannelSavedMessageView) => void
  // AI 总结（面板内原地展示）
  summaryState?: ChannelFloatingSummaryState
  onSummarize?: (unreadOnly?: boolean) => void
  onSaveSummaryAsPage?: () => void
  // 偏好与外部回调
  onToggleSearch?: () => void
  onToggleChannelPinned: () => void
  onToggleChannelMuted: () => void
}

const PRIMARY_TABS: Array<{ id: 'roster' | 'search' | 'pins' | 'saved' | 'summary'; label: string; testId: string }> = [
  { id: 'roster', label: '成员', testId: 'channel-quick-roster' },
  { id: 'search', label: '聊天', testId: 'channel-quick-search' },
  { id: 'pins', label: '置顶', testId: 'channel-quick-pins' },
  { id: 'saved', label: '收藏', testId: 'channel-quick-saved' },
  { id: 'summary', label: '总结', testId: 'channel-quick-summarize' },
]

/**
 * 聊天舞台右侧悬浮控制面板（Apple 分段控件 + BIU 全局浮窗语言）：
 * - 收起态：贴右边缘的磨砂头像胶囊轨，Agent 与人类头像按光学尺寸严格等大对齐；
 * - 展开态：无刺眼分割线、无中心遮罩弹窗；成员 / 搜索 / 置顶 / 收藏 / 总结 / 管理 / Agent 名片全部原地承接。
 */
export const ChannelFloatingSidebar = memo(function ChannelFloatingSidebar({
  channelId: channelIdProp,
  channel,
  isDm,
  members,
  activities,
  myAccountId,
  canManageMembers,
  pinnedMessageCount,
  useSessionView,
  activeTab: controlledTab,
  onChangeTab,
  inspectedAgentCard,
  onCloseAgentCard,
  resolveAvatar,
  isOnline,
  onMention,
  onAgentClick,
  onOpenDm,
  onOpenManageMembers,
  onLeftChannel,
  messages = [],
  searchQuery = '',
  onSearchQueryChange,
  searchSenderId = '',
  onSearchSenderChange,
  searchHits = [],
  searching = false,
  onJumpToMessage,
  pinnedMessages = [],
  onOpenPins,
  onUnpinMessage,
  savedMessages = [],
  onOpenSaved,
  onJumpToSavedMessage,
  onUnsaveMessage,
  summaryState,
  onSummarize,
  onSaveSummaryAsPage,
  onToggleSearch,
  onToggleChannelPinned,
  onToggleChannelMuted,
}: ChannelFloatingSidebarProps) {
  const channelId = channelIdProp || channel?.id || ''
  const [pinned, setPinned] = useState<boolean>(readInitialPinned)
  const [hovered, setHovered] = useState(false)
  const [internalTab, setInternalTab] = useState<ChannelFloatingTab>('roster')
  const [rosterQuery, setRosterQuery] = useState('')
  const [summaryUnreadOnly, setSummaryUnreadOnly] = useState(false)
  const [copiedSummary, setCopiedSummary] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 管理子视图状态（全部原地内联，不再弹出居中遮罩弹窗）
  const allSessions = useSessionView ? useSessionView((s) => s.sessions) : []
  const [wsMembers, setWsMembers] = useState<Array<{ id: string; name: string; avatar?: string }>>([])
  const [manageError, setManageError] = useState('')
  const [syncNotice, setSyncNotice] = useState('')
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null)
  const [savingPref, setSavingPref] = useState(false)
  const [confirmDisband, setConfirmDisband] = useState(false)
  const [disbanding, setDisbanding] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [addAgentOpen, setAddAgentOpen] = useState(false)
  const [agentSearch, setAgentSearch] = useState('')

  // Webhook 消息源管理状态（原地内嵌在管理子视图中）
  const [webhooks, setWebhooks] = useState<ChannelWebhookView[]>([])
  const [webhooksLoading, setWebhooksLoading] = useState(false)
  const [addWebhookOpen, setAddWebhookOpen] = useState(false)
  const [newWebhookName, setNewWebhookName] = useState('')
  const [newWebhookAgentId, setNewWebhookAgentId] = useState('')
  const [creatingWebhook, setCreatingWebhook] = useState(false)
  const [busyWebhookId, setBusyWebhookId] = useState<string | null>(null)
  const [copiedWebhookKey, setCopiedWebhookKey] = useState<string | null>(null)

  const currentTab: ChannelFloatingTab = controlledTab ?? internalTab
  const isToolTab = currentTab !== 'roster'

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer])

  useEffect(() => {
    setSummaryUnreadOnly(false)
    setRosterQuery('')
    setWebhooks([])
    setAddWebhookOpen(false)
    setNewWebhookName('')
    setNewWebhookAgentId('')
  }, [channelId])

  // 打开管理视图时拉取空间成员列表与本频道 Webhook 消息源
  useEffect(() => {
    if (currentTab !== 'manage') return
    let cancelled = false
    const params = new URLSearchParams({ path: '/workspace-members', limit: '200', columns: 'title,email,avatar' })
    void apiFetch(`/api/db/list?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return
        const rows = Array.isArray((body as { items?: unknown[] } | null)?.items)
          ? ((body as { items: Array<Record<string, unknown>> }).items)
          : []
        setWsMembers(
          rows
            .map((r) => ({
              id: String(r.id ?? '').trim(),
              name: String(r.title ?? r.email ?? r.id ?? '').trim(),
              avatar: typeof r.avatar === 'string' ? r.avatar.trim() : undefined,
            }))
            .filter((r) => r.id),
        )
      })
      .catch(() => undefined)
    if (!isDm && channelId) {
      setWebhooksLoading(true)
      void loadChannelWebhooks(channelId)
        .then((list) => {
          if (!cancelled) setWebhooks(list)
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setWebhooksLoading(false)
        })
    }
    return () => {
      cancelled = true
    }
  }, [channelId, currentTab, isDm])

  const resolveWebhookFullUrl = useCallback((relUrl: string) => {
    if (!relUrl) return ''
    if (/^https?:\/\//i.test(relUrl)) return relUrl
    const origin =
      getWorkspaceEndpoint().origin ||
      (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '')
    return origin ? `${origin.replace(/\/+$/, '')}${relUrl}` : relUrl
  }, [])

  const copyWebhookText = useCallback((key: string, text: string) => {
    void navigator.clipboard?.writeText(text)
    setCopiedWebhookKey(key)
    window.setTimeout(() => {
      setCopiedWebhookKey((cur) => (cur === key ? null : cur))
    }, 1500)
  }, [])

  const handleCreateWebhook = async () => {
    const cleanName = newWebhookName.trim()
    if (!channelId || !cleanName || creatingWebhook) return
    setCreatingWebhook(true)
    setManageError('')
    try {
      const created = await createChannelWebhook(channelId, {
        name: cleanName,
        ...(newWebhookAgentId ? { autoTriggerAgentId: newWebhookAgentId } : {}),
      })
      setWebhooks((prev) => [created, ...prev])
      setNewWebhookName('')
      setNewWebhookAgentId('')
      setAddWebhookOpen(false)
      setSyncNotice(`已生成 Webhook「${created.name}」，可复制链接给外部系统推送消息。`)
    } catch (err) {
      setManageError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreatingWebhook(false)
    }
  }

  const handleToggleWebhookEnabled = async (wh: ChannelWebhookView) => {
    if (!channelId || busyWebhookId) return
    setBusyWebhookId(wh.id)
    setManageError('')
    try {
      const updated = await updateChannelWebhook(channelId, wh.id, { enabled: !wh.enabled })
      setWebhooks((prev) => prev.map((item) => (item.id === wh.id ? updated : item)))
    } catch (err) {
      setManageError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyWebhookId(null)
    }
  }

  const handleUpdateWebhookAgent = async (wh: ChannelWebhookView, agentId: string) => {
    if (!channelId || busyWebhookId) return
    setBusyWebhookId(wh.id)
    setManageError('')
    try {
      const updated = await updateChannelWebhook(channelId, wh.id, { autoTriggerAgentId: agentId })
      setWebhooks((prev) => prev.map((item) => (item.id === wh.id ? updated : item)))
    } catch (err) {
      setManageError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyWebhookId(null)
    }
  }

  const handleRotateWebhook = async (wh: ChannelWebhookView) => {
    if (!channelId || busyWebhookId) return
    setBusyWebhookId(wh.id)
    setManageError('')
    try {
      const updated = await rotateChannelWebhook(channelId, wh.id)
      setWebhooks((prev) => prev.map((item) => (item.id === wh.id ? updated : item)))
      setSyncNotice(`已重置「${wh.name}」的 Webhook 密钥，旧链接已失效。`)
    } catch (err) {
      setManageError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyWebhookId(null)
    }
  }

  const handleTestWebhook = async (wh: ChannelWebhookView) => {
    if (!channelId || busyWebhookId) return
    setBusyWebhookId(wh.id)
    setManageError('')
    try {
      await testChannelWebhook(channelId, wh.id)
      setSyncNotice(`已通过「${wh.name}」发送一条测试消息到当前频道。`)
    } catch (err) {
      setManageError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyWebhookId(null)
    }
  }

  const handleDeleteWebhook = async (wh: ChannelWebhookView) => {
    if (!channelId || busyWebhookId) return
    setBusyWebhookId(wh.id)
    setManageError('')
    try {
      await deleteChannelWebhook(channelId, wh.id)
      setWebhooks((prev) => prev.filter((item) => item.id !== wh.id))
    } catch (err) {
      setManageError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyWebhookId(null)
    }
  }

  const handleMouseEnter = useCallback(() => {
    clearCloseTimer()
    setHovered(true)
  }, [clearCloseTimer])

  const handleMouseLeave = useCallback(() => {
    if (isToolTab) return
    clearCloseTimer()
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      setHovered(false)
    }, HOVER_CLOSE_DELAY_MS)
  }, [clearCloseTimer, isToolTab])

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev
      writePinned(next)
      if (!next) {
        setHovered(false)
        setInternalTab('roster')
        onChangeTab?.(null)
        onCloseAgentCard?.()
      }
      return next
    })
  }, [onChangeTab, onCloseAgentCard])

  const selectTab = useCallback(
    (tab: ChannelFloatingTab) => {
      clearCloseTimer()
      setInternalTab(tab)
      if (tab !== 'agent-card') onCloseAgentCard?.()
      if (tab === 'roster') {
        setConfirmDisband(false)
        onChangeTab?.(null)
      } else {
        onChangeTab?.(tab)
        if (tab === 'pins') onOpenPins?.()
        else if (tab === 'saved') onOpenSaved?.()
        else if (tab === 'search') onToggleSearch?.()
      }
    },
    [clearCloseTimer, onChangeTab, onCloseAgentCard, onOpenPins, onOpenSaved, onToggleSearch],
  )

  const openManageInPlace = useCallback(
    (opts?: { expandAddMember?: boolean; expandAddAgent?: boolean }) => {
      setManageError('')
      setSyncNotice('')
      setConfirmDisband(false)
      if (opts?.expandAddMember) setAddMemberOpen(true)
      if (opts?.expandAddAgent) setAddAgentOpen(true)
      onOpenManageMembers?.()
      selectTab('manage')
    },
    [onOpenManageMembers, selectTab],
  )

  const closeToolTab = useCallback(() => {
    setInternalTab('roster')
    setConfirmDisband(false)
    onChangeTab?.(null)
    onCloseAgentCard?.()
    if (!pinned) setHovered(false)
  }, [onChangeTab, onCloseAgentCard, pinned])

  useEffect(() => {
    if (!isToolTab) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeToolTab()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeToolTab, isToolTab])

  const busyAgentIds = useMemo(
    () => new Set(activities.map((a) => a.agentId)),
    [activities],
  )

  const agentMembers = useMemo(
    () =>
      members
        .filter((m) => m.memberType === 'agent')
        .sort((a, b) => {
          const aBusy = busyAgentIds.has(a.memberId) ? 1 : 0
          const bBusy = busyAgentIds.has(b.memberId) ? 1 : 0
          if (aBusy !== bBusy) return bBusy - aBusy
          return a.name.localeCompare(b.name, 'zh-CN')
        }),
    [busyAgentIds, members],
  )

  const humanMembers = useMemo(
    () =>
      members
        .filter((m) => m.memberType === 'account')
        .sort((a, b) => {
          const aOn = isOnline(a.memberId) ? 1 : 0
          const bOn = isOnline(b.memberId) ? 1 : 0
          if (aOn !== bOn) return bOn - aOn
          const aOwner = a.role === 'owner' ? 1 : 0
          const bOwner = b.role === 'owner' ? 1 : 0
          if (aOwner !== bOwner) return bOwner - aOwner
          return a.name.localeCompare(b.name, 'zh-CN')
        }),
    [isOnline, members],
  )

  const onlineCount = useMemo(
    () => humanMembers.filter((m) => isOnline(m.memberId)).length,
    [humanMembers, isOnline],
  )

  const railItems = useMemo(() => {
    const combined: ChannelMemberView[] = [...humanMembers, ...agentMembers]
    return {
      visible: combined.slice(0, MAX_RAIL_AVATARS),
      overflow: Math.max(0, combined.length - MAX_RAIL_AVATARS),
    }
  }, [agentMembers, humanMembers])

  const filteredHumanMembers = useMemo(() => {
    const q = rosterQuery.trim().toLowerCase()
    if (!q) return humanMembers
    return humanMembers.filter((m) => m.name.toLowerCase().includes(q))
  }, [humanMembers, rosterQuery])

  const filteredAgentMembers = useMemo(() => {
    const q = rosterQuery.trim().toLowerCase()
    if (!q) return agentMembers
    return agentMembers.filter(
      (ag) => ag.name.toLowerCase().includes(q) || (ag.ownerName ?? '').toLowerCase().includes(q),
    )
  }, [agentMembers, rosterQuery])

  const recentChatMessages = useMemo(() => {
    const filtered = messages.filter((m) => {
      if (m.deletedAt) return false
      if (searchSenderId && m.senderId !== searchSenderId) return false
      return true
    })
    return filtered.slice(-80).reverse()
  }, [messages, searchSenderId])

  const inHumans = useMemo(() => new Set(humanMembers.map((m) => m.memberId)), [humanMembers])
  const inAgents = useMemo(() => new Set(agentMembers.map((m) => m.memberId)), [agentMembers])
  const addableHumans = useMemo(() => wsMembers.filter((m) => !inHumans.has(m.id)), [inHumans, wsMembers])
  const filteredAddableHumans = useMemo(() => {
    const q = memberSearch.trim().toLowerCase()
    if (!q) return addableHumans
    return addableHumans.filter((m) => m.name.toLowerCase().includes(q))
  }, [addableHumans, memberSearch])

  const myAddableAgents = useMemo(
    () =>
      allSessions.filter(
        (s) => !inAgents.has(s.id) && (!myAccountId || myAccountId === 'local' || !s.createdBy || s.createdBy === myAccountId),
      ),
    [allSessions, inAgents, myAccountId],
  )
  const filteredAddableAgents = useMemo(() => {
    const q = agentSearch.trim().toLowerCase()
    if (!q) return myAddableAgents
    return myAddableAgents.filter((a) => a.title.toLowerCase().includes(q))
  }, [agentSearch, myAddableAgents])

  const canLeaveGroup = !isDm && Boolean(channel) && channel!.createdBy !== myAccountId && myAccountId !== 'local'
  const canDisbandGroup = !isDm && canManageMembers

  const handleAdd = async (type: 'account' | 'agent', id: string) => {
    if (!channelId) return
    setManageError('')
    try {
      await addChannelMember(channelId, type, id)
    } catch (err) {
      setManageError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleRemove = async (type: 'account' | 'agent', id: string) => {
    if (!channelId) return
    setManageError('')
    try {
      await removeChannelMember(channelId, type, id)
    } catch (err) {
      setManageError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleToggleContextMode = async (agentId: string, current?: ChannelAgentContextMode) => {
    if (!channelId) return
    setManageError('')
    setBusyAgentId(agentId)
    try {
      const next: ChannelAgentContextMode = current === 'isolated' ? 'summary' : 'isolated'
      await updateChannelAgentContextMode(channelId, agentId, next)
    } catch (err) {
      setManageError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyAgentId(null)
    }
  }

  const handleSyncAgent = async (agentId: string, agentName: string) => {
    if (!channelId) return
    setManageError('')
    setSyncNotice('')
    setBusyAgentId(agentId)
    try {
      await syncChannelToAgent(channelId, agentId)
      setSyncNotice(`已将近期聊天结论同步到「${agentName}」的 1v1 主工作台。`)
    } catch (err) {
      setManageError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyAgentId(null)
    }
  }

  const open = pinned || hovered || Boolean(controlledTab) || Boolean(inspectedAgentCard)
  if (!open && members.length === 0) return null

  const isSubView = currentTab === 'manage' || currentTab === 'agent-card'
  const channelPath = channelId ? `/channels/${channelId}` : undefined

  return (
    <aside
      className="pointer-events-none absolute top-3 right-3 bottom-24 z-15 flex items-start justify-end"
      data-testid="channel-floating-sidebar"
      data-open={open ? 'true' : 'false'}
      data-pinned={pinned ? 'true' : 'false'}
      data-tab={currentTab}
      aria-label="聊天成员与快捷面板"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {open ? (
        <div
          className={`pointer-events-auto flex max-h-full flex-col overflow-hidden rounded-[14px] border border-(--biu-color-border-popover) bg-(--biu-color-bg-popover)/95 shadow-(--biu-shadow-popover) backdrop-blur-xl transition-[width] duration-150 ${
            isToolTab ? 'w-[328px]' : 'w-[280px]'
          }`}
          data-testid="channel-floating-panel"
        >
          {/* 顶部栏：主视图用 Apple 分段控件；管理/名片子视图用清爽返回头 */}
          {isSubView ? (
            <div className="flex shrink-0 items-center justify-between gap-2 px-2.5 pt-2.5 pb-1.5">
              <button
                type="button"
                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 text-[12px] font-medium text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)"
                onClick={() => selectTab('roster')}
              >
                <ArrowLeftIcon className="size-3.5 shrink-0" />
                <span>{currentTab === 'manage' ? '成员与设置' : 'Agent 名片'}</span>
              </button>
              <button
                type="button"
                data-testid="channel-floating-close"
                title="收起面板"
                aria-label="收起面板"
                className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-(--biu-color-text-subtle) transition-colors hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)"
                onClick={closeToolTab}
              >
                <XMarkIcon className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-1.5 px-2.5 pt-2.5 pb-1.5">
              <div
                className="grid min-w-0 flex-1 grid-cols-5 rounded-[9px] bg-(--biu-color-bg-muted)/75 p-0.5"
                role="tablist"
                aria-label="聊天快捷视图"
              >
                {PRIMARY_TABS.map((tab) => {
                  const active = currentTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      data-testid={tab.testId}
                      className={`relative flex h-6 cursor-pointer items-center justify-center rounded-[7px] border-0 px-1 text-[11.5px] transition-all ${
                        active
                          ? 'bg-(--biu-color-bg-elevated) font-medium text-(--biu-color-text) shadow-xs'
                          : 'bg-transparent text-(--biu-color-text-muted) hover:text-(--biu-color-text)'
                      }`}
                      onClick={() => selectTab(tab.id)}
                    >
                      <span className="truncate">{tab.label}</span>
                      {tab.id === 'pins' && pinnedMessageCount > 0 ? (
                        <span className="ml-0.5 text-[10px] text-(--biu-color-text-subtle) tabular-nums">
                          {pinnedMessageCount}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                data-testid="channel-floating-pin"
                aria-pressed={pinned}
                title={pinned ? '取消固定右侧面板' : '固定右侧面板'}
                aria-label={pinned ? '取消固定右侧面板' : '固定右侧面板'}
                className={`inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 transition-colors ${
                  pinned
                    ? 'bg-(--biu-color-bg-muted) text-(--biu-color-icon-active)'
                    : 'bg-transparent text-(--biu-color-text-subtle) hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)'
                }`}
                onClick={togglePin}
              >
                <MapPinIcon className="size-3.5" />
              </button>
              {isToolTab ? (
                <button
                  type="button"
                  data-testid="channel-floating-close"
                  title="收起面板"
                  aria-label="收起面板"
                  className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-(--biu-color-text-subtle) transition-colors hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)"
                  onClick={closeToolTab}
                >
                  <XMarkIcon className="size-3.5" />
                </button>
              ) : null}
            </div>
          )}

          {/* === Tab 1: 成员与 Agent === */}
          {currentTab === 'roster' ? (
            <>
              <div className="flex shrink-0 items-center justify-between px-3.5 py-1">
                <span className="text-[11px] font-medium text-(--biu-color-text-subtle) tabular-nums">
                  {humanMembers.length} 人{onlineCount > 0 ? `（${onlineCount} 在线）` : ''}
                  {agentMembers.length > 0 ? ` · ${agentMembers.length} Agent` : ''}
                </span>
                {!isDm ? (
                  <button
                    type="button"
                    data-testid="channel-floating-add"
                    title="添加成员或 Agent"
                    aria-label="添加成员或 Agent"
                    className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 text-[11px] font-medium text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)"
                    onClick={() => openManageInPlace({ expandAddMember: true })}
                  >
                    <UserPlusIcon className="size-3.5 shrink-0" />
                    <span>添加</span>
                  </button>
                ) : null}
              </div>

              <div className="shrink-0 px-2.5 pt-0.5 pb-1">
                <div className="relative flex items-center">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 size-3.5 text-(--biu-color-text-subtle)" />
                  <input
                    type="search"
                    value={rosterQuery}
                    placeholder="搜索成员或 Agent…"
                    aria-label="搜索成员或 Agent"
                    data-testid="channel-roster-search"
                    className="h-7 w-full rounded-[8px] border-0 bg-(--biu-color-bg-muted) pr-2.5 pl-8 text-[12px] text-(--biu-color-text) outline-none placeholder:text-(--biu-color-text-subtle) focus:ring-1 focus:ring-(--biu-color-icon-active)"
                    onChange={(e) => setRosterQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-1">
                {filteredHumanMembers.length === 0 && filteredAgentMembers.length === 0 && rosterQuery.trim() ? (
                  <div className="py-8 text-center text-[12px] text-(--biu-color-text-subtle)">
                    未找到匹配的成员或 Agent
                  </div>
                ) : null}

                {filteredHumanMembers.length > 0 ? (
                  <div data-testid="channel-roster-humans-section">
                    <div className="mb-1 px-2 text-[10.5px] font-medium tracking-wide text-(--biu-color-text-subtle)">
                      成员
                    </div>
                    <div className="space-y-0.5">
                      {filteredHumanMembers.map((member) => {
                        const online = isOnline(member.memberId)
                        const isMe = Boolean(myAccountId) && member.memberId === myAccountId
                        return (
                          <div
                            key={`account:${member.memberId}`}
                            data-testid={`channel-roster-member-${member.memberId}`}
                            data-biu-kind="member"
                            data-biu-id={member.memberId}
                            data-biu-label={member.name}
                            data-biu-path={`/workspace-members/${member.memberId}`}
                            className="group/row flex items-center gap-2 rounded-[9px] px-2 py-1.5 transition-colors hover:bg-(--biu-color-bg-popover-hover)"
                          >
                            <span
                              className="relative flex shrink-0 items-center justify-center"
                              style={{ width: ROW_SLOT_PX, height: ROW_SLOT_PX }}
                            >
                              <RosterAvatar
                                avatar={resolveAvatar(member.memberId, member.avatar)}
                                seed={member.memberId}
                                size={ROW_HUMAN_PX}
                              />
                              {online ? (
                                <span
                                  className="absolute right-0 bottom-0 size-2 rounded-full bg-emerald-500 ring-[1.5px] ring-(--biu-color-bg-popover)"
                                  title="在线"
                                />
                              ) : null}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-[13px] font-medium text-(--biu-color-text)">
                                  {member.name}
                                </span>
                                {isMe ? (
                                  <span className="shrink-0 text-[10.5px] text-(--biu-color-text-subtle)">我</span>
                                ) : null}
                                {!isDm && member.role === 'owner' ? (
                                  <span className="shrink-0 text-[10.5px] text-(--biu-color-text-subtle)">群主</span>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-(--biu-color-text-subtle)">
                                {online ? '在线' : '离线'}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                              <button
                                type="button"
                                data-testid={`channel-roster-mention-account-${member.memberId}`}
                                title={`@提及 ${member.name}`}
                                aria-label={`提及 ${member.name}`}
                                className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-muted) hover:text-(--biu-color-text)"
                                onClick={() => onMention({ kind: 'account', id: member.memberId, label: member.name })}
                              >
                                <AtSymbolIcon className="size-3.5" />
                              </button>
                              {!isDm && !isMe ? (
                                <button
                                  type="button"
                                  data-testid={`channel-roster-dm-${member.memberId}`}
                                  title={`给 ${member.name} 发私聊`}
                                  aria-label={`给 ${member.name} 发私聊`}
                                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-muted) hover:text-(--biu-color-text)"
                                  onClick={() => onOpenDm(member.memberId)}
                                >
                                  <ChatBubbleLeftEllipsisIcon className="size-3.5" />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {filteredAgentMembers.length > 0 ? (
                  <div data-testid="channel-roster-agents-section">
                    <div className="mb-1 flex items-center justify-between px-2 text-[10.5px] font-medium tracking-wide text-(--biu-color-text-subtle)">
                      <span>Agent</span>
                      {agentMembers.length > 1 ? (
                        <button
                          type="button"
                          className="cursor-pointer border-0 bg-transparent p-0 text-[11px] font-normal text-(--biu-color-text-muted) hover:text-(--biu-color-text)"
                          title="一键 @所有人 唤醒群内全部 Agent"
                          onClick={() => onMention({ kind: 'everyone', id: 'everyone', label: '所有人' })}
                        >
                          @所有人
                        </button>
                      ) : null}
                    </div>
                    <div className="space-y-0.5">
                      {filteredAgentMembers.map((ag) => {
                        const busy = busyAgentIds.has(ag.memberId)
                        return (
                          <div
                            key={`agent:${ag.memberId}`}
                            data-testid={`channel-roster-agent-${ag.memberId}`}
                            data-biu-kind="session"
                            data-biu-id={ag.memberId}
                            data-biu-label={ag.name}
                            className="group/row flex items-center gap-2 rounded-[9px] px-2 py-1.5 transition-colors hover:bg-(--biu-color-bg-popover-hover)"
                          >
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left"
                              title={ag.isOwn ? `进入 ${ag.name} 的 1v1 工作台` : `查看 ${ag.name} 名片`}
                              onClick={() => onAgentClick(ag.memberId)}
                            >
                              <span
                                className="relative flex shrink-0 items-center justify-center overflow-visible"
                                style={{ width: ROW_SLOT_PX, height: ROW_SLOT_PX }}
                              >
                                <SidebarMascot
                                  size={ROW_AGENT_PX}
                                  sessionId={ag.memberId}
                                  identity={resolveSessionMascot(ag.memberId, ag.mascot)}
                                  busy={busy}
                                  animate={false}
                                  className="shrink-0"
                                  title=""
                                />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-[13px] font-medium text-(--biu-color-text)">
                                    {ag.name}
                                  </span>
                                  {busy ? (
                                    <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] leading-none text-emerald-400">
                                      运行中
                                    </span>
                                  ) : null}
                                </div>
                                <div className="truncate text-[11px] text-(--biu-color-text-subtle)">
                                  {ag.ownerName ? `归属 ${ag.ownerName}` : 'Agent'}
                                  {ag.contextMode === 'isolated' ? ' · 隔离' : ''}
                                </div>
                              </div>
                            </button>
                            <button
                              type="button"
                              data-testid={`channel-roster-mention-agent-${ag.memberId}`}
                              title={`@提及 ${ag.name}`}
                              aria-label={`提及 ${ag.name}`}
                              className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-(--biu-color-text-muted) opacity-0 transition-opacity hover:bg-(--biu-color-bg-muted) hover:text-(--biu-color-text) group-hover/row:opacity-100 focus-visible:opacity-100"
                              onClick={() => onMention({ kind: 'agent', id: ag.memberId, label: ag.name })}
                            >
                              <AtSymbolIcon className="size-3.5" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* 底部极简控制条（无刺眼边框，柔表面底） */}
              <div className="mx-2 mt-1 mb-2 flex shrink-0 items-center justify-between gap-1 rounded-[10px] bg-(--biu-color-bg-muted)/45 px-1.5 py-1">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    data-testid="channel-floating-pref-pin"
                    title={channel?.pinned ? '取消置顶聊天' : '置顶聊天到侧栏顶部'}
                    className={`inline-flex h-6 cursor-pointer items-center gap-1 rounded-[7px] border-0 px-2 text-[11px] transition-colors ${
                      channel?.pinned
                        ? 'bg-(--biu-color-bg-elevated) font-medium text-(--biu-color-text) shadow-xs'
                        : 'bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)'
                    }`}
                    onClick={onToggleChannelPinned}
                  >
                    <BookmarkIcon className="size-3" />
                    <span>{channel?.pinned ? '已置顶' : '置顶会话'}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="channel-floating-pref-mute"
                    title={channel?.muted ? '取消免打扰' : '开启免打扰'}
                    className={`inline-flex h-6 cursor-pointer items-center gap-1 rounded-[7px] border-0 px-2 text-[11px] transition-colors ${
                      channel?.muted
                        ? 'bg-(--biu-color-bg-elevated) font-medium text-(--biu-color-text) shadow-xs'
                        : 'bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)'
                    }`}
                    onClick={onToggleChannelMuted}
                  >
                    {channel?.muted ? <BellSlashIcon className="size-3" /> : <BellIcon className="size-3" />}
                    <span>{channel?.muted ? '已静音' : '免打扰'}</span>
                  </button>
                </div>
                <button
                  type="button"
                  data-testid="channel-floating-manage"
                  title="成员与群设置"
                  className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-[7px] border-0 bg-transparent px-2 text-[11px] text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)"
                  onClick={() => openManageInPlace()}
                >
                  <Cog6ToothIcon className="size-3" />
                  <span>管理</span>
                </button>
              </div>
            </>
          ) : null}

          {/* === Tab 2: 原地搜索 === */}
          {currentTab === 'search' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2 px-2.5 pt-1 pb-2.5" data-testid="channel-search-panel">
              <div className="relative flex items-center">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 size-3.5 text-(--biu-color-text-subtle)" />
                <input
                  type="search"
                  value={searchQuery}
                  autoFocus
                  placeholder="搜索本聊天记录或附件…"
                  aria-label="搜索聊天记录"
                  data-testid="channel-search-input"
                  className="h-8 w-full rounded-[9px] border-0 bg-(--biu-color-bg-muted) pr-2.5 pl-8 text-[12.5px] text-(--biu-color-text) outline-none placeholder:text-(--biu-color-text-subtle) focus:ring-1 focus:ring-(--biu-color-icon-active)"
                  onChange={(e) => onSearchQueryChange?.(e.target.value)}
                />
              </div>
              <select
                value={searchSenderId}
                aria-label="按发送人筛选"
                data-testid="channel-search-sender"
                className="h-7 w-full rounded-[8px] border-0 bg-(--biu-color-bg-muted)/65 px-2 text-[11.5px] text-(--biu-color-text-muted) outline-none"
                onChange={(e) => onSearchSenderChange?.(e.target.value)}
              >
                <option value="">全部发送人</option>
                {members.map((m) => (
                  <option key={`${m.memberType}:${m.memberId}`} value={m.memberId}>
                    {m.name}
                  </option>
                ))}
              </select>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {!searchQuery.trim() ? (
                  recentChatMessages.length === 0 ? (
                    <div className="py-8 text-center text-[12px] text-(--biu-color-text-subtle)">
                      暂无聊天记录
                    </div>
                  ) : (
                    recentChatMessages.map((msg) => {
                      const msgText = msg.text || '[附件消息]'
                      return (
                      <button
                        key={msg.id}
                        type="button"
                        data-testid={`channel-chat-msg-${msg.id}`}
                        data-biu-kind={msg.senderType === 'agent' || msg.senderType === 'system' ? 'reply' : 'message'}
                        data-biu-id={msg.id}
                        data-biu-label={pickPreview(`${msg.senderName}：${msgText}`, 60) || msg.id}
                        data-biu-path={channelPath}
                        data-biu-text={pickPreview(msgText, 200) || undefined}
                        className="flex w-full cursor-pointer flex-col gap-0.5 rounded-[10px] border-0 bg-(--biu-color-bg-muted)/40 px-2.5 py-2 text-left transition-colors hover:bg-(--biu-color-bg-popover-hover)"
                        onClick={() => onJumpToMessage?.(msg.id)}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-(--biu-color-text-subtle)">
                          <span className="truncate font-medium text-(--biu-color-text)">{msg.senderName}</span>
                          <span className="shrink-0 tabular-nums">{formatCompactTime(msg.createdAt)}</span>
                        </div>
                        <div className="line-clamp-2 text-[12px] leading-relaxed text-(--biu-color-text-muted)">
                          {msgText}
                        </div>
                      </button>
                      )
                    })
                  )
                ) : searching ? (
                  <div className="py-8 text-center text-[12px] text-(--biu-color-text-subtle)">搜索中…</div>
                ) : searchHits.length === 0 ? (
                  <div className="py-8 text-center text-[12px] text-(--biu-color-text-subtle)">未找到匹配消息</div>
                ) : (
                  searchHits.map((hit) => {
                    const hitText = hit.text || '[附件消息]'
                    return (
                    <button
                      key={hit.id}
                      type="button"
                      data-testid={`channel-search-hit-${hit.id}`}
                      data-biu-kind={hit.senderType === 'agent' || hit.senderType === 'system' ? 'reply' : 'message'}
                      data-biu-id={hit.id}
                      data-biu-label={pickPreview(`${hit.senderName}：${hitText}`, 60) || hit.id}
                      data-biu-path={channelPath}
                      data-biu-text={pickPreview(hitText, 200) || undefined}
                      className="flex w-full cursor-pointer flex-col gap-0.5 rounded-[10px] border-0 bg-(--biu-color-bg-muted)/40 px-2.5 py-2 text-left transition-colors hover:bg-(--biu-color-bg-popover-hover)"
                      onClick={() => onJumpToMessage?.(hit.id)}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] text-(--biu-color-text-subtle)">
                        <span className="truncate font-medium text-(--biu-color-text)">{hit.senderName}</span>
                        <span className="shrink-0 tabular-nums">{formatCompactTime(hit.createdAt)}</span>
                      </div>
                      <div className="line-clamp-2 text-[12px] leading-relaxed text-(--biu-color-text-muted)">
                        {hit.text}
                      </div>
                    </button>
                    )
                  })
                )}
              </div>
            </div>
          ) : null}

          {/* === Tab 3: 原地置顶消息 === */}
          {currentTab === 'pins' ? (
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2.5 pt-1 pb-2.5" data-testid="channel-pins-modal">
              {pinnedMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center text-[12px] text-(--biu-color-text-subtle)">
                  <BookmarkIcon className="size-4 opacity-50" />
                  <span>当前聊天暂无置顶消息</span>
                </div>
              ) : (
                pinnedMessages.map((pm) => {
                  const pmText = pm.text || '[附件消息]'
                  return (
                  <div
                    key={pm.id}
                    data-biu-kind={pm.senderType === 'agent' || pm.senderType === 'system' ? 'reply' : 'message'}
                    data-biu-id={pm.id}
                    data-biu-label={pickPreview(`${pm.senderName}：${pmText}`, 60) || pm.id}
                    data-biu-path={channelPath}
                    data-biu-text={pickPreview(pmText, 200) || undefined}
                    className="group/card rounded-[10px] bg-(--biu-color-bg-muted)/45 p-2.5 transition-colors hover:bg-(--biu-color-bg-popover-hover)"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-(--biu-color-text-subtle)">
                      <span className="truncate font-medium text-(--biu-color-text)">{pm.senderName}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          className="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-(--biu-color-text-muted) hover:text-(--biu-color-text)"
                          onClick={() => onJumpToMessage?.(pm.id)}
                        >
                          定位
                        </button>
                        <button
                          type="button"
                          className="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-(--biu-color-danger) opacity-80 hover:opacity-100"
                          onClick={() => onUnpinMessage?.(pm.id)}
                        >
                          取消置顶
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="line-clamp-3 w-full cursor-pointer border-0 bg-transparent p-0 text-left text-[12.5px] leading-relaxed text-(--biu-color-text)"
                      onClick={() => onJumpToMessage?.(pm.id)}
                    >
                      {pmText}
                    </button>
                  </div>
                  )
                })
              )}
            </div>
          ) : null}

          {/* === Tab 4: 原地我的收藏 === */}
          {currentTab === 'saved' ? (
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2.5 pt-1 pb-2.5" data-testid="channel-saved-modal">
              {savedMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center text-[12px] text-(--biu-color-text-subtle)">
                  <StarIcon className="size-4 opacity-50" />
                  <span>暂无收藏的消息</span>
                </div>
              ) : (
                savedMessages.map((item) => {
                  const savedText = item.message.text || '[附件消息]'
                  return (
                  <div
                    key={item.message.id}
                    data-biu-kind={item.message.senderType === 'agent' || item.message.senderType === 'system' ? 'reply' : 'message'}
                    data-biu-id={item.message.id}
                    data-biu-label={pickPreview(`${item.message.senderName}：${savedText}`, 60) || item.message.id}
                    data-biu-path={`/channels/${item.channelId}`}
                    data-biu-text={pickPreview(savedText, 200) || undefined}
                    className="group/card rounded-[10px] bg-(--biu-color-bg-muted)/45 p-2.5 transition-colors hover:bg-(--biu-color-bg-popover-hover)"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-(--biu-color-text-subtle)">
                      <span className="truncate">
                        <span className="font-medium text-(--biu-color-text)">{item.message.senderName}</span>
                        <span className="ml-1">· #{item.channelName}</span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          className="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-(--biu-color-text-muted) hover:text-(--biu-color-text)"
                          onClick={() => onJumpToSavedMessage?.(item)}
                        >
                          跳转
                        </button>
                        <button
                          type="button"
                          className="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-(--biu-color-danger) opacity-80 hover:opacity-100"
                          onClick={() => onUnsaveMessage?.(item)}
                        >
                          移除
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="line-clamp-3 w-full cursor-pointer border-0 bg-transparent p-0 text-left text-[12.5px] leading-relaxed text-(--biu-color-text)"
                      onClick={() => onJumpToSavedMessage?.(item)}
                    >
                      {savedText}
                    </button>
                  </div>
                  )
                })
              )}
            </div>
          ) : null}

          {/* === Tab 5: 原地 AI 总结（切换 Tab 不自动调用，点击按钮后按所选范围生成） === */}
          {currentTab === 'summary' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2 px-2.5 pt-1 pb-2.5" data-testid="channel-summary-modal">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex rounded-[8px] bg-(--biu-color-bg-muted)/70 p-0.5">
                  <button
                    type="button"
                    data-testid="channel-summary-scope-recent"
                    disabled={summaryState?.loading}
                    className={`h-6 cursor-pointer rounded-[6px] border-0 px-2 text-[11px] transition-colors disabled:opacity-50 ${
                      !summaryUnreadOnly
                        ? 'bg-(--biu-color-bg-elevated) font-medium text-(--biu-color-text) shadow-xs'
                        : 'bg-transparent text-(--biu-color-text-muted) hover:text-(--biu-color-text)'
                    }`}
                    onClick={() => setSummaryUnreadOnly(false)}
                  >
                    近期消息
                  </button>
                  <button
                    type="button"
                    data-testid="channel-summary-scope-unread"
                    disabled={summaryState?.loading}
                    className={`h-6 cursor-pointer rounded-[6px] border-0 px-2 text-[11px] transition-colors disabled:opacity-50 ${
                      summaryUnreadOnly
                        ? 'bg-(--biu-color-bg-elevated) font-medium text-(--biu-color-text) shadow-xs'
                        : 'bg-transparent text-(--biu-color-text-muted) hover:text-(--biu-color-text)'
                    }`}
                    onClick={() => setSummaryUnreadOnly(true)}
                  >
                    仅未读
                  </button>
                </div>
                {summaryState?.summary && !summaryState.loading ? (
                  <div className="flex items-center gap-1.5">
                    {summaryState.messageCount ? (
                      <span className="text-[11px] text-(--biu-color-text-subtle) tabular-nums">
                        {summaryState.messageCount} 条
                      </span>
                    ) : null}
                    <button
                      type="button"
                      data-testid="channel-summary-generate"
                      className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-[7px] border-0 bg-(--biu-color-bg-muted)/75 px-2 text-[11px] font-medium text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)"
                      onClick={() => onSummarize?.(summaryUnreadOnly)}
                    >
                      <SparklesIcon className="size-3 shrink-0" />
                      <span>
                        {(summaryState.scopeLabel === '未读消息') !== summaryUnreadOnly
                          ? summaryUnreadOnly
                            ? '总结未读'
                            : '总结近期'
                          : '重新生成'}
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-[10px] bg-(--biu-color-bg-muted)/40 p-3 text-[12.5px] leading-relaxed">
                {summaryState?.loading ? (
                  <div className="flex items-center justify-center gap-1.5 py-8 text-(--biu-color-text-subtle)">
                    <SparklesIcon className="size-3.5 animate-pulse" />
                    <span>正在提炼聊天要点…</span>
                  </div>
                ) : summaryState?.error ? (
                  <div className="flex flex-col items-center gap-2.5 py-6 text-center">
                    <div className="text-[12px] text-(--biu-color-danger)">{summaryState.error}</div>
                    <button
                      type="button"
                      data-testid="channel-summary-generate"
                      className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-(--biu-color-bg-elevated) px-3 text-[11.5px] font-medium text-(--biu-color-text) shadow-xs transition-opacity hover:opacity-90"
                      onClick={() => onSummarize?.(summaryUnreadOnly)}
                    >
                      <SparklesIcon className="size-3.5 shrink-0" />
                      <span>重试生成</span>
                    </button>
                  </div>
                ) : summaryState?.summary ? (
                  <div
                    data-testid="channel-summary-content"
                    data-biu-kind="text"
                    data-biu-id={`channel-summary:${channelId || 'current'}`}
                    data-biu-label={`${channel?.name || '聊天'} · AI 总结`}
                    data-biu-path={channelPath}
                    data-biu-text={pickPreview(summaryState.summary, 240) || undefined}
                  >
                    <MarkdownBody text={summaryState.summary} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2.5 py-8 text-center">
                    <span className="inline-flex size-8 items-center justify-center rounded-full bg-(--biu-color-bg-elevated)/80 text-(--biu-color-text-muted) shadow-xs">
                      <SparklesIcon className="size-4" />
                    </span>
                    <div className="space-y-0.5">
                      <div className="text-[12.5px] font-medium text-(--biu-color-text)">
                        提炼{summaryUnreadOnly ? '未读消息' : '近期消息'}要点
                      </div>
                      <div className="text-[11px] text-(--biu-color-text-subtle)">
                        整理核心结论与待办，按需手动触发
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid="channel-summary-generate"
                      className="mt-0.5 inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-(--biu-color-text) px-3.5 text-[11.5px] font-medium text-(--biu-color-bg) transition-opacity hover:opacity-90"
                      onClick={() => onSummarize?.(summaryUnreadOnly)}
                    >
                      <SparklesIcon className="size-3.5 shrink-0" />
                      <span>生成总结</span>
                    </button>
                  </div>
                )}
              </div>

              {summaryState?.summary && !summaryState.loading ? (
                <div className="flex shrink-0 items-center justify-end gap-1.5">
                  <button
                    type="button"
                    className="inline-flex h-7 cursor-pointer items-center rounded-[8px] border-0 bg-(--biu-color-bg-muted)/70 px-2.5 text-[11.5px] font-medium text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)"
                    onClick={() => {
                      void navigator.clipboard?.writeText(summaryState.summary)
                      setCopiedSummary(true)
                      window.setTimeout(() => setCopiedSummary(false), 1400)
                    }}
                  >
                    {copiedSummary ? '已复制' : '复制摘要'}
                  </button>
                  <button
                    type="button"
                    data-testid="channel-summary-save-page"
                    className="inline-flex h-7 cursor-pointer items-center rounded-[8px] border-0 bg-(--biu-color-text) px-2.5 text-[11.5px] font-medium text-(--biu-color-bg) transition-opacity hover:opacity-90"
                    onClick={() => onSaveSummaryAsPage?.()}
                  >
                    存为页面
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* === Sub-view: 原地成员与设置（取代中心弹窗） === */}
          {currentTab === 'manage' && channel ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2.5 pt-1 pb-3" data-testid="channel-manage-panel">
              {manageError ? (
                <div className="rounded-[9px] bg-(--biu-color-danger)/12 px-2.5 py-2 text-[11.5px] text-(--biu-color-danger)" role="alert">
                  {manageError}
                </div>
              ) : null}
              {syncNotice ? (
                <div className="rounded-[9px] bg-emerald-500/12 px-2.5 py-2 text-[11.5px] text-emerald-400">
                  {syncNotice}
                </div>
              ) : null}

              {/* 聊天偏好 */}
              <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] bg-(--biu-color-bg-muted)/45 p-2">
                <button
                  type="button"
                  disabled={savingPref}
                  data-testid="channel-pref-pin"
                  className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded-[7px] border-0 px-2.5 text-[11.5px] font-medium transition-colors disabled:opacity-50 ${
                    channel.pinned
                      ? 'bg-(--biu-color-bg-elevated) text-(--biu-color-text) shadow-xs'
                      : 'bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)'
                  }`}
                  onClick={() => {
                    if (!channelId) return
                    setSavingPref(true)
                    setManageError('')
                    void updateChannelPreferences(channelId, { pinned: !channel.pinned })
                      .catch((err) => setManageError(err instanceof Error ? err.message : String(err)))
                      .finally(() => setSavingPref(false))
                  }}
                >
                  <BookmarkIcon className="size-3.5" />
                  <span>{channel.pinned ? '已置顶聊天' : '置顶聊天'}</span>
                </button>
                <button
                  type="button"
                  disabled={savingPref}
                  data-testid="channel-pref-mute"
                  className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded-[7px] border-0 px-2.5 text-[11.5px] font-medium transition-colors disabled:opacity-50 ${
                    channel.muted
                      ? 'bg-(--biu-color-bg-elevated) text-(--biu-color-text) shadow-xs'
                      : 'bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)'
                  }`}
                  onClick={() => {
                    if (!channelId) return
                    setSavingPref(true)
                    setManageError('')
                    void updateChannelPreferences(channelId, { muted: !channel.muted })
                      .catch((err) => setManageError(err instanceof Error ? err.message : String(err)))
                      .finally(() => setSavingPref(false))
                  }}
                >
                  {channel.muted ? <BellSlashIcon className="size-3.5" /> : <BellIcon className="size-3.5" />}
                  <span>{channel.muted ? '已免打扰' : '消息免打扰'}</span>
                </button>
                {canLeaveGroup ? (
                  <button
                    type="button"
                    disabled={savingPref}
                    data-testid="channel-leave-btn"
                    className="ml-auto inline-flex h-7 cursor-pointer items-center gap-1 rounded-[7px] border-0 bg-(--biu-color-danger)/12 px-2.5 text-[11.5px] font-medium text-(--biu-color-danger) transition-colors hover:bg-(--biu-color-danger)/20 disabled:opacity-50"
                    onClick={() => {
                      if (!channelId) return
                      setSavingPref(true)
                      setManageError('')
                      void leaveChannel(channelId)
                        .then(() => onLeftChannel?.())
                        .catch((err) => setManageError(err instanceof Error ? err.message : String(err)))
                        .finally(() => setSavingPref(false))
                    }}
                  >
                    <ArrowRightStartOnRectangleIcon className="size-3.5" />
                    <span>退出</span>
                  </button>
                ) : null}
              </div>

              {/* 群内 Agent 管理 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-medium text-(--biu-color-text-subtle)">
                    Agent · {agentMembers.length}
                  </span>
                  <button
                    type="button"
                    data-testid="channel-open-add-agent"
                    className={`inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border-0 px-2 text-[11px] font-medium transition-colors ${
                      addAgentOpen
                        ? 'bg-(--biu-color-bg-muted) text-(--biu-color-text)'
                        : 'bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)'
                    }`}
                    onClick={() => setAddAgentOpen((v) => !v)}
                  >
                    <UserPlusIcon className="size-3 shrink-0" />
                    <span>{addAgentOpen ? '收起' : '添加 Agent'}</span>
                  </button>
                </div>
                {addAgentOpen ? (
                  <div className="space-y-2 rounded-[10px] bg-(--biu-color-bg-muted)/50 p-2" data-testid="channel-add-agent-panel">
                    {myAddableAgents.length > 0 ? (
                      <>
                        <input
                          type="text"
                          value={agentSearch}
                          onChange={(e) => setAgentSearch(e.target.value)}
                          placeholder="搜索我创建的 Agent…"
                          data-testid="channel-add-agent-search"
                          className="h-7 w-full rounded-[7px] border-0 bg-(--biu-color-bg-popover) px-2 text-[11.5px] text-(--biu-color-text) outline-none placeholder:text-(--biu-color-text-subtle)"
                        />
                        {filteredAddableAgents.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {filteredAddableAgents.slice(0, 20).map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                data-testid={`channel-add-agent-${a.id}`}
                                className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[7px] border-0 bg-(--biu-color-bg-elevated) px-2 text-[11.5px] font-medium text-(--biu-color-text) transition-colors hover:bg-(--biu-color-bg-popover-hover)"
                                onClick={() => void handleAdd('agent', a.id)}
                              >
                                <SidebarMascot
                                  size={18}
                                  sessionId={a.id}
                                  identity={resolveSessionMascot(a.id, a.mascot)}
                                  animate={false}
                                  title=""
                                />
                                <span>{a.title}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-(--biu-color-text-subtle)">未找到匹配的 Agent</div>
                        )}
                      </>
                    ) : (
                      <div className="text-[11px] leading-relaxed text-(--biu-color-text-subtle)">
                        你创建的 Agent 已全部在该聊天中（他人的 Agent 需由归属人本人拉入）。
                      </div>
                    )}
                  </div>
                ) : null}
                {agentMembers.length === 0 ? (
                  <div className="px-1 text-[11.5px] text-(--biu-color-text-subtle)">暂无 Agent 入群</div>
                ) : (
                  <div className="space-y-1">
                    {agentMembers.map((a) => {
                      const mode: ChannelAgentContextMode = a.contextMode === 'isolated' ? 'isolated' : 'summary'
                      const isBusy = busyAgentId === a.memberId
                      return (
                        <div key={a.memberId} className="rounded-[10px] bg-(--biu-color-bg-muted)/40 px-2.5 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="flex shrink-0 items-center justify-center overflow-visible"
                              style={{ width: ROW_SLOT_PX, height: ROW_SLOT_PX }}
                            >
                              <SidebarMascot
                                size={ROW_AGENT_PX}
                                sessionId={a.memberId}
                                identity={resolveSessionMascot(a.memberId, a.mascot)}
                                animate={false}
                                className="shrink-0"
                                title=""
                              />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12.5px] font-medium text-(--biu-color-text)">{a.name}</div>
                              <div className="text-[11px] text-(--biu-color-text-subtle)">归属 {a.ownerName}</div>
                            </div>
                            {a.isOwn || canManageMembers ? (
                              <button
                                type="button"
                                className="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-(--biu-color-danger) opacity-85 hover:opacity-100"
                                onClick={() => void handleRemove('agent', a.memberId)}
                              >
                                移出
                              </button>
                            ) : null}
                          </div>
                          {a.isOwn ? (
                            <div className="mt-1.5 flex items-center gap-1.5 pl-9">
                              <button
                                type="button"
                                disabled={isBusy}
                                data-testid={`agent-context-mode-${a.memberId}`}
                                className="cursor-pointer rounded-[6px] border-0 bg-(--biu-color-bg-elevated) px-2 py-0.5 text-[11px] text-(--biu-color-text-muted) transition-colors hover:text-(--biu-color-text) disabled:opacity-50"
                                title={
                                  mode === 'summary'
                                    ? '当前：单向只读投影项目与 1v1 工作摘要（点击切换为仅群聊隔离）'
                                    : '当前：仅群聊隔离（点击切换为同步工作摘要）'
                                }
                                onClick={() => void handleToggleContextMode(a.memberId, mode)}
                              >
                                {mode === 'summary' ? '同步工作摘要' : '仅群聊隔离'}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                data-testid={`agent-sync-channel-${a.memberId}`}
                                className="cursor-pointer border-0 bg-transparent px-1 py-0.5 text-[11px] text-(--biu-color-text-muted) hover:text-(--biu-color-text) hover:underline disabled:opacity-50"
                                onClick={() => void handleSyncAgent(a.memberId, a.name)}
                              >
                                沉淀到 1v1
                              </button>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 人类成员管理 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-medium text-(--biu-color-text-subtle)">
                    成员 · {humanMembers.length}
                  </span>
                  {!isDm ? (
                    <button
                      type="button"
                      data-testid="channel-open-add-member"
                      className={`inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border-0 px-2 text-[11px] font-medium transition-colors ${
                        addMemberOpen
                          ? 'bg-(--biu-color-bg-muted) text-(--biu-color-text)'
                          : 'bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)'
                      }`}
                      onClick={() => setAddMemberOpen((v) => !v)}
                    >
                      <UserPlusIcon className="size-3 shrink-0" />
                      <span>{addMemberOpen ? '收起' : '添加成员'}</span>
                    </button>
                  ) : null}
                </div>
                {!isDm && addMemberOpen ? (
                  <div className="space-y-2 rounded-[10px] bg-(--biu-color-bg-muted)/50 p-2" data-testid="channel-add-member-panel">
                    {addableHumans.length > 0 ? (
                      <>
                        <input
                          type="text"
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          placeholder="搜索空间成员…"
                          data-testid="channel-add-member-search"
                          className="h-7 w-full rounded-[7px] border-0 bg-(--biu-color-bg-popover) px-2 text-[11.5px] text-(--biu-color-text) outline-none placeholder:text-(--biu-color-text-subtle)"
                        />
                        {filteredAddableHumans.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {filteredAddableHumans.map((h) => (
                              <button
                                key={h.id}
                                type="button"
                                data-testid={`channel-add-member-${h.id}`}
                                className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[7px] border-0 bg-(--biu-color-bg-elevated) px-2 text-[11.5px] font-medium text-(--biu-color-text) transition-colors hover:bg-(--biu-color-bg-popover-hover)"
                                onClick={() => void handleAdd('account', h.id)}
                              >
                                <RosterAvatar avatar={resolveAvatar(h.id, h.avatar)} seed={h.id} size={16} />
                                <span>{h.name}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-(--biu-color-text-subtle)">未找到匹配的空间成员</div>
                        )}
                      </>
                    ) : (
                      <div className="text-[11px] leading-relaxed text-(--biu-color-text-subtle)">
                        当前空间的全部成员均已在该聊天中。
                      </div>
                    )}
                  </div>
                ) : null}
                <div className="space-y-1">
                  {humanMembers.map((h) => (
                    <div key={h.memberId} className="flex items-center gap-2 rounded-[10px] bg-(--biu-color-bg-muted)/40 px-2.5 py-1.5">
                      <span
                        className="flex shrink-0 items-center justify-center"
                        style={{ width: ROW_SLOT_PX, height: ROW_SLOT_PX }}
                      >
                        <RosterAvatar avatar={resolveAvatar(h.memberId, h.avatar)} seed={h.memberId} size={ROW_HUMAN_PX} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-(--biu-color-text)">
                        {h.name}
                      </span>
                      {h.role === 'owner' ? (
                        <span className="shrink-0 text-[11px] text-(--biu-color-text-subtle)">群主</span>
                      ) : canManageMembers ? (
                        <button
                          type="button"
                          className="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-(--biu-color-danger) opacity-85 hover:opacity-100"
                          onClick={() => void handleRemove('account', h.memberId)}
                        >
                          移除
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                {isDm ? (
                  <div className="px-1 text-[11px] text-(--biu-color-text-subtle)">
                    1v1 私聊不支持添加第 3 位成员，如需多人协作请新建群聊。
                  </div>
                ) : null}
              </div>

              {/* Webhook 消息源管理（仅群聊可用，原地内嵌、零居中弹窗） */}
              {!isDm ? (
                <div className="space-y-1.5" data-testid="channel-webhooks-section">
                  <div className="flex items-center justify-between px-1">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-(--biu-color-text-subtle)">
                      <BoltIcon className="size-3 text-amber-400" />
                      <span>Webhook 消息源 · {webhooks.length}</span>
                    </span>
                    <button
                      type="button"
                      data-testid="channel-open-add-webhook"
                      className={`inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border-0 px-2 text-[11px] font-medium transition-colors ${
                        addWebhookOpen
                          ? 'bg-(--biu-color-bg-muted) text-(--biu-color-text)'
                          : 'bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)'
                      }`}
                      onClick={() => setAddWebhookOpen((v) => !v)}
                    >
                      <PlusIcon className="size-3 shrink-0" />
                      <span>{addWebhookOpen ? '收起' : '新建'}</span>
                    </button>
                  </div>

                  {addWebhookOpen ? (
                    <div
                      className="space-y-2 rounded-[10px] bg-(--biu-color-bg-muted)/50 p-2.5"
                      data-testid="channel-add-webhook-panel"
                    >
                      <input
                        type="text"
                        value={newWebhookName}
                        onChange={(e) => setNewWebhookName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault()
                            void handleCreateWebhook()
                          }
                        }}
                        placeholder="消息源名称，如 GitHub 通知、监控告警…"
                        data-testid="channel-webhook-name-input"
                        className="h-7 w-full rounded-[7px] border-0 bg-(--biu-color-bg-popover) px-2 text-[11.5px] text-(--biu-color-text) outline-none placeholder:text-(--biu-color-text-subtle)"
                      />
                      {agentMembers.length > 0 ? (
                        <label className="flex items-center justify-between gap-2 text-[11px] text-(--biu-color-text-subtle)">
                          <span className="shrink-0">自动唤醒 Agent</span>
                          <select
                            value={newWebhookAgentId}
                            onChange={(e) => setNewWebhookAgentId(e.target.value)}
                            data-testid="channel-webhook-agent-select"
                            className="h-6 min-w-0 flex-1 rounded-[6px] border-0 bg-(--biu-color-bg-popover) px-1.5 text-[11px] text-(--biu-color-text) outline-none"
                          >
                            <option value="">不自动唤醒（仅推送）</option>
                            {agentMembers.map((ag) => (
                              <option key={ag.memberId} value={ag.memberId}>
                                @{ag.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className="h-6 cursor-pointer rounded-[6px] border-0 bg-transparent px-2 text-[11px] text-(--biu-color-text-muted) hover:text-(--biu-color-text)"
                          onClick={() => setAddWebhookOpen(false)}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          disabled={!newWebhookName.trim() || creatingWebhook}
                          data-testid="channel-create-webhook-submit"
                          className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-[6px] border-0 bg-(--biu-color-text) px-2.5 text-[11px] font-medium text-(--biu-color-bg) transition-opacity hover:opacity-90 disabled:opacity-45"
                          onClick={() => void handleCreateWebhook()}
                        >
                          <span>{creatingWebhook ? '生成中…' : '生成 Webhook'}</span>
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {webhooksLoading ? (
                    <div className="px-1 text-[11px] text-(--biu-color-text-subtle)">加载消息源中…</div>
                  ) : webhooks.length === 0 ? (
                    <div className="px-1 text-[11px] leading-relaxed text-(--biu-color-text-subtle)">
                      生成专属接收链接，外部系统发送 POST（兼容 Slack / Discord 格式）即可推送消息到此频道。
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {webhooks.map((wh) => {
                        const fullUrl = resolveWebhookFullUrl(wh.url)
                        const isBusy = busyWebhookId === wh.id
                        const urlCopied = copiedWebhookKey === `url:${wh.id}`
                        const curlCopied = copiedWebhookKey === `curl:${wh.id}`
                        const curlSnippet = fullUrl
                          ? `curl -X POST '${fullUrl}' -H 'Content-Type: application/json' -d '{"title":"来自 ${wh.name}","text":"Hello BIU!"}'`
                          : ''
                        return (
                          <div
                            key={wh.id}
                            data-testid={`channel-webhook-row-${wh.id}`}
                            className="space-y-1.5 rounded-[10px] bg-(--biu-color-bg-muted)/40 px-2.5 py-2"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-amber-500/18 text-amber-400">
                                <BoltIcon className="size-2.5" />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-(--biu-color-text)">
                                {wh.name}
                              </span>
                              {wh.canManage ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    data-testid={`channel-webhook-toggle-${wh.id}`}
                                    className={`h-5 cursor-pointer rounded-full border-0 px-1.5 text-[10px] font-medium transition-colors disabled:opacity-50 ${
                                      wh.enabled
                                        ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                                        : 'bg-(--biu-color-bg-elevated) text-(--biu-color-text-subtle) hover:text-(--biu-color-text)'
                                    }`}
                                    onClick={() => void handleToggleWebhookEnabled(wh)}
                                  >
                                    {wh.enabled ? '已启用' : '已停用'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    data-testid={`channel-webhook-delete-${wh.id}`}
                                    className="cursor-pointer border-0 bg-transparent p-0 text-[10.5px] text-(--biu-color-danger) opacity-80 hover:opacity-100 disabled:opacity-40"
                                    onClick={() => void handleDeleteWebhook(wh)}
                                  >
                                    删除
                                  </button>
                                </>
                              ) : (
                                <span className="text-[10px] text-(--biu-color-text-subtle)">
                                  {wh.enabled ? '已启用' : '已停用'}
                                </span>
                              )}
                            </div>

                            {wh.canManage && fullUrl ? (
                              <>
                                <div className="flex items-center gap-1 rounded-[7px] bg-(--biu-color-bg-popover)/80 px-2 py-1">
                                  <code
                                    className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-(--biu-color-text-muted)"
                                    title={fullUrl}
                                    data-testid={`channel-webhook-url-${wh.id}`}
                                  >
                                    {fullUrl}
                                  </code>
                                  <button
                                    type="button"
                                    data-testid={`channel-webhook-copy-${wh.id}`}
                                    className="inline-flex h-5 shrink-0 cursor-pointer items-center gap-0.5 rounded border-0 bg-(--biu-color-bg-elevated) px-1.5 text-[10px] font-medium text-(--biu-color-text-muted) hover:text-(--biu-color-text)"
                                    onClick={() => copyWebhookText(`url:${wh.id}`, fullUrl)}
                                  >
                                    {urlCopied ? <CheckIcon className="size-2.5 text-emerald-400" /> : <DocumentDuplicateIcon className="size-2.5" />}
                                    <span>{urlCopied ? '已复制' : '复制'}</span>
                                  </button>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    data-testid={`channel-webhook-curl-${wh.id}`}
                                    className="inline-flex h-5 cursor-pointer items-center gap-1 rounded-[5px] border-0 bg-(--biu-color-bg-elevated) px-1.5 text-[10.5px] text-(--biu-color-text-muted) hover:text-(--biu-color-text) disabled:opacity-50"
                                    onClick={() => copyWebhookText(`curl:${wh.id}`, curlSnippet)}
                                  >
                                    <span>{curlCopied ? '已复制 curl' : '复制 curl'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy || !wh.enabled}
                                    data-testid={`channel-webhook-test-${wh.id}`}
                                    className="inline-flex h-5 cursor-pointer items-center gap-1 rounded-[5px] border-0 bg-(--biu-color-bg-elevated) px-1.5 text-[10.5px] text-(--biu-color-text-muted) hover:text-(--biu-color-text) disabled:opacity-45"
                                    onClick={() => void handleTestWebhook(wh)}
                                  >
                                    <PaperAirplaneIcon className="size-2.5" />
                                    <span>发测试消息</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    data-testid={`channel-webhook-rotate-${wh.id}`}
                                    className="inline-flex h-5 cursor-pointer items-center gap-1 rounded-[5px] border-0 bg-transparent px-1 text-[10.5px] text-(--biu-color-text-subtle) hover:text-(--biu-color-text) disabled:opacity-45"
                                    onClick={() => void handleRotateWebhook(wh)}
                                  >
                                    <ArrowPathIcon className="size-2.5" />
                                    <span>重置密钥</span>
                                  </button>
                                </div>

                                {agentMembers.length > 0 ? (
                                  <div className="flex items-center justify-between gap-2 pt-0.5 text-[10.5px] text-(--biu-color-text-subtle)">
                                    <span className="shrink-0">自动唤醒</span>
                                    <select
                                      disabled={isBusy}
                                      value={wh.autoTriggerAgentId ?? ''}
                                      onChange={(e) => void handleUpdateWebhookAgent(wh, e.target.value)}
                                      data-testid={`channel-webhook-agent-${wh.id}`}
                                      className="h-5 min-w-0 flex-1 rounded-[5px] border-0 bg-(--biu-color-bg-popover)/80 px-1.5 text-[10.5px] text-(--biu-color-text) outline-none disabled:opacity-50"
                                    >
                                      <option value="">不自动唤醒</option>
                                      {agentMembers.map((ag) => (
                                        <option key={ag.memberId} value={ag.memberId}>
                                          @{ag.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ) : null}
                              </>
                            ) : null}

                            <div className="flex items-center justify-between text-[10px] text-(--biu-color-text-subtle)">
                              <span>由 {wh.createdByName || '成员'} 创建</span>
                              <span>
                                {wh.lastUsedAt > 0
                                  ? `最近推送 ${new Date(wh.lastUsedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
                                  : '尚未使用'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              {/* 危险操作区：仅群主/管理员可二次确认解散群聊 */}
              {canDisbandGroup ? (
                <div className="pt-1">
                  {!confirmDisband ? (
                    <button
                      type="button"
                      data-testid="channel-disband-btn"
                      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border-0 bg-(--biu-color-danger)/10 py-2 text-[12px] font-medium text-(--biu-color-danger) transition-colors hover:bg-(--biu-color-danger)/18"
                      onClick={() => setConfirmDisband(true)}
                    >
                      <TrashIcon className="size-3.5" />
                      <span>解散并删除聊天</span>
                    </button>
                  ) : (
                    <div
                      className="space-y-2 rounded-[10px] bg-(--biu-color-danger)/12 p-2.5"
                      data-testid="channel-disband-confirm-box"
                    >
                      <div className="text-[11.5px] leading-relaxed text-(--biu-color-text)">
                        确认解散「{channel.name}」吗？所有成员的消息与讨论串将被永久清空。
                      </div>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={disbanding}
                          className="h-7 cursor-pointer rounded-[7px] border-0 bg-(--biu-color-bg-elevated) px-2.5 text-[11.5px] text-(--biu-color-text-muted)"
                          onClick={() => setConfirmDisband(false)}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          disabled={disbanding}
                          data-testid="channel-disband-confirm-btn"
                          className="h-7 cursor-pointer rounded-[7px] border-0 bg-(--biu-color-danger) px-2.5 text-[11.5px] font-medium text-white disabled:opacity-50"
                          onClick={() => {
                            if (!channelId) return
                            setDisbanding(true)
                            setManageError('')
                            void deleteChannel(channelId)
                              .then(() => onLeftChannel?.())
                              .catch((err) => {
                                setManageError(err instanceof Error ? err.message : String(err))
                                setDisbanding(false)
                              })
                          }}
                        >
                          {disbanding ? '解散中…' : '确认解散'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* === Sub-view: 原地他人 Agent 只读名片（取代中心弹窗） === */}
          {currentTab === 'agent-card' && inspectedAgentCard ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pt-1 pb-3" data-testid="channel-agent-card">
              <div className="flex items-center gap-3 rounded-[10px] bg-(--biu-color-bg-muted)/45 p-2.5">
                <span
                  className="flex shrink-0 items-center justify-center overflow-visible"
                  style={{ width: 36, height: 36 }}
                >
                  <SidebarMascot
                    size={38}
                    sessionId={inspectedAgentCard.memberId}
                    identity={resolveSessionMascot(inspectedAgentCard.memberId, inspectedAgentCard.mascot)}
                    animate={false}
                    className="shrink-0"
                    title=""
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-(--biu-color-text)">
                    {inspectedAgentCard.name}
                  </div>
                  <div className="truncate text-[11.5px] text-(--biu-color-text-subtle)">
                    归属 {inspectedAgentCard.ownerName || '其他成员'}
                    {inspectedAgentCard.model ? ` · ${inspectedAgentCard.model}` : ''}
                  </div>
                </div>
              </div>
              {inspectedAgentCard.systemPrompt ? (
                <div className="rounded-[10px] bg-(--biu-color-bg-muted)/40 p-2.5 text-[12px] leading-relaxed text-(--biu-color-text-muted)">
                  {inspectedAgentCard.systemPrompt}
                </div>
              ) : null}
              <p className="m-0 px-0.5 text-[11.5px] leading-relaxed text-(--biu-color-text-subtle)">
                这是他人归属的 Agent：你可以在当前群聊中 @{inspectedAgentCard.name} 协同工作（数据权限自动取双人交集并屏蔽私人数据），无法查看它与归属人的 1v1 私聊记录。
              </p>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border-0 bg-(--biu-color-bg-muted) py-1.5 text-[12px] font-medium text-(--biu-color-text) transition-colors hover:bg-(--biu-color-bg-popover-hover)"
                onClick={() => {
                  onMention({ kind: 'agent', id: inspectedAgentCard.memberId, label: inspectedAgentCard.name })
                  selectTab('roster')
                }}
              >
                <AtSymbolIcon className="size-3.5" />
                <span>在聊天中 @{inspectedAgentCard.name}</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        /* 收起态：贴右边缘的磨砂胶囊头像轨（Agent 与人类严格光学等大对齐） */
        <button
          type="button"
          data-testid="channel-floating-rail"
          title="悬停或点击展开成员与快捷面板"
          aria-label="展开成员与快捷面板"
          onClick={() => setHovered(true)}
          className="pointer-events-auto flex cursor-pointer flex-col items-center gap-2 rounded-full border border-(--biu-color-border-popover) bg-(--biu-color-bg-popover)/90 px-1.5 py-2 shadow-(--biu-shadow-popover) backdrop-blur-xl transition-all hover:bg-(--biu-color-bg-popover)"
        >
          {railItems.visible.map((m) =>
            m.memberType === 'agent' ? (
              <span
                key={`rail:agent:${m.memberId}`}
                data-testid={`channel-floating-rail-agent-${m.memberId}`}
                className="relative flex shrink-0 items-center justify-center overflow-visible"
                style={{ width: RAIL_SLOT_PX, height: RAIL_SLOT_PX }}
                title={`${m.name}（Agent）`}
              >
                <SidebarMascot
                  size={RAIL_AGENT_PX}
                  sessionId={m.memberId}
                  identity={resolveSessionMascot(m.memberId, m.mascot)}
                  busy={busyAgentIds.has(m.memberId)}
                  animate={false}
                  className="shrink-0"
                  title=""
                />
              </span>
            ) : (
              <span
                key={`rail:account:${m.memberId}`}
                data-testid={`channel-floating-rail-account-${m.memberId}`}
                className="relative flex shrink-0 items-center justify-center"
                style={{ width: RAIL_SLOT_PX, height: RAIL_SLOT_PX }}
                title={m.name}
              >
                <RosterAvatar
                  avatar={resolveAvatar(m.memberId, m.avatar)}
                  seed={m.memberId}
                  size={RAIL_HUMAN_PX}
                />
                {isOnline(m.memberId) ? (
                  <span className="absolute right-0 bottom-0 size-2 rounded-full bg-emerald-500 ring-[1.5px] ring-(--biu-color-bg-popover)" />
                ) : null}
              </span>
            ),
          )}
          {railItems.overflow > 0 ? (
            <span className="text-[10px] font-medium text-(--biu-color-text-subtle) tabular-nums">
              +{railItems.overflow}
            </span>
          ) : null}
        </button>
      )}
    </aside>
  )
})
