import type { SessionEvent } from '@biu/type-session'

export type TokenUsageSum = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadTokens?: number
}

export type DispatchedTaskStatus = 'pending' | 'running' | 'complete' | 'ended'

export type DispatchedTask = {
  sessionId: string
  tool: 'task_deliver'
  liveTurn: number
  wakeTs: number
  status: DispatchedTaskStatus
  reason?: string
  workerTurn?: number
  usage?: TokenUsageSum
  /** 派工任务标题/文本摘要 */
  preview?: string
}

export type LiveTurnDispatch = {
  tasks: DispatchedTask[]
  usage: TokenUsageSum
}

function emptyUsage(): TokenUsageSum {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
}

function addUsage(
  target: TokenUsageSum,
  usage: { inputTokens: number; outputTokens: number; totalTokens?: number; cacheReadTokens?: number },
) {
  target.inputTokens += usage.inputTokens
  target.outputTokens += usage.outputTokens
  target.totalTokens += usage.totalTokens ?? usage.inputTokens + usage.outputTokens
  if (usage.cacheReadTokens) {
    target.cacheReadTokens = (target.cacheReadTokens ?? 0) + usage.cacheReadTokens
  }
}

function usageOrUndefined(usage?: TokenUsageSum): TokenUsageSum | undefined {
  if (!usage) return undefined
  if (usage.inputTokens === 0 && usage.outputTokens === 0 && !usage.cacheReadTokens) return undefined
  return { ...usage }
}

/** 任务 reports 里已经固化的用量：同名 session+turn 取最后一次，再累加。 */
export function usageFromTaskReports(
  reports?: Array<{
    sessionId?: string
    turn?: number | null
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; cacheReadTokens?: number }
  }>,
): TokenUsageSum | undefined {
  if (!reports?.length) return undefined
  const byKey = new Map<string, TokenUsageSum>()
  for (const report of reports) {
    if (!report.usage) continue
    const inputTokens = Number(report.usage.inputTokens) || 0
    const outputTokens = Number(report.usage.outputTokens) || 0
    const cacheReadTokens = Number(report.usage.cacheReadTokens) || 0
    const totalTokens = Number(report.usage.totalTokens) || inputTokens + outputTokens
    if (!inputTokens && !outputTokens && !cacheReadTokens) continue
    byKey.set(`${report.sessionId ?? ''}:${report.turn ?? ''}`, {
      inputTokens,
      outputTokens,
      totalTokens,
      ...(cacheReadTokens ? { cacheReadTokens } : {}),
    })
  }
  if (!byKey.size) return undefined
  const sum = emptyUsage()
  for (const usage of byKey.values()) addUsage(sum, usage)
  return usageOrUndefined(sum)
}

/** Live 本回合派工对应的任务最小视图（由 core-chat 从 task 体系取数传入）。 */
export type TaskDispatchSource = {
  /** 任务 id */
  id: string
  /** 任务标题（派工表主文案） */
  title: string
  /** 执行 agent 的 sessionId（assignee.kind==='agent'） */
  sessionId: string
  /** 任务创建时间戳（= 派工点） */
  createdAt: number
  /** 任务状态：todo→pending / doing→running / done→complete */
  status: 'todo' | 'doing' | 'done'
  /** 任务 reports 里已经累加好的用量，不再回扫 worker 日志。 */
  usage?: TokenUsageSum
  workerTurn?: number
}

type LiveDispatchPoint = {
  ts: number
  targetId: string
  liveTurn: number
  preview?: string
  status: DispatchedTaskStatus
  usage?: TokenUsageSum
  workerTurn?: number
}

