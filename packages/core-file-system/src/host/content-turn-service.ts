import { Service, type Context } from 'cordis'
import { currentSessionId } from '@biu/host-sessions/scope'
import type { ContentEditSummary, WalActor, WalEntry } from './wal-store.ts'
import { WalStore } from './wal-store.ts'
import { asContentText } from './content-edit.ts'

export type { ContentEditSummary } from './wal-store.ts'

type ContentDb = {
  content: (path: string) => Promise<{ value: unknown }>
  writeContent: (path: string, value: unknown) => Promise<{ value?: unknown } | unknown>
  update?: (path: string, content: unknown) => Promise<unknown>
  create?: (path: string, records: unknown) => Promise<unknown>
  remove?: (path: string, query: { ids: string[] }) => Promise<unknown>
  read?: (path: string) => Promise<{ value?: unknown }>
  restoreRecord?: (path: string, fields: Record<string, unknown>, content?: string) => Promise<unknown>
}

function sameText(left: string, right: string) {
  return left.replace(/\r\n/g, '\n') === right.replace(/\r\n/g, '\n')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function splitRecordPath(path: string) {
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return null
  return { collection: `/${parts[0]}`, id: parts.slice(1).join('/') }
}

function stableJson(value: unknown) {
  return JSON.stringify(value ?? null)
}

export class ContentTurnService extends Service {
  store = new WalStore()
  private reverting = false
  private publishChain: Promise<void> = Promise.resolve()

  constructor(
    ctx: Context,
    private db: ContentDb,
  ) {
    super(ctx, 'contentTurns')
  }

  open(path: string) {
    this.store.open(path)
    return this
  }

  private actor(): WalActor {
    const sessionId = String(currentSessionId() ?? '').trim()
    if (!sessionId) return { kind: 'user' }
    const turn = this.openTurn(sessionId)
    if (turn == null) return { kind: 'agent', sessionId }
    return { kind: 'agent', sessionId, turn }
  }

  private afterWrite(actor: WalActor) {
    if (actor.kind === 'agent' && actor.sessionId && actor.turn != null) {
      return this.publishLatest(actor.sessionId, actor.turn)
    }
    return Promise.resolve()
  }

  async recordEdit(path: string, before: string, after: string, title: string) {
    if (this.reverting || sameText(before, after)) return
    const actor = this.actor()
    this.store.append({ path, op: 'content', actor, title, beforeText: before, afterText: after })
    await this.afterWrite(actor)
  }

  async recordCreate(path: string, title: string, record: Record<string, unknown>, content = '') {
    if (this.reverting) return
    const actor = this.actor()
    this.store.append({
      path,
      op: 'create',
      actor,
      title,
      afterText: content,
      afterMeta: record,
    })
    await this.afterWrite(actor)
  }

  async recordUpdate(path: string, title: string, before: Record<string, unknown>, after: Record<string, unknown>) {
    if (this.reverting || stableJson(before) === stableJson(after)) return
    const actor = this.actor()
    this.store.append({ path, op: 'update', actor, title, beforeMeta: before, afterMeta: after })
    await this.afterWrite(actor)
  }

  async recordDelete(path: string, title: string, record: Record<string, unknown>, content = '') {
    if (this.reverting) return
    const actor = this.actor()
    this.store.append({
      path,
      op: 'delete',
      actor,
      title,
      beforeText: content,
      beforeMeta: record,
    })
    await this.afterWrite(actor)
  }

  async revert(sessionId: string, turn: number, path?: string, kind?: ContentEditSummary['kind']) {
    const sid = sessionId.trim()
    const want = path?.trim()
    const results: Array<{ path: string; ok: boolean; error?: string }> = []
    this.reverting = true
    try {
      const rows = this.store
        .listTurn(sid, turn)
        .filter((row) => {
          if (row.reverted) return false
          if (want && row.path !== want) return false
          if (kind && row.op !== kind) return false
          return true
        })
        .slice()
        .sort((a, b) => b.seq - a.seq)
      if (want && kind && !rows.length) {
        return { ok: false, results: [{ path: want, ok: false, error: 'missing' }] }
      }
      for (const row of rows) results.push(await this.revertEntry(row))
    } finally {
      this.reverting = false
    }
    await this.publishLatest(sid, turn)
    if (!results.length) return { ok: false, results: [{ path: want || '', ok: false, error: 'missing' }] }
    return { ok: results.every((row) => row.ok), results }
  }

  summaries(sessionId: string, turn: number): ContentEditSummary[] {
    return this.store.summaries(sessionId, turn)
  }

  private async revertEntry(row: WalEntry): Promise<{ path: string; ok: boolean; error?: string }> {
    try {
      if (row.op === 'content') {
        const before = this.store.getBlob(row.beforeBlob)
        const after = this.store.getBlob(row.afterBlob)
        const current = asContentText((await this.db.content(row.path)).value)
        if (!sameText(current, after) && !sameText(current, before)) {
          return { path: row.path, ok: false, error: 'diverged' }
        }
        if (!sameText(current, before)) await this.db.writeContent(row.path, before)
        this.store.markReverted(row.seq)
        return { path: row.path, ok: true }
      }
      const parts = splitRecordPath(row.path)
      if (row.op === 'create') {
        const live = await this.db.read?.(row.path).catch(() => null)
        if (!live?.value) {
          this.store.markReverted(row.seq)
          return { path: row.path, ok: true }
        }
        if (!parts || !this.db.remove) return { path: row.path, ok: false, error: 'cannot delete' }
        await this.db.remove(parts.collection, { ids: [parts.id] })
        this.store.markReverted(row.seq)
        return { path: row.path, ok: true }
      }
      if (row.op === 'update') {
        const live = asRecord((await this.db.read?.(row.path))?.value)
        if (!live) return { path: row.path, ok: false, error: 'missing' }
        const keys = Object.keys(row.afterMeta ?? {})
        const slice = (rec: Record<string, unknown>) => {
          const next: Record<string, unknown> = {}
          for (const key of keys) next[key] = rec[key] ?? null
          return next
        }
        const now = stableJson(slice(live))
        if (now !== stableJson(row.afterMeta) && now !== stableJson(row.beforeMeta)) {
          return { path: row.path, ok: false, error: 'diverged' }
        }
        if (!this.db.update) return { path: row.path, ok: false, error: 'cannot update' }
        if (now !== stableJson(row.beforeMeta)) await this.db.update(row.path, row.beforeMeta)
        this.store.markReverted(row.seq)
        return { path: row.path, ok: true }
      }
      if (!this.db.restoreRecord && !this.db.create) return { path: row.path, ok: false, error: 'cannot create' }
      const fields = row.beforeMeta ?? {}
      const text = this.store.getBlob(row.beforeBlob)
      if (this.db.restoreRecord) await this.db.restoreRecord(row.path, fields, text)
      else if (parts) await this.db.create(parts.collection, [{ ...fields, ...(text ? { content: text } : {}) }])
      else return { path: row.path, ok: false, error: 'cannot create' }
      this.store.markReverted(row.seq)
      return { path: row.path, ok: true }
    } catch (error) {
      return { path: row.path, ok: false, error: String(error) }
    }
  }

  private openTurn(sessionId: string) {
    const peek = this.ctx.get('sessions') as { peek?: (id: string) => { events?: Array<{ type?: string; turn?: number }> } | undefined } | undefined
    const events = peek?.peek?.(sessionId)?.events ?? []
    let turn: number | null = null
    for (const event of events) {
      if (event.type === 'turn/start' && typeof event.turn === 'number') turn = event.turn
      else if (event.type === 'turn/end') turn = null
    }
    return turn
  }

  private publishLatest(sessionId: string, turn: number) {
    this.publishChain = this.publishChain.then(
      () => this.publish(sessionId, turn),
      () => this.publish(sessionId, turn),
    )
    return this.publishChain
  }

  private async publish(sessionId: string, turn: number) {
    const files = this.store.summaries(sessionId, turn)
    const sessions = this.ctx.get('sessions') as { append?: (id: string, body: unknown) => Promise<unknown> } | undefined
    if (!sessions?.append || !files.length) return
    try {
      await sessions.append(sessionId, { type: 'content/edits', turn, files })
    } catch {
      /* session 可能尚未登记 */
    }
  }
}

declare module 'cordis' {
  interface Context {
    contentTurns: ContentTurnService
  }
}
