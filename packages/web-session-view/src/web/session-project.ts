import { mergeContentEditFiles } from '@biu/type-session'

/** 与 host SessionEvent 对齐的瘦客户端类型（只投影 UI 需要的字段）。 */
export type SessionEvent = {
  seq: number
  ts: number
} & (
  | { type: 'session/open'; version: number }
  | { type: 'turn/start'; turn: number }
  | { type: 'turn/end'; turn: number; reason: string }
  | { type: 'step/start'; turn: number; step: number }
  | { type: 'step/end'; turn: number; step: number }
  | { type: 'system/prompt'; text: string }
  | {
      type: 'user/message'
      text: string
      kind?: string
      sender?: { type: 'user' } | { type: 'session'; sessionId: string }
      images?: Array<{ name: string; mime: string; url: string }>
    }
  | {
      type: 'assistant/message'
      text: string
      tool_calls?: Array<{ id: string; name: string; arguments: string }>
      usage?: {
        inputTokens: number
        outputTokens: number
        totalTokens?: number
        cacheReadTokens?: number
        /** 该次 llm.chat 输入中「历史 turn」占比（0~1）；后端 agent-loop 在 derive 时挂载。 */
        histPct?: number
      }
    }
  | { type: 'assistant/chunk'; text: string; channel?: 'reasoning' }
  | { type: 'tool/call'; id: string; name: string; arguments: string }
  | { type: 'tool/result'; id: string; name: string; ok: boolean; detail: string; partial?: boolean }
  | {
      type: 'content/edits'
      turn: number
      files: Array<{
        path: string
        title: string
        added: number
        removed: number
        jump_line: number
        reverted?: boolean
        kind?: 'content' | 'create' | 'update' | 'delete'
      }>
    }
)

export interface TrajectoryUsage {
  inputTokens: number
  outputTokens: number
  totalTokens?: number
  cacheReadTokens?: number
  /** 该次 LLM 输入中「历史 turn」占比（0~1）；后端 agent-loop 在 derive 时挂载。curPct=1-histPct。 */
  histPct?: number
  /** 回合汇总时：最后一个有输入的 step 的 input，用来判断上下文是否溢出。 */
  contextInputTokens?: number
}

/** 精简 ConversationNode：事件 → 可渲染行。 */
export type ChatToolPart = {
  id: string
  kind: 'tool'
  callId: string
  name: string
  arguments: string
  result?: { ok: boolean; detail: string; streaming?: boolean }
  step?: number
}

export type ChatAssistantPart = {
  id: string
  kind: 'assistant'
  text: string
  streaming?: boolean
  step?: number
}

export type ChatThinkPart = {
  id: string
  kind: 'think'
  text: string
  streaming?: boolean
  step?: number
}

export type ChatReplyPart = ChatAssistantPart | ChatToolPart | ChatThinkPart

/** 单步摘要：横条展示用。 */
export type ChatStepStat = {
  step: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  toolCount: number
  messageChars: number
  /** 该 step 内按 input token 加权的历史占比（0~1）；仅当该 step 有 llm.chat usage 才存在。 */
  histPct?: number
  /** 该 step 耗时（ms）：由 step/start → step/end（或回合结束）的日志 ts 差值估算。 */
  durationMs?: number
}

export type ChatNode =
  | {
      id: string
      kind: 'user'
      text: string
      kindTag?: string
      ts?: number
      images?: Array<{ name: string; mime: string; url: string }>
      /** 缺省 / user = 真人；session = Live 等其它会话派工 */
      sender?: { type: 'user' } | { type: 'session'; sessionId: string }
    }
  | {
      id: string
      kind: 'reply'
      parts: ChatReplyPart[]
      /** 本回合所有助手正文，供一键复制 */
      copyText: string
      /** 本回合最后一条事件 seq（含 turn/end），用于从指定回复精确 fork */
      lastSeq?: number
      turn?: number
      stepCount?: number
      steps?: ChatStepStat[]
      usage?: TrajectoryUsage
      durationMs?: number
      /** turn/start 的事件时间，直播耗时用 now - startTs。 */
      startTs?: number
      streaming?: boolean
      finished?: boolean
      /** turn/end reason，如 complete / cancelled */
      endReason?: string
      contentEdits?: Array<{
        path: string
        title: string
        added: number
        removed: number
        jump_line: number
        reverted?: boolean
        kind?: 'content' | 'create' | 'update' | 'delete'
      }>
    }
  | { id: string; kind: 'turn'; text: string }

