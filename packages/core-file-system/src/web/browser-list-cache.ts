import type {
  CollectionSchema,
  CollectionSchemaPack,
  DbRecord,
  FieldSpec,
} from '@biu/type-file-system'
import { parseAppPath } from '@biu/web-session-view'
import { stampRecordId } from '../catalog-views.ts'
import { DATA_COLLECTION_PATH, DATA_MODULE } from './database-path.ts'
import { BoundedMap } from './bounded-map.ts'
import { registerWorkspaceCache } from './workspace-client-store.ts'
import {
  flattenTagColumns,
  groupRowBucketKeys,
  isTagFlatColumnKey,
  parseTagFlatColumnKey,
  pinActionColumn,
  resolveFieldType,
  type GroupBucket,
} from './fields.ts'
import { loadTags } from './tag-catalog.ts'
import { placedActions } from './fsdb-cells.tsx'
import { createdRowGroupKey, placeCreatedRow } from './group-insert.ts'
import { moveInspectorRecordsToTrash } from './inspector-db-route.ts'
import { recordPreviewMascot } from './record-mark.tsx'
import { normalizeColumnWidths, normalizePageSize, viewStateKey, type SavedView } from './saved-view.ts'
import {
  crumbRecordLabel,
  forgetPreviewTotalsForPath,
  recordPreviewEmoji,
  rememberPreviewTotalForView,
} from './sidebar-preview.ts'
import { tablePinCount } from './table-window.ts'
import {
  applyListedCrumbMutation,
  defaultViewId,
} from './view-storage.ts'
import type { TablePaintNode } from './windowed-table.tsx'

export type StatResult = { schema?: CollectionSchema }

export const COLLECT_SHEET_COLUMNS = ['title', 'table'] as const
export function collectSheetColumns(pack?: CollectionSchemaPack | null) {
  const flats = (pack?.fields ?? [])
    .filter((field) => field.deleted !== true)
    .map((field) => tagFlatColumnKey(pack!.id, field.key))
  return [...COLLECT_SHEET_COLUMNS, ...flats]
}

import { tagFlatColumnKey } from '../shared/fields.ts'

export const LIST_SEED_COLUMNS = [
  'title',
  'status',
  'priority',
  'difficulty',
  'usage',
  'createdBy',
  'assignee',
  'project',
  'tag',
  'dueAt',
  'shareScope',
  'shareRole',
  'pinned',
  'eventCount',
  'updatedAt',
  'name',
  'label',
  'fileList',
]

export function isListColumn(key: string) {
  return key !== 'description' && key !== 'notes' && key !== 'content' && key !== 'emoji' && key !== 'banner' && key !== 'tags'
}

/** Saved view columns stay until we know the field is gone. Tag / share overlay keys are not schema fields. */
export function retainSavedColumn(key: string, schema: CollectionSchema | undefined, allColumnKeys: string[]) {
  if (key === 'actions' || key === 'shareScope' || key === 'shareRole') return true
  if (key === 'createdBy' || key === 'updatedBy' || key === 'createdAt' || key === 'updatedAt') return true
  if (parseTagFlatColumnKey(key) || isTagFlatColumnKey(key)) return true
  if (!schema) return true
  if (allColumnKeys.includes(key)) return true
  const field = schema.fields[key]
  if (!field) return true
  return isListColumn(key) && resolveFieldType(field) !== 'file'
}

export function recordsFingerprint(rows: Array<DbRecord & { path?: string }>) {
  return JSON.stringify(rows)
}

export function schemaFingerprint(schema?: CollectionSchema) {
  if (!schema) return ''
  const fields = schema.fields ?? {}
  let out = `${schema.labelField ?? ''}\0${(schema.columns ?? []).join(',')}`
  for (const key of Object.keys(fields)) {
    const field = fields[key]
    out += `\0${key}:${field?.type ?? ''}:${field?.writable ? 1 : 0}`
  }
  for (const action of schema.actions ?? []) {
    const places = (action.placement ?? []).join(',')
    out += `\0a:${action.id}:${places}:${action.for ?? ''}`
  }
  return out
}

export const LIST_CACHE_MAX = 32
export type ListCacheSnap = {
  items: Array<DbRecord & { path?: string }>
  total: number
  stat: StatResult | null
  groupBuckets?: GroupBucket[]
  groupBy?: string
  listLimit?: number
}
export const listCache = new BoundedMap<string, ListCacheSnap>(LIST_CACHE_MAX)
registerWorkspaceCache('browser-list-cache', () => {
  listCache.clear()
})

export function listCacheKey(path: string, viewId?: string | null) {
  return `${path}\0${viewId ?? ''}`
}

