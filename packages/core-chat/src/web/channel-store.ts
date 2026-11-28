import { apiFetch } from '@biu/biu-ui/api-client'
import { onAppEvents } from '@biu/biu-ui/app-events'
import { useSyncExternalStore } from 'react'
import type {
  ChannelAccessMode,
  ChannelAgentActivity,
  ChannelAgentContextMode,
  ChannelAttachment,
  ChannelDetailPayload,
  ChannelMemberType,
  ChannelMemberView,
  ChannelMention,
  ChannelMessageView,
  ChannelReactionSummary,
  ChannelRunDetail,
  ChannelRunEvent,
  ChannelSavedMessageView,
  ChannelSearchHit,
  ChannelSidebarThreadItem,
  ChannelSummary,
  ChannelThreadPayload,
  ChannelWebhookView,
} from '../shared/channel-types.ts'

export type ChannelTypingUser = {
  accountId: string
  accountName: string
  ts: number
}

export type ChannelStoreState = {
  channels: ChannelSummary[]
  loaded: boolean
  activeChannelId: string | null
  details: Record<string, ChannelDetailPayload>
  threads: Record<string, ChannelThreadPayload>
  inspected: { channelId: string; runId: string } | null
  runs: Record<string, ChannelRunDetail>
  typingByChannel: Record<string, ChannelTypingUser[]>
}

let state: ChannelStoreState = {
  channels: [],
  loaded: false,
  activeChannelId: null,
  details: {},
  threads: {},
  inspected: null,
  runs: {},
  typingByChannel: {},
}

const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

function setState(updater: (prev: ChannelStoreState) => ChannelStoreState) {
  const next = updater(state)
  if (next === state) return
  state = next
  emit()
}

export function getChannelStoreState(): ChannelStoreState {
  return state
}

export function subscribeChannelStore(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useChannelStore<T>(selector: (s: ChannelStoreState) => T): T {
  return useSyncExternalStore(
    subscribeChannelStore,
    () => selector(state),
    () => selector(state),
  )
}

export function resetChannelStore() {
  state = {
    channels: [],
    loaded: false,
    activeChannelId: null,
    details: {},
    threads: {},
    inspected: null,
    runs: {},
    typingByChannel: {},
  }
  emit()
}

export function setActiveChannelId(channelId: string | null) {
  setState((prev) => (prev.activeChannelId === channelId ? prev : { ...prev, activeChannelId: channelId }))
}

function sortChannels(channels: ChannelSummary[]): ChannelSummary[] {
  return [...channels].sort(
    (a, b) =>
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      b.lastMessageAt - a.lastMessageAt ||
      b.updatedAt - a.updatedAt,
  )
}

function formatSidebarThreadTitle(msg: Pick<ChannelMessageView, 'text' | 'attachments'>): string {
  const cleanLine = String(msg.text ?? '')
    .replace(/[#>*`[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleanLine) {
    return cleanLine.length > 28 ? `${cleanLine.slice(0, 28)}…` : cleanLine
  }
  const firstAtt = msg.attachments?.[0]
  if (firstAtt?.name) return `[附件] ${firstAtt.name.slice(0, 20)}`
  return '讨论串'
}

function deriveSidebarThreadsFromMessages(messages: ChannelMessageView[]): ChannelSidebarThreadItem[] {
  const items: ChannelSidebarThreadItem[] = []
  for (const m of messages) {
    if (m.deletedAt || m.ephemeralTo || !m.threadSummary || m.threadSummary.replyCount <= 0) continue
    if (m.threadSummary.following === false) continue
    items.push({
      rootId: m.id,
      title: formatSidebarThreadTitle(m),
      replyCount: m.threadSummary.replyCount,
      lastReplyAt: m.threadSummary.lastReplyAt || m.createdAt,
    })
  }
  return items.sort((a, b) => b.lastReplyAt - a.lastReplyAt).slice(0, 12)
}

export async function loadChannels(): Promise<ChannelSummary[]> {
  try {
    const res = await apiFetch('/api/channels')
    if (!res.ok) return state.channels
    const body = (await res.json()) as { channels?: ChannelSummary[] }
    const rawChannels = Array.isArray(body.channels) ? body.channels : []
    setState((prev) => {
      const channels = rawChannels.map((ch) => {
        if (ch.threads?.length) return ch
        const detailMsgs = prev.details[ch.id]?.messages
        if (!detailMsgs?.length) return ch
        const derived = deriveSidebarThreadsFromMessages(detailMsgs)
        return derived.length ? { ...ch, threads: derived } : ch
      })
      return { ...prev, channels, loaded: true }
    })
    return state.channels
  } catch {
    return state.channels
  }
}

export async function loadChannelWebhooks(channelId: string): Promise<ChannelWebhookView[]> {
  if (!channelId) return []
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/webhooks`)
  const body = (await res.json()) as { webhooks?: ChannelWebhookView[]; error?: string }
  if (!res.ok) throw new Error(body.error || '加载 Webhook 失败')
  return Array.isArray(body.webhooks) ? body.webhooks : []
}

export async function createChannelWebhook(
  channelId: string,
  input: { name: string; autoTriggerAgentId?: string },
): Promise<ChannelWebhookView> {
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/webhooks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = (await res.json()) as { webhook?: ChannelWebhookView; error?: string }
  if (!res.ok || !body.webhook) throw new Error(body.error || '创建 Webhook 失败')
  return body.webhook
}

export async function updateChannelWebhook(
  channelId: string,
  webhookId: string,
  patch: { name?: string; enabled?: boolean; autoTriggerAgentId?: string },
): Promise<ChannelWebhookView> {
  const res = await apiFetch(
    `/api/channels/${encodeURIComponent(channelId)}/webhooks/${encodeURIComponent(webhookId)}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    },
  )
  const body = (await res.json()) as { webhook?: ChannelWebhookView; error?: string }
  if (!res.ok || !body.webhook) throw new Error(body.error || '更新 Webhook 失败')
  return body.webhook
}

