import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { allocateRecordId, recordBuiltinValues, type DbRecord } from '@biu/type-file-system'
import { currentTenantScope } from '@biu/host-plugin-loader/data-dir'

export const NOTICE_KINDS = ['approval', 'task', 'session'] as const
export type NoticeKind = (typeof NOTICE_KINDS)[number]

export type NoticeRow = {
  id: string
  title: string
  body: string
  kind: NoticeKind
  read: boolean
  href: string
  sourceKey: string
  accountId?: string
  workspaceId?: string
  /** 详情正文。资产通知是附件卡片数组，不放进摘要 body。 */
  content?: unknown
  createdAt: number
  updatedAt: number
}

export type NoticeInput = {
  title: string
  body?: string
  kind: NoticeKind
  href?: string
  sourceKey: string
  accountId?: string
  workspaceId?: string
  content?: unknown
}

const MAX_NOTICES = 80

function asKind(value: unknown): NoticeKind {
  return NOTICE_KINDS.includes(value as NoticeKind) ? (value as NoticeKind) : 'session'
}

export function noticeToRecord(row: NoticeRow): DbRecord {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    read: row.read,
    href: row.href,
    sourceKey: row.sourceKey,
    content: row.content ?? '',
    ...recordBuiltinValues({ createdAt: row.createdAt, updatedAt: row.updatedAt }),
  }
}

function parseRow(raw: unknown): NoticeRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const id = String(rec.id ?? '').trim()
  const title = String(rec.title ?? '').trim()
  const sourceKey = String(rec.sourceKey ?? '').trim()
  if (!id || !title || !sourceKey) return null
  const createdAt = Number(rec.createdAt) || Date.now()
  const accountId = typeof rec.accountId === 'string' ? rec.accountId.trim() : ''
  const workspaceId = typeof rec.workspaceId === 'string' ? rec.workspaceId.trim() : ''
  return {
    id,
    title,
    body: String(rec.body ?? ''),
    kind: asKind(rec.kind),
    read: rec.read === true,
    href: String(rec.href ?? ''),
    sourceKey,
    ...(accountId ? { accountId } : {}),
    ...(workspaceId ? { workspaceId } : {}),
    ...(Array.isArray(rec.content) ? { content: rec.content } : {}),
    createdAt,
    updatedAt: Number(rec.updatedAt) || createdAt,
  }
}

export class NoticesStore {
  private rows: NoticeRow[] = []
  private file = ''

  open(path: string) {
    this.file = path
    if (path === ':memory:') {
      this.rows = []
      return this
    }
    mkdirSync(dirname(path), { recursive: true })
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
      this.rows = Array.isArray(parsed) ? parsed.map(parseRow).filter((row): row is NoticeRow => Boolean(row)) : []
    } catch {
      this.rows = []
    }
    return this
  }

  private matchesTenant(row: NoticeRow, scope = currentTenantScope()) {
    const rowAcct = row.accountId ?? ''
    const rowWs = row.workspaceId ?? ''
    if (rowAcct !== scope.accountId) return false
    if (scope.workspaceId && rowWs && rowWs !== scope.workspaceId) return false
    if (!scope.workspaceId && rowWs) return false
    return true
  }

  list() {
    const scope = currentTenantScope()
    return this.rows.filter((row) => this.matchesTenant(row, scope)).sort((a, b) => b.createdAt - a.createdAt)
  }

  get(id: string) {
    const scope = currentTenantScope()
    return this.rows.find((row) => row.id === id && this.matchesTenant(row, scope)) ?? null
  }

  push(input: NoticeInput) {
    const title = input.title.trim()
    const sourceKey = input.sourceKey.trim()
    if (!title || !sourceKey) return null
    const scope = currentTenantScope()
    const accountId = (input.accountId ?? scope.accountId).trim()
    const workspaceId = (input.workspaceId ?? scope.workspaceId).trim()
    const targetScope = { accountId, workspaceId, key: `${accountId}\0${workspaceId}` }
    const unread = this.rows.find(
      (row) => row.sourceKey === sourceKey && !row.read && this.matchesTenant(row, targetScope),
    )
    if (unread) {
      unread.title = title
      unread.body = input.body?.trim() || unread.body
      unread.href = input.href?.trim() || unread.href
      if (input.content !== undefined) unread.content = input.content
      unread.updatedAt = Date.now()
      this.flush()
      return unread
    }
    const now = Date.now()
    const existing = new Set(this.rows.map((item) => item.id))
    let id = allocateRecordId()
    while (existing.has(id)) id = allocateRecordId()
    const row: NoticeRow = {
      id,
      title,
      body: input.body?.trim() || '',
      kind: input.kind,
      read: false,
      href: input.href?.trim() || '',
      sourceKey,
      ...(accountId ? { accountId } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      createdAt: now,
      updatedAt: now,
    }
    this.rows.unshift(row)
    const tenantRows = this.rows.filter((item) => this.matchesTenant(item, targetScope))
    if (tenantRows.length > MAX_NOTICES) {
      const extra = tenantRows.length - MAX_NOTICES
      const dropIds = new Set(
        tenantRows
          .filter((item) => item.read)
          .slice(-extra)
          .map((item) => item.id),
      )
      if (dropIds.size < extra) {
        for (const item of tenantRows.slice(-(extra - dropIds.size))) dropIds.add(item.id)
      }
      this.rows = this.rows.filter((item) => !dropIds.has(item.id))
    }
    this.flush()
    return row
  }

  update(id: string, patch: { read?: boolean }) {
    const row = this.get(id)
    if (!row) throw new Error('unknown notice')
    if (patch.read !== undefined) row.read = Boolean(patch.read)
    row.updatedAt = Date.now()
    this.flush()
    return row
  }

  remove(id: string) {
    const scope = currentTenantScope()
    const next = this.rows.filter((row) => !(row.id === id && this.matchesTenant(row, scope)))
    if (next.length === this.rows.length) throw new Error('unknown notice')
    this.rows = next
    this.flush()
  }

  markSourceRead(sourceKey: string) {
    const key = sourceKey.trim()
    if (!key) return 0
    const scope = currentTenantScope()
    let n = 0
    const now = Date.now()
    for (const row of this.rows) {
      if (row.sourceKey !== key || row.read || !this.matchesTenant(row, scope)) continue
      row.read = true
      row.updatedAt = now
      n += 1
    }
    if (n) this.flush()
    return n
  }

  clear() {
    const scope = currentTenantScope()
    const before = this.rows.length
    this.rows = this.rows.filter((row) => !this.matchesTenant(row, scope))
    const removed = before - this.rows.length
    if (!removed) return 0
    this.flush()
    return removed
  }

  private flushTimer: ReturnType<typeof setTimeout> | null = null

  private flush() {
    if (!this.file || this.file === ':memory:') return
    if (process.env.VITEST) {
      writeFileSync(this.file, `${JSON.stringify(this.rows)}\n`)
      return
    }
    if (this.flushTimer) return
    const target = this.file
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void writeFile(target, `${JSON.stringify(this.rows)}\n`).catch((error) =>
        console.warn('[notices-store] async flush failed', error),
      )
    }, 50)
    this.flushTimer.unref?.()
  }
}
