import { Service, type Context } from 'cordis'
import { currentSessionId } from '@biu/host-sessions/scope'
import type { ContentEditSummary, TurnOp } from './content-turn-store.ts'
import { ContentTurnStore } from './content-turn-store.ts'
import { asContentText } from './content-edit.ts'

type ContentDb = {
  content: (path: string) => Promise<{ value: unknown }>
  writeContent: (path: string, value: unknown) => Promise<{ value?: unknown } | unknown>
  update?: (path: string, content: unknown) => Promise<unknown>
  create?: (path: string, records: unknown) => Promise<unknown>
  remove?: (path: string, query: { ids: string[] }) => Promise<unknown>
  read?: (path: string) => Promise<{ value?: unknown }>
}

function sameText(left: string, right: string) {
  return left.replace(/\r\n/g, '\n') === right.replace(/\r\n/g, '\n')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function writableClone(row: Record<string, unknown>) {
  const next = { ...row }
  delete next.id
  delete next.createdAt
  delete next.updatedAt
  delete next.createdBy
  delete next.updatedBy
  return next
}

function splitRecordPath(path: string) {
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return null
  return { collection: `/${parts[0]}`, id: parts.slice(1).join('/') }
}

export class ContentTurnService extends Service {
  store = new ContentTurnStore()
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

  private scope() {
    if (this.reverting) return null
    const sessionId = String(currentSessionId() ?? '').trim()
    if (!sessionId) return null
    const turn = this.openTurn(sessionId)
    if (turn == null) return null
    return { sessionId, turn }
  }

  async recordEdit(path: string, before: string, after: string, title: string) {
    if (sameText(before, after)) return
    const scope = this.scope()
    if (!scope) return
    this.store.record({ ...scope, path, title, before, after })
    await this.publishLatest(scope.sessionId, scope.turn)
  }

  async recordCreate(path: string, title: string, record: Record<string, unknown>) {
    const scope = this.scope()
    if (!scope) return
    this.store.recordOp(scope.sessionId, scope.turn, { op: 'create', path, title, record })
    await this.publishLatest(scope.sessionId, scope.turn)
  }

  async recordUpdate(path: string, title: string, before: Record<string, unknown>, after: Record<string, unknown>) {
    if (JSON.stringify(before) === JSON.stringify(after)) return
    const scope = this.scope()
    if (!scope) return
    this.store.recordOp(scope.sessionId, scope.turn, { op: 'update', path, title, before, after })
    await this.publishLatest(scope.sessionId, scope.turn)
  }

  async recordDelete(path: string, title: string, record: Record<string, unknown>) {
    const scope = this.scope()
    if (!scope) return
    this.store.recordOp(scope.sessionId, scope.turn, { op: 'delete', path, title, record })
    await this.publishLatest(scope.sessionId, scope.turn)
  }

  async revert(sessionId: string, turn: number, path?: string, kind?: ContentEditSummary['kind']) {
    const sid = sessionId.trim()
    const want = path?.trim()
    const results: Array<{ path: string; ok: boolean; error?: string }> = []
    this.reverting = true
    try {
      const ops = this.store.listOps(sid, turn).slice().reverse()
      for (const op of ops) {
        if (op.reverted) continue
        if (want && op.path !== want) continue
        if (kind && kind !== 'content' && op.op !== kind) continue
        if (kind === 'content') continue
        results.push(await this.revertOp(sid, turn, op))
      }
      if (!kind || kind === 'content') {
        const files = want ? [this.store.getFile(sid, turn, want)].filter(Boolean) : this.store.listFiles(sid, turn)
        if (want && kind === 'content' && !files.length) {
          results.push({ path: want, ok: false, error: 'missing' })
        }
        for (const file of files) {
          if (!file || file.reverted) {
            if (file) results.push({ path: file.path, ok: true })
            continue
          }
          results.push(await this.revertContent(sid, turn, file.path, file.before, file.after))
        }
      }
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

  private async revertContent(sessionId: string, turn: number, path: string, before: string, after: string) {
    try {
      const current = asContentText((await this.db.content(path)).value)
      if (!sameText(current, after) && !sameText(current, before)) {
        return { path, ok: false, error: 'diverged' }
      }
      if (!sameText(current, before)) await this.db.writeContent(path, before)
      this.store.markReverted(sessionId, turn, path, 'content')
      return { path, ok: true }
    } catch (error) {
      return { path, ok: false, error: String(error) }
    }
  }

  private async revertOp(sessionId: string, turn: number, op: TurnOp) {
    try {
      const parts = splitRecordPath(op.path)
      if (op.op === 'create') {
        const live = await this.db.read?.(op.path).catch(() => null)
        if (!live?.value) {
          this.store.markReverted(sessionId, turn, op.path, 'create')
          return { path: op.path, ok: true }
        }
        if (!parts || !this.db.remove) return { path: op.path, ok: false, error: 'cannot delete' }
        await this.db.remove(parts.collection, { ids: [parts.id] })
        this.store.markReverted(sessionId, turn, op.path, 'create')
        return { path: op.path, ok: true }
      }
      if (op.op === 'update') {
        const live = asRecord((await this.db.read?.(op.path))?.value)
        if (!live) return { path: op.path, ok: false, error: 'missing' }
        const keys = Object.keys(op.after)
        const slice = (row: Record<string, unknown>) => {
          const next: Record<string, unknown> = {}
          for (const key of keys) next[key] = row[key] ?? null
          return next
        }
        const now = JSON.stringify(slice(live))
        if (now !== JSON.stringify(op.after) && now !== JSON.stringify(op.before)) {
          return { path: op.path, ok: false, error: 'diverged' }
        }
        if (!this.db.update) return { path: op.path, ok: false, error: 'cannot update' }
        if (now !== JSON.stringify(op.before)) await this.db.update(op.path, op.before)
        this.store.markReverted(sessionId, turn, op.path, 'update')
        return { path: op.path, ok: true }
      }
      if (!this.db.create || !parts) return { path: op.path, ok: false, error: 'cannot create' }
      await this.db.create(parts.collection, [writableClone(op.record)])
      this.store.markReverted(sessionId, turn, op.path, 'delete')
      return { path: op.path, ok: true }
    } catch (error) {
      return { path: op.path, ok: false, error: String(error) }
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