export async function rotateChannelWebhook(
  channelId: string,
  webhookId: string,
): Promise<ChannelWebhookView> {
  const res = await apiFetch(
    `/api/channels/${encodeURIComponent(channelId)}/webhooks/${encodeURIComponent(webhookId)}/rotate`,
    { method: 'POST' },
  )
  const body = (await res.json()) as { webhook?: ChannelWebhookView; error?: string }
  if (!res.ok || !body.webhook) throw new Error(body.error || '重置密钥失败')
  return body.webhook
}

export async function testChannelWebhook(
  channelId: string,
  webhookId: string,
): Promise<{ message: ChannelMessageView; triggeredRunIds: string[] }> {
  const res = await apiFetch(
    `/api/channels/${encodeURIComponent(channelId)}/webhooks/${encodeURIComponent(webhookId)}/test`,
    { method: 'POST' },
  )
  const body = (await res.json()) as { message?: ChannelMessageView; triggeredRunIds?: string[]; error?: string }
  if (!res.ok || !body.message) throw new Error(body.error || '发送测试消息失败')
  return { message: body.message, triggeredRunIds: body.triggeredRunIds ?? [] }
}

export async function deleteChannelWebhook(channelId: string, webhookId: string): Promise<void> {
  const res = await apiFetch(
    `/api/channels/${encodeURIComponent(channelId)}/webhooks/${encodeURIComponent(webhookId)}`,
    { method: 'DELETE' },
  )
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || '删除 Webhook 失败')
}

export async function loadChannelDetail(channelId: string): Promise<ChannelDetailPayload | null> {
  if (!channelId) return null
  try {
    const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}`)
    if (!res.ok) return null
    const detail = (await res.json()) as ChannelDetailPayload
    const derivedThreads =
      detail.channel.threads !== undefined
        ? detail.channel.threads
        : deriveSidebarThreadsFromMessages(detail.messages ?? [])
    const hydratedChannel: ChannelSummary = derivedThreads.length
      ? { ...detail.channel, threads: derivedThreads }
      : detail.channel
    const hydratedDetail: ChannelDetailPayload = { ...detail, channel: hydratedChannel }
    setState((prev) => {
      const exists = prev.channels.some((c) => c.id === hydratedChannel.id)
      const channels = hydratedChannel.hidden
        ? prev.channels.filter((c) => c.id !== hydratedChannel.id)
        : exists
          ? prev.channels.map((c) => (c.id === hydratedChannel.id ? hydratedChannel : c))
          : [hydratedChannel, ...prev.channels]
      return {
        ...prev,
        channels,
        details: { ...prev.details, [channelId]: hydratedDetail },
      }
    })
    return hydratedDetail
  } catch {
    return null
  }
}

export async function createChannel(input: {
  name?: string
  topic?: string
  accessMode?: ChannelAccessMode
  memberAccountIds?: string[]
  agentIds?: string[]
  agentContextMode?: ChannelAgentContextMode
}): Promise<ChannelDetailPayload> {
  const res = await apiFetch('/api/channels', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = (await res.json()) as ChannelDetailPayload & { error?: string }
  if (!res.ok) throw new Error(body.error || '创建聊天失败')
  setState((prev) => ({
    ...prev,
    channels: [body.channel, ...prev.channels.filter((c) => c.id !== body.channel.id)],
    details: { ...prev.details, [body.channel.id]: body },
  }))
  return body
}

function applyChannelSummaryUpdate(channel: ChannelSummary) {
  setState((prev) => {
    const exists = prev.channels.some((c) => c.id === channel.id)
    const channels = exists
      ? prev.channels.map((c) => (c.id === channel.id ? channel : c))
      : [channel, ...prev.channels]
    const prevDetail = prev.details[channel.id]
    return {
      ...prev,
      channels,
      details: prevDetail
        ? { ...prev.details, [channel.id]: { ...prevDetail, channel } }
        : prev.details,
    }
  })
}

export async function renameChannel(channelId: string, name: string): Promise<ChannelSummary> {
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const body = (await res.json()) as { channel?: ChannelSummary; error?: string }
  if (!res.ok || !body.channel) throw new Error(body.error || '重命名失败')
  applyChannelSummaryUpdate(body.channel)
  return body.channel
}

export async function autoNameChannel(channelId: string): Promise<ChannelSummary> {
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/auto-name`, {
    method: 'POST',
  })
  const body = (await res.json()) as { channel?: ChannelSummary; error?: string }
  if (!res.ok || !body.channel) throw new Error(body.error || '自动命名失败')
  applyChannelSummaryUpdate(body.channel)
  return body.channel
}

export async function openOrCreateDm(targetAccountId: string): Promise<ChannelDetailPayload> {
  const res = await apiFetch('/api/channels/dm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ targetAccountId }),
  })
  const body = (await res.json()) as ChannelDetailPayload & { error?: string }
  if (!res.ok) throw new Error(body.error || '发起私聊失败')
  setState((prev) => ({
    ...prev,
    channels: [body.channel, ...prev.channels.filter((c) => c.id !== body.channel.id)],
    details: { ...prev.details, [body.channel.id]: body },
  }))
  return body
}

