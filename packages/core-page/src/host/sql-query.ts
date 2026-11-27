import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import type {
  CollectionGroupBucket,
  CollectionGroupQuery,
  CollectionListPageQuery,
  CollectionListPageResult,
} from '@biu/type-file-system'
import { emptySchemaValue } from '@biu/type-file-system'
import type { PageRow } from './store.ts'

const ID_RE = /^[A-Za-z0-9._-]+$/
const TAG_FLAT_PREFIX = 'tag::'
const MAX_SQL_IN_IDS = 5000

export type SqlPageRow = {
  id: string
  title: string
  parent_id: string | null
  depends_on_json: string
  emoji: string
  created_at: number
  updated_at: number
}

function parseTagFlatKey(key: string): { packId: string; fieldKey: string } | null {
  if (!key.startsWith(TAG_FLAT_PREFIX)) return null
  const rest = key.slice(TAG_FLAT_PREFIX.length)
  const split = rest.indexOf('::')
  if (split <= 0) return null
  const packId = rest.slice(0, split)
  const fieldKey = rest.slice(split + 2)
  return packId && fieldKey ? { packId, fieldKey } : null
}

function parseJsonList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

export function rowFromSql(row: SqlPageRow): PageRow {
  return {
    id: row.id,
    title: row.title,
    tags: [],
    notes: '',
    parentId: row.parent_id == null || row.parent_id === '' ? null : String(row.parent_id),
    dependsOn: parseJsonList(row.depends_on_json ?? '[]'),
    tag: emptySchemaValue(),
    emoji: row.emoji ?? '',
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  }
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
    .get(name)
  return Boolean(row)
}

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

