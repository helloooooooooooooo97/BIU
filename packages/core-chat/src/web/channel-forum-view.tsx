import { memo, useMemo, useState } from 'react'
import {
  BookmarkIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  RectangleStackIcon,
  TagIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { Button } from '@biu/biu-ui'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { SidebarMascot, resolveSessionMascot } from '@biu/public-mascot'
import {
  DEFAULT_FORUM_TAGS,
  normalizeForumPostStatus,
  type ChannelMemberView,
  type ChannelMessageView,
  type ChannelSummary,
  type ForumPostStatus,
} from '../shared/channel-types.ts'
import { sendChannelMessage, updateForumPost } from './channel-store.ts'

export const FORUM_STATUS_META: Record<
  ForumPostStatus,
  { label: string; badgeClass: string }
> = {
  open: {
    label: '进行中',
    badgeClass: 'bg-sky-500/12 text-sky-500',
  },
  resolved: {
    label: '已解决',
    badgeClass: 'bg-emerald-500/12 text-emerald-500',
  },
  closed: {
    label: '已关闭',
    badgeClass: 'bg-(--biu-color-bg-muted) text-(--biu-color-text-subtle)',
  },
}

export function getForumPostTitle(msg: Pick<ChannelMessageView, 'text' | 'attachments' | 'meta'>): string {
  const explicit = String(msg.meta?.postTitle ?? '').trim()
  if (explicit) return explicit
  const firstLine = String(msg.text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/[#>*`[\]()]/g, ' ').replace(/\s+/g, ' ').trim())
    .find(Boolean)
  if (firstLine) return firstLine.slice(0, 80)
  if (msg.attachments?.[0]?.name) return msg.attachments[0].name
  return '未命名帖子'
}

export function getForumPostStatus(msg?: Pick<ChannelMessageView, 'meta'> | null): ForumPostStatus {
  return normalizeForumPostStatus(msg?.meta?.postStatus)
}

export function ForumStatusBadge({
  status,
  className = '',
}: {
  status: ForumPostStatus
  className?: string
}) {
  const info = FORUM_STATUS_META[status] ?? FORUM_STATUS_META.open
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-none font-medium ${info.badgeClass} ${className}`}
      data-testid={`forum-status-badge-${status}`}
    >
      {status === 'resolved' ? (
        <CheckCircleIcon className="size-3 shrink-0" aria-hidden />
      ) : status === 'closed' ? (
        <LockClosedIcon className="size-3 shrink-0" aria-hidden />
      ) : (
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
      )}
      <span>{info.label}</span>
    </span>
  )
}

function formatShortTime(ts?: number): string {
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

export const ChannelForumBoard = memo(function ChannelForumBoard({
  channelId,
  channel,
  messages,
  members,
  myAccountId,
  canManage,
  resolveAvatar,
  onOpenPost,
  onError,
}: {
  channelId: string
  channel: ChannelSummary
  messages: ChannelMessageView[]
  members: ChannelMemberView[]
  myAccountId: string
  canManage: boolean
  resolveAvatar: (accountId?: string, serverAvatar?: string) => string | undefined
  onOpenPost: (postId: string) => void
  onError: (msg: string) => void
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | ForumPostStatus>('all')
  const [tagFilter, setTagFilter] = useState<string>('')
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<'active' | 'newest'>('active')
  const [composerOpen, setComposerOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [bodyDraft, setBodyDraft] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [customTag, setCustomTag] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [busyPostId, setBusyPostId] = useState<string | null>(null)

  const posts = useMemo(
    () => messages.filter((m) => !m.deletedAt && !m.ephemeralTo && !m.threadRootId),
    [messages],
  )

  const availableTags = useMemo(() => {
    const out: string[] = []
    const seen = new Set<string>()
    const push = (t: string) => {
      const clean = t.trim()
      if (!clean || seen.has(clean)) return
      seen.add(clean)
      out.push(clean)
    }
    for (const t of channel.forumTags?.length ? channel.forumTags : DEFAULT_FORUM_TAGS) push(t)
    for (const p of posts) {
      for (const t of p.meta?.postTags ?? []) push(t)
    }
    return out
  }, [channel.forumTags, posts])

  const statusCounts = useMemo(() => {
    const counts = { all: posts.length, open: 0, resolved: 0, closed: 0 }
    for (const p of posts) {
      const st = getForumPostStatus(p)
      counts[st] += 1
    }
    return counts
  }, [posts])

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = posts.filter((p) => {
      if (statusFilter !== 'all' && getForumPostStatus(p) !== statusFilter) return false
      if (tagFilter && !(p.meta?.postTags ?? []).includes(tagFilter)) return false
      if (q) {
        const title = getForumPostTitle(p).toLowerCase()
        const body = (p.text ?? '').toLowerCase()
        const tags = (p.meta?.postTags ?? []).join(' ').toLowerCase()
        if (!title.includes(q) && !body.includes(q) && !tags.includes(q) && !p.senderName.toLowerCase().includes(q)) {
          return false
        }
      }
      return true
    })
    return list.sort((a, b) => {
      const pinDiff = Number(Boolean(b.pinnedAt)) - Number(Boolean(a.pinnedAt))
      if (pinDiff !== 0) return pinDiff
      if (sortBy === 'newest') return b.createdAt - a.createdAt
      const aActive = a.threadSummary?.lastReplyAt || a.createdAt
      const bActive = b.threadSummary?.lastReplyAt || b.createdAt
      return bActive - aActive
    })
  }, [posts, query, sortBy, statusFilter, tagFilter])

  const channelAgents = useMemo(
    () => members.filter((m) => m.memberType === 'agent'),
    [members],
  )

  const toggleDraftTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : prev.length >= 5 ? prev : [...prev, tag],
    )
  }

  const addCustomTag = () => {
    const clean = customTag.trim().slice(0, 20)
    if (!clean) return
    if (!selectedTags.includes(clean) && selectedTags.length < 5) {
      setSelectedTags((prev) => [...prev, clean])
    }
    setCustomTag('')
  }

  const handleCreatePost = async () => {
    const cleanTitle = titleDraft.trim()
    const cleanBody = bodyDraft.trim()
    if (!cleanTitle || submitting) return
    setSubmitting(true)
    onError('')
    try {
      await sendChannelMessage(channelId, {
        text: cleanBody || cleanTitle,
        postTitle: cleanTitle,
        ...(selectedTags.length > 0 ? { postTags: selectedTags } : {}),
        postStatus: 'open',
      })
      setTitleDraft('')
      setBodyDraft('')
      setSelectedTags([])
      setCustomTag('')
      setComposerOpen(false)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleQuickStatus = async (post: ChannelMessageView, nextStatus: ForumPostStatus) => {
    if (busyPostId) return
    setBusyPostId(post.id)
    onError('')
    try {
      await updateForumPost(channelId, post.id, { postStatus: nextStatus })
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyPostId(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-3 px-2 pt-2 pb-10" data-testid="channel-forum-board">
      {/* 顶部筛选工具条 */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex items-center rounded-[9px] bg-(--biu-color-bg-muted)/70 p-0.5"
          role="tablist"
          aria-label="帖子状态筛选"
        >
          {(
            [
              { id: 'all', label: '全部', count: statusCounts.all },
              { id: 'open', label: '进行中', count: statusCounts.open },
              { id: 'resolved', label: '已解决', count: statusCounts.resolved },
              { id: 'closed', label: '已关闭', count: statusCounts.closed },
            ] as const
          ).map((item) => {
            const active = statusFilter === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`forum-filter-status-${item.id}`}
                className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded-[7px] border-0 px-2.5 text-[12px] transition-colors ${
                  active
                    ? 'bg-(--biu-color-bg-elevated) font-medium text-(--biu-color-text) shadow-xs'
                    : 'bg-transparent text-(--biu-color-text-muted) hover:text-(--biu-color-text)'
                }`}
                onClick={() => setStatusFilter(item.id)}
              >
                <span>{item.label}</span>
                <span className="text-[11px] text-(--biu-color-text-subtle) tabular-nums">{item.count}</span>
              </button>
            )
          })}
        </div>

        <div className="relative min-w-[160px] flex-1">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-(--biu-color-text-subtle)"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索帖子标题、正文或标签…"
            aria-label="搜索论坛帖子"
            data-testid="forum-search-input"
            className="h-8 w-full rounded-[8px] border border-(--biu-color-border) bg-(--biu-color-bg) pr-2.5 pl-8 text-[12.5px] text-(--biu-color-text) outline-none placeholder:text-(--biu-color-text-subtle) focus:border-(--biu-color-icon-active)"
          />
        </div>

        <button
          type="button"
          data-testid="forum-sort-toggle"
          className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-[8px] border border-(--biu-color-border) bg-(--biu-color-bg) px-2.5 text-[12px] text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
          onClick={() => setSortBy((s) => (s === 'active' ? 'newest' : 'active'))}
          title="切换排序方式"
        >
          <ClockIcon className="size-3.5 shrink-0" />
          <span>{sortBy === 'active' ? '最近活跃' : '最新发布'}</span>
        </button>

        {channel.canPost !== false ? (
          <Button
            className="h-8 shrink-0 gap-1 px-3 text-[12.5px]"
            data-testid="forum-new-post-btn"
            onClick={() => setComposerOpen((v) => !v)}
          >
            {composerOpen ? <XMarkIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}
            <span>{composerOpen ? '收起发帖' : '新建帖子'}</span>
          </Button>
        ) : null}
      </div>

      {/* 标签过滤行 */}
      {availableTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="forum-tag-filters">
          <TagIcon className="size-3.5 shrink-0 text-(--biu-color-text-subtle)" aria-hidden />
          <button
            type="button"
            className={`cursor-pointer rounded-full border-0 px-2.5 py-0.5 text-[11.5px] transition-colors ${
              !tagFilter
                ? 'bg-(--biu-color-text) font-medium text-(--biu-color-bg)'
                : 'bg-(--biu-color-bg-muted)/75 text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover)'
            }`}
            onClick={() => setTagFilter('')}
          >
            全部标签
          </button>
          {availableTags.map((tag) => {
            const active = tagFilter === tag
            return (
              <button
                key={tag}
                type="button"
                data-testid={`forum-tag-filter-${tag}`}
                className={`cursor-pointer rounded-full border-0 px-2.5 py-0.5 text-[11.5px] transition-colors ${
                  active
                    ? 'bg-(--biu-color-text) font-medium text-(--biu-color-bg)'
                    : 'bg-(--biu-color-bg-muted)/75 text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover)'
                }`}
                onClick={() => setTagFilter(active ? '' : tag)}
              >
                {tag}
              </button>
            )
          })}
        </div>
      ) : null}

      {/* 内联新建帖子表单 */}
      {composerOpen ? (
        <div
          className="space-y-2.5 rounded-[12px] border border-(--biu-color-border) bg-(--biu-color-bg-subtle) p-3.5 shadow-xs"
          data-testid="forum-new-post-form"
        >
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            placeholder="帖子标题（简明概括问题或议题）…"
            autoFocus
            maxLength={80}
            data-testid="forum-post-title-input"
            className="h-9 w-full rounded-[8px] border border-(--biu-color-border) bg-(--biu-color-bg) px-3 text-[14px] font-medium text-(--biu-color-text) outline-none placeholder:font-normal placeholder:text-(--biu-color-text-subtle) focus:border-(--biu-color-icon-active)"
          />
          <textarea
            rows={4}
            value={bodyDraft}
            onChange={(e) => setBodyDraft(e.target.value)}
            placeholder="详细描述背景、方案或待讨论要点… 支持 @Agent名称 并在帖内自动回复"
            data-testid="forum-post-body-input"
            className="w-full resize-y rounded-[8px] border border-(--biu-color-border) bg-(--biu-color-bg) px-3 py-2 text-[13px] leading-relaxed text-(--biu-color-text) outline-none placeholder:text-(--biu-color-text-subtle) focus:border-(--biu-color-icon-active)"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                void handleCreatePost()
              }
            }}
          />

          {/* 快捷 @Agent 召唤 */}
          {channelAgents.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-(--biu-color-text-subtle)">
              <span>召唤 Agent：</span>
              {channelAgents.map((ag) => (
                <button
                  key={ag.memberId}
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border-0 bg-(--biu-color-bg-muted)/80 px-2 py-0.5 text-[11.5px] text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
                  onClick={() =>
                    setBodyDraft((prev) => `${prev}${prev && !/\s$/.test(prev) ? ' ' : ''}@${ag.name} `)
                  }
                >
                  <SidebarMascot
                    size={14}
                    sessionId={ag.memberId}
                    identity={resolveSessionMascot(ag.memberId, ag.mascot)}
                    animate={false}
                    title=""
                  />
                  <span>@{ag.name}</span>
                </button>
              ))}
            </div>
          ) : null}

          {/* 标签选择 + 自定义标签 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] text-(--biu-color-text-subtle)">标签（最多 5 个）：</span>
            {availableTags.map((tag) => {
              const active = selectedTags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  data-testid={`forum-draft-tag-${tag}`}
                  className={`cursor-pointer rounded-full border-0 px-2.5 py-0.5 text-[11.5px] transition-colors ${
                    active
                      ? 'bg-(--biu-color-text) font-medium text-(--biu-color-bg)'
                      : 'bg-(--biu-color-bg-muted)/80 text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover)'
                  }`}
                  onClick={() => toggleDraftTag(tag)}
                >
                  {tag}
                </button>
              )
            })}
            <input
              type="text"
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              placeholder="+ 自定义标签"
              maxLength={20}
              data-testid="forum-custom-tag-input"
              className="h-6 w-24 rounded-full border border-dashed border-(--biu-color-border) bg-transparent px-2 text-[11.5px] text-(--biu-color-text) outline-none placeholder:text-(--biu-color-text-subtle) focus:border-(--biu-color-icon-active)"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCustomTag()
                }
              }}
              onBlur={addCustomTag}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11.5px] text-(--biu-color-text-subtle)">
              发布后每个帖子拥有独立讨论串，⌘/Ctrl + Enter 快捷发布
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="h-8 px-3 text-[12px]"
                disabled={submitting}
                onClick={() => setComposerOpen(false)}
              >
                取消
              </Button>
              <Button
                className="h-8 px-3.5 text-[12px]"
                disabled={!titleDraft.trim() || submitting}
                data-testid="forum-post-submit"
                onClick={() => void handleCreatePost()}
              >
                {submitting ? '发布中…' : '发布帖子'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 帖子列表 */}
      {filteredPosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-(--biu-color-border) py-14 text-center">
          <RectangleStackIcon className="mb-2 size-7 text-(--biu-color-text-subtle) opacity-70" aria-hidden />
          <div className="mb-1 text-[14px] font-semibold text-(--biu-color-text)">
            {posts.length === 0 ? `欢迎来到论坛「${channel.name}」` : '没有匹配的帖子'}
          </div>
          <p className="mb-3 max-w-md text-[12.5px] text-(--biu-color-text-subtle)">
            {posts.length === 0
              ? '每条帖子都是一个独立议题，支持标题、标签、解决状态与独立的 Agent 讨论上下文。'
              : '可以切换状态/标签筛选，或清空搜索关键词查看全部帖子。'}
          </p>
          {posts.length === 0 && !composerOpen && channel.canPost !== false ? (
            <Button className="h-8 gap-1 px-3.5 text-[12.5px]" onClick={() => setComposerOpen(true)}>
              <PlusIcon className="size-3.5" />
              <span>发布第一篇帖子</span>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2" data-testid="forum-post-list">
          {filteredPosts.map((post) => {
            const title = getForumPostTitle(post)
            const status = getForumPostStatus(post)
            const tags = post.meta?.postTags ?? []
            const replyCount = post.threadSummary?.replyCount ?? 0
            const lastActiveAt = post.threadSummary?.lastReplyAt || post.createdAt
            const isSelf = post.senderType === 'account' && Boolean(myAccountId) && post.senderId === myAccountId
            const canToggleStatus = isSelf || canManage
            const avatar =
              post.senderType === 'account' ? resolveAvatar(post.senderId, post.senderAvatar) : undefined
            const bodyExcerpt = (post.text ?? '').trim()
            const showBodyExcerpt = bodyExcerpt && bodyExcerpt !== title
            return (
              <div
                key={post.id}
                role="button"
                tabIndex={0}
                data-testid={`forum-post-card-${post.id}`}
                className="group cursor-pointer rounded-[12px] border border-(--biu-color-border) bg-(--biu-color-bg-subtle) px-4 py-3 text-left transition-colors hover:border-(--biu-color-icon-active)/50 hover:bg-(--biu-color-bg-hover)/40"
                onClick={() => onOpenPost(post.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenPost(post.id)
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {post.pinnedAt ? (
                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/12 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-500">
                          <BookmarkIcon className="size-2.5" />
                          置顶
                        </span>
                      ) : null}
                      <ForumStatusBadge status={status} />
                      <h3 className="m-0 truncate text-[14.5px] font-semibold text-(--biu-color-text)">
                        {title}
                      </h3>
                    </div>

                    {showBodyExcerpt ? (
                      <p className="m-0 line-clamp-2 text-[12.5px] leading-relaxed text-(--biu-color-text-muted)">
                        {bodyExcerpt}
                      </p>
                    ) : null}

                    {tags.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-(--biu-color-bg-muted) px-2 py-0.5 text-[11px] text-(--biu-color-text-muted)"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-(--biu-color-bg-muted)/70 px-2 py-1 text-[11.5px] font-medium text-(--biu-color-text-muted) tabular-nums">
                      <ChatBubbleLeftRightIcon className="size-3.5 shrink-0" />
                      <span>{replyCount}</span>
                    </span>
                    {canToggleStatus ? (
                      <button
                        type="button"
                        disabled={busyPostId === post.id}
                        data-testid={`forum-post-toggle-status-${post.id}`}
                        className="cursor-pointer rounded-md border-0 bg-transparent px-1.5 py-0.5 text-[11px] text-(--biu-color-text-subtle) opacity-0 transition-opacity hover:bg-(--biu-color-bg-muted) hover:text-(--biu-color-text) group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-50"
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleQuickStatus(post, status === 'resolved' ? 'open' : 'resolved')
                        }}
                      >
                        {status === 'resolved' ? '重开' : '标为已解决'}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-(--biu-color-bg-muted) pt-2 text-[11.5px] text-(--biu-color-text-subtle)">
                  <div className="flex min-w-0 items-center gap-2">
                    {post.senderType === 'agent' ? (
                      <SidebarMascot
                        size={16}
                        sessionId={post.senderId}
                        identity={resolveSessionMascot(post.senderId, post.senderMascot)}
                        animate={false}
                        title=""
                      />
                    ) : avatar ? (
                      <img src={avatar} alt="" className="size-4 shrink-0 rounded-full object-cover" />
                    ) : (
                      <AiAvatar seed={post.senderId || post.id} size={16} className="shrink-0 rounded-full" />
                    )}
                    <span className="truncate font-medium text-(--biu-color-text-muted)">{post.senderName}</span>
                    <span>发布于 {formatShortTime(post.createdAt)}</span>
                    {post.attachments && post.attachments.length > 0 ? (
                      <span>· {post.attachments.length} 个附件</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2.5 tabular-nums">
                    {post.reactions && post.reactions.length > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        {post.reactions.slice(0, 3).map((r) => (
                          <span key={r.emoji}>
                            {r.emoji} {r.count}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    <span>{replyCount > 0 ? `最后回复 ${formatShortTime(lastActiveAt)}` : '暂无回复'}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})