export async function deleteChannel(channelId: string): Promise<void> {
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || '解散群聊失败')
  }
  setState((prev) => {
    const nextDetails = { ...prev.details }
    delete nextDetails[channelId]
    return {
      ...prev,
      channels: prev.channels.filter((c) => c.id !== channelId),
      details: nextDetails,
      inspected: prev.inspected?.channelId === channelId ? null : prev.inspected,
    }
  })
}

export async function addChannelMember(
  channelId: string,
  memberType: ChannelMemberType,
  memberId: string,
  contextMode?: ChannelAgentContextMode,
): Promise<ChannelMemberView[]> {
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/members`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ memberType, memberId, ...(contextMode ? { contextMode } : {}) }),
  })
  const body = (await res.json()) as { members?: ChannelMemberView[]; error?: string }
  if (!res.ok) throw new Error(body.error || '添加失败')
  const members = body.members ?? []
  setState((prev) => {
    const detail = prev.details[channelId]
    if (!detail) return prev
    return {
      ...prev,
      details: { ...prev.details, [channelId]: { ...detail, members } },
    }
  })
  return members
}

export async function updateChannelAgentContextMode(
  channelId: string,
  agentId: string,
  contextMode: ChannelAgentContextMode,
): Promise<ChannelMemberView[]> {
  const res = await apiFetch(
    `/api/channels/${encodeURIComponent(channelId)}/members/agent/${encodeURIComponent(agentId)}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contextMode }),
    },
  )
  const body = (await res.json()) as { members?: ChannelMemberView[]; error?: string }
  if (!res.ok) throw new Error(body.error || '更新上下文模式失败')
  const members = body.members ?? []
  setState((prev) => {
    const detail = prev.details[channelId]
    if (!detail) return prev
    return {
      ...prev,
      details: { ...prev.details, [channelId]: { ...detail, members } },
    }
  })
  return members
}

export async function syncChannelToAgent(
  channelId: string,
  agentId: string,
  messageId?: string,
): Promise<{ ok: true; agentId: string; syncedText: string }> {
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/sync-to-agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agentId, ...(messageId ? { messageId } : {}) }),
  })
  const body = (await res.json()) as { ok?: true; agentId?: string; syncedText?: string; error?: string }
  if (!res.ok || !body.ok) throw new Error(body.error || '同步到代理失败')
  return { ok: true, agentId: body.agentId ?? agentId, syncedText: body.syncedText ?? '' }
}

export async function removeChannelMember(
  channelId: string,
  memberType: ChannelMemberType,
  memberId: string,
): Promise<ChannelMemberView[]> {
  const res = await apiFetch(
    `/api/channels/${encodeURIComponent(channelId)}/members/${memberType}/${encodeURIComponent(memberId)}`,
    { method: 'DELETE' },
  )
  const body = (await res.json()) as { members?: ChannelMemberView[]; error?: string }
  if (!res.ok) throw new Error(body.error || '移除失败')
  const members = body.members ?? []
  setState((prev) => {
    const detail = prev.details[channelId]
    if (!detail) return prev
    return {
      ...prev,
      details: { ...prev.details, [channelId]: { ...detail, members } },
    }
  })
  return members
}

export async function sendChannelMessage(
  channelId: string,
  input: {
    text: string
    replyToId?: string
    threadRootId?: string
    mentions?: ChannelMention[]
    attachments?: ChannelAttachment[]
  },
): Promise<{ message: ChannelMessageView; triggeredRunIds: string[] }> {
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = (await res.json()) as { message?: ChannelMessageView; triggeredRunIds?: string[]; error?: string }
  if (!res.ok || !body.message) throw new Error(body.error || '发送失败')
  upsertChannelMessage(body.message, true)
  return { message: body.message, triggeredRunIds: body.triggeredRunIds ?? [] }
}

export async function loadChannelThread(
  channelId: string,
  rootMsgId: string,
): Promise<ChannelThreadPayload | null> {
  if (!channelId || !rootMsgId) return null
  try {
    const res = await apiFetch(
      `/api/channels/${encodeURIComponent(channelId)}/threads/${encodeURIComponent(rootMsgId)}`,
    )
    if (!res.ok) return null
    const payload = (await res.json()) as ChannelThreadPayload
    if (!payload?.root?.id) return null
    setState((prev) => ({
      ...prev,
      threads: { ...prev.threads, [payload.root.id]: payload },
    }))
    return payload
  } catch {
    return null
  }
}

