import { memo, useEffect, useMemo } from 'react'
import {
  CheckCircleIcon,
  ShieldCheckIcon,
  StopCircleIcon,
  WrenchScrewdriverIcon,
  XCircleIcon,
} from '@heroicons/react/16/solid'
import { SidebarMascot, resolveSessionMascot } from '@biu/public-mascot'
import {
  cancelChannelRun,
  decideChannelApproval,
  loadChannelRun,
  useChannelStore,
} from './channel-store.ts'

const ROLE_BADGE: Record<'owner' | 'invoker' | 'member', string> = {
  owner: '归属人 · 完整视角',
  invoker: '触发者 · 脱敏视角',
  member: '群成员 · 摘要视角',
}

export const ChannelRunInspector = memo(function ChannelRunInspector() {
  const inspected = useChannelStore((s) => s.inspected)
  const run = useChannelStore((s) => (s.inspected ? s.runs[s.inspected.runId] : undefined))

  useEffect(() => {
    if (!inspected) return
    void loadChannelRun(inspected.channelId, inspected.runId)
  }, [inspected?.channelId, inspected?.runId])

  const mergedStream = useMemo(() => {
    if (!run) return { thinking: '', text: '' }
    let thinking = ''
    let text = ''
    for (const ev of run.events) {
      if (ev.kind === 'thinking' && ev.text) thinking += ev.text
      else if (ev.kind === 'delta' && ev.text) text += ev.text
    }
    return { thinking, text }
  }, [run])

  if (!inspected) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[13px] text-(--biu-color-text-subtle)" data-testid="channel-run-inspector-empty">
        点击群聊中任意一条 Agent 消息的「查看执行详情」或忙碌状态条，即可在此查看该次回复的实时吐字与工具轨迹。
      </div>
    )
  }

  if (!run) {
    return (
      <div className="p-4 text-[13px] text-(--biu-color-text-subtle)" data-testid="channel-run-inspector-loading">
        正在加载执行详情…
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 text-[13px]" data-testid="channel-run-inspector">
      <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-(--biu-color-border-subtle) bg-(--biu-color-bg-subtle) p-2.5">
        <SidebarMascot
          size={28}
          sessionId={run.agentId}
          identity={resolveSessionMascot(run.agentId, run.agentMascot)}
          busy={run.status === 'running' || run.status === 'queued'}
          animate={false}
          title=""
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{run.agentName}</span>
            <span className="rounded bg-(--biu-color-bg-muted) px-1.5 py-0.5 text-[10px] text-(--biu-color-text-muted)">
              {ROLE_BADGE[run.viewerRole]}
            </span>
          </div>
          <div className="text-[11.5px] text-(--biu-color-text-subtle)">
            由 {run.invokerName} 触发 · 归属 {run.agentOwnerName} · 状态：{run.status}
          </div>
        </div>
        {run.canCancel ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-red-500/40 px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10"
            onClick={() => void cancelChannelRun(run.channelId, run.id)}
          >
            <StopCircleIcon className="size-3.5" />
            中止
          </button>
        ) : null}
      </div>

      {mergedStream.thinking ? (
        <div className="mb-3 rounded-lg border border-(--biu-color-border-subtle) bg-(--biu-color-bg-subtle) p-2.5">
          <div className="mb-1 text-[11px] font-semibold text-(--biu-color-text-subtle)">思考过程</div>
          <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-(--biu-color-text-muted)">
            {mergedStream.thinking}
          </pre>
        </div>
      ) : null}

      {mergedStream.text ? (
        <div className="mb-3 rounded-lg border border-(--biu-color-border-subtle) bg-(--biu-color-bg-subtle) p-2.5">
          <div className="mb-1 text-[11px] font-semibold text-(--biu-color-text-subtle)">实时输出</div>
          <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-(--biu-color-text)">
            {mergedStream.text}
          </pre>
        </div>
      ) : null}

      <div className="space-y-2">
        {run.events
          .filter((ev) => ev.kind !== 'delta' && ev.kind !== 'thinking')
          .map((ev, idx) => (
            <div
              key={`${ev.ts}-${idx}`}
              className="rounded-lg border border-(--biu-color-border-subtle) bg-(--biu-color-bg-subtle) p-2 text-[12px]"
            >
              {ev.kind === 'tool_call' ? (
                <div>
                  <div className="flex items-center gap-1.5 font-medium">
                    <WrenchScrewdriverIcon className="size-3.5 opacity-75" />
                    <span className="font-mono">{ev.toolName}</span>
                  </div>
                  {ev.args ? (
                    <pre className="mt-1 max-h-36 overflow-auto rounded bg-(--biu-color-bg) p-1.5 font-mono text-[11px] text-(--biu-color-text-muted)">
                      {JSON.stringify(ev.args, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : ev.kind === 'tool_result' ? (
                <div>
                  <div className="flex items-center gap-1.5 font-medium">
                    {ev.ok ? (
                      <CheckCircleIcon className="size-3.5 text-emerald-500" />
                    ) : (
                      <XCircleIcon className="size-3.5 text-red-400" />
                    )}
                    <span className="font-mono">{ev.toolName}</span>
                  </div>
                  {ev.detail ? (
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-(--biu-color-bg) p-1.5 font-mono text-[11px] text-(--biu-color-text-muted)">
                      {ev.detail}
                    </pre>
                  ) : null}
                </div>
              ) : ev.kind === 'approval' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldCheckIcon className="size-4 text-amber-400" />
                  <span>{ev.text}</span>
                  {run.viewerRole === 'owner' && ev.approvalId && run.status === 'waiting_approval' ? (
                    <div className="ml-auto flex gap-1.5">
                      <button
                        type="button"
                        className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] text-white"
                        onClick={() => void decideChannelApproval(ev.approvalId!, true)}
                      >
                        批准
                      </button>
                      <button
                        type="button"
                        className="rounded border border-(--biu-color-border) px-2 py-0.5 text-[11px]"
                        onClick={() => void decideChannelApproval(ev.approvalId!, false)}
                      >
                        拒绝
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-(--biu-color-text-muted)">{ev.text || ev.kind}</div>
              )}
            </div>
          ))}
      </div>

      {run.error ? (
        <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-[12px] text-red-400">
          {run.error}
        </div>
      ) : null}
    </div>
  )
})
