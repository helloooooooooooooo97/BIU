import { currentActorContext } from '@biu/host-plugin-loader/data-dir'
import { currentSessionId } from '@biu/host-sessions/scope'
import { recordBuiltinValues, type CollectionSpec, type DbRecord } from '@biu/type-file-system'
import type {
  ChannelDetailPayload,
  ChannelMention,
  ChannelMessageView,
  ChannelSummary,
} from '../shared/channel-types.ts'
import type { ChannelService } from './channels.ts'

function resolveCurrentAgentId(): string | undefined {
  const fromSession = currentSessionId()?.trim()
  if (fromSession) return fromSession
  const actor = currentActorContext()
  if (actor?.type === 'agent' && actor.actorId?.trim()) return actor.actorId.trim()
  return undefined
}

function formatMessageTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return ''
  try {
    return new Date(ts).toISOString().slice(0, 16).replace('T', ' ')
  } catch {
    return ''
  }
}

function formatChannelContent(detail: ChannelDetailPayload): string {
  const { channel, members, messages } = detail
  const lines: string[] = []
  const kindLabel = channel.kind === 'dm' ? '私聊' : '群聊'
  lines.push(`# ${channel.name}（${kindLabel}）`)
  if (channel.topic) lines.push(`> 主题：${channel.topic}`)

  const humans = members.filter((m) => m.memberType === 'account').map((m) => m.name)
  const agents = members.filter((m) => m.memberType === 'agent').map((m) => `@${m.name}`)
  const memberParts: string[] = []
  if (humans.length) memberParts.push(`成员：${humans.join('、')}`)
  if (agents.length) memberParts.push(`Agent：${agents.join('、')}`)
  if (memberParts.length) lines.push(memberParts.join(' · '))
  lines.push('')

  if (messages.length === 0) {
    lines.push('（暂无聊天消息）')
    return lines.join('\n')
  }

  lines.push(`## 最近消息（共 ${messages.length} 条${detail.hasMoreMessages ? '，可用 action=messages 翻更早记录' : ''}）`)
  lines.push('')
  for (const msg of messages) {
    if (msg.deletedAt) {
      lines.push(`- [#${msg.seq} | id=${msg.id} | ${formatMessageTime(msg.createdAt)}] ${msg.senderName}：（已撤回）`)
      continue
    }
    const viaTag = msg.viaAgentName ? `（由 Agent ${msg.viaAgentName} 代发）` : ''
    const agentTag = msg.senderType === 'agent' ? ' [Agent]' : ''
    const replyTag = msg.replyPreview ? ` ↩ 回复 ${msg.replyPreview.senderName}` : ''
    const threadTag = msg.threadSummary?.replyCount ? ` [话题 ${msg.threadSummary.replyCount} 条回复]` : ''
    const attachTag =
      msg.attachments && msg.attachments.length > 0
        ? ` [附件: ${msg.attachments.map((a) => a.name).join(', ')}]`
        : ''
    const body = msg.text.replace(/\r?\n/g, ' ↵ ').trim() || (attachTag ? '' : '（空）')
    lines.push(
      `- [#${msg.seq} | id=${msg.id} | ${formatMessageTime(msg.createdAt)}] **${msg.senderName}${agentTag}${viaTag}**${replyTag}${threadTag}: ${body}${attachTag}`,
    )
  }
  return lines.join('\n')
}

function summaryToRecord(ch: ChannelSummary, content?: string): DbRecord {
  return {
    id: ch.id,
    title: ch.name,
    kind: ch.kind,
    topic: ch.topic ?? '',
    accessMode: ch.accessMode,
    peerAccountId: ch.peerAccountId ?? '',
    peerName: ch.peerName ?? '',
    memberCount: ch.memberCount,
    agentCount: ch.agentCount,
    unreadCount: ch.unreadCount ?? 0,
    mentionCount: ch.mentionCount ?? 0,
    lastMessageText: ch.lastMessageText ?? '',
    lastMessageAt: ch.lastMessageAt ?? 0,
    ...(content !== undefined ? { content } : {}),
    ...recordBuiltinValues({
      createdAt: ch.createdAt,
      updatedAt: ch.updatedAt,
    }),
  }
}

