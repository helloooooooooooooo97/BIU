import { diffLineStats } from './line-diff.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export type PageRevisionOp = 'create' | 'content' | 'fields' | 'mixed' | 'restore'
export type PageRevisionActorKind = 'user' | 'agent'

export type PageRevisionActor = {
  kind: PageRevisionActorKind
  id: string
  name: string
  sessionId?: string
}

export type PageRevisionFieldChange = {
  field: string
  label: string
  before: unknown
  after: unknown
}

export type PageRevisionSummary = {
  id: number
  recordId: string
  version: number
  op: PageRevisionOp
  actorKind: PageRevisionActorKind
  actorId: string
  actorName: string
  sessionId: string
  title: string
  changes: PageRevisionFieldChange[]
  addedLines: number
  removedLines: number
  summary: string
  createdAt: number
  updatedAt: number
}

export type PageRevisionDetail = PageRevisionSummary & {
  body: string
  prevBody: string
  fields: Record<string, unknown>
  prevFields: Record<string, unknown>
  prevVersion: number | null
}

type RawRevisionRow = {
  id: number
  record_id: string
  version: number
  op: string
  actor_kind: string
  actor_id: string
  actor_name: string
  session_id: string
  title: string
  body: string
  fields_json: string
  changes_json: string
  added_lines: number
  removed_lines: number
  summary: string
  created_at: number
  updated_at: number
}

export type RecordPageRevisionInput = {
  recordId: string
  op: PageRevisionOp
  actor: PageRevisionActor
  title: string
  body: string
  fields: Record<string, unknown>
  changes?: PageRevisionFieldChange[]
  restoreFromVersion?: number
  now?: number
}

export const USER_COALESCE_WINDOW_MS = 5 * 60 * 1000
export const AGENT_COALESCE_WINDOW_MS = 15 * 1000
export const MAX_REVISIONS_PER_PAGE = 150

function normalizeText(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function stableJson(value: unknown): string {
  if (value === undefined) return 'undefined'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    /* ignore */
  }
  return {}
}

function parseJsonChanges(raw: string): PageRevisionFieldChange[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        field: String(item.field ?? ''),
        label: String(item.label ?? item.field ?? ''),
        before: item.before ?? null,
        after: item.after ?? null,
      }))
      .filter((item) => Boolean(item.field))
  } catch {
    return []
  }
}

function asOp(raw: string): PageRevisionOp {
  if (raw === 'create' || raw === 'content' || raw === 'fields' || raw === 'mixed' || raw === 'restore') return raw
  return 'fields'
}

function asActorKind(raw: string): PageRevisionActorKind {
  return raw === 'agent' ? 'agent' : 'user'
}

