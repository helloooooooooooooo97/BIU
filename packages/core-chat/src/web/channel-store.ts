import { apiFetch } from '@biu/biu-ui/api-client'
import { onAppEvents } from '@biu/biu-ui/app-events'
import { useSyncExternalStore } from 'react'
import type {
  ChannelAccessMode,
  ChannelAgentActivity,
  ChannelDetailPayload,
  ChannelMemberType,
  ChannelMemberView,
  ChannelMention,
  ChannelMessageView,
  ChannelRunDetail,
  ChannelRunEvent,
  ChannelSummary,
} from '../shared/channel-types.ts'

export type ChannelStoreState = {
  channels: ChannelSummary[]
  loaded: boolean
  details: Record<string, ChannelDetailPayload>
  inspected: { channelId: string; runId: string } | null
  runs: Record<string, ChannelRunDetail>
}

let state: ChannelStoreState = {
  channels: [],
  loaded: false,
  details: {},
  inspected: null,
  runs: {},
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
    details: {},
    inspected: null,
    runs: {},
  }
  emit()
}

export async function loadChannels(): Promise<ChannelSummary[]> {
  try {
    const res = await apiFetch('/api/channels')
    if (!res.ok) return state.channels
    const body = (await res.json()) as { channels?: ChannelSummary[] }
    const channels = Array.isArray(body.channels) ? body.channels : []
    setState((prev) => ({ ...prev, channels, loaded: true }))
    return channels
  } catch {
    return state.channels
  }
}

export async function loadChannelDetail(channelId: string): Promise<ChannelDetailPayload | null> {
  if (!channelId) return null
  try {
    const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}`)
    if (!res.ok) return null
    const detail = (await res.json()) as ChannelDetailPayload
    setState((prev) => {
      const exists = prev.channels.some((c) => c.id === detail.channel.id)
      const channels = exists
        ? prev.channels.map((c) => (c.id === detail.channel.id ? detail.channel : c))
        : [detail.channel, ...prev.channels]
      return {
        ...prev,
        channels,
        details: { ...prev.details, [channelId]: detail },
      }
    })
    return detail
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
): Promise<ChannelMemberView[]> {
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/members`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ memberType, memberId }),
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
  input: { text: string; replyToId?: string; mentions?: ChannelMention[] },
): Promise<{ message: ChannelMessageView; triggeredRunIds: string[] }> {
  const res = await apiFetch(`/api/channels/${encodeURIComponent(channelId)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = (await res.json()) as { message?: ChannelMessageView; triggeredRunIds?: string[]; error?: string }
  if (!res.ok || !body.message) throw new Error(body.error || '发送失败')
  upsertChannelMessage(body.message)
  return { message: body.message, triggeredRunIds: body.triggeredRunIds ?? [] }
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

function upsertChannelMessage(message: ChannelMessageView) {
  setState((prev) => {
    const detail = prev.details[message.channelId]
    const nextChannels = prev.channels.map((c) =>
      c.id === message.channelId && !message.ephemeralTo
        ? { ...c, updatedAt: Math.max(c.updatedAt, message.createdAt), lastMessageAt: message.createdAt, lastMessageText: message.text.slice(0, 120) }
        : c,
    )
    if (!detail) return { ...prev, channels: nextChannels }
    const exists = detail.messages.some((m) => m.id === message.id)
    const nextMessages = exists
      ? detail.messages.map((m) => (m.id === message.id ? message : m))
      : [...detail.messages, message].sort((a, b) => a.seq - b.seq)
    return {
      ...prev,
      channels: nextChannels,
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
        if (msg?.id) upsertChannelMessage(msg)
      }),
    )
    offs.push(
      snapshot.onMessage('channel/message-updated', (payload) => {
        const msg = (payload as { message?: ChannelMessageView } | null)?.message
        if (msg?.id) upsertChannelMessage(msg)
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
          const channels = exists
            ? prev.channels.map((c) => (c.id === ch.id ? ch : c))
            : [ch, ...prev.channels]
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