/** 把本 live 派发的任务（task_deliver）映射为派工点，并按 createdAt 定位到 Live 日志里的 turn。 */
export function buildLiveDispatchPoints(
  liveEvents: SessionEvent[],
  tasks: TaskDispatchSource[],
): LiveDispatchPoint[] {
  if (!tasks.length) return []
  // 建 turn 时间区间（turn/start .. turn/end）
  const turns: Array<{ turn: number; start: number; end: number }> = []
  let current: { turn: number; start: number; end: number } | null = null
  for (const event of liveEvents) {
    if (event.type === 'turn/start') {
      current = { turn: event.turn, start: event.ts, end: event.ts }
      continue
    }
    if (event.type === 'turn/end') {
      if (current) current.end = event.ts
      if (current) turns.push(current)
      current = null
      continue
    }
  }
  const findTurn = (ts: number): number | null => {
    // 精确区间内优先；否则取相邻最近 turn
    let best: { turn: number; dist: number } | null = null
    for (const t of turns) {
      if (ts >= t.start && ts <= t.end) return t.turn
      const dist = ts < t.start ? t.start - ts : ts - t.end
      if (best == null || dist < best.dist) best = { turn: t.turn, dist }
    }
    return best?.turn ?? null
  }
  return tasks
    .map((task) => {
      const liveTurn = findTurn(task.createdAt) ?? 0
      const status: DispatchedTaskStatus =
        task.status === 'done' ? 'complete' : task.status === 'doing' ? 'running' : 'pending'
      return {
        ts: task.createdAt,
        targetId: task.sessionId,
        liveTurn,
        preview: task.title,
        status,
        ...(task.usage ? { usage: task.usage } : {}),
        ...(task.workerTurn != null ? { workerTurn: task.workerTurn } : {}),
      }
    })
    .filter((point) => point.targetId)
}

/**
 * Live 派工子任务：每个 task_deliver 一条。
 * 用量和状态只读任务表已经累加好的字段，不回扫 worker events。
 */
export function collectLiveDispatchedTasks(
  _liveId: string,
  liveEvents: SessionEvent[],
  _workers: Array<{ id: string; events: SessionEvent[] }> = [],
  tasks: TaskDispatchSource[] = [],
): {
  tasks: DispatchedTask[]
  byLiveTurn: Record<string, LiveTurnDispatch>
  total: TokenUsageSum
} {
  const dispatched: DispatchedTask[] = buildLiveDispatchPoints(liveEvents, tasks).map((wake) => ({
    sessionId: wake.targetId,
    tool: 'task_deliver' as const,
    liveTurn: wake.liveTurn,
    wakeTs: wake.ts,
    status: wake.status,
    ...(wake.workerTurn != null ? { workerTurn: wake.workerTurn } : {}),
    ...(usageOrUndefined(wake.usage) ? { usage: usageOrUndefined(wake.usage) } : {}),
    ...(wake.preview ? { preview: wake.preview } : {}),
  }))

  const byLiveTurn: Record<string, LiveTurnDispatch> = {}
  const total = emptyUsage()
  for (const task of dispatched) {
    const key = String(task.liveTurn)
    const bucket = byLiveTurn[key] ?? { tasks: [], usage: emptyUsage() }
    bucket.tasks.push(task)
    if (task.usage) addUsage(bucket.usage, task.usage)
    byLiveTurn[key] = bucket
    if (task.usage) addUsage(total, task.usage)
  }

  return { tasks: dispatched, byLiveTurn, total }
}

/** 兼容旧调用：只取 usage 合计。 */
export function collectLiveDispatchedUsage(
  liveId: string,
  liveEvents: SessionEvent[],
  workers: Array<{ id: string; events: SessionEvent[] }> = [],
  tasks: TaskDispatchSource[] = [],
): { byLiveTurn: Record<string, TokenUsageSum>; total: TokenUsageSum } {
  const collected = collectLiveDispatchedTasks(liveId, liveEvents, workers, tasks)
  const byLiveTurn: Record<string, TokenUsageSum> = {}
  for (const [key, value] of Object.entries(collected.byLiveTurn)) {
    byLiveTurn[key] = value.usage
  }
  return { byLiveTurn, total: collected.total }
}
