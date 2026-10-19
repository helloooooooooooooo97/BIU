import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import type { CollectionInfo, CollectionSpec, DbRecord } from '@biu/type-file-system'
import { normalizeSchemaValue, recordBuiltinValues, REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
import { builtinAllView, isReadOnlyViewId } from '../catalog-views.ts'
import { normalizeColumnWidths, normalizePageSize, parseViewColumns, type SavedView } from '../web/saved-view.ts'
import { isViewModeId } from '../web/fields.ts'
import { normalizeCollectionPath } from '../paths.ts'
import { isIndexCollection } from '../web/database-path.ts'
import {
  countFilterRules,
  flatFiltersToTree,
  looksLikeFilterTree,
  normalizeFilterGroup,
  parseSortsInput,
  VIEW_FILTERS_DESCRIPTION,
  VIEW_FILTER_TREE_DESCRIPTION,
  VIEW_SORTS_DESCRIPTION,
  type FilterGroup,
  type SortRule,
} from '../query-logic.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export type StoredView = Partial<SavedView> & Pick<SavedView, 'id' | 'name'> & { createdBy?: string }

type ViewRow = { collection: string; payload_json: string }

export class SavedViewsStore {
  private byPath = new Map<string, StoredView[]>()
  private db: DatabaseSync | null = null

  open(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = openAndMigrateBiu(path, { foreignKeys: false })
    this.hydrate()
    return this
  }

  private hydrate() {
    if (!this.db) return
    this.byPath.clear()
    const rows = this.db.prepare('SELECT collection, payload_json FROM saved_views').all() as ViewRow[]
    for (const row of rows) {
      const collection = normalizeCollectionPath(row.collection)
      if (!collection || collection === '/' || collection === '/views') continue
      let parsed: StoredView | null = null
      try {
        parsed = JSON.parse(row.payload_json) as StoredView
      } catch {
        continue
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
      const id = String(parsed.id ?? '').trim()
      const name = String(parsed.name ?? id).trim()
      if (!id || isReadOnlyViewId(id) || parsed.builtin) continue
      const list = this.byPath.get(collection) ?? []
      list.push({ ...parsed, id, name })
      this.byPath.set(collection, list)
    }
  }

  private persistPath(collectionPath: string) {
    if (!this.db) return
    const path = normalizeCollectionPath(collectionPath)
    const views = this.byPath.get(path) ?? []
    const upsert = this.db.prepare(
      `INSERT INTO saved_views (collection, view_id, payload_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(collection, view_id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
    )
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('DELETE FROM saved_views WHERE collection = ?').run(path)
      for (const view of views) {
        if (view.builtin || isReadOnlyViewId(String(view.id))) continue
        upsert.run(path, String(view.id), JSON.stringify(view), Date.now())
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  viewsFor(collectionPath: string, accountId = ''): StoredView[] {
    const views = this.byPath.get(normalizeCollectionPath(collectionPath)) ?? []
    if (!isIndexCollection(collectionPath)) return views
    return views.filter((view) => view.createdBy === accountId)
  }

  /** 索引表上的视图按创建人分开存：这次写入只替换当前账号自己的视图。 */
  replaceOwned(collectionPath: string, views: StoredView[], accountId: string) {
    const path = normalizeCollectionPath(collectionPath)
    const prev = this.byPath.get(path) ?? []
    const kept = prev.filter((view) => view.createdBy && view.createdBy !== accountId)
    const foreign = new Set(kept.map((view) => view.id))
    const mine = views
      .filter((view) => !view.builtin && !isReadOnlyViewId(String(view.id)) && !foreign.has(String(view.id)))
      .map((view) => ({ ...view, id: String(view.id), name: String(view.name || view.id), createdBy: accountId }))
    this.byPath.set(path, [...kept, ...mine])
    this.persistPath(path)
  }

  replace(collectionPath: string, views: StoredView[]) {
    const path = normalizeCollectionPath(collectionPath)
    this.byPath.set(
      path,
      views
        .filter((view) => !view.builtin && !isReadOnlyViewId(String(view.id)))
        .map((view) => ({ ...view, id: String(view.id), name: String(view.name || view.id) })),
    )
    this.persistPath(path)
  }

  rows(tables: CollectionInfo[], accountId = ''): DbRecord[] {
    const labels = new Map(tables.map((item) => [normalizeCollectionPath(item.path), item.view?.title ?? item.label]))
    const out: DbRecord[] = []
    const seen = new Set<string>()
    const emit = (path: string, tableName: string, view: StoredView) => {
      const rec = asRecord(path, tableName, view)
      if (seen.has(rec.id)) return
      seen.add(rec.id)
      out.push(rec)
    }
    for (const table of tables) {
      const path = normalizeCollectionPath(table.path)
      if (!path || path === '/') continue
      const label = String(labels.get(path) ?? table.label ?? path)
      const all = builtinAllView({ path, label, view: table.view })
      emit(path, label, all)
      for (const view of this.byPath.get(path) ?? []) {
        if (view.builtin || isReadOnlyViewId(view.id)) continue
        if (isIndexCollection(path) && view.createdBy !== accountId) continue
        emit(path, label, view)
      }
    }
    for (const [path, views] of this.byPath) {
      if (tables.some((table) => normalizeCollectionPath(table.path) === path)) continue
      for (const view of views) {
        if (view.builtin || isReadOnlyViewId(view.id)) continue
        if (isIndexCollection(path) && view.createdBy !== accountId) continue
        emit(path, labels.get(path) ?? path, view)
      }
    }
    return out.sort((a, b) => String(a.table).localeCompare(String(b.table)) || String(a.title).localeCompare(String(b.title)))
  }

  create(fields: Record<string, unknown>, tables: CollectionInfo[], accountId = ''): DbRecord {
    const tablePath = tablePathOf(fields)
    if (!tablePath || tablePath === '/' || tablePath === '/views') throw new Error('tablePath required')
    if (!tables.some((item) => normalizeCollectionPath(item.path) === tablePath)) {
      throw new Error(`unknown collection: ${tablePath}`)
    }
    const table = tables.find((item) => normalizeCollectionPath(item.path) === tablePath)
    const label = table?.view?.title ?? table?.label ?? tablePath
    const id = String(fields.viewId ?? '').trim() || `${Date.now()}`
    if (isReadOnlyViewId(id)) throw new Error('builtin view is read-only')
    const views = this.byPath.get(tablePath) ?? []
    if (views.some((view) => view.id === id)) throw new Error(`view exists: ${id}`)
    const name = uniqueViewName(String(fields.title ?? fields.name ?? '新视图').trim() || '新视图', views)
    const view: StoredView = {
      id,
      name,
      mode: typeof fields.mode === 'string' && isViewModeId(fields.mode) ? fields.mode : 'table',
      sortField: typeof fields.sortField === 'string' && fields.sortField.trim() ? fields.sortField : 'id',
      sortDir: fields.sortDir === 'desc' ? 'desc' : 'asc',
      query: typeof fields.query === 'string' ? fields.query : '',
      groupBy: typeof fields.groupBy === 'string' ? fields.groupBy : '',
      columns: parseViewColumns(fields.columns),
      ...filtersFromPatch(fields.filters),
      ...sortsFromPatch(fields.sorts, fields.sortField, fields.sortDir),
      tree: fields.tree !== false,
      wrap: Boolean(fields.wrap),
      truncate: fields.truncate !== false,
      pageSize: normalizePageSize(fields.pageSize),
      columnWidths: normalizeColumnWidths(fields.columnWidths),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(isIndexCollection(tablePath) ? { createdBy: accountId } : {}),
    }
    this.byPath.set(tablePath, [...views, view])
    this.persistPath(tablePath)
    return asRecord(tablePath, label, view)
  }

  remove(id: string, accountId = '', tables: CollectionInfo[] = []): boolean {
    if (isReadOnlyViewId(viewIdOfRow(id))) throw new Error('builtin view is read-only')
    const cut = id.indexOf('::')
    const tablePath = cut >= 0 ? normalizeCollectionPath(id.slice(0, cut)) : ''
    const viewId = tablePath ? id.slice(cut + 2) : id
    const candidates = tablePath ? [tablePath] : [...this.byPath.keys()]
    for (const path of candidates) {
      const views = this.byPath.get(path) ?? []
      const hit = findView(views, path, viewId, accountId)
      if (hit) {
        if (hit.builtin || isReadOnlyViewId(String(hit.id))) throw new Error('builtin view is read-only')
        this.byPath.set(path, views.filter((view) => view !== hit))
        this.persistPath(path)
        return true
      }
      // 视图记录在案但不在当前账号名下：与「不存在」同样处理，不泄露他人视图
      if (views.some((view) => String(view.id) === viewId)) throw new Error(`unknown view: ${id}`)
    }
    void tables
    throw new Error(`unknown view: ${id}`)
  }

  write(id: string, patch: Record<string, unknown>, accountId = '', tables: CollectionInfo[] = []): DbRecord {
    if (isReadOnlyViewId(viewIdOfRow(id))) throw new Error('builtin view is read-only')
    const cut = id.indexOf('::')
    const tablePath = cut >= 0 ? normalizeCollectionPath(id.slice(0, cut)) : ''
    const viewId = tablePath ? id.slice(cut + 2) : id
    const candidates = tablePath ? [tablePath] : [...this.byPath.keys()]
    for (const path of candidates) {
      const views = this.byPath.get(path) ?? []
      const hit = findView(views, path, viewId, accountId)
      if (!hit) continue
      const idx = views.indexOf(hit)
      const cur = views[idx]!
      if (cur.builtin || isReadOnlyViewId(cur.id)) throw new Error('builtin view is read-only')
      const next: StoredView = {
        ...cur,
        ...(typeof patch.title === 'string' ? { name: patch.title } : {}),
        ...(typeof patch.name === 'string' ? { name: patch.name } : {}),
        ...(typeof patch.mode === 'string' && isViewModeId(patch.mode) ? { mode: patch.mode } : {}),
        ...(typeof patch.sortField === 'string' ? { sortField: patch.sortField } : {}),
        ...(patch.sortDir === 'asc' || patch.sortDir === 'desc' ? { sortDir: patch.sortDir } : {}),
        ...(typeof patch.query === 'string' ? { query: patch.query } : {}),
        ...(typeof patch.groupBy === 'string' ? { groupBy: patch.groupBy } : {}),
        ...('filters' in patch ? filtersFromPatch(patch.filters) : {}),
        ...('filterTree' in patch ? { filterTree: normalizeFilterGroup(parseJsonValue(patch.filterTree)) } : {}),
        ...('sorts' in patch ? sortsFromPatch(patch.sorts, patch.sortField ?? cur.sortField, patch.sortDir ?? cur.sortDir) : {}),
        ...('columns' in patch ? { columns: parseViewColumns(patch.columns) } : {}),
        ...(typeof patch.pageSize === 'number' ? { pageSize: patch.pageSize } : {}),
        ...(typeof patch.tree === 'boolean' ? { tree: patch.tree } : {}),
        ...(typeof patch.wrap === 'boolean' ? { wrap: patch.wrap } : {}),
        ...(typeof patch.truncate === 'boolean' ? { truncate: patch.truncate } : {}),
        ...('columnWidths' in patch ? { columnWidths: normalizeColumnWidths(patch.columnWidths) } : {}),
        ...('emoji' in patch ? { emoji: String(patch.emoji ?? '') } : {}),
        ...('facet' in patch ? { facet: normalizeSchemaValue(patch.facet) } : {}),
        updatedAt: Date.now(),
        createdAt: Number((cur as { createdAt?: number }).createdAt) || Date.now(),
      }
      views[idx] = next
      this.persistPath(path)
      const table = tables.find((item) => normalizeCollectionPath(item.path) === path)
      return asRecord(path, tableLabelOf(table, path), next)
    }
    throw new Error(`unknown view: ${id}`)
  }
}

/**
 * 标签表（/facets 这类索引表）的视图按创建人分开存，同一个 viewId 可能属于多个账号。
 * 只在当前账号名下的视图里找，避免把别人的视图当成「未知视图」或误改误删。
 */
function findView(views: StoredView[], path: string, viewId: string, accountId: string) {
  const owned = isIndexCollection(path)
    ? views.filter((item) => !item.createdBy || item.createdBy === accountId)
    : views
  return owned.find((item) => String(item.id) === viewId)
}

function tableLabelOf(table: CollectionInfo | undefined, tablePath: string) {
  return table?.view?.title ?? table?.label ?? tablePath
}

function rowId(path: string, viewId: string) {
  return `${path.replace(/^\//, '')}::${viewId}`
}

function viewIdOfRow(id: string) {
  const cut = id.indexOf('::')
  return cut >= 0 ? id.slice(cut + 2) : id
}

function tablePathOf(fields: Record<string, unknown>) {
  const raw = fields.tablePath ?? (typeof fields.table === 'string' && String(fields.table).startsWith('/') ? fields.table : '')
  return normalizeCollectionPath(String(raw ?? ''))
}

function uniqueViewName(base: string, views: StoredView[]) {
  const names = new Set(views.map((view) => view.name))
  if (!names.has(base)) return base
  let n = 2
  while (names.has(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value === 'string' && value.trim()) {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

function filtersFromPatch(value: unknown): { filters: Record<string, string>; filterTree: FilterGroup } {
  const raw = parseJsonValue(value)
  if (looksLikeFilterTree(raw)) {
    return { filters: {}, filterTree: normalizeFilterGroup(raw) }
  }
  const filters = asFilters(raw)
  return { filters, filterTree: flatFiltersToTree(filters) }
}

function sortsFromPatch(value: unknown, sortField: unknown, sortDir: unknown): { sorts: SortRule[]; sortField: string; sortDir: 'asc' | 'desc' } {
  const sorts = parseSortsInput(value, String(sortField || 'title'), sortDir === 'desc' ? 'desc' : 'asc')
  return {
    sorts,
    sortField: sorts[0]?.field || 'title',
    sortDir: sorts[0]?.dir ?? 'asc',
  }
}

function asFilters(value: unknown): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, string> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item == null || typeof item === 'object') continue
      out[key] = String(item)
    }
    return out
  }
  return {}
}

function asRecord(path: string, tableName: string, view: StoredView): DbRecord {
  const filters = view.filters && typeof view.filters === 'object' ? view.filters : {}
  const sorts = parseSortsInput(view.sorts, view.sortField, view.sortDir === 'desc' ? 'desc' : 'asc')
  const filterTree = view.filterTree
  return {
    id: rowId(path, view.id),
    title: view.name,
    table: tableName,
    tablePath: path,
    viewId: view.id,
    mode: view.mode ?? 'table',
    sortField: sorts[0]?.field || view.sortField || 'title',
    sortDir: sorts[0]?.dir ?? (view.sortDir === 'desc' ? 'desc' : 'asc'),
    query: view.query ?? '',
    groupBy: view.groupBy ?? '',
    tree: view.tree !== false,
    wrap: Boolean(view.wrap),
    truncate: view.truncate !== false,
    pageSize: normalizePageSize(view.pageSize),
    columns: parseViewColumns(view.columns),
    columnWidths: view.columnWidths ?? {},
    filters: JSON.stringify(filters),
    sorts: JSON.stringify(sorts.map((item) => ({ field: item.field, dir: item.dir }))),
    filterTree: filterTree ? JSON.stringify(filterTree) : '',
    ...recordBuiltinValues(view as Record<string, unknown>),
  }
}

/** 工具广播给前端的视图快照（含扁平 filters / filterTree / sorts）。 */
export function clientViewFromDbRow(row: Record<string, unknown> | undefined) {
  if (!row) return undefined
  const id = String(row.viewId ?? '').trim()
  if (!id || isReadOnlyViewId(id)) return undefined
  const parsedFilters = filtersFromPatch(row.filters)
  const fromTree = parseJsonValue(row.filterTree)
  const tree = looksLikeFilterTree(fromTree) ? normalizeFilterGroup(fromTree) : parsedFilters.filterTree
  const sortsPatch = sortsFromPatch(row.sorts, row.sortField, row.sortDir)
  return {
    id,
    tablePath: normalizeCollectionPath(String(row.tablePath ?? '')),
    name: String(row.title ?? row.name ?? id),
    mode: row.mode,
    sortField: sortsPatch.sortField,
    sortDir: sortsPatch.sortDir,
    sorts: sortsPatch.sorts,
    query: String(row.query ?? ''),
    groupBy: String(row.groupBy ?? ''),
    columns: parseViewColumns(row.columns),
    filters: parsedFilters.filters,
    filterTree: countFilterRules(tree) ? tree : undefined,
    tree: row.tree !== false,
    wrap: Boolean(row.wrap),
    truncate: row.truncate !== false,
    pageSize: normalizePageSize(row.pageSize),
    columnWidths: row.columnWidths,
    builtin: false,
  }
}

export function viewsCollection(
  store: SavedViewsStore,
  tables: () => CollectionInfo[],
  accountId: () => string = () => '',
): CollectionSpec {
  const list = () => store.rows(tables(), accountId())
  return {
    id: 'views',
    path: '/views',
    label: '视图',
    view: {
      moduleId: 'views-db',
      route: '/db-views',
      title: '视图',
      inspector: false,
      blurb: '各表已保存的视图。列表 db_list /views。新建 db_create /views records=[{title, tablePath, mode}]，tablePath 如 /pages。改筛选 db_update 写 filters 或 filterTree（JSON 字符串）。filters 扁平等于：{"project":"biu","status":"open"}。OR/复杂条件用 filterTree：{"kind":"group","combinator":"or","children":[{"kind":"rule","field":"facet","op":"eq","value":"dp"},{"kind":"rule","field":"status","op":"eq","value":"open"}]}。rule.op=eq|neq|contains|not_contains|is_empty|not_empty|gt|lt|within，value 是字符串。排序 sorts：[{"field":"title","dir":"asc"}]。内置「全部 xx」只读。',
      order: 17,
      icon: 'eye',
    },
    records: { update: true, create: true, delete: true },
    schema: {
      labelField: 'title',
      columns: ['title', 'table', 'mode', 'sortField', 'sortDir', 'query', 'groupBy', 'pageSize'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '视图', writable: true },
        table: { type: 'string', label: '来源表' },
        tablePath: { type: 'string', label: '表路径', writable: true },
        viewId: { type: 'string', label: '视图 ID' },
        mode: { type: 'string', label: '呈现', writable: true },
        sortField: { type: 'string', label: '排序字段', writable: true },
        sortDir: { type: 'select', label: '升降序', writable: true, enum: ['asc', 'desc'] },
        sorts: { type: 'string', label: '排序', writable: true, description: VIEW_SORTS_DESCRIPTION },
        query: { type: 'string', label: '搜索', writable: true },
        groupBy: { type: 'string', label: '分组', writable: true },
        tree: { type: 'boolean', label: '树形' },
        wrap: { type: 'boolean', label: '换行' },
        truncate: { type: 'boolean', label: '截断' },
        pageSize: { type: 'number', label: '每页', writable: true },
        columns: { type: 'multi-select', label: '列', writable: true },
        filters: { type: 'string', label: '筛选', writable: true, description: VIEW_FILTERS_DESCRIPTION },
        filterTree: { type: 'string', label: '筛选树', writable: true, description: VIEW_FILTER_TREE_DESCRIPTION },
      },
    },
    list,
    get: (id) => list().find((row) => row.id === id) ?? null,
    update: (id, patch) => store.write(id, patch, accountId(), tables()),
    create: (rows) => rows.map((fields) => store.create(fields, tables(), accountId())),
    remove: async (query) => {
      const ids = query.ids ?? []
      for (const id of ids) store.remove(id, accountId())
      return ids
    },
  }
}