export async function setChannelThreadFollow(
  channelId: string,
  rootMsgId: string,
  follow: boolean,
): Promise<{ ok: true; channelId: string; rootId: string; following: boolean; channel?: ChannelSummary }> {
  const res = await apiFetch(
    `/api/channels/${encodeURIComponent(channelId)}/threads/${encodeURIComponent(rootMsgId)}/follow`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ follow }),
    },
  )
  const body = (await res.json().catch(() => ({}))) as {
    ok?: true
    channelId?: string
    rootId?: string
    following?: boolean
    channel?: ChannelSummary
    error?: string
  }
  if (!res.ok) throw new Error(body.error || (follow ? '关注讨论串失败' : '取消关注失败'))
  const effectiveRootId = body.rootId || rootMsgId
  const nextFollowing = typeof body.following === 'boolean' ? body.following : follow
  setState((prev) => {
    const nextChannels = body.channel
      ? prev.channels.map((c) => (c.id === channelId ? body.channel! : c))
      : prev.channels.map((c) => {
          if (c.id !== channelId) return c
          const curThreads = c.threads ?? []
          if (!nextFollowing) {
            return { ...c, threads: curThreads.filter((t) => t.rootId !== effectiveRootId) }
          }
          if (curThreads.some((t) => t.rootId === effectiveRootId)) return c
          const tData = prev.threads[effectiveRootId]
          const rootMsg = tData?.root ?? prev.details[channelId]?.messages.find((m) => m.id === effectiveRootId)
          const replyCount = tData?.replies.filter((r) => !r.deletedAt).length ?? rootMsg?.threadSummary?.replyCount ?? 0
          if (replyCount <= 0) return c
          const item: ChannelSidebarThreadItem = {
            rootId: effectiveRootId,
            title: rootMsg ? formatSidebarThreadTitle(rootMsg) : '讨论串',
            replyCount,
            lastReplyAt: rootMsg?.threadSummary?.lastReplyAt ?? Date.now(),
          }
          return { ...c, threads: [item, ...curThreads].sort((a, b) => b.lastReplyAt - a.lastReplyAt).slice(0, 12) }
        })
    const existingThread = prev.threads[effectiveRootId]
    const nextThreads = existingThread
      ? {
          ...prev.threads,
          [effectiveRootId]: { ...existingThread, following: nextFollowing },
        }
      : prev.threads
    const detail = prev.details[channelId]
    const nextDetails = detail
      ? {
          ...prev.details,
          [channelId]: {
            ...detail,
            ...(body.channel ? { channel: body.channel } : {}),
            messages: detail.messages.map((m) =>
              m.id === effectiveRootId && m.threadSummary
                ? { ...m, threadSummary: { ...m.threadSummary, following: nextFollowing } }
                : m,
            ),
          },
        }
      : prev.details
    return {
      ...prev,
      channels: nextChannels,
      threads: nextThreads,
      details: nextDetails,
    }
  })
  return {
    ok: true,
    channelId,
    rootId: effectiveRootId,
    following: nextFollowing,
    ...(body.channel ? { channel: body.channel } : {}),
  }
}

export async function summarizeChannel(
  channelId: string,
  unreadOnly = false,
): Promise<{ summary: string; messageCount: number; scopeLabel: string }> {
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/summarize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ unreadOnly }),
  })
  const body = (await res.json()) as { summary?: string; messageCount?: number; scopeLabel?: string; error?: string }
  if (!res.ok) throw new Error(body.error || '总结聊天失败')
  return {
    summary: body.summary ?? '',
    messageCount: Number(body.messageCount ?? 0),
    scopeLabel: body.scopeLabel ?? '近期消息',
  }
}

export async function saveChannelContentAsPage(
  title: string,
  content: string,
): Promise<{ id: string; title: string }> {
  const cleanTitle = title.trim().slice(0, 80) || '聊天记录沉淀'
  const res = await apiFetch('/api/db/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      path: '/pages',
      records: [{ title: cleanTitle, content }],
      scope: 'workspace',
    }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    ids?: string[]
    items?: Array<{ id?: string; value?: { id?: string } }>
    error?: string
  }
  if (!res.ok) throw new Error(body.error || '保存为页面失败')
  const id =
    String(body.ids?.[0] ?? body.items?.[0]?.id ?? body.items?.[0]?.value?.id ?? '').trim()
  if (!id) throw new Error('保存为页面失败：未返回页面 ID')
  return { id, title: cleanTitle }
}

function defaultUploadName(file: File): string {
  const raw = (file.name || '').trim()
  if (raw) return raw
  const mime = (file.type || '').toLowerCase()
  if (mime === 'image/png') return 'image.png'
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'image.jpg'
  if (mime === 'image/gif') return 'image.gif'
  if (mime === 'image/webp') return 'image.webp'
  if (mime === 'image/svg+xml') return 'image.svg'
  return 'attachment.bin'
}

export async function uploadChannelAttachment(channelId: string, file: File): Promise<ChannelAttachment> {
  const name = encodeURIComponent(defaultUploadName(file))
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/uploads?name=${name}`, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  })
  const body = (await res.json().catch(() => ({}))) as { attachment?: ChannelAttachment; error?: string }
  if (!res.ok || !body.attachment) throw new Error(body.error || '上传附件失败')
  return body.attachment
}

export async function editChannelMessage(
  channelId: string,
  messageId: string,
  text: string,
): Promise<ChannelMessageView> {
  const res = await apiFetch(
    `/api/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    },
  )
  const body = (await res.json()) as { message?: ChannelMessageView; error?: string }
  if (!res.ok || !body.message) throw new Error(body.error || '编辑消息失败')
  upsertChannelMessage(body.message, true)
  return body.message
}

