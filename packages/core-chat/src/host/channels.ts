import type { Context } from 'cordis'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { allocateRecordId } from '@biu/type-file-system'
import type { LlmClient, LlmConfig, LlmMessage } from '@biu/host-llm'
import {
  CREATE_CHANNELS_SQL,
  currentAccountId,
  currentRequestWorkspaceId,
  dataDir,
  openAndMigrateBiu,
  runWithAccount,
  runWithActorContext,
  runWithRequestWorkspace,
  type ActorRoomContext,
} from '@biu/host-plugin-loader/data-dir'
import { getAccountPort } from '@biu/host-plugin-loader/ports'
import { runWithSession } from '@biu/host-sessions/scope'
import { runWithToolPolicy, type AgentToolMode } from '@biu/host-tools'
import type { SessionMascot } from '@biu/type-session'
import {
  buildDefaultChannelName,
  type ChannelAccessMode,
  type ChannelAgentActivity,
  type ChannelDetailPayload,
  type ChannelKind,
  type ChannelMemberRole,
  type ChannelMemberType,
  type ChannelMemberView,
  type ChannelMention,
  type ChannelMessageMeta,
  type ChannelMessageView,
  type ChannelRunDetail,
  type ChannelRunEvent,
  type ChannelRunStatus,
  type ChannelSummary,
} from '../shared/channel-types.ts'

export const MAX_CHANNEL_HANDOFF_HOPS = 3
const MAX_CHANNEL_TOOL_STEPS = 8
const MAX_CHANNEL_HISTORY_MESSAGES = 30
const MAX_CHANNEL_QUEUE_PER_AGENT = 12
const MAX_TOOL_DETAIL_CHARS = 8_000

type ChannelRow = {
  id: string
  workspace_id: string
  kind?: string
  dm_key?: string
  name: string
  topic: string
  access_mode: string
  created_by: string
  created_at: number
  updated_at: number
}

type MemberRow = {
  channel_id: string
  member_type: string
  member_id: string
  role: string
  added_by: string
  added_at: number
}

type MessageRow = {
  id: string
  channel_id: string
  seq: number
  sender_type: string
  sender_id: string
  reply_to_id: string
  text: string
  mentions_json: string
  trace_id: string
  ephemeral_to: string
  meta_json: string
  created_at: number
}

type RunRow = {
  id: string
  channel_id: string
  agent_id: string
  agent_owner_id: string
  invoker_id: string
  origin_message_id: string
  reply_message_id: string
  status: string
  events_json: string
  error: string
  created_at: number
  finished_at: number
}

type QueuedJob = {
  runId: string
  channelId: string
  workspaceId: string
  agentId: string
  agentOwnerId: string
  invokerId: string
  originMessageId: string
  hopCount: number
  visitedAgents: Set<string>
  messages: Array<{ id: string; senderName: string; text: string }>
  abort: AbortController
}

type AgentQueueState = {
  active: QueuedJob | null
  queue: QueuedJob[]
  status: ChannelRunStatus
  stepLabel: string
  events: ChannelRunEvent[]
}

export type ChannelLlmResolver = (agentId: string, ownerAccountId: string, invokerAccountId: string) => LlmClient

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function truncateText(text: string, limit = MAX_TOOL_DETAIL_CHARS) {
  if (text.length <= limit) return text
  const half = Math.floor(limit / 2)
  return `${text.slice(0, half)}\n…（已截断 ${text.length - limit} 字符）…\n${text.slice(-half)}`
}

