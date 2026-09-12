import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { diffLineStats } from './line-diff.ts'

export type WalActor = {
  kind: 'user' | 'agent'
  sessionId?: string
  turn?: number
}

export type WalOp = 'create' | 'update' | 'delete' | 'content'

export type WalEntry = {
  seq: number
  ts: number
  path: string
  op: WalOp
  actor: WalActor
  parentSeq: number | null
  title: string
  beforeBlob?: string
  afterBlob?: string
  beforeMeta?: Record<string, unknown>
  afterMeta?: Record<string, unknown>
  reverted?: boolean
  folded?: boolean
}

export type ContentEditSummary = {
  path: string
  title: string
  added: number
  removed: number
  jump_line: number
  reverted?: boolean
  kind?: WalOp
}

type StoreShape = {
  seq: number
  entries: WalEntry[]
}

const MAX_ENTRIES = 4000

export function actorKey(actor: WalActor) {
  if (actor.kind === 'agent' && actor.sessionId) return `agent:${actor.sessionId}:${actor.turn ?? 0}`
  return 'user'
}

function hashText(text: string) {
  return createHash('sha1').update(text).digest('hex')
}

function blobName(hash: string) {
  return hash.replace(/[^a-f0-9]/gi, '') || 'empty'
}

export class WalStore {
  private file = ''
  private blobDir = ''
  private memoryBlobs = new Map<string, string>()
  private data: StoreShape = { seq: 0, entries: [] }
  private head = new Map<string, number>()

