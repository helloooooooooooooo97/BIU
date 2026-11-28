import { Service, type Context } from 'cordis'
import { currentTenantScope, dataHome, dataPath } from '@biu/host-plugin-loader/data-dir'
import { DATABASE_CHANNEL, databaseChannelPayload } from '@biu/type-file-system'
import { noticesCollection } from './notices-collection.ts'
import { NoticesStore, type NoticeInput } from './notices-store.ts'

export class NoticesService extends Service {
  store = new NoticesStore()

  constructor(ctx: Context) {
    super(ctx, 'notices')
    ctx.inject(['database'], (inner) => {
      inner.database.register(noticesCollection(this.store))
    })
    ctx.inject(['http'], (inner) => {
      inner.http.route('POST', '/api/db/notices/clear', (route: { send: (status: number, body: unknown) => void }) => {
        route.send(200, { ok: true, cleared: this.clear() })
      })
      inner.http.route('POST', '/api/db/notices/read-all', (route: { send: (status: number, body: unknown) => void }) => {
        route.send(200, { ok: true, marked: this.markAllRead() })
      })
    })
  }

  open(path: string) {
    this.store.open(path)
    return this
  }

  push(input: NoticeInput) {
    const row = this.store.push(input)
    if (row) this.bump(row.workspaceId, row.accountId)
    return row
  }

  updateBySource(
    sourceKey: string,
    workspaceId: string,
    updater: Parameters<NoticesStore['updateBySource']>[2],
  ) {
    const touched = this.store.updateBySource(sourceKey, workspaceId, updater)
    const seen = new Set<string>()
    for (const target of touched) {
      const k = `${target.workspaceId}\0${target.accountId}`
      if (seen.has(k)) continue
      seen.add(k)
      this.bump(target.workspaceId, target.accountId)
    }
    return touched.length
  }

  markSourceRead(sourceKey: string) {
    const n = this.store.markSourceRead(sourceKey)
    if (n) this.bump()
    return n
  }

  markAllRead() {
    const n = this.store.markAllRead()
    if (n) this.bump()
    return n
  }

  clear() {
    const n = this.store.clear()
    if (n) this.bump()
    return n
  }

  private bump(targetWorkspaceId?: string, targetAccountId?: string) {
    const scope = currentTenantScope()
    const workspaceId = (targetWorkspaceId ?? scope.workspaceId).trim()
    const accountId = (targetAccountId ?? scope.accountId).trim()
    const http = this.ctx.get('http') as
      | {
          broadcast?: (type: string, payload: unknown, workspaceId?: string, accountId?: string) => void
          broadcastAccount?: (accountId: string, type: string, payload: unknown) => void
        }
      | undefined
    const noticeEvent = { ts: Date.now(), ...(workspaceId ? { workspaceId } : {}) }
    if (accountId && http?.broadcastAccount) {
      http.broadcastAccount(accountId, 'notices/change', noticeEvent)
    } else {
      http?.broadcast?.('notices/change', noticeEvent, workspaceId || undefined, accountId || undefined)
    }
    http?.broadcast?.(DATABASE_CHANNEL, databaseChannelPayload('notices'), workspaceId || undefined, accountId || undefined)
  }
}

export const name = 'core-notices'

export function apply(ctx: Context) {
  new NoticesService(ctx).open(process.env.VITEST ? ':memory:' : dataPath(dataHome(), 'notices.json'))
}

declare module 'cordis' {
  interface Context {
    notices: NoticesService
  }
}
