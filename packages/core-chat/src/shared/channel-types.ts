import type { SessionMascot } from '@biu/type-session'

export type ChannelKind = 'channel' | 'dm'

/** 按「人类成员优先在前，其次 Agent」拼接默认聊天名称。 */
export function buildDefaultChannelName(
  humanNames: string[],
  agentNames: string[],
  maxNames = 4,
): string {
  const dedupe = (items: string[]) => {
    const out: string[] = []
    const seen = new Set<string>()
    for (const raw of items) {
      const clean = String(raw ?? '').trim()
      if (!clean || seen.has(clean)) continue
      seen.add(clean)
      out.push(clean)
    }
    return out
  }
  const ordered = [...dedupe(humanNames), ...dedupe(agentNames)]
  if (ordered.length === 0) return '新聊天'
  const head = ordered.slice(0, maxNames).join('、')
  const suffix = ordered.length > maxNames ? ` 等${ordered.length}位` : ''
  const joined = `${head}${suffix}`
  return joined.length > 48 ? `${joined.slice(0, 47)}…` : joined
}
export type ChannelAccessMode = 'private' | 'workspace'
export type ChannelMemberType = 'account' | 'agent'
export type ChannelMemberRole = 'owner' | 'admin' | 'member'
export type ChannelSenderType = 'account' | 'agent' | 'system'
/** 群内 Agent 上下文模式：summary=单向只读投影主工作台项目与近期摘要；isolated=仅看当前群聊 */
export type ChannelAgentContextMode = 'summary' | 'isolated'

export interface ChannelMention {
  kind: 'account' | 'agent' | 'everyone'
  id: string
  label: string
}

export interface ChannelSummary {
  id: string
  workspaceId: string
  kind: ChannelKind
  dmKey: string
  /** DM 场景下对方的 accountId / 名称 / 头像，便于侧栏与标题栏直出 */
  peerAccountId?: string
  peerName?: string
  peerAvatar?: string
  name: string
  topic: string
  accessMode: ChannelAccessMode
  createdBy: string
  createdAt: number
  updatedAt: number
  memberCount: number
  agentCount: number
  lastMessageAt: number
  lastMessageText: string
}

export interface ChannelMemberView {
  channelId: string
  memberType: ChannelMemberType
  memberId: string
  role: ChannelMemberRole
  addedBy: string
  addedAt: number
  name: string
  avatar?: string
  mascot?: SessionMascot
  ownerAccountId?: string
  ownerName?: string
  systemPrompt?: string
  model?: string
  contextMode?: ChannelAgentContextMode
  projectName?: string
  isOwn?: boolean
}

export interface ChannelMessageMeta {
  kind?: 'approval' | 'denied' | 'info'
  approvalId?: string
  toolName?: string
  args?: Record<string, unknown>
  status?: 'pending' | 'allowed' | 'denied'
  runId?: string
  agentId?: string
  invokerId?: string
  invokerName?: string
}

export interface ChannelMessageReplyPreview {
  id: string
  senderType: ChannelSenderType
  senderId: string
  senderName: string
  text: string
}

export interface ChannelMessageView {
  id: string
  channelId: string
  seq: number
  senderType: ChannelSenderType
  senderId: string
  senderName: string
  senderAvatar?: string
  senderMascot?: SessionMascot
  replyToId: string
  replyPreview?: ChannelMessageReplyPreview | null
  text: string
  mentions: ChannelMention[]
  traceId: string
  ephemeralTo: string
  meta?: ChannelMessageMeta
  createdAt: number
}

export type ChannelRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'done'
  | 'failed'
  | 'cancelled'

export interface ChannelRunEvent {
  ts: number
  kind: 'status' | 'thinking' | 'delta' | 'tool_call' | 'tool_result' | 'approval' | 'done' | 'error' | 'cancelled'
  text?: string
  step?: number
  callId?: string
  toolName?: string
  args?: Record<string, unknown>
  ok?: boolean
  detail?: string
  approvalId?: string
}

export interface ChannelAgentActivity {
  runId: string
  channelId: string
  agentId: string
  agentName: string
  agentMascot?: SessionMascot
  agentOwnerId: string
  agentOwnerName: string
  invokerId: string
  invokerName: string
  originMessageId: string
  status: ChannelRunStatus
  queueCount: number
  stepLabel: string
  canCancel: boolean
}

export interface ChannelRunDetail {
  id: string
  channelId: string
  agentId: string
  agentName: string
  agentMascot?: SessionMascot
  agentOwnerId: string
  agentOwnerName: string
  invokerId: string
  invokerName: string
  originMessageId: string
  replyMessageId: string
  status: ChannelRunStatus
  viewerRole: 'owner' | 'invoker' | 'member'
  canCancel: boolean
  events: ChannelRunEvent[]
  error: string
  createdAt: number
  finishedAt: number
}

export interface ChannelDetailPayload {
  channel: ChannelSummary
  members: ChannelMemberView[]
  messages: ChannelMessageView[]
  activities: ChannelAgentActivity[]
  myAccountId: string
  canManageMembers: boolean
}
