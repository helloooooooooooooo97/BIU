import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import {
  HashtagIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { Button } from '@biu/biu-ui'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { apiFetch } from '@biu/biu-ui/api-client'
import { onAppEvents } from '@biu/biu-ui/app-events'
import { ChatCount } from '@biu/biu-ui/chat-count'
import { SidebarFold } from '@biu/biu-ui/sidebar-fold'
import { SidebarMascot, resolveSessionMascot } from '@biu/public-mascot'
import {
  bindSessionView,
  channelAppPath,
  useSidebarCollapseStore,
  type SessionViewService,
} from '@biu/web-session-view'
import { SIDEBAR_ROW_MAIN_CLASS, SidebarRow } from '@biu/web-session-view/sidebar-row'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import {
  buildDefaultChannelName,
  type ChannelAccessMode,
  type ChannelAgentContextMode,
} from '../shared/channel-types.ts'
import {
  createChannel,
  deleteChannel,
  loadChannels,
  useChannelStore,
} from './channel-store.ts'

type WorkspaceMemberRow = {
  id: string
  name: string
  email?: string
  avatar?: string
  status?: string
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
  const channels = useChannelStore((s) => s.channels)
  const loaded = useChannelStore((s) => s.loaded)
  const collapsedMap = useSidebarCollapseStore((s) => s.collapsed)
  const toggleSection = useSidebarCollapseStore((s) => s.toggle)
  const { myAccountId, members } = useWorkspaceMembers()
  const [createOpen, setCreateOpen] = useState(false)

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

  const handleDeleteChannel = useCallback(
    async (channelId: string) => {
      try {
        await deleteChannel(channelId)
        if (routeChannelId === channelId) navigate('/')
      } catch {
        /* ignore */
      }
    },
    [navigate, routeChannelId],
  )

  if (iconRail) {
    return (
      <div className="mb-1 flex flex-col gap-0.5 border-b border-(--biu-color-border-subtle) pb-1" data-testid="sidebar-channels-rail">
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
                    <img src={peerAvatar} alt="" className="size-5 rounded-full object-cover" />
                  ) : (
                    <AiAvatar seed={ch.peerAccountId || ch.id} size={20} className="rounded-full" />
                  )
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

  return (
    <div className="space-y-1.5" data-testid="sidebar-slack-sections">
      {/* 聊天（包含多人聊天与已发起的成员私聊；右上角 + 新建） */}
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
          <ChatCount count={channels.length} />
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
          {channels.length > 0 ? (
            <div className="sidebar-section-rows flex min-w-0 flex-col pt-0.5">
              {channels.map((ch) => {
                const isDm = ch.kind === 'dm'
                const active = ch.id === routeChannelId
                const peerAvatar = isDm
                  ? (ch.peerAccountId ? memberAvatarById.get(ch.peerAccountId) : undefined) || ch.peerAvatar
                  : undefined
                const peerOnline = isDm && Boolean(ch.peerAccountId && memberOnlineById.has(ch.peerAccountId))
                const unread = !active ? (ch.unreadCount ?? 0) : 0
                const mentions = !active ? (ch.mentionCount ?? 0) : 0
                const hasUnreadEmphasis = unread > 0 && !ch.muted
                return (
                  <SidebarRow
                    key={ch.id}
                    active={active}
                    main={
                      <Link
                        to={channelAppPath(ch.id)}
                        className={SIDEBAR_ROW_MAIN_CLASS}
                        title={ch.topic ? `${ch.name} · ${ch.topic}` : ch.name}
                        onClick={() => popoverClose?.()}
                      >
                        <span className="relative grid size-5 shrink-0 place-items-center opacity-85" aria-hidden>
                          {isDm ? (
                            peerAvatar ? (
                              <img src={peerAvatar} alt="" className="size-4.5 rounded-full object-cover" />
                            ) : (
                              <AiAvatar seed={ch.peerAccountId || ch.id} size={18} className="rounded-full" />
                            )
                          ) : ch.accessMode === 'private' ? (
                            <LockClosedIcon className="size-3.5" />
                          ) : (
                            <HashtagIcon className="size-3.5" />
                          )}
                          {peerOnline ? (
                            <span
                              className="absolute right-0 bottom-0 size-2 rounded-full bg-emerald-500 ring-[1.5px] ring-(--biu-color-bg-subtle)"
                              data-testid={`sidebar-dm-online-${ch.id}`}
                              aria-hidden
                            />
                          ) : null}
                        </span>
                        <span
                          className={`sidebar-label min-w-0 flex-1 truncate ${hasUnreadEmphasis ? 'font-semibold text-(--biu-color-text)' : 'font-medium'}`}
                        >
                          {ch.name}
                        </span>
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
                      </Link>
                    }
                    onDelete={() => void handleDeleteChannel(ch.id)}
                    deleteLabel={isDm ? `删除聊天 ${ch.name}` : `解散聊天 ${ch.name}`}
                    deleteIcon={<TrashGlyph className="size-4 shrink-0" />}
                  />
                )
              })}
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
  const [search, setSearch] = useState('')
  const [accessMode, setAccessMode] = useState<ChannelAccessMode>('private')
  const [agentContextMode, setAgentContextMode] = useState<ChannelAgentContextMode>('summary')
  const [pickedMembers, setPickedMembers] = useState<string[]>([])
  const [pickedAgents, setPickedAgents] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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
    const humanNames = selfName ? [selfName, ...pickedHumanNames] : pickedHumanNames
    return buildDefaultChannelName(humanNames, pickedAgentNames)
  }, [members, myAgents, pickedAgents, pickedMembers, selfName])

  const hasSelection = pickedMembers.length + pickedAgents.length > 0

  const submit = async () => {
    if (!hasSelection || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const detail = await createChannel({
        name: defaultName,
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

          <div className="scfg-sections">
            <div className="scfg-section">
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
                title={hasSelection ? `默认名称：${defaultName}（聊天后也会根据内容自动命名）` : undefined}
              >
                {hasSelection ? `默认名称：${defaultName}` : '请选择成员或 Agent'}
              </span>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" onClick={onClose}>
                  取消
                </Button>
                <Button
                  data-testid="create-channel-submit"
                  disabled={!hasSelection || submitting}
                  onClick={() => void submit()}
                >
                  {submitting ? '创建中…' : '创建聊天'}
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