function rowToSummary(row: RawRevisionRow): PageRevisionSummary {
  return {
    id: Number(row.id),
    recordId: row.record_id,
    version: Number(row.version),
    op: asOp(row.op),
    actorKind: asActorKind(row.actor_kind),
    actorId: row.actor_id,
    actorName: row.actor_name,
    sessionId: row.session_id,
    title: row.title,
    changes: parseJsonChanges(row.changes_json),
    addedLines: Number(row.added_lines) || 0,
    removedLines: Number(row.removed_lines) || 0,
    summary: row.summary,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function mergeFieldChanges(
  existing: PageRevisionFieldChange[],
  incoming: PageRevisionFieldChange[],
): PageRevisionFieldChange[] {
  const byField = new Map<string, PageRevisionFieldChange>()
  for (const item of existing) {
    byField.set(item.field, { ...item })
  }
  for (const next of incoming) {
    const prev = byField.get(next.field)
    if (!prev) {
      if (stableJson(next.before) !== stableJson(next.after)) {
        byField.set(next.field, { ...next })
      }
      continue
    }
    if (stableJson(prev.before) === stableJson(next.after)) {
      byField.delete(next.field)
    } else {
      byField.set(next.field, {
        field: next.field,
        label: next.label || prev.label,
        before: prev.before,
        after: next.after,
      })
    }
  }
  return [...byField.values()]
}

export function buildRevisionSummary(opts: {
  op: PageRevisionOp
  changes: PageRevisionFieldChange[]
  addedLines: number
  removedLines: number
  bodyChanged: boolean
  restoreFromVersion?: number
}): string {
  if (opts.op === 'create') return '创建了页面'
  if (opts.op === 'restore') {
    return opts.restoreFromVersion ? `恢复到版本 #${opts.restoreFromVersion}` : '恢复历史版本'
  }
  const parts: string[] = []
  if (opts.changes.length) {
    const labels = opts.changes.map((item) => item.label || item.field)
    if (labels.length === 1) {
      parts.push(`修改了${labels[0]}`)
    } else if (labels.length <= 3) {
      parts.push(`修改了${labels.join('、')}`)
    } else {
      parts.push(`修改了${labels.slice(0, 2).join('、')}等 ${labels.length} 项`)
    }
  }
  if (opts.bodyChanged) {
    if (opts.addedLines > 0 || opts.removedLines > 0) {
      const diffBits: string[] = []
      if (opts.addedLines > 0) diffBits.push(`+${opts.addedLines}`)
      if (opts.removedLines > 0) diffBits.push(`-${opts.removedLines}`)
      parts.push(`编辑了正文（${diffBits.join(' ')} 行）`)
    } else {
      parts.push('编辑了正文')
    }
  }
  return parts.join(' · ') || '更新了页面'
}

function ensureTable(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS page_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      op TEXT NOT NULL DEFAULT 'fields',
      actor_kind TEXT NOT NULL DEFAULT 'user',
      actor_id TEXT NOT NULL DEFAULT '',
      actor_name TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      fields_json TEXT NOT NULL DEFAULT '{}',
      changes_json TEXT NOT NULL DEFAULT '[]',
      added_lines INTEGER NOT NULL DEFAULT 0,
      removed_lines INTEGER NOT NULL DEFAULT 0,
      summary TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS page_revisions_record_version
      ON page_revisions(record_id, version DESC);
    CREATE INDEX IF NOT EXISTS page_revisions_record_updated
      ON page_revisions(record_id, updated_at DESC);
  `)
}

export class PageRevisionStore {
  private ensuredDbs = new WeakSet<DatabaseSync>()

  private prepareDb(db: DatabaseSync) {
    if (!this.ensuredDbs.has(db)) {
      ensureTable(db)
      this.ensuredDbs.add(db)
    }
    return db
  }

  private latestTwo(db: DatabaseSync, recordId: string): RawRevisionRow[] {
    return db
      .prepare(
        `SELECT id, record_id, version, op, actor_kind, actor_id, actor_name, session_id,
                title, body, fields_json, changes_json, added_lines, removed_lines, summary,
                created_at, updated_at
         FROM page_revisions
         WHERE record_id = ?
         ORDER BY version DESC, id DESC
         LIMIT 2`,
      )
      .all(recordId) as unknown as RawRevisionRow[]
  }

  record(db: DatabaseSync, input: RecordPageRevisionInput): PageRevisionSummary | null {
    this.prepareDb(db)
    const recordId = input.recordId.trim()
    if (!recordId) return null
    const now = input.now ?? Date.now()
    const body = normalizeText(input.body ?? '')
    const title = String(input.title ?? '').trim()
    const actorKind: PageRevisionActorKind = input.actor.kind === 'agent' ? 'agent' : 'user'
    const actorId = String(input.actor.id ?? '').trim()
    const actorName = String(input.actor.name ?? '').trim() || (actorKind === 'agent' ? 'Agent' : '本地账户')
    const sessionId = String(input.actor.sessionId ?? '').trim()
    const incomingChanges = (input.changes ?? []).filter((item) => stableJson(item.before) !== stableJson(item.after))

    const topTwo = this.latestTwo(db, recordId)
    const latest = topTwo[0] ?? null
    const beforeLatest = topTwo[1] ?? null

    const prevBody = latest ? normalizeText(latest.body) : ''
    const bodyChangedFromLatest = latest ? prevBody !== body : body.length > 0
    if (
      input.op !== 'create' &&
      input.op !== 'restore' &&
      !bodyChangedFromLatest &&
      incomingChanges.length === 0
    ) {
      return null
    }

    const windowMs = actorKind === 'agent' ? AGENT_COALESCE_WINDOW_MS : USER_COALESCE_WINDOW_MS
    const canCoalesce =
      Boolean(latest) &&
      input.op !== 'create' &&
      input.op !== 'restore' &&
      latest!.op !== 'create' &&
      latest!.op !== 'restore' &&
      latest!.actor_kind === actorKind &&
      latest!.actor_id === actorId &&
      latest!.session_id === sessionId &&
      now - Number(latest!.updated_at) <= windowMs &&
      now >= Number(latest!.updated_at)

    if (canCoalesce && latest) {
      const baselineBody = beforeLatest ? normalizeText(beforeLatest.body) : ''
      const bodyStats = diffLineStats(baselineBody, body)
      const bodyChanged = beforeLatest ? baselineBody !== body : body.length > 0
      const mergedChanges = mergeFieldChanges(parseJsonChanges(latest.changes_json), incomingChanges)
      const nextOp: PageRevisionOp =
        bodyChanged && mergedChanges.length > 0
          ? 'mixed'
          : bodyChanged
            ? 'content'
            : mergedChanges.length > 0
              ? 'fields'
              : asOp(latest.op)
      const summary = buildRevisionSummary({
        op: nextOp,
        changes: mergedChanges,
        addedLines: bodyStats.added,
        removedLines: bodyStats.removed,
        bodyChanged,
      })
      db.prepare(
        `UPDATE page_revisions
         SET op = ?, actor_name = ?, title = ?, body = ?, fields_json = ?, changes_json = ?,
             added_lines = ?, removed_lines = ?, summary = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        nextOp,
        actorName,
        title,
        body,
        JSON.stringify(input.fields ?? {}),
        JSON.stringify(mergedChanges),
        bodyStats.added,
        bodyStats.removed,
        summary,
        now,
        latest.id,
      )
      return {
        id: Number(latest.id),
        recordId,
        version: Number(latest.version),
        op: nextOp,
        actorKind,
        actorId,
        actorName,
        sessionId,
        title,
        changes: mergedChanges,
        addedLines: bodyStats.added,
        removedLines: bodyStats.removed,
        summary,
        createdAt: Number(latest.created_at),
        updatedAt: now,
      }
    }

    const version = (latest ? Number(latest.version) : 0) + 1
    const bodyStats = diffLineStats(prevBody, body)
    const effectiveOp: PageRevisionOp =
      input.op === 'create' || input.op === 'restore'
        ? input.op
        : bodyChangedFromLatest && incomingChanges.length > 0
          ? 'mixed'
          : bodyChangedFromLatest
            ? 'content'
            : 'fields'
    const summary = buildRevisionSummary({
      op: effectiveOp,
      changes: incomingChanges,
      addedLines: bodyStats.added,
      removedLines: bodyStats.removed,
      bodyChanged: bodyChangedFromLatest,
      restoreFromVersion: input.restoreFromVersion,
    })

    const res = db
      .prepare(
        `INSERT INTO page_revisions
          (record_id, version, op, actor_kind, actor_id, actor_name, session_id,
           title, body, fields_json, changes_json, added_lines, removed_lines, summary,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        recordId,
        version,
        effectiveOp,
        actorKind,
        actorId,
        actorName,
        sessionId,
        title,
        body,
        JSON.stringify(input.fields ?? {}),
        JSON.stringify(incomingChanges),
        bodyStats.added,
        bodyStats.removed,
        summary,
        now,
        now,
      )
    this.prune(db, recordId)
    return {
      id: Number(res.lastInsertRowid),
      recordId,
      version,
      op: effectiveOp,
      actorKind,
      actorId,
      actorName,
      sessionId,
      title,
      changes: incomingChanges,
      addedLines: bodyStats.added,
      removedLines: bodyStats.removed,
      summary,
      createdAt: now,
      updatedAt: now,
    }
  }

  list(db: DatabaseSync, recordId: string, opts?: { limit?: number; offset?: number }) {
    this.prepareDb(db)
    const id = recordId.trim()
    const limit = Math.min(Math.max(Number(opts?.limit) || 50, 1), 200)
    const offset = Math.max(Number(opts?.offset) || 0, 0)
    const totalRow = db
      .prepare('SELECT COUNT(*) AS n FROM page_revisions WHERE record_id = ?')
      .get(id) as { n?: number } | undefined
    const rows = db
      .prepare(
        `SELECT id, record_id, version, op, actor_kind, actor_id, actor_name, session_id,
                title, '' AS body, '{}' AS fields_json, changes_json, added_lines, removed_lines, summary,
                created_at, updated_at
         FROM page_revisions
         WHERE record_id = ?
         ORDER BY version DESC, id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(id, limit, offset) as unknown as RawRevisionRow[]
    return {
      items: rows.map(rowToSummary),
      total: Number(totalRow?.n ?? 0),
    }
  }

  get(db: DatabaseSync, recordId: string, revisionId: number): PageRevisionDetail | null {
    this.prepareDb(db)
    const id = recordId.trim()
    const row = db
      .prepare(
        `SELECT id, record_id, version, op, actor_kind, actor_id, actor_name, session_id,
                title, body, fields_json, changes_json, added_lines, removed_lines, summary,
                created_at, updated_at
         FROM page_revisions
         WHERE record_id = ? AND id = ?`,
      )
      .get(id, revisionId) as unknown as RawRevisionRow | undefined
    if (!row) return null
    const prev = db
      .prepare(
        `SELECT version, body, fields_json
         FROM page_revisions
         WHERE record_id = ? AND version < ?
         ORDER BY version DESC, id DESC
         LIMIT 1`,
      )
      .get(id, row.version) as { version?: number; body?: string; fields_json?: string } | undefined
    return {
      ...rowToSummary(row),
      body: row.body,
      prevBody: prev?.body ?? '',
      fields: parseJsonObject(row.fields_json),
      prevFields: prev?.fields_json ? parseJsonObject(prev.fields_json) : {},
      prevVersion: prev?.version != null ? Number(prev.version) : null,
    }
  }

  deleteForRecord(db: DatabaseSync, recordId: string) {
    this.prepareDb(db)
    db.prepare('DELETE FROM page_revisions WHERE record_id = ?').run(recordId.trim())
  }

  private prune(db: DatabaseSync, recordId: string) {
    db.prepare(
      `DELETE FROM page_revisions
       WHERE record_id = ?
         AND id NOT IN (
           SELECT id FROM page_revisions
           WHERE record_id = ?
           ORDER BY version DESC, id DESC
           LIMIT ?
         )`,
    ).run(recordId, recordId, MAX_REVISIONS_PER_PAGE)
  }
}