export async function recallChannelMessage(channelId: string, messageId: string): Promise<ChannelMessageView> {
  const res = await apiFetch(
    `/api/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
    { method: 'DELETE' },
  )
  const body = (await res.json()) as { message?: ChannelMessageView; error?: string }
  if (!res.ok || !body.message) throw new Error(body.error || '撤回消息失败')
  upsertChannelMessage(body.message, true)
  return body.message
}

export async function markChannelRead(channelId: string, seq?: number): Promise<void> {
  if (!channelId) return
  setState((prev) => {
    const nextChannels = prev.channels.map((c) =>
      c.id === channelId
        ? {
            ...c,
            unreadCount: 0,
            mentionCount: 0,
            lastReadSeq: typeof seq === 'number' ? Math.max(c.lastReadSeq ?? 0, seq) : c.lastReadSeq,
          }
        : c,
    )
    const detail = prev.details[channelId]
    return {
      ...prev,
      channels: nextChannels,
      ...(detail
        ? {
            details: {
              ...prev.details,
              [channelId]: {
                ...detail,
                channel: {
                  ...detail.channel,
                  unreadCount: 0,
                  mentionCount: 0,
                  lastReadSeq: typeof seq === 'number' ? Math.max(detail.channel.lastReadSeq ?? 0, seq) : detail.channel.lastReadSeq,
                },
              },
            },
          }
        : {}),
    }
  })
  try {
    await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(typeof seq === 'number' ? { seq } : {}),
    })
  } catch {
    /* ignore */
  }
}

export async function loadOlderChannelMessages(
  channelId: string,
  limit = 60,
): Promise<{ added: number; hasMore: boolean }> {
  const current = state.details[channelId]
  if (!current || current.messages.length === 0) return { added: 0, hasMore: false }
  const oldestSeq = current.messages[0]!.seq
  const res = await apiFetch(
    `/api/channels/${encodeURIComponent(channelId)}/messages?beforeSeq=${oldestSeq}&limit=${limit}`,
  )
  if (!res.ok) return { added: 0, hasMore: Boolean(current.hasMoreMessages) }
  const body = (await res.json()) as { messages?: ChannelMessageView[]; hasMore?: boolean }
  const older = Array.isArray(body.messages) ? body.messages : []
  const hasMore = Boolean(body.hasMore)
  setState((prev) => {
    const detail = prev.details[channelId]
    if (!detail) return prev
    const existingIds = new Set(detail.messages.map((m) => m.id))
    const merged = [...older.filter((m) => !existingIds.has(m.id)), ...detail.messages].sort((a, b) => a.seq - b.seq)
    return {
      ...prev,
      details: {
        ...prev.details,
        [channelId]: {
          ...detail,
          messages: merged,
          hasMoreMessages: hasMore,
        },
      },
    }
  })
  return { added: older.length, hasMore }
}

export async function loadChannelMessagesAround(channelId: string, messageId: string): Promise<boolean> {
  if (!channelId || !messageId) return false
  const res = await apiFetch(
    `/api/channels/${encodeURIComponent(channelId)}/messages?aroundMsgId=${encodeURIComponent(messageId)}&limit=60`,
  )
  if (!res.ok) return false
  const body = (await res.json()) as { messages?: ChannelMessageView[]; hasMore?: boolean }
  const loaded = Array.isArray(body.messages) ? body.messages : []
  if (loaded.length === 0) return false
  setState((prev) => {
    const detail = prev.details[channelId]
    if (!detail) return prev
    const byId = new Map(detail.messages.map((m) => [m.id, m]))
    for (const m of loaded) byId.set(m.id, m)
    const merged = [...byId.values()].sort((a, b) => a.seq - b.seq)
    return {
      ...prev,
      details: {
        ...prev.details,
        [channelId]: {
          ...detail,
          messages: merged,
          hasMoreMessages: Boolean(body.hasMore),
        },
      },
    }
  })
  return true
}

function applyReactionsToMessage(channelId: string, messageId: string, reactions: ChannelReactionSummary[]) {
  setState((prev) => {
    const detail = prev.details[channelId]
    const myId = detail?.myAccountId ?? ''
    const hydrated = reactions.map((r) => ({
      ...r,
      reactedByMe: Array.isArray(r.accountIds) ? r.accountIds.includes(myId) : r.reactedByMe,
    }))
    let nextThreads = prev.threads
    for (const [rootId, thread] of Object.entries(prev.threads)) {
      if (thread.root.id === messageId) {
        nextThreads = { ...nextThreads, [rootId]: { ...thread, root: { ...thread.root, reactions: hydrated } } }
      } else if (thread.replies.some((r) => r.id === messageId)) {
        nextThreads = {
          ...nextThreads,
          [rootId]: {
            ...thread,
            replies: thread.replies.map((r) => (r.id === messageId ? { ...r, reactions: hydrated } : r)),
          },
        }
      }
    }
    return {
      ...prev,
      threads: nextThreads,
      ...(detail
        ? {
            details: {
              ...prev.details,
              [channelId]: {
                ...detail,
                messages: detail.messages.map((m) => (m.id === messageId ? { ...m, reactions: hydrated } : m)),
              },
            },
          }
        : {}),
    }
  })
}

export async function toggleChannelReaction(
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<ChannelReactionSummary[]> {
  const res = await apiFetch(
    `/api/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ emoji }),
    },
  )
  const body = (await res.json()) as { reactions?: ChannelReactionSummary[]; error?: string }
  if (!res.ok) throw new Error(body.error || '操作表情失败')
  const reactions = Array.isArray(body.reactions) ? body.reactions : []
  applyReactionsToMessage(channelId, messageId, reactions)
  return reactions
}

export async function toggleChannelPinMessage(channelId: string, messageId: string): Promise<ChannelMessageView> {
  const res = await apiFetch(
    `/api/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/pin`,
    { method: 'POST' },
  )
  const body = (await res.json()) as { message?: ChannelMessageView; error?: string }
  if (!res.ok || !body.message) throw new Error(body.error || '置顶操作失败')
  upsertChannelMessage(body.message, true)
  return body.message
}

