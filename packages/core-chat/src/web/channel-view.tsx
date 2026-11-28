import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpIcon,
  ArrowUturnLeftIcon,
  CheckIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronRightIcon,
  ClockIcon,
  EyeIcon,
  HashtagIcon,
  LockClosedIcon,
  PlusIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Square2StackIcon,
  UserGroupIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { Button } from '@biu/biu-ui'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { apiFetch } from '@biu/biu-ui/api-client'
import { onAppEvents } from '@biu/biu-ui/app-events'
import { ChatDockStack, ChatStage as BiuChatStage } from '@biu/biu-ui/chat-pane'
import { useWorkspaceProfile } from '@biu/biu-ui/use-workspace-profile'
import { SidebarMascot, resolveSessionMascot } from '@biu/public-mascot'
import { bindSessionView, sessionAppPath, type SessionViewService } from '@biu/web-session-view'
import type {
  ChannelMemberView,
  ChannelMention,
  ChannelMessageView,
} from '../shared/channel-types.ts'
import { MarkdownBody } from './markdown.tsx'
import {
  addChannelMember,
  autoNameChannel,
  cancelChannelRun,
  decideChannelApproval,
  loadChannelDetail,
  openChannelRunTrace,
  removeChannelMember,
  renameChannel,
  sendChannelMessage,
  useChannelStore,
} from './channel-store.ts'

type MentionOption = {
  kind: 'everyone' | 'agent' | 'account'
  id: string
  label: string
  sub?: string
  avatar?: string
  mascot?: ChannelMemberView['mascot']
}

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