/** 与 host deriveMessages 对齐：从事件日志投影模型可见 messages。 */
export interface DerivedMessage {
  role: string
  content?: string | null
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

export function projectNodes(events: SessionEvent[]): ChatNode[] {
  const nodes: ChatNode[] = []
  let turnStartTs: number | undefined
  let stepStartTs: number | undefined
  let currentTurn: number | undefined
  let currentStep: number | undefined
  let reply: {
    id: string
    lastSeq: number
    parts: ChatReplyPart[]
    streamingId: string | null
    streamingThinkId: string | null
    tools: Map<string, ChatToolPart>
    usage: { input: number; output: number; total: number; cache: number; hit: boolean }
    /** 历史占比加权累加器：Σ(histPct × inputTokens) / Σ(inputTokens)。 */
    histSum: number
    histWeight: number
    streaming: boolean
    turn?: number
    steps: Map<number, ChatStepStat>
    /** step → 该 step 历史占比累加器 {sum, weight}。 */
    stepHist: Map<number, { sum: number; weight: number }>
    contentEdits?: Extract<ChatNode, { kind: 'reply' }>['contentEdits']
  } | null = null

  function ensureReply(seq: number) {
    if (!reply) {
      reply = {
        id: `r-${seq}`,
        lastSeq: seq,
        parts: [],
        streamingId: null,
        streamingThinkId: null,
        tools: new Map(),
        usage: { input: 0, output: 0, total: 0, cache: 0, hit: false },
        histSum: 0,
        histWeight: 0,
        // 回合未结束前保持 streaming，Details 不因中间 tool/message 收起
        streaming: currentTurn != null,
        steps: new Map(),
        stepHist: new Map(),
        ...(currentTurn != null ? { turn: currentTurn } : {}),
      }
    } else {
      if (seq > reply.lastSeq) reply.lastSeq = seq
      if (currentTurn != null) reply.streaming = true
    }
    return reply
  }

  function touchReplySeq(seq: number) {
    if (reply && seq > reply.lastSeq) reply.lastSeq = seq
  }

  function ensureStepStat(step: number): ChatStepStat {
    const r = reply!
    const existing = r.steps.get(step)
    if (existing) return existing
    const next: ChatStepStat = {
      step,
      inputTokens: 0,
      outputTokens: 0,
      toolCount: 0,
      messageChars: 0,
    }
    r.steps.set(step, next)
    return next
  }

  /** 估算某 step 的耗时并写回其 ChatStepStat（endTs 未给时用 stepStartTs 兜底为 0）。 */
  function recordStepDuration(step: number, endTs?: number) {
    if (reply && stepStartTs != null && endTs != null) {
      const stat = reply.steps.get(step)
      if (stat && stat.durationMs === undefined) {
        stat.durationMs = Math.max(0, endTs - stepStartTs)
      }
    }
  }

  function addUsage(usage: NonNullable<Extract<SessionEvent, { type: 'assistant/message' }>['usage']>) {
    const r = reply
    if (!r) return
    r.usage.hit = true
    r.usage.input += usage.inputTokens
    r.usage.output += usage.outputTokens
    r.usage.total += usage.totalTokens ?? usage.inputTokens + usage.outputTokens
    r.usage.cache += usage.cacheReadTokens ?? 0
    // 历史占比：按 input token 加权累计，而非覆盖（replay 计入本回合全部 llm.chat usage）
    if (usage.histPct !== undefined && usage.inputTokens > 0) {
      r.histSum += usage.histPct * usage.inputTokens
      r.histWeight += usage.inputTokens
    }
    if (currentStep != null) {
      const stat = ensureStepStat(currentStep)
      stat.inputTokens += usage.inputTokens
      stat.outputTokens += usage.outputTokens
      if (usage.cacheReadTokens) {
        stat.cacheReadTokens = (stat.cacheReadTokens ?? 0) + usage.cacheReadTokens
      }
      // 该 step 自身的历史占比也同样按 token 加权累计
      if (usage.histPct !== undefined && usage.inputTokens > 0) {
        const acc = r.stepHist.get(currentStep) ?? { sum: 0, weight: 0 }
        acc.sum += usage.histPct * usage.inputTokens
        acc.weight += usage.inputTokens
        r.stepHist.set(currentStep, acc)
      }
    }
  }

  function flushReply(endTs?: number, finished = false, reason?: string, endSeq?: number) {
    if (!reply || (reply.parts.length === 0 && !reply.contentEdits?.length)) {
      reply = null
      currentStep = undefined
      stepStartTs = undefined
      return
    }
    const lastSeq = endSeq != null ? Math.max(reply.lastSeq, endSeq) : reply.lastSeq
    // 兜底：当前 step 若恰好没有 step/end（回合就直接结束），用 flush 时间补算耗时
    if (currentStep != null) recordStepDuration(currentStep, endTs)
    const copyText = reply.parts
      .filter((part): part is ChatAssistantPart => part.kind === 'assistant')
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join('\n\n')
    const histPct = reply.histWeight > 0 ? reply.histSum / reply.histWeight : undefined
    const steps = [...reply.steps.values()].sort((a, b) => a.step - b.step)
    let contextInputTokens: number | undefined
    for (let i = steps.length - 1; i >= 0; i -= 1) {
      if (steps[i]!.inputTokens > 0) {
        contextInputTokens = steps[i]!.inputTokens
        break
      }
    }
    const usage: TrajectoryUsage | undefined = reply.usage.hit
      ? {
          inputTokens: reply.usage.input,
          outputTokens: reply.usage.output,
          totalTokens: reply.usage.total,
          ...(reply.usage.cache ? { cacheReadTokens: reply.usage.cache } : {}),
          ...(histPct !== undefined ? { histPct } : {}),
          ...(contextInputTokens != null ? { contextInputTokens } : {}),
        }
      : undefined
    const durationMs =
      finished && turnStartTs != null && endTs != null ? Math.max(0, endTs - turnStartTs) : undefined
    // 每个 step 单独写回其按 token 加权的历史占比，供 step 横条的 histPct 胶囊展示
    for (const stat of steps) {
      const acc = reply.stepHist.get(stat.step)
      if (acc && acc.weight > 0) stat.histPct = acc.sum / acc.weight
    }
    nodes.push({
      id: reply.id,
      kind: 'reply',
      parts: reply.parts,
      copyText,
      lastSeq,
      ...(reply.turn != null ? { turn: reply.turn } : {}),
      ...(steps.length ? { stepCount: steps.length, steps } : {}),
      ...(usage ? { usage } : {}),
      ...(durationMs != null ? { durationMs } : {}),
      ...(turnStartTs != null ? { startTs: turnStartTs } : {}),
      streaming: reply.streaming && !finished,
      finished,
      ...(reason ? { endReason: reason } : {}),
      ...(reply.contentEdits?.length ? { contentEdits: reply.contentEdits } : {}),
    })
    reply = null
    currentStep = undefined
    stepStartTs = undefined
  }

  for (const event of events) {
    if (event.type === 'turn/start') {
      flushReply(undefined, true)
      turnStartTs = event.ts
      currentTurn = event.turn
      currentStep = undefined
      stepStartTs = undefined
    } else if (event.type === 'step/start') {
      currentStep = event.step
      stepStartTs = event.ts
      ensureReply(event.seq)
      ensureStepStat(event.step)
    } else if (event.type === 'step/end') {
      touchReplySeq(event.seq)
      if (currentStep === event.step) {
        recordStepDuration(event.step, event.ts)
        currentStep = undefined
        stepStartTs = undefined
      }
    } else if (event.type === 'user/message') {
      flushReply(undefined, true)
      nodes.push({
        id: `u-${event.seq}`,
        kind: 'user',
        text: event.text,
        kindTag: event.kind,
        ts: event.ts,
        ...(event.sender ? { sender: event.sender } : {}),
        ...(event.images?.length ? { images: event.images } : {}),
      })
    } else if (event.type === 'assistant/chunk') {
      const r = ensureReply(event.seq)
      if (event.channel === 'reasoning') {
        if (r.streamingThinkId) {
          const idx = r.parts.findIndex((part) => part.id === r.streamingThinkId)
          const current = idx >= 0 ? r.parts[idx] : undefined
          if (current?.kind === 'think') {
            r.parts[idx] = {
              ...current,
              text: current.text + event.text,
              streaming: true,
              ...(currentStep != null ? { step: currentStep } : {}),
            }
          }
        } else {
          r.streamingThinkId = `think-${event.seq}`
          r.parts.push({
            id: r.streamingThinkId,
            kind: 'think',
            text: event.text,
            streaming: true,
            ...(currentStep != null ? { step: currentStep } : {}),
          })
        }
      } else {
        if (r.streamingThinkId) {
          const idx = r.parts.findIndex((part) => part.id === r.streamingThinkId)
          const current = idx >= 0 ? r.parts[idx] : undefined
          if (current?.kind === 'think') r.parts[idx] = { ...current, streaming: false }
          r.streamingThinkId = null
        }
        if (r.streamingId) {
          const idx = r.parts.findIndex((part) => part.id === r.streamingId)
          const current = idx >= 0 ? r.parts[idx] : undefined
          if (current?.kind === 'assistant') {
            r.parts[idx] = {
              ...current,
              text: current.text + event.text,
              streaming: true,
              ...(currentStep != null ? { step: currentStep } : {}),
            }
          }
        } else {
          r.streamingId = `a-${event.seq}`
          r.parts.push({
            id: r.streamingId,
            kind: 'assistant',
            text: event.text,
            streaming: true,
            ...(currentStep != null ? { step: currentStep } : {}),
          })
        }
      }
      r.streaming = true
    } else if (event.type === 'assistant/message') {
      const r = ensureReply(event.seq)
      if (event.usage) addUsage(event.usage)
      if (currentStep != null) {
        ensureStepStat(currentStep).messageChars += event.text?.length ?? 0
      }
      if (r.streamingId) {
        const idx = r.parts.findIndex((part) => part.id === r.streamingId)
        if (idx >= 0 && r.parts[idx]?.kind === 'assistant') {
          r.parts[idx] = {
            id: r.streamingId,
            kind: 'assistant',
            text: event.text,
            streaming: false,
            ...(currentStep != null ? { step: currentStep } : {}),
          }
        }
        r.streamingId = null
        // 不在这里清 reply.streaming：整轮 turn/end 前 Details 保持展开
      } else if (event.text || !event.tool_calls?.length) {
        r.parts.push({
          id: `a-${event.seq}`,
          kind: 'assistant',
          text: event.text,
          ...(currentStep != null ? { step: currentStep } : {}),
        })
      }
      if (r.streamingThinkId) {
        const idx = r.parts.findIndex((part) => part.id === r.streamingThinkId)
        const current = idx >= 0 ? r.parts[idx] : undefined
        if (current?.kind === 'think') r.parts[idx] = { ...current, streaming: false }
        r.streamingThinkId = null
      }
      if (currentTurn != null) r.streaming = true
    } else if (event.type === 'tool/call') {
      const r = ensureReply(event.seq)
      r.streamingId = null
      if (r.streamingThinkId) {
        const idx = r.parts.findIndex((part) => part.id === r.streamingThinkId)
        const current = idx >= 0 ? r.parts[idx] : undefined
        if (current?.kind === 'think') r.parts[idx] = { ...current, streaming: false }
        r.streamingThinkId = null
      }
      if (currentTurn != null) r.streaming = true
      const existing = r.tools.get(event.id)
      if (existing) {
        const next: ChatToolPart = {
          ...existing,
          name: event.name || existing.name,
          arguments: event.arguments || existing.arguments,
          ...(currentStep != null ? { step: existing.step ?? currentStep } : {}),
        }
        r.tools.set(event.id, next)
        const idx = r.parts.findIndex((part) => part.kind === 'tool' && part.callId === event.id)
        if (idx >= 0) r.parts[idx] = next
        else r.parts.push(next)
      } else {
        if (currentStep != null) ensureStepStat(currentStep).toolCount += 1
        const part: ChatToolPart = {
          id: `t-${event.id}`,
          kind: 'tool',
          callId: event.id,
          name: event.name,
          arguments: event.arguments,
          ...(currentStep != null ? { step: currentStep } : {}),
        }
        r.tools.set(event.id, part)
        r.parts.push(part)
      }
    } else if (event.type === 'tool/result') {
      const r = ensureReply(event.seq)
      if (currentTurn != null) r.streaming = true
      const existing =
        r.tools.get(event.id) ??
        r.parts.find((part): part is ChatToolPart => part.kind === 'tool' && part.callId === event.id)
      if (existing) {
        const next = {
          ...existing,
          result: { ok: event.ok, detail: event.detail, ...(event.partial ? { streaming: true } : {}) },
        }
        r.tools.set(event.id, next)
        const idx = r.parts.findIndex((part) => part.kind === 'tool' && part.callId === event.id)
        if (idx >= 0) r.parts[idx] = next
        else r.parts.push(next)
      } else {
        if (currentStep != null) ensureStepStat(currentStep).toolCount += 1
        const part: ChatToolPart = {
          id: `t-${event.id}`,
          kind: 'tool',
          callId: event.id,
          name: event.name,
          arguments: '',
          result: { ok: event.ok, detail: event.detail, ...(event.partial ? { streaming: true } : {}) },
          ...(currentStep != null ? { step: currentStep } : {}),
        }
        r.tools.set(event.id, part)
        r.parts.push(part)
      }
    } else if (event.type === 'content/edits') {
      const r = ensureReply(event.seq)
      r.contentEdits = mergeContentEditFiles(r.contentEdits ?? [], event.files)
    } else if (event.type === 'turn/end') {
      flushReply(event.ts, true, event.reason, event.seq)
      turnStartTs = undefined
      currentTurn = undefined
      currentStep = undefined
      const last = nodes.at(-1)
      if (event.reason && event.reason !== 'complete' && last?.kind !== 'reply') {
        nodes.push({ id: `turn-${event.seq}`, kind: 'turn', text: `回合结束：${event.reason}` })
      }
    }
  }
  // 仍在 open turn 内：未结束，继续 streaming；否则按历史定稿收尾
  flushReply(undefined, currentTurn == null)
  return nodes
}

/** Lean Trajectory 行：官方 ui-trajectory 的瘦投影，不搬虚表/搜索索引。 */
export interface TrajectoryRow {
  id: string
  seq: number
  turn: number | null
  step: number | null
  /** 0=turn 级，1=step 边界，2=step 内事件 */
  depth: 0 | 1 | 2
  type: SessionEvent['type']
  summary: string
  usage?: TrajectoryUsage
  callId?: string
}

/** token 友好缩写：<1k 原样，<1M 用 k(>10k 取整)，≥1M 用 M，例 1500→1.5k、345678→346k。 */
export function formatTokens(n: number): string {
  if (!n) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

export function formatTrajectoryUsage(usage: TrajectoryUsage | undefined): string {
  if (!usage) return ''
  const parts = [`${formatTokens(usage.inputTokens)}→${formatTokens(usage.outputTokens)}`]
  if (usage.cacheReadTokens) parts.push(`c${formatTokens(usage.cacheReadTokens)}`)
  return parts.join(' ')
}

/** 从 Trajectory 行汇总 usage（避免为了合计去订阅整份 events，chunk 流式时少重绘）。 */
export function sumTrajectoryRowUsage(rows: Array<{ usage?: TrajectoryUsage }>): TrajectoryUsage | undefined {
  let input = 0
  let output = 0
  let total = 0
  let cache = 0
  let hit = false
  for (const row of rows) {
    if (!row.usage) continue
    hit = true
    input += row.usage.inputTokens
    output += row.usage.outputTokens
    total += row.usage.totalTokens ?? row.usage.inputTokens + row.usage.outputTokens
    cache += row.usage.cacheReadTokens ?? 0
  }
  if (!hit) return undefined
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: total,
    ...(cache ? { cacheReadTokens: cache } : {}),
  }
}

/** 把 Live 派工到其它 session 的 turn usage 叠到对应 Live turn 的 reply 上。 */
export function mergeDispatchedUsageIntoNodes(
  nodes: ChatNode[],
  byTurn?: Record<string, TrajectoryUsage> | null,
): ChatNode[] {
  if (!byTurn || !Object.keys(byTurn).length) return nodes
  return nodes.map((node) => {
    if (node.kind !== 'reply' || node.turn == null) return node
    const extra = byTurn[String(node.turn)]
    if (!extra) return node
    const base = node.usage
    return {
      ...node,
      usage: {
        inputTokens: (base?.inputTokens ?? 0) + extra.inputTokens,
        outputTokens: (base?.outputTokens ?? 0) + extra.outputTokens,
        totalTokens:
          (base?.totalTokens ?? (base ? base.inputTokens + base.outputTokens : 0)) +
          (extra.totalTokens ?? extra.inputTokens + extra.outputTokens),
        ...(((base?.cacheReadTokens ?? 0) + (extra.cacheReadTokens ?? 0))
          ? {
              cacheReadTokens: (base?.cacheReadTokens ?? 0) + (extra.cacheReadTokens ?? 0),
            }
          : {}),
      },
    }
  })
}

/** 本地合计 + Live 派工合计。 */
export function sumUsageParts(
  local: TrajectoryUsage | undefined,
  dispatched: TrajectoryUsage | undefined,
): TrajectoryUsage | undefined {
  if (!local && !dispatched) return undefined
  if (!local) return dispatched
  if (!dispatched) return local
  const cache = (local.cacheReadTokens ?? 0) + (dispatched.cacheReadTokens ?? 0)
  return {
    inputTokens: local.inputTokens + dispatched.inputTokens,
    outputTokens: local.outputTokens + dispatched.outputTokens,
    totalTokens:
      (local.totalTokens ?? local.inputTokens + local.outputTokens) +
      (dispatched.totalTokens ?? dispatched.inputTokens + dispatched.outputTokens),
    ...(cache ? { cacheReadTokens: cache } : {}),
  }
}

/**
 * 前端事件压缩（对齐 dsh：chunk 仅服务流式投影，不膨胀 UI 账本）。
 * - 连续 `assistant/chunk` 合并为一条
 * - 已被同段 `assistant/message` 覆盖的 chunk 丢弃（message 为权威全文）
 * 不改 host append-only 落盘；仅瘦客户端内存视图。
 */
export function compactSessionEvents(events: SessionEvent[]): SessionEvent[] {
  const coalesced: SessionEvent[] = []
  for (const event of events) {
    if (event.type === 'assistant/chunk') {
      const prev = coalesced.at(-1)
      if (prev?.type === 'assistant/chunk' && (prev.channel === 'reasoning') === (event.channel === 'reasoning')) {
        coalesced[coalesced.length - 1] = {
          ...prev,
          text: prev.text + event.text,
          ts: event.ts,
        }
        continue
      }
    }
    coalesced.push(event)
  }
  const out: SessionEvent[] = []
  for (let i = 0; i < coalesced.length; i++) {
    const event = coalesced[i]!
    const next = coalesced[i + 1]
    if (event.type === 'assistant/chunk' && event.channel !== 'reasoning' && next?.type === 'assistant/message') continue
    out.push(event)
  }
  return out
}

function sameReplyPart(a: ChatReplyPart, b: ChatReplyPart): boolean {
  if (a === b) return true
  if (a.id !== b.id || a.kind !== b.kind || a.step !== b.step) return false
  if (a.kind === 'tool' && b.kind === 'tool') {
    if (a.callId !== b.callId || a.name !== b.name || a.arguments !== b.arguments) return false
    const ar = a.result
    const br = b.result
    if (ar === br) return true
    if (!ar || !br) return false
    return ar.ok === br.ok && ar.detail === br.detail && ar.streaming === br.streaming
  }
  if (a.kind !== 'tool' && b.kind !== 'tool') {
    return a.text === b.text && a.streaming === b.streaming
  }
  return false
}

function sameStepStat(a: ChatStepStat, b: ChatStepStat): boolean {
  return (
    a === b ||
    (a.step === b.step &&
      a.inputTokens === b.inputTokens &&
      a.outputTokens === b.outputTokens &&
      a.cacheReadTokens === b.cacheReadTokens &&
      a.histPct === b.histPct &&
      a.toolCount === b.toolCount &&
      a.messageChars === b.messageChars &&
      a.durationMs === b.durationMs)
  )
}

function sameUsage(a?: TrajectoryUsage, b?: TrajectoryUsage): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.inputTokens === b.inputTokens &&
    a.outputTokens === b.outputTokens &&
    a.totalTokens === b.totalTokens &&
    a.cacheReadTokens === b.cacheReadTokens &&
    a.histPct === b.histPct
  )
}