function forgetExactPathCache(path: string, keepKey?: string) {
  for (const key of [...listCache.keys()]) {
    if (keepKey && key === keepKey) continue
    if (key === path || key.startsWith(`${path}\0`)) listCache.delete(key)
  }
}

function forgetDerivedOverviewCache(path: string) {
  const basePath = path.split('\0')[0] ?? path
  if (basePath !== DATA_COLLECTION_PATH && basePath !== TRASH_COLLECTION_PATH) {
    forgetExactPathCache(DATA_COLLECTION_PATH)
  }
}

export function peekListCache(path: string, viewId?: string | null, minLimit?: number) {
  const snap = listCache.get(listCacheKey(path, viewId))
  if (!snap) return
  const loaded = snap.listLimit ?? snap.items.length
  if (minLimit != null && loaded < minLimit && snap.total > loaded) return undefined
  return snap
}

export function bucketsReadyToCache(buckets?: GroupBucket[]) {
  if (!buckets?.length) return true
  return buckets.every((bucket) => (bucket.total ?? 0) <= 0 || bucket.rows.length > 0)
}

export function rememberListCache(path: string, snap: ListCacheSnap, viewId?: string | null) {
  if (!bucketsReadyToCache(snap.groupBuckets)) return
  const key = listCacheKey(path, viewId)
  listCache.set(key, snap)
}

export function forgetListCache(path: string) {
  forgetExactPathCache(path)
  forgetDerivedOverviewCache(path)
}

/** 服务端 WebSocket 推送数据/标签变更时，同步失效前端列表缓存，避免切表或退出详情页时读到陈旧快照。 */
export function invalidateListCacheForFsdbChange(change: { scope?: string; path?: string } | null | undefined) {
  if (!change) return
  if (change.scope === 'tags') {
    listCache.clear()
    return
  }
  if (change.scope !== 'records') return
  const raw = String(change.path ?? '').trim()
  if (!raw) {
    listCache.clear()
    return
  }
  const firstSegment = raw.split('/').filter(Boolean)[0]
  if (!firstSegment) {
    listCache.clear()
    return
  }
  forgetListCache(`/${firstSegment}`)
}

export function sameSavedViews(a: SavedView[], b: SavedView[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]!.id !== b[i]!.id || a[i]!.name !== b[i]!.name || viewStateKey(a[i]!) !== viewStateKey(b[i]!)) return false
  }
  return true
}

export const EMPTY_HOLD_NODES: TablePaintNode[] = [{ kind: 'empty', key: 'empty' }]

export function collectionFromAppUrl(url: string): { collection: string; viewId: string } | null {
  let pathname = url
  try {
    pathname = url.startsWith('http') ? new URL(url).pathname : url
  } catch {
    return null
  }
  const parsed = parseAppPath(pathname, [DATA_MODULE])
  if (parsed.kind !== 'collection-view' && parsed.kind !== 'record') return null
  return {
    collection: parsed.collection,
    viewId: parsed.viewId || defaultViewId(parsed.collection, parsed.viewId),
  }
}

/** 分组字段改了就把行挪到新桶，不要等整表 reload。 */
export function remapGroupedRecords(
  groups: GroupBucket[],
  map: (row: DbRecord) => DbRecord,
  groupBy: string,
  schema?: CollectionSchema,
  packs: CollectionSchemaPack[] = [],
) {
  if (!groups.length) return groups
  if (!groupBy) {
    return groups.map((group) => ({ ...group, rows: group.rows.map(map) }))
  }
  const relocated: DbRecord[] = []
  const seen = new Set<string>()
  const next = groups.map((group) => {
    let dropped = 0
    const rows: DbRecord[] = []
    for (const row of group.rows) {
      const mapped = map(row)
      const keys = groupRowBucketKeys(mapped, groupBy, schema, packs)
      const stays = keys.includes(group.key) || keys.includes(group.label)
      if (stays) {
        rows.push(mapped)
        continue
      }
      dropped += 1
      const id = String(mapped.id)
      if (!seen.has(id)) {
        seen.add(id)
        relocated.push(mapped)
      }
    }
    if (!dropped) {
      return rows.every((row, index) => row === group.rows[index]) ? group : { ...group, rows }
    }
    return {
      ...group,
      rows,
      total: group.total != null ? Math.max(0, group.total - dropped) : undefined,
    }
  })
  let buckets = next.filter((group) => group.rows.length > 0 || (group.total ?? 0) > 0 || group.key === '')
  for (const row of relocated) buckets = placeCreatedRow(buckets, row, groupBy, schema, packs)
  return buckets
}

