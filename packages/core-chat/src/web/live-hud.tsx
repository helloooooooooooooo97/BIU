import { memo, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  CircleStackIcon,
  ClockIcon,
  HashtagIcon,
  Square3Stack3DIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/16/solid'
import type { SlotProps } from '@biu/web-slots'
import { bindSessionView } from '@biu/web-session-view'
import { UsageInline } from './usage-inline.tsx'
import { MarkdownBody } from './markdown.tsx'
import { splitReplyForDisplay } from './reply-display.ts'
import {
  extractLiveHud,
  formatDuration,
  getHudReplyId,
  listReplyNodes,
  liveStreamingReply,
  setHudReplyId,
  subscribeHudReplyId,
  turnBarHasMeta,
  turnBarStats,
  type TurnBarStats,
} from './live-hud.ts'

function MetaItem({
  icon,
  value,
  title,
  stat,
}: {
  icon: ReactNode
  value: ReactNode
  title: string
  stat?: string
}) {
  return (
    <span className="chat-reply-meta-item" title={title} data-stat={stat}>
      <span className="chat-reply-meta-icon" aria-hidden>
        {icon}
      </span>
      <span className="chat-reply-meta-value">{value}</span>
    </span>
  )
}

export function TurnStatsMeta({
  stats,
  toolTestId,
}: {
  stats: TurnBarStats
  toolTestId?: string
}) {
  if (!turnBarHasMeta(stats)) return null
  return (
    <div className="chat-reply-meta">
      {stats.turn != null ? (
        <MetaItem icon={<HashtagIcon className="size-3" />} value={stats.turn} title={`第 ${stats.turn} 轮`} stat="turn" />
      ) : null}
      {stats.stepCount != null ? (
        <MetaItem
          icon={<Square3Stack3DIcon className="size-3" />}
          value={stats.stepCount}
          title={`本回合 ${stats.stepCount} 个 step`}
          stat="step"
        />
      ) : null}
      <MetaItem
        icon={<WrenchScrewdriverIcon className="size-3" />}
        value={<span data-testid={toolTestId}>{stats.toolCount}</span>}
        title={`本回合 ${stats.toolCount} 次工具调用`}
        stat="tools"
      />
      {stats.durationMs != null ? (
        <MetaItem
          icon={<ClockIcon className="size-3" />}
          value={formatDuration(stats.durationMs)}
          title="本回合耗时"
          stat="duration"
        />
      ) : null}
      {stats.usage ? (
        <MetaItem icon={<CircleStackIcon className="size-3" />} value={<UsageInline usage={stats.usage} />} title="Token 用量" stat="usage" />
      ) : null}
    </div>
  )
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

export function ChatLiveMetrics(props: { useSessionView: ReturnType<typeof bindSessionView> }) {
  const nodes = props.useSessionView((state) => state.nodes)
  const live = liveStreamingReply(nodes)
  const now = useNow(Boolean(live))
  if (!live) return null
  const stats = turnBarStats(live, now)
  if (!turnBarHasMeta(stats)) return null
  return (
    <div className="chat-dock-toolbar-mid" data-testid="chat-live-hud" aria-live="polite">
      <div className="chat-live-hud-metrics">
        <div className="chat-live-hud-metrics-body">
          <TurnStatsMeta stats={stats} toolTestId="chat-live-hud-tool" />
        </div>
      </div>
    </div>
  )
}

export const ChatLiveHud = memo(function ChatLiveHud(props: SlotProps) {
  const useSessionView = props.useSessionView as ReturnType<typeof bindSessionView>
  const nodes = useSessionView((state) => state.nodes)
  const agentStep = useSessionView((state) => state.agentStep)
  const replyId = useSyncExternalStore(subscribeHudReplyId, getHudReplyId, () => null)
  const hud = extractLiveHud(nodes, agentStep, replyId)
  const replies = listReplyNodes(nodes)
  const selected =
    (hud.replyId ? replies.find((row) => row.id === hud.replyId) : undefined) ?? replies.at(-1)

  useEffect(() => {
    const list = listReplyNodes(nodes)
    if (replyId && list.some((row) => row.id === replyId)) return
    if (!list.length) return
    setHudReplyId(null)
  }, [nodes, replyId])

  if (!selected) return null
  const { finalParts } = splitReplyForDisplay(selected)
  const text = finalParts
    .filter((part) => part.kind === 'assistant')
    .map((part) => part.text)
    .join('\n\n')
    .trim()
  if (!text) return null

  return (
    <div className="chat-live-hud" data-testid="chat-live-hud-flash-wrap" aria-live="polite">
      <div className="chat-live-hud-flash is-output" data-testid="chat-live-hud-flash">
        <MarkdownBody text={text} streaming={Boolean(selected.streaming)} />
      </div>
    </div>
  )
})
