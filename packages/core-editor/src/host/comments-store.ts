import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { recordBuiltinValues, type DbRecord } from '@biu/type-file-system'

export type CommentStatus = 'open' | 'resolved'

export type CommentAnchorEndpoint = {
  blockId: string
  quote: string
  prefix: string
  suffix: string
  offset: number
}

export type CommentAnchor = {
  blockId: string
  quote: string
  startQuote?: string
  originalQuote?: string
  prefix: string
  suffix: string
  offset: number
  end?: CommentAnchorEndpoint
}

export type CommentRow = {
  id: string
  title: string
  body: string
  targetPath: string
  threadId: string
  parentId: string
  status: CommentStatus
  anchor: CommentAnchor | null
  author: string
  createdAt: number
  updatedAt: number
}

export type CommentInput = {
  body: string
  targetPath: string
  threadId?: string
  parentId?: string
  status?: CommentStatus
  anchor?: CommentAnchor | string | null
  author?: string
}

function normalizeEndpoint(raw: unknown): CommentAnchorEndpoint | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const obj = raw as Record<string, unknown>
  const quote = String(obj.quote ?? '')
  const blockId = String(obj.blockId ?? '').trim()
  if (!quote && !blockId) return undefined
  return {
    blockId,
    quote,
    prefix: String(obj.prefix ?? ''),
    suffix: String(obj.suffix ?? ''),
    offset: Number.isFinite(Number(obj.offset)) ? Math.max(0, Math.round(Number(obj.offset))) : 0,
  }
}

export function normalizeCommentAnchor(value: unknown): CommentAnchor | null {
  let raw = value
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
      raw = JSON.parse(trimmed) as unknown
    } catch {
      return null
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const quote = String(obj.quote ?? '')
  const startQuote = typeof obj.startQuote === 'string' && obj.startQuote ? obj.startQuote : undefined
  const originalQuote = typeof obj.originalQuote === 'string' && obj.originalQuote ? obj.originalQuote : undefined
  const blockId = String(obj.blockId ?? '').trim()
  const prefix = String(obj.prefix ?? '')
  const suffix = String(obj.suffix ?? '')
  const offset = Number.isFinite(Number(obj.offset)) ? Math.max(0, Math.round(Number(obj.offset))) : 0
  const end = normalizeEndpoint(obj.end)
  if (!quote && !blockId) return null
  return {
    blockId,
    quote,
    ...(startQuote ? { startQuote } : {}),
    ...(originalQuote ? { originalQuote } : {}),
    prefix,
    suffix,
    offset,
    ...(end ? { end } : {}),
  }
}

export function normalizeCommentStatus(value: unknown): CommentStatus {
  return value === 'resolved' ? 'resolved' : 'open'
}

function summarizeBody(body: string) {
  const line = body.replace(/\s+/g, ' ').trim()
  return line.length > 60 ? `${line.slice(0, 60)}…` : line || '批注'
}

function nextCommentId() {
  return `cmt_${randomBytes(6).toString('hex')}`
}

export function commentToRecord(row: CommentRow): DbRecord {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    targetPath: row.targetPath,
    threadId: row.threadId,
    status: row.status,
    anchor: row.anchor ? JSON.stringify(row.anchor) : '',
    author: row.author,
    ...recordBuiltinValues(row),
  }
}

export class CommentsStore {
  private file = ''
  private rows: CommentRow[] = []

  open(path: string) {
    this.file = path
    this.rows = []
    try {
      const raw = readFileSync(path, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const row = this.fromRaw(item)
          if (row) this.rows.push(row)
        }
      }
    } catch {
      /* file may not exist yet */
    }
    return this
  }

  list(targetPath?: string): CommentRow[] {
    if (!targetPath) return [...this.rows]
    const norm = targetPath.trim()
    return this.rows.filter((row) => row.targetPath === norm)
  }

  get(id: string): CommentRow | null {
    return this.rows.find((row) => row.id === id) ?? null
  }

  create(input: CommentInput): CommentRow {
    const now = Date.now()
    const id = nextCommentId()
    const body = String(input.body ?? '').trim()
    const targetPath = String(input.targetPath ?? '').trim()
    const parentId = String(input.parentId ?? '').trim()
    const threadId = String(input.threadId ?? '').trim() || parentId || id
    const anchor = normalizeCommentAnchor(input.anchor)
    const row: CommentRow = {
      id,
      title: summarizeBody(body),
      body,
      targetPath,
      threadId,
      parentId,
      status: normalizeCommentStatus(input.status),
      anchor,
      author: String(input.author ?? '').trim() || '用户',
      createdAt: now,
      updatedAt: now,
    }
    this.rows.push(row)
    this.persist()
    return row
  }

  update(
    id: string,
    patch: {
      body?: string
      status?: CommentStatus
      anchor?: CommentAnchor | string | null
    },
  ): CommentRow {
    const idx = this.rows.findIndex((row) => row.id === id)
    if (idx < 0) throw new Error(`unknown comment: ${id}`)
    const cur = this.rows[idx]!
    const body = patch.body !== undefined ? String(patch.body).trim() : cur.body
    const status = patch.status !== undefined ? normalizeCommentStatus(patch.status) : cur.status
    const anchor = patch.anchor !== undefined ? normalizeCommentAnchor(patch.anchor) : cur.anchor
    const next: CommentRow = {
      ...cur,
      title: summarizeBody(body),
      body,
      status,
      anchor,
      updatedAt: Date.now(),
    }
    this.rows[idx] = next
    this.persist()
    return next
  }

  remove(id: string): boolean {
    const target = this.rows.find((row) => row.id === id)
    if (!target) return false
    const isRoot = !target.parentId && target.threadId === target.id
    this.rows = this.rows.filter((row) => {
      if (row.id === id) return false
      if (isRoot && row.threadId === id) return false
      return true
    })
    this.persist()
    return true
  }

  private fromRaw(item: unknown): CommentRow | null {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const obj = item as Record<string, unknown>
    const id = String(obj.id ?? '').trim()
    if (!id) return null
    const body = String(obj.body ?? '')
    const parentId = String(obj.parentId ?? '').trim()
    const threadId = String(obj.threadId ?? '').trim() || parentId || id
    return {
      id,
      title: String(obj.title ?? '').trim() || summarizeBody(body),
      body,
      targetPath: String(obj.targetPath ?? '').trim(),
      threadId,
      parentId,
      status: normalizeCommentStatus(obj.status),
      anchor: normalizeCommentAnchor(obj.anchor),
      author: String(obj.author ?? '').trim() || '用户',
      createdAt: Number(obj.createdAt) || 0,
      updatedAt: Number(obj.updatedAt) || 0,
    }
  }

  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private dirEnsured = false

  private persist() {
    if (!this.file) return
    const payload = JSON.stringify(this.rows)
    if (process.env.VITEST) {
      if (!this.dirEnsured) {
        mkdirSync(dirname(this.file), { recursive: true })
        this.dirEnsured = true
      }
      writeFileSync(this.file, payload, 'utf8')
      return
    }
    if (this.flushTimer) return
    const target = this.file
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      const latest = JSON.stringify(this.rows)
      const ensure = this.dirEnsured
        ? Promise.resolve()
        : mkdir(dirname(target), { recursive: true }).then(() => {
            this.dirEnsured = true
          })
      void ensure
        .then(() => writeFile(target, latest, 'utf8'))
        .catch((error) => console.warn('[comments-store] async persist failed', error))
    }, 50)
    this.flushTimer.unref?.()
  }
}
