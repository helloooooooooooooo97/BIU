import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { normalizeCollectionPath } from '../paths.ts'
import type { ShareKind, ShareRecord } from '../share-snapshot.ts'

export type { ShareKind, ShareRecord } from '../share-snapshot.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

const SHARE_PUBLIC_COLUMNS =
  'token, kind, collection, view_id, record_id, rule_id, password_hash, share_plugins, allow_copy, workspace_id, created_by, created_at, updated_at'

type ShareRow = {
  token: string
  kind: string
  collection: string
  view_id: string
  record_id: string
  rule_id?: string
  password_salt: string
  password_hash: string
  share_plugins: number
  allow_copy: number
  workspace_id?: string
  created_by?: string
  created_at: number
  updated_at: number
}

function mintToken() {
  return randomBytes(18).toString('base64url')
}

function hashPassword(password: string, salt = randomBytes(16)) {
  return { salt: salt.toString('hex'), hash: scryptSync(password, salt, 32).toString('hex') }
}

function asKind(value: unknown): ShareKind | '' {
  return value === 'record' || value === 'rule' ? value : ''
}

function publicShare(row: ShareRow): ShareRecord {
  return {
    token: row.token,
    kind: asKind(row.kind) || 'record',
    collection: row.collection,
    viewId: row.view_id,
    recordId: row.record_id,
    ...(row.rule_id ? { ruleId: row.rule_id } : {}),
    hasPassword: Boolean(row.password_hash),
    sharePlugins: Boolean(row.share_plugins),
    allowCopy: row.allow_copy !== 0,
    ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  }
}

export class SharesStore {
  private db: DatabaseSync | null = null

  open(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = openAndMigrateBiu(path, { foreignKeys: false })
    this.ensureFlagColumns()
    return this
  }

  private ensureFlagColumns() {
    const db = this.db
    if (!db) return
    const cols = db.prepare('PRAGMA table_info(shares)').all() as Array<{ name: string }>
    const names = new Set(cols.map((col) => col.name))
    if (!names.has('share_plugins')) db.exec('ALTER TABLE shares ADD COLUMN share_plugins INTEGER NOT NULL DEFAULT 0')
    if (!names.has('allow_copy')) db.exec('ALTER TABLE shares ADD COLUMN allow_copy INTEGER NOT NULL DEFAULT 1')
    if (!names.has('workspace_id')) db.exec(`ALTER TABLE shares ADD COLUMN workspace_id TEXT NOT NULL DEFAULT ''`)
    if (!names.has('created_by')) db.exec(`ALTER TABLE shares ADD COLUMN created_by TEXT NOT NULL DEFAULT ''`)
    if (!names.has('rule_id')) {
      db.exec(`ALTER TABLE shares ADD COLUMN rule_id TEXT NOT NULL DEFAULT ''`)
      db.exec('DROP INDEX IF EXISTS shares_target')
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS shares_target ON shares(kind, collection, view_id, record_id, rule_id)')
    }
  }

  private conn() {
    if (!this.db) this.open(':memory:')
    return this.db!
  }

  get(token: string): ShareRecord | null {
    const row = this.conn().prepare(`SELECT ${SHARE_PUBLIC_COLUMNS} FROM shares WHERE token = ?`).get(token) as ShareRow | undefined
    return row ? publicShare(row) : null
  }

  find(kind: ShareKind, collection: string, viewId = '', recordId = '', ruleId = ''): ShareRecord | null {
    const row = this.conn().prepare(
      `SELECT ${SHARE_PUBLIC_COLUMNS} FROM shares WHERE kind = ? AND collection = ? AND view_id = ? AND record_id = ? AND rule_id = ?`,
    ).get(kind, normalizeCollectionPath(collection), viewId, recordId, ruleId) as ShareRow | undefined
    return row ? publicShare(row) : null
  }

  findRule(collection: string, ruleId: string): ShareRecord | null {
    const id = String(ruleId ?? '').trim()
    if (!id) return null
    const row = this.conn().prepare(
      `SELECT ${SHARE_PUBLIC_COLUMNS} FROM shares WHERE kind = ? AND collection = ? AND rule_id = ? ORDER BY updated_at DESC LIMIT 1`,
    ).get('rule', normalizeCollectionPath(collection), id) as ShareRow | undefined
    return row ? publicShare(row) : null
  }

  /** 记录分享会带上当时的视图 id，归属判断不能只查空 view_id。 */
  findRecord(collection: string, recordId: string): ShareRecord | null {
    const id = String(recordId ?? '').trim()
    if (!id) return null
    const row = this.conn().prepare(
      `SELECT ${SHARE_PUBLIC_COLUMNS} FROM shares WHERE kind = ? AND collection = ? AND record_id = ? ORDER BY updated_at DESC LIMIT 1`,
    ).get('record', normalizeCollectionPath(collection), id) as ShareRow | undefined
    return row ? publicShare(row) : null
  }

  verifyPassword(token: string, password: string) {
    const row = this.conn().prepare('SELECT password_salt, password_hash FROM shares WHERE token = ?').get(token) as
      | { password_salt: string; password_hash: string }
      | undefined
    if (!row) return false
    if (!row.password_hash) return true
    const salt = Buffer.from(row.password_salt, 'hex')
    const expected = Buffer.from(row.password_hash, 'hex')
    const actual = scryptSync(String(password ?? ''), salt, expected.length)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }

  upsert(input: {
    kind: ShareKind
    collection: string
    viewId?: string
    recordId?: string
    ruleId?: string
    password?: string | null
    sharePlugins?: boolean
    allowCopy?: boolean
    workspaceId?: string
    createdBy?: string
  }): ShareRecord {
    const kind = asKind(input.kind)
    if (!kind) throw new Error('invalid share kind')
    const collection = normalizeCollectionPath(input.collection)
    if (!collection || collection === '/') throw new Error('invalid collection')
    const requestedViewId = kind === 'rule' ? '' : String(input.viewId ?? '').trim()
    const recordId = kind === 'rule' ? '' : String(input.recordId ?? '').trim()
    const ruleId = kind === 'rule' ? String(input.ruleId ?? '').trim() : ''
    if (kind === 'record' && !recordId) throw new Error('record share needs recordId')
    if (kind === 'rule' && !ruleId) throw new Error('rule share needs ruleId')
    const now = Date.now()
    const existing = kind === 'record'
      ? this.findRecord(collection, recordId)
      : kind === 'rule'
        ? this.findRule(collection, ruleId)
        : this.find(kind, collection, requestedViewId, recordId, '')
    const viewId = existing?.kind === 'record' ? existing.viewId : requestedViewId
    let salt = ''
    let hash = ''
    if (input.password === undefined) {
      if (existing) {
        const row = this.conn().prepare('SELECT password_salt, password_hash FROM shares WHERE token = ?').get(existing.token) as ShareRow
        salt = row.password_salt
        hash = row.password_hash
      }
    } else if (input.password) {
      const next = hashPassword(input.password)
      salt = next.salt
      hash = next.hash
    }
    const sharePlugins = input.sharePlugins ?? existing?.sharePlugins ?? false
    const allowCopy = input.allowCopy ?? existing?.allowCopy ?? true
    const workspaceId = String(input.workspaceId ?? existing?.workspaceId ?? '').trim()
    const createdBy = String(existing?.createdBy || input.createdBy || '').trim()
    const token = existing?.token ?? mintToken()
    this.conn().prepare(`
      INSERT INTO shares (token, kind, collection, view_id, record_id, rule_id, password_salt, password_hash, share_plugins, allow_copy, workspace_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(kind, collection, view_id, record_id, rule_id) DO UPDATE SET
        password_salt=excluded.password_salt,
        password_hash=excluded.password_hash,
        share_plugins=excluded.share_plugins,
        allow_copy=excluded.allow_copy,
        workspace_id=CASE WHEN shares.workspace_id = '' THEN excluded.workspace_id ELSE shares.workspace_id END,
        created_by=CASE WHEN shares.created_by = '' THEN excluded.created_by ELSE shares.created_by END,
        updated_at=excluded.updated_at
    `).run(
      token,
      kind,
      collection,
      viewId,
      recordId,
      ruleId,
      salt,
      hash,
      sharePlugins ? 1 : 0,
      allowCopy ? 1 : 0,
      workspaceId,
      createdBy,
      existing?.createdAt ?? now,
      now,
    )
    return this.get(token)!
  }

  revokeByCreator(workspaceId: string, createdBy: string) {
    if (!createdBy) return
    if (workspaceId) {
      this.conn().prepare('DELETE FROM shares WHERE workspace_id = ? AND created_by = ?').run(workspaceId, createdBy)
    } else {
      this.conn().prepare('DELETE FROM shares WHERE created_by = ?').run(createdBy)
    }
  }

  revoke(token: string) {
    this.conn().prepare('DELETE FROM shares WHERE token = ?').run(token)
  }

  revokeTarget(kind: ShareKind, collection: string, viewId = '', recordId = '', ruleId = '') {
    this.conn().prepare(
      'DELETE FROM shares WHERE kind = ? AND collection = ? AND view_id = ? AND record_id = ? AND rule_id = ?',
    ).run(kind, normalizeCollectionPath(collection), viewId, recordId, ruleId)
  }

  revokeRule(collection: string, ruleId: string) {
    const id = String(ruleId ?? '').trim()
    if (!id) return
    this.conn().prepare('DELETE FROM shares WHERE kind = ? AND collection = ? AND rule_id = ?').run(
      'rule',
      normalizeCollectionPath(collection),
      id,
    )
  }

  listRules(collection: string): ShareRecord[] {
    const rows = this.conn().prepare(
      `SELECT ${SHARE_PUBLIC_COLUMNS} FROM shares WHERE kind = ? AND collection = ? ORDER BY updated_at DESC, token DESC`,
    ).all('rule', normalizeCollectionPath(collection)) as ShareRow[]
    return rows.map(publicShare)
  }

  revokeRecord(collection: string, recordId: string) {
    const id = String(recordId ?? '').trim()
    if (!id) return
    this.conn().prepare('DELETE FROM shares WHERE kind = ? AND collection = ? AND record_id = ?').run(
      'record',
      normalizeCollectionPath(collection),
      id,
    )
  }

  list(): ShareRecord[] {
    const rows = this.conn().prepare(
      `SELECT ${SHARE_PUBLIC_COLUMNS} FROM shares WHERE kind IN ('record', 'rule') ORDER BY updated_at DESC, token DESC`,
    ).all() as ShareRow[]
    return rows.map(publicShare)
  }

  listRecords(collection: string): ShareRecord[] {
    const rows = this.conn().prepare(
      `SELECT ${SHARE_PUBLIC_COLUMNS} FROM shares WHERE kind = ? AND collection = ? ORDER BY updated_at DESC, token DESC`,
    ).all('record', normalizeCollectionPath(collection)) as ShareRow[]
    return rows.map(publicShare)
  }
}
