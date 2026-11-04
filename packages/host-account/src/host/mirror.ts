import type { Context } from 'cordis'
import { currentAccountId, currentRequestWorkspaceId, isOnlineRuntime, runWithAccount, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import type { SessionRecord } from '@biu/type-session'

export type MirrorSnapshot = {
  sessions: Array<SessionRecord & { updatedAt?: number }>
  collections: Array<{ path: string; records: Array<Record<string, unknown> & { id: string; updatedAt?: number }> }>
}

type ApplyMode = 'cache' | 'adopt'

type SessionStoreLike = {
  listSummaries: () => Promise<Array<{ id: string; updatedAt?: number }>>
  load: (id: string) => Promise<SessionRecord | null | undefined>
  save: (record: SessionRecord & { updatedAt?: number }) => Promise<void>
  delete?: (id: string) => Promise<unknown>
}

type DatabaseLike = {
  syncedRecords: () => Promise<MirrorSnapshot['collections']>
  applySynced: (path: string, records: MirrorSnapshot['collections'][number]['records']) => Promise<void>
  read?: (path: string) => Promise<{ value?: Record<string, unknown> & { id?: string } }>
  remove?: (path: string, query: { ids: string[] }) => Promise<unknown>
}

type AccountLike = {
  isRemote?: (collection: string, id: string) => boolean
  markRemote?: (collection: string, id: string) => void
  clearPlace?: (collection: string, id: string) => void
  remoteIds?: (collection: string) => string[]
  linkedCloud?: (localAccountId?: string) => { origin: string; token: string } | null
  workspaceLocation?: (workspaceId: string) => 'device' | 'cloud'
  store?: { activeWorkspaceId(): string | null }
}

function sessionsOf(ctx: Context) {
  try {
    return ctx.get('sessionStore') as SessionStoreLike | undefined
  } catch {
    return undefined
  }
}

function databaseOf(ctx: Context) {
  try {
    return ctx.get('database') as DatabaseLike | undefined
  } catch {
    return undefined
  }
}

function accountOf(ctx: Context) {
  try {
    return ctx.get('account') as AccountLike | undefined
  } catch {
    return undefined
  }
}

function sessionVisible(ctx: Context, id: string, record?: { id?: unknown }) {
  try {
    const sessions = ctx.get('sessions') as { inWorkspace?: (id: string, record?: { id?: unknown }) => boolean } | undefined
    if (typeof sessions?.inWorkspace === 'function') return sessions.inWorkspace(id, record)
  } catch {
    /* 没有会话服务时按存储里的全部导出，测试走这条 */
  }
  return true
}

function claim(ctx: Context, collection: string, id: string) {
  try {
    const account = ctx.get('account') as
      | { store?: { activeWorkspaceId(): string | null; attach(workspaceId: string, collection: string, recordId: string): void } }
      | undefined
    const workspaceId = currentRequestWorkspaceId() || account?.store?.activeWorkspaceId()
    if (!workspaceId || !account?.store) return
    account.store.attach(workspaceId, collection, id)
  } catch {
    /* 已经挂在别的空间，或这台机器还没有空间 */
  }
}

function rememberCloud(ctx: Context, collection: string, id: string) {
  accountOf(ctx)?.markRemote?.(collection, id)
}

function desktopCloudWorkspace(ctx: Context) {
  if (isOnlineRuntime()) return null
  const origin = process.env.BIU_REMOTE_ORIGIN?.replace(/\/$/, '')
  if (!origin) return null
  const account = accountOf(ctx)
  const workspaceId = currentRequestWorkspaceId() || account?.store?.activeWorkspaceId() || ''
  if (!workspaceId || account?.workspaceLocation?.(workspaceId) !== 'cloud') return null
  const linked = account?.linkedCloud?.(currentAccountId() || undefined)
  if (!linked?.token) return null
  return { origin: linked.origin || origin, token: linked.token, workspaceId }
}

export async function takeSnapshot(ctx: Context): Promise<MirrorSnapshot> {
  const sessions: MirrorSnapshot['sessions'] = []
  const store = sessionsOf(ctx)
  if (store) {
    for (const item of await store.listSummaries()) {
      if (!sessionVisible(ctx, item.id, item)) continue
      const full = await store.load(item.id)
      if (!full) continue
      sessions.push({ ...full, updatedAt: Number(item.updatedAt) || 0 })
    }
  }
  const collections = (await databaseOf(ctx)?.syncedRecords()) ?? []
  return { sessions, collections }
}

export async function applySnapshot(ctx: Context, snapshot: MirrorSnapshot, mode: ApplyMode = 'cache') {
  const account = accountOf(ctx)
  const store = sessionsOf(ctx)
  if (store) {
    const current = new Set((await store.listSummaries()).map((item) => item.id))
    const incoming = new Set<string>()
    for (const record of snapshot.sessions ?? []) {
      if (!record?.id) continue
      incoming.add(record.id)
      const localHome = current.has(record.id) && !account?.isRemote?.('/agents', record.id)
      if (mode === 'cache' && localHome) continue
      try {
        await store.save(record)
        claim(ctx, '/agents', record.id)
        if (mode === 'cache') rememberCloud(ctx, '/agents', record.id)
      } catch (error) {
        console.warn('[replica] skip session', record.id, error)
      }
    }
    if (mode === 'cache') {
      for (const id of account?.remoteIds?.('/agents') ?? []) {
        if (incoming.has(id)) continue
        await store.delete?.(id)
        account?.clearPlace?.('/agents', id)
      }
    }
  }
  const database = databaseOf(ctx)
  if (!database) return
  for (const collection of snapshot.collections ?? []) {
    const incoming = new Set<string>()
    const writable = []
    for (const record of collection.records ?? []) {
      const id = String(record?.id ?? '')
      if (!id) continue
      incoming.add(id)
      if (mode === 'cache' && account?.isRemote && !account.isRemote(collection.path, id)) {
        const existing = await database.read?.(`${collection.path}/${id}`).catch(() => null)
        if (existing?.value?.id) continue
      }
      writable.push(record)
    }
    await database.applySynced(collection.path, writable)
    for (const record of writable) {
      if (!record?.id) continue
      claim(ctx, collection.path, String(record.id))
      if (mode === 'cache') rememberCloud(ctx, collection.path, String(record.id))
    }
    if (mode === 'cache') {
      for (const id of account?.remoteIds?.(collection.path) ?? []) {
        if (incoming.has(id)) continue
        await database.remove?.(collection.path, { ids: [id] }).catch((error) => {
          console.warn('[replica] drop', collection.path, id, error)
        })
        account?.clearPlace?.(collection.path, id)
      }
    }
  }
}

export async function exchangeSnapshot(
  ctx: Context,
  origin: string,
  token: string,
  accountId: string,
  workspaceId = '',
) {
  if (!workspaceId) return
  const root = origin.replace(/\/$/, '')
  const headers = {
    authorization: `Bearer ${token}`,
    'x-biu-workspace-id': workspaceId,
  }
  const pulled = await fetch(`${root}/api/replica/snapshot`, { headers })
  if (!pulled.ok) return
  const body = (await pulled.json()) as MirrorSnapshot
  await runWithAccount(accountId, () =>
    workspaceId
      ? runWithRequestWorkspace(workspaceId, () => applySnapshot(ctx, body, 'cache'))
      : applySnapshot(ctx, body, 'cache'),
  )
}

export async function forwardCloud(
  ctx: Context,
  _collection: string,
  _id: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown } | null> {
  const cloud = desktopCloudWorkspace(ctx)
  if (!cloud) return null
  const res = await fetch(`${cloud.origin}${path}`, {
    method: init.method ?? 'POST',
    headers: {
      authorization: `Bearer ${cloud.token}`,
      'x-biu-workspace-id': cloud.workspaceId,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}