  open(path: string) {
    this.file = path
    this.blobDir = path === ':memory:' ? '' : path.replace(/\.json$/i, '') + '-blobs'
    this.memoryBlobs = new Map()
    this.head = new Map()
    if (path === ':memory:') {
      this.data = { seq: 0, entries: [] }
      return this
    }
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as StoreShape
      this.data = {
        seq: Number(raw.seq) || 0,
        entries: Array.isArray(raw.entries) ? raw.entries : [],
      }
    } catch {
      this.data = { seq: 0, entries: [] }
    }
    this.rebuildHead()
    return this
  }

  putBlob(value: string) {
    const text = value ?? ''
    const hash = hashText(text)
    if (this.file === ':memory:' || !this.blobDir) {
      this.memoryBlobs.set(hash, text)
      return hash
    }
    mkdirSync(this.blobDir, { recursive: true })
    const dest = join(this.blobDir, blobName(hash))
    if (!existsSync(dest)) writeFileSync(dest, text)
    return hash
  }

  getBlob(hash?: string) {
    if (!hash) return ''
    if (this.memoryBlobs.has(hash)) return this.memoryBlobs.get(hash) ?? ''
    if (this.blobDir) {
      try {
        return readFileSync(join(this.blobDir, blobName(hash)), 'utf8')
      } catch {
        return ''
      }
    }
    return ''
  }

  headSeq(path: string) {
    return this.head.get(path) ?? null
  }

  headEntry(path: string) {
    const seq = this.headSeq(path)
    if (seq == null) return null
    return this.data.entries.find((row) => row.seq === seq) ?? null
  }

  get(seq: number) {
    return this.data.entries.find((row) => row.seq === seq) ?? null
  }

  listTurn(sessionId: string, turn: number) {
    const sid = sessionId.trim()
    return this.data.entries.filter((row) => row.actor.kind === 'agent' && row.actor.sessionId === sid && row.actor.turn === turn)
  }

  append(input: {
    path: string
    op: WalOp
    actor: WalActor
    title: string
    beforeText?: string
    afterText?: string
    beforeMeta?: Record<string, unknown>
    afterMeta?: Record<string, unknown>
  }) {
    const path = input.path.trim()
    if (!path) return null
    const prev = this.headEntry(path)
    if (this.canFold(prev, input)) {
      const next = prev!
      if (input.op === 'content') {
        next.afterBlob = this.putBlob(input.afterText ?? '')
      } else if (input.op === 'update') {
        next.afterMeta = { ...(next.afterMeta ?? {}), ...(input.afterMeta ?? {}) }
        if (input.beforeMeta) {
          next.beforeMeta = { ...input.beforeMeta, ...(next.beforeMeta ?? {}) }
        }
      }
      next.ts = Date.now()
      next.folded = true
      next.title = input.title || next.title
      next.reverted = undefined
      this.flush()
      return next
    }
    this.data.seq += 1
    const entry: WalEntry = {
      seq: this.data.seq,
      ts: Date.now(),
      path,
      op: input.op,
      actor: input.actor,
      parentSeq: prev && !prev.reverted ? prev.seq : prev?.parentSeq ?? null,
      title: input.title || path,
    }
    if (input.op === 'content' || input.op === 'delete' || input.op === 'create') {
      if (input.beforeText != null) entry.beforeBlob = this.putBlob(input.beforeText)
      if (input.afterText != null) entry.afterBlob = this.putBlob(input.afterText)
    }
    if (input.beforeMeta) entry.beforeMeta = input.beforeMeta
    if (input.afterMeta) entry.afterMeta = input.afterMeta
    this.data.entries.push(entry)
    this.head.set(path, entry.seq)
    this.trim()
    this.flush()
    return entry
  }

  markReverted(seq: number) {
    const row = this.get(seq)
    if (!row) return
    row.reverted = true
    if (this.head.get(row.path) === seq) {
      const prev = [...this.data.entries].reverse().find((item) => item.path === row.path && !item.reverted && item.seq !== seq)
      if (prev) this.head.set(row.path, prev.seq)
      else this.head.delete(row.path)
    }
    this.flush()
  }

  summaries(sessionId: string, turn: number): ContentEditSummary[] {
    return this.listTurn(sessionId, turn).map((row) => this.toSummary(row))
  }

  toSummary(row: WalEntry): ContentEditSummary {
    if (row.op === 'content') {
      const stats = diffLineStats(this.getBlob(row.beforeBlob), this.getBlob(row.afterBlob))
      const item: ContentEditSummary = {
        path: row.path,
        title: row.title,
        added: stats.added,
        removed: stats.removed,
        jump_line: stats.jump_line,
        kind: 'content',
      }
      if (row.reverted) item.reverted = true
      return item
    }
    const item: ContentEditSummary = {
      path: row.path,
      title: row.title,
      added: row.op === 'create' ? 1 : 0,
      removed: row.op === 'delete' ? 1 : 0,
      jump_line: 1,
      kind: row.op,
    }
    if (row.reverted) item.reverted = true
    return item
  }

  private canFold(prev: WalEntry | null, input: { path: string; op: WalOp; actor: WalActor }) {
    if (!prev || prev.reverted) return false
    if (prev.path !== input.path) return false
    if (prev.op !== input.op) return false
    if (input.op === 'create' || input.op === 'delete') return false
    if (actorKey(prev.actor) !== actorKey(input.actor)) return false
    if (this.head.get(input.path) !== prev.seq) return false
    return true
  }

  private rebuildHead() {
    this.head = new Map()
    for (const row of this.data.entries) {
      if (!row.reverted) this.head.set(row.path, row.seq)
    }
  }

  private trim() {
    const extra = this.data.entries.length - MAX_ENTRIES
    if (extra <= 0) return
    const dropped = this.data.entries.splice(0, extra)
    const keep = new Set<string>()
    for (const row of this.data.entries) {
      if (row.beforeBlob) keep.add(row.beforeBlob)
      if (row.afterBlob) keep.add(row.afterBlob)
    }
    for (const row of dropped) {
      if (row.beforeBlob && !keep.has(row.beforeBlob)) this.dropBlob(row.beforeBlob)
      if (row.afterBlob && !keep.has(row.afterBlob)) this.dropBlob(row.afterBlob)
    }
    this.rebuildHead()
  }

  private dropBlob(hash: string) {
    this.memoryBlobs.delete(hash)
    if (!this.blobDir) return
    try {
      unlinkSync(join(this.blobDir, blobName(hash)))
    } catch {
      /* missing */
    }
  }

  private flush() {
    if (!this.file || this.file === ':memory:') return
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.data))
  }
}
