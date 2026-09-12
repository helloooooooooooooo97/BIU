import type { ContentEditSummary, WalActor, WalOp } from './wal-store.ts'
import { WalStore } from './wal-store.ts'

export type { ContentEditSummary } from './wal-store.ts'
export type ContentTurnFile = {
  path: string
  title: string
  before: string
  after: string
  reverted?: boolean
}

export type TurnOp =
  | { op: 'create'; path: string; title: string; record: Record<string, unknown>; reverted?: boolean }
  | { op: 'update'; path: string; title: string; before: Record<string, unknown>; after: Record<string, unknown>; reverted?: boolean }
  | { op: 'delete'; path: string; title: string; record: Record<string, unknown>; reverted?: boolean }

function agent(sessionId: string, turn: number): WalActor {
  return { kind: 'agent', sessionId, turn }
}

/** 兼容旧回合 API：底层已换成全局 WAL。 */
export class ContentTurnStore {
  private wal = new WalStore()

  open(path: string) {
    this.wal.open(path)
    return this
  }

  record(input: { sessionId: string; turn: number; path: string; title: string; before: string; after: string }) {
    this.wal.append({
      path: input.path,
      op: 'content',
      actor: agent(input.sessionId, input.turn),
      title: input.title,
      beforeText: input.before,
      afterText: input.after,
    })
  }

  recordOp(sessionId: string, turn: number, op: TurnOp) {
    if (op.op === 'create') {
      this.wal.append({
        path: op.path,
        op: 'create',
        actor: agent(sessionId, turn),
        title: op.title,
        afterMeta: op.record,
      })
      return
    }
    if (op.op === 'update') {
      this.wal.append({
        path: op.path,
        op: 'update',
        actor: agent(sessionId, turn),
        title: op.title,
        beforeMeta: op.before,
        afterMeta: op.after,
      })
      return
    }
    this.wal.append({
      path: op.path,
      op: 'delete',
      actor: agent(sessionId, turn),
      title: op.title,
      beforeMeta: op.record,
    })
  }

  markReverted(sessionId: string, turn: number, path?: string, kind?: ContentEditSummary['kind']) {
    const want = path?.trim()
    for (const row of this.wal.listTurn(sessionId, turn)) {
      if (row.reverted) continue
      if (want && row.path !== want) continue
      if (kind && row.op !== kind) continue
      this.wal.markReverted(row.seq)
    }
  }

  getFile(sessionId: string, turn: number, path: string) {
    const want = path.trim()
    const row = [...this.wal.listTurn(sessionId, turn)].reverse().find((item) => {
      if (item.op !== 'content') return false
      return item.path === want || item.path.endsWith(want) || want.endsWith(item.path)
    })
    if (!row) return null
    const file: ContentTurnFile = {
      path: row.path,
      title: row.title,
      before: this.wal.getBlob(row.beforeBlob),
      after: this.wal.getBlob(row.afterBlob),
    }
    if (row.reverted) file.reverted = true
    return file
  }

  listFiles(sessionId: string, turn: number) {
    return this.wal
      .listTurn(sessionId, turn)
      .filter((row) => row.op === 'content')
      .map((row) => this.getFile(sessionId, turn, row.path)!)
      .filter(Boolean)
  }

  listOps(sessionId: string, turn: number): TurnOp[] {
    return this.wal.listTurn(sessionId, turn).flatMap((row) => {
      if (row.op === 'content') return []
      if (row.op === 'create') {
        const item: TurnOp = { op: 'create', path: row.path, title: row.title, record: row.afterMeta ?? {} }
        if (row.reverted) item.reverted = true
        return [item]
      }
      if (row.op === 'update') {
        const item: TurnOp = {
          op: 'update',
          path: row.path,
          title: row.title,
          before: row.beforeMeta ?? {},
          after: row.afterMeta ?? {},
        }
        if (row.reverted) item.reverted = true
        return [item]
      }
      const item: TurnOp = { op: 'delete', path: row.path, title: row.title, record: row.beforeMeta ?? {} }
      if (row.reverted) item.reverted = true
      return [item]
    })
  }

  summaries(sessionId: string, turn: number): ContentEditSummary[] {
    return this.wal.summaries(sessionId, turn)
  }
}

export type { WalOp }