import { LISTED_MUTATION_EVENT } from './fsdb-events.ts'
import { TRASH_COLLECTION_PATH } from './database-path.ts'

export { LISTED_MUTATION_EVENT }

export type ListedMutation =
  | { path: string; op: 'patch'; row: DbRecord; groupBy?: string }
  | { path: string; op: 'create'; row: DbRecord; groupBy?: string; viewId?: string | null; total?: number }
  | { path: string; op: 'remove'; ids: string[]; viewId?: string | null; total?: number }

export function overlayListedRow(row: DbRecord, next: DbRecord): DbRecord {
  const merged: DbRecord = { ...row, ...next, banner: next.banner ?? row.banner ?? null }
  if ('tag' in next) {
    for (const key of Object.keys(merged)) {
      if (parseTagFlatColumnKey(key) && !Object.prototype.hasOwnProperty.call(next, key)) {
        delete merged[key]
      }
    }
  }
  return merged
}

export function appendTreeKids(rows: DbRecord[], kids: DbRecord[]) {
  if (!kids.length) return rows
  const ids = new Set(rows.map((row) => String(row.id)))
  const extra = kids.filter((row) => !ids.has(String(row.id)))
  return extra.length ? [...rows, ...extra] : rows
}

export function rowsWithTreeKids(rows: DbRecord[], kidsByParent: Record<string, DbRecord[]>) {
  const entries = Object.entries(kidsByParent)
  if (!entries.length) return rows
  let next = rows
  const attached = new Set<string>()
  // 多级树（父 -> 子 -> 孙）可能按任意键序存在 kidsByParent 中，需迭代直到收敛。
  for (;;) {
    let added = false
    for (const [parentId, kids] of entries) {
      if (attached.has(parentId)) continue
      if (!next.some((row) => String(row.id) === parentId || String(row.sourceId ?? '') === parentId)) continue
      attached.add(parentId)
      const merged = appendTreeKids(next, kids)
      if (merged !== next) {
        next = merged
        added = true
      }
    }
    if (!added) break
  }
  return next
}

export function patchListCacheRecords(path: string, map: (row: DbRecord) => DbRecord, groupBy?: string) {
  for (const key of [...listCache.keys()]) {
    if (key !== path && !key.startsWith(`${path}\0`)) continue
    const snap = listCache.get(key)
    if (!snap) continue
    // 每个视图快照各自按自身的 groupBy 重排分组，绝不用当前视图的 groupBy 破坏兄弟视图的 groupBuckets。
    const effectiveGroupBy = snap.groupBy !== undefined ? snap.groupBy : groupBy
    listCache.set(key, {
      ...snap,
      items: snap.items.map((row) => map(row) as (typeof snap.items)[number]),
      groupBuckets: snap.groupBuckets
        ? effectiveGroupBy
          ? remapGroupedRecords(snap.groupBuckets, map, effectiveGroupBy)
          : snap.groupBuckets.map((group) => ({
              ...group,
              rows: group.rows.map(map),
            }))
        : snap.groupBuckets,
    })
  }
  forgetDerivedOverviewCache(path)
}

export function dropListCacheRecords(path: string, ids: string[]) {
  const gone = new Set(ids.filter(Boolean).map(String))
  if (!gone.size) return
  for (const key of [...listCache.keys()]) {
    if (key !== path && !key.startsWith(`${path}\0`)) continue
    const snap = listCache.get(key)
    if (!snap) continue
    const items = snap.items.filter((row) => !gone.has(String(row.id)))
    const removed = snap.items.length - items.length
    const groupBuckets = snap.groupBuckets
      ?.map((group) => {
        const rows = group.rows.filter((row) => !gone.has(String(row.id)))
        const dropped = group.rows.length - rows.length
        if (!dropped) return group
        return {
          ...group,
          rows,
          total: group.total != null ? Math.max(0, group.total - dropped) : undefined,
        }
      })
      .filter((group) => group.rows.length > 0 || (group.total ?? 0) > 0)
    listCache.set(key, {
      ...snap,
      items,
      total: Math.max(0, snap.total - removed),
      groupBuckets,
    })
  }
  forgetDerivedOverviewCache(path)
}

export function seedListCacheSnap(row: DbRecord, groupBy?: string): ListCacheSnap {
  const key = createdRowGroupKey(row, groupBy ?? '')
  return {
    items: [row],
    total: 1,
    stat: null,
    groupBy: groupBy ?? '',
    groupBuckets: groupBy ? [{ key, label: key || '未填', rows: [row], total: 1 }] : [],
  }
}

