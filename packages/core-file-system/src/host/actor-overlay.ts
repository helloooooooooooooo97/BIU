import { currentAccountId } from '@biu/host-plugin-loader/data-dir'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
import { currentSessionId } from '@biu/host-sessions/scope'
import { readWorkspaceProfile } from '@biu/host-workspace'
import {
  appendPerson,
  asPersonList,
  type CollectionSpec,
  type DbRecord,
  type PersonValue,
} from '@biu/type-file-system'
import { AGENTS_COLLECTION_PATH } from '../paths.ts'
import { isBuiltinPluginRow } from './access-policy.ts'
import type { TagStore } from './tags-store.ts'

export function sessionTitleFromRow(row: unknown): string {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return ''
  const rec = row as Record<string, unknown>
  const title = String(rec.title ?? rec.name ?? '').trim()
  if (title) return title
  const config = rec.config
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    return String((config as { title?: unknown }).title ?? '').trim()
  }
  return ''
}

export function sessionMascotFromRow(row: unknown): PersonValue['mascot'] {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return undefined
  const raw = (row as { mascot?: unknown }).mascot
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const rec = raw as { shape?: unknown; color?: unknown; eye?: unknown }
  if (typeof rec.shape !== 'string' || typeof rec.color !== 'string') return undefined
  return {
    shape: rec.shape,
    color: rec.color,
    ...(typeof rec.eye === 'number' ? { eye: rec.eye } : {}),
  }
}

export function sessionPersonFromRow(row: unknown): { name: string; mascot?: PersonValue['mascot'] } {
  const name = sessionTitleFromRow(row)
  const mascot = sessionMascotFromRow(row)
  return mascot ? { name, mascot } : { name }
}

export type ActorOverlayHost = {
  tags: TagStore
  collection(pathOrId: string): CollectionSpec | undefined
  workspacePerson(accountId: string): { accountId: string; workspaceId: string; name: string } | null | undefined
  sessionsService(): { peek?: (id: string) => unknown; get?: (id: string) => Promise<unknown> } | undefined
  accountService(): {
    markLocal?: (collection: string, id: string) => void
    workspaceLocation?: (workspaceId: string) => 'device' | 'cloud'
    store?: { activeWorkspaceId?: () => string | null }
  } | undefined
}

/**
 * 同步读会话行，给创建人/编辑人列用。
 * 只走内存缓存，绝不调用集合 get()：那是 async，会 await list() 全表重列，
 * 再 require() 把整条 events 读出来，表格每渲染一格就被卡一次。
 */
export function peekSessionRow(host: ActorOverlayHost, sessionId: string): unknown {
  const sessions = host.collection(AGENTS_COLLECTION_PATH) as
    | { peek?: (id: string) => unknown; get?: (id: string) => unknown }
    | undefined
  const peeked = sessions?.peek?.(sessionId)
  if (peeked) return peeked
  return host.sessionsService()?.peek?.(sessionId)
}

export function peekSessionPerson(host: ActorOverlayHost, sessionId: string) {
  return sessionPersonFromRow(peekSessionRow(host, sessionId))
}

export async function querySessionPerson(
  host: ActorOverlayHost,
  sessionId: string,
): Promise<{ name: string; mascot?: PersonValue['mascot'] }> {
  const peeked = peekSessionPerson(host, sessionId)
  if (peeked.name || peeked.mascot) return peeked
  // 只有 peek 完全落空才回落到真正的读取；正常热路径不会走到这里，
  // 也就不会为了写一个 createdBy 把整条会话的 events 拉进内存。
  const sessions = host.collection(AGENTS_COLLECTION_PATH)
  if (sessions?.get) {
    const fromCollection = sessionPersonFromRow(await sessions.get(sessionId))
    if (fromCollection.name || fromCollection.mascot) return fromCollection
  }
  return sessionPersonFromRow(await host.sessionsService()?.get?.(sessionId))
}

export function resolveNamedPerson(host: ActorOverlayHost, person: PersonValue): PersonValue {
  if (person.kind === 'user' && person.accountId) {
    const member = host.workspacePerson(person.accountId)
    return member?.name ? { ...person, name: member.name } : person
  }
  if (person.kind !== 'agent' || !person.sessionId) return person
  const peeked = peekSessionPerson(host, person.sessionId)
  return {
    ...person,
    ...(peeked.name ? { name: peeked.name } : {}),
    ...(peeked.mascot ? { mascot: peeked.mascot } : {}),
  }
}

export async function resolveCurrentPerson(host: ActorOverlayHost): Promise<PersonValue> {
  const sid = currentSessionId()?.trim()
  if (!sid) {
    const accountId = currentAccountId()
    const member = accountId ? host.workspacePerson(accountId) : null
    if (member?.name) return { kind: 'user', name: member.name, accountId }
    const name = readWorkspaceProfile().name.trim() || '用户'
    return { kind: 'user', name }
  }
  const peeked = await querySessionPerson(host, sid)
  return {
    kind: 'agent',
    name: peeked.name || sid.slice(0, 8),
    sessionId: sid,
    ...(peeked.mascot ? { mascot: peeked.mascot } : {}),
  }
}

export async function stampRecordActor(host: ActorOverlayHost, collection: string, recordId: string) {
  const actor = await resolveCurrentPerson(host)
  const existing = host.tags.recordMeta(collection, recordId)
  host.tags.writeRecordMeta(collection, recordId, {
    ...(existing?.createdBy ? {} : { createdBy: actor }),
    updatedBy: appendPerson(existing?.updatedBy, actor),
  })
}

export async function touchRecordActor(host: ActorOverlayHost, collection: string, recordId: string) {
  await stampRecordActor(host, collection, recordId)
  if (getRuntimePolicy().hostMode === 'cloud') return
  try {
    const account = host.accountService()
    const workspaceId = account?.store?.activeWorkspaceId?.() ?? ''
    if (!workspaceId || account?.workspaceLocation?.(workspaceId) !== 'cloud') {
      account?.markLocal?.(collection, recordId)
    }
  } catch {
    /* 没有账号服务时只记录创建人 */
  }
}

export function applyRecordPersonOverlay(
  host: ActorOverlayHost,
  spec: CollectionSpec,
  row: DbRecord,
): DbRecord {
  if (isBuiltinPluginRow(spec.path, row)) {
    const official = { kind: 'user' as const, name: 'BIU官方', url: 'https://github.com/helloooooooooooooo97/biu' }
    return { ...row, createdBy: official, updatedBy: [official] }
  }
  const meta = host.tags.recordMeta(spec.path, row.id)
  const rawCreatedBy = typeof row.createdBy === 'string' ? row.createdBy.trim() : ''
  const resolvedCreatedBy = meta?.createdBy
    ? resolveNamedPerson(host, meta.createdBy)
    : rawCreatedBy
      ? resolveNamedPerson(host, { kind: 'user', accountId: rawCreatedBy, name: rawCreatedBy })
      : null
  const editors = meta ? asPersonList(meta.updatedBy).map((item) => resolveNamedPerson(host, item)) : []
  if (!resolvedCreatedBy && !editors.length) return row
  return {
    ...row,
    ...(resolvedCreatedBy ? { createdBy: resolvedCreatedBy } : {}),
    ...(editors.length ? { updatedBy: editors } : {}),
  }
}
