import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowDownIcon,
  ArrowUturnLeftIcon,
  BellIcon,
  BellSlashIcon,
  BookmarkIcon,
  BookmarkSquareIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronRightIcon,
  ClockIcon,
  DocumentIcon,
  DocumentPlusIcon,
  EllipsisHorizontalIcon,
  EyeIcon,
  FaceSmileIcon,
  HashtagIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Square2StackIcon,
  StarIcon,
  TrashIcon,
  UserGroupIcon,
} from '@heroicons/react/16/solid'
import { Button } from '@biu/biu-ui'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { apiFetch } from '@biu/biu-ui/api-client'
import { resolveAssetUrl } from '@biu/biu-ui/workspace-transport'
import { onAppEvents } from '@biu/biu-ui/app-events'
import { ChatDockStack, ChatStage as BiuChatStage } from '@biu/biu-ui/chat-pane'
import { useWorkspaceProfile } from '@biu/biu-ui/use-workspace-profile'
import { PickChip, splitPickStream, type PickService } from '@biu/core-pick/web'
import { SidebarMascot, resolveSessionMascot } from '@biu/public-mascot'
import { bindSessionView, channelAppPath, sessionAppPath, type SessionViewService } from '@biu/web-session-view'
import type {
  ChannelMemberView,
  ChannelMention,
  ChannelMessageView,
  ChannelSavedMessageView,
  ChannelSearchHit,
} from '../shared/channel-types.ts'
import { ChannelComposer, type ChannelComposerHandle } from './channel-composer.tsx'
import { ChannelFloatingSidebar, type ChannelFloatingTab } from './channel-floating-sidebar.tsx'
import { MarkdownBody } from './markdown.tsx'
import {
  autoNameChannel,
  cancelChannelRun,
  decideChannelApproval,
  editChannelMessage,
  loadChannelDetail,
  loadChannelMessagesAround,
  loadChannelPins,
  loadChannelThread,
  loadOlderChannelMessages,
  loadSavedChannelMessages,
  markChannelRead,
  openChannelRunTrace,
  openOrCreateDm,
  recallChannelMessage,
  renameChannel,
  saveChannelContentAsPage,
  searchChannelMessages,
  setActiveChannelId,
  setChannelThreadFollow,
  summarizeChannel,
  syncChannelToAgent,
  toggleChannelPinMessage,
  toggleChannelReaction,
  toggleChannelSaveMessage,
  updateChannelPreferences,
  useChannelStore,
} from './channel-store.ts'

const QUICK_REACTION_EMOJIS = ['👍', '👀', '✅', '🎉', '❤️', '😂', '🔥', '🤔'] as const
const EMPTY_MESSAGES: ChannelMessageView[] = []
const EMPTY_MEMBERS: ChannelMemberView[] = []

function formatSentAt(ts: number) {
  if (!ts) return ''
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (sameDay) return time
  const day = date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  return `${day} ${time}`
}

