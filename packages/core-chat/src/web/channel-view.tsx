import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUturnLeftIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  EyeIcon,
  HashtagIcon,
  LockClosedIcon,
  PaperAirplaneIcon,
  ShieldCheckIcon,
  StopCircleIcon,
  UserGroupIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { apiFetch } from '@biu/biu-ui/api-client'
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
  cancelChannelRun,
  decideChannelApproval,
  loadChannelDetail,
  openChannelRunTrace,
  removeChannelMember,
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

function formatClock(ts: number) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
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

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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
      base.push({ kind: 'everyone', id: 'everyone', label: '所有人', sub: `触发群内全部 ${agents.length} 个 Agent` })
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
        avatar: h.avatar,
      })
    }
    if (!mentionQuery) return base
    const q = mentionQuery.toLowerCase()
    return base.filter((opt) => opt.label.toLowerCase().includes(q) || (opt.sub?.toLowerCase().includes(q) ?? false))
  }, [members, mentionQuery])

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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }, [channelId, mentions, replyTo, sending, text])

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-(--biu-color-bg)" data-testid="channel-stage">
      {/* 顶部栏 */}
      <header className="chat-view-header flex shrink-0 items-center justify-between gap-2 border-b border-(--biu-color-border-subtle) px-3" data-biu-ignore>
        <div className="flex min-w-0 items-center gap-2">
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
          {isDm ? (
            channel?.peerAvatar ? (
              <img src={channel.peerAvatar} alt="" className="size-5 rounded-full object-cover" />
            ) : (
              <AiAvatar seed={channel?.peerAccountId || channelId} size={20} />
            )
          ) : channel?.accessMode === 'private' ? (
            <LockClosedIcon className="size-4 shrink-0 opacity-75" />
          ) : (
            <HashtagIcon className="size-4 shrink-0 opacity-75" />
          )}
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold" data-testid="channel-title">
              {channel?.name ?? (loading ? '加载中…' : '群聊')}
            </div>
            {channel?.topic ? (
              <div className="truncate text-[11px] text-(--biu-color-text-subtle)">{channel.topic}</div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md border border-(--biu-color-border) px-2 py-1 text-[12px] text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
            data-testid="channel-manage-members"
            onClick={() => setMembersModalOpen(true)}
          >
            <UserGroupIcon className="size-3.5" />
            <span>{humanMembers.length} 人 · {agentMembers.length} Agent</span>
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

      {/* IM 消息流（Slack 模式：完成后完整气泡上屏 + Ephemeral 仅自己可见） */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" data-testid="channel-messages">
        <div className="mx-auto max-w-3xl space-y-3">
          {messages.length === 0 && !loading ? (
            <div className="rounded-xl border border-dashed border-(--biu-color-border) p-6 text-center text-[13px] text-(--biu-color-text-subtle)">
              <div className="mb-1 text-[15px] font-semibold text-(--biu-color-text)">
                {isDm ? `你与 ${channel?.name ?? '成员'} 的私聊` : `欢迎来到 # ${channel?.name ?? ''}`}
              </div>
              <div>
                {agentMembers.length > 0
                  ? '平常聊天时 Agent 会保持静默，输入 @Agent名称 或 @所有人 即可召唤对应的 Agent 协作。'
                  : '点击右上角可邀请成员或拉入你创建的 Agent 一起协作。'}
              </div>
            </div>
          ) : null}

          {messages.map((msg) => {
            const isEphemeral = Boolean(msg.ephemeralTo)
            const isAgent = msg.senderType === 'agent'
            const approvalMeta = msg.meta?.kind === 'approval' ? msg.meta : null

            return (
              <div
                key={msg.id}
                data-testid={isEphemeral ? 'channel-ephemeral-msg' : 'channel-message'}
                data-sender-type={msg.senderType}
                className={`group rounded-lg px-3 py-2 transition-colors ${
                  isEphemeral
                    ? 'border border-dashed border-amber-500/40 bg-amber-500/5'
                    : 'hover:bg-(--biu-color-bg-subtle)'
                }`}
              >
                {msg.replyPreview ? (
                  <div className="mb-1.5 flex items-center gap-1.5 border-l-2 border-(--biu-color-border) pl-2 text-[11px] text-(--biu-color-text-subtle)">
                    <ArrowUturnLeftIcon className="size-3 shrink-0" />
                    <span className="font-medium">{msg.replyPreview.senderName}：</span>
                    <span className="truncate">{msg.replyPreview.text}</span>
                  </div>
                ) : null}

                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 border-0 bg-transparent p-0"
                    title={isAgent ? '查看 Agent 个人 / 名片' : msg.senderName}
                    onClick={() => {
                      if (isAgent) handleAgentClick(msg.senderId)
                    }}
                  >
                    {isAgent ? (
                      <SidebarMascot
                        size={28}
                        sessionId={msg.senderId}
                        identity={resolveSessionMascot(msg.senderId, msg.senderMascot)}
                        animate={false}
                        title={msg.senderName}
                      />
                    ) : msg.senderAvatar ? (
                      <img src={msg.senderAvatar} alt="" className="size-7 rounded-full object-cover" />
                    ) : (
                      <AiAvatar seed={msg.senderId} size={28} />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="border-0 bg-transparent p-0 text-[13px] font-semibold text-(--biu-color-text) hover:underline"
                        onClick={() => {
                          if (isAgent) handleAgentClick(msg.senderId)
                        }}
                      >
                        {msg.senderName}
                      </button>
                      {isAgent ? (
                        <span className="rounded bg-(--biu-color-bg-muted) px-1.5 py-0.5 text-[10px] font-medium text-(--biu-color-text-muted)">
                          Agent
                        </span>
                      ) : null}
                      {isEphemeral ? (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                          <EyeIcon className="size-3" />
                          仅你可见
                        </span>
                      ) : null}
                      <span className="text-[11px] text-(--biu-color-text-subtle)">{formatClock(msg.createdAt)}</span>

                      {!isEphemeral ? (
                        <button
                          type="button"
                          className="ml-auto hidden rounded px-1.5 py-0.5 text-[11px] text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text) group-hover:inline-flex"
                          onClick={() => {
                            setReplyTo(msg)
                            inputRef.current?.focus()
                          }}
                        >
                          回复
                        </button>
                      ) : null}
                    </div>

                    <div className="prose-sm text-[13.5px] leading-relaxed text-(--biu-color-text)">
                      <MarkdownBody text={msg.text} />
                    </div>

                    {/* Ephemeral 审批卡片（仅 Agent Owner 可见与点击） */}
                    {approvalMeta?.approvalId ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-(--biu-color-border) bg-(--biu-color-bg-subtle) px-2.5 py-2 text-[12px]">
                        <ShieldCheckIcon className="size-4 text-amber-400" />
                        <span className="font-mono text-[11px]">{approvalMeta.toolName}</span>
                        {approvalMeta.status === 'pending' ? (
                          <div className="ml-auto flex gap-1.5">
                            <button
                              type="button"
                              disabled={decidingApproval === approvalMeta.approvalId}
                              className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                              onClick={() => void handleApproval(approvalMeta.approvalId!, true)}
                            >
                              批准一次
                            </button>
                            <button
                              type="button"
                              disabled={decidingApproval === approvalMeta.approvalId}
                              className="rounded border border-(--biu-color-border) px-2.5 py-1 text-[11px] hover:bg-(--biu-color-bg-hover) disabled:opacity-50"
                              onClick={() => void handleApproval(approvalMeta.approvalId!, false)}
                            >
                              拒绝
                            </button>
                          </div>
                        ) : (
                          <span className="ml-auto text-[11px] text-(--biu-color-text-muted)">
                            {approvalMeta.status === 'allowed' ? '已批准' : '已拒绝'}
                          </span>
                        )}
                      </div>
                    ) : null}

                    {/* Agent 消息底部：按需点开右侧 Inspector 查看本条消息的执行轨迹 */}
                    {msg.traceId && isAgent ? (
                      <div className="mt-1.5">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-(--biu-color-border-subtle) px-2 py-0.5 text-[11px] text-(--biu-color-text-muted) hover:border-(--biu-color-border) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
                          data-testid={`channel-msg-trace-${msg.traceId}`}
                          onClick={() => openChannelRunTrace(channelId, msg.traceId)}
                        >
                          查看执行详情 →
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 底部输入区 + Slack 风格忙碌状态条 */}
      <div className="shrink-0 border-t border-(--biu-color-border-subtle) px-4 py-3">
        <div className="relative mx-auto max-w-3xl">
          {/* 忙碌/排队胶囊：不在主聊天流吐字，点胶囊在右侧 Inspector 看实时吐字与过程 */}
          {activities.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5" data-testid="channel-busy-bar">
              {activities.map((act) => (
                <div
                  key={act.runId}
                  className="inline-flex items-center gap-1.5 rounded-full border border-(--biu-color-border) bg-(--biu-color-bg-subtle) px-2.5 py-1 text-[11.5px]"
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-inherit hover:underline"
                    title="在右侧查看实时执行过程"
                    onClick={() => openChannelRunTrace(channelId, act.runId)}
                  >
                    <SidebarMascot
                      size={16}
                      sessionId={act.agentId}
                      identity={resolveSessionMascot(act.agentId, act.agentMascot)}
                      busy
                      animate={false}
                      title=""
                    />
                    <span className="font-medium">{act.agentName}</span>
                    <span className="text-(--biu-color-text-muted)">
                      {act.stepLabel}
                      {act.queueCount > 0 ? ` · 排队 ${act.queueCount}` : ''}
                    </span>
                  </button>
                  {act.canCancel ? (
                    <button
                      type="button"
                      className="ml-1 inline-flex items-center text-red-400 hover:text-red-300"
                      title="中止本次回复"
                      aria-label={`中止 ${act.agentName}`}
                      onClick={() => void cancelChannelRun(channelId, act.runId)}
                    >
                      <StopCircleIcon className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {/* 引用回复条 */}
          {replyTo ? (
            <div className="mb-1.5 flex items-center justify-between gap-2 rounded-md bg-(--biu-color-bg-subtle) px-2.5 py-1 text-[12px] text-(--biu-color-text-muted)">
              <span className="truncate">
                正在回复 <strong>{replyTo.senderName}</strong>：{replyTo.text.slice(0, 80)}
              </span>
              <button type="button" className="shrink-0 hover:text-(--biu-color-text)" onClick={() => setReplyTo(null)}>
                <XMarkIcon className="size-3.5" />
              </button>
            </div>
          ) : null}

          {/* @ 自动补全弹层 */}
          {mentionQuery !== null && mentionOptions.length > 0 ? (
            <div
              className="absolute right-0 bottom-full left-0 z-20 mb-1.5 max-h-56 overflow-y-auto rounded-lg border border-(--biu-color-border) bg-(--biu-color-bg-popover) p-1 shadow-xl"
              data-testid="channel-mention-menu"
            >
              {mentionOptions.map((opt, idx) => (
                <button
                  key={`${opt.kind}:${opt.id}`}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] ${
                    idx === mentionIdx ? 'bg-(--biu-color-bg-hover)' : ''
                  }`}
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
                    opt.avatar ? (
                      <img src={opt.avatar} alt="" className="size-4.5 rounded-full object-cover" />
                    ) : (
                      <AiAvatar seed={opt.id} size={18} />
                    )
                  ) : (
                    <UserGroupIcon className="size-4 opacity-80" />
                  )}
                  <span className="font-medium">@{opt.label}</span>
                  {opt.sub ? <span className="ml-auto text-[11px] text-(--biu-color-text-subtle)">{opt.sub}</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          {error ? <div className="mb-1.5 text-[12px] text-red-400">{error}</div> : null}

          <div className="flex items-end gap-2 rounded-xl border border-(--biu-color-border) bg-(--biu-color-bg-subtle) px-3 py-2 focus-within:border-(--biu-color-emphasis)">
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={
                isDm
                  ? `给 ${channel?.name ?? '对方'} 发消息…（可 @群内 Agent）`
                  : `在 # ${channel?.name ?? ''} 发消息… 输入 @ 召唤群内 Agent`
              }
              data-testid="channel-composer-input"
              className="max-h-36 min-h-[24px] flex-1 resize-none border-0 bg-transparent text-[13.5px] leading-6 text-(--biu-color-text) outline-none"
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
            <button
              type="button"
              disabled={!text.trim() || sending}
              data-testid="channel-composer-send"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-(--biu-color-emphasis) text-(--biu-color-on-emphasis) disabled:opacity-40"
              aria-label="发送消息"
              onClick={() => void handleSend()}
            >
              <PaperAirplaneIcon className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 群成员与 Agent 管理弹窗 */}
      {membersModalOpen && detail ? (
        <ChannelMembersModal
          channelId={channelId}
          members={members}
          myAccountId={detail.myAccountId}
          canManageMembers={detail.canManageMembers}
          useSessionView={useSessionView}
          onClose={() => setMembersModalOpen(false)}
        />
      ) : null}

      {/* 他人 Agent 只读名片弹窗（Slack 模式：无法进入他人的 1v1 私聊） */}
      {agentCard ? (
        createPortal(
          <div
            className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setAgentCard(null)}
            data-testid="channel-agent-card"
          >
            <div
              className="w-full max-w-sm rounded-xl border border-(--biu-color-border) bg-(--biu-color-bg-popover) p-4 text-(--biu-color-text) shadow-2xl"
              role="dialog"
              aria-label="Agent 名片"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center gap-3">
                <SidebarMascot
                  size={36}
                  sessionId={agentCard.memberId}
                  identity={resolveSessionMascot(agentCard.memberId, agentCard.mascot)}
                  animate={false}
                  title=""
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{agentCard.name}</div>
                  <div className="text-[12px] text-(--biu-color-text-muted)">
                    归属人：{agentCard.ownerName || '其他成员'}
                    {agentCard.model ? ` · ${agentCard.model}` : ''}
                  </div>
                </div>
                <button type="button" onClick={() => setAgentCard(null)}>
                  <XMarkIcon className="size-4" />
                </button>
              </div>
              {agentCard.systemPrompt ? (
                <div className="mb-3 rounded-md bg-(--biu-color-bg-subtle) p-2.5 text-[12px] text-(--biu-color-text-muted)">
                  {agentCard.systemPrompt}
                </div>
              ) : null}
              <div className="rounded-md border border-(--biu-color-border-subtle) px-2.5 py-2 text-[11.5px] text-(--biu-color-text-subtle)">
                这是他人归属的 Agent：你可以在当前群聊中 @{agentCard.name} 协同工作（数据权限自动取双人交集并屏蔽私人数据），但无法进入或查看它与归属人的 1v1 私聊记录。
              </div>
            </div>
          </div>,
          document.body,
        )
      ) : null}
    </div>
  )
})

function ChannelMembersModal({
  channelId,
  members,
  myAccountId,
  canManageMembers,
  useSessionView,
  onClose,
}: {
  channelId: string
  members: ChannelMemberView[]
  myAccountId: string
  canManageMembers: boolean
  useSessionView?: ReturnType<typeof bindSessionView>
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
              avatar: typeof r.avatar === 'string' ? r.avatar : undefined,
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
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-(--biu-color-border) bg-(--biu-color-bg-popover) p-4 text-(--biu-color-text) shadow-2xl"
        role="dialog"
        aria-label="管理群成员与 Agent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[15px] font-semibold">群成员与 Agent</div>
          <button type="button" onClick={onClose}>
            <XMarkIcon className="size-4" />
          </button>
        </div>

        {error ? <div className="mb-2 text-[12px] text-red-400">{error}</div> : null}

        <div className="max-h-[65vh] space-y-4 overflow-y-auto text-[13px]">
          {/* 当前在群 Agent */}
          <div>
            <div className="mb-1.5 text-[12px] font-semibold text-(--biu-color-text-muted)">群内 Agent</div>
            <div className="space-y-1">
              {members.filter((m) => m.memberType === 'agent').map((a) => (
                <div key={a.memberId} className="flex items-center justify-between rounded-md bg-(--biu-color-bg-subtle) px-2.5 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <SidebarMascot
                      size={20}
                      sessionId={a.memberId}
                      identity={resolveSessionMascot(a.memberId, a.mascot)}
                      animate={false}
                      title=""
                    />
                    <span className="truncate font-medium">{a.name}</span>
                    <span className="text-[11px] text-(--biu-color-text-subtle)">归属 {a.ownerName}</span>
                  </div>
                  {a.isOwn || canManageMembers ? (
                    <button
                      type="button"
                      className="text-[11px] text-red-400 hover:underline"
                      onClick={() => void handleRemove('agent', a.memberId)}
                    >
                      移出
                    </button>
                  ) : null}
                </div>
              ))}
              {members.filter((m) => m.memberType === 'agent').length === 0 ? (
                <div className="text-[12px] text-(--biu-color-text-subtle)">暂无 Agent 入群</div>
              ) : null}
            </div>
            {myAddableAgents.length > 0 ? (
              <div className="mt-2">
                <div className="mb-1 text-[11px] text-(--biu-color-text-subtle)">拉入我创建的 Agent：</div>
                <div className="flex flex-wrap gap-1.5">
                  {myAddableAgents.slice(0, 15).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-(--biu-color-border) px-2 py-1 text-[12px] hover:bg-(--biu-color-bg-hover)"
                      onClick={() => void handleAdd('agent', a.id)}
                    >
                      <UserPlusIcon className="size-3.5 opacity-75" />
                      <span>{a.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* 当前在群成员 */}
          <div>
            <div className="mb-1.5 text-[12px] font-semibold text-(--biu-color-text-muted)">人类成员</div>
            <div className="space-y-1">
              {members.filter((m) => m.memberType === 'account').map((h) => (
                <div key={h.memberId} className="flex items-center justify-between rounded-md bg-(--biu-color-bg-subtle) px-2.5 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    {h.avatar ? (
                      <img src={h.avatar} alt="" className="size-5 rounded-full object-cover" />
                    ) : (
                      <AiAvatar seed={h.memberId} size={20} />
                    )}
                    <span className="truncate font-medium">{h.name}</span>
                    {h.role === 'owner' ? <span className="text-[11px] text-(--biu-color-text-subtle)">群主</span> : null}
                  </div>
                  {canManageMembers && h.role !== 'owner' ? (
                    <button
                      type="button"
                      className="text-[11px] text-red-400 hover:underline"
                      onClick={() => void handleRemove('account', h.memberId)}
                    >
                      移除
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {canManageMembers && addableHumans.length > 0 ? (
              <div className="mt-2">
                <div className="mb-1 text-[11px] text-(--biu-color-text-subtle)">邀请空间成员入群：</div>
                <div className="flex flex-wrap gap-1.5">
                  {addableHumans.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-(--biu-color-border) px-2 py-1 text-[12px] hover:bg-(--biu-color-bg-hover)"
                      onClick={() => void handleAdd('account', h.id)}
                    >
                      <UserPlusIcon className="size-3.5 opacity-75" />
                      <span>{h.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