export function upsertListCacheRecord(path: string, row: DbRecord, groupBy?: string, viewId?: string | null) {
  const targetKey = listCacheKey(path, viewId)
  // 新建记录无法准确预测兄弟视图的筛选与排序，直接失效兄弟视图与 /data 总览，避免切过去读到旧快照。
  forgetExactPathCache(path, targetKey)
  forgetDerivedOverviewCache(path)
  const snap = peekListCache(path, viewId)
  // 目标视图尚未缓存时，不再伪造 total=1 的冷缓存快照（避免例如回收站首帧只显示 1 条、遮蔽历史数据）。
  if (!snap) return
  if (snap.items.some((item) => item.id === row.id)) {
    patchListCacheRecords(path, (item) => (item.id === row.id ? overlayListedRow(item, row) : item), groupBy)
    return
  }
  const effectiveGroupBy = snap.groupBy !== undefined ? snap.groupBy : groupBy ?? ''
  const groupBuckets = placeCreatedRow(snap.groupBuckets ?? [], row, effectiveGroupBy)
  rememberListCache(
    path,
    {
      ...snap,
      items: [row, ...snap.items],
      total: snap.total + 1,
      groupBy: effectiveGroupBy,
      groupBuckets: groupBuckets.length ? groupBuckets : seedListCacheSnap(row, effectiveGroupBy).groupBuckets,
    },
    viewId,
  )
}

export function trashRecordId(collectionPath: string, recordId: string) {
  return `${String(collectionPath).replace(/^\//, '')}::${recordId}`
}

export function toTrashListRow(collectionPath: string, row: DbRecord, tableLabel: string): DbRecord {
  const id = String(row.id)
  return {
    id: trashRecordId(collectionPath, id),
    title: crumbRecordLabel(row),
    table: tableLabel,
    tablePath: collectionPath,
    sourceId: id,
    sourcePath: `${collectionPath}/${id}`,
    deletedAt: Date.now(),
    shareScope: row.shareScope,
  }
}

export function publishDeletedRowsToTrash(collectionPath: string, rows: DbRecord[], tableLabel: string) {
  if (collectionPath === TRASH_COLLECTION_PATH) return
  const viewId = defaultViewId(TRASH_COLLECTION_PATH)
  for (const row of rows) {
    if (!row?.id) continue
    publishListedMutation({
      path: TRASH_COLLECTION_PATH,
      op: 'create',
      row: toTrashListRow(collectionPath, row, tableLabel),
      viewId,
      groupBy: 'shareScope',
    })
  }
  moveInspectorRecordsToTrash(
    collectionPath,
    rows.map((row) => String(row?.id ?? '')).filter(Boolean),
  )
}

function applyPreviewTotalMutation(mutation: ListedMutation) {
  if (mutation.op === 'patch') return
  if (mutation.total != null) {
    rememberPreviewTotalForView(mutation.path, mutation.viewId, mutation.total)
    const keepPrefix = mutation.viewId ? `${mutation.path}\0${mutation.viewId}\0` : undefined
    forgetPreviewTotalsForPath(mutation.path, keepPrefix)
  }
}

function listedCrumbRow(row: DbRecord) {
  return {
    id: String(row.id),
    label: crumbRecordLabel(row),
    ...('emoji' in row ? { emoji: recordPreviewEmoji(row) } : {}),
    ...('mascot' in row ? { mascot: recordPreviewMascot(row) } : {}),
  }
}

export function publishListedMutation(mutation: ListedMutation) {
  if (mutation.op === 'patch') {
    patchListCacheRecords(
      mutation.path,
      (row) => (row.id === mutation.row.id ? overlayListedRow(row, mutation.row) : row),
      mutation.groupBy,
    )
    applyListedCrumbMutation(mutation.path, { op: 'patch', row: listedCrumbRow(mutation.row) })
  } else if (mutation.op === 'remove') {
    dropListCacheRecords(mutation.path, mutation.ids)
    applyListedCrumbMutation(mutation.path, { op: 'remove', ids: mutation.ids })
  } else {
    upsertListCacheRecord(mutation.path, mutation.row, mutation.groupBy, mutation.viewId)
    applyListedCrumbMutation(mutation.path, {
      op: 'create',
      row: listedCrumbRow(mutation.row),
      viewId: mutation.viewId,
    })
  }
  applyPreviewTotalMutation(mutation)
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(LISTED_MUTATION_EVENT, { detail: mutation }))
}

export function listHoldResetKey(view: SavedView | null, path: string) {
  return `${view?.id ?? ''}\0${path}\0${view?.groupBy ?? ''}\0${0}\0${normalizePageSize(view?.pageSize)}\0${view?.query ?? ''}`
}