function normalizeMentionsArg(raw: unknown): ChannelMention[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: ChannelMention[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const kind = rec.kind === 'everyone' || rec.kind === 'agent' || rec.kind === 'account' ? rec.kind : null
    const id = String(rec.id ?? '').trim()
    const label = String(rec.label ?? '').trim()
    if (kind && id && label) out.push({ kind, id, label })
  }
  return out.length > 0 ? out : undefined
}

function compactMessage(msg: ChannelMessageView) {
  return {
    id: msg.id,
    seq: msg.seq,
    senderType: msg.senderType,
    senderId: msg.senderId,
    senderName: msg.senderName,
    ...(msg.viaAgentId ? { viaAgentId: msg.viaAgentId, viaAgentName: msg.viaAgentName } : {}),
    text: msg.deletedAt ? '（已撤回）' : msg.text,
    ...(msg.replyToId ? { replyToId: msg.replyToId } : {}),
    ...(msg.threadRootId ? { threadRootId: msg.threadRootId } : {}),
    ...(msg.attachments?.length ? { attachments: msg.attachments.map((a) => ({ id: a.id, name: a.name, kind: a.kind })) } : {}),
    createdAt: msg.createdAt,
  }
}

/** 将群聊与私聊注册进 BIU 文件系统（/channels），供 Agent 通过 db_list / db_read / db_action 读上下文并代发消息。 */
export function channelsCollection(service: ChannelService): CollectionSpec {
  return {
    id: 'channels',
    path: '/channels',
    label: '聊天',
    view: {
      moduleId: 'channels',
      route: '/db-channels',
      title: '聊天',
      inspector: false,
      sidebar: false,
      icon: 'chat-bubble-left-right',
      blurb:
        '群聊与私聊频道。列表 db_list /channels；读频道成员与近期聊天记录 db_read /channels/<id> include_content=true；替当前用户在群聊或私聊发消息用 db_action /channels/<id> action=send args={text, replyToId?, threadRootId?}（消息同时署名用户与当前 Agent；auto 模式下可直接发送，hold 模式下需用户审批）；翻更多历史消息用 action=messages；搜索历史消息用 action=search；标记已读用 action=mark-read。',
      order: 19,
    },
    records: { create: false, update: false, delete: false },
    schema: {
      contentBackend: 'computed',
      columns: ['title', 'kind', 'memberCount', 'agentCount', 'unreadCount', 'lastMessageText', 'updatedAt'],
      fields: {
        title: { type: 'string', label: '聊天名称' },
        kind: { type: 'select', label: '类型', enum: ['channel', 'dm'] },
        topic: { type: 'string', label: '主题' },
        accessMode: { type: 'select', label: '可见性', enum: ['private', 'workspace'] },
        peerName: { type: 'string', label: '私聊对象' },
        memberCount: { type: 'number', label: '成员数' },
        agentCount: { type: 'number', label: 'Agent 数' },
        unreadCount: { type: 'number', label: '未读数' },
        mentionCount: { type: 'number', label: '@未读' },
        lastMessageText: { type: 'string', label: '最近消息' },
        lastMessageAt: { type: 'number', label: '最近活跃' },
        content: { type: 'string', label: '近期聊天记录' },
      },
    },
    list: async () => service.listChannels().map((ch) => summaryToRecord(ch)),
    get: async (id) => {
      try {
        const detail = service.getChannelDetail(id, 40)
        return summaryToRecord(detail.channel, formatChannelContent(detail))
      } catch {
        return null
      }
    },
    actions: [
      {
        id: 'send',
        label: '发送消息',
        for: 'agent',
        placement: [],
        requiredAction: 'resource:update',
        description:
          '替当前用户在指定群聊或私聊中发送消息，发送后界面会同时显示用户与当前 Agent。auto 模式下可直接发，hold 模式下需用户确认。',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '必填，要发送的消息正文（支持 Markdown 与 @提及）' },
            replyToId: { type: 'string', description: '可选，引用回复的消息 id' },
            threadRootId: { type: 'string', description: '可选，讨论串（Thread）根消息 id' },
            mentions: {
              type: 'array',
              description: '可选，显式提及列表 [{ kind: "account"|"agent"|"everyone", id, label }]',
              items: { type: 'object' },
            },
          },
          required: ['text'],
        },
        run: async (id, _record, args) => {
          const text = String(args?.text ?? '').trim()
          if (!text) throw new Error('消息内容不能为空')
          const replyToId = String(args?.replyToId ?? '').trim() || undefined
          const threadRootId = String(args?.threadRootId ?? '').trim() || undefined
          const mentions = normalizeMentionsArg(args?.mentions)
          const viaAgentId = resolveCurrentAgentId()
          const res = service.sendMessage(id, {
            text,
            ...(replyToId ? { replyToId } : {}),
            ...(threadRootId ? { threadRootId } : {}),
            ...(mentions ? { mentions } : {}),
            ...(viaAgentId ? { viaAgentId, suppressAgentTrigger: true } : {}),
          })
          return {
            ok: true,
            channelId: id,
            messageId: res.message.id,
            seq: res.message.seq,
            senderName: res.message.senderName,
            ...(res.message.viaAgentId
              ? { viaAgentId: res.message.viaAgentId, viaAgentName: res.message.viaAgentName }
              : {}),
            text: res.message.text,
          }
        },
      },
      {
        id: 'messages',
        label: '读取消息',
        for: 'agent',
        placement: [],
        requiredAction: 'resource:read',
        description: '按条数或游标 beforeSeq 读取该群聊/私聊的更多历史消息。',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: '返回条数，默认 30，最大 100' },
            beforeSeq: { type: 'number', description: '可选，仅返回 seq 小于该值的更早消息' },
          },
        },
        run: async (id, _record, args) => {
          const limit = Math.min(100, Math.max(1, Number(args?.limit) || 30))
          const beforeSeq = args?.beforeSeq != null && Number.isFinite(Number(args.beforeSeq)) ? Number(args.beforeSeq) : undefined
          const page = service.listMessagesPage(id, undefined, limit, beforeSeq)
          return {
            ok: true,
            channelId: id,
            hasMore: page.hasMore,
            messages: page.messages.map(compactMessage),
          }
        },
      },
      {
        id: 'search',
        label: '搜索消息',
        for: 'agent',
        placement: [],
        requiredAction: 'resource:read',
        description: '在当前频道的历史消息中按关键词搜索。',
        parameters: {
          type: 'object',
          properties: {
            q: { type: 'string', description: '必填，搜索关键词' },
            limit: { type: 'number', description: '最多返回条数，默认 20，最大 50' },
          },
          required: ['q'],
        },
        run: async (id, _record, args) => {
          const q = String(args?.q ?? '').trim()
          if (!q) throw new Error('搜索关键词不能为空')
          const limit = Math.min(50, Math.max(1, Number(args?.limit) || 20))
          const hits = service.searchMessages({ channelId: id, q, limit })
          return {
            ok: true,
            channelId: id,
            total: hits.length,
            hits: hits.map((h) => ({
              id: h.id,
              seq: h.seq,
              senderName: h.senderName,
              text: h.text,
              createdAt: h.createdAt,
            })),
          }
        },
      },
      {
        id: 'mark-read',
        label: '标记已读',
        for: 'agent',
        placement: [],
        requiredAction: 'resource:update',
        description: '将该频道的最新消息标记为已读。',
        run: async (id) => {
          const detail = service.getChannelDetail(id, 1)
          const latestSeq = detail.messages.at(-1)?.seq ?? 0
          return service.markRead(id, latestSeq)
        },
      },
    ],
  }
}