export async function loadChannelPins(channelId: string): Promise<ChannelMessageView[]> {
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/pins`)
  if (!res.ok) return []
  const body = (await res.json()) as { messages?: ChannelMessageView[] }
  return Array.isArray(body.messages) ? body.messages : []
}

export async function toggleChannelSaveMessage(
  channelId: string,
  messageId: string,
): Promise<{ saved: boolean; messageId: string }> {
  const res = await apiFetch(
    `/api/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/save`,
    { method: 'POST' },
  )
  const body = (await res.json()) as { saved?: boolean; messageId?: string; error?: string }
  if (!res.ok) throw new Error(body.error || '收藏操作失败')
  const saved = Boolean(body.saved)
  setState((prev) => {
    const detail = prev.details[channelId]
    if (!detail) return prev
    return {
      ...prev,
      details: {
        ...prev.details,
        [channelId]: {
          ...detail,
          messages: detail.messages.map((m) => (m.id === messageId ? { ...m, savedByMe: saved } : m)),
        },
      },
    }
  })
  return { saved, messageId }
}

export async function loadSavedChannelMessages(): Promise<ChannelSavedMessageView[]> {
  const res = await apiFetch('/api/channels/saved')
  if (!res.ok) return []
  const body = (await res.json()) as { items?: ChannelSavedMessageView[] }
  return Array.isArray(body.items) ? body.items : []
}

export async function searchChannelMessages(opts: {
  q: string
  channelId?: string
  senderId?: string
  limit?: number
}): Promise<ChannelSearchHit[]> {
  const q = opts.q.trim()
  if (!q) return []
  const params = new URLSearchParams({ q })
  if (opts.channelId) params.set('channelId', opts.channelId)
  if (opts.senderId) params.set('senderId', opts.senderId)
  if (opts.limit) params.set('limit', String(opts.limit))
  const res = await apiFetch(`/api/channels/search?${params.toString()}`)
  if (!res.ok) return []
  const body = (await res.json()) as { hits?: ChannelSearchHit[] }
  return Array.isArray(body.hits) ? body.hits : []
}

export async function updateChannelPreferences(
  channelId: string,
  patch: { muted?: boolean; pinned?: boolean; hidden?: boolean },
): Promise<ChannelSummary> {
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/preferences`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const body = (await res.json()) as { channel?: ChannelSummary; error?: string }
  if (!res.ok || !body.channel) throw new Error(body.error || '更新偏好失败')
  setState((prev) => {
    const updated = body.channel!
    const channels = updated.hidden
      ? prev.channels.filter((c) => c.id !== updated.id)
      : sortChannels(
          prev.channels.some((c) => c.id === updated.id)
            ? prev.channels.map((c) => (c.id === updated.id ? updated : c))
            : [updated, ...prev.channels],
        )
    const detail = prev.details[channelId]
    return {
      ...prev,
      channels,
      ...(detail ? { details: { ...prev.details, [channelId]: { ...detail, channel: updated } } } : {}),
    }
  })
  return body.channel
}

export async function leaveChannel(channelId: string): Promise<void> {
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/leave`, { method: 'POST' })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || '退出聊天失败')
  }
  setState((prev) => {
    const nextDetails = { ...prev.details }
    delete nextDetails[channelId]
    return {
      ...prev,
      channels: prev.channels.filter((c) => c.id !== channelId),
      details: nextDetails,
      inspected: prev.inspected?.channelId === channelId ? null : prev.inspected,
    }
  })
}

export async function notifyChannelTyping(channelId: string): Promise<void> {
  if (!channelId) return
  try {
    await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/typing`, { method: 'POST' })
  } catch {
    /* ignore */
  }
}

export async function loadChannelRun(channelId: string, runId: string): Promise<ChannelRunDetail | null> {
  try {
    const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/runs/${encodeURIComponent(runId)}`)
    if (!res.ok) return null
    const body = (await res.json()) as { run?: ChannelRunDetail }
    if (!body.run) return null
    setState((prev) => ({
      ...prev,
      runs: { ...prev.runs, [runId]: body.run! },
    }))
    return body.run
  } catch {
    return null
  }
}

export async function cancelChannelRun(channelId: string, runId: string): Promise<void> {
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || '取消失败')
  }
}

export async function decideChannelApproval(approvalId: string, allow: boolean): Promise<void> {
  const res = await apiFetch(`/api/approvals/${encodeURIComponent(approvalId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ allow }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || '审批操作失败')
  }
}

export function openChannelRunTrace(channelId: string, runId: string) {
  if (!channelId || !runId) return
  setState((prev) => ({ ...prev, inspected: { channelId, runId } }))
  void loadChannelRun(channelId, runId)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('biu:inspector-open'))
    window.dispatchEvent(new CustomEvent('biu:inspector-tab', { detail: { tabId: 'channel-run' } }))
  }
}

function messagePreviewText(message: ChannelMessageView): string {
  if (message.deletedAt) return '此消息已撤回'
  if (message.text.trim()) return message.text.slice(0, 120)
  if (message.attachments?.length) {
    const first = message.attachments[0]!
    return first.kind === 'image' ? `[图片] ${first.name}` : `[文件] ${first.name}`
  }
  return ''
}