/** 实时同步当前工作区成员的头像与昵称，确保与空间头像和成员表始终 100% 一致。 */
function useLiveWorkspaceAvatars() {
  const workspaceProfile = useWorkspaceProfile()
  const [byId, setById] = useState<Map<string, { name?: string; avatar?: string }>>(() => new Map())

  useEffect(() => {
    let cancelled = false
    const load = () => {
      const params = new URLSearchParams({
        path: '/workspace-members',
        limit: '500',
        columns: 'title,avatar',
      })
      void apiFetch(`/api/db/list?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          if (cancelled) return
          const rows = Array.isArray((body as { items?: unknown[] } | null)?.items)
            ? ((body as { items: Array<Record<string, unknown>> }).items)
            : []
          const next = new Map<string, { name?: string; avatar?: string }>()
          for (const row of rows) {
            const id = String(row?.id ?? '').trim()
            if (!id) continue
            const avatar = typeof row.avatar === 'string' ? row.avatar.trim() : ''
            const name = typeof row.title === 'string' ? row.title.trim() : ''
            next.set(id, { ...(name ? { name } : {}), ...(avatar ? { avatar } : {}) })
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

  return useCallback(
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
}

function MessageCopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard may be denied */
    }
  }
  return (
    <button
      type="button"
      className={`chat-assistant-action${copied ? ' is-done' : ''}`}
      title={copied ? '已复制' : '复制'}
      aria-label={copied ? '已复制' : '复制消息'}
      onClick={() => void copy()}
    >
      {copied ? <CheckIcon className="size-3.5" /> : <Square2StackIcon className="size-3.5" />}
    </button>
  )
}

export const ChannelStage = memo(function ChannelStage({
  channelId,
  leftHidden,
  expandSidebar,
  inspectorOpen,
  toggleInspector,
  useSessionView,
  sessionView,
}: {
  channelId: string
  leftHidden?: boolean
  expandSidebar?: () => void
  inspectorOpen?: boolean
  toggleInspector?: () => void
  useSessionView?: ReturnType<typeof bindSessionView>
  sessionView?: SessionViewService
}) {
  const navigate = useNavigate()
  const detail = useChannelStore((s) => s.details[channelId])
  const workspaceProfile = useWorkspaceProfile()
  const resolveAvatar = useLiveWorkspaceAvatars()
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [mentions, setMentions] = useState<ChannelMention[]>([])
  const [replyTo, setReplyTo] = useState<ChannelMessageView | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [membersModalOpen, setMembersModalOpen] = useState(false)
  const [agentCard, setAgentCard] = useState<ChannelMemberView | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIdx, setMentionIdx] = useState(0)
  const [decidingApproval, setDecidingApproval] = useState<string | null>(null)
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [namingTitle, setNamingTitle] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    void loadChannelDetail(channelId).finally(() => setLoading(false))
  }, [channelId])

  const messages = detail?.messages ?? []
  const members = detail?.members ?? []
  const activities = detail?.activities ?? []
  const channel = detail?.channel

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, activities.length])

  // 自动伸缩 textarea 高度，并与 .composer-pill.is-expanded 保持一致
  const syncTextareaHeight = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    const nextH = Math.min(el.scrollHeight, 8 * 28)
    el.style.height = `${Math.max(28, nextH)}px`
    setComposerExpanded(el.value.includes('\n') || el.scrollHeight > 36)
  }, [])

  useEffect(() => {
    syncTextareaHeight(inputRef.current)
  }, [text, syncTextareaHeight])

  const memberById = useMemo(() => {
    const map = new Map<string, ChannelMemberView>()
    for (const m of members) map.set(`${m.memberType}:${m.memberId}`, m)
    return map
  }, [members])

  const mentionOptions = useMemo<MentionOption[]>(() => {
    const agents = members.filter((m) => m.memberType === 'agent')
    const humans = members.filter((m) => m.memberType === 'account')
    const base: MentionOption[] = []
    if (agents.length > 0) {
      base.push({ kind: 'everyone', id: 'everyone', label: '所有人', sub: `唤醒群内全部 ${agents.length} 个 Agent` })
    }
    for (const a of agents) {
      base.push({
        kind: 'agent',
        id: a.memberId,
        label: a.name,
        sub: a.ownerName ? `Agent · 归属 ${a.ownerName}` : 'Agent',
        mascot: a.mascot,
      })
    }
    for (const h of humans) {
      base.push({
        kind: 'account',
        id: h.memberId,
        label: h.name,
        sub: '成员',
        avatar: resolveAvatar(h.memberId, h.avatar),
      })
    }
    if (!mentionQuery) return base
    const q = mentionQuery.toLowerCase()
    return base.filter((opt) => opt.label.toLowerCase().includes(q) || (opt.sub?.toLowerCase().includes(q) ?? false))
  }, [members, mentionQuery, resolveAvatar])

  const handleTextChange = (next: string) => {
    setText(next)
    const caret = inputRef.current?.selectionStart ?? next.length
    const before = next.slice(0, caret)
    const match = before.match(/(?:^|\s)@([^\s@]*)$/)
    if (match) {
      setMentionQuery(match[1] ?? '')
      setMentionIdx(0)
    } else {
      setMentionQuery(null)
    }
  }

  const openMentionPicker = () => {
    const el = inputRef.current
    if (!el) return
    const caret = el.selectionStart ?? text.length
    const before = text.slice(0, caret)
    const after = text.slice(caret)
    const needsSpace = before.length > 0 && !/\s$/.test(before) && !before.endsWith('@')
    const insert = before.endsWith('@') ? '' : needsSpace ? ' @' : '@'
    const next = `${before}${insert}${after}`
    setText(next)
    setMentionQuery('')
    setMentionIdx(0)
    requestAnimationFrame(() => {
      el.focus()
      const pos = before.length + insert.length
      el.setSelectionRange(pos, pos)
    })
  }

  const pickMention = (opt: MentionOption) => {
    const caret = inputRef.current?.selectionStart ?? text.length
    const before = text.slice(0, caret)
    const after = text.slice(caret)
    const replaced = before.replace(/@[^\s@]*$/, `@${opt.label} `)
    setText(`${replaced}${after}`)
    setMentions((prev) => {
      if (prev.some((m) => m.kind === opt.kind && m.id === opt.id)) return prev
      return [...prev, { kind: opt.kind, id: opt.id, label: opt.label }]
    })
    setMentionQuery(null)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(replaced.length, replaced.length)
    })
  }

  const handleSend = useCallback(async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError('')
    try {
      await sendChannelMessage(channelId, {
        text: body,
        ...(replyTo ? { replyToId: replyTo.id } : {}),
        mentions,
      })
      setText('')
      setMentions([])
      setReplyTo(null)
      setMentionQuery(null)
      setComposerExpanded(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }, [channelId, mentions, replyTo, sending, text])

  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (mentionQuery !== null && mentionOptions.length > 0) {
      const hit = mentionOptions[mentionIdx] ?? mentionOptions[0]
      if (hit) pickMention(hit)
      return
    }
    void handleSend()
  }

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
  const hasChips = Boolean(replyTo)

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
      {/* 顶部栏：与 1v1 Agent 聊天完全统一的 .chat-view-header */}
      <header className="chat-view-header" data-biu-ignore>
        <div className="chat-view-header-left">
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
          {channel?.topic ? (
            <div className="chat-view-project" title={channel.topic}>
              <span className="chat-view-project-name text-[12px] font-normal text-(--biu-color-text-subtle)">
                {channel.topic}
              </span>
            </div>
          ) : null}
        </div>

        <div className="chat-view-session-title-wrap gap-1.5">
          {!isDm && channel ? (
            <button
              type="button"
              className="chat-view-session-title-magic"
              title="根据聊天内容自动命名"
              aria-label="根据聊天内容自动命名"
              data-testid="channel-auto-name"
              disabled={namingTitle}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void handleAutoName()}
            >
              <SparklesIcon aria-hidden className="size-[14px]" />
            </button>
          ) : null}
          {isDm ? (
            <MemberAvatar avatar={peerAvatar} seed={channel?.peerAccountId || channelId} size={18} />
          ) : channel?.accessMode === 'private' ? (
            <LockClosedIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" aria-hidden />
          ) : (
            <HashtagIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" aria-hidden />
          )}
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
              className={`truncate text-[14px] font-semibold text-(--biu-color-text)${!isDm && detail?.canManageMembers ? ' pointer-events-auto cursor-text rounded px-1 hover:bg-(--biu-color-bg-hover)' : ''}`}
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
        </div>

        <div className="chat-view-header-right">
          <button
            type="button"
            className="inline-flex h-[var(--biu-size-control-md)] cursor-pointer items-center gap-1.5 rounded-[6px] border-0 bg-transparent px-2 text-[12px] font-medium text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
            title="管理群成员与 Agent"
            data-testid="channel-manage-members"
            onClick={() => setMembersModalOpen(true)}
          >
            <UserGroupIcon className="size-3.5 shrink-0 text-(--biu-color-icon-active)" />
            <span className="tabular-nums">
              {humanMembers.length} 人{agentMembers.length > 0 ? ` · ${agentMembers.length} Agent` : ''}
            </span>
          </button>
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

      {/* 主对话舞台：与 AgentMainPanels 完全相同的居中舞台 + 底部悬浮胶囊输入栏 */}
      <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden" data-testid="agent-center">
        <div className="absolute inset-0 z-1 flex min-h-0 overflow-hidden">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <BiuChatStage variant="center" stageRef={scrollRef}>
              <div className="chat-node-list pt-2" data-testid="channel-messages">
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

                {messages.map((msg) => {
                  const isEphemeral = Boolean(msg.ephemeralTo)
                  const isAgent = msg.senderType === 'agent'
                  const isSystemAgent = msg.senderType === 'system' && Boolean(msg.senderId)
                  const approvalMeta = msg.meta?.kind === 'approval' ? msg.meta : null
                  const sentLabel = formatSentAt(msg.createdAt)
                  const myAccountId = detail?.myAccountId || workspaceProfile.accountId || ''
                  const isSelf =
                    msg.senderType === 'account' &&
                    !isEphemeral &&
                    Boolean(myAccountId) &&
                    msg.senderId === myAccountId
                  const accountAvatar =
                    msg.senderType === 'account' ? resolveAvatar(msg.senderId, msg.senderAvatar) : undefined

                  // 1. Agent 正常公开回复：左侧头像 + 右侧 .chat-reply-block（与 1v1 样式统一）
                  if (isAgent && !isEphemeral) {
                    return (
                      <div
                        key={msg.id}
                        className="flex w-full items-start justify-start gap-2.5"
                        data-testid="channel-message"
                        data-sender-type="agent"
                        data-self="false"
                      >
                        <button
                          type="button"
                          className="mt-0.5 shrink-0 cursor-pointer border-0 bg-transparent p-0"
                          title={`查看 ${msg.senderName}`}
                          aria-label={`查看 ${msg.senderName}`}
                          data-testid="channel-msg-avatar-left"
                          onClick={() => handleAgentClick(msg.senderId)}
                        >
                          <SidebarMascot
                            size={28}
                            sessionId={msg.senderId}
                            identity={resolveSessionMascot(msg.senderId, msg.senderMascot)}
                            animate={false}
                            title=""
                          />
                        </button>
                        <div className="chat-reply-block group !w-3/4 max-w-[calc(100%-38px)] min-w-0">
                          <div className="chat-reply-body !px-0">
                            <div className="flex flex-wrap items-center gap-2 text-(length:--biu-chat-ui-font-size) leading-none text-(--biu-color-text-muted)">
                              <button
                                type="button"
                                className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-(--biu-color-text) hover:underline"
                                title="查看 Agent 个人 / 名片"
                                onClick={() => handleAgentClick(msg.senderId)}
                              >
                                <span className="font-medium">{msg.senderName}</span>
                              </button>
                              {msg.replyPreview ? (
                                <span className="inline-flex max-w-[260px] items-center gap-1 truncate text-(--biu-color-text-subtle)">
                                  <ArrowUturnLeftIcon className="size-3 shrink-0" />
                                  <span className="truncate">
                                    {msg.replyPreview.senderName}：{msg.replyPreview.text}
                                  </span>
                                </span>
                              ) : null}
                              {sentLabel ? (
                                <span className="inline-flex items-center gap-1 text-(--biu-color-text-subtle) tabular-nums">
                                  <ClockIcon className="size-3" aria-hidden />
                                  <span>{sentLabel}</span>
                                </span>
                              ) : null}
                            </div>

                            <div className="chat-assistant-body">
                              <MarkdownBody text={msg.text} />
                            </div>
                          </div>

                          <div className="chat-reply-actions-row !px-0">
                            <div className="chat-reply-actions" role="group" aria-label="回复操作">
                              <MessageCopyAction text={msg.text} />
                              <button
                                type="button"
                                className="chat-assistant-action"
                                title="回复"
                                aria-label="回复该消息"
                                onClick={() => {
                                  setReplyTo(msg)
                                  inputRef.current?.focus()
                                }}
                              >
                                <ArrowUturnLeftIcon className="size-3.5" />
                              </button>
                              {msg.traceId ? (
                                <button
                                  type="button"
                                  className="inline-flex h-[24px] cursor-pointer items-center gap-0.5 rounded-md border border-transparent bg-transparent px-1.5 text-(length:--biu-chat-ui-font-size) leading-none text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
                                  data-testid={`channel-msg-trace-${msg.traceId}`}
                                  title="在右侧检查器查看本次回复的执行详情"
                                  onClick={() => openChannelRunTrace(channelId, msg.traceId)}
                                >
                                  <ChevronRightIcon className="size-3.5" />
                                  <span>Details</span>
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  // 2. 人类消息（自己在右、头像在右；他人在左、头像在左）& Ephemeral/系统消息（左侧）
                  const avatarNode =
                    isAgent || isSystemAgent ? (
                      <button
                        type="button"
                        className="mt-0.5 shrink-0 cursor-pointer border-0 bg-transparent p-0"
                        title={`查看 ${msg.senderName}`}
                        aria-label={`查看 ${msg.senderName}`}
                        data-testid={isSelf ? 'channel-msg-avatar-right' : 'channel-msg-avatar-left'}
                        onClick={() => handleAgentClick(msg.senderId)}
                      >
                        <SidebarMascot
                          size={28}
                          sessionId={msg.senderId}
                          identity={resolveSessionMascot(msg.senderId, msg.senderMascot)}
                          animate={false}
                          title=""
                        />
                      </button>
                    ) : (
                      <span
                        className="mt-0.5 inline-flex shrink-0"
                        title={msg.senderName}
                        data-testid={isSelf ? 'channel-msg-avatar-right' : 'channel-msg-avatar-left'}
                      >
                        <MemberAvatar avatar={accountAvatar} seed={msg.senderId} size={28} />
                      </span>
                    )

                  const cardNode = (
                    <div
                      className={`chat-user-card group !w-3/4 max-w-[calc(100%-38px)] min-w-0${isEphemeral ? ' opacity-95' : ''}`}
                    >
                      <div className="chat-user-card-body text-(--biu-color-text)">
                        {msg.replyPreview ? (
                          <div className="mb-1.5 flex items-center gap-1.5 border-l-2 border-(--biu-color-border) pl-2 text-(length:--biu-chat-ui-font-size) text-(--biu-color-text-subtle)">
                            <ArrowUturnLeftIcon className="size-3 shrink-0" />
                            <span className="shrink-0 font-medium">{msg.replyPreview.senderName}：</span>
                            <span className="truncate">{msg.replyPreview.text}</span>
                          </div>
                        ) : null}

                        <div className="whitespace-pre-wrap break-words text-(--biu-color-text)">
                          {msg.text}
                        </div>

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
                        className="user-turn-bar box-border flex min-h-[30px] w-full items-center justify-between gap-3 overflow-hidden border-0 border-t border-(--biu-color-bg-muted) bg-(--biu-color-bg-subtle) px-(--biu-chat-pad-x) text-(length:--biu-chat-ui-font-size) leading-none text-(--biu-color-text-muted)"
                        aria-label="消息摘要"
                      >
                        <div className="flex min-h-full min-w-0 flex-1 items-center gap-2">
                          {isAgent || isSystemAgent ? (
                            <button
                              type="button"
                              className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-(--biu-color-text-muted) hover:text-(--biu-color-text)"
                              onClick={() => handleAgentClick(msg.senderId)}
                            >
                              <span className="truncate font-medium">{msg.senderName}</span>
                            </button>
                          ) : (
                            <span className="truncate font-medium">{msg.senderName}</span>
                          )}

                          {isEphemeral ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-(--biu-color-bg-muted) px-1.5 py-0.5 text-[11px] text-(--biu-color-text-subtle)">
                              <EyeIcon className="size-3" />
                              仅你可见
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-(length:--biu-chat-ui-font-size) leading-none text-(--biu-color-text-subtle) opacity-0 transition-opacity hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text) group-hover:opacity-100"
                              onClick={() => {
                                setReplyTo(msg)
                                inputRef.current?.focus()
                              }}
                            >
                              <ArrowUturnLeftIcon className="size-3" />
                              <span>回复</span>
                            </button>
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
                        </div>

                        <div className="inline-flex shrink-0 items-center gap-1.5">
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

                  return (
                    <div
                      key={msg.id}
                      data-testid={isEphemeral ? 'channel-ephemeral-msg' : 'channel-message'}
                      data-sender-type={msg.senderType}
                      data-self={isSelf ? 'true' : 'false'}
                      className={`flex w-full items-start gap-2.5 ${isSelf ? 'justify-end' : 'justify-start'}`}
                    >
                      {isSelf ? (
                        <>
                          {cardNode}
                          {avatarNode}
                        </>
                      ) : (
                        <>
                          {avatarNode}
                          {cardNode}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </BiuChatStage>

            {/* 底部悬浮胶囊发送栏：完全复用 .chat-composer-dock + .composer-stack + .composer-pill */}
            <div className="chat-composer-dock pointer-events-none absolute inset-x-0 bottom-0 bg-transparent px-[var(--biu-pad-page)] pb-[calc(1rem+5px)]">
              <ChatDockStack>
                <div className="composer-stack" data-biu-ignore>
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

                  {error ? (
                    <div className="scfg-error !mb-0" role="alert">
                      {error}
                    </div>
                  ) : null}

                  <form
                    className={`composer-pill${composerExpanded ? ' is-expanded' : ''}${hasChips ? ' has-chips' : ''}`}
                    onSubmit={onFormSubmit}
                  >
                    {/* @ 自动补全弹层：复用 .composer-slash 样式 */}
                    {mentionQuery !== null && mentionOptions.length > 0 ? (
                      <div
                        className="composer-slash"
                        role="listbox"
                        aria-label="提及成员与 Agent"
                        data-testid="channel-mention-menu"
                      >
                        <div className="composer-slash-head">提及成员或 Agent · 输入过滤 · Enter 选用</div>
                        {mentionOptions.map((opt, idx) => (
                          <button
                            key={`${opt.kind}:${opt.id}`}
                            type="button"
                            role="option"
                            aria-selected={idx === mentionIdx}
                            className={`composer-slash-item !flex items-center gap-2${idx === mentionIdx ? ' is-active' : ''}`}
                            onMouseEnter={() => setMentionIdx(idx)}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              pickMention(opt)
                            }}
                          >
                            {opt.kind === 'agent' ? (
                              <SidebarMascot
                                size={18}
                                sessionId={opt.id}
                                identity={resolveSessionMascot(opt.id, opt.mascot)}
                                animate={false}
                                title=""
                              />
                            ) : opt.kind === 'account' ? (
                              <MemberAvatar avatar={opt.avatar} seed={opt.id} size={18} />
                            ) : (
                              <UserGroupIcon className="size-4 shrink-0 text-(--biu-color-icon)" />
                            )}
                            <span className="composer-slash-name !font-sans font-medium">@{opt.label}</span>
                            {opt.sub ? <span className="composer-slash-desc ml-auto">{opt.sub}</span> : null}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {/* 引用回复 chip */}
                    {replyTo ? (
                      <div className="composer-tool-chips" aria-label="正在回复">
                        <button
                          type="button"
                          className="composer-tool-chip max-w-full"
                          title="取消引用回复"
                          onClick={() => setReplyTo(null)}
                        >
                          <ArrowUturnLeftIcon className="size-3 shrink-0" />
                          <span className="truncate">
                            回复 {replyTo.senderName}：{replyTo.text.slice(0, 60)}
                          </span>
                          <span aria-hidden>×</span>
                        </button>
                      </div>
                    ) : null}

                    <div className="composer-pill-row">
                      <button
                        type="button"
                        className="composer-plus"
                        title="提及成员或 Agent (@)"
                        aria-label="提及成员或 Agent"
                        onClick={openMentionPicker}
                      >
                        <PlusIcon className="size-4" />
                      </button>

                      <div className="composer-editor">
                        <textarea
                          ref={inputRef}
                          rows={1}
                          value={text}
                          onChange={(e) => handleTextChange(e.target.value)}
                          placeholder={
                            isDm
                              ? `给 ${channel?.name ?? '对方'} 发消息…`
                              : `在 # ${channel?.name ?? ''} 发消息… 输入 @ 召唤群内 Agent`
                          }
                          data-testid="channel-composer-input"
                          className="composer-tiptap block w-full resize-none border-0 bg-transparent p-0 outline-none placeholder:text-(--biu-color-text-placeholder)"
                          onKeyDown={(e) => {
                            if (mentionQuery !== null && mentionOptions.length > 0) {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault()
                                setMentionIdx((i) => (i + 1) % mentionOptions.length)
                                return
                              }
                              if (e.key === 'ArrowUp') {
                                e.preventDefault()
                                setMentionIdx((i) => (i - 1 + mentionOptions.length) % mentionOptions.length)
                                return
                              }
                              if (e.key === 'Enter' || e.key === 'Tab') {
                                e.preventDefault()
                                pickMention(mentionOptions[mentionIdx]!)
                                return
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault()
                                setMentionQuery(null)
                                return
                              }
                            }
                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                              e.preventDefault()
                              void handleSend()
                            }
                          }}
                        />
                      </div>

                      <div className="composer-pill-right">
                        <button
                          type="submit"
                          disabled={!text.trim() || sending}
                          data-testid="channel-composer-send"
                          className="composer-send"
                          aria-label="发送消息"
                          title="发送"
                        >
                          <ArrowUpIcon className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </ChatDockStack>
            </div>
          </div>
        </div>
      </div>

      {/* 群成员与 Agent 管理弹窗：统一使用 .biu-float-overlay + .biu-float.scfg-float */}
      {membersModalOpen && detail ? (
        <ChannelMembersModal
          channelId={channelId}
          members={members}
          myAccountId={detail.myAccountId}
          canManageMembers={detail.canManageMembers}
          useSessionView={useSessionView}
          resolveAvatar={resolveAvatar}
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
                        <div className="rounded-[var(--biu-radius-md)] border border-(--biu-color-border-subtle) bg-(--biu-color-bg-subtle) p-3 text-[12.5px] leading-relaxed text-(--biu-color-text-muted)">
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
  members,
  myAccountId,
  canManageMembers,
  useSessionView,
  resolveAvatar,
  onClose,
}: {
  channelId: string
  members: ChannelMemberView[]
  myAccountId: string
  canManageMembers: boolean
  useSessionView?: ReturnType<typeof bindSessionView>
  resolveAvatar: (accountId?: string, serverAvatar?: string) => string | undefined
  onClose: () => void
}) {
  const allSessions = useSessionView ? useSessionView((s) => s.sessions) : []
  const [wsMembers, setWsMembers] = useState<Array<{ id: string; name: string; avatar?: string }>>([])
  const [error, setError] = useState('')

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

          <div className="scfg-sections">
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
                    .map((a) => (
                      <li key={a.memberId} className="scfg-tool-row is-active">
                        <SidebarMascot
                          size={18}
                          sessionId={a.memberId}
                          identity={resolveSessionMascot(a.memberId, a.mascot)}
                          animate={false}
                          title=""
                        />
                        <span className="scfg-tool-name !font-sans font-medium">{a.name}</span>
                        <span className="scfg-hint shrink-0">归属 {a.ownerName}</span>
                        {a.isOwn || canManageMembers ? (
                          <button
                            type="button"
                            className="ml-2 cursor-pointer border-0 bg-transparent p-0 text-[12px] text-(--biu-color-danger) hover:underline"
                            onClick={() => void handleRemove('agent', a.memberId)}
                          >
                            移出
                          </button>
                        ) : null}
                      </li>
                    ))}
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