function stringifyVal(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** 从消息文本与显式 mentions 中解析本次触发的 Agent ID 列表（严格 Slack 模式：仅显式 @ 才触发）。 */
export function resolveMentionedAgents(
  text: string,
  explicitMentions: ChannelMention[],
  channelAgents: Array<{ id: string; name: string }>,
): { agentIds: string[]; mentions: ChannelMention[] } {
  const agentById = new Map(channelAgents.map((a) => [a.id, a]))
  const picked = new Map<string, ChannelMention>()
  const normalizedMentions: ChannelMention[] = []
  let broadcastAll = false

  for (const m of explicitMentions) {
    if (!m || typeof m !== 'object') continue
    if (m.kind === 'everyone') {
      broadcastAll = true
      normalizedMentions.push({ kind: 'everyone', id: 'everyone', label: m.label || '所有人' })
    } else if (m.kind === 'agent' && agentById.has(m.id)) {
      const target = agentById.get(m.id)!
      const item: ChannelMention = { kind: 'agent', id: target.id, label: target.name }
      picked.set(target.id, item)
      normalizedMentions.push(item)
    } else if (m.kind === 'account' && m.id) {
      normalizedMentions.push({ kind: 'account', id: m.id, label: m.label || m.id })
    }
  }

  // 解析文本中的 @everyone / @所有人
  if (/(?:^|\s)@(?:everyone|all|所有人)(?=$|\s|[，。！？,.!?:：])/i.test(text)) {
    if (!broadcastAll) {
      broadcastAll = true
      normalizedMentions.push({ kind: 'everyone', id: 'everyone', label: '所有人' })
    }
  }

  // 解析文本中的 @AgentName（按名称长度降序匹配，避免前缀碰撞）
  const sortedAgents = [...channelAgents].sort((a, b) => b.name.length - a.name.length)
  for (const agent of sortedAgents) {
    const clean = agent.name.trim()
    if (!clean) continue
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(?:^|\\s)@${escaped}(?=$|\\s|[，。！？,.!?:：])`, 'i')
    if (re.test(text) && !picked.has(agent.id)) {
      const item: ChannelMention = { kind: 'agent', id: agent.id, label: clean }
      picked.set(agent.id, item)
      normalizedMentions.push(item)
    }
  }

  if (broadcastAll) {
    return {
      agentIds: channelAgents.map((a) => a.id),
      mentions: normalizedMentions,
    }
  }
  return {
    agentIds: [...picked.keys()],
    mentions: normalizedMentions,
  }
}

/** 按观看者身份分层脱敏单条群消息的执行轨迹（Owner 全量 / Invoker 脱敏 / 普通成员仅摘要）。 */
export function redactChannelRunEvents(
  events: ChannelRunEvent[],
  viewerRole: 'owner' | 'invoker' | 'member',
): ChannelRunEvent[] {
  if (viewerRole === 'owner') return events
  if (viewerRole === 'invoker') {
    const out: ChannelRunEvent[] = []
    for (const ev of events) {
      if (ev.kind === 'approval') {
        out.push({ ts: ev.ts, kind: 'status', text: '正在等待 Agent 归属人审批敏感操作…' })
      } else if (ev.kind === 'tool_call') {
        out.push({ ts: ev.ts, kind: 'tool_call', step: ev.step, callId: ev.callId, toolName: ev.toolName })
      } else if (ev.kind === 'tool_result') {
        out.push({
          ts: ev.ts,
          kind: 'tool_result',
          step: ev.step,
          callId: ev.callId,
          toolName: ev.toolName,
          ok: ev.ok,
          detail: ev.ok ? '已完成' : '执行未通过或权限受限',
        })
      } else if (ev.kind !== 'thinking') {
        out.push(ev)
      }
    }
    return out
  }
  // 普通吃瓜群成员：只看极简阶段摘要，不暴露工具入参、报错路径与中间思考
  const summary: ChannelRunEvent[] = []
  for (const ev of events) {
    if (ev.kind === 'tool_call' && ev.toolName) {
      summary.push({
        ts: ev.ts,
        kind: 'status',
        step: ev.step,
        text: `使用了工具 ${ev.toolName}`,
      })
    } else if (ev.kind === 'done' || ev.kind === 'cancelled') {
      summary.push({ ts: ev.ts, kind: ev.kind, text: ev.kind === 'done' ? '已生成回复' : '已中止' })
    } else if (ev.kind === 'error') {
      summary.push({ ts: ev.ts, kind: 'error', text: '执行失败' })
    }
  }
  return summary
}

type ApprovalsLike = {
  onNotify?: (fn: (payload: { id: string; name: string; args: Record<string, unknown>; accountId?: string; workspaceId?: string; channelId?: string; runId?: string; agentId?: string; invokerId?: string }) => void) => () => void
  onDecide?: (fn: (payload: { id: string; allow: boolean; channelId?: string; runId?: string; accountId: string }) => void) => () => void
}

export class ChannelService {
  private dbOverride: DatabaseSync | null
  private queues = new Map<string, AgentQueueState>()
  private runLookup = new Map<string, QueuedJob>()
  private autoNamedAttempted = new Set<string>()
  private disposeCallbacks: Array<() => void> = []

  constructor(
    private ctx: Context,
    private resolveLlmClient: ChannelLlmResolver,
    opts?: { db?: DatabaseSync },
  ) {
    this.dbOverride = opts?.db ?? null
    this.wireApprovals()
    this.wireDatabaseChanges()
  }

  dispose() {
    for (const fn of this.disposeCallbacks) {
      try {
        fn()
      } catch {
        /* ignore */
      }
    }
    this.disposeCallbacks = []
    for (const state of this.queues.values()) {
      state.active?.abort.abort()
      for (const job of state.queue) job.abort.abort()
    }
    this.queues.clear()
    this.runLookup.clear()
  }

  private wireApprovals() {
    const approvals = this.ctx.get('approvals') as ApprovalsLike | undefined
    if (!approvals?.onNotify) return
    const offNotify = approvals.onNotify((payload) => {
      if (!payload.channelId || !payload.runId) return
      const job = this.runLookup.get(payload.runId)
      if (!job) return
      const state = this.queues.get(this.queueKey(job.channelId, job.agentId))
      const ownerName = this.accountLabel(job.agentOwnerId)
      const invokerName = this.accountLabel(job.invokerId)
      if (state) {
        state.status = 'waiting_approval'
        state.stepLabel = `等待 ${ownerName} 审批 ${payload.name}`
        this.pushRunEvent(job, state, {
          ts: Date.now(),
          kind: 'approval',
          toolName: payload.name,
          args: payload.args,
          approvalId: payload.id,
          text: `等待 ${ownerName} 审批工具 ${payload.name}`,
        })
      }
      this.updateRunRow(job.runId, { status: 'waiting_approval' })
      // 在群里仅对 Agent Owner 弹出 Ephemeral 审批卡
      const targetOwner = payload.accountId || job.agentOwnerId
      this.insertMessage({
        channelId: job.channelId,
        senderType: 'system',
        senderId: job.agentId,
        replyToId: job.originMessageId,
        text: `${invokerName} 在群里触发了敏感工具 \`${payload.name}\`，仅你可以批准或拒绝。`,
        mentions: [],
        traceId: job.runId,
        ephemeralTo: targetOwner,
        meta: {
          kind: 'approval',
          approvalId: payload.id,
          toolName: payload.name,
          args: payload.args,
          status: 'pending',
          runId: job.runId,
          agentId: job.agentId,
          invokerId: job.invokerId,
          invokerName,
        },
      })
      this.broadcastActivities(job.channelId, job.workspaceId)
    })
    this.disposeCallbacks.push(offNotify)

    if (approvals.onDecide) {
      const offDecide = approvals.onDecide((payload) => {
        if (!payload.channelId || !payload.runId) return
        const job = this.runLookup.get(payload.runId)
        if (!job) return
        const state = this.queues.get(this.queueKey(job.channelId, job.agentId))
        if (state && state.active?.runId === job.runId) {
          state.status = 'running'
          state.stepLabel = payload.allow ? '审批已通过，继续执行…' : '审批已拒绝，正在回复…'
        }
        this.updateRunRow(job.runId, { status: 'running' })
        this.updateApprovalMessageStatus(job.channelId, payload.id, payload.allow ? 'allowed' : 'denied', payload.accountId)
        this.broadcastActivities(job.channelId, job.workspaceId)
      })
      this.disposeCallbacks.push(offDecide)
    }
  }

  private wireDatabaseChanges() {
    const on = (this.ctx as unknown as { on?: (event: string, fn: () => void) => () => void }).on
    if (typeof on !== 'function') return
    const off = on.call(this.ctx, 'database/change', () => {
      try {
        this.pruneDeletedAgents()
      } catch {
        /* ignore */
      }
    })
    if (typeof off === 'function') this.disposeCallbacks.push(off)
  }

  private isAgentDeleted(agentId: string): boolean {
    const cleanId = String(agentId ?? '').trim()
    if (!cleanId) return true
    try {
      const row = this.db()
        .prepare(`SELECT deleted_at FROM record_meta WHERE collection = '/agents' AND record_id = ? LIMIT 1`)
        .get(cleanId) as { deleted_at?: number | null } | undefined
      if (row && row.deleted_at != null) return true
    } catch {
      /* record_meta may not exist in minimal test db */
    }
    if (typeof this.ctx.sessions?.peekSummary === 'function') {
      if (!this.ctx.sessions.peekSummary(cleanId)) return true
    }
    return false
  }

  /**
   * 清理已删除（移入回收站或彻底删除）的 Agent 群成员：
   * - 保留其在 channel_messages 中的历史消息；
   * - 中止其在该群中正在执行或排队的任务；
   * - 从 channel_members 移除并向群内广播最新成员列表。
   */
  pruneDeletedAgents(channelId?: string): string[] {
    const rows = (channelId
      ? this.db()
          .prepare(`SELECT channel_id, member_id FROM channel_members WHERE channel_id = ? AND member_type = 'agent'`)
          .all(channelId)
      : this.db()
          .prepare(`SELECT channel_id, member_id FROM channel_members WHERE member_type = 'agent'`)
          .all()) as Array<{ channel_id: string; member_id: string }>
    if (!rows.length) return []

    const removedByChannel = new Map<string, string[]>()
    for (const row of rows) {
      if (!this.isAgentDeleted(row.member_id)) continue
      const list = removedByChannel.get(row.channel_id) ?? []
      list.push(row.member_id)
      removedByChannel.set(row.channel_id, list)
    }
    if (!removedByChannel.size) return []

    const prunedIds: string[] = []
    for (const [chId, agentIds] of removedByChannel.entries()) {
      for (const agentId of agentIds) {
        const key = this.queueKey(chId, agentId)
        const state = this.queues.get(key)
        if (state) {
          state.active?.abort.abort()
          for (const job of state.queue) job.abort.abort()
          this.queues.delete(key)
        }
        this.db()
          .prepare(`DELETE FROM channel_members WHERE channel_id = ? AND member_type = 'agent' AND member_id = ?`)
          .run(chId, agentId)
        prunedIds.push(agentId)
      }
      const chRow = this.db()
        .prepare(`SELECT workspace_id FROM channels WHERE id = ?`)
        .get(chId) as { workspace_id?: string } | undefined
      const workspaceId = chRow?.workspace_id || ''
      const members = this.listMembers(chId, 'local', workspaceId, true)
      this.broadcastToChannel(chId, workspaceId, 'channel/members', { channelId: chId, members })
    }
    return prunedIds
  }

  private schemaReady = new WeakSet<DatabaseSync>()

  private db(): DatabaseSync {
    const conn = this.dbOverride ?? openAndMigrateBiu(join(dataDir(), 'biu.sqlite'))
    if (!this.schemaReady.has(conn)) {
      conn.exec(CREATE_CHANNELS_SQL)
      this.schemaReady.add(conn)
    }
    return conn
  }

  private queueKey(channelId: string, agentId: string) {
    return `${channelId}\0${agentId}`
  }

  private currentActorIds() {
    const accountId = currentAccountId().trim()
    const store = getAccountPort(this.ctx)?.store
    const workspaceId =
      currentRequestWorkspaceId().trim() ||
      (accountId ? store?.activeWorkspaceId?.() ?? '' : '') ||
      ''
    return { accountId: accountId || 'local', rawAccountId: accountId, workspaceId }
  }

  private accountStore() {
    return getAccountPort(this.ctx)?.store as
      | {
          activeWorkspaceId?: () => string | null
          tenantForRecord?: (collection: string, id: string) => { accountId: string; workspaceId: string } | null
          workspacePerson?: (accountId: string) => { accountId: string; workspaceId: string; name: string; avatar?: string } | null
          publicMemberProfile?: (workspaceId: string, accountId: string) => { accountId: string; name: string; avatar: string } | null
          members?: (accountId: string, workspaceId: string) => Array<{ id: string; name?: string; email?: string; avatar?: string; role?: string; member_kind?: string }>
          isMember?: (accountId: string, workspaceId: string) => boolean
          authorization?: {
            membership?: (accountId: string, workspaceId: string) => string | null
            membershipKind?: (accountId: string, workspaceId: string) => string
          }
        }
      | undefined
  }

  private accountLabel(accountId: string, workspaceId?: string): string {
    if (!accountId || accountId === 'local') return '本地用户'
    const store = this.accountStore()
    const ws = workspaceId || this.currentActorIds().workspaceId
    if (ws && store?.publicMemberProfile) {
      const pub = store.publicMemberProfile(ws, accountId)
      if (pub?.name?.trim()) return pub.name.trim()
    }
    const person = store?.workspacePerson?.(accountId)
    if (person?.name) return person.name
    try {
      const row = this.db()
        .prepare('SELECT name, email FROM accounts WHERE id = ?')
        .get(accountId) as { name?: string; email?: string } | undefined
      if (row?.name?.trim()) return row.name.trim()
      if (row?.email?.trim()) return row.email.trim()
    } catch {
      /* ignore */
    }
    return accountId.slice(0, 8)
  }

  private accountAvatar(accountId: string, workspaceId?: string): string | undefined {
    if (!accountId || accountId === 'local') return undefined
    const store = this.accountStore()
    const ws = workspaceId || this.currentActorIds().workspaceId
    if (ws && store?.publicMemberProfile) {
      const pub = store.publicMemberProfile(ws, accountId)
      if (pub?.avatar?.trim()) return pub.avatar.trim()
    }
    const person = store?.workspacePerson?.(accountId)
    if (person?.avatar?.trim()) return person.avatar.trim()
    try {
      const row = this.db()
        .prepare('SELECT avatar FROM accounts WHERE id = ?')
        .get(accountId) as { avatar?: string } | undefined
      return row?.avatar?.trim() || undefined
    } catch {
      return undefined
    }
  }

  private agentMeta(agentId: string): { name: string; mascot?: SessionMascot; ownerAccountId: string; systemPrompt: string; model: string } {
    const summary = this.ctx.sessions?.peekSummary?.(agentId)
    const tenant = this.accountStore()?.tenantForRecord?.('/agents', agentId)
    let ownerAccountId = tenant?.accountId ?? ''
    if (!ownerAccountId) {
      try {
        const policy = this.db()
          .prepare(`SELECT owner_account_id FROM resource_policies WHERE collection = '/agents' AND record_id = ? LIMIT 1`)
          .get(agentId) as { owner_account_id?: string } | undefined
        ownerAccountId = policy?.owner_account_id ?? ''
      } catch {
        /* ignore */
      }
    }
    if (!ownerAccountId) ownerAccountId = 'local'
    return {
      name: summary?.title?.trim() || agentId,
      ...(summary?.mascot ? { mascot: summary.mascot } : {}),
      ownerAccountId,
      systemPrompt: summary?.config?.systemPrompt ?? '',
      model: summary?.config?.model ?? '',
    }
  }

  private isWorkspaceAdmin(accountId: string, workspaceId: string): boolean {
    if (!workspaceId || accountId === 'local') return true
    const role = this.accountStore()?.authorization?.membership?.(accountId, workspaceId)
    return role === 'owner' || role === 'admin'
  }

  private isChannelMember(channelId: string, accountId: string): MemberRow | null {
    const row = this.db()
      .prepare(`SELECT * FROM channel_members WHERE channel_id = ? AND member_type = 'account' AND member_id = ?`)
      .get(channelId, accountId) as MemberRow | undefined
    return row ?? null
  }

  private canReadChannel(channel: ChannelRow, accountId: string): boolean {
    if (accountId === 'local' || !channel.workspace_id) return true
    if (channel.access_mode === 'workspace') {
      const store = this.accountStore()
      if (store?.isMember && !store.isMember(accountId, channel.workspace_id)) return false
      return true
    }
    return Boolean(this.isChannelMember(channel.id, accountId))
  }

  private canManageChannel(channel: ChannelRow, accountId: string): boolean {
    if (accountId === 'local' || !channel.workspace_id) return true
    if (channel.created_by === accountId) return true
    const mem = this.isChannelMember(channel.id, accountId)
    if (mem && (mem.role === 'owner' || mem.role === 'admin')) return true
    return this.isWorkspaceAdmin(accountId, channel.workspace_id)
  }

  private toSummary(row: ChannelRow, viewerAccountId = this.currentActorIds().accountId): ChannelSummary {
    const db = this.db()
    const counts = db
      .prepare(
        `SELECT
          SUM(CASE WHEN member_type = 'account' THEN 1 ELSE 0 END) AS humans,
          SUM(CASE WHEN member_type = 'agent' THEN 1 ELSE 0 END) AS agents
         FROM channel_members WHERE channel_id = ?`,
      )
      .get(row.id) as { humans?: number | null; agents?: number | null } | undefined
    const last = db
      .prepare(
        `SELECT text, created_at FROM channel_messages
         WHERE channel_id = ? AND ephemeral_to = ''
         ORDER BY seq DESC LIMIT 1`,
      )
      .get(row.id) as { text?: string; created_at?: number } | undefined
    const kind: ChannelKind = row.kind === 'dm' ? 'dm' : 'channel'
    let peerAccountId: string | undefined
    let peerName: string | undefined
    let peerAvatar: string | undefined
    let displayName = row.name
    if (kind === 'dm') {
      const dmHumans = (
        db
          .prepare(`SELECT member_id FROM channel_members WHERE channel_id = ? AND member_type = 'account'`)
          .all(row.id) as Array<{ member_id: string }>
      ).map((item) => item.member_id)
      peerAccountId = dmHumans.find((id) => id !== viewerAccountId) ?? dmHumans[0]
      if (peerAccountId) {
        peerName = this.accountLabel(peerAccountId, row.workspace_id)
        peerAvatar = this.accountAvatar(peerAccountId, row.workspace_id)
        displayName = peerName
      }
    }
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      kind,
      dmKey: row.dm_key ?? '',
      ...(peerAccountId ? { peerAccountId } : {}),
      ...(peerName ? { peerName } : {}),
      ...(peerAvatar ? { peerAvatar } : {}),
      name: displayName,
      topic: row.topic,
      accessMode: row.access_mode === 'workspace' ? 'workspace' : 'private',
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      memberCount: Number(counts?.humans ?? 0),
      agentCount: Number(counts?.agents ?? 0),
      lastMessageAt: Number(last?.created_at ?? row.updated_at),
      lastMessageText: String(last?.text ?? '').slice(0, 120),
    }
  }

  listChannels(): ChannelSummary[] {
    const { accountId, workspaceId } = this.currentActorIds()
    const rows = this.db()
      .prepare(
        `SELECT * FROM channels
         WHERE workspace_id = ?
         ORDER BY updated_at DESC, created_at DESC`,
      )
      .all(workspaceId) as ChannelRow[]
    return rows.filter((row) => this.canReadChannel(row, accountId)).map((row) => this.toSummary(row, accountId))
  }

  /** 打开或创建与指定空间成员的 1v1 人类私聊窗口（Slack DM 语义：两人之间复用同一条 DM）。 */
  openOrCreateDm(targetAccountId: string): ChannelDetailPayload {
    const { accountId, workspaceId } = this.currentActorIds()
    const target = String(targetAccountId ?? '').trim()
    if (!target) throw new Error('目标成员 ID 不能为空')
    if (workspaceId && accountId !== 'local') {
      const store = this.accountStore()
      if (store?.isMember && !store.isMember(target, workspaceId)) {
        throw new Error('permission denied: 该用户不是当前空间成员')
      }
    }
    const pair = [accountId, target].sort()
    const dmKey = `${pair[0]}\0${pair[1]}`
    const db = this.db()
    const existing = db
      .prepare(`SELECT * FROM channels WHERE workspace_id = ? AND kind = 'dm' AND dm_key = ? LIMIT 1`)
      .get(workspaceId, dmKey) as ChannelRow | undefined
    if (existing) {
      return this.getChannelDetail(existing.id)
    }

    const id = allocateRecordId()
    const now = Date.now()
    const peerLabel = this.accountLabel(target)
    db.prepare(
      `INSERT INTO channels (id, workspace_id, kind, dm_key, name, topic, access_mode, created_by, created_at, updated_at)
       VALUES (?, ?, 'dm', ?, ?, '', 'private', ?, ?, ?)`,
    ).run(id, workspaceId, dmKey, peerLabel, accountId, now, now)

    const addMemberStmt = db.prepare(
      `INSERT OR IGNORE INTO channel_members (channel_id, member_type, member_id, role, added_by, added_at)
       VALUES (?, 'account', ?, ?, ?, ?)`,
    )
    addMemberStmt.run(id, accountId, 'owner', accountId, now)
    if (target !== accountId) {
      addMemberStmt.run(id, target, 'member', accountId, now)
    }

    const detail = this.getChannelDetail(id)
    this.broadcastToChannel(id, workspaceId, 'channel/updated', { channel: detail.channel })
    return detail
  }

  private defaultNameForChannel(channelId: string, workspaceId?: string): string {
    const rows = this.db()
      .prepare(
        `SELECT member_type, member_id FROM channel_members
         WHERE channel_id = ?
         ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END ASC, added_at ASC, rowid ASC`,
      )
      .all(channelId) as Array<{ member_type: string; member_id: string }>
    const humans: string[] = []
    const agents: string[] = []
    for (const r of rows) {
      if (r.member_type === 'account') humans.push(this.accountLabel(r.member_id, workspaceId))
      else if (r.member_type === 'agent') agents.push(this.agentMeta(r.member_id).name)
    }
    return buildDefaultChannelName(humans, agents)
  }

  createChannel(input: {
    name?: string
    topic?: string
    accessMode?: ChannelAccessMode
    memberAccountIds?: string[]
    agentIds?: string[]
  }): ChannelDetailPayload {
    const { accountId, workspaceId } = this.currentActorIds()
    const cleanHumanIds: string[] = []
    for (const memberId of input.memberAccountIds ?? []) {
      const clean = String(memberId ?? '').trim()
      if (!clean || clean === accountId || cleanHumanIds.includes(clean)) continue
      cleanHumanIds.push(clean)
    }
    const cleanAgentIds: string[] = []
    for (const agentId of input.agentIds ?? []) {
      const clean = String(agentId ?? '').trim()
      if (!clean || cleanAgentIds.includes(clean)) continue
      const meta = this.agentMeta(clean)
      // 仅允许拉入自己的 Agent（本地单人模式放行）
      if (accountId !== 'local' && meta.ownerAccountId !== 'local' && meta.ownerAccountId !== accountId) {
        continue
      }
      cleanAgentIds.push(clean)
    }
    const providedName = String(input.name ?? '').trim().slice(0, 80)
    const name =
      providedName ||
      buildDefaultChannelName(
        [this.accountLabel(accountId, workspaceId), ...cleanHumanIds.map((m) => this.accountLabel(m, workspaceId))],
        cleanAgentIds.map((a) => this.agentMeta(a).name),
      )
    const topic = String(input.topic ?? '').trim().slice(0, 240)
    const accessMode: ChannelAccessMode = input.accessMode === 'workspace' ? 'workspace' : 'private'
    const id = allocateRecordId()
    const now = Date.now()
    const db = this.db()
    db.prepare(
      `INSERT INTO channels (id, workspace_id, name, topic, access_mode, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, workspaceId, name, topic, accessMode, accountId, now, now)

    const addMemberStmt = db.prepare(
      `INSERT OR IGNORE INTO channel_members (channel_id, member_type, member_id, role, added_by, added_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    addMemberStmt.run(id, 'account', accountId, 'owner', accountId, now)

    for (const clean of cleanHumanIds) {
      addMemberStmt.run(id, 'account', clean, 'member', accountId, now)
    }

    for (const clean of cleanAgentIds) {
      addMemberStmt.run(id, 'agent', clean, 'member', accountId, now)
    }

    const detail = this.getChannelDetail(id)
    this.broadcastToChannel(id, workspaceId, 'channel/updated', { channel: detail.channel })
    return detail
  }

  /** 根据聊天近期内容自动生成简洁标题（优先调用 LLM，无 Key 或异常时回退为首条有效消息摘要）。 */
  async autoNameChannel(channelId: string): Promise<ChannelSummary> {
    const { accountId } = this.currentActorIds()
    const row = this.requireChannelRow(channelId, accountId)
    if (row.kind === 'dm') return this.toSummary(row, accountId)
    const msgs = this.db()
      .prepare(
        `SELECT sender_type, sender_id, text FROM channel_messages
         WHERE channel_id = ? AND ephemeral_to = '' AND sender_type IN ('account', 'agent')
         ORDER BY seq ASC LIMIT 12`,
      )
      .all(channelId) as Array<{ sender_type: string; sender_id: string; text: string }>
    if (msgs.length === 0) {
      const fallback = this.defaultNameForChannel(channelId, row.workspace_id)
      return this.applyChannelAutoName(channelId, row, accountId, fallback)
    }

    const transcript = msgs
      .map((m) => {
        const who =
          m.sender_type === 'agent'
            ? this.agentMeta(m.sender_id).name
            : this.accountLabel(m.sender_id, row.workspace_id)
        return `${who}: ${m.text.slice(0, 200)}`
      })
      .join('\n')

    const fallbackFromText = () => {
      const first = msgs.find((m) => m.text.trim())?.text ?? ''
      const stripped = first
        .replace(/@[^\s@]+/g, ' ')
        .replace(/[`*_#>\[\]()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (!stripped) return this.defaultNameForChannel(channelId, row.workspace_id)
      return stripped.length > 16 ? `${stripped.slice(0, 16)}…` : stripped
    }

    let generated = ''
    try {
      const llm = this.resolveLlmClient('', accountId, accountId)
      const res = await llm.chat(
        [
          {
            role: 'system',
            content:
              '你是聊天命名助手。请根据聊天记录生成一个简短准确的中文标题（4到12个字），不要加引号、书名号或多余解释，只输出标题本身。',
          },
          { role: 'user', content: transcript },
        ],
        [],
      )
      const raw = String(res?.content ?? '')
        .split(/\r?\n/)[0]
        ?.replace(/^[\s"'「」『』《》【】#*-]+|[\s"'「」『』《》【】。，,.!?！？]+$/g, '')
        .trim()
      if (raw && !raw.startsWith('未配置 API Key')) {
        generated = raw.slice(0, 24)
      }
    } catch {
      /* fallback below */
    }

    const nextName = generated || fallbackFromText()
    return this.applyChannelAutoName(channelId, row, accountId, nextName)
  }

  private applyChannelAutoName(channelId: string, row: ChannelRow, accountId: string, nextName: string): ChannelSummary {
    const clean = nextName.trim().slice(0, 80)
    if (!clean || clean === row.name) return this.toSummary(row, accountId)
    const now = Date.now()
    this.db().prepare(`UPDATE channels SET name = ?, updated_at = ? WHERE id = ?`).run(clean, now, channelId)
    const updated = this.toSummary(this.requireChannelRow(channelId, accountId), accountId)
    this.broadcastToChannel(channelId, row.workspace_id, 'channel/updated', { channel: updated })
    return updated
  }

  private maybeScheduleAutoName(channelId: string, row: ChannelRow, accountId: string) {
    if (row.kind === 'dm' || this.autoNamedAttempted.has(channelId)) return
    const countRow = this.db()
      .prepare(`SELECT COUNT(*) AS cnt FROM channel_messages WHERE channel_id = ? AND ephemeral_to = '' AND sender_type IN ('account', 'agent')`)
      .get(channelId) as { cnt?: number } | undefined
    if (Number(countRow?.cnt ?? 0) < 2) return
    const expectedDefault = this.defaultNameForChannel(channelId, row.workspace_id)
    if (row.name !== expectedDefault) return
    this.autoNamedAttempted.add(channelId)
    void runWithAccount(accountId, () =>
      runWithRequestWorkspace(row.workspace_id, () => this.autoNameChannel(channelId)),
    ).catch(() => undefined)
  }

  updateChannel(channelId: string, patch: { name?: string; topic?: string; accessMode?: ChannelAccessMode }): ChannelSummary {
    const { accountId } = this.currentActorIds()
    const row = this.requireChannelRow(channelId, accountId)
    if (!this.canManageChannel(row, accountId)) throw new Error('permission denied: 仅群主或管理员可修改群信息')
    const nextName = patch.name !== undefined ? String(patch.name).trim().slice(0, 80) : row.name
    if (!nextName) throw new Error('群聊名称不能为空')
    const nextTopic = patch.topic !== undefined ? String(patch.topic).trim().slice(0, 240) : row.topic
    const nextMode: ChannelAccessMode =
      patch.accessMode !== undefined ? (patch.accessMode === 'workspace' ? 'workspace' : 'private') : (row.access_mode === 'workspace' ? 'workspace' : 'private')
    const now = Date.now()
    this.db()
      .prepare(`UPDATE channels SET name = ?, topic = ?, access_mode = ?, updated_at = ? WHERE id = ?`)
      .run(nextName, nextTopic, nextMode, now, channelId)
    const updated = this.toSummary(this.requireChannelRow(channelId, accountId))
    this.broadcastToChannel(channelId, row.workspace_id, 'channel/updated', { channel: updated })
    return updated
  }

  deleteChannel(channelId: string): { ok: true; id: string } {
    const { accountId } = this.currentActorIds()
    const row = this.requireChannelRow(channelId, accountId)
    if (!this.canManageChannel(row, accountId)) throw new Error('permission denied: 仅群主或管理员可解散群聊')
    const humanIds = this.channelHumanAccountIds(channelId, row.workspace_id, row.access_mode === 'workspace')
    // 取消该群所有在跑的 agent run
    for (const [key, state] of [...this.queues]) {
      if (!key.startsWith(`${channelId}\0`)) continue
      state.active?.abort.abort()
      for (const job of state.queue) job.abort.abort()
      this.queues.delete(key)
    }
    const db = this.db()
    db.prepare(`DELETE FROM channel_agent_runs WHERE channel_id = ?`).run(channelId)
    db.prepare(`DELETE FROM channel_messages WHERE channel_id = ?`).run(channelId)
    db.prepare(`DELETE FROM channel_members WHERE channel_id = ?`).run(channelId)
    db.prepare(`DELETE FROM channels WHERE id = ?`).run(channelId)
    this.broadcastToAccounts(humanIds, row.workspace_id, 'channel/deleted', { id: channelId })
    return { ok: true, id: channelId }
  }

  addMember(channelId: string, memberType: ChannelMemberType, memberId: string): ChannelMemberView[] {
    const { accountId } = this.currentActorIds()
    const row = this.requireChannelRow(channelId, accountId)
    const cleanId = String(memberId ?? '').trim()
    if (!cleanId) throw new Error('成员 ID 不能为空')

    if (memberType === 'account') {
      if (!this.canManageChannel(row, accountId)) {
        throw new Error('permission denied: 仅群主或管理员可邀请新成员')
      }
      if (row.workspace_id && accountId !== 'local') {
        const store = this.accountStore()
        if (store?.isMember && !store.isMember(cleanId, row.workspace_id)) {
          throw new Error('permission denied: 该用户不是当前空间成员')
        }
      }
    } else {
      // 任何群成员都可以拉「自己创建的 Agent」入群；不能强拉别人的私人 Agent
      const meta = this.agentMeta(cleanId)
      if (accountId !== 'local' && meta.ownerAccountId !== 'local' && meta.ownerAccountId !== accountId) {
        throw new Error('permission denied: 只能将自己创建的 Agent 拉入群聊')
      }
    }

    const now = Date.now()
    this.db()
      .prepare(
        `INSERT OR IGNORE INTO channel_members (channel_id, member_type, member_id, role, added_by, added_at)
         VALUES (?, ?, ?, 'member', ?, ?)`,
      )
      .run(channelId, memberType, cleanId, accountId, now)
    this.db().prepare(`UPDATE channels SET updated_at = ? WHERE id = ?`).run(now, channelId)

    const members = this.listMembers(channelId, accountId)
    this.broadcastToChannel(channelId, row.workspace_id, 'channel/members', { channelId, members })
    return members
  }

  removeMember(channelId: string, memberType: ChannelMemberType, memberId: string): ChannelMemberView[] {
    const { accountId } = this.currentActorIds()
    const row = this.requireChannelRow(channelId, accountId)
    const cleanId = String(memberId ?? '').trim()
    if (memberType === 'account') {
      const selfLeave = cleanId === accountId
      if (!selfLeave && !this.canManageChannel(row, accountId)) {
        throw new Error('permission denied: 仅群主或管理员可移除成员')
      }
      if (row.created_by === cleanId && !selfLeave) {
        throw new Error('不能移除群主')
      }
    } else {
      const meta = this.agentMeta(cleanId)
      const isAgentOwner = accountId === 'local' || meta.ownerAccountId === accountId
      if (!isAgentOwner && !this.canManageChannel(row, accountId)) {
        throw new Error('permission denied: 仅 Agent 归属人或群主可移除该 Agent')
      }
      const key = this.queueKey(channelId, cleanId)
      const state = this.queues.get(key)
      if (state) {
        state.active?.abort.abort()
        for (const job of state.queue) job.abort.abort()
        this.queues.delete(key)
      }
    }
    this.db()
      .prepare(`DELETE FROM channel_members WHERE channel_id = ? AND member_type = ? AND member_id = ?`)
      .run(channelId, memberType, cleanId)
    const members = this.listMembers(channelId, accountId)
    this.broadcastToChannel(channelId, row.workspace_id, 'channel/members', { channelId, members })
    return members
  }

  listMembers(
    channelId: string,
    viewerAccountId = this.currentActorIds().accountId,
    workspaceId?: string,
    skipPrune = false,
  ): ChannelMemberView[] {
    if (!skipPrune) this.pruneDeletedAgents(channelId)
    const channelWorkspaceId =
      workspaceId ??
      ((this.db().prepare(`SELECT workspace_id FROM channels WHERE id = ?`).get(channelId) as { workspace_id?: string } | undefined)
        ?.workspace_id || undefined)
    const rows = this.db()
      .prepare(`SELECT * FROM channel_members WHERE channel_id = ? ORDER BY added_at ASC`)
      .all(channelId) as MemberRow[]
    return rows.map((row) => {
      if (row.member_type === 'agent') {
        const meta = this.agentMeta(row.member_id)
        return {
          channelId: row.channel_id,
          memberType: 'agent',
          memberId: row.member_id,
          role: (row.role as ChannelMemberRole) || 'member',
          addedBy: row.added_by,
          addedAt: row.added_at,
          name: meta.name,
          ...(meta.mascot ? { mascot: meta.mascot } : {}),
          ownerAccountId: meta.ownerAccountId,
          ownerName: this.accountLabel(meta.ownerAccountId, channelWorkspaceId),
          systemPrompt: meta.systemPrompt.slice(0, 300),
          model: meta.model,
          isOwn: viewerAccountId === 'local' || meta.ownerAccountId === viewerAccountId || meta.ownerAccountId === 'local',
        }
      }
      const memberAvatar = this.accountAvatar(row.member_id, channelWorkspaceId)
      return {
        channelId: row.channel_id,
        memberType: 'account',
        memberId: row.member_id,
        role: (row.role as ChannelMemberRole) || 'member',
        addedBy: row.added_by,
        addedAt: row.added_at,
        name: this.accountLabel(row.member_id, channelWorkspaceId),
        ...(memberAvatar ? { avatar: memberAvatar } : {}),
        isOwn: row.member_id === viewerAccountId,
      }
    })
  }

  private requireChannelRow(channelId: string, accountId: string): ChannelRow {
    const row = this.db().prepare(`SELECT * FROM channels WHERE id = ?`).get(channelId) as ChannelRow | undefined
    if (!row || !this.canReadChannel(row, accountId)) {
      throw new Error('unknown channel')
    }
    return row
  }

  getChannelDetail(channelId: string, limit = 100): ChannelDetailPayload {
    const { accountId } = this.currentActorIds()
    const row = this.requireChannelRow(channelId, accountId)
    const members = this.listMembers(channelId, accountId, row.workspace_id)
    const messages = this.listMessages(channelId, accountId, limit)
    const activities = this.listActivities(channelId, accountId)
    return {
      channel: this.toSummary(row),
      members,
      messages,
      activities,
      myAccountId: accountId,
      canManageMembers: this.canManageChannel(row, accountId),
    }
  }

  listMessages(channelId: string, viewerAccountId = this.currentActorIds().accountId, limit = 100): ChannelMessageView[] {
    const ch = this.requireChannelRow(channelId, viewerAccountId)
    const safeLimit = Math.min(200, Math.max(1, limit))
    const rows = this.db()
      .prepare(
        `SELECT * FROM (
           SELECT * FROM channel_messages
           WHERE channel_id = ? AND (ephemeral_to = '' OR ephemeral_to = ?)
           ORDER BY seq DESC
           LIMIT ?
         ) ORDER BY seq ASC`,
      )
      .all(channelId, viewerAccountId, safeLimit) as MessageRow[]
    const byId = new Map<string, MessageRow>()
    for (const r of rows) byId.set(r.id, r)
    return rows.map((row) => this.hydrateMessage(row, byId, ch.workspace_id))
  }

  private hydrateMessage(row: MessageRow, lookup?: Map<string, MessageRow>, workspaceId?: string): ChannelMessageView {
    const channelWorkspaceId =
      workspaceId ??
      ((this.db().prepare(`SELECT workspace_id FROM channels WHERE id = ?`).get(row.channel_id) as { workspace_id?: string } | undefined)
        ?.workspace_id || undefined)
    let senderName = ''
    let senderAvatar: string | undefined
    let senderMascot: SessionMascot | undefined
    if (row.sender_type === 'agent') {
      const meta = this.agentMeta(row.sender_id)
      senderName = meta.name
      senderMascot = meta.mascot
    } else if (row.sender_type === 'account') {
      senderName = this.accountLabel(row.sender_id, channelWorkspaceId)
      senderAvatar = this.accountAvatar(row.sender_id, channelWorkspaceId)
    } else if (row.sender_id) {
      const meta = this.agentMeta(row.sender_id)
      senderName = meta.name
      senderMascot = meta.mascot
    } else {
      senderName = '系统'
    }

    let replyPreview: ChannelMessageView['replyPreview'] = null
    if (row.reply_to_id) {
      const target =
        lookup?.get(row.reply_to_id) ??
        (this.db().prepare(`SELECT * FROM channel_messages WHERE id = ?`).get(row.reply_to_id) as MessageRow | undefined)
      if (target && !target.ephemeral_to) {
        const targetName =
          target.sender_type === 'agent'
            ? this.agentMeta(target.sender_id).name
            : target.sender_type === 'account'
              ? this.accountLabel(target.sender_id, channelWorkspaceId)
              : '系统'
        replyPreview = {
          id: target.id,
          senderType: target.sender_type as ChannelMessageView['senderType'],
          senderId: target.sender_id,
          senderName: targetName,
          text: target.text.slice(0, 120),
        }
      }
    }

    const meta = safeJsonParse<ChannelMessageMeta>(row.meta_json, {})
    return {
      id: row.id,
      channelId: row.channel_id,
      seq: row.seq,
      senderType: row.sender_type as ChannelMessageView['senderType'],
      senderId: row.sender_id,
      senderName,
      ...(senderAvatar ? { senderAvatar } : {}),
      ...(senderMascot ? { senderMascot } : {}),
      replyToId: row.reply_to_id,
      replyPreview,
      text: row.text,
      mentions: safeJsonParse<ChannelMention[]>(row.mentions_json, []),
      traceId: row.trace_id,
      ephemeralTo: row.ephemeral_to,
      ...(Object.keys(meta).length ? { meta } : {}),
      createdAt: row.created_at,
    }
  }

  private insertMessage(input: {
    channelId: string
    senderType: 'account' | 'agent' | 'system'
    senderId: string
    replyToId?: string
    text: string
    mentions?: ChannelMention[]
    traceId?: string
    ephemeralTo?: string
    meta?: ChannelMessageMeta
  }): ChannelMessageView {
    const db = this.db()
    const id = allocateRecordId()
    const now = Date.now()
    const maxRow = db
      .prepare(`SELECT COALESCE(MAX(seq), 0) AS max_seq FROM channel_messages WHERE channel_id = ?`)
      .get(input.channelId) as { max_seq?: number } | undefined
    const seq = Number(maxRow?.max_seq ?? 0) + 1
    db.prepare(
      `INSERT INTO channel_messages
        (id, channel_id, seq, sender_type, sender_id, reply_to_id, text, mentions_json, trace_id, ephemeral_to, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.channelId,
      seq,
      input.senderType,
      input.senderId,
      input.replyToId ?? '',
      input.text,
      JSON.stringify(input.mentions ?? []),
      input.traceId ?? '',
      input.ephemeralTo ?? '',
      JSON.stringify(input.meta ?? {}),
      now,
    )
    if (!input.ephemeralTo) {
      db.prepare(`UPDATE channels SET updated_at = ? WHERE id = ?`).run(now, input.channelId)
    }
    const row = db.prepare(`SELECT * FROM channel_messages WHERE id = ?`).get(id) as MessageRow
    const view = this.hydrateMessage(row)
    const ch = db.prepare(`SELECT * FROM channels WHERE id = ?`).get(input.channelId) as ChannelRow | undefined
    if (ch) {
      if (input.ephemeralTo) {
        this.broadcastToAccounts([input.ephemeralTo], ch.workspace_id, 'channel/message', { message: view })
      } else {
        this.broadcastToChannel(input.channelId, ch.workspace_id, 'channel/message', { message: view })
        if (input.senderType === 'account' || input.senderType === 'agent') {
          const actorForNaming = input.senderType === 'account' ? input.senderId : ch.created_by
          this.maybeScheduleAutoName(input.channelId, ch, actorForNaming)
        }
      }
    }
    return view
  }

  private updateApprovalMessageStatus(channelId: string, approvalId: string, status: 'allowed' | 'denied', targetAccountId: string) {
    const db = this.db()
    const rows = db
      .prepare(`SELECT * FROM channel_messages WHERE channel_id = ? AND ephemeral_to != '' ORDER BY seq DESC LIMIT 30`)
      .all(channelId) as MessageRow[]
    for (const row of rows) {
      const meta = safeJsonParse<ChannelMessageMeta>(row.meta_json, {})
      if (meta.kind === 'approval' && meta.approvalId === approvalId) {
        meta.status = status
        db.prepare(`UPDATE channel_messages SET meta_json = ? WHERE id = ?`).run(JSON.stringify(meta), row.id)
        const updated = this.hydrateMessage({ ...row, meta_json: JSON.stringify(meta) })
        const ch = db.prepare(`SELECT * FROM channels WHERE id = ?`).get(channelId) as ChannelRow | undefined
        if (ch) {
          this.broadcastToAccounts([targetAccountId || row.ephemeral_to], ch.workspace_id, 'channel/message-updated', { message: updated })
        }
        break
      }
    }
  }

  sendMessage(
    channelId: string,
    input: { text: string; replyToId?: string; mentions?: ChannelMention[] },
  ): { message: ChannelMessageView; triggeredRunIds: string[] } {
    const { accountId } = this.currentActorIds()
    const channel = this.requireChannelRow(channelId, accountId)
    const text = String(input.text ?? '').trim()
    if (!text) throw new Error('消息内容不能为空')

    // 若是空间群，首次发消息自动加入人类成员表（便于群成员列表与 RoomFloor 计算）
    if (channel.access_mode === 'workspace' && !this.isChannelMember(channelId, accountId)) {
      this.db()
        .prepare(
          `INSERT OR IGNORE INTO channel_members (channel_id, member_type, member_id, role, added_by, added_at)
           VALUES (?, 'account', ?, 'member', ?, ?)`,
        )
        .run(channelId, accountId, accountId, Date.now())
    }

    const channelAgents = this.listMembers(channelId, accountId)
      .filter((m) => m.memberType === 'agent')
      .map((m) => ({ id: m.memberId, name: m.name }))
    const { agentIds, mentions } = resolveMentionedAgents(text, input.mentions ?? [], channelAgents)

    const message = this.insertMessage({
      channelId,
      senderType: 'account',
      senderId: accountId,
      replyToId: input.replyToId ?? '',
      text,
      mentions,
    })

    // 严格 Slack 逻辑：仅显式 @Agent 或 @所有人 时触发回复
    const triggeredRunIds: string[] = []
    for (const agentId of agentIds) {
      const runId = this.enqueueAgentRun({
        channelId,
        workspaceId: channel.workspace_id,
        agentId,
        invokerId: accountId,
        originMessageId: message.id,
        senderName: message.senderName,
        text,
        hopCount: 0,
        visitedAgents: new Set(),
      })
      if (runId) triggeredRunIds.push(runId)
    }

    return { message, triggeredRunIds }
  }

  private enqueueAgentRun(opts: {
    channelId: string
    workspaceId: string
    agentId: string
    invokerId: string
    originMessageId: string
    senderName: string
    text: string
    hopCount: number
    visitedAgents: Set<string>
  }): string | null {
    const meta = this.agentMeta(opts.agentId)
    const key = this.queueKey(opts.channelId, opts.agentId)
    let state = this.queues.get(key)
    if (!state) {
      state = { active: null, queue: [], status: 'queued', stepLabel: '', events: [] }
      this.queues.set(key, state)
    }

    // 同一个人在 Bot 忙时连续 @ → 合并到同一个排队批次（权限完全一致）；不同人绝不合并！
    const tail = state.queue.at(-1)
    if (tail && tail.invokerId === opts.invokerId && tail.hopCount === 0 && opts.hopCount === 0) {
      tail.messages.push({ id: opts.originMessageId, senderName: opts.senderName, text: opts.text })
      this.broadcastActivities(opts.channelId, opts.workspaceId)
      return tail.runId
    }

    if (state.queue.length >= MAX_CHANNEL_QUEUE_PER_AGENT) {
      this.insertMessage({
        channelId: opts.channelId,
        senderType: 'system',
        senderId: opts.agentId,
        replyToId: opts.originMessageId,
        text: `${meta.name} 当前排队已满（${MAX_CHANNEL_QUEUE_PER_AGENT} 条），请稍后再试。`,
        ephemeralTo: opts.invokerId,
        meta: { kind: 'info', agentId: opts.agentId },
      })
      return null
    }

    const runId = allocateRecordId()
    const now = Date.now()
    this.db()
      .prepare(
        `INSERT INTO channel_agent_runs
          (id, channel_id, agent_id, agent_owner_id, invoker_id, origin_message_id, reply_message_id, status, events_json, error, created_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, '', 'queued', '[]', '', ?, 0)`,
      )
      .run(runId, opts.channelId, opts.agentId, meta.ownerAccountId, opts.invokerId, opts.originMessageId, now)

    const job: QueuedJob = {
      runId,
      channelId: opts.channelId,
      workspaceId: opts.workspaceId,
      agentId: opts.agentId,
      agentOwnerId: meta.ownerAccountId,
      invokerId: opts.invokerId,
      originMessageId: opts.originMessageId,
      hopCount: opts.hopCount,
      visitedAgents: new Set(opts.visitedAgents),
      messages: [{ id: opts.originMessageId, senderName: opts.senderName, text: opts.text }],
      abort: new AbortController(),
    }
    this.runLookup.set(runId, job)
    state.queue.push(job)
    this.broadcastActivities(opts.channelId, opts.workspaceId)

    if (!state.active) {
      void this.drainAgentQueue(key)
    }
    return runId
  }

  private async drainAgentQueue(key: string) {
    const state = this.queues.get(key)
    if (!state || state.active) return
    while (state.queue.length > 0) {
      const job = state.queue.shift()!
      if (job.abort.signal.aborted) {
        this.updateRunRow(job.runId, { status: 'cancelled', finishedAt: Date.now() })
        this.runLookup.delete(job.runId)
        continue
      }
      state.active = job
      state.status = 'running'
      state.stepLabel = '正在思考…'
      state.events = []
      this.updateRunRow(job.runId, { status: 'running' })
      this.broadcastActivities(job.channelId, job.workspaceId)

      try {
        await this.executeJob(job, state)
      } catch (error) {
        const cancelled = job.abort.signal.aborted || /cancelled|aborted/i.test(String(error))
        const status: ChannelRunStatus = cancelled ? 'cancelled' : 'failed'
        const errMsg = cancelled ? '' : String(error)
        this.pushRunEvent(job, state, {
          ts: Date.now(),
          kind: cancelled ? 'cancelled' : 'error',
          text: cancelled ? '已取消本次回复' : `执行出错：${errMsg}`,
        })
        this.updateRunRow(job.runId, { status, error: errMsg, events: state.events, finishedAt: Date.now() })
        if (!cancelled) {
          this.insertMessage({
            channelId: job.channelId,
            senderType: 'system',
            senderId: job.agentId,
            replyToId: job.originMessageId,
            text: `执行失败：${errMsg.slice(0, 300)}`,
            traceId: job.runId,
            ephemeralTo: job.invokerId,
            meta: { kind: 'info', runId: job.runId, agentId: job.agentId },
          })
        }
      } finally {
        state.active = null
        state.stepLabel = ''
        this.runLookup.delete(job.runId)
        this.broadcastActivities(job.channelId, job.workspaceId)
      }
    }
    this.queues.delete(key)
  }

  private buildRoomContext(channelId: string, workspaceId: string): ActorRoomContext {
    const ch = this.db().prepare(`SELECT access_mode FROM channels WHERE id = ?`).get(channelId) as { access_mode?: string } | undefined
    const audience = this.channelHumanAccountIds(channelId, workspaceId, ch?.access_mode === 'workspace')
    const store = this.accountStore()
    let hasExternalMember = false
    if (workspaceId && store?.authorization?.membershipKind) {
      for (const accId of audience) {
        if (accId === 'local') continue
        const kind = store.authorization.membershipKind(accId, workspaceId)
        if (kind === 'external' || kind === 'guest') {
          hasExternalMember = true
          break
        }
      }
    }
    return {
      channelId,
      denyPersonal: true,
      hasExternalMember,
      audienceAccountIds: audience.filter((id) => id && id !== 'local'),
    }
  }

  private async executeJob(job: QueuedJob, state: AgentQueueState) {
    const db = this.db()
    const channel = db.prepare(`SELECT * FROM channels WHERE id = ?`).get(job.channelId) as ChannelRow | undefined
    if (!channel) return
    const meta = this.agentMeta(job.agentId)
    const members = this.listMembers(job.channelId, job.agentOwnerId)
    const humanNames = members.filter((m) => m.memberType === 'account').map((m) => m.name)
    const agentNames = members.filter((m) => m.memberType === 'agent').map((m) => m.name)
    const invokerName = this.accountLabel(job.invokerId)
    const ownerName = this.accountLabel(job.agentOwnerId)

    // 严格隔离上下文：仅注入群聊公开消息投影，绝不读取 Agent 的 1v1 私聊 events
    const historyRows = db
      .prepare(
        `SELECT * FROM (
           SELECT * FROM channel_messages
           WHERE channel_id = ? AND ephemeral_to = ''
           ORDER BY seq DESC
           LIMIT ?
         ) ORDER BY seq ASC`,
      )
      .all(job.channelId, MAX_CHANNEL_HISTORY_MESSAGES) as MessageRow[]

    const channelSystemPrompt = [
      meta.systemPrompt ? `${meta.systemPrompt.trim()}\n` : '',
      `你当前在 BIU 群聊「#${channel.name}」中，你的名字是「${meta.name}」（归属人：${ownerName}）。`,
      channel.topic ? `群主题：${channel.topic}` : '',
      `群成员：${humanNames.join('、') || '（无）'}`,
      `群内 Agent：${agentNames.join('、') || meta.name}`,
      `本次在群里 @ 你的成员是：${invokerName}${job.hopCount > 0 ? `（经由其他 Agent 接力，第 ${job.hopCount} 跳）` : ''}。`,
      '规则：',
      '1. 请直接给出清晰简洁的群聊回复，面向全群可见，不要泄露任何私人数据。',
      `2. 如果需要交给同群其他 Agent 继续处理，可以在回复末尾用 @对方名字 发起接力（系统限制最多 ${MAX_CHANNEL_HANDOFF_HOPS} 跳）；不要 @ 自己。`,
      '3. 若因权限不足（例如私人文档或对方无权访问的数据）导致工具返回拒绝，请直接礼貌说明无权访问，切勿编造内容。',
    ]
      .filter(Boolean)
      .join('\n')

    const llmMessages: LlmMessage[] = [{ role: 'system', content: channelSystemPrompt }]
    for (const row of historyRows) {
      const speaker =
        row.sender_type === 'agent'
          ? this.agentMeta(row.sender_id).name
          : row.sender_type === 'account'
            ? this.accountLabel(row.sender_id)
            : '系统'
      if (row.sender_type === 'agent' && row.sender_id === job.agentId) {
        llmMessages.push({ role: 'assistant', content: row.text })
      } else {
        llmMessages.push({ role: 'user', content: `[${speaker}]: ${row.text}` })
      }
    }
    if (job.messages.length > 1) {
      llmMessages.push({
        role: 'user',
        content: `[系统提示] ${invokerName} 刚刚连续发了 ${job.messages.length} 条消息 @ 你，请合并回应。`,
      })
    }

    const roomContext = this.buildRoomContext(job.channelId, job.workspaceId)
    const runAccount = job.agentOwnerId && job.agentOwnerId !== 'local' ? job.agentOwnerId : ''
    const runInvoker = job.invokerId && job.invokerId !== 'local' ? job.invokerId : runAccount
    const actorCtx =
      runAccount || runInvoker
        ? {
            type: 'agent' as const,
            actorId: job.agentId,
            delegatedBy: runAccount || runInvoker,
            invokerId: runInvoker || runAccount,
            roomContext,
            runId: job.runId,
          }
        : {
            type: 'agent' as const,
            actorId: job.agentId,
            delegatedBy: 'local',
            invokerId: 'local',
            roomContext,
            runId: job.runId,
          }

    const summary = this.ctx.sessions?.peekSummary?.(job.agentId)
    const toolMode: AgentToolMode = (summary?.config?.agentMode as AgentToolMode | undefined) ?? 'standard'
    const extraTools = Array.isArray(summary?.config?.extraTools) ? summary.config.extraTools.map(String) : []

    const llm = this.resolveLlmClient(job.agentId, runAccount, runInvoker)
    const executeScoped = <T>(fn: () => T): T => {
      const inner = () =>
        runWithSession(job.agentId, () =>
          runWithToolPolicy({ mode: toolMode, extras: extraTools }, () =>
            runWithActorContext(actorCtx, fn),
          ),
        )
      const withWs = job.workspaceId ? () => runWithRequestWorkspace(job.workspaceId, inner) : inner
      return runAccount ? runWithAccount(runAccount, withWs) : withWs()
    }

    let finalText = ''
    for (let step = 0; step < MAX_CHANNEL_TOOL_STEPS; step += 1) {
      if (job.abort.signal.aborted) throw new Error('cancelled')
      state.stepLabel = step === 0 ? '正在思考…' : `正在执行第 ${step + 1} 步…`
      this.broadcastActivities(job.channelId, job.workspaceId)

      const toolSchemas = executeScoped(() => this.ctx.tools?.schemas?.() ?? [])
      const reply = await llm.chat(llmMessages, toolSchemas, job.abort.signal, {
        onDelta: (delta) => {
          if (!delta) return
          this.pushRunEvent(job, state, { ts: Date.now(), kind: 'delta', step, text: delta })
        },
        onReasoningDelta: (delta) => {
          if (!delta) return
          this.pushRunEvent(job, state, { ts: Date.now(), kind: 'thinking', step, text: delta })
        },
      })

      if (job.abort.signal.aborted) throw new Error('cancelled')
      const content = String(reply.content ?? '').trim()
      const toolCalls = reply.toolCalls ?? []

      if (!toolCalls.length) {
        finalText = content || '（无回复内容）'
        break
      }

      llmMessages.push({
        role: 'assistant',
        content: content || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      })

      for (const tc of toolCalls) {
        if (job.abort.signal.aborted) throw new Error('cancelled')
        const parsedArgs = safeJsonParse<Record<string, unknown>>(tc.arguments, {})
        state.stepLabel = `正在调用 ${tc.name}…`
        this.pushRunEvent(job, state, {
          ts: Date.now(),
          kind: 'tool_call',
          step,
          callId: tc.id,
          toolName: tc.name,
          args: parsedArgs,
        })
        this.broadcastActivities(job.channelId, job.workspaceId)

        let ok = true
        let detail = ''
        try {
          const out = await executeScoped(() => this.ctx.tools.invoke(tc.name, parsedArgs, job.abort.signal))
          detail = truncateText(stringifyVal(out))
        } catch (err) {
          ok = false
          detail = truncateText(String(err))
        }
        this.pushRunEvent(job, state, {
          ts: Date.now(),
          kind: 'tool_result',
          step,
          callId: tc.id,
          toolName: tc.name,
          ok,
          detail,
        })
        llmMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: detail,
        })
      }
      finalText = content || finalText
    }

    if (!finalText) finalText = '（已完成操作）'
    this.pushRunEvent(job, state, { ts: Date.now(), kind: 'done', text: finalText })

    // Slack IM 风格：执行完毕后一次性把完整消息气泡投递进群聊流（携带 replyToId 与 traceId）
    const replyMsg = this.insertMessage({
      channelId: job.channelId,
      senderType: 'agent',
      senderId: job.agentId,
      replyToId: job.originMessageId,
      text: finalText,
      traceId: job.runId,
    })

    this.updateRunRow(job.runId, {
      status: 'done',
      replyMessageId: replyMsg.id,
      events: state.events,
      finishedAt: Date.now(),
    })

    // 受控 Agent-to-Agent 接力（Handoff）：上限 MAX_CHANNEL_HANDOFF_HOPS 跳，透传原始人类 invokerId
    if (job.hopCount < MAX_CHANNEL_HANDOFF_HOPS) {
      const nextVisited = new Set([...job.visitedAgents, job.agentId])
      const peerAgents = this.listMembers(job.channelId, job.agentOwnerId)
        .filter((m) => m.memberType === 'agent' && !nextVisited.has(m.memberId))
        .map((m) => ({ id: m.memberId, name: m.name }))
      const { agentIds: handoffTargets } = resolveMentionedAgents(finalText, [], peerAgents)
      for (const targetAgentId of handoffTargets) {
        this.enqueueAgentRun({
          channelId: job.channelId,
          workspaceId: job.workspaceId,
          agentId: targetAgentId,
          invokerId: job.invokerId,
          originMessageId: replyMsg.id,
          senderName: meta.name,
          text: finalText,
          hopCount: job.hopCount + 1,
          visitedAgents: nextVisited,
        })
      }
    }
  }

  private pushRunEvent(job: QueuedJob, state: AgentQueueState, event: ChannelRunEvent) {
    state.events.push(event)
    // 实时流式吐字与工具明细只定向推给 Owner 和 Invoker（且按角色脱敏），不污染主群聊流
    const ownerTarget = job.agentOwnerId
    const invokerTarget = job.invokerId
    if (ownerTarget) {
      this.broadcastToAccounts([ownerTarget], job.workspaceId, 'channel/run-event', {
        channelId: job.channelId,
        runId: job.runId,
        event,
      })
    }
    if (invokerTarget && invokerTarget !== ownerTarget) {
      const redacted = redactChannelRunEvents([event], 'invoker')[0]
      if (redacted) {
        this.broadcastToAccounts([invokerTarget], job.workspaceId, 'channel/run-event', {
          channelId: job.channelId,
          runId: job.runId,
          event: redacted,
        })
      }
    }
  }

  private updateRunRow(
    runId: string,
    patch: { status?: ChannelRunStatus; replyMessageId?: string; events?: ChannelRunEvent[]; error?: string; finishedAt?: number },
  ) {
    const sets: string[] = []
    const vals: Array<string | number> = []
    if (patch.status !== undefined) {
      sets.push('status = ?')
      vals.push(patch.status)
    }
    if (patch.replyMessageId !== undefined) {
      sets.push('reply_message_id = ?')
      vals.push(patch.replyMessageId)
    }
    if (patch.events !== undefined) {
      sets.push('events_json = ?')
      vals.push(JSON.stringify(patch.events))
    }
    if (patch.error !== undefined) {
      sets.push('error = ?')
      vals.push(patch.error)
    }
    if (patch.finishedAt !== undefined) {
      sets.push('finished_at = ?')
      vals.push(patch.finishedAt)
    }
    if (!sets.length) return
    vals.push(runId)
    this.db().prepare(`UPDATE channel_agent_runs SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  }

  listActivities(channelId: string, viewerAccountId = this.currentActorIds().accountId): ChannelAgentActivity[] {
    const channel = this.requireChannelRow(channelId, viewerAccountId)
    const isAdmin = this.canManageChannel(channel, viewerAccountId)
    const out: ChannelAgentActivity[] = []
    for (const [key, state] of this.queues) {
      if (!key.startsWith(`${channelId}\0`)) continue
      const job = state.active ?? state.queue[0]
      if (!job) continue
      const meta = this.agentMeta(job.agentId)
      out.push({
        runId: job.runId,
        channelId,
        agentId: job.agentId,
        agentName: meta.name,
        ...(meta.mascot ? { agentMascot: meta.mascot } : {}),
        agentOwnerId: job.agentOwnerId,
        agentOwnerName: this.accountLabel(job.agentOwnerId),
        invokerId: job.invokerId,
        invokerName: this.accountLabel(job.invokerId),
        originMessageId: job.originMessageId,
        status: state.active ? state.status : 'queued',
        queueCount: state.queue.length,
        stepLabel: state.active ? state.stepLabel : `排队中（${state.queue.length}）`,
        canCancel:
          viewerAccountId === 'local' ||
          viewerAccountId === job.invokerId ||
          viewerAccountId === job.agentOwnerId ||
          isAdmin,
      })
    }
    return out
  }

  getRunDetail(channelId: string, runId: string): ChannelRunDetail {
    const { accountId } = this.currentActorIds()
    const channel = this.requireChannelRow(channelId, accountId)
    const row = this.db()
      .prepare(`SELECT * FROM channel_agent_runs WHERE id = ? AND channel_id = ?`)
      .get(runId, channelId) as RunRow | undefined
    if (!row) throw new Error('unknown run')

    const isOwner = accountId === 'local' || row.agent_owner_id === accountId || row.agent_owner_id === 'local'
    const isInvoker = row.invoker_id === accountId
    const viewerRole: 'owner' | 'invoker' | 'member' = isOwner ? 'owner' : isInvoker ? 'invoker' : 'member'
    const state = this.queues.get(this.queueKey(channelId, row.agent_id))
    const liveEvents = state?.active?.runId === runId ? state.events : null
    const rawEvents = liveEvents ?? safeJsonParse<ChannelRunEvent[]>(row.events_json, [])
    const meta = this.agentMeta(row.agent_id)
    const status = (state?.active?.runId === runId ? state.status : row.status) as ChannelRunStatus

    return {
      id: row.id,
      channelId: row.channel_id,
      agentId: row.agent_id,
      agentName: meta.name,
      ...(meta.mascot ? { agentMascot: meta.mascot } : {}),
      agentOwnerId: row.agent_owner_id,
      agentOwnerName: this.accountLabel(row.agent_owner_id),
      invokerId: row.invoker_id,
      invokerName: this.accountLabel(row.invoker_id),
      originMessageId: row.origin_message_id,
      replyMessageId: row.reply_message_id,
      status,
      viewerRole,
      canCancel:
        (status === 'queued' || status === 'running' || status === 'waiting_approval') &&
        (isOwner || isInvoker || this.canManageChannel(channel, accountId)),
      events: redactChannelRunEvents(rawEvents, viewerRole),
      error: viewerRole === 'member' && row.error ? '执行失败' : row.error,
      createdAt: row.created_at,
      finishedAt: row.finished_at,
    }
  }

  cancelRun(channelId: string, runId: string): { ok: true; runId: string } {
    const { accountId } = this.currentActorIds()
    const channel = this.requireChannelRow(channelId, accountId)
    const row = this.db()
      .prepare(`SELECT * FROM channel_agent_runs WHERE id = ? AND channel_id = ?`)
      .get(runId, channelId) as RunRow | undefined
    if (!row) throw new Error('unknown run')

    const allowed =
      accountId === 'local' ||
      row.invoker_id === accountId ||
      row.agent_owner_id === accountId ||
      this.canManageChannel(channel, accountId)
    if (!allowed) {
      throw new Error('permission denied: 仅本次触发者、Agent 归属人或群主可中止')
    }

    const job = this.runLookup.get(runId)
    if (job) {
      job.abort.abort()
      const key = this.queueKey(channelId, job.agentId)
      const state = this.queues.get(key)
      if (state) {
        const idx = state.queue.findIndex((item) => item.runId === runId)
        if (idx >= 0) {
          state.queue.splice(idx, 1)
          this.updateRunRow(runId, { status: 'cancelled', finishedAt: Date.now() })
          this.runLookup.delete(runId)
        }
      }
      this.broadcastActivities(channelId, channel.workspace_id)
    } else if (row.status === 'queued' || row.status === 'running' || row.status === 'waiting_approval') {
      this.updateRunRow(runId, { status: 'cancelled', finishedAt: Date.now() })
    }
    return { ok: true, runId }
  }

  private channelHumanAccountIds(channelId: string, workspaceId: string, isWorkspaceChannel: boolean): string[] {
    const explicit = (
      this.db()
        .prepare(`SELECT member_id FROM channel_members WHERE channel_id = ? AND member_type = 'account'`)
        .all(channelId) as Array<{ member_id: string }>
    ).map((r) => r.member_id)
    if (!isWorkspaceChannel || !workspaceId) return [...new Set(explicit)]
    const all = new Set(explicit)
    try {
      const wsMembers = this.db()
        .prepare(`SELECT account_id FROM workspace_members WHERE workspace_id = ?`)
        .all(workspaceId) as Array<{ account_id: string }>
      for (const row of wsMembers) {
        if (row.account_id) all.add(row.account_id)
      }
    } catch {
      /* ignore */
    }
    return [...all]
  }

  private broadcastToChannel(channelId: string, workspaceId: string, type: string, payload: Record<string, unknown>) {
    const ch = this.db().prepare(`SELECT access_mode FROM channels WHERE id = ?`).get(channelId) as { access_mode?: string } | undefined
    const accounts = this.channelHumanAccountIds(channelId, workspaceId, ch?.access_mode === 'workspace')
    this.broadcastToAccounts(accounts, workspaceId, type, payload)
  }

  private broadcastToAccounts(accounts: string[], workspaceId: string, type: string, payload: Record<string, unknown>) {
    const http = this.ctx.http
    if (!http) return
    const hasRealAccounts = accounts.some((id) => id && id !== 'local')
    if (!hasRealAccounts) {
      http.broadcast(type, payload, workspaceId, '')
      return
    }
    for (const accId of new Set(accounts)) {
      if (!accId || accId === 'local') continue
      http.broadcastAccount(accId, type, payload)
    }
  }

  private broadcastActivities(channelId: string, workspaceId: string) {
    const ch = this.db().prepare(`SELECT access_mode FROM channels WHERE id = ?`).get(channelId) as { access_mode?: string } | undefined
    const accounts = this.channelHumanAccountIds(channelId, workspaceId, ch?.access_mode === 'workspace')
    const http = this.ctx.http
    if (!http) return
    const hasRealAccounts = accounts.some((id) => id && id !== 'local')
    if (!hasRealAccounts) {
      http.broadcast('channel/agent-status', { channelId, activities: this.listActivities(channelId, 'local') }, workspaceId, '')
      return
    }
    for (const accId of new Set(accounts)) {
      if (!accId || accId === 'local') continue
      try {
        const activities = this.listActivities(channelId, accId)
        http.broadcastAccount(accId, 'channel/agent-status', { channelId, activities })
      } catch {
        /* ignore */
      }
    }
  }
}

export function registerChannelRoutes(ctx: Context, resolveLlm: (sessionId?: string | null) => LlmConfig): ChannelService {
  const resolveLlmClient: ChannelLlmResolver = (agentId, ownerAccountId, invokerAccountId) => {
    const readCfg = (accId: string) =>
      accId ? runWithAccount(accId, () => resolveLlm(agentId)) : resolveLlm(agentId)
    let cfg = readCfg(ownerAccountId)
    if (!cfg.apiKey && invokerAccountId && invokerAccountId !== ownerAccountId) {
      const invCfg = readCfg(invokerAccountId)
      if (invCfg.apiKey) cfg = invCfg
    }
    const llmService = ctx.get('llm') as { forConfig?: (config: LlmConfig) => LlmClient } | undefined
    if (cfg.apiKey && llmService?.forConfig) {
      return llmService.forConfig(cfg)
    }
    return {
      chat: async (messages: LlmMessage[], _tools?: unknown[], _signal?: AbortSignal, options?: { onDelta?: (t: string) => unknown }) => {
        const last = [...messages].reverse().find((item) => item.role === 'user')?.content
        const preview = typeof last === 'string' ? last : ''
        const text = `未配置 API Key，本地回声：${preview}`
        await options?.onDelta?.(text)
        return { content: text, toolCalls: [] }
      },
    }
  }

  const service = new ChannelService(ctx, resolveLlmClient)
  ctx.effect(() => () => service.dispose(), 'core-chat.channels')

  const sendError = (route: { send: (status: number, body: unknown) => void }, error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error)
    const status = msg.includes('unknown channel') || msg.includes('unknown run')
      ? 404
      : msg.includes('permission denied')
        ? 403
        : 400
    route.send(status, { error: msg })
  }

  ctx.http.route('GET', '/api/channels', (route) => {
    try {
      route.send(200, { channels: service.listChannels() })
    } catch (error) {
      sendError(route, error)
    }
  })

  ctx.http.route('POST', '/api/channels', async (route) => {
    try {
      const body = (await route.json()) as {
        name?: string
        topic?: string
        accessMode?: ChannelAccessMode
        memberAccountIds?: string[]
        agentIds?: string[]
      }
      route.send(200, service.createChannel({
        name: body?.name ?? '',
        topic: body?.topic,
        accessMode: body?.accessMode,
        memberAccountIds: body?.memberAccountIds,
        agentIds: body?.agentIds,
      }))
    } catch (error) {
      sendError(route, error)
    }
  })

  ctx.http.route('POST', '/api/channels/dm', async (route) => {
    try {
      const body = (await route.json()) as { targetAccountId?: string }
      route.send(200, service.openOrCreateDm(body?.targetAccountId ?? ''))
    } catch (error) {
      sendError(route, error)
    }
  })

  ctx.http.route('GET', '/api/channels/:id', (route) => {
    try {
      const limit = Number(route.query?.get('limit') ?? 100)
      route.send(200, service.getChannelDetail(route.params.id, Number.isFinite(limit) ? limit : 100))
    } catch (error) {
      sendError(route, error)
    }
  })

  ctx.http.route('PATCH', '/api/channels/:id', async (route) => {
    try {
      const body = (await route.json()) as { name?: string; topic?: string; accessMode?: ChannelAccessMode }
      route.send(200, { channel: service.updateChannel(route.params.id, body ?? {}) })
    } catch (error) {
      sendError(route, error)
    }
  })

  ctx.http.route('POST', '/api/channels/:id/auto-name', async (route) => {
    try {
      const channel = await service.autoNameChannel(route.params.id)
      route.send(200, { channel })
    } catch (error) {
      sendError(route, error)
    }
  })

  ctx.http.route('DELETE', '/api/channels/:id', (route) => {
    try {
      route.send(200, service.deleteChannel(route.params.id))
    } catch (error) {
      sendError(route, error)
    }
  })

  ctx.http.route('POST', '/api/channels/:id/members', async (route) => {
    try {
      const body = (await route.json()) as { memberType?: ChannelMemberType; memberId?: string }
      const memberType: ChannelMemberType = body?.memberType === 'agent' ? 'agent' : 'account'
      route.send(200, { members: service.addMember(route.params.id, memberType, body?.memberId ?? '') })
    } catch (error) {
      sendError(route, error)
    }
  })

  ctx.http.route('DELETE', '/api/channels/:id/members/:type/:memberId', (route) => {
    try {
      const memberType: ChannelMemberType = route.params.type === 'agent' ? 'agent' : 'account'
      route.send(200, { members: service.removeMember(route.params.id, memberType, decodeURIComponent(route.params.memberId)) })
    } catch (error) {
      sendError(route, error)
    }
  })

  ctx.http.route('GET', '/api/channels/:id/messages', (route) => {
    try {
      const limit = Number(route.query?.get('limit') ?? 100)
      route.send(200, { messages: service.listMessages(route.params.id, undefined, Number.isFinite(limit) ? limit : 100) })
    } catch (error) {
      sendError(route, error)
    }
  })

  ctx.http.route('POST', '/api/channels/:id/messages', async (route) => {
    try {
      const body = (await route.json()) as { text?: string; replyToId?: string; mentions?: ChannelMention[] }
      route.send(200, service.sendMessage(route.params.id, {
        text: body?.text ?? '',
        replyToId: body?.replyToId,
        mentions: body?.mentions,
      }))
    } catch (error) {
      sendError(route, error)
    }
  })

  ctx.http.route('GET', '/api/channels/:id/runs/:runId', (route) => {
    try {
      route.send(200, { run: service.getRunDetail(route.params.id, route.params.runId) })
    } catch (error) {
      sendError(route, error)
    }
  })

  ctx.http.route('POST', '/api/channels/:id/runs/:runId/cancel', (route) => {
    try {
      route.send(200, service.cancelRun(route.params.id, route.params.runId))
    } catch (error) {
      sendError(route, error)
    }
  })

  return service
}