/** 将搜索词转成安全的 FTS5 前缀查询表达式（例如 "hello world" -> '"hello"* "world"*'）。含 CJK 子串时交由 SQL LIKE 保证任意中文字段子串精确命中。 */
export function buildFtsMatchQuery(raw: string): string | null {
  if (CJK_RE.test(raw)) return null
  const tokens = raw
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/["'*^():-]/g, '').trim())
    .filter((t) => t.length > 0 && /[\p{L}\p{N}]/u.test(t))
  if (!tokens.length) return null
  return tokens.map((t) => `"${t}"*`).join(' ')
}

type WherePlan = {
  joins: string[]
  joinParams: SQLInputValue[]
  where: string[]
  whereParams: SQLInputValue[]
}

function buildPagesWherePlan(
  db: DatabaseSync,
  opts: {
    ids?: string[]
    q?: string
    filter?: Record<string, unknown>
    trash?: boolean
    tagId?: string
  },
): WherePlan | null {
  const joins: string[] = []
  const joinParams: SQLInputValue[] = []
  const where: string[] = []
  const whereParams: SQLInputValue[] = []

  // 1. 软删除过滤：仅当 record_meta 表存在时启用；回收站模式 INNER JOIN，常规模式用 NOT EXISTS 走主键索引
  const hasMeta = hasTable(db, 'record_meta')
  if (opts.trash) {
    if (!hasMeta) return { joins: [], joinParams: [], where: ['1 = 0'], whereParams: [] }
    joins.push(
      `INNER JOIN record_meta rm ON rm.collection = '/pages' AND rm.record_id = p.id AND rm.deleted_at IS NOT NULL`,
    )
  } else if (hasMeta) {
    const anyDeleted = db
      .prepare(`SELECT 1 FROM record_meta WHERE collection = '/pages' AND deleted_at IS NOT NULL LIMIT 1`)
      .get()
    if (anyDeleted) {
      where.push(
        `NOT EXISTS (SELECT 1 FROM record_meta rm WHERE rm.collection = '/pages' AND rm.record_id = p.id AND rm.deleted_at IS NOT NULL)`,
      )
    }
  }

  // 2. 标签 stamp 过滤
  if (opts.tagId) {
    if (!hasTable(db, 'tag_stamps')) return null
    joins.push(
      `INNER JOIN tag_stamps ts ON ts.collection = '/pages' AND ts.record_id = p.id AND ts.tag_id = ?`,
    )
    joinParams.push(opts.tagId)
  }

  // 3. 显式 ID 过滤
  if (opts.ids?.length) {
    const valid = opts.ids.filter((id) => ID_RE.test(id))
    if (!valid.length) return { joins: [], joinParams: [], where: ['1 = 0'], whereParams: [] }
    if (valid.length > MAX_SQL_IN_IDS) return null
    where.push(`p.id IN (${valid.map(() => '?').join(', ')})`)
    whereParams.push(...valid)
  }

  // 4. 全文搜索 q（优先走 FTS5 倒排索引）
  const q = String(opts.q ?? '').trim()
  if (q) {
    const ftsExpr = hasTable(db, 'pages_fts') ? buildFtsMatchQuery(q) : null
    if (ftsExpr) {
      joins.push(`INNER JOIN pages_fts fts ON fts.id = p.id`)
      where.push(`pages_fts MATCH ?`)
      whereParams.push(ftsExpr)
    } else {
      where.push(`lower(p.title) LIKE ?`)
      whereParams.push(`%${q.toLowerCase()}%`)
    }
  }

  // 5. 结构化筛选（不支持 $tree 复杂组合或未知列时返回 null，优雅回退）
  const filter = opts.filter
  if (filter) {
    let attrJoinIdx = 0
    for (const [key, rawVal] of Object.entries(filter)) {
      if (rawVal === undefined || rawVal === '') continue
      if (key === 'tag') continue // 已由 tagId 处理
      if (key === '$tree') return null

      if (key === 'id') {
        if (typeof rawVal !== 'string') return null
        where.push('p.id = ?')
        whereParams.push(rawVal)
        continue
      }
      if (key === 'title') {
        if (typeof rawVal !== 'string') return null
        where.push('p.title = ?')
        whereParams.push(rawVal)
        continue
      }
      if (key === 'parentId') {
        if (rawVal === null) {
          where.push(`(p.parent_id IS NULL OR p.parent_id = '')`)
        } else if (typeof rawVal === 'string') {
          where.push('p.parent_id = ?')
          whereParams.push(rawVal)
        } else {
          return null
        }
        continue
      }
      if (key === 'createdAt' || key === 'updatedAt') {
        const num = Number(rawVal)
        if (!Number.isFinite(num)) return null
        where.push(`${key === 'createdAt' ? 'p.created_at' : 'p.updated_at'} = ?`)
        whereParams.push(num)
        continue
      }

      const flat = parseTagFlatKey(key)
      if (flat) {
        if (!hasTable(db, 'tag_attr_index')) return null
        if (typeof rawVal !== 'string' && typeof rawVal !== 'number' && typeof rawVal !== 'boolean') {
          return null
        }
        const alias = `ai_${attrJoinIdx++}`
        joins.push(
          `INNER JOIN tag_attr_index ${alias} ON ${alias}.collection = '/pages' AND ${alias}.pack_id = ? AND ${alias}.field_key = ? AND ${alias}.record_id = p.id`,
        )
        joinParams.push(flat.packId, flat.fieldKey)
        if (typeof rawVal === 'number' && Number.isFinite(rawVal)) {
          where.push(`${alias}.val_num = ?`)
          whereParams.push(rawVal)
        } else {
          where.push(`${alias}.val_text = ?`)
          whereParams.push(typeof rawVal === 'boolean' ? (rawVal ? 'true' : 'false') : String(rawVal))
        }
        continue
      }

      // 未知/自定义计算字段：回退到全量内存过滤保证语义 100% 一致
      return null
    }
  }

  return { joins, joinParams, where, whereParams }
}

type OrderPlan = {
  joins: string[]
  joinParams: SQLInputValue[]
  orderSql: string
}

function buildPagesOrderPlan(
  db: DatabaseSync,
  sortField: string,
  sortDir: 'asc' | 'desc',
  sorts?: Array<{ field: string; dir: 'asc' | 'desc' }>,
): OrderPlan | null {
  const specs = sorts?.length ? sorts : [{ field: sortField, dir: sortDir }]
  const joins: string[] = []
  const joinParams: SQLInputValue[] = []
  const terms: string[] = []
  let sortAttrIdx = 0

  for (const spec of specs) {
    const dir = spec.dir === 'desc' ? 'DESC' : 'ASC'
    const field = spec.field.trim() || 'title'
    if (field === 'updatedAt') {
      terms.push(`p.updated_at ${dir}`)
      continue
    }
    if (field === 'createdAt') {
      terms.push(`p.created_at ${dir}`)
      continue
    }
    if (field === 'title') {
      terms.push(`p.title COLLATE NOCASE ${dir}`)
      continue
    }
    if (field === 'id') {
      terms.push(`p.id ${dir}`)
      continue
    }
    if (field === 'parentId') {
      terms.push(`COALESCE(p.parent_id, '') ${dir}`)
      continue
    }

    const flat = parseTagFlatKey(field)
    if (flat) {
      if (!hasTable(db, 'tag_attr_index')) return null
      const alias = `ais_${sortAttrIdx++}`
      joins.push(
        `LEFT JOIN tag_attr_index ${alias} ON ${alias}.collection = '/pages' AND ${alias}.pack_id = ? AND ${alias}.field_key = ? AND ${alias}.record_id = p.id`,
      )
      joinParams.push(flat.packId, flat.fieldKey)
      // 有数值优先按数值排，否则按文本排；空值置后
      terms.push(`CASE WHEN ${alias}.record_id IS NULL THEN 1 ELSE 0 END ASC`)
      terms.push(`CASE WHEN ${alias}.val_num IS NOT NULL THEN 0 ELSE 1 END ASC`)
      terms.push(`${alias}.val_num ${dir}`)
      terms.push(`${alias}.val_text COLLATE NOCASE ${dir}`)
      continue
    }

    return null
  }

  const tieDir = specs[0]?.dir === 'desc' ? 'DESC' : 'ASC'
  terms.push(`p.id ${tieDir}`)
  return { joins, joinParams, orderSql: terms.join(', ') }
}

/**
 * `/pages` 集合的 SQL 下推分页查询：
 * 过滤、排序、FTS5 搜索、标签属性过滤/排序与分页全部在 SQLite 索引层完成，
 * 仅将命中的 limit 行实例化为 JS 对象。
 */
export function queryPagesListPage(
  db: DatabaseSync,
  query: CollectionListPageQuery,
): CollectionListPageResult | null {
  const wherePlan = buildPagesWherePlan(db, {
    ids: query.ids,
    q: query.q,
    filter: query.filter,
    trash: query.trash,
    tagId: query.tagId,
  })
  if (!wherePlan) return null

  const orderPlan = buildPagesOrderPlan(db, query.sortField, query.sortDir, query.sorts)
  if (!orderPlan) return null

  const whereJoinSql = wherePlan.joins.join('\n')
  const whereSql = wherePlan.where.length ? `WHERE ${wherePlan.where.join(' AND ')}` : ''

  // COUNT(*) 不需要排序 JOIN，避免额外左连接开销
  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM pages p ${whereJoinSql} ${whereSql}`)
    .get(...wherePlan.joinParams, ...wherePlan.whereParams) as { total?: number } | undefined
  const total = Number(countRow?.total ?? 0)
  if (total === 0 || query.offset >= total) {
    return { rows: [], total }
  }

  const allJoins = [...wherePlan.joins, ...orderPlan.joins].join('\n')
  const listParams: SQLInputValue[] = [
    ...wherePlan.joinParams,
    ...orderPlan.joinParams,
    ...wherePlan.whereParams,
    query.limit,
    query.offset,
  ]
  const sqlRows = db
    .prepare(
      `SELECT p.id, p.title, p.parent_id, p.depends_on_json, p.emoji, p.created_at, p.updated_at
       FROM pages p
       ${allJoins}
       ${whereSql}
       ORDER BY ${orderPlan.orderSql}
       LIMIT ? OFFSET ?`,
    )
    .all(...listParams) as SqlPageRow[]

  return {
    rows: sqlRows.map(rowFromSql),
    total,
  }
}

/**
 * `/pages` 集合的 SQL 下推分组聚合查询：
 * 直接在 SQLite 通过 `tag_attr_index` 做 `GROUP BY`，无需将百万级 ID 拉回 Node.js。
 */
export function queryPagesGroupPage(
  db: DatabaseSync,
  query: CollectionGroupQuery,
): CollectionGroupBucket[] | null {
  const flat = parseTagFlatKey(query.field)
  if (!flat) return null
  if (!hasTable(db, 'tag_attr_index')) return null

  const wherePlan = buildPagesWherePlan(db, {
    ids: query.ids,
    q: query.q,
    filter: query.filter,
    trash: query.trash,
    tagId: query.tagId,
  })
  if (!wherePlan) return null

  const joins = [
    ...wherePlan.joins,
    `LEFT JOIN tag_attr_index aig ON aig.collection = '/pages' AND aig.pack_id = ? AND aig.field_key = ? AND aig.record_id = p.id`,
  ].join('\n')
  const whereSql = wherePlan.where.length ? `WHERE ${wherePlan.where.join(' AND ')}` : ''
  const params: SQLInputValue[] = [
    ...wherePlan.joinParams,
    flat.packId,
    flat.fieldKey,
    ...wherePlan.whereParams,
  ]

  const rows = db
    .prepare(
      `SELECT COALESCE(aig.val_text, '') AS bucket_key, COUNT(*) AS cnt
       FROM pages p
       ${joins}
       ${whereSql}
       GROUP BY bucket_key
       ORDER BY cnt DESC, bucket_key ASC`,
    )
    .all(...params) as Array<{ bucket_key: string; cnt: number }>

  return rows.map((row) => ({ key: String(row.bucket_key ?? ''), count: Number(row.cnt ?? 0) }))
}