function calendarDayKey(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function formatDayDivider(ts: number): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const todayKey = calendarDayKey(now.getTime())
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const targetKey = calendarDayKey(ts)
  if (targetKey === todayKey) return '今天'
  if (targetKey === calendarDayKey(yesterday.getTime())) return '昨天'
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * 将群聊正文预处理为富文本 Markdown：
 * - 在代码块外保留单换行（Shift+Enter）；
 * - 将显式 @提及（及 @所有人）渲染为醒目的行内胶囊标签。
 */
export function formatChannelMessageMarkdown(text: string, mentions: ChannelMention[] = []): string {
  if (!text) return ''
  const labels = [...new Set(mentions.map((m) => m.label.trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
  const segments = text.split(/(```[\s\S]*?```)/g)
  return segments
    .map((seg, idx) => {
      if (idx % 2 === 1) return seg // fenced code block untouched
      const inlineParts = seg.split(/(`[^`\n]+`)/g)
      return inlineParts
        .map((part, pIdx) => {
          if (pIdx % 2 === 1) return part // inline code untouched
          let out = part
          if (labels.length > 0) {
            const pattern = labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
            const re = new RegExp(`(^|[\\s(（])@(${pattern})(?=$|[\\s)），。！？,.!?:：])`, 'g')
            out = out.replace(
              re,
              (_m, lead: string, label: string) =>
                `${lead}<span class="inline-block rounded bg-(--biu-color-bg-muted) px-1 py-0.5 text-[0.92em] font-medium text-(--biu-color-text)">@${escapeHtmlText(label)}</span>`,
            )
          }
          // Preserve single newlines inside paragraphs while leaving blank lines intact
          return out.replace(/([^\n])\n(?!\n)/g, '$1  \n')
        })
        .join('')
    })
    .join('')
}

/** 渲染已发送的用户频道消息：无 Pick 芯片时直通 MarkdownBody；含 Pick 芯片时行内混排 PickChip 与 @ 提及。 */
const ChannelMessageBody = memo(function ChannelMessageBody({
  text,
  mentions,
}: {
  text: string
  mentions: ChannelMention[]
}) {
  const parts = useMemo(() => splitPickStream(text), [text])
  const hasPick = parts.some((p) => p.type === 'pick')
  if (!hasPick) {
    return (
      <div className="chat-assistant-body">
        <MarkdownBody text={formatChannelMessageMarkdown(text, mentions)} />
      </div>
    )
  }
  const labels = [...new Set(mentions.map((m) => m.label.trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
  const mentionRe =
    labels.length > 0
      ? new RegExp(`(@(?:${labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g')
      : null

  return (
    <div className="composer-tiptap is-readonly">
      {parts.map((part, index) => {
        if (part.type === 'pick') {
          return (
            <span key={`p${index}`} className="composer-inline-chip">
              <PickChip pick={part.ref} />
            </span>
          )
        }
        const lines = part.value.split('\n')
        return (
          <Fragment key={`t${index}`}>
            {lines.map((line, lineIndex) => {
              const tokens = mentionRe ? line.split(mentionRe) : [line]
              return (
                <Fragment key={lineIndex}>
                  {lineIndex > 0 ? <br /> : null}
                  {tokens.map((tok, tokIdx) =>
                    mentionRe && tokIdx % 2 === 1 ? (
                      <span
                        key={tokIdx}
                        className="inline-block rounded bg-(--biu-color-bg-muted) px-1 py-0.5 text-[0.92em] font-medium text-(--biu-color-text)"
                      >
                        {tok}
                      </span>
                    ) : (
                      <Fragment key={tokIdx}>{tok}</Fragment>
                    ),
                  )}
                </Fragment>
              )
            })}
          </Fragment>
        )
      })}
    </div>
  )
})

/** 与侧边栏账户及成员表完全一致的头像渲染（优先工作区头像，回退同 seed AiAvatar）。 */
export function MemberAvatar({
  avatar,
  seed,
  size = 18,
}: {
  avatar?: string
  seed?: string
  size?: number
}) {
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

/** 实时同步当前工作区成员的头像、昵称与在线状态，确保与空间头像和成员表始终 100% 一致。 */
function useLiveWorkspaceAvatars() {
  const workspaceProfile = useWorkspaceProfile()
  const [byId, setById] = useState<Map<string, { name?: string; avatar?: string; online?: boolean }>>(() => new Map())

  useEffect(() => {
    let cancelled = false
    const load = () => {
      const params = new URLSearchParams({
        path: '/workspace-members',
        limit: '500',
        columns: 'title,avatar,status',
      })
      void apiFetch(`/api/db/list?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          if (cancelled) return
          const rows = Array.isArray((body as { items?: unknown[] } | null)?.items)
            ? ((body as { items: Array<Record<string, unknown>> }).items)
            : []
          const next = new Map<string, { name?: string; avatar?: string; online?: boolean }>()
          for (const row of rows) {
            const id = String(row?.id ?? '').trim()
            if (!id) continue
            const avatar = typeof row.avatar === 'string' ? row.avatar.trim() : ''
            const name = typeof row.title === 'string' ? row.title.trim() : ''
            const online = row.status === 'online'
            next.set(id, { ...(name ? { name } : {}), ...(avatar ? { avatar } : {}), online })
          }
          setById(next)
        })
        .catch(() => undefined)
    }
    load()
    const off = onAppEvents(['biu:account-token', 'biu:workspace-profile'], load)
    return () => {
      cancelled = true
      off()
    }
  }, [])

  const resolveAvatar = useCallback(
    (accountId?: string, serverAvatar?: string): string | undefined => {
      const id = String(accountId ?? '').trim()
      if (id && workspaceProfile.accountId && id === workspaceProfile.accountId && workspaceProfile.hydrated) {
        return workspaceProfile.avatar?.trim() || undefined
      }
      const live = id ? byId.get(id)?.avatar : undefined
      if (live) return live
      return serverAvatar?.trim() || undefined
    },
    [byId, workspaceProfile.accountId, workspaceProfile.avatar, workspaceProfile.hydrated],
  )

  const isOnline = useCallback(
    (accountId?: string): boolean => {
      const id = String(accountId ?? '').trim()
      return Boolean(id && byId.get(id)?.online)
    },
    [byId],
  )

  return { resolveAvatar, isOnline }
}

export const ChannelStage = memo(function ChannelStage({
  channelId,
  leftHidden,
  expandSidebar,
  inspectorOpen,
  toggleInspector,
  useSessionView,
  sessionView,
  pick,
}: {
  channelId: string
  leftHidden?: boolean
  expandSidebar?: () => void
  inspectorOpen?: boolean
  toggleInspector?: () => void
  useSessionView?: ReturnType<typeof bindSessionView>
  sessionView?: SessionViewService
  pick?: PickService
}) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeThreadRootId = searchParams.get('thread') || null
  const detail = useChannelStore((s) => s.details[channelId])
  const activeThread = useChannelStore((s) => (activeThreadRootId ? s.threads[activeThreadRootId] : undefined))
  const typingUsersRaw = useChannelStore((s) => s.typingByChannel[channelId])
  const workspaceProfile = useWorkspaceProfile()
  const { resolveAvatar, isOnline } = useLiveWorkspaceAvatars()
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null)
  const [replyTo, setReplyTo] = useState<ChannelMessageView | null>(null)
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [error, setError] = useState('')
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [msgMenu, setMsgMenu] = useState<{ msg: ChannelMessageView; top: number; left: number } | null>(null)
  const [floatingTab, setFloatingTab] = useState<ChannelFloatingTab | null>(null)
  const [pinnedMessages, setPinnedMessages] = useState<ChannelMessageView[]>([])
  const [savedMessages, setSavedMessages] = useState<ChannelSavedMessageView[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchSenderId, setSearchSenderId] = useState('')
  const [searchHits, setSearchHits] = useState<ChannelSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null)
  const [reactPickerMsgId, setReactPickerMsgId] = useState<string | null>(null)
  const [summaryState, setSummaryState] = useState<{
    loading: boolean
    summary: string
    messageCount: number
    scopeLabel: string
    error: string
  }>({ loading: false, summary: '', messageCount: 0, scopeLabel: '近期消息', error: '' })
  const [savedPageNotice, setSavedPageNotice] = useState<{ id: string; title: string } | null>(null)
  const [typingTick, setTypingTick] = useState(0)
  const [agentCard, setAgentCard] = useState<ChannelMemberView | null>(null)
  const [decidingApproval, setDecidingApproval] = useState<string | null>(null)
  const [namingTitle, setNamingTitle] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [syncedMsgIds, setSyncedMsgIds] = useState<Record<string, boolean>>({})
  const [togglingThreadFollow, setTogglingThreadFollow] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [unreadDividerSeq, setUnreadDividerSeq] = useState<number | null>(null)
  const [pendingNewCount, setPendingNewCount] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<ChannelComposerHandle>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const headerMenuRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const prevMsgCountRef = useRef(0)
  const prevLastMsgIdRef = useRef('')
  const unreadAnchorCapturedRef = useRef('')

  useEffect(() => {
    setActiveChannelId(channelId)
    return () => setActiveChannelId(null)
  }, [channelId])

  useEffect(() => {
    setLoading(true)
    setError('')
    setReplyTo(null)
    setUnreadDividerSeq(null)
    setPendingNewCount(0)
    setEditingMsgId(null)
    setHeaderMenuOpen(false)
    setMsgMenu(null)
    setFloatingTab(null)
    nearBottomRef.current = true
    prevMsgCountRef.current = 0
    prevLastMsgIdRef.current = ''
    unreadAnchorCapturedRef.current = ''
    void loadChannelDetail(channelId).finally(() => setLoading(false))
  }, [channelId])

  useEffect(() => {
    if (!activeThreadRootId) return
    setReplyTo(null)
    setMsgMenu(null)
    void loadChannelThread(channelId, activeThreadRootId)
  }, [channelId, activeThreadRootId])

  useEffect(() => {
    if (!headerMenuOpen && !msgMenu) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (headerMenuOpen && headerMenuRef.current && target && !headerMenuRef.current.contains(target)) {
        setHeaderMenuOpen(false)
      }
      if (msgMenu) {
        const el = target instanceof Element ? target.closest('[data-testid="channel-msg-more-menu"]') : null
        if (!el) setMsgMenu(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHeaderMenuOpen(false)
        setMsgMenu(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [headerMenuOpen, msgMenu])

  const mainMessages = detail?.messages ?? EMPTY_MESSAGES
  const threadRootMessage = useMemo(() => {
    if (!activeThreadRootId) return null
    return activeThread?.root ?? mainMessages.find((m) => m.id === activeThreadRootId) ?? null
  }, [activeThread?.root, activeThreadRootId, mainMessages])
  const threadReplies = activeThread?.replies ?? EMPTY_MESSAGES
  const isThreadFollowed = useMemo(() => {
    if (!activeThreadRootId) return false
    if (typeof activeThread?.following === 'boolean') return activeThread.following
    if (typeof threadRootMessage?.threadSummary?.following === 'boolean') {
      return threadRootMessage.threadSummary.following
    }
    return Boolean(detail?.channel.threads?.some((t) => t.rootId === activeThreadRootId))
  }, [activeThread?.following, activeThreadRootId, detail?.channel.threads, threadRootMessage?.threadSummary?.following])
  const messages = useMemo(() => {
    if (!activeThreadRootId) return mainMessages
    return threadRootMessage ? [threadRootMessage, ...threadReplies] : threadReplies
  }, [activeThreadRootId, mainMessages, threadReplies, threadRootMessage])
  const threadCrumbTitle = useMemo(() => {
    const raw = (threadRootMessage?.text ?? '')
      .replace(/[#>*`[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!raw) return '讨论串'
    return raw.length > 26 ? `${raw.slice(0, 26)}…` : raw
  }, [threadRootMessage?.text])
  const members = detail?.members ?? EMPTY_MEMBERS
  const activities = detail?.activities ?? []
  const channel = detail?.channel
  const myAccountId = detail?.myAccountId || workspaceProfile.accountId || ''

  const activeTypingUsers = useMemo(() => {
    void typingTick
    const now = Date.now()
    return (typingUsersRaw ?? []).filter((t) => now - t.ts < 4500 && t.accountId !== myAccountId)
  }, [myAccountId, typingTick, typingUsersRaw])

  useEffect(() => {
    if (!activeTypingUsers.length) return
    const timer = window.setTimeout(() => setTypingTick((n) => n + 1), 1500)
    return () => window.clearTimeout(timer)
  }, [activeTypingUsers])

  const jumpToMessage = useCallback(
    async (targetMsgId: string) => {
      if (!targetMsgId) return
      const exists = messages.some((m) => m.id === targetMsgId)
      if (!exists) {
        await loadChannelMessagesAround(channelId, targetMsgId)
      }
      setHighlightedMsgId(targetMsgId)
      requestAnimationFrame(() => {
        const node = scrollRef.current?.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape ? CSS.escape(targetMsgId) : targetMsgId}"]`)
        if (typeof node?.scrollIntoView === 'function') {
          node.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      })
      window.setTimeout(() => {
        setHighlightedMsgId((cur) => (cur === targetMsgId ? null : cur))
      }, 2400)
    },
    [channelId, messages],
  )

  const targetMsgParam = searchParams.get('msg')
  useEffect(() => {
    if (!targetMsgParam || !detail || detail.channel.id !== channelId) return
    void jumpToMessage(targetMsgParam)
    const next = new URLSearchParams(searchParams)
    next.delete('msg')
    setSearchParams(next, { replace: true })
  }, [channelId, detail, jumpToMessage, searchParams, setSearchParams, targetMsgParam])

  useEffect(() => {
    if (floatingTab !== 'search') return
    const q = searchQuery.trim()
    if (!q) {
      setSearchHits([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(() => {
      void searchChannelMessages({
        q,
        channelId,
        ...(searchSenderId ? { senderId: searchSenderId } : {}),
        limit: 25,
      })
        .then((hits) => {
          if (!cancelled) setSearchHits(hits)
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [channelId, floatingTab, searchQuery, searchSenderId])

  const openPinsPanel = useCallback(() => {
    setFloatingTab('pins')
    void loadChannelPins(channelId).then(setPinnedMessages)
  }, [channelId])

  const openSavedPanel = useCallback(() => {
    setFloatingTab('saved')
    void loadSavedChannelMessages().then(setSavedMessages)
  }, [])

  const openThread = useCallback(
    (rootMsgId: string) => {
      const next = new URLSearchParams(searchParams)
      next.set('thread', rootMsgId)
      setSearchParams(next)
      void loadChannelThread(channelId, rootMsgId)
    },
    [channelId, searchParams, setSearchParams],
  )

  const closeThread = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    next.delete('thread')
    setSearchParams(next)
  }, [searchParams, setSearchParams])

  const handleSummarize = useCallback(
    (unreadOnly = false) => {
      setFloatingTab('summary')
      setSummaryState({
        loading: true,
        summary: '',
        messageCount: 0,
        scopeLabel: unreadOnly ? '未读消息' : '近期消息',
        error: '',
      })
      void summarizeChannel(channelId, unreadOnly)
        .then((res) => {
          setSummaryState({
            loading: false,
            summary: res.summary,
            messageCount: res.messageCount,
            scopeLabel: res.scopeLabel,
            error: '',
          })
        })
        .catch((err) => {
          setSummaryState((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          }))
        })
    },
    [channelId],
  )

  const handleSaveMessageAsPage = useCallback(
    async (msg: ChannelMessageView) => {
      setError('')
      try {
        const chTitle = channel?.name || '聊天'
        const title = `${chTitle} · ${msg.senderName} 的发言沉淀`
        let md = `> 来源：聊天「#${chTitle}」 · 发送人：${msg.senderName}\n\n${msg.text}\n`
        if (msg.threadSummary && msg.threadSummary.replyCount > 0) {
          const thread = await loadChannelThread(channelId, msg.id)
          if (thread?.replies.length) {
            md += `\n## 讨论串回复（${thread.replies.length} 条）\n\n`
            for (const r of thread.replies) {
              if (r.deletedAt) continue
              md += `- **${r.senderName}**：${r.text}\n`
            }
          }
        }
        const created = await saveChannelContentAsPage(title, md)
        setSavedPageNotice(created)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [channel?.name, channelId],
  )

  // 进入频道后捕获一次未读游标用于渲染「以下是新消息」分割线，并上报已读
  useEffect(() => {
    if (!detail || detail.channel.id !== channelId || activeThreadRootId) return
    if (unreadAnchorCapturedRef.current !== channelId) {
      unreadAnchorCapturedRef.current = channelId
      const lastRead = detail.channel.lastReadSeq ?? 0
      const hasUnread =
        (detail.channel.unreadCount ?? 0) > 0 &&
        mainMessages.some((m) => !m.ephemeralTo && !m.deletedAt && m.seq > lastRead && m.senderId !== myAccountId)
      setUnreadDividerSeq(hasUnread ? lastRead : null)
    }
    const latestSeq = mainMessages.at(-1)?.seq ?? 0
    if (latestSeq > 0 && nearBottomRef.current && ((detail.channel.unreadCount ?? 0) > 0 || latestSeq > (detail.channel.lastReadSeq ?? 0))) {
      void markChannelRead(channelId, latestSeq)
    }
  }, [activeThreadRootId, channelId, detail, mainMessages, myAccountId])

  // 智能滚动：仅首次加载、自己在底部或自己刚发消息时滚到底部；往上翻历史时显示「N 条新消息」胶囊
  useEffect(() => {
    const el = scrollRef.current
    const lastMsg = messages.at(-1)
    const lastId = lastMsg?.id ?? ''
    const isInitialLoad = prevMsgCountRef.current === 0 && messages.length > 0
    const appendedAtEnd = Boolean(lastId) && lastId !== prevLastMsgIdRef.current && messages.length > prevMsgCountRef.current
    const sentByMe = Boolean(lastMsg && myAccountId && lastMsg.senderType === 'account' && lastMsg.senderId === myAccountId)

    prevMsgCountRef.current = messages.length
    prevLastMsgIdRef.current = lastId

    if (!el) return
    if (isInitialLoad || sentByMe || nearBottomRef.current) {
      el.scrollTop = el.scrollHeight
      setPendingNewCount((n) => (n === 0 ? n : 0))
      if (
        !activeThreadRootId &&
        lastMsg?.seq &&
        ((detail?.channel.unreadCount ?? 0) > 0 || lastMsg.seq > (detail?.channel.lastReadSeq ?? 0))
      ) {
        void markChannelRead(channelId, lastMsg.seq)
      }
    } else if (appendedAtEnd) {
      setPendingNewCount((n) => n + 1)
    }
  }, [activeThreadRootId, channelId, detail?.channel.lastReadSeq, detail?.channel.unreadCount, messages, activities.length, myAccountId])

  const handleLoadOlder = useCallback(async () => {
    if (loadingOlder || !detail?.hasMoreMessages) return
    const el = scrollRef.current
    const prevHeight = el?.scrollHeight ?? 0
    const prevTop = el?.scrollTop ?? 0
    setLoadingOlder(true)
    try {
      const res = await loadOlderChannelMessages(channelId)
      if (res.added > 0 && el) {
        requestAnimationFrame(() => {
          const delta = el.scrollHeight - prevHeight
          el.scrollTop = prevTop + delta
        })
      }
    } finally {
      setLoadingOlder(false)
    }
  }, [channelId, detail?.hasMoreMessages, loadingOlder])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const distToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      const near = distToBottom < 120
      nearBottomRef.current = near
      if (near && pendingNewCount > 0) {
        setPendingNewCount(0)
        const latestSeq = messages.at(-1)?.seq ?? 0
        if (latestSeq > 0) void markChannelRead(channelId, latestSeq)
      }
      if (el.scrollTop < 60 && detail?.hasMoreMessages && !loadingOlder) {
        void handleLoadOlder()
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [channelId, detail?.hasMoreMessages, handleLoadOlder, loadingOlder, messages, pendingNewCount])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) {
      if (typeof el.scrollTo === 'function') {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        el.scrollTop = el.scrollHeight
      }
    }
    nearBottomRef.current = true
    setPendingNewCount(0)
    const latestSeq = messages.at(-1)?.seq ?? 0
    if (latestSeq > 0) void markChannelRead(channelId, latestSeq)
  }, [channelId, messages])

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(false)
    if (event.dataTransfer?.files?.length) {
      void composerRef.current?.uploadFiles(event.dataTransfer.files)
    }
  }, [])

  const commitEditMessage = useCallback(
    async (msgId: string) => {
      const next = editingDraft.trim()
      if (!next || savingEdit) return
      setSavingEdit(true)
      setError('')
      try {
        await editChannelMessage(channelId, msgId, next)
        setEditingMsgId(null)
        setEditingDraft('')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setSavingEdit(false)
      }
    },
    [channelId, editingDraft, savingEdit],
  )

  const handleRecallMessage = useCallback(
    async (msgId: string) => {
      setError('')
      try {
        await recallChannelMessage(channelId, msgId)
        if (editingMsgId === msgId) setEditingMsgId(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [channelId, editingMsgId],
  )

  const memberById = useMemo(() => {
    const map = new Map<string, ChannelMemberView>()
    for (const m of members) map.set(`${m.memberType}:${m.memberId}`, m)
    return map
  }, [members])

  const clearReplyTo = useCallback(() => setReplyTo(null), [])

  const handleAgentClick = (agentId: string) => {
    const member = memberById.get(`agent:${agentId}`)
    if (!member) return
    if (member.isOwn) {
      void sessionView?.load(agentId, { view: 'chat' })
      navigate(sessionAppPath(agentId))
      return
    }
    setAgentCard(member)
    setFloatingTab('agent-card')
  }

  const handleApproval = async (approvalId: string, allow: boolean) => {
    setDecidingApproval(approvalId)
    try {
      await decideChannelApproval(approvalId, allow)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDecidingApproval(null)
    }
  }

  const isDm = channel?.kind === 'dm'
  const peerAvatar = resolveAvatar(channel?.peerAccountId, channel?.peerAvatar)
  const peerOnline = isDm && isOnline(channel?.peerAccountId)

  const handleAutoName = async () => {
    if (isDm || namingTitle) return
    setNamingTitle(true)
    try {
      await autoNameChannel(channelId)
    } catch {
      /* ignore */
    } finally {
      setNamingTitle(false)
    }
  }

  const commitTitleEdit = async () => {
    setEditingTitle(false)
    const next = titleDraft.trim()
    if (!next || next === (channel?.name ?? '').trim()) return
    try {
      await renameChannel(channelId, next)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="channel-stage">
      {/* 顶部栏：与 BIU 数据面包屑一致的扁平头部，支持 聊天 / 讨论串 二级面包屑 */}
      <header className="chat-view-header" data-biu-ignore>
        <div className="chat-view-header-left min-w-0">
          {leftHidden ? (
            <button
              type="button"
              className="chat-view-header-expand"
              title="展开左侧边栏"
              aria-label="展开左侧边栏"
              onClick={expandSidebar}
            >
              <ChevronDoubleRightIcon className="size-4" />
            </button>
          ) : null}

          <nav
            className="group/title flex min-w-0 items-center gap-1"
            aria-label="聊天面包屑"
            data-testid="channel-breadcrumb"
          >
            {activeThreadRootId ? (
              <>
                <button
                  type="button"
                  data-testid="channel-breadcrumb-parent"
                  className="inline-flex h-7 max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-1.5 text-[13.5px] font-medium text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
                  title={`返回 ${channel?.name ?? '聊天'}`}
                  onClick={closeThread}
                >
                  {isDm ? (
                    <MemberAvatar avatar={peerAvatar} seed={channel?.peerAccountId || channelId} size={16} />
                  ) : channel?.accessMode === 'private' ? (
                    <LockClosedIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" aria-hidden />
                  ) : (
                    <HashtagIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" aria-hidden />
                  )}
                  <span className="truncate">{channel?.name ?? '聊天'}</span>
                </button>
                <span className="shrink-0 select-none text-[13px] text-(--biu-color-text-subtle)" aria-hidden>
                  /
                </span>
                <span
                  className="inline-flex min-w-0 items-center gap-1.5 px-1 text-[13.5px] font-semibold text-(--biu-color-text)"
                  data-testid="channel-thread-crumb"
                >
                  <ChatBubbleLeftRightIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" aria-hidden />
                  <span className="truncate">{threadCrumbTitle}</span>
                  <span className="shrink-0 text-[11.5px] font-normal text-(--biu-color-text-subtle) tabular-nums">
                    {threadReplies.length} 条回复
                  </span>
                </span>
                <button
                  type="button"
                  disabled={togglingThreadFollow}
                  data-testid="channel-thread-follow-btn"
                  aria-pressed={isThreadFollowed}
                  title={
                    isThreadFollowed
                      ? '已关注：会显示在左侧边栏该聊天下方（点击取消关注）'
                      : '关注讨论串后，会固定显示在左侧边栏该聊天下方'
                  }
                  className={`ml-1 inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md border-0 px-2 text-[11.5px] font-medium transition-colors disabled:opacity-50 ${
                    isThreadFollowed
                      ? 'bg-(--biu-color-bg-muted) text-(--biu-color-text) hover:bg-(--biu-color-bg-hover)'
                      : 'bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)'
                  }`}
                  onClick={() => {
                    if (!activeThreadRootId || togglingThreadFollow) return
                    setTogglingThreadFollow(true)
                    setError('')
                    void setChannelThreadFollow(channelId, activeThreadRootId, !isThreadFollowed)
                      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                      .finally(() => setTogglingThreadFollow(false))
                  }}
                >
                  {isThreadFollowed ? <BellIcon className="size-3 shrink-0" /> : <BellSlashIcon className="size-3 shrink-0 opacity-75" />}
                  <span>{isThreadFollowed ? '已关注' : '关注'}</span>
                </button>
              </>
            ) : (
              <>
                <span className="inline-flex shrink-0 items-center">
                  {isDm ? (
                    <span className="relative inline-flex shrink-0">
                      <MemberAvatar avatar={peerAvatar} seed={channel?.peerAccountId || channelId} size={18} />
                      {peerOnline ? (
                        <span
                          className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-emerald-500 ring-[1.5px] ring-(--biu-color-bg)"
                          title="在线"
                          aria-label="在线"
                        />
                      ) : null}
                    </span>
                  ) : channel?.accessMode === 'private' ? (
                    <LockClosedIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" aria-hidden />
                  ) : (
                    <HashtagIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" aria-hidden />
                  )}
                </span>
                {!isDm && editingTitle ? (
                  <input
                    ref={titleInputRef}
                    className="chat-view-session-title is-editing pointer-events-auto"
                    value={titleDraft}
                    aria-label="聊天名称"
                    data-testid="channel-title-input"
                    size={Math.max(4, titleDraft.length)}
                    autoFocus
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={() => void commitTitleEdit()}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setEditingTitle(false)
                        return
                      }
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void commitTitleEdit()
                      }
                    }}
                  />
                ) : (
                  <span
                    className={`truncate text-[14px] font-semibold text-(--biu-color-text)${!isDm && detail?.canManageMembers ? ' cursor-text rounded px-1 hover:bg-(--biu-color-bg-hover)' : ''}`}
                    data-testid="channel-title"
                    title={!isDm && detail?.canManageMembers ? '点击重命名' : channel?.name}
                    onClick={() => {
                      if (isDm || !detail?.canManageMembers || !channel) return
                      setTitleDraft(channel.name)
                      setEditingTitle(true)
                    }}
                  >
                    {channel?.name ?? (loading ? '加载中…' : '聊天')}
                  </span>
                )}
                {!isDm && channel ? (
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-(--biu-color-text-subtle) opacity-0 transition-opacity hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text) group-hover/title:opacity-100 focus-visible:opacity-100"
                    title="根据聊天内容自动命名"
                    aria-label="根据聊天内容自动命名"
                    data-testid="channel-auto-name"
                    disabled={namingTitle}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void handleAutoName()}
                  >
                    <SparklesIcon aria-hidden className="size-3.5" />
                  </button>
                ) : null}
                {channel?.topic ? (
                  <span
                    className="ml-1 hidden truncate text-[12px] font-normal text-(--biu-color-text-subtle) md:inline"
                    title={channel.topic}
                  >
                    · {channel.topic}
                  </span>
                ) : null}
              </>
            )}
          </nav>
        </div>

        <div className="chat-view-header-right shrink-0">
          <button
            type="button"
            className={`inline-flex h-[var(--biu-size-control-md)] cursor-pointer items-center gap-1 rounded-[6px] border-0 bg-transparent px-2 text-[12px] font-medium transition-colors hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)${floatingTab === 'search' ? ' bg-(--biu-color-bg-hover) text-(--biu-color-text)' : ' text-(--biu-color-text-muted)'}`}
            title="在右侧面板搜索本聊天记录"
            aria-label="搜索聊天记录"
            data-testid="channel-search-toggle"
            onClick={() => setFloatingTab((cur) => (cur === 'search' ? null : 'search'))}
          >
            <MagnifyingGlassIcon className="size-3.5 shrink-0" />
          </button>
          <div ref={headerMenuRef} className="relative">
            <button
              type="button"
              className={`inline-flex h-[var(--biu-size-control-md)] cursor-pointer items-center justify-center rounded-[6px] border-0 bg-transparent px-2 text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)${headerMenuOpen ? ' bg-(--biu-color-bg-hover) text-(--biu-color-text)' : ''}`}
              title="更多功能"
              aria-label="更多功能"
              data-testid="channel-more-menu-btn"
              onClick={() => setHeaderMenuOpen((v) => !v)}
            >
              <EllipsisHorizontalIcon className="size-4 shrink-0" />
            </button>
            {headerMenuOpen ? (
              <div
                className="absolute top-[calc(100%+4px)] right-0 z-50 w-44 rounded-[var(--biu-radius-popover)] border border-(--biu-color-border-popover) bg-(--biu-color-bg-popover) p-1 shadow-(--biu-shadow-popover)"
                role="menu"
                data-testid="channel-header-menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  data-testid="channel-summarize-btn"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] text-(--biu-color-text) hover:bg-(--biu-color-bg-popover-hover)"
                  onClick={() => {
                    setHeaderMenuOpen(false)
                    handleSummarize(false)
                  }}
                >
                  <SparklesIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" />
                  <span>AI 总结要点</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="channel-pins-btn"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] text-(--biu-color-text) hover:bg-(--biu-color-bg-popover-hover)"
                  onClick={() => {
                    setHeaderMenuOpen(false)
                    openPinsPanel()
                  }}
                >
                  <BookmarkIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" />
                  <span className="flex-1">置顶消息</span>
                  {mainMessages.filter((m) => m.pinnedAt && !m.deletedAt).length > 0 ? (
                    <span className="text-[11px] text-(--biu-color-text-subtle) tabular-nums">
                      {mainMessages.filter((m) => m.pinnedAt && !m.deletedAt).length}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="channel-saved-btn"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] text-(--biu-color-text) hover:bg-(--biu-color-bg-popover-hover)"
                  onClick={() => {
                    setHeaderMenuOpen(false)
                    openSavedPanel()
                  }}
                >
                  <StarIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" />
                  <span>我的收藏</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="channel-manage-members"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] text-(--biu-color-text) hover:bg-(--biu-color-bg-popover-hover)"
                  onClick={() => {
                    setHeaderMenuOpen(false)
                    setFloatingTab('manage')
                  }}
                >
                  <UserGroupIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" />
                  <span>成员与设置</span>
                </button>
              </div>
            ) : null}
          </div>
          {toggleInspector ? (
            <button
              type="button"
              className={`chat-view-header-expand${inspectorOpen ? ' is-active' : ''}`}
              title={inspectorOpen ? '收起检查器' : '打开检查器'}
              aria-label={inspectorOpen ? '收起检查器' : '打开检查器'}
              onClick={toggleInspector}
            >
              {inspectorOpen ? (
                <ChevronDoubleRightIcon className="size-4" />
              ) : (
                <ChevronDoubleLeftIcon className="size-4" />
              )}
            </button>
          ) : null}
        </div>
      </header>

      {/* 一键存为 BIU 页面的成功提示条 */}
      {savedPageNotice ? (
        <div
          className="flex items-center justify-between gap-3 border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-[12px] text-emerald-400"
          data-testid="channel-saved-page-toast"
        >
          <span className="truncate">已保存为页面「{savedPageNotice.title}」</span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 font-medium text-emerald-300 underline"
              onClick={() => {
                const targetId = savedPageNotice.id
                setSavedPageNotice(null)
                navigate(`/database/pages/record/${encodeURIComponent(targetId)}`)
              }}
            >
              打开页面
            </button>
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 text-emerald-300/80 hover:text-emerald-200"
              aria-label="关闭提示"
              onClick={() => setSavedPageNotice(null)}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      {/* 主对话舞台：与 AgentMainPanels 完全相同的居中舞台 + 底部悬浮胶囊输入栏 */}
      <div
        className={`relative flex min-h-0 w-full flex-1 flex-col overflow-hidden${dragOver ? ' ring-2 ring-inset ring-(--biu-color-icon-active)' : ''}`}
        data-testid="agent-center"
        onDragOver={(e) => {
          if (e.dataTransfer?.types?.includes('Files')) {
            e.preventDefault()
            setDragOver(true)
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {dragOver ? (
          <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-(--biu-color-border) bg-(--biu-color-bg)/85 text-[14px] font-medium text-(--biu-color-text)">
            松开鼠标即可上传图片或文件到当前聊天
          </div>
        ) : null}
        <div className="absolute inset-0 z-1 flex min-h-0 overflow-hidden">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <BiuChatStage variant="center" stageRef={scrollRef}>
              <div className="chat-node-list pt-2" data-testid="channel-messages">
                {!activeThreadRootId && detail?.hasMoreMessages ? (
                  <div className="mb-3 flex justify-center">
                    <button
                      type="button"
                      disabled={loadingOlder}
                      data-testid="channel-load-older"
                      className="cursor-pointer rounded-full border-0 bg-(--biu-color-bg-subtle) px-3 py-1 text-[12px] text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text) disabled:opacity-50"
                      onClick={() => void handleLoadOlder()}
                    >
                      {loadingOlder ? '加载更早消息中…' : '加载更早消息'}
                    </button>
                  </div>
                ) : null}

                {messages.length === 0 && !loading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-2 flex items-center gap-2 text-[16px] font-semibold text-(--biu-color-text)">
                      {isDm ? (
                        <MemberAvatar avatar={peerAvatar} seed={channel?.peerAccountId || channelId} size={24} />
                      ) : null}
                      <span>{isDm ? `与 ${channel?.name ?? '成员'} 的私聊` : `# ${channel?.name ?? ''}`}</span>
                    </div>
                    <p className="max-w-md text-[13px] text-(--biu-color-text-subtle)">
                      {members.some((m) => m.memberType === 'agent')
                        ? '平常对话时群内 Agent 保持静默，输入 @Agent名称 或 @所有人 即可召唤对应 Agent 协作。'
                        : '直接发送消息开始对话，或在右侧悬浮面板拉入空间成员与你的 Agent。'}
                    </p>
                  </div>
                ) : null}

                {(() => {
                  let prevDayKey = ''
                  let shownUnreadDivider = false
                  return messages.map((msg) => {
                    const dayKey = calendarDayKey(msg.createdAt)
                    const showDayDivider = Boolean(dayKey) && dayKey !== prevDayKey
                    if (dayKey) prevDayKey = dayKey

                    const showUnreadDivider =
                      !shownUnreadDivider &&
                      unreadDividerSeq !== null &&
                      !msg.ephemeralTo &&
                      !msg.deletedAt &&
                      msg.seq > unreadDividerSeq &&
                      msg.senderId !== myAccountId
                    if (showUnreadDivider) shownUnreadDivider = true

                    const isEphemeral = Boolean(msg.ephemeralTo)
                    const isRecalled = Boolean(msg.deletedAt && msg.deletedAt > 0)
                    const isAgent = msg.senderType === 'agent'
                    const isSystemAgent = msg.senderType === 'system' && Boolean(msg.senderId)
                    const approvalMeta = msg.meta?.kind === 'approval' ? msg.meta : null
                    const sentLabel = formatSentAt(msg.createdAt)
                    const isSelf =
                      msg.senderType === 'account' &&
                      !isEphemeral &&
                      Boolean(myAccountId) &&
                      msg.senderId === myAccountId
                    const canEdit = isSelf && !isRecalled
                    const canRecall = !isEphemeral && !isRecalled && (isSelf || Boolean(detail?.canManageMembers))
                    const isEditing = editingMsgId === msg.id
                    const accountAvatar =
                      msg.senderType === 'account' ? resolveAvatar(msg.senderId, msg.senderAvatar) : undefined
                    const msgAttachments = msg.attachments ?? []

                    // 所有群聊消息统一使用 .chat-user-card + 底部 .user-turn-bar
                    const isHighlighted = highlightedMsgId === msg.id
                    const reactions = msg.reactions ?? []
                    const cardNode = (
                      <div
                        data-msg-id={msg.id}
                        className={`chat-user-card group !w-3/4 min-w-0 transition-shadow${isEphemeral ? ' opacity-95' : ''}${isHighlighted ? ' ring-2 ring-amber-400/80' : ''}`}
                      >
                        <div className="chat-user-card-body text-(--biu-color-text)">
                          {msg.pinnedAt && !isRecalled ? (
                            <div
                              className="mb-1.5 inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-500"
                              data-testid={`channel-msg-pinned-badge-${msg.id}`}
                            >
                              <BookmarkIcon className="size-3" />
                              <span>已置顶{msg.pinnedByName ? ` · ${msg.pinnedByName}` : ''}</span>
                            </div>
                          ) : null}
                          {msg.replyPreview && !isRecalled ? (
                            <div className="mb-1.5 flex items-center gap-1.5 border-l-2 border-(--biu-color-border) pl-2 text-(length:--biu-chat-ui-font-size) text-(--biu-color-text-subtle)">
                              <ArrowUturnLeftIcon className="size-3 shrink-0" />
                              <span className="shrink-0 font-medium">{msg.replyPreview.senderName}：</span>
                              <span className="truncate">{msg.replyPreview.text}</span>
                            </div>
                          ) : null}

                          {isRecalled ? (
                            <div
                              className="text-[13px] italic text-(--biu-color-text-subtle)"
                              data-testid={`channel-msg-recalled-${msg.id}`}
                            >
                              此消息已撤回
                            </div>
                          ) : isEditing ? (
                            <div className="space-y-2" data-testid={`channel-msg-editor-${msg.id}`}>
                              <textarea
                                rows={2}
                                value={editingDraft}
                                autoFocus
                                className="w-full resize-y rounded-md border border-(--biu-color-border) bg-(--biu-color-bg) px-2.5 py-1.5 text-[13.5px] text-(--biu-color-text) outline-none focus:border-(--biu-color-icon-active)"
                                onChange={(e) => setEditingDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault()
                                    setEditingMsgId(null)
                                    return
                                  }
                                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                    e.preventDefault()
                                    void commitEditMessage(msg.id)
                                  }
                                }}
                              />
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  className="h-7 px-2.5 text-[12px]"
                                  onClick={() => setEditingMsgId(null)}
                                >
                                  取消
                                </Button>
                                <Button
                                  className="h-7 px-2.5 text-[12px]"
                                  disabled={!editingDraft.trim() || savingEdit}
                                  data-testid={`channel-msg-edit-save-${msg.id}`}
                                  onClick={() => void commitEditMessage(msg.id)}
                                >
                                  {savingEdit ? '保存中…' : '保存'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {msg.text ? (
                                isAgent && !isEphemeral ? (
                                  <div className="chat-assistant-body">
                                    <MarkdownBody text={msg.text} />
                                  </div>
                                ) : isEphemeral ? (
                                  <div className="whitespace-pre-wrap break-words text-(--biu-color-text)">
                                    {msg.text}
                                  </div>
                                ) : (
                                  <ChannelMessageBody text={msg.text} mentions={msg.mentions} />
                                )
                              ) : null}

                              {msgAttachments.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2" data-testid={`channel-msg-attachments-${msg.id}`}>
                                  {msgAttachments.map((att) =>
                                    att.kind === 'image' ? (
                                      <button
                                        key={att.id}
                                        type="button"
                                        className="group/img relative cursor-zoom-in overflow-hidden rounded-lg border-0 bg-(--biu-color-bg-muted)/60 p-0"
                                        title={`点击查看大图：${att.name}`}
                                        onClick={() => setLightboxImage({ url: resolveAssetUrl(att.url), name: att.name })}
                                      >
                                        <img
                                          src={resolveAssetUrl(att.url)}
                                          alt={att.name}
                                          loading="lazy"
                                          className="block max-h-56 max-w-xs object-contain"
                                        />
                                      </button>
                                    ) : (
                                      <a
                                        key={att.id}
                                        href={resolveAssetUrl(att.url)}
                                        download={att.name}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex max-w-xs items-center gap-2 rounded-lg bg-(--biu-color-bg-muted)/70 px-2.5 py-1.5 text-[12px] text-(--biu-color-text) no-underline hover:bg-(--biu-color-bg-hover)"
                                      >
                                        <DocumentIcon className="size-4 shrink-0 text-(--biu-color-icon)" />
                                        <span className="truncate font-medium">{att.name}</span>
                                        {att.size > 0 ? (
                                          <span className="shrink-0 text-[11px] text-(--biu-color-text-subtle)">
                                            {formatFileSize(att.size)}
                                          </span>
                                        ) : null}
                                      </a>
                                    ),
                                  )}
                                </div>
                              ) : null}

                              {reactions.length > 0 ? (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid={`channel-msg-reactions-${msg.id}`}>
                                  {reactions.map((r) => (
                                    <button
                                      key={r.emoji}
                                      type="button"
                                      title={r.accountNames.join('、')}
                                      data-testid={`channel-msg-reaction-${msg.id}-${r.emoji}`}
                                      className={`inline-flex cursor-pointer items-center gap-1 rounded-full border-0 px-2 py-0.5 text-[12px] leading-none transition-colors ${
                                        r.reactedByMe
                                          ? 'bg-(--biu-color-bg-hover) font-medium text-(--biu-color-text) ring-1 ring-inset ring-(--biu-color-border)'
                                          : 'bg-(--biu-color-bg-muted)/70 text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover)'
                                      }`}
                                      onClick={() => void toggleChannelReaction(channelId, msg.id, r.emoji)}
                                    >
                                      <span>{r.emoji}</span>
                                      <span className="tabular-nums">{r.count}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : null}

                              {reactPickerMsgId === msg.id ? (
                                <div
                                  className="mt-2 inline-flex flex-wrap items-center gap-0.5 rounded-[var(--biu-radius-popover)] border border-(--biu-color-border-popover) bg-(--biu-color-bg-popover) p-1 shadow-(--biu-shadow-popover)"
                                  data-testid={`channel-msg-react-picker-${msg.id}`}
                                >
                                  {QUICK_REACTION_EMOJIS.map((em) => (
                                    <button
                                      key={em}
                                      type="button"
                                      className="grid size-7 cursor-pointer place-items-center rounded border-0 bg-transparent text-[15px] hover:bg-(--biu-color-bg-popover-hover)"
                                      onClick={() => {
                                        setReactPickerMsgId(null)
                                        void toggleChannelReaction(channelId, msg.id, em)
                                      }}
                                    >
                                      {em}
                                    </button>
                                  ))}
                                </div>
                              ) : null}

                              {!activeThreadRootId && msg.threadSummary && msg.threadSummary.replyCount > 0 ? (
                                <button
                                  type="button"
                                  data-testid={`channel-thread-bar-${msg.id}`}
                                  className="mt-2 inline-flex max-w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-md border-0 bg-(--biu-color-bg-muted)/60 px-2.5 py-1 text-[12px] text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
                                  onClick={() => openThread(msg.id)}
                                >
                                  <ChatBubbleLeftRightIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" />
                                  <span className="shrink-0 whitespace-nowrap font-medium text-(--biu-color-text)">
                                    {msg.threadSummary.replyCount} 条回复
                                  </span>
                                  {msg.threadSummary.participantNames.length > 0 ? (
                                    <span className="min-w-0 truncate text-[11.5px] text-(--biu-color-text-subtle)">
                                      {msg.threadSummary.participantNames.join('、')}
                                    </span>
                                  ) : null}
                                  <span className="shrink-0 whitespace-nowrap text-[11px] text-(--biu-color-text-subtle) tabular-nums">
                                    {formatSentAt(msg.threadSummary.lastReplyAt)}
                                  </span>
                                  <ChevronRightIcon className="size-3.5 shrink-0 opacity-70" />
                                </button>
                              ) : null}
                            </>
                          )}

                          {approvalMeta?.approvalId ? (
                            <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-(--biu-color-bg-muted) pt-2 text-(length:--biu-chat-ui-font-size)">
                              <ShieldCheckIcon className="size-4 text-(--biu-color-icon-active)" />
                              <span className="font-mono text-[12px] text-(--biu-color-text-muted)">
                                {approvalMeta.toolName}
                              </span>
                              {approvalMeta.status === 'pending' ? (
                                <div className="ml-auto flex items-center gap-1.5">
                                  <Button
                                    className="h-7 px-2.5 text-[12px]"
                                    disabled={decidingApproval === approvalMeta.approvalId}
                                    onClick={() => void handleApproval(approvalMeta.approvalId!, true)}
                                  >
                                    批准一次
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    className="h-7 px-2.5 text-[12px]"
                                    disabled={decidingApproval === approvalMeta.approvalId}
                                    onClick={() => void handleApproval(approvalMeta.approvalId!, false)}
                                  >
                                    拒绝
                                  </Button>
                                </div>
                              ) : (
                                <span className="ml-auto text-(--biu-color-text-subtle)">
                                  {approvalMeta.status === 'allowed' ? '已批准' : '已拒绝'}
                                </span>
                              )}
                            </div>
                          ) : null}
                        </div>

                        <div
                          className={`user-turn-bar box-border flex min-h-[30px] w-full items-center justify-between gap-3 overflow-hidden border-0 border-t border-(--biu-color-bg-muted) bg-(--biu-color-bg-subtle) px-(--biu-chat-pad-x) text-(length:--biu-chat-ui-font-size) leading-none text-(--biu-color-text-muted)${isSelf ? ' flex-row-reverse' : ''}`}
                          aria-label="消息摘要"
                        >
                          <div className={`flex min-h-full min-w-0 flex-1 items-center gap-2${isSelf ? ' flex-row-reverse' : ''}`}>
                            {isAgent || isSystemAgent ? (
                              <button
                                type="button"
                                className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-(--biu-color-text-muted) hover:text-(--biu-color-text)"
                                title={`查看 ${msg.senderName}`}
                                data-testid="channel-msg-avatar"
                                onClick={() => handleAgentClick(msg.senderId)}
                              >
                                <SidebarMascot
                                  size={16}
                                  sessionId={msg.senderId}
                                  identity={resolveSessionMascot(msg.senderId, msg.senderMascot)}
                                  animate={false}
                                  title=""
                                />
                                <span className="truncate font-medium">{msg.senderName}</span>
                              </button>
                            ) : (
                              <span
                                className={`inline-flex min-w-0 items-center gap-1.5${isSelf ? ' flex-row-reverse' : ''}`}
                                title={msg.viaAgentName ? `${msg.senderName}（由 ${msg.viaAgentName} 代发）` : msg.senderName}
                                data-testid="channel-msg-avatar"
                              >
                                <MemberAvatar avatar={accountAvatar} seed={msg.senderId} size={16} />
                                <span className="truncate font-medium">{msg.senderName}</span>
                                {msg.viaAgentId ? (
                                  <span
                                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-(--biu-color-bg-muted) px-1.5 py-0.5 text-[11px] font-normal text-(--biu-color-text-muted)"
                                    title={`由 Agent「${msg.viaAgentName || msg.viaAgentId}」代发`}
                                    data-testid="channel-msg-via-agent"
                                  >
                                    <SidebarMascot
                                      size={13}
                                      sessionId={msg.viaAgentId}
                                      identity={resolveSessionMascot(msg.viaAgentId, msg.viaAgentMascot)}
                                      animate={false}
                                      title=""
                                    />
                                    <span className="max-w-[110px] truncate">{msg.viaAgentName || msg.viaAgentId}</span>
                                  </span>
                                ) : null}
                              </span>
                            )}

                            {msg.traceId && (isAgent || isSystemAgent) ? (
                              <button
                                type="button"
                                className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-(length:--biu-chat-ui-font-size) leading-none text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
                                data-testid={isAgent ? `channel-msg-trace-${msg.traceId}` : `channel-sys-trace-${msg.traceId}`}
                                onClick={() => openChannelRunTrace(channelId, msg.traceId)}
                              >
                                <ChevronRightIcon className="size-3.5" />
                                <span>Details</span>
                              </button>
                            ) : null}

                            {isEphemeral ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-(--biu-color-bg-muted) px-1.5 py-0.5 text-[11px] text-(--biu-color-text-subtle)">
                                <EyeIcon className="size-3" />
                                仅你可见
                              </span>
                            ) : !isRecalled ? (
                              <div className="inline-flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                <button
                                  type="button"
                                  className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-(--biu-color-text-subtle) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
                                  title="添加表情回应"
                                  aria-label="添加表情回应"
                                  data-testid={`channel-msg-react-${msg.id}`}
                                  onClick={() => setReactPickerMsgId((cur) => (cur === msg.id ? null : msg.id))}
                                >
                                  <FaceSmileIcon className="size-3.5" />
                                </button>
                                {!activeThreadRootId ? (
                                  <button
                                    type="button"
                                    className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-(--biu-color-text-subtle) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
                                    title="在讨论串中展开回复"
                                    aria-label="在讨论串中展开回复"
                                    data-testid={`channel-msg-thread-${msg.id}`}
                                    onClick={() => openThread(msg.id)}
                                  >
                                    <ChatBubbleLeftRightIcon className="size-3.5" />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-(--biu-color-text-subtle) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
                                  title="更多操作"
                                  aria-label="更多操作"
                                  data-testid={`channel-msg-more-${msg.id}`}
                                  onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    const menuW = 168
                                    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuW - 8))
                                    const top = Math.min(rect.bottom + 4, window.innerHeight - 260)
                                    setMsgMenu((cur) => (cur?.msg.id === msg.id ? null : { msg, top, left }))
                                  }}
                                >
                                  <EllipsisHorizontalIcon className="size-3.5" />
                                </button>
                              </div>
                            ) : null}
                          </div>

                          <div className="inline-flex shrink-0 items-center gap-1.5">
                            {msg.editedAt && !isRecalled ? (
                              <span
                                className="text-[11px] text-(--biu-color-text-subtle)"
                                data-testid={`channel-msg-edited-${msg.id}`}
                              >
                                已编辑
                              </span>
                            ) : null}
                            {sentLabel ? (
                              <span
                                className="inline-flex shrink-0 items-center gap-1 text-(length:--biu-chat-ui-font-size) leading-none text-(--biu-color-text-muted) tabular-nums"
                                title="发送时间"
                              >
                                <ClockIcon className="size-3" aria-hidden />
                                <span>{sentLabel}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )

                    const isThreadRootCard = Boolean(activeThreadRootId) && msg.id === activeThreadRootId
                    return (
                      <div key={msg.id} className="w-full space-y-2">
                        {!activeThreadRootId && showDayDivider ? (
                          <div className="my-2 flex items-center gap-3" data-testid="channel-day-divider">
                            <span className="h-px flex-1 bg-(--biu-color-bg-muted)" />
                            <span className="text-[11px] font-medium text-(--biu-color-text-subtle)">
                              {formatDayDivider(msg.createdAt)}
                            </span>
                            <span className="h-px flex-1 bg-(--biu-color-bg-muted)" />
                          </div>
                        ) : null}
                        {!activeThreadRootId && showUnreadDivider ? (
                          <div className="my-2 flex items-center gap-3" data-testid="channel-unread-divider">
                            <span className="h-px flex-1 bg-rose-500/40" />
                            <span className="text-[11px] font-medium text-rose-500">以下是新消息</span>
                            <span className="h-px flex-1 bg-rose-500/40" />
                          </div>
                        ) : null}
                        <div
                          data-testid={
                            isEphemeral
                              ? 'channel-ephemeral-msg'
                              : activeThreadRootId && !isThreadRootCard
                                ? `channel-thread-reply-${msg.id}`
                                : 'channel-message'
                          }
                          data-sender-type={msg.senderType}
                          data-self={isSelf ? 'true' : 'false'}
                          className={`flex w-full items-start ${isSelf ? 'justify-end' : 'justify-start'}`}
                        >
                          {cardNode}
                        </div>
                        {isThreadRootCard ? (
                          <div className="my-3 flex items-center gap-3" data-testid="channel-thread-divider">
                            <span className="h-px flex-1 bg-(--biu-color-bg-muted)" />
                            <span className="text-[11.5px] font-medium text-(--biu-color-text-subtle)">
                              {threadReplies.length > 0
                                ? `${threadReplies.length} 条讨论串回复`
                                : '暂无回复 · 在下方输入即可开启讨论串'}
                            </span>
                            <span className="h-px flex-1 bg-(--biu-color-bg-muted)" />
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                })()}
              </div>
            </BiuChatStage>

            {/* 底部悬浮胶囊发送栏：完全复用 .chat-composer-dock + .composer-stack + .composer-pill */}
            <div className="chat-composer-dock pointer-events-none absolute inset-x-0 bottom-0 bg-transparent px-[var(--biu-pad-page)] pb-[calc(1rem+5px)]">
              <ChatDockStack>
                <div className="composer-stack" data-biu-ignore>
                  {pendingNewCount > 0 ? (
                    <div className="pointer-events-auto flex justify-center">
                      <button
                        type="button"
                        data-testid="channel-new-messages-pill"
                        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-(--biu-color-border) bg-(--biu-color-bg) px-3 py-1 text-[12px] font-medium text-(--biu-color-text) shadow-sm hover:bg-(--biu-color-bg-hover)"
                        onClick={scrollToBottom}
                      >
                        <ArrowDownIcon className="size-3.5" />
                        <span>{pendingNewCount} 条新消息</span>
                      </button>
                    </div>
                  ) : null}
                  {/* 忙碌/排队状态条（Slack 模式：主聊天流不吐字，点击在右侧检查器看实时吐字） */}
                  {activities.length > 0 ? (
                    <div className="space-y-1.5" data-testid="channel-busy-bar">
                      {activities.map((act) => (
                        <div key={act.runId} className="composer-goal is-pursuing">
                          <span className="composer-goal-mark" aria-hidden>
                            <SidebarMascot
                              size={18}
                              sessionId={act.agentId}
                              identity={resolveSessionMascot(act.agentId, act.agentMascot)}
                              busy
                              animate={false}
                              title=""
                            />
                          </span>
                          <button
                            type="button"
                            className="composer-goal-text cursor-pointer border-0 bg-transparent p-0 text-left hover:underline"
                            title="点击在右侧检查器查看实时执行过程"
                            onClick={() => openChannelRunTrace(channelId, act.runId)}
                          >
                            <span>{act.agentName}</span>
                            <span className="ml-2 font-normal text-(--biu-color-text-muted)">
                              {act.stepLabel}
                              {act.queueCount > 0 ? ` · 排队 ${act.queueCount}` : ''}
                            </span>
                          </button>
                          {act.canCancel ? (
                            <div className="composer-goal-actions">
                              <button
                                type="button"
                                className="composer-stop"
                                title="中止本次回复"
                                aria-label={`中止 ${act.agentName}`}
                                onClick={() => void cancelChannelRun(channelId, act.runId)}
                              >
                                <span className="composer-stop-square" aria-hidden />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {activeTypingUsers.length > 0 ? (
                    <div
                      className="px-2 text-[12px] text-(--biu-color-text-subtle)"
                      data-testid="channel-typing-indicator"
                    >
                      {activeTypingUsers.map((u) => u.accountName).join('、')} 正在输入…
                    </div>
                  ) : null}

                  {error ? (
                    <div className="scfg-error !mb-0" role="alert">
                      {error}
                    </div>
                  ) : null}

                  <ChannelComposer
                    ref={composerRef}
                    channelId={channelId}
                    threadRootId={activeThreadRootId}
                    isDm={isDm}
                    members={members}
                    resolveAvatar={resolveAvatar}
                    replyTo={replyTo}
                    onClearReplyTo={clearReplyTo}
                    onError={setError}
                    pick={pick}
                  />
                </div>
              </ChatDockStack>
            </div>
          </div>
        </div>

        {/* 聊天窗内部右侧悬浮控制面板：收起为等大头像轨，原地承载 成员 / 搜索 / 置顶 / 收藏 / 总结 / 管理 / 名片（零中心弹窗） */}
        {members.length > 0 || floatingTab !== null ? (
          <ChannelFloatingSidebar
            channelId={channelId}
            channel={channel}
            isDm={isDm}
            members={members}
            activities={activities}
            myAccountId={myAccountId}
            canManageMembers={Boolean(detail?.canManageMembers)}
            pinnedMessageCount={mainMessages.filter((m) => m.pinnedAt && !m.deletedAt).length}
            useSessionView={useSessionView}
            activeTab={floatingTab}
            onChangeTab={setFloatingTab}
            inspectedAgentCard={agentCard}
            onCloseAgentCard={() => setAgentCard(null)}
            resolveAvatar={resolveAvatar}
            isOnline={isOnline}
            onMention={(mention) => composerRef.current?.insertMention(mention)}
            onAgentClick={handleAgentClick}
            onOpenDm={(targetAccountId) => {
              void openOrCreateDm(targetAccountId)
                .then((res) => navigate(channelAppPath(res.channel.id)))
                .catch((err) => setError(err instanceof Error ? err.message : String(err)))
            }}
            onLeftChannel={() => {
              setFloatingTab(null)
              navigate('/')
            }}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            searchSenderId={searchSenderId}
            onSearchSenderChange={setSearchSenderId}
            searchHits={searchHits}
            searching={searching}
            onJumpToMessage={(msgId) => {
              if (activeThreadRootId) closeThread()
              void jumpToMessage(msgId)
            }}
            pinnedMessages={pinnedMessages}
            onOpenPins={openPinsPanel}
            onUnpinMessage={(msgId) => {
              void toggleChannelPinMessage(channelId, msgId).then(() =>
                setPinnedMessages((prev) => prev.filter((x) => x.id !== msgId)),
              )
            }}
            savedMessages={savedMessages}
            onOpenSaved={openSavedPanel}
            onJumpToSavedMessage={(item) => {
              if (item.channelId === channelId) {
                if (activeThreadRootId) closeThread()
                void jumpToMessage(item.message.id)
              } else {
                navigate(`${channelAppPath(item.channelId)}?msg=${encodeURIComponent(item.message.id)}`)
              }
            }}
            onUnsaveMessage={(item) => {
              void toggleChannelSaveMessage(item.channelId, item.message.id).then(() =>
                setSavedMessages((prev) => prev.filter((x) => x.message.id !== item.message.id)),
              )
            }}
            summaryState={summaryState}
            onSummarize={(unreadOnly) => handleSummarize(Boolean(unreadOnly))}
            onSaveSummaryAsPage={() => {
              const title = `${channel?.name || '聊天'} · ${summaryState.scopeLabel}总结`
              void saveChannelContentAsPage(title, summaryState.summary)
                .then((created) => {
                  setSavedPageNotice(created)
                })
                .catch((err) =>
                  setSummaryState((prev) => ({
                    ...prev,
                    error: err instanceof Error ? err.message : String(err),
                  })),
                )
            }}
            onToggleChannelPinned={() => {
              void updateChannelPreferences(channelId, { pinned: !channel?.pinned }).catch((err) =>
                setError(err instanceof Error ? err.message : String(err)),
              )
            }}
            onToggleChannelMuted={() => {
              void updateChannelPreferences(channelId, { muted: !channel?.muted }).catch((err) =>
                setError(err instanceof Error ? err.message : String(err)),
              )
            }}
          />
        ) : null}
      </div>

      {/* 单条消息「⋯ 更多」浮动菜单（Portal 渲染，避免被 .chat-user-card overflow:hidden 裁切） */}
      {msgMenu
        ? (() => {
            const targetMsg = msgMenu.msg
            const mIsAgent = targetMsg.senderType === 'agent'
            const mIsSelf =
              targetMsg.senderType === 'account' &&
              !targetMsg.ephemeralTo &&
              Boolean(myAccountId) &&
              targetMsg.senderId === myAccountId
            const mCanEdit = mIsSelf && !targetMsg.deletedAt
            const mCanRecall = !targetMsg.ephemeralTo && !targetMsg.deletedAt && (mIsSelf || Boolean(detail?.canManageMembers))
            const mIsOwnAgent = mIsAgent && Boolean(memberById.get(`agent:${targetMsg.senderId}`)?.isOwn)
            return createPortal(
              <div
                data-testid="channel-msg-more-menu"
                role="menu"
                style={{ top: msgMenu.top, left: msgMenu.left }}
                className="fixed z-50 w-44 rounded-[var(--biu-radius-popover)] border border-(--biu-color-border-popover) bg-(--biu-color-bg-popover) p-1 shadow-(--biu-shadow-popover)"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] text-(--biu-color-text) hover:bg-(--biu-color-bg-popover-hover)"
                  onClick={() => {
                    setMsgMenu(null)
                    setReplyTo(targetMsg)
                    composerRef.current?.focus()
                  }}
                >
                  <ArrowUturnLeftIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" />
                  <span>引用回复</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] text-(--biu-color-text) hover:bg-(--biu-color-bg-popover-hover)"
                  onClick={() => {
                    setMsgMenu(null)
                    if (targetMsg.text.trim()) void navigator.clipboard?.writeText(targetMsg.text)
                  }}
                >
                  <Square2StackIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" />
                  <span>复制内容</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid={`channel-msg-pin-${targetMsg.id}`}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] text-(--biu-color-text) hover:bg-(--biu-color-bg-popover-hover)"
                  onClick={() => {
                    setMsgMenu(null)
                    void toggleChannelPinMessage(channelId, targetMsg.id)
                  }}
                >
                  <BookmarkIcon className={`size-3.5 shrink-0 ${targetMsg.pinnedAt ? 'text-amber-500' : 'text-(--biu-color-icon)'}`} />
                  <span>{targetMsg.pinnedAt ? '取消置顶' : '置顶消息'}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid={`channel-msg-save-${targetMsg.id}`}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] text-(--biu-color-text) hover:bg-(--biu-color-bg-popover-hover)"
                  onClick={() => {
                    setMsgMenu(null)
                    void toggleChannelSaveMessage(channelId, targetMsg.id)
                  }}
                >
                  <StarIcon className={`size-3.5 shrink-0 ${targetMsg.savedByMe ? 'text-amber-400' : 'text-(--biu-color-icon)'}`} />
                  <span>{targetMsg.savedByMe ? '取消收藏' : '收藏消息'}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid={`channel-msg-to-page-${targetMsg.id}`}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] text-(--biu-color-text) hover:bg-(--biu-color-bg-popover-hover)"
                  onClick={() => {
                    setMsgMenu(null)
                    void handleSaveMessageAsPage(targetMsg)
                  }}
                >
                  <DocumentPlusIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" />
                  <span>存为页面</span>
                </button>
                {mIsOwnAgent ? (
                  <button
                    type="button"
                    role="menuitem"
                    data-testid={`channel-msg-sync-${targetMsg.id}`}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] text-(--biu-color-text) hover:bg-(--biu-color-bg-popover-hover)"
                    onClick={() => {
                      setMsgMenu(null)
                      void syncChannelToAgent(channelId, targetMsg.senderId, targetMsg.id)
                        .then(() => {
                          setSyncedMsgIds((prev) => ({ ...prev, [targetMsg.id]: true }))
                          window.setTimeout(() => {
                            setSyncedMsgIds((prev) => ({ ...prev, [targetMsg.id]: false }))
                          }, 1800)
                        })
                        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                    }}
                  >
                    {syncedMsgIds[targetMsg.id] ? (
                      <CheckIcon className="size-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <BookmarkSquareIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" />
                    )}
                    <span>{syncedMsgIds[targetMsg.id] ? '已同步到 1v1' : '同步到 1v1'}</span>
                  </button>
                ) : null}
                {mCanEdit ? (
                  <button
                    type="button"
                    role="menuitem"
                    data-testid={`channel-msg-edit-${targetMsg.id}`}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] text-(--biu-color-text) hover:bg-(--biu-color-bg-popover-hover)"
                    onClick={() => {
                      setMsgMenu(null)
                      setEditingMsgId(targetMsg.id)
                      setEditingDraft(targetMsg.text)
                    }}
                  >
                    <PencilSquareIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" />
                    <span>编辑</span>
                  </button>
                ) : null}
                {mCanRecall ? (
                  <button
                    type="button"
                    role="menuitem"
                    data-testid={`channel-msg-recall-${targetMsg.id}`}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[12.5px] text-(--biu-color-danger) hover:bg-(--biu-color-bg-popover-hover)"
                    onClick={() => {
                      setMsgMenu(null)
                      void handleRecallMessage(targetMsg.id)
                    }}
                  >
                    <TrashIcon className="size-3.5 shrink-0" />
                    <span>撤回</span>
                  </button>
                ) : null}
              </div>,
              document.body,
            )
          })()
        : null}

      {/* 图片大图预览 Lightbox */}
      {lightboxImage
        ? createPortal(
            <div
              className="biu-float-overlay"
              onClick={() => setLightboxImage(null)}
              data-testid="channel-image-lightbox"
            >
              <div
                className="relative flex max-h-[90vh] max-w-[90vw] flex-col items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={resolveAssetUrl(lightboxImage.url)}
                  alt={lightboxImage.name}
                  className="max-h-[82vh] max-w-[88vw] rounded-lg object-contain shadow-2xl"
                />
                <div className="flex items-center gap-3 text-[12px] text-white/90">
                  <span className="max-w-md truncate">{lightboxImage.name}</span>
                  <a
                    href={resolveAssetUrl(lightboxImage.url)}
                    download={lightboxImage.name}
                    className="underline hover:text-white"
                  >
                    下载原图
                  </a>
                  <button
                    type="button"
                    className="cursor-pointer rounded bg-white/15 px-2 py-0.5 text-white hover:bg-white/25"
                    onClick={() => setLightboxImage(null)}
                  >
                    关闭
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

    </div>
  )
})
