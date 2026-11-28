import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowDownIcon,
  ArrowRightStartOnRectangleIcon,
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
  UserPlusIcon,
  XMarkIcon,
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
  ChannelAgentContextMode,
  ChannelMemberView,
  ChannelMention,
  ChannelMessageView,
  ChannelSavedMessageView,
  ChannelSearchHit,
  ChannelSummary,
} from '../shared/channel-types.ts'
import { ChannelComposer, type ChannelComposerHandle } from './channel-composer.tsx'
import { MarkdownBody } from './markdown.tsx'
import {
  addChannelMember,
  autoNameChannel,
  cancelChannelRun,
  decideChannelApproval,
  editChannelMessage,
  leaveChannel,
  loadChannelDetail,
  loadChannelMessagesAround,
  loadChannelPins,
  loadChannelThread,
  loadOlderChannelMessages,
  loadSavedChannelMessages,
  markChannelRead,
  openChannelRunTrace,
  recallChannelMessage,
  removeChannelMember,
  renameChannel,
  saveChannelContentAsPage,
  searchChannelMessages,
  setActiveChannelId,
  summarizeChannel,
  syncChannelToAgent,
  toggleChannelPinMessage,
  toggleChannelReaction,
  toggleChannelSaveMessage,
  updateChannelAgentContextMode,
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
  const [membersModalOpen, setMembersModalOpen] = useState(false)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [msgMenu, setMsgMenu] = useState<{ msg: ChannelMessageView; top: number; left: number } | null>(null)
  const [pinsModalOpen, setPinsModalOpen] = useState(false)
  const [pinnedMessages, setPinnedMessages] = useState<ChannelMessageView[]>([])
  const [savedModalOpen, setSavedModalOpen] = useState(false)
  const [savedMessages, setSavedMessages] = useState<ChannelSavedMessageView[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchSenderId, setSearchSenderId] = useState('')
  const [searchHits, setSearchHits] = useState<ChannelSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null)
  const [reactPickerMsgId, setReactPickerMsgId] = useState<string | null>(null)
  const [summaryModal, setSummaryModal] = useState<{
    open: boolean
    loading: boolean
    summary: string
    messageCount: number
    scopeLabel: string
    error: string
  }>({ open: false, loading: false, summary: '', messageCount: 0, scopeLabel: '近期消息', error: '' })
  const [savedPageNotice, setSavedPageNotice] = useState<{ id: string; title: string } | null>(null)
  const [typingTick, setTypingTick] = useState(0)
  const [agentCard, setAgentCard] = useState<ChannelMemberView | null>(null)
  const [decidingApproval, setDecidingApproval] = useState<string | null>(null)
  const [namingTitle, setNamingTitle] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [syncedMsgIds, setSyncedMsgIds] = useState<Record<string, boolean>>({})
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
    if (!searchOpen) return
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
  }, [channelId, searchOpen, searchQuery, searchSenderId])

  const openPinsModal = useCallback(() => {
    setPinsModalOpen(true)
    void loadChannelPins(channelId).then(setPinnedMessages)
  }, [channelId])

  const openSavedModal = useCallback(() => {
    setSavedModalOpen(true)
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
      setSummaryModal({
        open: true,
        loading: true,
        summary: '',
        messageCount: 0,
        scopeLabel: unreadOnly ? '未读消息' : '近期消息',
        error: '',
      })
      void summarizeChannel(channelId, unreadOnly)
        .then((res) => {
          setSummaryModal({
            open: true,
            loading: false,
            summary: res.summary,
            messageCount: res.messageCount,
            scopeLabel: res.scopeLabel,
            error: '',
          })
        })
        .catch((err) => {
          setSummaryModal((prev) => ({
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
  const agentMembers = members.filter((m) => m.memberType === 'agent')
  const humanMembers = members.filter((m) => m.memberType === 'account')
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
            className={`inline-flex h-[var(--biu-size-control-md)] cursor-pointer items-center gap-1 rounded-[6px] border-0 bg-transparent px-2 text-[12px] font-medium transition-colors hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)${searchOpen ? ' bg-(--biu-color-bg-hover) text-(--biu-color-text)' : ' text-(--biu-color-text-muted)'}`}
            title="搜索本聊天记录"
            aria-label="搜索聊天记录"
            data-testid="channel-search-toggle"
            onClick={() => setSearchOpen((v) => !v)}
          >
            <MagnifyingGlassIcon className="size-3.5 shrink-0" />
          </button>
          <button
            type="button"
            className="inline-flex h-[var(--biu-size-control-md)] cursor-pointer items-center gap-1.5 rounded-[6px] border-0 bg-transparent px-2 text-[12px] font-medium text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
            title="管理群成员、偏好与 Agent"
            data-testid="channel-manage-members"
            onClick={() => setMembersModalOpen(true)}
          >
            <UserGroupIcon className="size-3.5 shrink-0 text-(--biu-color-icon-active)" />
            <span className="tabular-nums whitespace-nowrap">
              {humanMembers.length} 人{agentMembers.length > 0 ? ` · ${agentMembers.length} Agent` : ''}
            </span>
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
                    openPinsModal()
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
                    openSavedModal()
                  }}
                >
                  <StarIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" />
                  <span>我的收藏</span>
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

      {/* 群内聊天记录搜索条 */}
      {searchOpen ? (
        <div
          className="bg-(--biu-color-bg-subtle) px-4 py-2"
          data-testid="channel-search-panel"
        >
          <div className="mx-auto flex max-w-[var(--biu-chat-max-w,760px)] flex-wrap items-center gap-2">
            <div className="relative flex min-w-[200px] flex-1 items-center">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 size-3.5 text-(--biu-color-text-subtle)" />
              <input
                type="search"
                value={searchQuery}
                autoFocus
                placeholder="搜索本聊天记录或附件文件名…"
                aria-label="搜索聊天记录"
                data-testid="channel-search-input"
                className="h-8 w-full rounded-md border-0 bg-(--biu-color-bg) pr-2 pl-8 text-[12.5px] text-(--biu-color-text) outline-none ring-1 ring-inset ring-(--biu-color-border) focus:ring-(--biu-color-icon-active)"
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSearchOpen(false)
                }}
              />
            </div>
            <select
              value={searchSenderId}
              aria-label="按发送人筛选"
              data-testid="channel-search-sender"
              className="h-8 rounded-md border-0 bg-(--biu-color-bg) px-2 text-[12px] text-(--biu-color-text) ring-1 ring-inset ring-(--biu-color-border)"
              onChange={(e) => setSearchSenderId(e.target.value)}
            >
              <option value="">全部发送人</option>
              {members.map((m) => (
                <option key={`${m.memberType}:${m.memberId}`} value={m.memberId}>
                  {m.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover)"
              title="关闭搜索"
              onClick={() => setSearchOpen(false)}
            >
              <XMarkIcon className="size-4" />
            </button>
          </div>
          {searchQuery.trim() ? (
            <div className="mx-auto mt-2 max-h-56 max-w-[var(--biu-chat-max-w,760px)] overflow-y-auto rounded-[var(--biu-radius-popover)] border border-(--biu-color-border-popover) bg-(--biu-color-bg-popover) p-1 shadow-(--biu-shadow-popover)">
              {searching ? (
                <div className="px-3 py-2 text-[12px] text-(--biu-color-text-subtle)">搜索中…</div>
              ) : searchHits.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-(--biu-color-text-subtle)">未找到匹配消息</div>
              ) : (
                searchHits.map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    data-testid={`channel-search-hit-${hit.id}`}
                    className="flex w-full cursor-pointer items-start justify-between gap-2 rounded-md border-0 bg-transparent px-2.5 py-2 text-left text-[12.5px] hover:bg-(--biu-color-bg-popover-hover)"
                    onClick={() => {
                      if (activeThreadRootId) closeThread()
                      void jumpToMessage(hit.id)
                      setSearchOpen(false)
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-(--biu-color-text)">{hit.senderName}</span>
                      <span className="ml-2 text-(--biu-color-text-muted)">{hit.text.slice(0, 120)}</span>
                    </div>
                    <span className="shrink-0 text-[11px] text-(--biu-color-text-subtle) tabular-nums">
                      {formatSentAt(hit.createdAt)}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
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
                      {agentMembers.length > 0
                        ? '平常对话时群内 Agent 保持静默，输入 @Agent名称 或 @所有人 即可召唤对应 Agent 协作。'
                        : '直接发送消息开始对话，或点击右上角成员按钮拉入空间成员与你的 Agent。'}
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

      {/* AI 聊天要点总结弹窗 */}
      {summaryModal.open
        ? createPortal(
            <div
              className="biu-float-overlay"
              onClick={() => setSummaryModal((prev) => ({ ...prev, open: false }))}
              data-testid="channel-summary-modal"
            >
              <div
                className="biu-float scfg-float !w-[min(560px,calc(100vw-32px))]"
                role="dialog"
                aria-modal="true"
                aria-label="AI 聊天要点总结"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="biu-float-head scfg-head">
                  <div className="flex items-center gap-2">
                    <SparklesIcon className="size-4 text-(--biu-color-icon-active)" />
                    <h2 className="biu-float-title scfg-title">
                      聊天要点总结 · {summaryModal.scopeLabel}
                      {summaryModal.messageCount > 0 ? `（${summaryModal.messageCount} 条）` : ''}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="biu-float-close"
                    aria-label="关闭"
                    onClick={() => setSummaryModal((prev) => ({ ...prev, open: false }))}
                  >
                    <XMarkIcon className="size-4 shrink-0" />
                  </button>
                </div>
                <div className="scfg-body space-y-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant={summaryModal.scopeLabel === '近期消息' ? 'default' : 'secondary'}
                      className="h-7 px-2.5 text-[12px]"
                      disabled={summaryModal.loading}
                      onClick={() => handleSummarize(false)}
                    >
                      总结近期消息
                    </Button>
                    <Button
                      variant={summaryModal.scopeLabel === '未读消息' ? 'default' : 'secondary'}
                      className="h-7 px-2.5 text-[12px]"
                      disabled={summaryModal.loading}
                      onClick={() => handleSummarize(true)}
                    >
                      仅总结未读
                    </Button>
                  </div>
                  {summaryModal.loading ? (
                    <div className="py-6 text-center text-[13px] text-(--biu-color-text-subtle)">正在提炼聊天要点…</div>
                  ) : summaryModal.error ? (
                    <div className="scfg-error">{summaryModal.error}</div>
                  ) : (
                    <>
                      <div className="max-h-[52vh] overflow-y-auto rounded-[var(--biu-radius-md)] bg-(--biu-color-bg-subtle) p-3 text-[13px]">
                        <MarkdownBody text={summaryModal.summary} />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="secondary"
                          className="h-8 px-3 text-[12px]"
                          onClick={() => void navigator.clipboard?.writeText(summaryModal.summary)}
                        >
                          复制摘要
                        </Button>
                        <Button
                          className="h-8 px-3 text-[12px]"
                          data-testid="channel-summary-save-page"
                          onClick={() => {
                            const title = `${channel?.name || '聊天'} · ${summaryModal.scopeLabel}总结`
                            void saveChannelContentAsPage(title, summaryModal.summary)
                              .then((created) => {
                                setSummaryModal((prev) => ({ ...prev, open: false }))
                                setSavedPageNotice(created)
                              })
                              .catch((err) =>
                                setSummaryModal((prev) => ({
                                  ...prev,
                                  error: err instanceof Error ? err.message : String(err),
                                })),
                              )
                          }}
                        >
                          存为页面
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
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

      {/* 置顶消息弹窗 */}
      {pinsModalOpen
        ? createPortal(
            <div className="biu-float-overlay" onClick={() => setPinsModalOpen(false)} data-testid="channel-pins-modal">
              <div
                className="biu-float scfg-float !w-[min(520px,calc(100vw-32px))]"
                role="dialog"
                aria-modal="true"
                aria-label="置顶消息"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="biu-float-head scfg-head">
                  <h2 className="biu-float-title scfg-title">置顶消息</h2>
                  <button type="button" className="biu-float-close" aria-label="关闭" onClick={() => setPinsModalOpen(false)}>
                    <XMarkIcon className="size-4 shrink-0" />
                  </button>
                </div>
                <div className="scfg-body">
                  {pinnedMessages.length === 0 ? (
                    <div className="scfg-hint">当前聊天暂无置顶消息</div>
                  ) : (
                    <div className="space-y-2">
                      {pinnedMessages.map((pm) => (
                        <div
                          key={pm.id}
                          className="rounded-[var(--biu-radius-md)] bg-(--biu-color-bg-subtle) p-3"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2 text-[12px] text-(--biu-color-text-muted)">
                            <span className="font-medium text-(--biu-color-text)">{pm.senderName}</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-(--biu-color-text-muted) hover:text-(--biu-color-text) hover:underline"
                                onClick={() => {
                                  setPinsModalOpen(false)
                                  void jumpToMessage(pm.id)
                                }}
                              >
                                定位消息
                              </button>
                              <button
                                type="button"
                                className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-(--biu-color-danger) hover:underline"
                                onClick={() => {
                                  void toggleChannelPinMessage(channelId, pm.id).then(() =>
                                    setPinnedMessages((prev) => prev.filter((x) => x.id !== pm.id)),
                                  )
                                }}
                              >
                                取消置顶
                              </button>
                            </div>
                          </div>
                          <div className="text-[13px] text-(--biu-color-text)">{pm.text || '[附件消息]'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* 我的收藏消息弹窗 */}
      {savedModalOpen
        ? createPortal(
            <div className="biu-float-overlay" onClick={() => setSavedModalOpen(false)} data-testid="channel-saved-modal">
              <div
                className="biu-float scfg-float !w-[min(520px,calc(100vw-32px))]"
                role="dialog"
                aria-modal="true"
                aria-label="我的消息收藏"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="biu-float-head scfg-head">
                  <h2 className="biu-float-title scfg-title">我的消息收藏</h2>
                  <button type="button" className="biu-float-close" aria-label="关闭" onClick={() => setSavedModalOpen(false)}>
                    <XMarkIcon className="size-4 shrink-0" />
                  </button>
                </div>
                <div className="scfg-body">
                  {savedMessages.length === 0 ? (
                    <div className="scfg-hint">暂无收藏的消息</div>
                  ) : (
                    <div className="space-y-2">
                      {savedMessages.map((item) => (
                        <div
                          key={item.message.id}
                          className="rounded-[var(--biu-radius-md)] bg-(--biu-color-bg-subtle) p-3"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2 text-[12px] text-(--biu-color-text-muted)">
                            <span>
                              <span className="font-medium text-(--biu-color-text)">{item.message.senderName}</span>
                              <span className="ml-1.5">· #{item.channelName}</span>
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-(--biu-color-text-muted) hover:text-(--biu-color-text) hover:underline"
                                onClick={() => {
                                  setSavedModalOpen(false)
                                  if (item.channelId === channelId) {
                                    void jumpToMessage(item.message.id)
                                  } else {
                                    navigate(`${channelAppPath(item.channelId)}?msg=${encodeURIComponent(item.message.id)}`)
                                  }
                                }}
                              >
                                前往查看
                              </button>
                              <button
                                type="button"
                                className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-(--biu-color-danger) hover:underline"
                                onClick={() => {
                                  void toggleChannelSaveMessage(item.channelId, item.message.id).then(() =>
                                    setSavedMessages((prev) => prev.filter((x) => x.message.id !== item.message.id)),
                                  )
                                }}
                              >
                                移出收藏
                              </button>
                            </div>
                          </div>
                          <div className="text-[13px] text-(--biu-color-text)">{item.message.text || '[附件消息]'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* 群成员与 Agent 管理弹窗：统一使用 .biu-float-overlay + .biu-float.scfg-float */}
      {membersModalOpen && detail ? (
        <ChannelMembersModal
          channelId={channelId}
          channel={detail.channel}
          members={members}
          myAccountId={detail.myAccountId}
          canManageMembers={detail.canManageMembers}
          useSessionView={useSessionView}
          resolveAvatar={resolveAvatar}
          onLeft={() => {
            setMembersModalOpen(false)
            navigate('/')
          }}
          onClose={() => setMembersModalOpen(false)}
        />
      ) : null}

      {/* 他人 Agent 只读名片弹窗：统一使用 .biu-float-overlay + .biu-float.scfg-float */}
      {agentCard
        ? createPortal(
            <div
              className="biu-float-overlay"
              onClick={() => setAgentCard(null)}
              data-testid="channel-agent-card"
            >
              <div
                className="biu-float scfg-float !w-[min(420px,calc(100vw-32px))]"
                role="dialog"
                aria-modal="true"
                aria-label="Agent 名片"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="biu-float-head scfg-head">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <SidebarMascot
                      size={24}
                      sessionId={agentCard.memberId}
                      identity={resolveSessionMascot(agentCard.memberId, agentCard.mascot)}
                      animate={false}
                      title=""
                    />
                    <h2 className="biu-float-title scfg-title truncate">{agentCard.name}</h2>
                  </div>
                  <button
                    type="button"
                    className="biu-float-close"
                    title="关闭"
                    aria-label="关闭"
                    onClick={() => setAgentCard(null)}
                  >
                    <XMarkIcon className="size-4 shrink-0" />
                  </button>
                </div>

                <div className="scfg-body">
                  <div className="scfg-sections">
                    <div className="scfg-section">
                      <div className="scfg-hint">
                        归属人：{agentCard.ownerName || '其他成员'}
                        {agentCard.model ? ` · ${agentCard.model}` : ''}
                      </div>
                      {agentCard.systemPrompt ? (
                        <div className="rounded-[var(--biu-radius-md)] bg-(--biu-color-bg-subtle) p-3 text-[12.5px] leading-relaxed text-(--biu-color-text-muted)">
                          {agentCard.systemPrompt}
                        </div>
                      ) : null}
                      <p className="scfg-hint m-0">
                        这是他人归属的 Agent：你可以在当前群聊中 @{agentCard.name} 协同工作（数据权限自动取双人交集并屏蔽私人数据），但无法进入或查看它与归属人的 1v1 私聊记录。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
})

function ChannelMembersModal({
  channelId,
  channel,
  members,
  myAccountId,
  canManageMembers,
  useSessionView,
  resolveAvatar,
  onLeft,
  onClose,
}: {
  channelId: string
  channel: ChannelSummary
  members: ChannelMemberView[]
  myAccountId: string
  canManageMembers: boolean
  useSessionView?: ReturnType<typeof bindSessionView>
  resolveAvatar: (accountId?: string, serverAvatar?: string) => string | undefined
  onLeft: () => void
  onClose: () => void
}) {
  const allSessions = useSessionView ? useSessionView((s) => s.sessions) : []
  const [wsMembers, setWsMembers] = useState<Array<{ id: string; name: string; avatar?: string }>>([])
  const [error, setError] = useState('')
  const [syncNotice, setSyncNotice] = useState('')
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null)
  const [savingPref, setSavingPref] = useState(false)
  const canLeaveGroup = channel.kind !== 'dm' && channel.createdBy !== myAccountId && myAccountId !== 'local'

  useEffect(() => {
    const params = new URLSearchParams({ path: '/workspace-members', limit: '200', columns: 'title,email,avatar' })
    void apiFetch(`/api/db/list?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
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
  }, [])

  const inHumans = new Set(members.filter((m) => m.memberType === 'account').map((m) => m.memberId))
  const inAgents = new Set(members.filter((m) => m.memberType === 'agent').map((m) => m.memberId))
  const addableHumans = wsMembers.filter((m) => !inHumans.has(m.id))
  const myAddableAgents = allSessions.filter(
    (s) => !inAgents.has(s.id) && (!myAccountId || myAccountId === 'local' || !s.createdBy || s.createdBy === myAccountId),
  )

  const handleAdd = async (type: 'account' | 'agent', id: string) => {
    setError('')
    try {
      await addChannelMember(channelId, type, id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleRemove = async (type: 'account' | 'agent', id: string) => {
    setError('')
    try {
      await removeChannelMember(channelId, type, id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleToggleContextMode = async (agentId: string, current?: ChannelAgentContextMode) => {
    setError('')
    setBusyAgentId(agentId)
    try {
      const next: ChannelAgentContextMode = current === 'isolated' ? 'summary' : 'isolated'
      await updateChannelAgentContextMode(channelId, agentId, next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyAgentId(null)
    }
  }

  const handleSyncAgent = async (agentId: string, agentName: string) => {
    setError('')
    setSyncNotice('')
    setBusyAgentId(agentId)
    try {
      await syncChannelToAgent(channelId, agentId)
      setSyncNotice(`已将近期聊天结论同步到「${agentName}」的 1v1 主工作台。`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyAgentId(null)
    }
  }

  return createPortal(
    <div
      className="biu-float-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="管理群成员与 Agent"
      onClick={onClose}
    >
      <div className="biu-float scfg-float" onClick={(e) => e.stopPropagation()}>
        <div className="biu-float-head scfg-head">
          <h2 className="biu-float-title scfg-title">群成员与 Agent</h2>
          <button type="button" className="biu-float-close" title="关闭" aria-label="关闭" onClick={onClose}>
            <XMarkIcon className="size-4 shrink-0" />
          </button>
        </div>

        <div className="scfg-body">
          {error ? (
            <div className="scfg-error" role="alert">
              {error}
            </div>
          ) : null}
          {syncNotice ? (
            <div className="mb-3 rounded-[var(--biu-radius-md)] border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-400">
              {syncNotice}
            </div>
          ) : null}

          <div className="scfg-sections">
            {/* 聊天偏好：置顶、免打扰、退出聊天 */}
            <div className="scfg-section">
              <div className="scfg-tools-head">
                <span className="scfg-label">聊天偏好</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={channel.pinned ? 'default' : 'secondary'}
                  className="h-7 px-2.5 text-[12px]"
                  disabled={savingPref}
                  data-testid="channel-pref-pin"
                  onClick={() => {
                    setSavingPref(true)
                    setError('')
                    void updateChannelPreferences(channelId, { pinned: !channel.pinned })
                      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                      .finally(() => setSavingPref(false))
                  }}
                >
                  <BookmarkIcon className="size-3.5" />
                  <span>{channel.pinned ? '已置顶聊天' : '置顶聊天'}</span>
                </Button>
                <Button
                  variant={channel.muted ? 'default' : 'secondary'}
                  className="h-7 px-2.5 text-[12px]"
                  disabled={savingPref}
                  data-testid="channel-pref-mute"
                  onClick={() => {
                    setSavingPref(true)
                    setError('')
                    void updateChannelPreferences(channelId, { muted: !channel.muted })
                      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                      .finally(() => setSavingPref(false))
                  }}
                >
                  {channel.muted ? <BellSlashIcon className="size-3.5" /> : <BellIcon className="size-3.5" />}
                  <span>{channel.muted ? '已免打扰' : '消息免打扰'}</span>
                </Button>
                {canLeaveGroup ? (
                  <Button
                    variant="destructive"
                    className="ml-auto h-7 px-2.5 text-[12px]"
                    disabled={savingPref}
                    data-testid="channel-leave-btn"
                    onClick={() => {
                      setSavingPref(true)
                      setError('')
                      void leaveChannel(channelId)
                        .then(() => onLeft())
                        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                        .finally(() => setSavingPref(false))
                    }}
                  >
                    <ArrowRightStartOnRectangleIcon className="size-3.5" />
                    <span>退出聊天</span>
                  </Button>
                ) : null}
              </div>
            </div>

            {/* 当前在群 Agent */}
            <div className="scfg-section">
              <div className="scfg-tools-head">
                <span className="scfg-label">群内 Agent</span>
                <span className="scfg-hint">{members.filter((m) => m.memberType === 'agent').length} 个</span>
              </div>
              {members.filter((m) => m.memberType === 'agent').length === 0 ? (
                <div className="scfg-hint">暂无 Agent 入群</div>
              ) : (
                <ul className="scfg-tools-list">
                  {members
                    .filter((m) => m.memberType === 'agent')
                    .map((a) => {
                      const mode: ChannelAgentContextMode = a.contextMode === 'isolated' ? 'isolated' : 'summary'
                      const isBusy = busyAgentId === a.memberId
                      return (
                        <li key={a.memberId} className="scfg-tool-row is-active flex-wrap gap-y-1.5">
                          <SidebarMascot
                            size={18}
                            sessionId={a.memberId}
                            identity={resolveSessionMascot(a.memberId, a.mascot)}
                            animate={false}
                            title=""
                          />
                          <span className="scfg-tool-name !font-sans font-medium">{a.name}</span>
                          <span className="scfg-hint shrink-0">归属 {a.ownerName}</span>
                          {a.isOwn ? (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                data-testid={`agent-context-mode-${a.memberId}`}
                                className="cursor-pointer rounded-md border border-(--biu-color-border) bg-(--biu-color-bg-subtle) px-1.5 py-0.5 text-[11px] text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text) disabled:opacity-50"
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
                                className="cursor-pointer border-0 bg-transparent p-0 text-[11.5px] text-(--biu-color-text-muted) hover:text-(--biu-color-text) hover:underline disabled:opacity-50"
                                title="将当前聊天近期结论手动同步回该代理的 1v1 主工作台"
                                onClick={() => void handleSyncAgent(a.memberId, a.name)}
                              >
                                沉淀到 1v1
                              </button>
                            </>
                          ) : (
                            <span className="rounded bg-(--biu-color-bg-muted) px-1.5 py-0.5 text-[11px] text-(--biu-color-text-subtle)">
                              {mode === 'summary' ? '同步摘要' : '仅群聊'}
                            </span>
                          )}
                          {a.isOwn || canManageMembers ? (
                            <button
                              type="button"
                              className="ml-1 cursor-pointer border-0 bg-transparent p-0 text-[12px] text-(--biu-color-danger) hover:underline"
                              onClick={() => void handleRemove('agent', a.memberId)}
                            >
                              移出
                            </button>
                          ) : null}
                        </li>
                      )
                    })}
                </ul>
              )}

              {myAddableAgents.length > 0 ? (
                <div className="scfg-field">
                  <span className="scfg-hint">拉入我创建的 Agent</span>
                  <div className="flex flex-wrap gap-1.5">
                    {myAddableAgents.slice(0, 15).map((a) => (
                      <Button
                        key={a.id}
                        variant="secondary"
                        className="h-7 px-2.5 text-[12px]"
                        onClick={() => void handleAdd('agent', a.id)}
                      >
                        <UserPlusIcon className="size-3.5 opacity-75" />
                        <span>{a.title}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* 当前在群人类成员 */}
            <div className="scfg-section">
              <div className="scfg-tools-head">
                <span className="scfg-label">成员</span>
                <span className="scfg-hint">{members.filter((m) => m.memberType === 'account').length} 人</span>
              </div>
              <ul className="scfg-tools-list">
                {members
                  .filter((m) => m.memberType === 'account')
                  .map((h) => (
                    <li key={h.memberId} className="scfg-tool-row is-active">
                      <MemberAvatar
                        avatar={resolveAvatar(h.memberId, h.avatar)}
                        seed={h.memberId}
                        size={18}
                      />
                      <span className="scfg-tool-name !font-sans font-medium">{h.name}</span>
                      {h.role === 'owner' ? <span className="scfg-hint shrink-0">群主</span> : null}
                      {canManageMembers && h.role !== 'owner' ? (
                        <button
                          type="button"
                          className="ml-2 cursor-pointer border-0 bg-transparent p-0 text-[12px] text-(--biu-color-danger) hover:underline"
                          onClick={() => void handleRemove('account', h.memberId)}
                        >
                          移除
                        </button>
                      ) : null}
                    </li>
                  ))}
              </ul>

              {canManageMembers && addableHumans.length > 0 ? (
                <div className="scfg-field">
                  <span className="scfg-hint">邀请空间成员入群</span>
                  <div className="flex flex-wrap gap-1.5">
                    {addableHumans.map((h) => (
                      <Button
                        key={h.id}
                        variant="secondary"
                        className="h-7 px-2.5 text-[12px]"
                        onClick={() => void handleAdd('account', h.id)}
                      >
                        <MemberAvatar avatar={resolveAvatar(h.id, h.avatar)} seed={h.id} size={15} />
                        <span>{h.name}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
