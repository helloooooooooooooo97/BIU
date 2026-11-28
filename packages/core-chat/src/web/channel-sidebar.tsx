import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChatBubbleLeftRightIcon,
  HashtagIcon,
  LockClosedIcon,
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
import type { ChannelAccessMode } from '../shared/channel-types.ts'
import {
  createChannel,
  deleteChannel,
  loadChannels,
  openOrCreateDm,
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
  const [openingDmId, setOpeningDmId] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded) void loadChannels()
  }, [loaded])

  const groupChannels = useMemo(
    () => channels.filter((c) => c.kind !== 'dm'),
    [channels],
  )
  const dmByPeer = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of channels) {
      if (c.kind === 'dm' && c.peerAccountId) map.set(c.peerAccountId, c.id)
    }
    return map
  }, [channels])

  const peerMembers = useMemo(
    () => members.filter((m) => !myAccountId || m.id !== myAccountId),
    [members, myAccountId],
  )
  const selfMember = useMemo(
    () => (myAccountId ? members.find((m) => m.id === myAccountId) ?? null : null),
    [members, myAccountId],
  )
  const dmDisplayMembers = useMemo(
    () =>
      peerMembers.length > 0
        ? peerMembers
        : selfMember
          ? [{ ...selfMember, name: `${selfMember.name}（自己）` }]
          : [],
    [peerMembers, selfMember],
  )

  const handleOpenDm = useCallback(
    async (targetAccountId: string) => {
      if (openingDmId) return
      setOpeningDmId(targetAccountId)
      try {
        const detail = await openOrCreateDm(targetAccountId)
        popoverClose?.()
        navigate(channelAppPath(detail.channel.id))
      } catch {
        /* ignore */
      } finally {
        setOpeningDmId(null)
      }
    },
    [navigate, openingDmId, popoverClose],
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
          title="新建群聊"
          aria-label="新建群聊"
          data-dock-tip="新建群聊"
          data-dock-tip-at="e"
          data-testid="sidebar-rail-create-channel"
          onClick={() => setCreateOpen(true)}
        >
          <span className="grid size-6 shrink-0 place-items-center">
            <UserGroupIcon className="size-4 opacity-85" aria-hidden />
          </span>
        </button>
        {groupChannels.map((ch) => {
          const active = ch.id === routeChannelId
          return (
            <Link
              key={ch.id}
              to={channelAppPath(ch.id)}
              className={`chat-session-row${active ? ' is-active' : ''}`}
              title={`# ${ch.name}`}
              aria-label={`群聊 ${ch.name}`}
              data-dock-tip={`# ${ch.name}`}
              data-dock-tip-at="e"
              onClick={() => popoverClose?.()}
            >
              <span className="grid size-6 shrink-0 place-items-center">
                {ch.accessMode === 'private' ? (
                  <LockClosedIcon className="size-3.5 opacity-80" aria-hidden />
                ) : (
                  <HashtagIcon className="size-4 opacity-80" aria-hidden />
                )}
              </span>
            </Link>
          )
        })}
        {dmDisplayMembers.map((member) => {
          const dmId = dmByPeer.get(member.id)
          const active = Boolean(dmId && dmId === routeChannelId)
          return (
            <button
              key={member.id}
              type="button"
              className={`chat-session-row w-full border-0 bg-transparent${active ? ' is-active' : ''}`}
              title={`私聊 ${member.name}`}
              aria-label={`私聊 ${member.name}`}
              data-dock-tip={`私聊 ${member.name}`}
              data-dock-tip-at="e"
              onClick={() => void handleOpenDm(member.id)}
            >
              <span className="grid size-6 shrink-0 place-items-center">
                {member.avatar ? (
                  <img src={member.avatar} alt="" className="size-5 rounded-full object-cover" />
                ) : (
                  <AiAvatar seed={member.id} size={20} />
                )}
              </span>
            </button>
          )
        })}
        {createOpen ? (
          <CreateChannelDialog
            members={peerMembers}
            myAccountId={myAccountId}
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
  const membersCollapsed = Boolean(collapsedMap['chat.section.members'])

  return (
    <div className="space-y-1.5" data-testid="sidebar-slack-sections">
      {/* 1. 群聊（Channels） */}
      <section className="min-w-0" data-testid="sidebar-channels-section">
        <div className="sidebar-section-head min-w-0">
          <button
            type="button"
            className="flex h-full min-h-8 min-w-0 flex-1 items-center gap-2 text-left text-[12px] font-bold tracking-wider"
            aria-expanded={!channelsCollapsed}
            onClick={() => toggleSection('chat.section.channels')}
          >
            <span className="min-w-0 flex-1 truncate tracking-normal">群聊</span>
          </button>
          <ChatCount count={groupChannels.length} />
          <button
            type="button"
            className="grid size-6 shrink-0 place-items-center rounded-md border-0 bg-transparent p-0 text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
            title="新建群聊"
            aria-label="新建群聊"
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
          <div className="sidebar-section-rows flex min-w-0 flex-col pt-0.5">
            {groupChannels.length === 0 ? (
              <button
                type="button"
                className="mx-1 flex items-center gap-1.5 rounded-md border border-dashed border-(--biu-color-border) px-2 py-1.5 text-left text-[12px] font-medium text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
                data-testid="sidebar-create-first-channel"
                onClick={() => setCreateOpen(true)}
              >
                <PlusIcon className="size-3.5 shrink-0" />
                <span>新建群聊</span>
              </button>
            ) : (
              groupChannels.map((ch) => (
                <SidebarRow
                  key={ch.id}
                  active={ch.id === routeChannelId}
                  main={
                    <Link
                      to={channelAppPath(ch.id)}
                      className={SIDEBAR_ROW_MAIN_CLASS}
                      title={ch.topic ? `# ${ch.name} · ${ch.topic}` : `# ${ch.name}`}
                      onClick={() => popoverClose?.()}
                    >
                      <span className="grid size-5 shrink-0 place-items-center opacity-80" aria-hidden>
                        {ch.accessMode === 'private' ? (
                          <LockClosedIcon className="size-3.5" />
                        ) : (
                          <HashtagIcon className="size-3.5" />
                        )}
                      </span>
                      <span className="sidebar-label min-w-0 flex-1 truncate font-medium">{ch.name}</span>
                    </Link>
                  }
                  onDelete={() => void handleDeleteChannel(ch.id)}
                  deleteLabel={`解散群聊 ${ch.name}`}
                  deleteIcon={<TrashGlyph className="size-4 shrink-0" />}
                />
              ))
            )}
          </div>
        </SidebarFold>
      </section>

      {/* 2. 成员私聊（Direct Messages）——常驻展示并位于代理上方 */}
      <section className="min-w-0" data-testid="sidebar-members-section">
        <div className="sidebar-section-head min-w-0">
          <button
            type="button"
            className="flex h-full min-h-8 min-w-0 flex-1 items-center gap-2 text-left text-[12px] font-bold tracking-wider"
            aria-expanded={!membersCollapsed}
            onClick={() => toggleSection('chat.section.members')}
          >
            <span className="min-w-0 flex-1 truncate tracking-normal">成员</span>
          </button>
          <ChatCount count={dmDisplayMembers.length} />
        </div>

        <SidebarFold open={!membersCollapsed}>
          <div className="sidebar-section-rows flex min-w-0 flex-col pt-0.5">
            {dmDisplayMembers.length === 0 ? (
              <div className="px-2 py-1 text-[12px] text-(--biu-color-text-subtle)">
                邀请空间成员后可在此直接发起私聊
              </div>
            ) : (
              dmDisplayMembers.map((member) => {
                const dmId = dmByPeer.get(member.id)
                const active = Boolean(dmId && dmId === routeChannelId)
                return (
                  <SidebarRow
                    key={member.id}
                    active={active}
                    main={
                      <button
                        type="button"
                        className={`${SIDEBAR_ROW_MAIN_CLASS} border-0 bg-transparent text-left`}
                        title={`与 ${member.name} 私聊`}
                        data-testid={`sidebar-member-dm-${member.id}`}
                        disabled={openingDmId === member.id}
                        onClick={() => void handleOpenDm(member.id)}
                      >
                        <span className="relative grid size-5 shrink-0 place-items-center">
                          {member.avatar ? (
                            <img src={member.avatar} alt="" className="size-5 rounded-full object-cover" />
                          ) : (
                            <AiAvatar seed={member.id} size={18} />
                          )}
                          {member.status === 'online' ? (
                            <span
                              className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full border border-(--biu-color-bg-subtle) bg-emerald-500"
                              aria-label="在线"
                            />
                          ) : null}
                        </span>
                        <span className="sidebar-label min-w-0 flex-1 truncate font-medium">{member.name}</span>
                      </button>
                    }
                    trail={
                      <button
                        type="button"
                        className="grid size-6 shrink-0 place-items-center rounded-md border-0 bg-transparent p-0 text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
                        title={`发起与 ${member.name} 的私聊`}
                        aria-label={`发起与 ${member.name} 的私聊`}
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleOpenDm(member.id)
                        }}
                      >
                        <ChatBubbleLeftRightIcon className="size-3.5 shrink-0" />
                      </button>
                    }
                  />
                )
              })
            )}
          </div>
        </SidebarFold>
      </section>

      {createOpen ? (
        <CreateChannelDialog
          members={peerMembers}
          myAccountId={myAccountId}
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
  useSessionView,
  onClose,
  onCreated,
}: {
  members: WorkspaceMemberRow[]
  myAccountId: string
  useSessionView?: ReturnType<typeof bindSessionView>
  onClose: () => void
  onCreated: (channelId: string) => void
}) {
  const allSessions = useSessionView ? useSessionView((s) => s.sessions) : []
  const myAgents = useMemo(
    () => allSessions.filter((s) => !myAccountId || !s.createdBy || s.createdBy === myAccountId),
    [allSessions, myAccountId],
  )
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [accessMode, setAccessMode] = useState<ChannelAccessMode>('private')
  const [pickedMembers, setPickedMembers] = useState<string[]>([])
  const [pickedAgents, setPickedAgents] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const toggleItem = (list: string[], setList: (next: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  }

  const submit = async () => {
    if (!name.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const detail = await createChannel({
        name: name.trim(),
        topic: topic.trim(),
        accessMode,
        memberAccountIds: pickedMembers,
        agentIds: pickedAgents,
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
      aria-label="新建群聊"
      data-testid="create-channel-dialog"
    >
      <div
        className="biu-float scfg-float !w-[min(480px,calc(100vw-32px))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="biu-float-head scfg-head">
          <h2 className="biu-float-title scfg-title">新建群聊</h2>
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
              <label className="scfg-field">
                <span className="scfg-label">群聊名称</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：产品研发群、发布协作"
                  autoFocus
                  className="scfg-input"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submit()
                  }}
                />
              </label>

              <label className="scfg-field">
                <span className="scfg-label">群主题（可选）</span>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="描述这个群聊的协作目标"
                  className="scfg-input"
                />
              </label>

              <div className="scfg-field">
                <span className="scfg-label">可见范围</span>
                <div className="flex gap-2">
                  <Button
                    variant={accessMode === 'private' ? 'default' : 'secondary'}
                    className="h-8 flex-1 text-[12px]"
                    onClick={() => setAccessMode('private')}
                  >
                    <LockClosedIcon className="size-3.5" />
                    <span>私密邀请群</span>
                  </Button>
                  <Button
                    variant={accessMode === 'workspace' ? 'default' : 'secondary'}
                    className="h-8 flex-1 text-[12px]"
                    onClick={() => setAccessMode('workspace')}
                  >
                    <HashtagIcon className="size-3.5" />
                    <span>空间公开群</span>
                  </Button>
                </div>
              </div>
            </div>

            {members.length > 0 ? (
              <div className="scfg-section">
                <div className="scfg-tools-head">
                  <span className="scfg-label">邀请空间成员</span>
                  <span className="scfg-hint">已选 {pickedMembers.length} 人</span>
                </div>
                <ul className="scfg-tools-list max-h-36 overflow-y-auto">
                  {members.map((m) => (
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
              </div>
            ) : null}

            {myAgents.length > 0 ? (
              <div className="scfg-section">
                <div className="scfg-tools-head">
                  <span className="scfg-label">拉入我的 Agent</span>
                  <span className="scfg-hint">仅归属人可拉入 · 已选 {pickedAgents.length}</span>
                </div>
                <ul className="scfg-tools-list max-h-40 overflow-y-auto">
                  {myAgents.slice(0, 30).map((agent) => (
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
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-3">
              <Button variant="secondary" onClick={onClose}>
                取消
              </Button>
              <Button disabled={!name.trim() || submitting} onClick={() => void submit()}>
                {submitting ? '创建中…' : '创建群聊'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