export type TableHoldSnap = {
  columns: { key: string; kind?: string; field?: FieldSpec; packId?: string; packLabel?: string }[]
  columnWidths: Record<string, number>
  columnPinCount: number
  wrapCells: boolean
  truncateCells: boolean
  freezeTitle: boolean
  nodes: TablePaintNode[]
  resetKey: string
  checkLayoutExtra: string
  schema?: CollectionSchema
}

export function emptyListHold(prev: TableHoldSnap | null, view: SavedView | null, path: string): TableHoldSnap {
  return {
    columns: prev?.columns ?? [{ key: 'title' }],
    columnWidths: prev?.columnWidths ?? {},
    columnPinCount: prev?.columnPinCount ?? 0,
    wrapCells: !!view?.wrap,
    truncateCells: view ? view.truncate !== false : true,
    freezeTitle: !!view?.freezeTitle,
    nodes: EMPTY_HOLD_NODES,
    resetKey: listHoldResetKey(view, path),
    checkLayoutExtra: '',
  }
}

export function listHoldFromCache(cached: ListCacheSnap, view: SavedView | null, path: string): TableHoldSnap {
  const schema = cached.stat?.schema
  const keys = pinActionColumn(schema, view?.columns ?? [], placedActions(schema, 'row').length > 0)
  const pageSize = normalizePageSize(view?.pageSize)
  const groupBy = view?.groupBy ?? ''
  const buckets = (cached.groupBuckets ?? []).filter((item) => (item.total ?? item.rows.length) > 0)
  let nodes: TablePaintNode[]
  if (groupBy && buckets.length) {
    nodes = []
    for (const group of buckets) {
      const groupKey = group.key || 'unset'
      const count = group.total ?? group.rows.length
      nodes.push({ kind: 'group-head', key: `gh:${groupKey}`, groupKey, label: group.label, count })
      const rows = group.total != null ? group.rows : group.rows.slice(0, pageSize)
      for (const row of rows) {
        nodes.push({
          kind: 'row',
          key: `${groupKey}:${row.id}`,
          keyPrefix: `${group.key}:`,
          row,
          depth: 0,
          hasKids: false,
          kidCount: 0,
        })
      }
      nodes.push({ kind: 'group-pager', key: `gp:${groupKey}`, groupKey, count, pageIndex: 0 })
    }
  } else if (groupBy) {
    nodes = EMPTY_HOLD_NODES
  } else if (cached.items.length) {
    nodes = cached.items.slice(0, pageSize).map((row) => ({
      kind: 'row' as const,
      key: String(row.id),
      keyPrefix: '',
      row,
      depth: 0,
      hasKids: false,
      kidCount: 0,
    }))
  } else {
    nodes = EMPTY_HOLD_NODES
  }
  const label = schema?.labelField ?? 'title'
  const tags = loadTags()
  const tagColsByKey = new Map(flattenTagColumns(tags).map((item) => [item.key, item]))
  return {
    columns: keys.map((key) => {
      if (key === 'actions') return { key, kind: 'action' as const, field: { type: 'action' as const, label: '动作' } }
      if (key === 'shareScope') return { key, kind: 'select' as const, field: { type: 'select' as const, label: '分享' } }
      if (key === 'shareRole') return { key, kind: 'select' as const, field: { type: 'select' as const, label: '权限' } }
      const tagCol = tagColsByKey.get(key)
      if (tagCol) return tagCol
      const parsedTag = parseTagFlatColumnKey(key)
      if (parsedTag) {
        const pack = tags.find((entry) => entry.id === parsedTag.packId)
        return {
          key,
          kind: 'select' as const,
          field: { type: 'select' as const, label: parsedTag.fieldKey },
          packId: parsedTag.packId,
          packLabel: pack?.label,
        }
      }
      const field = schema?.fields?.[key]
      return {
        key,
        kind: field ? resolveFieldType(field) : 'string',
        field: field ?? { type: 'string' as const, label: key === label ? '标题' : key },
      }
    }),
    columnWidths: normalizeColumnWidths(view?.columnWidths),
    columnPinCount: tablePinCount(keys, label, Boolean(view?.freezeTitle)),
    wrapCells: !!view?.wrap,
    truncateCells: view ? view.truncate !== false : true,
    freezeTitle: !!view?.freezeTitle,
    nodes,
    resetKey: listHoldResetKey(view, path),
    checkLayoutExtra: '',
    schema,
  }
}

export function overviewStampOf(collectionPath: string, row?: DbRecord | null, id?: string | null) {
  const table = String(row?.tablePath ?? collectionPath).trim()
  const source = String(row?.sourceId ?? id ?? row?.id ?? '').trim()
  return stampRecordId(table, source)
}
