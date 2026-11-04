import { useEffect, useState } from 'react'
import {
  formatTokens,
  formatTrajectoryUsage,
  type TrajectoryUsage,
} from '@biu/web-session-view'
import { getChatConfig } from './chat-config.ts'
const CACHE_TRACK = 'var(--biu-color-usage-cache)'
const HIST_TRACK = 'var(--biu-color-usage-hist)'
const CTX_TRACK = 'var(--biu-color-usage-ctx)'
const RING_R = 4.5
const RING_C = 2 * Math.PI * RING_R

function UsageRing({
  fill,
  track,
  className,
}: {
  fill: number
  track: string
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, fill))
  return (
    <svg
      className={className ? `traj-usage-ring ${className}` : 'traj-usage-ring'}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden
    >
      <circle cx="6" cy="6" r={RING_R} fill="none" stroke={track} strokeWidth="2.5" />
      {pct > 0 ? (
        <circle
          cx="6"
          cy="6"
          r={RING_R}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray={`${(pct / 100) * RING_C} ${RING_C}`}
          transform="rotate(-90 6 6)"
        />
      ) : null}
    </svg>
  )
}

function formatTok(n: number) {
  return formatTokens(n)
}

function cacheHitPct(usage: TrajectoryUsage): number | null {
  if (!usage.inputTokens || !usage.cacheReadTokens) return null
  return Math.min(100, Math.round((usage.cacheReadTokens / usage.inputTokens) * 100))
}

/** 历史占比是 0~1 的有限数值才纳入合成背景。 */
function isHistPct(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
}

function contextTokens(value: unknown) {
  return value === '1m' ? 1_000_000 : 200_000
}

/** 当前模型上下文窗口。设置变更后所有用量环一起更新。 */
function useContextLimit() {
  const [limit, setLimit] = useState(200_000)
  useEffect(() => {
    let cancelled = false
    const load = () => {
      void getChatConfig<{ contextWindow?: string }>()
        .then((data) => {
          if (!cancelled && data) setLimit(contextTokens(data.contextWindow))
        })
        .catch(() => {})
    }
    load()
    window.addEventListener('biu:chat-config-changed', load)
    return () => {
      cancelled = true
      window.removeEventListener('biu:chat-config-changed', load)
    }
  }, [])
  return limit
}

/**
 * 分面绿环 = cache hit；分面橙环 = 历史占比；红环 = 本次输入占上下文窗口的比重。
 * 百分比数字放在悬浮 title。histPct 默认取 usage.histPct。
 */
export function UsageInline({
  usage,
  empty = '—',
  histPct,
}: {
  usage?: TrajectoryUsage
  empty?: string
  /** 历史 turn 输入占比（0~1）；缺省取 usage.histPct，显式传入则覆盖。 */
  histPct?: number
}) {
  const contextLimit = useContextLimit()
  if (!usage) return <span className="traj-usage-empty">{empty}</span>
  const pct = cacheHitPct(usage)
  const ctxTokens = usage.contextInputTokens ?? usage.inputTokens
  const ctxPct = contextLimit > 0
    ? Math.round((ctxTokens / contextLimit) * 100)
    : 0
  const hist = isHistPct(histPct !== undefined ? histPct : usage.histPct)
    ? Math.round((histPct !== undefined ? histPct : usage.histPct!) * 100)
    : null
  const cacheFill = pct ?? 0
  const cacheTitle =
    pct != null
      ? `input ${formatTok(usage.inputTokens)} · cache hit ${pct}% (${formatTok(usage.cacheReadTokens!)})`
      : `input ${formatTok(usage.inputTokens)}`

  return (
    <span className="traj-usage" title={formatTrajectoryUsage(usage)}>
      <span className="traj-usage-in-pair">
        <span className="traj-usage-in">{formatTok(usage.inputTokens)}</span>
      </span>
      <span
        title={`本次上下文 ${ctxPct}%（${formatTok(ctxTokens)} / ${formatTok(contextLimit)}）`}
        aria-label={`本次上下文 ${ctxPct}%`}
      >
        <UsageRing className="is-ctx" fill={ctxPct} track={CTX_TRACK} />
      </span>
      {hist != null ? (
        <span title={`历史占比 ${hist}%`} aria-label={`历史占比 ${hist}%`}>
          <UsageRing className="is-hist" fill={hist} track={HIST_TRACK} />
        </span>
      ) : null}
      <span title={cacheTitle}>
        <UsageRing className="is-cache" fill={cacheFill} track={CACHE_TRACK} />
      </span>
      <span className="traj-usage-arrow" aria-hidden>
        →
      </span>
      <span className="traj-usage-out" title={`output ${formatTok(usage.outputTokens)}`}>
        {formatTok(usage.outputTokens)}
      </span>
    </span>
  )
}
