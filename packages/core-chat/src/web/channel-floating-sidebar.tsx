import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AtSymbolIcon,
  BellIcon,
  BellSlashIcon,
  BookmarkIcon,
  ChatBubbleLeftEllipsisIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  SparklesIcon,
  StarIcon,
  UserPlusIcon,
} from '@heroicons/react/16/solid'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { readStorageString, writeStorageString } from '@biu/biu-ui/client-storage'
import { SidebarMascot, resolveSessionMascot } from '@biu/public-mascot'
import type {
  ChannelAgentActivity,
  ChannelMemberView,
  ChannelMention,
  ChannelSummary,
} from '../shared/channel-types.ts'

const PIN_STORAGE_KEY = 'channel.floatingSidebar.pinned'
const HOVER_CLOSE_DELAY_MS = 140
const MAX_RAIL_AVATARS = 6

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

function RosterAvatar({ avatar, seed, size = 22 }: { avatar?: string; seed: string; size?: number }) {
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

export type ChannelFloatingSidebarProps = {
  channel: ChannelSummary | undefined
  isDm: boolean
  members: ChannelMemberView[]
  activities: ChannelAgentActivity[]
  myAccountId: string
  canManageMembers: boolean
  pinnedMessageCount: number
  resolveAvatar: (accountId?: string, serverAvatar?: string) => string | undefined
  isOnline: (accountId?: string) => boolean
  onMention: (mention: ChannelMention) => void
  onAgentClick: (agentId: string) => void
  onOpenDm: (accountId: string) => void
  onOpenManageMembers: () => void
  onOpenPins: () => void
  onOpenSaved: () => void
  onSummarize: () => void
  onToggleSearch: () => void
  onToggleChannelPinned: () => void
  onToggleChannelMuted: () => void
}

/**
 * 聊天舞台内部右侧悬浮边栏：
 * - 默认收起为贴右边的极简竖向头像轨，不占消息流空间，一眼可见在线成员与 Agent；
 * - 鼠标悬停自动滑出完整悬浮面板（成员 + Agent + 快捷入口），点击右上角图钉可固定常驻。
 */
export const ChannelFloatingSidebar = memo(function ChannelFloatingSidebar({
  channel,
  isDm,
  members,
  activities,
  myAccountId,
  canManageMembers,
  pinnedMessageCount,
  resolveAvatar,
  isOnline,
  onMention,
  onAgentClick,
  onOpenDm,
  onOpenManageMembers,
  onOpenPins,
  onOpenSaved,
  onSummarize,
  onToggleSearch,
  onToggleChannelPinned,
  onToggleChannelMuted,
}: ChannelFloatingSidebarProps) {
  const [pinned, setPinned] = useState<boolean>(readInitialPinned)
  const [hovered, setHovered] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer])

  const handleMouseEnter = useCallback(() => {
    clearCloseTimer()
    setHovered(true)
  }, [clearCloseTimer])

  const handleMouseLeave = useCallback(() => {
    clearCloseTimer()
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      setHovered(false)
    }, HOVER_CLOSE_DELAY_MS)
  }, [clearCloseTimer])

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev
      writePinned(next)
      if (!next) setHovered(false)
      return next
    })
  }, [])

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
    const combined: ChannelMemberView[] = [...agentMembers, ...humanMembers]
    return {
      visible: combined.slice(0, MAX_RAIL_AVATARS),
      overflow: Math.max(0, combined.length - MAX_RAIL_AVATARS),
    }
  }, [agentMembers, humanMembers])

  const open = pinned || hovered

  return (
    <aside
      className="pointer-events-none absolute top-3 right-3 bottom-24 z-15 flex items-start justify-end"
      data-testid="channel-floating-sidebar"
      data-open={open ? 'true' : 'false'}
      data-pinned={pinned ? 'true' : 'false'}
      aria-label="聊天成员与快捷入口"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {open ? (
        <div
          className="pointer-events-auto flex max-h-full w-[252px] flex-col overflow-hidden rounded-[var(--biu-radius-popover)] border border-(--biu-color-border-popover) bg-(--biu-color-bg-popover) shadow-(--biu-shadow-popover)"
          data-testid="channel-floating-panel"
        >
          {/* 顶栏：计数 + 置顶固定 + 添加成员 */}
          <div className="flex shrink-0 items-center justify-between gap-1.5 border-b border-(--biu-color-border-subtle) px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-semibold text-(--biu-color-text)">
                {isDm ? '会话成员与快捷入口' : '群成员与快捷入口'}
              </div>
              <div className="text-[11px] text-(--biu-color-text-subtle) tabular-nums">
                {humanMembers.length} 人{onlineCount > 0 ? `（${onlineCount} 在线）` : ''}
                {agentMembers.length > 0 ? ` · ${agentMembers.length} Agent` : ''}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {!isDm && canManageMembers ? (
                <button
                  type="button"
                  data-testid="channel-floating-add"
                  title="添加成员或 Agent"
                  aria-label="添加成员或 Agent"
                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)"
                  onClick={onOpenManageMembers}
                >
                  <UserPlusIcon className="size-3.5" />
                </button>
              ) : null}
              <button
                type="button"
                data-testid="channel-floating-pin"
                aria-pressed={pinned}
                title={pinned ? '取消固定右侧栏（恢复悬浮收起）' : '固定右侧栏'}
                aria-label={pinned ? '取消固定右侧栏' : '固定右侧栏'}
                className={`inline-flex size-6 cursor-pointer items-center justify-center rounded-md border-0 transition-colors ${
                  pinned
                    ? 'bg-(--biu-color-bg-muted) text-(--biu-color-icon-active)'
                    : 'bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)'
                }`}
                onClick={togglePin}
              >
                <MapPinIcon className="size-3.5" />
              </button>
            </div>
          </div>

          {/* 快捷入口条 */}
          <div className="grid shrink-0 grid-cols-4 gap-1 border-b border-(--biu-color-border-subtle) px-2 py-2">
            <button
              type="button"
              data-testid="channel-quick-pins"
              title="查看置顶消息"
              className="relative flex cursor-pointer flex-col items-center gap-1 rounded-md border-0 bg-transparent px-1 py-1.5 text-[11px] text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)"
              onClick={onOpenPins}
            >
              <BookmarkIcon className="size-3.5 text-(--biu-color-icon)" />
              <span>置顶</span>
              {pinnedMessageCount > 0 ? (
                <span className="absolute top-0.5 right-1 rounded-full bg-(--biu-color-bg-muted) px-1 text-[10px] leading-tight text-(--biu-color-text) tabular-nums">
                  {pinnedMessageCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              data-testid="channel-quick-saved"
              title="查看收藏消息"
              className="flex cursor-pointer flex-col items-center gap-1 rounded-md border-0 bg-transparent px-1 py-1.5 text-[11px] text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)"
              onClick={onOpenSaved}
            >
              <StarIcon className="size-3.5 text-(--biu-color-icon)" />
              <span>收藏</span>
            </button>
            <button
              type="button"
              data-testid="channel-quick-summarize"
              title="AI 总结聊天要点"
              className="flex cursor-pointer flex-col items-center gap-1 rounded-md border-0 bg-transparent px-1 py-1.5 text-[11px] text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)"
              onClick={onSummarize}
            >
              <SparklesIcon className="size-3.5 text-(--biu-color-icon)" />
              <span>总结</span>
            </button>
            <button
              type="button"
              data-testid="channel-quick-search"
              title="搜索聊天记录"
              className="flex cursor-pointer flex-col items-center gap-1 rounded-md border-0 bg-transparent px-1 py-1.5 text-[11px] text-(--biu-color-text-muted) transition-colors hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)"
              onClick={onToggleSearch}
            >
              <MagnifyingGlassIcon className="size-3.5 text-(--biu-color-icon)" />
              <span>搜索</span>
            </button>
          </div>

          {/* 成员与 Agent 列表 */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-2">
            {agentMembers.length > 0 ? (
              <div>
                <div className="mb-1 flex items-center justify-between px-1.5 text-[11px] font-medium text-(--biu-color-text-subtle)">
                  <span>Agent · {agentMembers.length}</span>
                  {agentMembers.length > 1 ? (
                    <button
                      type="button"
                      className="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-(--biu-color-text-muted) hover:text-(--biu-color-text)"
                      title="一键 @所有人 唤醒群内全部 Agent"
                      onClick={() => onMention({ kind: 'everyone', id: 'everyone', label: '所有人' })}
                    >
                      @所有人
                    </button>
                  ) : null}
                </div>
                <div className="space-y-0.5">
                  {agentMembers.map((ag) => {
                    const busy = busyAgentIds.has(ag.memberId)
                    return (
                      <div
                        key={`agent:${ag.memberId}`}
                        data-testid={`channel-roster-agent-${ag.memberId}`}
                        className="group/row flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-(--biu-color-bg-popover-hover)"
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
                          title={ag.isOwn ? `进入 ${ag.name} 的 1v1 工作台` : `查看 ${ag.name} 名片`}
                          onClick={() => onAgentClick(ag.memberId)}
                        >
                          <SidebarMascot
                            size={22}
                            sessionId={ag.memberId}
                            identity={resolveSessionMascot(ag.memberId, ag.mascot)}
                            busy={busy}
                            animate={false}
                            title=""
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <span className="truncate text-[12.5px] font-medium text-(--biu-color-text)">
                                {ag.name}
                              </span>
                              {busy ? (
                                <span className="shrink-0 rounded bg-emerald-500/15 px-1 py-0.5 text-[10px] leading-none text-emerald-400">
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
                          className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-(--biu-color-text-muted) opacity-70 transition-opacity hover:bg-(--biu-color-bg-muted) hover:text-(--biu-color-text) group-hover/row:opacity-100"
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

            <div>
              <div className="mb-1 px-1.5 text-[11px] font-medium text-(--biu-color-text-subtle)">
                成员 · {humanMembers.length}
              </div>
              <div className="space-y-0.5">
                {humanMembers.map((member) => {
                  const online = isOnline(member.memberId)
                  const isMe = Boolean(myAccountId) && member.memberId === myAccountId
                  return (
                    <div
                      key={`account:${member.memberId}`}
                      data-testid={`channel-roster-member-${member.memberId}`}
                      className="group/row flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-(--biu-color-bg-popover-hover)"
                    >
                      <span className="relative inline-flex shrink-0">
                        <RosterAvatar
                          avatar={resolveAvatar(member.memberId, member.avatar)}
                          seed={member.memberId}
                          size={22}
                        />
                        {online ? (
                          <span
                            className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-emerald-500 ring-[1.5px] ring-(--biu-color-bg-popover)"
                            title="在线"
                          />
                        ) : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-[12.5px] font-medium text-(--biu-color-text)">
                            {member.name}
                          </span>
                          {isMe ? (
                            <span className="shrink-0 rounded bg-(--biu-color-bg-muted) px-1 py-0.5 text-[10px] leading-none text-(--biu-color-text-subtle)">
                              我
                            </span>
                          ) : null}
                          {!isDm && member.role === 'owner' ? (
                            <span className="shrink-0 rounded bg-(--biu-color-bg-muted) px-1 py-0.5 text-[10px] leading-none text-(--biu-color-text-subtle)">
                              群主
                            </span>
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
          </div>

          {/* 底部偏好与管理入口 */}
          <div className="flex shrink-0 items-center justify-between gap-1 border-t border-(--biu-color-border-subtle) px-2 py-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="channel-floating-pref-pin"
                title={channel?.pinned ? '取消置顶聊天' : '置顶此聊天到侧栏顶部'}
                className={`inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border-0 px-1.5 text-[11px] transition-colors ${
                  channel?.pinned
                    ? 'bg-(--biu-color-bg-muted) font-medium text-(--biu-color-text)'
                    : 'bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)'
                }`}
                onClick={onToggleChannelPinned}
              >
                <BookmarkIcon className="size-3" />
                <span>{channel?.pinned ? '已置顶' : '置顶'}</span>
              </button>
              <button
                type="button"
                data-testid="channel-floating-pref-mute"
                title={channel?.muted ? '取消免打扰' : '开启免打扰'}
                className={`inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border-0 px-1.5 text-[11px] transition-colors ${
                  channel?.muted
                    ? 'bg-(--biu-color-bg-muted) font-medium text-(--biu-color-text)'
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
              title="完整成员与群设置"
              className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 text-[11px] text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-popover-hover) hover:text-(--biu-color-text)"
              onClick={onOpenManageMembers}
            >
              <Cog6ToothIcon className="size-3" />
              <span>管理</span>
            </button>
          </div>
        </div>
      ) : (
        /* 收起态：贴右边缘的极简悬浮竖向头像轨（零遮挡，一眼看清在线人与 Agent） */
        <button
          type="button"
          data-testid="channel-floating-rail"
          title="悬停或点击展开成员与快捷入口"
          aria-label="展开成员与快捷入口"
          onClick={() => setHovered(true)}
          className="pointer-events-auto flex cursor-pointer flex-col items-center gap-1.5 rounded-full border border-(--biu-color-border-popover) bg-(--biu-color-bg-popover)/90 px-1.5 py-2 shadow-(--biu-shadow-popover) backdrop-blur-sm transition-colors hover:bg-(--biu-color-bg-popover)"
        >
          {railItems.visible.map((m) =>
            m.memberType === 'agent' ? (
              <span key={`rail:agent:${m.memberId}`} className="relative inline-flex" title={`${m.name}（Agent）`}>
                <SidebarMascot
                  size={22}
                  sessionId={m.memberId}
                  identity={resolveSessionMascot(m.memberId, m.mascot)}
                  busy={busyAgentIds.has(m.memberId)}
                  animate={false}
                  title=""
                />
              </span>
            ) : (
              <span key={`rail:account:${m.memberId}`} className="relative inline-flex" title={m.name}>
                <RosterAvatar
                  avatar={resolveAvatar(m.memberId, m.avatar)}
                  seed={m.memberId}
                  size={22}
                />
                {isOnline(m.memberId) ? (
                  <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-emerald-500 ring-[1.5px] ring-(--biu-color-bg-popover)" />
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