function sameChatNode(a: ChatNode, b: ChatNode): ChatNode | null {
  if (a === b) return a
  if (a.id !== b.id || a.kind !== b.kind) return null
  if (a.kind === 'turn' && b.kind === 'turn') {
    return a.text === b.text ? a : null
  }
  if (a.kind === 'user' && b.kind === 'user') {
    if (a.text !== b.text || a.kindTag !== b.kindTag || a.ts !== b.ts) return null
    const as = a.sender
    const bs = b.sender
    if (as !== bs) {
      if (!as || !bs || as.type !== bs.type) return null
      if (as.type === 'session' && bs.type === 'session' && as.sessionId !== bs.sessionId) return null
    }
    const ai = a.images
    const bi = b.images
    if ((ai?.length ?? 0) !== (bi?.length ?? 0)) return null
    if (ai && bi) {
      for (let i = 0; i < ai.length; i += 1) {
        if (ai[i]!.url !== bi[i]!.url || ai[i]!.name !== bi[i]!.name || ai[i]!.mime !== bi[i]!.mime) return null
      }
    }
    return a
  }
  if (a.kind === 'reply' && b.kind === 'reply') {
    // 即使当前 reply 有增量更新，也尽量复用未变的子 part 引用，避免已完成 ToolCard 重渲染。
    let allPartsSame = a.parts.length === b.parts.length
    const prevPartsById = new Map<string, ChatReplyPart>()
    for (let i = 0; i < a.parts.length; i += 1) prevPartsById.set(a.parts[i]!.id, a.parts[i]!)
    let reusedAnyPart = false
    const mergedParts: ChatReplyPart[] = new Array(b.parts.length)
    for (let i = 0; i < b.parts.length; i += 1) {
      const nextPart = b.parts[i]!
      const prevPart = prevPartsById.get(nextPart.id)
      if (prevPart && sameReplyPart(prevPart, nextPart)) {
        mergedParts[i] = prevPart
        reusedAnyPart = true
        if (a.parts[i] !== prevPart) allPartsSame = false
      } else {
        mergedParts[i] = nextPart
        allPartsSame = false
      }
    }

    const aSteps = a.steps
    const bSteps = b.steps
    let stepsSame = (aSteps?.length ?? 0) === (bSteps?.length ?? 0)
    if (stepsSame && aSteps && bSteps) {
      for (let i = 0; i < aSteps.length; i += 1) {
        if (!sameStepStat(aSteps[i]!, bSteps[i]!)) {
          stepsSame = false
          break
        }
      }
    }

    const aEdits = a.contentEdits
    const bEdits = b.contentEdits
    let editsSame = (aEdits?.length ?? 0) === (bEdits?.length ?? 0)
    if (editsSame && aEdits && bEdits) {
      for (let i = 0; i < aEdits.length; i += 1) {
        const ae = aEdits[i]!
        const be = bEdits[i]!
        if (
          ae.path !== be.path ||
          ae.title !== be.title ||
          ae.added !== be.added ||
          ae.removed !== be.removed ||
          ae.jump_line !== be.jump_line ||
          ae.reverted !== be.reverted ||
          ae.kind !== be.kind
        ) {
          editsSame = false
          break
        }
      }
    }

    if (
      allPartsSame &&
      stepsSame &&
      editsSame &&
      a.copyText === b.copyText &&
      a.lastSeq === b.lastSeq &&
      a.turn === b.turn &&
      a.stepCount === b.stepCount &&
      a.durationMs === b.durationMs &&
      a.startTs === b.startTs &&
      a.streaming === b.streaming &&
      a.finished === b.finished &&
      a.endReason === b.endReason &&
      sameUsage(a.usage, b.usage)
    ) {
      return a
    }
    if (reusedAnyPart || (stepsSame && aSteps) || (editsSame && aEdits)) {
      return {
        ...b,
        parts: allPartsSame ? a.parts : mergedParts,
        ...(stepsSame && aSteps ? { steps: aSteps } : {}),
        ...(editsSame && aEdits ? { contentEdits: aEdits } : {}),
      }
    }
    return null
  }
  return null
}

/** 结构共享：保留未变化的历史 ChatNode 与已完成 ChatReplyPart 引用，避免事件增量到达时击穿全部 memo。 */
export function reuseStableNodes(prev: ChatNode[], next: ChatNode[]): ChatNode[] {
  if (!prev.length || !next.length) return next
  const prevById = new Map<string, ChatNode>()
  for (let i = 0; i < prev.length; i += 1) prevById.set(prev[i]!.id, prev[i]!)
  let allSame = prev.length === next.length
  const out: ChatNode[] = new Array(next.length)
  for (let i = 0; i < next.length; i += 1) {
    const nextNode = next[i]!
    const prevNode = prevById.get(nextNode.id)
    const reused = prevNode ? sameChatNode(prevNode, nextNode) : null
    const finalNode = reused ?? nextNode
    out[i] = finalNode
    if (prev[i] !== finalNode) allSame = false
  }
  return allSame ? prev : out
}