function upsertChannelMessage(message: ChannelMessageView, isUpdateOrSelf = false) {
  setState((prev) => {
    const detail = prev.details[message.channelId]
    // 讨论串回复仅进入对应 thread，不污染主频道消息流
    if (message.threadRootId) {
      const rootId = message.threadRootId
      const existingThread = prev.threads[rootId]
      let nextThreads = prev.threads
      if (existingThread) {
        const exists = existingThread.replies.some((m) => m.id === message.id)
        const nextReplies = exists
          ? existingThread.replies.map((m) => (m.id === message.id ? message : m))
          : [...existingThread.replies, message].sort((a, b) => a.seq - b.seq)
        nextThreads = {
          ...prev.threads,
          [rootId]: { ...existingThread, replies: nextReplies },
        }
      }
      // 乐观更新主消息流里 root 的回复计数与侧栏子话题列表
      let nextDetails = prev.details
      let nextChannels = prev.channels
      if (!message.ephemeralTo) {
        const rootMsg =
          existingThread?.root ??
          detail?.messages.find((m) => m.id === rootId)
        const rootPreview = (rootMsg?.text ?? '')
          .replace(/[#>*`[\]()]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        const threadTitle = rootPreview
          ? rootPreview.length > 28
            ? `${rootPreview.slice(0, 28)}…`
            : rootPreview
          : '讨论串'
        nextChannels = prev.channels.map((c) => {
          if (c.id !== message.channelId) return c
          const prevThreads = c.threads ?? []
          const existsInList = prevThreads.some((t) => t.rootId === rootId)
          if (!existsInList && !isUpdateOrSelf) return c
          const nextThreads = existsInList
            ? prevThreads.map((t) =>
                t.rootId === rootId
                  ? { ...t, replyCount: t.replyCount + (existingThread?.replies.some((r) => r.id === message.id) ? 0 : 1), lastReplyAt: Math.max(t.lastReplyAt, message.createdAt) }
                  : t,
              )
            : [{ rootId, title: threadTitle, replyCount: 1, lastReplyAt: message.createdAt }, ...prevThreads]
          return { ...c, threads: nextThreads.sort((a, b) => b.lastReplyAt - a.lastReplyAt).slice(0, 12) }
        })
      }
      if (detail && !message.ephemeralTo && !isUpdateOrSelf) {
        nextDetails = {
          ...prev.details,
          [message.channelId]: {
            ...detail,
            messages: detail.messages.map((m) => {
              if (m.id !== rootId) return m
              const prevSum = m.threadSummary
              const names = prevSum?.participantNames ?? []
              return {
                ...m,
                threadSummary: {
                  replyCount: (prevSum?.replyCount ?? 0) + 1,
                  lastReplyAt: Math.max(prevSum?.lastReplyAt ?? 0, message.createdAt),
                  participantNames: names.includes(message.senderName)
                    ? names
                    : [...names, message.senderName].slice(0, 6),
                },
              }
            }),
          },
        }
      }
      return { ...prev, channels: nextChannels, threads: nextThreads, details: nextDetails }
    }

    const existed = detail ? detail.messages.some((m) => m.id === message.id) : false
    const myAccountId = detail?.myAccountId ?? ''
    const isFromSelf = Boolean(myAccountId) && message.senderType === 'account' && message.senderId === myAccountId
    const shouldBumpUnread =
      !isUpdateOrSelf &&
      !existed &&
      !message.ephemeralTo &&
      !message.deletedAt &&
      !isFromSelf &&
      prev.activeChannelId !== message.channelId
    const mentionedMe =
      shouldBumpUnread &&
      message.mentions.some(
        (m) => m.kind === 'everyone' || (m.kind === 'account' && Boolean(myAccountId) && m.id === myAccountId),
      )

    const preview = messagePreviewText(message)
    const nextChannels = sortChannels(
      prev.channels.map((c) => {
        if (c.id !== message.channelId || message.ephemeralTo) return c
        return {
          ...c,
          updatedAt: Math.max(c.updatedAt, message.createdAt),
          lastMessageAt: Math.max(c.lastMessageAt, message.createdAt),
          ...(preview ? { lastMessageText: preview } : {}),
          ...(shouldBumpUnread
            ? {
                unreadCount: (c.unreadCount ?? 0) + 1,
                mentionCount: (c.mentionCount ?? 0) + (mentionedMe ? 1 : 0),
              }
            : {}),
        }
      }),
    )
    const nextThreads = prev.threads[message.id]
      ? { ...prev.threads, [message.id]: { ...prev.threads[message.id]!, root: message } }
      : prev.threads
    if (!detail) return { ...prev, channels: nextChannels, threads: nextThreads }
    const nextMessages = existed
      ? detail.messages.map((m) => (m.id === message.id ? message : m))
      : [...detail.messages, message].sort((a, b) => a.seq - b.seq)
    return {
      ...prev,
      channels: nextChannels,
      threads: nextThreads,
      details: {
        ...prev.details,
        [message.channelId]: { ...detail, messages: nextMessages },
      },
    }
  })
}

export function bindChannelRealtime(snapshot?: { onMessage?: (type: string, handler: (payload: unknown) => void) => () => void }) {
  const offs: Array<() => void> = []
  offs.push(
    onAppEvents(['biu:account-token', 'biu:workspace-profile'], () => {
      resetChannelStore()
      void loadChannels()
    }),
  )
  if (snapshot?.onMessage) {
    offs.push(
      snapshot.onMessage('channel/message', (payload) => {
        const msg = (payload as { message?: ChannelMessageView } | null)?.message
        if (msg?.id) {
          upsertChannelMessage(msg)
          if (msg.senderType === 'account') {
            setState((prev) => {
              const list = prev.typingByChannel[msg.channelId]
              if (!list?.length) return prev
              const next = list.filter((t) => t.accountId !== msg.senderId)
              return { ...prev, typingByChannel: { ...prev.typingByChannel, [msg.channelId]: next } }
            })
          }
        }
      }),
    )
    offs.push(
      snapshot.onMessage('channel/reactions', (payload) => {
        const data = payload as { channelId?: string; messageId?: string; reactions?: ChannelReactionSummary[] } | null
        if (data?.channelId && data.messageId && Array.isArray(data.reactions)) {
          applyReactionsToMessage(data.channelId, data.messageId, data.reactions)
        }
      }),
    )
    offs.push(
      snapshot.onMessage('channel/typing', (payload) => {
        const data = payload as { channelId?: string; accountId?: string; accountName?: string; ts?: number } | null
        if (!data?.channelId || !data.accountId) return
        const ts = Number(data.ts) || Date.now()
        setState((prev) => {
          const cur = (prev.typingByChannel[data.channelId!] ?? []).filter((t) => Date.now() - t.ts < 4500 && t.accountId !== data.accountId)
          return {
            ...prev,
            typingByChannel: {
              ...prev.typingByChannel,
              [data.channelId!]: [...cur, { accountId: data.accountId!, accountName: data.accountName || data.accountId!, ts }],
            },
          }
        })
      }),
    )
    offs.push(
      snapshot.onMessage('channel/message-updated', (payload) => {
        const msg = (payload as { message?: ChannelMessageView } | null)?.message
        if (msg?.id) upsertChannelMessage(msg, true)
      }),
    )
    offs.push(
      snapshot.onMessage('channel/read', (payload) => {
        const data = payload as { channelId?: string; lastReadSeq?: number } | null
        if (!data?.channelId) return
        setState((prev) => {
          const nextChannels = prev.channels.map((c) =>
            c.id === data.channelId
              ? {
                  ...c,
                  unreadCount: 0,
                  mentionCount: 0,
                  lastReadSeq: Math.max(c.lastReadSeq ?? 0, Number(data.lastReadSeq ?? 0)),
                }
              : c,
          )
          const detail = prev.details[data.channelId!]
          return {
            ...prev,
            channels: nextChannels,
            ...(detail
              ? {
                  details: {
                    ...prev.details,
                    [data.channelId!]: {
                      ...detail,
                      channel: {
                        ...detail.channel,
                        unreadCount: 0,
                        mentionCount: 0,
                        lastReadSeq: Math.max(detail.channel.lastReadSeq ?? 0, Number(data.lastReadSeq ?? 0)),
                      },
                    },
                  },
                }
              : {}),
          }
        })
      }),
    )
    offs.push(
      snapshot.onMessage('channel/agent-status', (payload) => {
        const data = payload as { channelId?: string; activities?: ChannelAgentActivity[] } | null
        if (!data?.channelId || !Array.isArray(data.activities)) return
        setState((prev) => {
          const detail = prev.details[data.channelId!]
          if (!detail) return prev
          return {
            ...prev,
            details: {
              ...prev.details,
              [data.channelId!]: { ...detail, activities: data.activities! },
            },
          }
        })
      }),
    )
    offs.push(
      snapshot.onMessage('channel/members', (payload) => {
        const data = payload as { channelId?: string; members?: ChannelMemberView[] } | null
        if (!data?.channelId || !Array.isArray(data.members)) return
        setState((prev) => {
          const detail = prev.details[data.channelId!]
          if (!detail) return prev
          return {
            ...prev,
            details: {
              ...prev.details,
              [data.channelId!]: { ...detail, members: data.members! },
            },
          }
        })
      }),
    )
    offs.push(
      snapshot.onMessage('channel/updated', (payload) => {
        const ch = (payload as { channel?: ChannelSummary } | null)?.channel
        if (!ch?.id) return
        setState((prev) => {
          const exists = prev.channels.some((c) => c.id === ch.id)
          const channels = ch.hidden
            ? prev.channels.filter((c) => c.id !== ch.id)
            : sortChannels(
                exists
                  ? prev.channels.map((c) => (c.id === ch.id ? ch : c))
                  : [ch, ...prev.channels],
              )
          const detail = prev.details[ch.id]
          return {
            ...prev,
            channels,
            ...(detail ? { details: { ...prev.details, [ch.id]: { ...detail, channel: ch } } } : {}),
          }
        })
      }),
    )
    offs.push(
      snapshot.onMessage('channel/deleted', (payload) => {
        const id = (payload as { id?: string } | null)?.id
        if (!id) return
        setState((prev) => {
          const nextDetails = { ...prev.details }
          delete nextDetails[id]
          return {
            ...prev,
            channels: prev.channels.filter((c) => c.id !== id),
            details: nextDetails,
            inspected: prev.inspected?.channelId === id ? null : prev.inspected,
          }
        })
      }),
    )
    offs.push(
      snapshot.onMessage('channel/run-event', (payload) => {
        const data = payload as { channelId?: string; runId?: string; event?: ChannelRunEvent } | null
        if (!data?.runId || !data.event) return
        setState((prev) => {
          const run = prev.runs[data.runId!]
          if (!run) return prev
          const nextStatus =
            data.event!.kind === 'done'
              ? 'done'
              : data.event!.kind === 'error'
                ? 'failed'
                : data.event!.kind === 'cancelled'
                  ? 'cancelled'
                  : data.event!.kind === 'approval'
                    ? 'waiting_approval'
                    : run.status
          return {
            ...prev,
            runs: {
              ...prev.runs,
              [data.runId!]: {
                ...run,
                status: nextStatus,
                events: [...run.events, data.event!],
              },
            },
          }
        })
      }),
    )
  }
  return () => {
    for (const off of offs) off()
  }
}
