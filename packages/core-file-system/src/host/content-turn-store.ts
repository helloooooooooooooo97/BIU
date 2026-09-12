import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { diffLineStats } from './line-diff.ts'

export type ContentTurnFile = {
  path: string
  title: string
  before: string
  after: string
  reverted?: boolean
}

export type ContentEditSummary = {
  path: string
  title: string
  added: number
  removed: number
  jump_line: number
  reverted?: boolean
}

type StoreShape = {
  sessions: Record<string, Record<string, Record<string, ContentTurnFile>>>
}

const MAX_SESSIONS = 40
const MAX_TURNS = 32

export class ContentTurnStore {
  private file = ''
  private data: StoreShape = { sessions: {} }

  open(path: string) {
    this.file = path
    if (path === ':memory:') {
      this.data = { sessions: {} }
      return this
    }
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as StoreShape
      this.data = raw?.sessions ? raw : { sessions: {} }
    } catch {
      this.data = { sessions: {} }
    }
    return this
  }

  record(input: { sessionId: string; turn: number; path: string; title: string; before: string; after: string }) {
    const sessionId = input.sessionId.trim()
    const path = input.path.trim()
    if (!sessionId || !path || !Number.isInteger(input.turn) || input.turn < 1) return
    const turns = (this.data.sessions[sessionId] ??= {})
    const files = (turns[String(input.turn)] ??= {})
    const prev = files[path]
    files[path] = {
      path,
      title: input.title || prev?.title || path,
      before: prev?.before ?? input.before,
      after: input.after,
    }
    this.trim(sessionId)
    this.flush()
  }

  markReverted(sessionId: string, turn: number, path?: string) {
    const files = this.data.sessions[sessionId.trim()]?.[String(turn)]
    if (!files) return
    const keys = path ? [path] : Object.keys(files)
    for (const key of keys) {
      const row = files[key]
      if (row) row.reverted = true
    }
    this.flush()
  }

  getFile(sessionId: string, turn: number, path: string) {
    return this.data.sessions[sessionId.trim()]?.[String(turn)]?.[path.trim()] ?? null
  }

  listFiles(sessionId: string, turn: number) {
    const files = this.data.sessions[sessionId.trim()]?.[String(turn)]
    return files ? Object.values(files) : []
  }

  summaries(sessionId: string, turn: number): ContentEditSummary[] {
    return this.listFiles(sessionId, turn)
      .map((row) => {
        const stats = diffLineStats(row.before, row.after)
        const item: ContentEditSummary = {
          path: row.path,
          title: row.title,
          added: stats.added,
          removed: stats.removed,
          jump_line: stats.jump_line,
        }
        if (row.reverted) item.reverted = true
        return item
      })
      .filter((row) => row.added > 0 || row.removed > 0 || row.reverted)
  }

  private trim(sessionId: string) {
    const ids = Object.keys(this.data.sessions)
    if (ids.length > MAX_SESSIONS) {
      for (const id of ids.slice(0, ids.length - MAX_SESSIONS)) delete this.data.sessions[id]
    }
    const turns = this.data.sessions[sessionId]
    if (!turns) return
    const keys = Object.keys(turns)
      .map(Number)
      .filter((n) => Number.isInteger(n))
      .sort((a, b) => a - b)
    while (keys.length > MAX_TURNS) {
      const drop = keys.shift()
      if (drop != null) delete turns[String(drop)]
    }
  }

  private flush() {
    if (!this.file || this.file === ':memory:') return
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.data))
  }
}
