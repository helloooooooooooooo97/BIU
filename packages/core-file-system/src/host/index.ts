import {
  biuSqlitePath,
  dataHome,
  dataPath,
  currentAccountId,
  readEditorContent,
  readEditorContentRecord,
  writeEditorContent,
  ASSET_GC_INTERVAL_MS,
} from '@biu/host-plugin-loader/data-dir'
import { getAccountPort } from '@biu/host-plugin-loader/ports'
import { getRuntimePolicy, resolveScopedWorkspaceId } from '@biu/host-plugin-loader/runtime'
import { type Action as PermissionAction, type AuthorizationService } from '@biu/host-account/authorization'
import { Service, type Context } from 'cordis'
import {
  DATABASE_CHANNEL,
  databaseChannelPayload,
  emptySchemaValue,
  isEmptySchemaValue,
  normalizeSchemaValue,
  pruneSchemaValue,
  sanitizeTagValuesPatch,
  schemaSearchHaystack,
  withBuiltinFields,
  hasCollectionDeleteQuery,
  actionVisibleToUser,
  type CollectionAction,
  type CollectionActionInfo,
  type CollectionInfo,
  type CollectionListQuery,
  type CollectionSchema,
  type CollectionSchemaPack,
  type CollectionFields,
  type CollectionSpec,
  type Database,
  type DbRecord,
  type ListPage,
  type PersonValue,
  isAssignableRecordId,
} from '@biu/type-file-system'
import { type PageBanner } from '../page-banner.ts'
import {
  asIds,
  assertSameTableLinks,
  coerce,
  coerceTagPatch,
  isPlainObject,
  parseContent,
  parseRecords,
  pickWritablePatch,
  takeBannerPatch,
  takeRequestedRecordId,
  unusedRecordId,
} from './schema-coerce.ts'
import { registerDatabaseTools } from './agent-tools.ts'
import { databaseHttpFailure, registerDatabaseHttpRoutes } from './http-routes.ts'
export { databaseHttpFailure }
import { SavedViewsStore, viewsCollection, type StoredView } from './saved-views.ts'
import { RecordViewsStore, wrapCollectionRecordViews } from './record-views.ts'
import { TagStore } from './tags-store.ts'
import { SharesStore } from './shares-store.ts'
import { builtinAllView, stubBuiltinAllView, stubBuiltinMemberView } from '../catalog-views.ts'
import { isIndexCollection, isSystemCollection } from '../paths.ts'
import { dataCollection, isDataOverviewSource, overviewRecord } from './data-collection.ts'
import { recordMatchesAccessRule } from '../view-access.ts'
import { type SharedViewDef } from '../share-view-match.ts'
import { FileSystemAssets, collectAssetNames, assetNamesFromMarkdown, assetNamesFromHtml } from './assets-store.ts'
import { tagsCollection, parseStampRecordId } from './tags-collection.ts'
import { trashCollection } from './trash-collection.ts'
import { runWorkspaceAssetGc } from './asset-gc-run.ts'
import { ContentTurnService } from './content-turn-service.ts'
import {
  DatabaseAccessPolicy,
  isBuiltinPluginRecord,
  isBuiltinPluginRow,
  isRecordInWorkspace,
  resolveScopeTarget,
  type WorkspaceFiles,
} from './access-policy.ts'
import {
  applyRecordPersonOverlay,
  resolveNamedPerson,
  stampRecordActor,
  touchRecordActor,
  type ActorOverlayHost,
} from './actor-overlay.ts'
import {
  executeEditAsset,
  executeEditContent,
  executeEditDoc,
  type DocAssetEditHost,
} from './doc-asset-edit.ts'
import { stripMentionLabels } from '../mention-markup.ts'
import {
  AGENTS_COLLECTION_PATH,
  DATA_COLLECTION_PATH,
  EDITOR_BLOCKS_COLLECTION_PATH,
  PAGES_COLLECTION_PATH,
  PLUGINS_COLLECTION_PATH,
  TAGS_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  normalizeCollectionPath,
  splitResourcePath,
} from '../paths.ts'
import { matchListFilterRecord, normalizeSorts, parseTagFlatColumnKey, readTagFieldValue, sortRecordsBy } from '../query-logic.ts'
import { actionWhenKeys } from '../shared/fields.ts'

function publicAction(action: CollectionAction): CollectionActionInfo {
  const { run: _run, ...info } = action
  if (!actionVisibleToUser(info)) return { ...info, placement: [] }
  return info
}

const STAMP_FIELD_BLOCKLIST = new Set([
  'id',
  'title',
  'table',
  'tablePath',
  'sourceId',
  'tagId',
  'tag',
  'fieldCount',
  'stampCount',
  'content',
  'emoji',
  'createdAt',
  'updatedAt',
])

function schemaWithTagPack(schema: CollectionSchema, pack: CollectionSchemaPack | null): CollectionSchema {
  if (!pack?.fields.length) {
    return {
      ...schema,
      columns: ['title', 'table'],
    }
  }
  const fields = { ...schema.fields }
  const extra: string[] = []
  for (const field of pack.fields) {
    if (field.deleted || STAMP_FIELD_BLOCKLIST.has(field.key)) continue
    fields[field.key] = {
      type: field.type,
      label: field.label ?? field.key,
      writable: false,
      computed: true,
      ...(field.enum ? { enum: field.enum } : {}),
    }
    extra.push(field.key)
  }
  return { ...schema, fields, columns: ['title', 'table', ...extra] }
}

function ensureColumn(columns: string[] | undefined, key: string) {
  if (!columns) return columns
  return columns.includes(key) ? columns : [...columns, key]
}

function columnAfter(columns: string[] | undefined, key: string, after: string) {
  if (!columns || columns.includes(key)) return columns
  const index = columns.indexOf(after)
  if (index < 0) return [...columns, key]
  return [...columns.slice(0, index + 1), key, ...columns.slice(index + 1)]
}

function schemaFor(spec: CollectionSpec): CollectionSchema {
  const contentField = spec.schema.contentField ?? 'content'
  const raw = withBuiltinFields(spec.schema.fields, contentField, 'title')
  const fields: CollectionFields = { ...raw }
  for (const [key, field] of Object.entries(raw)) {
    fields[key] = field.computed ? { ...field, writable: false } : field
  }
  let columns = ensureColumn(spec.schema.columns, 'tag')
  if (!isSystemCollection(spec.path) && !isIndexCollection(spec.path)) {
    fields.shareScope = {
      type: 'select',
      label: '分享',
      computed: true,
      writable: false,
      sortable: true,
      enum: ['私人', '空间', '共享'],
      description: '计算属性。按当前能进的人：只有创建者是私人，有内部成员是空间，有外部协作者或公开/局域网链接是共享。',
    }
    fields.shareRole = {
      type: 'select',
      label: '权限',
      computed: true,
      writable: false,
      sortable: true,
      enum: ['管理', '编辑', '查看'],
      description: '计算属性。当前用户对这一条的权限：管理、编辑或查看。',
    }
    columns = columnAfter(ensureColumn(columns, 'shareScope'), 'shareRole', 'shareScope')
  }
  return {
    ...spec.schema,
    labelField: 'title',
    contentField,
    fields,
    columns,
    actions: (spec.actions ?? []).map(publicAction),
    records: {
      update: Boolean(spec.records?.update),
      create: Boolean(spec.records?.create),
      delete: Boolean(spec.records?.delete),
    },
  }
}

function assertRecordCaps(spec: CollectionSpec) {
  for (const action of spec.actions ?? []) {
    const builtinDelete = spec.path !== TRASH_COLLECTION_PATH && (action.id === 'delete' || action.id === 'trash')
    if (!builtinDelete && !action.run) throw new Error(`action has no handler: ${action.id}`)
  }
  if (spec.records?.update && !spec.update) throw new Error(`collection ${spec.id}: records.update 为 true 时必须提供 update`)
  if (spec.records?.create && !spec.create) throw new Error(`collection ${spec.id}: records.create 为 true 时必须提供 create`)
  if (spec.records?.delete && !spec.remove) throw new Error(`collection ${spec.id}: records.delete 为 true 时必须提供 remove`)
  if (spec.create && !spec.records?.create) throw new Error(`collection ${spec.id}: 提供了 create 但未声明 records.create`)
  if (spec.remove && !spec.records?.delete) throw new Error(`collection ${spec.id}: 提供了 remove 但未声明 records.delete`)
}

function collectionCaps(spec: CollectionSpec) {
  return [
    'list',
    'read',
    spec.records?.update && spec.update ? 'update' : null,
    spec.records?.create && spec.create ? 'create' : null,
    spec.records?.delete && spec.remove ? 'delete' : null,
    spec.actions?.length ? 'action' : null,
    'content',
  ].filter(Boolean)
}

function isEditorContentSpec(spec: CollectionSpec) {
  return schemaFor(spec).contentBackend === 'editorContent'
}

function contentKey(spec: CollectionSpec) {
  return schemaFor(spec).contentField ?? 'content'
}

function withoutContent(spec: CollectionSpec, row: DbRecord): DbRecord {
  const key = contentKey(spec)
  if (!Object.prototype.hasOwnProperty.call(row, key)) return row
  const field = schemaFor(spec).fields[key]
  if (field && field.type !== 'file') return row
  const next = { ...row }
  delete next[key]
  return next
}

const LIST_FIELD_COMPANIONS: Record<string, string[]> = {
  usage: ['usageParts'],
  title: ['parentChain', 'blocked', 'emoji', 'actionIds'],
  table: ['tablePath', 'tableIcon', 'sourceId'],
}

function listedColumnKeys(requested: unknown, labelField: string, schema?: CollectionSchema): string[] | null {
  if (!Array.isArray(requested) || !requested.length) return null
  const keys: string[] = []
  const seen = new Set<string>()
  const add = (key: string) => {
    const next = key.trim()
    if (!next || seen.has(next)) return
    seen.add(next)
    keys.push(next)
  }
  add('id')
  for (const item of requested) {
    const raw = String(item ?? '').trim()
    if (!raw) continue
    add(raw === 'label' ? labelField : raw)
  }
  for (const key of [...keys]) {
    for (const extra of LIST_FIELD_COMPANIONS[key] ?? []) add(extra)
  }
  for (const key of actionWhenKeys(schema)) add(key)
  if (schema?.fields.builtin) add('builtin')
  return keys
}

type ListDecorateNeed = {
  tag: boolean
  people: boolean
  meta: boolean
  shareScope: boolean
  shareRole: boolean
}

function listDecorateNeed(wanted: string[] | null | undefined): ListDecorateNeed | null {
  if (!wanted?.length) return null
  const set = new Set(wanted)
  const shareScope = set.has('shareScope')
  return {
    tag: shareScope || set.has('tag') || wanted.some((key) => key.startsWith('tag::')),
    people: set.has('createdBy') || set.has('updatedBy'),
    meta: set.has('emoji'),
    shareScope,
    shareRole: set.has('shareRole'),
  }
}

function pickListedFields(row: DbRecord, keys: string[]): DbRecord {
  const next: DbRecord = { id: row.id }
  for (const key of keys) {
    if (key === 'path' || key === 'kind') continue
    if (parseTagFlatColumnKey(key)) {
      next[key] = readTagFieldValue(row, key)
      continue
    }
    if (Object.prototype.hasOwnProperty.call(row, key)) next[key] = row[key]
  }
  return next
}

export function matchActionWhen(record: DbRecord, when?: Record<string, unknown>) {
  if (!when) return true
  for (const [key, expected] of Object.entries(when)) {
    const actual = record[key]
    if (expected === true || expected === false) {
      const flag = actual === true || actual === 'true'
      if (flag !== expected) return false
      continue
    }
    if (String(actual ?? '') !== String(expected)) return false
  }
  return true
}

function publicCollection(item: CollectionSpec): CollectionInfo {
  const create = Boolean(item.records?.create && item.create)
  const update = Boolean(item.records?.update && item.update)
  const del = Boolean(item.records?.delete && item.remove)
  return {
    id: item.id,
    path: item.path,
    kind: 'collection',
    label: item.label ?? item.id,
    view: item.view ?? null,
    caps: {
      create,
      update,
      delete: del,
      overviewCreate: create && item.view?.sidebar !== false,
    },
  }
}

export function splitPath(path: string): string[] {
  const hit = splitResourcePath(path)
  if (!hit) return []
  const name = hit.collection.replace(/^\//, '')
  return hit.recordId ? [name, hit.recordId] : [name]
}

function navPath(path: string) {
  return normalizeCollectionPath(path)
}

function navTitle(spec: CollectionSpec) {
  return (spec.view?.title ?? spec.label ?? spec.id).trim()
}

function assertViewAvailable(entry: CollectionSpec, others: CollectionSpec[]) {
  const view = entry.view
  if (!view) return
  const route = navPath(view.route || '')
  if (!view.route?.trim()) throw new Error('view.route 必填：导航路由由登记方自己选定')
  if (route === '/' || route === '/s' || route === AGENTS_COLLECTION_PATH) throw new Error(`view.route 与内置路由冲突：${view.route}`)
  const title = navTitle(entry)
  if (!title) throw new Error('view.title / label 不能为空')
  for (const other of others) {
    if (!other.view || other.id === entry.id) continue
    const otherRoute = navPath(other.view.route)
    const otherTitle = navTitle(other)
    if (other.view.moduleId === view.moduleId) {
      throw new Error(`导航 id 重复：${view.moduleId}`)
    }
    if (otherRoute === route) {
      throw new Error(`路由重复：${route} 已被「${otherTitle}」占用`)
    }
    if (otherTitle === title) {
      throw new Error(`名称重复：导航栏已有「${title}」`)
    }
  }
}

function matchQuery(record: DbRecord, q: string, packs: CollectionSchemaPack[] = []) {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  if (String(record.id).toLowerCase().includes(needle)) return true
  for (const [key, value] of Object.entries(record)) {
    if (value == null || value === '') continue
    if (key === 'tag' || (value && typeof value === 'object' && !Array.isArray(value) && 'tags' in (value as object))) {
      if (schemaSearchHaystack(value, packs).toLowerCase().includes(needle)) return true
      continue
    }
    const text = Array.isArray(value) ? value.map(String).join(' ') : typeof value === 'object' ? '' : String(value)
    if (text.toLowerCase().includes(needle)) return true
  }
  return false
}

function matchListFilter(record: DbRecord, filter: Record<string, unknown> | undefined, schema: CollectionSchema, packs: CollectionSchemaPack[] = []) {
  return matchListFilterRecord(record, filter, schema, packs)
}

const OVERLAY_LIST_FIELDS = new Set(['emoji', 'tag', 'createdBy', 'updatedBy', 'shareScope', 'shareRole'])

function overlayListField(field: string) {
  return OVERLAY_LIST_FIELDS.has(String(field ?? '')) || String(field ?? '').startsWith('tag::')
}

export function listNeedsMatchOverlay(
  filter: Record<string, unknown> | undefined,
  q: string,
  sortField: string,
  sorts?: Array<{ field: string; dir: string }>,
) {
  if (overlayListField(sortField)) return true
  for (const rule of sorts ?? []) {
    if (overlayListField(rule.field)) return true
  }
  if (!filter) return false
  if (filter.$tree && typeof filter.$tree === 'object') return true
  for (const [key, expected] of Object.entries(filter)) {
    if (key === '$tree' || key === '$scope' || key === '$ids' || key === 'shareScope' || expected == null || expected === '') continue
    if (overlayListField(key)) return true
  }
  return false
}

/** spec.list 真正用到的查询。分组筛选在内存里做，好让并发的组页共用一次整表扫描。 */
export function specListQuery(query: CollectionListQuery): CollectionListQuery {
  const tagId = String(query.filter?.tagId ?? '').trim()
  const sessionId = String(query.filter?.sessionId ?? '').trim()
  const filter = {
    ...(tagId ? { tagId } : {}),
    ...(sessionId ? { sessionId } : {}),
  }
  return {
    ...(query.q != null ? { q: query.q } : {}),
    ...(query.trash != null ? { trash: query.trash } : {}),
    ...(query.ids != null ? { ids: query.ids } : {}),
    ...(Object.keys(filter).length ? { filter } : {}),
  }
}

/** SQLite 扫描是同步的。套两层 setImmediate，中间那次 poll 才能读到一起进来的分组请求。 */
function shareInflight<T>(map: Map<string, Promise<T>>, key: string, run: () => Promise<T>): Promise<T> {
  const hit = map.get(key)
  if (hit) return hit
  const pending = new Promise<T>((resolve, reject) => {
    setImmediate(() => {
      setImmediate(() => {
        run().then(resolve, reject)
      })
    })
  })
  map.set(key, pending)
  pending.finally(() => {
    if (map.get(key) === pending) map.delete(key)
  })
  return pending
}

function sortRecords(rows: DbRecord[], field: string, dir: 'asc' | 'desc', sorts?: Array<{ field: string; dir: 'asc' | 'desc' }>) {
  const rules = normalizeSorts(sorts, field, dir)
  return sortRecordsBy(rows, rules)
}

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 200
const HARD_DELETE_PATHS = new Set([
  TRASH_COLLECTION_PATH,
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
])

type VisibleSortedPack = {
  rows: DbRecord[]
  personal: DbRecord[]
  workspace: DbRecord[]
  shared: DbRecord[]
}

export function clampPage(limit?: number, offset?: number) {
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(Number(limit)) ? Number(limit) : DEFAULT_PAGE_SIZE))
  const start = Math.max(0, Number.isFinite(Number(offset)) ? Math.floor(Number(offset)) : 0)
  return { limit: size, offset: start }
}

/** /views 行的 id 是 `表::视图`（表名不带前导斜杠），删视图本体时按它定位。 */
function rowIdOfView(collection: string, viewId: string) {
  return `${normalizeCollectionPath(collection).replace(/^\//, '')}::${viewId}`
}

/** /views 行里能定位视图本体的 (表, 视图 id) 对。 */
function viewRowKeys(rows: DbRecord[]) {
  const out: Array<{ collection: string; viewId: string }> = []
  for (const row of rows) {
    const collection = normalizeCollectionPath(String(row.tablePath ?? ''))
    const viewId = String(row.viewId ?? '').trim()
    if (!collection || collection === '/' || !viewId) continue
    out.push({ collection, viewId })
  }
  return out
}

export class DatabaseService extends Service implements Database {
  private collections = new Map<string, CollectionSpec>()
  private contentWrites = new Map<string, Promise<void>>()
  tags = new TagStore()
  shares = new SharesStore()
  assets = new FileSystemAssets()
  viewCatalog?: { viewsFor(collectionPath: string): SharedViewDef[]; remove?(id: string, accountId?: string): unknown }
  recordViews = new RecordViewsStore()
  savedViews?: SavedViewsStore
  private readonly access: DatabaseAccessPolicy
  private inflightMatches = new Map<string, Promise<DbRecord[]>>()
  private inflightScans = new Map<string, Promise<DbRecord[]>>()
  private inflightVisible = new Map<string, Promise<VisibleSortedPack>>()
  private visibleCache = new Map<string, VisibleSortedPack>()
  private visibleGen = 0
  private boundAuth?: AuthorizationService
  private unbindAuth?: () => void
  recycleAssets?: () => void

  private bumpQueued = false
  private pendingBumpTenants = new Map<
    string,
    { workspaceId: string; accountId: string; paths: Set<string>; all: boolean }
  >()

  constructor(ctx: Context) {
    super(ctx, 'database')
    const self = this
    this.access = new DatabaseAccessPolicy({
      tags: this.tags,
      shares: this.shares,
      get viewCatalog() {
        return self.viewCatalog
      },
      collabStore: () => this.collabStore(),
      authorization: () => this.authorization(),
      deviceWorkspace: () => this.deviceWorkspace(),
      markDeviceRecord: (collection, id) => this.markDeviceRecord(collection, id),
      collection: (pathOrId) => this.collection(pathOrId),
      schemaFor: (spec) => schemaFor(spec),
      applyTagOverlay: (spec, row) => this.applyTagOverlay(spec, row),
    })
  }

  private async serializeContentWrite<T>(path: string, run: () => Promise<T>): Promise<T> {
    const previous = this.contentWrites.get(path) ?? Promise.resolve()
    let release = () => {}
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const queued = previous.then(() => current)
    this.contentWrites.set(path, queued)
    await previous
    try {
      return await run()
    } finally {
      release()
      if (this.contentWrites.get(path) === queued) this.contentWrites.delete(path)
    }
  }

  register(spec: CollectionSpec) {
    const path = normalizeCollectionPath(spec.path || `/${spec.id}`)
    if (path === '/') throw new Error('collection path cannot be /')
    if (splitPath(path).length !== 1) throw new Error(`collection path must be one segment: ${path}`)
    let entry = { ...spec, path }
    return this.ctx.effect(() => {
      if (this.collections.has(entry.id)) throw new Error(`collection already registered: ${entry.id}`)
      if ([...this.collections.values()].some((item) => item.path === path && item.id !== entry.id)) {
        throw new Error(`collection path already registered: ${path}`)
      }
      assertViewAvailable(entry, [...this.collections.values()])
      assertRecordCaps(entry)
      entry = wrapCollectionRecordViews(entry, this.recordViews)
      const view = entry.view
      if (view) entry = { ...entry, view: { ...view, route: navPath(view.route) } }
      this.collections.set(entry.id, entry)
      this.bump()
      return () => {
        this.collections.delete(entry.id)
        this.bump()
      }
    }, `database.register ${entry.id}`)
  }

  collection(pathOrId: string) {
    const path = normalizeCollectionPath(pathOrId)
    return (
      this.collections.get(pathOrId) ??
      [...this.collections.values()].find((item) => item.path === path || item.id === pathOrId)
    )
  }

  collectionsList() {
    return [...this.collections.values()].sort((a, b) => a.path.localeCompare(b.path))
  }

  publishCollection(item: CollectionSpec): CollectionInfo {
    return publicCollection(item)
  }

  private async loadCollectionRows(spec: CollectionSpec, query: CollectionListQuery) {
    const rows = await spec.list(query)
    const listed = !query.ids?.length ? rows : rows.filter((row) => query.ids!.includes(row.id))
    const hidden = this.tags.deletedIds(spec.path)
    const builtinPlugin = (row: Record<string, unknown>) => isBuiltinPluginRow(spec.path, row)
    return query.trash
      ? listed.filter((row) => hidden.has(row.id) && !builtinPlugin(row))
      : listed.filter((row) => !hidden.has(row.id) || builtinPlugin(row))
  }

  private decorateSlice(spec: CollectionSpec, rows: DbRecord[], wanted?: string[] | null) {
    this.access.clearCaches()
    try {
      const need = listDecorateNeed(wanted)
      return rows.map((row) => this.decorateRecord(spec, row, need))
    } finally {
      this.access.clearCaches()
    }
  }

  private collabStore() {
    try {
      return (this.ctx.get('account') as { store?: WorkspaceFiles } | undefined)?.store
    } catch {
      return undefined
    }
  }

  private logMemberActivity(input: {
    action: string
    collection: string
    recordId?: string
    recordTitle?: string
    detail?: string
  }) {
    if (isSystemCollection(input.collection) || isIndexCollection(input.collection)) return
    try {
      const store = this.collabStore() as {
        recordActivity?: (row: {
          category: 'data' | 'access' | 'member' | 'session' | 'automation'
          action: string
          collection?: string
          recordId?: string
          recordTitle?: string
          detail?: string
        }) => void
      } | undefined
      store?.recordActivity?.({
        category: 'data',
        action: input.action,
        collection: input.collection,
        recordId: input.recordId,
        recordTitle: input.recordTitle,
        detail: input.detail,
      })
    } catch {
      /* 活动日志失败不影响主写入流程 */
    }
  }

  private authorization() {
    try {
      const auth = (this.ctx.get('account') as { authorization?: AuthorizationService } | undefined)?.authorization
      if (auth && auth !== this.boundAuth) {
        this.unbindAuth?.()
        this.boundAuth = auth
        this.unbindAuth = auth.onInvalidate(() => this.bump())
      }
      return auth
    } catch {
      return undefined
    }
  }

  private withLocationShareScope(schema: CollectionSchema) {
    if (!schema.fields.shareScope || !this.deviceWorkspace()) return schema
    return {
      ...schema,
      fields: {
        ...schema.fields,
        shareScope: {
          ...schema.fields.shareScope,
          enum: ['私人', '共享'],
          description: '计算属性。本机空间只有私人（仅自己）和共享（局域网链接）。数据都在这台设备上。',
        },
      },
    }
  }

  private rewriteOverviewRecordPath(path: string) {
    const parts = splitPath(path)
    if (parts.length !== 2 || parts[0] !== 'data') return ''
    const stamp = parseStampRecordId(parts[1]!)
    if (!stamp || stamp.collection === DATA_COLLECTION_PATH) return ''
    if (!this.collection(stamp.collection)) return ''
    return `${stamp.collection}/${stamp.recordId}`
  }

  private overviewRowActions(): CollectionActionInfo[] {
    const out: CollectionActionInfo[] = []
    for (const source of this.collectionsList()) {
      if (!isDataOverviewSource(source.path)) continue
      const seen = new Set<string>()
      for (const action of schemaFor(source).actions ?? []) {
        const places = action.placement ?? ['row', 'detail']
        if (!places.includes('row') || !actionVisibleToUser(action)) continue
        if (seen.has(action.id)) continue
        seen.add(action.id)
        const { run: _run, ...info } = action as CollectionAction
        out.push({ ...info, collection: source.path })
      }
    }
    return out
  }

  private overviewTableEnum() {
    const listed: string[] = []
    for (const source of this.collectionsList()) {
      if (!isDataOverviewSource(source.path)) continue
      const title = String(source.view?.title ?? source.label ?? source.id).trim() || source.path
      if (!listed.includes(title)) listed.push(title)
    }
    return listed
  }

  private withOverviewTableSelect(spec: CollectionSpec, schema: CollectionSchema) {
    if (spec.path !== DATA_COLLECTION_PATH || !schema.fields.table) return schema
    const listed = this.overviewTableEnum()
    return {
      ...schema,
      fields: {
        ...schema.fields,
        table: {
          ...schema.fields.table,
          type: 'select' as const,
          enum: listed,
          enumLabels: Object.fromEntries(listed.map((title) => [title, title])),
        },
      },
    }
  }

  private schemaForCurrent(spec: CollectionSpec, schema = schemaFor(spec)) {
    if (spec.path === DATA_COLLECTION_PATH) schema = { ...schema, actions: this.overviewRowActions() }
    schema = this.withOverviewTableSelect(spec, schema)
    schema = this.withLocationShareScope(schema)
    const authorization = this.authorization()
    const actor = authorization?.currentActor()
    if (!authorization || !actor) return schema
    const resource = { type: 'collection' as const, workspaceId: actor.workspaceId, collection: spec.path }
    const canUpdate = authorization.authorize(actor, 'resource:update', resource).allowed
    const canCreate = authorization.authorize(actor, 'resource:create', resource).allowed
    const canDelete = authorization.authorize(actor, 'resource:delete', resource).allowed
    if (canUpdate && canCreate && canDelete) return schema
    return {
      ...schema,
      fields: canUpdate
        ? schema.fields
        : Object.fromEntries(Object.entries(schema.fields).map(([key, field]) => [key, { ...field, writable: false }])),
      records: {
        ...schema.records,
        update: Boolean(schema.records?.update && canUpdate),
        create: Boolean(schema.records?.create && canCreate),
        delete: Boolean(schema.records?.delete && canDelete),
      },
    }
  }

  private visibleRecords<T extends { id?: unknown; pageId?: unknown; collection?: unknown; sessionId?: unknown; sourceId?: unknown; tablePath?: unknown }>(
    collection: string,
    rows: T[],
    action: PermissionAction = 'resource:read',
  ) {
    return this.access.visibleRecords(collection, rows, action)
  }

  visibleTagIds(ids: string[], action: PermissionAction = 'resource:read'): Set<string> {
    if (!ids.length) return new Set()
    const visible = this.visibleRecords(
      TAGS_COLLECTION_PATH,
      ids.map((id) => ({ id })),
      action,
    )
    return new Set(visible.map((row) => String(row.id ?? '')))
  }

  recordTagOwnership(id: string) {
    const accountId = currentAccountId().trim()
    if (!accountId) return
    const existing = this.tags.recordMeta(TAGS_COLLECTION_PATH, id)
    if (!existing?.createdBy?.accountId) {
      this.tags.writeRecordMeta(TAGS_COLLECTION_PATH, id, {
        createdBy: { kind: 'user', accountId, name: accountId },
      })
    }
  }

  private recordsInScope<T extends { id?: unknown; pageId?: unknown; collection?: unknown; sessionId?: unknown; sourceId?: unknown; tablePath?: unknown }>(
    collection: string,
    rows: T[],
    scope: 'personal' | 'workspace' | 'shared' | '',
  ) {
    return this.access.recordsInScope(collection, rows, scope)
  }

  private attachWorkspaceRecord(
    collection: string,
    recordId: string,
    policy?: {
      accessMode?: 'inherit' | 'private' | 'members' | 'restricted'
      memberDefaultRole?: 'viewer' | 'editor'
      parentCollection?: string
      parentRecordId?: string
    },
  ) {
    this.access.attachWorkspaceRecord(collection, recordId, policy)
  }

  private grantAllMembersEditable(collection: string, recordId: string) {
    this.access.grantAllMembersEditable(collection, recordId)
  }

  private pluginCreateScope(args?: Record<string, unknown>): 'personal' | 'workspace' | 'shared' {
    const raw = String(args?.scope ?? '').trim()
    const device = this.deviceWorkspace()
    if (raw === 'shared') return 'shared'
    if (raw === 'workspace' && !device) return 'workspace'
    return 'personal'
  }

  private stampPluginCreateScope(recordId: string, args?: Record<string, unknown>) {
    const scope = this.pluginCreateScope(args)
    this.rememberScope(PLUGINS_COLLECTION_PATH, recordId, scope)
    const raw = String(args?.scope ?? '').trim()
    if ((raw === 'local' || this.deviceWorkspace()) && scope !== 'shared') this.markDeviceRecord(PLUGINS_COLLECTION_PATH, recordId)
  }

  rememberScope(collection: string, recordId: string, scope: 'personal' | 'workspace' | 'shared') {
    this.access.rememberScope(collection, recordId, scope)
  }

  markPublicView(collection: string, recordId: string) {
    this.access.markPublicView(collection, recordId)
  }

  private builtinPlugin(spec: CollectionSpec, id: string, record?: Record<string, unknown> | null) {
    return isBuiltinPluginRecord(spec, id, record)
  }

  private assertLiveRecord(
    spec: CollectionSpec,
    id: string,
    action: PermissionAction = 'resource:read',
    record?: { id?: unknown },
  ) {
    this.access.assertLiveRecord(spec, id, action, record)
  }

  async requirePath(path: string, action: PermissionAction) {
    const parts = splitPath(path)
    if (parts.length === 1) {
      const spec = this.collection(`/${parts[0]}`)
      if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
      const authorization = this.authorization()
      const actor = authorization?.currentActor()
      if (authorization && !actor) throw new Error('permission denied: UNAUTHENTICATED')
      if (authorization) {
        authorization.requireCurrent(action, {
          type: 'collection',
          workspaceId: actor!.workspaceId,
          collection: spec.path,
        })
      }
      return
    }
    if (parts.length !== 2) throw new Error(`invalid resource path: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    const record = await spec.get(parts[1]!)
    if (!record) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
    this.assertLiveRecord(spec, record.id, action, record)
  }

  requireAsset(name: string, action: 'resource:read' | 'resource:update') {
    const authorization = this.authorization()
    if (!authorization) return
    const actor = authorization.currentActor()
    if (!actor) throw new Error('permission denied: UNAUTHENTICATED')
    const refs = this.tags.recordsReferencingAsset(name)
    const allowed = refs.some((ref) => {
      const resource = {
        type: 'record' as const,
        workspaceId: actor.workspaceId,
        collection: ref.collection,
        recordId: ref.record_id,
      }
      return authorization.authorize(actor, action, resource).allowed
    })
    if (allowed) return
    if (action === 'resource:update' && refs.length === 0) {
      authorization.requireCurrent('resource:create', {
        type: 'collection',
        workspaceId: actor.workspaceId,
        collection: PAGES_COLLECTION_PATH,
      })
      return
    }
    throw new Error('permission denied: INSUFFICIENT_PERMISSION')
  }

  /** 校验目标 path 的读写权，并防止用自己有权限的 path 跨页读取或覆写归属于其他记录的文件。 */
  async requireAssetForPath(name: string, path: string, action: 'resource:read' | 'resource:update') {
    await this.requirePath(path, action)
    const authorization = this.authorization()
    if (!authorization) return
    const refs = this.tags.recordsReferencingAsset(name)
    if (refs.length === 0) return
    const parts = splitPath(path)
    if (parts.length === 2) {
      const collection = normalizeCollectionPath(`/${parts[0]}`)
      const recordId = parts[1]!
      if (refs.some((ref) => normalizeCollectionPath(ref.collection) === collection && ref.record_id === recordId)) {
        return
      }
    }
    this.requireAsset(name, action)
  }

  private async matchCollectionRows(
    spec: CollectionSpec,
    query: CollectionListQuery,
    filter: Record<string, unknown> | undefined,
    q: string,
    overlay = true,
  ) {
    const key = `${spec.path}\t${query.trash ? 1 : 0}\t${q}\t${overlay ? 1 : 0}\t${JSON.stringify(query.filter ?? {})}\t${(query.ids ?? []).join(',')}`
    return shareInflight(this.inflightMatches, key, () => this.matchCollectionRowsNow(spec, query, filter, q, overlay))
  }

  private scanCollectionRows(spec: CollectionSpec, query: CollectionListQuery, overlay: boolean) {
    const load = specListQuery(query)
    const key = `${spec.path}\t${load.trash ? 1 : 0}\t${load.q ?? ''}\t${overlay ? 1 : 0}\t${JSON.stringify(load.filter ?? {})}\t${(load.ids ?? []).join(',')}`
    return shareInflight(this.inflightScans, key, () => this.scanCollectionRowsNow(spec, load, overlay))
  }

  private listRemapsRecords(path: string) {
    return (
      path === TRASH_COLLECTION_PATH ||
      path === TAGS_COLLECTION_PATH ||
      path === EDITOR_BLOCKS_COLLECTION_PATH
    )
  }

  private preloadRelatedCollections(
    specPath: string,
    rows: DbRecord[],
    auth: AuthorizationService,
    actor: { workspaceId?: string; accountId?: string },
  ) {
    const extraScans: string[] = []
    const workspaceId = String(actor.workspaceId ?? '')
    const accountId = String(actor.accountId ?? '')
    if (!workspaceId || !this.listRemapsRecords(specPath)) return extraScans
    const seen = new Set([specPath])
    for (const row of rows) {
      const target = resolveScopeTarget(specPath, String(row.id ?? ''), row)
      if (!target.collection || seen.has(target.collection)) continue
      seen.add(target.collection)
      extraScans.push(target.collection)
      auth.preloadCollection(workspaceId, target.collection, accountId)
    }
    return extraScans
  }

  /** 并发的分组页共用一次授权和排序。组筛选、$scope 在内存里切。 */
  private visibleSortedCollectionRows(
    spec: CollectionSpec,
    query: CollectionListQuery,
    sortField: string,
    sortDir: 'asc' | 'desc',
    sorts: Array<{ field: string; dir: 'asc' | 'desc' }> | undefined,
    overlay: boolean,
  ) {
    const load = specListQuery(query)
    const actor = this.authorization()?.currentActor()
    const actorKey = actor
      ? `${actor.workspaceId}\t${actor.accountId}`
      : `${resolveScopedWorkspaceId(this.ctx)}\t${currentAccountId()}`
    const rules = normalizeSorts(sorts, sortField, sortDir)
    const key = `${spec.path}\t${load.trash ? 1 : 0}\t${load.q ?? ''}\t${overlay ? 1 : 0}\t${JSON.stringify(load.filter ?? {})}\t${(load.ids ?? []).join(',')}\t${JSON.stringify(rules)}\t${actorKey}`
    const cached = this.visibleCache.get(key)
    if (cached) return cached
    return shareInflight(this.inflightVisible, key, async () => {
      const gen = this.visibleGen
      const pack = await this.visibleSortedCollectionRowsNow(spec, query, sortField, sortDir, sorts, overlay)
      if (gen === this.visibleGen) this.visibleCache.set(key, pack)
      return pack
    })
  }

  private async visibleSortedCollectionRowsNow(
    spec: CollectionSpec,
    query: CollectionListQuery,
    sortField: string,
    sortDir: 'asc' | 'desc',
    sorts: Array<{ field: string; dir: 'asc' | 'desc' }> | undefined,
    overlay: boolean,
  ) {
    const tagFilter = spec.path === TAGS_COLLECTION_PATH ? String(query.filter?.tagId ?? '').trim() : ''
    const rows = await this.scanCollectionRows(spec, query, Boolean(tagFilter || overlay))
    if (tagFilter) await this.hydrateTagStamps(rows, this.tags.get(tagFilter))
    const auth = this.authorization()
    const actor = auth?.currentActor()
    const extraScans = auth && actor ? this.preloadRelatedCollections(spec.path, rows, auth, actor) : []
    try {
      const visible = sortRecords(this.visibleRecords(spec.path, rows), sortField, sortDir, sorts)
      return this.partitionVisibleRows(spec.path, visible)
    } finally {
      if (auth && actor) {
        for (const collection of extraScans) {
          auth.releaseCollection(actor.workspaceId, collection, actor.accountId)
        }
      }
    }
  }

  private partitionVisibleRows(collection: string, rows: DbRecord[]): VisibleSortedPack {
    const authorization = this.authorization()
    const actor = authorization?.currentActor()
    if (!authorization || !actor) {
      return { rows, personal: rows, workspace: rows, shared: rows }
    }
    const personal: DbRecord[] = []
    const workspace: DbRecord[] = []
    const shared: DbRecord[] = []
    for (const row of rows) {
      if (isBuiltinPluginRow(collection, row as { builtin?: unknown })) {
        shared.push(row)
        continue
      }
      const id = String(row.id ?? '')
      const stored = this.access.ownershipOf(collection, id)
      const label = this.access.shareScopeLabel(collection, id, row, stored)
      if (label === '共享') shared.push(row)
      else if (label === '空间') workspace.push(row)
      else personal.push(row)
    }
    return { rows, personal, workspace, shared }
  }

  private async scanCollectionRowsNow(spec: CollectionSpec, query: CollectionListQuery, overlay: boolean) {
    const rows = await this.loadCollectionRows(spec, query)
    if (!overlay) return rows
    return rows.map((row) => this.applyMetaOverlay(spec, this.applyTagOverlay(spec, row)))
  }

  private async matchCollectionRowsNow(
    spec: CollectionSpec,
    query: CollectionListQuery,
    filter: Record<string, unknown> | undefined,
    q: string,
    overlay = true,
  ) {
    let schema = schemaFor(spec)
    const packs = this.tags.list()
    const tagFilter = spec.path === TAGS_COLLECTION_PATH ? String(filter?.tagId ?? '').trim() : ''
    const tagPack = tagFilter ? this.tags.get(tagFilter) : null
    const rows = await this.scanCollectionRows(spec, query, Boolean(tagFilter || overlay))
    if (tagFilter) {
      schema = schemaWithTagPack(schema, tagPack)
      await this.hydrateTagStamps(rows, tagPack)
    }
    return rows.filter((row) => matchListFilter(row, filter, schema, packs) && matchQuery(row, q, packs))
  }

  private async hydrateTagStamps(rows: DbRecord[], pack: CollectionSchemaPack | null) {
    if (!pack?.fields.length) return
    const wanted = pack.fields.filter((field) => !field.deleted && !STAMP_FIELD_BLOCKLIST.has(field.key))
    if (!wanted.length) return
    for (const row of rows) {
      // stampRows already reads canonical tag values from the source index.
      // Re-reading every source record here turns each detail refresh into N reads.
      const bag = normalizeSchemaValue(row.tag).values[pack.id] ?? {}
      for (const field of wanted) {
        if (bag[field.key] !== undefined) row[field.key] = bag[field.key]
      }
    }
  }

  private disposeSessionAgents(ids: string[]) {
    try {
      const agents = this.ctx.get('agents') as { get?: (id: string) => { dispose?: () => void } | undefined } | undefined
      for (const id of ids) agents?.get?.(id)?.dispose?.()
    } catch {
      /* agents 未注入时忽略 */
    }
  }

  notifyShareChange() {
    this.access.clearShareCaches()
    this.bump()
  }

  notifyTagCatalog() {
    this.ctx.emit('database/change')
    const http = this.ctx.get('http') as { broadcast?: (type: string, payload: unknown) => void } | undefined
    http?.broadcast?.(DATABASE_CHANNEL, databaseChannelPayload('tags'))
  }

  notifyViewCatalog(path?: string) {
    const http = this.ctx.get('http') as { broadcast?: (type: string, payload: unknown) => void } | undefined
    const recPath = String(path ?? '').trim()
    http?.broadcast?.(DATABASE_CHANNEL, databaseChannelPayload('views', recPath ? { path: recPath } : {}))
  }

  notifyContent(path: string) {
    const http = this.ctx.get('http') as { broadcast?: (type: string, payload: unknown) => void } | undefined
    http?.broadcast?.(DATABASE_CHANNEL, databaseChannelPayload('content', { path }))
  }

  bump(path?: string) {
    this.visibleGen += 1
    this.access.clearShareCaches()
    this.inflightMatches.clear()
    this.inflightScans.clear()
    this.inflightVisible.clear()
    this.visibleCache.clear()
    this.ctx.emit('database/change')
    const workspaceId = resolveScopedWorkspaceId(this.ctx)
    const accountId = currentAccountId()
    const key = `${workspaceId}\0${accountId}`
    let entry = this.pendingBumpTenants.get(key)
    if (!entry) {
      entry = { workspaceId, accountId, paths: new Set(), all: false }
      this.pendingBumpTenants.set(key, entry)
    }
    const cleanPath = String(path ?? '').trim()
    if (cleanPath) entry.paths.add(cleanPath)
    else entry.all = true
    if (this.bumpQueued) return
    this.bumpQueued = true
    queueMicrotask(() => {
      this.bumpQueued = false
      const tenants = [...this.pendingBumpTenants.values()]
      this.pendingBumpTenants.clear()
      const http = this.ctx.get('http') as
        | { broadcast?: (type: string, payload: unknown, workspaceId?: string, accountId?: string) => void }
        | undefined
      for (const tenant of tenants) {
        if (tenant.all || tenant.paths.size === 0) {
          http?.broadcast?.(
            DATABASE_CHANNEL,
            databaseChannelPayload('records'),
            tenant.workspaceId || undefined,
            tenant.accountId || undefined,
          )
        } else {
          for (const targetPath of tenant.paths) {
            http?.broadcast?.(
              DATABASE_CHANNEL,
              databaseChannelPayload('records', { path: targetPath }),
              tenant.workspaceId || undefined,
              tenant.accountId || undefined,
            )
            if (targetPath === TAGS_COLLECTION_PATH || targetPath.startsWith(`${TAGS_COLLECTION_PATH}/`)) {
              http?.broadcast?.(
                DATABASE_CHANNEL,
                databaseChannelPayload('tags'),
                tenant.workspaceId || undefined,
                tenant.accountId || undefined,
              )
            }
          }
        }
      }
    })
  }

  async stat(path: string) {
    const parts = splitPath(path)
    if (parts.length === 0) {
      return {
        kind: 'root' as const,
        path: '/',
        collections: this.collectionsList().map((item) => this.publishCollection(item)),
      }
    }
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    const caps = collectionCaps(spec)
    if (parts.length === 1) {
      return { kind: 'collection' as const, path: spec.path, id: spec.id, label: spec.label ?? spec.id, view: spec.view ?? null, schema: this.schemaForCurrent(spec), caps }
    }
    if (parts.length === 2) {
      const record = await spec.get(parts[1]!)
      if (!record) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
      this.assertLiveRecord(spec, record.id, 'resource:read', record)
      return {
        kind: 'record' as const,
        path: `${spec.path}/${record.id}`,
        id: spec.id,
        label: spec.label ?? spec.id,
        schema: this.schemaForCurrent(spec),
        caps,
        value: withoutContent(spec, this.withBanner(spec, this.decorateRecord(spec, record))),
      }
    }
    throw new Error(`path too deep: ${normalizeCollectionPath(path)}`)
  }

  /** 当前账号能读到的记录，带上正文与创建人/编辑人/分享范围等元数据，给本机和集中部署对拷。 */
  async syncedRecords() {
    const out: Array<{ path: string; records: DbRecord[] }> = []
    for (const spec of this.collections.values()) {
      if (!spec.list || !spec.get || spec.path === '/views') continue
      try {
        const listed = await this.list(spec.path)
        if (listed.kind !== 'collection') continue
        const records: DbRecord[] = []
        for (const item of listed.items) {
          const full = await spec.get(String(item.id))
          records.push(full ? ({ ...item, ...(full as DbRecord) } as DbRecord) : item)
        }
        out.push({ path: spec.path, records })
      } catch {
        /* 这张表读不了就跳过，不挡住别的表 */
      }
    }
    return out
  }

  syncedViews(): Record<string, StoredView[]> {
    if (!this.savedViews) return {}
    return this.savedViews.exportAll(currentAccountId())
  }

  applySyncedViews(viewsByPath: Record<string, StoredView[]>): boolean {
    if (!this.savedViews || !viewsByPath || typeof viewsByPath !== 'object') return false
    const accountId = currentAccountId()
    let changed = false
    for (const [path, incoming] of Object.entries(viewsByPath)) {
      if (!Array.isArray(incoming)) continue
      const prev = this.savedViews.viewsFor(path, accountId)
      if (JSON.stringify(prev) === JSON.stringify(incoming)) continue
      this.savedViews.replace(path, incoming, accountId)
      changed = true
    }
    return changed
  }

  /** 按 id 写入。cache/云端权威拉取传 force=true，同步正文、创建人/编辑人/标签/分享范围。 */
  async applySynced(path: string, records: DbRecord[], options?: { force?: boolean }): Promise<boolean> {
    const spec = this.collection(path)
    if (!spec?.get || !spec.create || !spec.update) return false
    const force = options?.force === true
    let changed = false
    for (const record of records) {
      const id = String(record?.id ?? '')
      if (!id) continue
      try {
        const existing = (await spec.get(id)) as DbRecord | null
        const incomingAt = Number(record.updatedAt) || 0
        const existingAt = Number(existing?.updatedAt) || 0
        if (!force && existing && existingAt >= incomingAt) continue
        if (!existing) {
          await spec.create([{ ...record, id }])
          changed = true
        } else if (!force || JSON.stringify(existing) !== JSON.stringify({ ...existing, ...record })) {
          await spec.update(id, record)
          changed = true
        }
        // 同步创建人、编辑人、图标、标签等记录元数据
        const rec = record as Record<string, unknown>
        const metaPatch: {
          emoji?: string
          tags?: string[]
          createdBy?: PersonValue | null
          updatedBy?: PersonValue[] | PersonValue | null
        } = {}
        if (typeof rec.emoji === 'string') metaPatch.emoji = rec.emoji
        if (Array.isArray(rec.tag)) metaPatch.tags = rec.tag.map((item) => String(item).trim()).filter(Boolean)
        if (rec.createdBy && typeof rec.createdBy === 'object') metaPatch.createdBy = rec.createdBy as PersonValue
        if (Array.isArray(rec.updatedBy)) metaPatch.updatedBy = rec.updatedBy as PersonValue[]
        else if (rec.updatedBy && typeof rec.updatedBy === 'object') metaPatch.updatedBy = [rec.updatedBy as PersonValue]
        if (Object.keys(metaPatch).length) {
          const prevMeta = this.tags.recordMeta(spec.path, id)
          this.tags.writeRecordMeta(spec.path, id, metaPatch)
          const nextMeta = this.tags.recordMeta(spec.path, id)
          if (JSON.stringify(prevMeta) !== JSON.stringify(nextMeta)) changed = true
        }
        // 同步分享范围（personal / workspace / shared）
        const shareScope = String(rec.shareScope ?? '').trim()
        if (shareScope === 'shared') {
          this.markPublicView(spec.path, id)
        } else if (shareScope === 'workspace' || shareScope === 'personal') {
          this.rememberScope(spec.path, id, shareScope)
        }
      } catch (error) {
        console.warn('[replica] skip', path, id, error)
      }
    }
    return changed
  }

  private async listDataOverview(spec: CollectionSpec, filter?: Record<string, unknown>, page?: ListPage) {
    const schema = { ...schemaFor(spec), actions: this.overviewRowActions() }
    const { limit, offset } = clampPage(page?.limit, page?.offset)
    const q = page?.q ?? ''
    const sortField = page?.sortField?.trim() || 'title'
    const sortDir = page?.sortDir === 'desc' ? 'desc' : 'asc'
    const scopeFilter = filter?.$scope === 'workspace' || filter?.$scope === 'personal' || filter?.$scope === 'shared' ? filter.$scope : ''
    const columnKeys = listedColumnKeys(page?.columns, schema.labelField ?? 'title', schema)
    const liveFilter = filter ? { ...filter } : undefined
    if (liveFilter) {
      delete liveFilter.deleted
      delete liveFilter.trash
      delete liveFilter.$scope
    }
    const tableFilter = normalizeCollectionPath(String(liveFilter?.tablePath ?? ''))
    const tableNameFilter = String(liveFilter?.table ?? '').trim()
    if (liveFilter) {
      delete liveFilter.tablePath
      delete liveFilter.table
    }
    const overlay = listNeedsMatchOverlay(liveFilter, q, sortField, page?.sorts)
    const query: CollectionListQuery = { q: '', trash: false }
    const gathered: DbRecord[] = []
    for (const source of this.collectionsList()) {
      if (!isDataOverviewSource(source.path)) continue
      if (tableFilter && tableFilter !== '/' && source.path !== tableFilter) continue
      if (tableNameFilter) {
        const title = String(source.view?.title ?? source.label ?? source.id).trim() || source.path
        if (title !== tableNameFilter) continue
      }
      const pack = await this.visibleSortedCollectionRows(source, query, sortField, sortDir, page?.sorts, overlay)
      const visible = scopeFilter ? pack[scopeFilter] : pack.rows
      const decorated = this.decorateSlice(source, visible, null)
      for (const row of decorated) gathered.push(overviewRecord(source, row))
    }
    const packs = this.tags.list()
    const sorted = sortRecords(
      gathered.filter((row) => matchListFilter(row, liveFilter, schema, packs) && matchQuery(row, q, packs)),
      sortField,
      sortDir,
      page?.sorts,
    )
    const total = sorted.length
    const slice = sorted.slice(offset, offset + limit)
    return {
      kind: 'collection' as const,
      path: spec.path,
      id: spec.id,
      label: spec.label ?? spec.id,
      view: spec.view ?? null,
      schema: this.schemaForCurrent(spec, schema),
      total,
      offset,
      limit,
      items: slice.map((row): DbRecord & { path: string; kind: 'record' } => {
        const value = withoutContent(spec, row)
        const picked = columnKeys ? pickListedFields(value, columnKeys) : value
        return {
          ...picked,
          path: `${spec.path}/${row.id}`,
          kind: 'record',
        }
      }),
    }
  }

  async attributeGroups(path: string, field: string, filter?: Record<string, unknown>, q = '') {
    const parsed = parseTagFlatColumnKey(field)
    const spec = this.collection(normalizeCollectionPath(path))
    if (!spec || spec.path === DATA_COLLECTION_PATH || !parsed) return { groups: null }
    const liveFilter = { ...filter }
    const scope = liveFilter.$scope
    const ids = asIds(liveFilter.$ids)
    const trash = liveFilter.deleted === true || liveFilter.trash === true
    delete liveFilter.$scope
    delete liveFilter.$ids
    delete liveFilter.deleted
    delete liveFilter.trash
    const query: CollectionListQuery = { q, filter: liveFilter, trash }
    if (ids?.length) query.ids = ids
    const auth = this.authorization()
    const actor = auth?.currentActor()
    const tagId = typeof liveFilter.tag === 'string' && liveFilter.tag !== '' ? liveFilter.tag : undefined
    if (spec.groupPage && !scope && (!auth || !actor)) {
      const pushed = await spec.groupPage({
        field,
        ids: ids?.length ? ids : undefined,
        q,
        filter: liveFilter,
        trash,
        tagId,
      })
      if (pushed) {
        return {
          groups: pushed.map((item) => ({ key: item.key, count: item.count })),
        }
      }
    }
    if (auth && actor) auth.preloadCollection(actor.workspaceId, spec.path, actor.accountId)
    try {
      const pack = await this.visibleSortedCollectionRows(spec, query, 'id', 'asc', undefined, true)
      const visible = scope === 'personal' || scope === 'workspace' || scope === 'shared' ? pack[scope] : pack.rows
      const schema = schemaFor(spec)
      const packs = this.tags.list()
      const matching = visible.filter(row => matchListFilter(row, liveFilter, schema, packs) && matchQuery(row, q, packs))
      return { groups: this.tags.attributeGroups(spec.path, field, matching.map(row => row.id)) }
    } finally {
      if (auth && actor) auth.releaseCollection(actor.workspaceId, spec.path, actor.accountId)
    }
  }

  async list(path: string, filter?: Record<string, unknown>, page?: ListPage) {
    const parts = splitPath(path)
    if (parts.length === 0) {
      return {
        kind: 'root' as const,
        path: '/',
        items: this.collectionsList().map((item) => this.publishCollection(item)),
      }
    }
    if (parts.length !== 1) throw new Error(`cannot list: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    if (spec.path === DATA_COLLECTION_PATH) return this.listDataOverview(spec, filter, page)
    let schema = schemaFor(spec)
    const { limit, offset } = clampPage(page?.limit, page?.offset)
    const q = page?.q ?? ''
    const sortField = page?.sortField?.trim() || 'title'
    const sortDir = page?.sortDir === 'desc' ? 'desc' : 'asc'
    const schemaFilter = typeof filter?.tag === 'string' && filter.tag !== ''
      ? filter.tag
      : ''
    const scopeFilter = filter?.$scope === 'workspace' || filter?.$scope === 'personal' || filter?.$scope === 'shared' ? filter.$scope : ''
    const columnKeys = listedColumnKeys(page?.columns, schema.labelField ?? 'title', schema)
    const trash = filter?.deleted === true || filter?.trash === true
    const liveFilter = filter ? { ...filter } : undefined
    const idFilter = asIds(liveFilter?.$ids)
    if (liveFilter) {
      delete liveFilter.deleted
      delete liveFilter.trash
      delete liveFilter.$scope
      delete liveFilter.$ids
    }
    const query: CollectionListQuery = { q, filter: liveFilter, trash }
    if (idFilter?.length) query.ids = idFilter
    if (schemaFilter && schema.fields.tag && spec.path !== TAGS_COLLECTION_PATH) {
      const stamped = this.tags.stampedIds(spec.path, schemaFilter)
      if (!stamped.size) {
        return {
          kind: 'collection' as const,
          path: spec.path,
          id: spec.id,
          label: spec.label ?? spec.id,
          view: spec.view ?? null,
          schema: this.schemaForCurrent(spec, schema),
          total: 0,
          offset,
          limit,
          items: [],
        }
      }
      query.ids = [...stamped]
    }
    const auth = this.authorization()
    const actor = auth?.currentActor()
    if (spec.listPage && !scopeFilter && spec.path !== TAGS_COLLECTION_PATH) {
      let pushdownIds: string[] | undefined = idFilter?.length ? idFilter : undefined
      let canPushdown = !auth || !actor
      if (!canPushdown) {
        const rbacIds = this.access.resolvePushdownAllowedIds(spec.path)
        if (rbacIds !== null) {
          canPushdown = true
          if (pushdownIds) {
            const allowSet = new Set(rbacIds)
            pushdownIds = pushdownIds.filter((id) => allowSet.has(id))
          } else {
            pushdownIds = rbacIds
          }
          if (pushdownIds.length === 0) {
            return {
              kind: 'collection' as const,
              path: spec.path,
              id: spec.id,
              label: spec.label ?? spec.id,
              view: spec.view ?? null,
              schema: this.schemaForCurrent(spec, schema),
              total: 0,
              offset,
              limit,
              items: [],
            }
          }
        }
      }
      if (canPushdown) {
        const pushed = await spec.listPage({
          ids: pushdownIds,
          q,
          filter: liveFilter,
          trash,
          tagId: schemaFilter || undefined,
          sortField,
          sortDir,
          sorts: page?.sorts,
          limit,
          offset,
        })
        if (pushed) {
          const slice = this.decorateSlice(spec, pushed.rows, columnKeys)
          return {
            kind: 'collection' as const,
            path: spec.path,
            id: spec.id,
            label: spec.label ?? spec.id,
            view: spec.view ?? null,
            schema: this.schemaForCurrent(spec, schema),
            total: pushed.total,
            offset,
            limit,
            items: slice.map((row): DbRecord & { path: string; kind: 'record' } => {
              const value = withoutContent(spec, row)
              const picked = columnKeys ? pickListedFields(value, columnKeys) : value
              return {
                ...picked,
                path: `${spec.path}/${row.id}`,
                kind: 'record',
              }
            }),
          }
        }
      }
    }
    if (auth && actor) auth.preloadCollection(actor.workspaceId, spec.path, actor.accountId)
    try {
      const overlay = listNeedsMatchOverlay(liveFilter, q, sortField, page?.sorts)
      const pack = await this.visibleSortedCollectionRows(spec, query, sortField, sortDir, page?.sorts, overlay)
      const visible = scopeFilter ? pack[scopeFilter] : pack.rows
      const tagFilter = spec.path === TAGS_COLLECTION_PATH ? String(filter?.tagId ?? '').trim() : ''
      if (tagFilter) schema = schemaWithTagPack(schema, this.tags.get(tagFilter))
      const packs = this.tags.list()
      const needsColumnProjection = this.access.hasColumnRestrictions(spec.path)
      const policyCache = needsColumnProjection ? new Map<string, ReturnType<DatabaseAccessPolicy['columnPolicyFor']>>() : null
      const sorted = visible.filter((row) => {
        if (!needsColumnProjection) {
          return matchListFilter(row, liveFilter, schema, packs) && matchQuery(row, q, packs)
        }
        const policy = this.access.columnPolicyFor(spec.path, row)
        policyCache!.set(row.id, policy)
        const readable = this.access.projectRecordWithPolicy(row, policy)
        return matchListFilter(readable, liveFilter, schema, packs) && matchQuery(readable, q, packs)
      })
      const total = sorted.length
      const slice = this.decorateSlice(spec, sorted.slice(offset, offset + limit), columnKeys)
      return {
        kind: 'collection' as const,
        path: spec.path,
        id: spec.id,
        label: spec.label ?? spec.id,
        view: spec.view ?? null,
        schema: this.schemaForCurrent(spec, schema),
        total,
        offset,
        limit,
        items: slice.map((row): DbRecord & { path: string; kind: 'record' } => {
          const stripped = withoutContent(spec, row)
          const value = needsColumnProjection
            ? this.access.projectRecordWithPolicy(
                stripped,
                policyCache?.get(row.id) ?? this.access.columnPolicyFor(spec.path, stripped),
              )
            : stripped
          const picked = columnKeys ? pickListedFields(value, columnKeys) : value
          return {
            ...picked,
            path: `${spec.path}/${row.id}`,
            kind: 'record',
          }
        }),
      }
    } finally {
      if (auth && actor) {
        auth.releaseCollection(actor.workspaceId, spec.path, actor.accountId)
      }
    }
  }

  async collectTag(id: string) {
    const found = this.tags.collect(id)
    const labels = new Map(this.collectionsList().map((spec) => [spec.path, spec.label ?? spec.id]))
    return {
      tag: found.tag,
      items: found.items
        .filter((item) => !this.tags.isDeleted(item.collection, item.id))
        .filter((item) => this.visibleRecords(item.collection, [{ id: item.id }]).length > 0)
        .map((item) => ({
        ...item,
        collectionLabel: labels.get(item.collection) ?? item.collection,
      })),
    }
  }

  private decorateRecord(spec: CollectionSpec, row: DbRecord, need: ListDecorateNeed | null = null): DbRecord {
    const withTag = !need || need.tag || need.shareScope ? this.applyTagOverlay(spec, row) : row
    const withPeople = !need || need.people ? this.applyPersonOverlay(spec, withTag) : withTag
    const withMeta = !need || need.meta ? this.applyMetaOverlay(spec, withPeople) : withPeople
    if (isSystemCollection(spec.path) || isIndexCollection(spec.path)) return withMeta
    if (isBuiltinPluginRow(spec.path, row)) {
      return {
        ...withMeta,
        ...(!need || need.shareScope ? { shareScope: '共享' } : {}),
        ...(!need || need.shareRole ? { shareRole: '查看' } : {}),
      }
    }
    const wantScope = !need || need.shareScope
    const wantRole = !need || need.shareRole
    const stored = wantScope ? this.access.ownershipOf(spec.path, String(row.id ?? '')) : 'personal'
    return {
      ...withMeta,
      ...(wantScope ? { shareScope: this.access.shareScopeLabel(spec.path, String(row.id ?? ''), withMeta, stored) } : {}),
      ...(wantRole ? { shareRole: this.access.shareRoleLabel(spec, withMeta) } : {}),
    }
  }

  private withBanner(spec: CollectionSpec, row: DbRecord): DbRecord {
    const banner = this.tags.recordBanner(spec.path, row.id)
    const next = { ...row }
    delete next.banner
    if (banner) next.banner = banner
    return next
  }

  private refreshContentRefs(spec: CollectionSpec, record: DbRecord, refreshBody = true) {
    const banner = this.tags.recordBanner(spec.path, record.id)
    const properties = this.decorateRecord(spec, record)
    const tag = this.tags.recordTag(spec.path, record.id) ?? properties.tag
    if (refreshBody) {
      const body = readEditorContent(this.tags.ensure(), spec.path, record.id)
      this.tags.replaceContentRefs(
        spec.path,
        record.id,
        assetNamesFromMarkdown(body),
        assetNamesFromHtml(String(banner?.html ?? '')),
      )
    }
    this.tags.replaceAssetRefs(spec.path, record.id, collectAssetNames(properties, tag))
  }

  private actorHost(): ActorOverlayHost {
    return {
      tags: this.tags,
      collection: (pathOrId) => this.collection(pathOrId),
      workspacePerson: (accountId) => this.collabStore()?.workspacePerson?.(accountId),
      sessionsService: () => {
        try {
          return this.ctx.get('sessions') as { peek?: (id: string) => unknown; get?: (id: string) => Promise<unknown> }
        } catch {
          return undefined
        }
      },
      accountService: () => {
        try {
          return this.ctx.get('account') as {
            markLocal?: (collection: string, id: string) => void
            workspaceLocation?: (workspaceId: string) => 'device' | 'cloud'
            store?: { activeWorkspaceId?: () => string | null }
          }
        } catch {
          return undefined
        }
      },
    }
  }

  private applyPersonOverlay(spec: CollectionSpec, row: DbRecord): DbRecord {
    return applyRecordPersonOverlay(this.actorHost(), spec, row)
  }

  /** 本机空间：私人与共享都留在这台设备。 */
  private deviceWorkspace() {
    if (getRuntimePolicy().hostMode === 'cloud') return false
    try {
      const account = this.ctx.get('account') as {
        workspaceLocation?: (workspaceId: string) => 'device' | 'cloud'
        store?: { activeWorkspaceId?: () => string | null }
      } | undefined
      const workspaceId = account?.store?.activeWorkspaceId?.() ?? ''
      if (workspaceId && account?.workspaceLocation) return account.workspaceLocation(workspaceId) === 'device'
    } catch {
      /* 没有账号服务时按桌面运行时处理 */
    }
    return true
  }

  private markDeviceRecord(collection: string, id: string) {
    try {
      const account = this.ctx.get('account') as { markLocal?: (collection: string, id: string) => void } | undefined
      account?.markLocal?.(collection, id)
    } catch {
      /* 没有账号库时仍按当前归属挂到空间 */
    }
  }

  /** 侧栏「添加聊天」走 sessions.create，不经过表格的 create，这里补创建人和本地归属。 */
  async touchActor(collection: string, recordId: string) {
    await touchRecordActor(this.actorHost(), collection, recordId)
  }

  private async stampActor(collection: string, recordId: string) {
    await stampRecordActor(this.actorHost(), collection, recordId)
  }

  private namedPerson(person: PersonValue): PersonValue {
    return resolveNamedPerson(this.actorHost(), person)
  }

  private applyTagOverlay(spec: CollectionSpec, row: DbRecord): DbRecord {
    if (!schemaFor(spec).fields.tag) return row
    // Collected rows are projections, not records owned by /tags. Never write
    // them back to /tags: that would collect the projection again on each read.
    const stamp = spec.path === TAGS_COLLECTION_PATH ? parseStampRecordId(row.id) : null
    let overlay = this.tags.recordTag(stamp?.collection ?? spec.path, stamp?.recordId ?? row.id)
    if (!overlay && row.tag != null) {
      const value = normalizeSchemaValue(row.tag)
      if (!isEmptySchemaValue(value)) overlay = stamp ? value : this.persistRecordTag(spec, row.id, value, row)
    }
    if (!overlay) return row
    return { ...row, tag: pruneSchemaValue(overlay, this.tags.list()) }
  }

  private applyMetaOverlay(spec: CollectionSpec, row: DbRecord): DbRecord {
    const stamp = spec.path === TAGS_COLLECTION_PATH ? parseStampRecordId(row.id) : null
    const meta = this.tags.recordMeta(stamp?.collection ?? spec.path, stamp?.recordId ?? row.id)
    if (!meta) return row
    return {
      ...row,
      ...(meta.emoji !== null ? { emoji: meta.emoji } : {}),
    }
  }

  private collectionCanUpdate(spec: CollectionSpec) {
    return Boolean(spec.records?.update && spec.update)
  }

  private persistRecordTag(spec: CollectionSpec, recordId: string, tag: unknown, record: DbRecord) {
    const next = normalizeSchemaValue(tag)
    const labelKey = schemaFor(spec).labelField ?? 'title'
    this.tags.writeRecordTag(spec.path, recordId, next, String(record[labelKey] ?? record.id))
    return next
  }

  private indexTagRecord(spec: CollectionSpec, record: DbRecord) {
    if (!schemaFor(spec).fields.tag) return
    const labelKey = schemaFor(spec).labelField ?? 'title'
    this.tags.indexRecord(
      spec.path,
      record.id,
      String(record[labelKey] ?? record.id),
      normalizeSchemaValue(record.tag).tags,
    )
  }

  async read(path: string) {
    const parts = splitPath(path)
    if (parts.length === 0) return this.stat('/')
    if (parts.length === 1) return this.list(`/${parts[0]}`)
    if (parts.length !== 2) throw new Error(`cannot read: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    const record = await spec.get(parts[1]!)
    if (!record) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
    this.assertLiveRecord(spec, record.id, 'resource:read', record)
    const decorated = withoutContent(spec, this.withBanner(spec, this.decorateRecord(spec, record)))
    return {
      kind: 'record' as const,
      path: `${spec.path}/${record.id}`,
      schema: this.schemaForCurrent(spec),
      value: this.access.projectRecord(spec.path, decorated),
    }
  }

  resolveViewFilter(collectionPath: string, viewId: string): {
    viewId: string
    viewName: string
    filter: Record<string, unknown>
    q?: string
    sortField?: string
    sortDir?: 'asc' | 'desc'
  } {
    const colPath = normalizeCollectionPath(collectionPath)
    const rawId = viewId.trim()
    if (!rawId) throw new Error('view_id must be a non-empty string')
    const saved = [
      builtinAllView({ path: colPath }),
      ...(this.viewCatalog?.viewsFor(colPath) ?? []),
    ] as Array<SharedViewDef & { query?: string; sortField?: string; sortDir?: 'asc' | 'desc' }>
    const hit = saved.find((item) => item.id === rawId || (item.name && item.name === rawId))
    if (!hit) {
      const choices = saved.map((item) => `${item.id}${item.name ? `(${item.name})` : ''}`).join(', ')
      throw new Error(`unknown view: ${rawId} in ${colPath}${choices ? ` (available: ${choices})` : ''}`)
    }
    const filter: Record<string, unknown> = {
      ...(hit.filters && typeof hit.filters === 'object' ? hit.filters : {}),
      ...(hit.filterTree ? { $tree: hit.filterTree } : {}),
    }
    return {
      viewId: hit.id,
      viewName: hit.name ?? hit.id,
      filter,
      ...(typeof hit.query === 'string' && hit.query ? { q: hit.query } : {}),
      ...(typeof hit.sortField === 'string' && hit.sortField ? { sortField: hit.sortField } : {}),
      ...(hit.sortDir === 'desc' || hit.sortDir === 'asc' ? { sortDir: hit.sortDir } : {}),
    }
  }

  async batchUpdate(
    collectionPath: string,
    options: {
      ids?: string[]
      viewId?: string
      filter?: Record<string, unknown>
      q?: string
      fields?: Record<string, unknown>
      updates?: Array<{ id: string; fields: Record<string, unknown> }>
      dryRun?: boolean
      maxRecords?: number
    },
  ) {
    const parts = splitPath(collectionPath)
    if (parts.length !== 1) throw new Error(`batchUpdate requires a collection path like /pages, got: ${collectionPath}`)
    const colPath = `/${parts[0]}`
    const spec = this.collection(colPath)
    if (!spec) throw new Error(`unknown collection: ${colPath}`)

    const maxRecords = Math.max(1, Math.min(500, Math.floor(Number(options.maxRecords) || 200)))
    const dryRun = options.dryRun === true

    const hasUpdates = Array.isArray(options.updates) && options.updates.length > 0
    const hasFields = Boolean(options.fields && typeof options.fields === 'object' && !Array.isArray(options.fields) && Object.keys(options.fields).length > 0)
    if (!hasUpdates && !hasFields) {
      throw new Error('batchUpdate requires non-empty fields or updates')
    }

    let targets: Array<{ id: string; fields: Record<string, unknown> }> = []
    let matched = 0

    if (hasUpdates) {
      const list = options.updates!.slice(0, maxRecords)
      matched = options.updates!.length
      for (const item of list) {
        const id = String(item?.id ?? '').trim()
        if (!id) throw new Error('each item in updates must include a non-empty id')
        if (!item.fields || typeof item.fields !== 'object' || Array.isArray(item.fields) || !Object.keys(item.fields).length) {
          throw new Error(`updates item ${id} must include non-empty fields`)
        }
        targets.push({ id, fields: item.fields })
      }
    } else {
      const explicitIds = Array.isArray(options.ids)
        ? [...new Set(options.ids.map((item) => String(item ?? '').trim()).filter(Boolean))]
        : []
      const hasView = typeof options.viewId === 'string' && options.viewId.trim().length > 0
      const hasFilter = Boolean(options.filter && Object.keys(options.filter).length > 0)
      const hasQ = typeof options.q === 'string' && options.q.trim().length > 0

      if (!explicitIds.length && !hasView && !hasFilter && !hasQ) {
        throw new Error('batchUpdate requires at least one selector: view_id, ids, filter, or q')
      }

      if (explicitIds.length) {
        matched = explicitIds.length
        targets = explicitIds.slice(0, maxRecords).map((id) => ({ id, fields: options.fields! }))
      } else {
        const viewResolved = hasView ? this.resolveViewFilter(colPath, options.viewId!) : null
        const mergedFilter: Record<string, unknown> = {
          ...(viewResolved?.filter ?? {}),
          ...(options.filter ?? {}),
        }
        const q = hasQ ? options.q!.trim() : (viewResolved?.q ?? '')
        const listed = (await this.list(
          colPath,
          Object.keys(mergedFilter).length ? mergedFilter : undefined,
          { q, limit: maxRecords, offset: 0, columns: ['id'] },
        )) as { total?: number; items?: Array<{ id?: unknown }> }
        const foundIds = (listed.items ?? []).map((item) => String(item?.id ?? '').trim()).filter(Boolean)
        matched = typeof listed.total === 'number' ? listed.total : foundIds.length
        targets = foundIds.map((id) => ({ id, fields: options.fields! }))
      }
    }

    if (dryRun) {
      return {
        ok: true,
        kind: 'batch_updated' as const,
        path: colPath,
        dryRun: true,
        matched,
        targetCount: targets.length,
        truncated: matched > targets.length,
        sampleIds: targets.slice(0, 10).map((item) => item.id),
      }
    }

    const updatedIds: string[] = []
    const failed: Array<{ id: string; error: string }> = []
    for (const target of targets) {
      try {
        await this.update(`${colPath}/${target.id}`, structuredClone(target.fields))
        updatedIds.push(target.id)
      } catch (error) {
        failed.push({ id: target.id, error: error instanceof Error ? error.message : String(error) })
      }
    }

    return {
      ok: failed.length === 0,
      kind: 'batch_updated' as const,
      path: colPath,
      matched,
      updated: updatedIds.length,
      truncated: matched > targets.length,
      ids: updatedIds,
      ...(failed.length ? { failed } : {}),
    }
  }

  async update(path: string, content: unknown): Promise<{ kind: 'record'; path: string; value: DbRecord }> {
    const parts = splitPath(path)
    if (parts.length === 2 && parts[0] === 'data') {
      const stamp = parseStampRecordId(parts[1]!)
      if (stamp && stamp.collection !== DATA_COLLECTION_PATH) {
        const written = await this.update(`${stamp.collection}/${stamp.recordId}`, content)
        if (written.kind !== 'record') return written
        const source = this.collection(stamp.collection)
        return {
          ...written,
          path: `${DATA_COLLECTION_PATH}/${parts[1]}`,
          value: source
            ? overviewRecord(source, written.value as DbRecord)
            : { ...(written.value as DbRecord), id: parts[1]! },
        }
      }
    }
    if (parts.length !== 2) throw new Error(`cannot update: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    const schema = schemaFor(spec)
    const raw = parseContent(content)
    const current = await spec.get(parts[1]!)
    if (!current) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
    this.assertLiveRecord(spec, current.id, 'resource:update', current)
    this.access.assertWritablePatch(spec.path, current, raw)
    this.access.assertAnchorFieldSafe(spec.path, current, { ...current, ...raw } as DbRecord)
    const bannerPatch = takeBannerPatch(raw)
    if ('tag' in raw && schema.fields.tag) {
      if (!schema.fields.tag.writable || schema.fields.tag.computed) throw new Error(`field not writable: tag`)
      raw.tag = coerceTagPatch(raw.tag, normalizeSchemaValue(this.decorateRecord(spec, current).tag), (id) =>
        this.tags.get(id),
      )
    }
    if (!this.collectionCanUpdate(spec)) {
      const keys = Object.keys(raw)
      const overlayKeys = new Set(['tag', 'emoji'])
      if ((keys.length && keys.some((key) => !overlayKeys.has(key))) || (!keys.length && !bannerPatch.present)) {
        throw new Error(`collection cannot update: ${spec.path}`)
      }
      let next: DbRecord = { ...this.decorateRecord(spec, current) }
      if ('tag' in raw) {
        const nextSchema = coerce(schema.fields.tag, raw.tag)
        next = { ...next, tag: this.persistRecordTag(spec, current.id, nextSchema, next) }
      }
      if ('emoji' in raw) {
        if (!schema.fields.emoji?.writable || schema.fields.emoji.computed) {
          throw new Error(`field not writable: emoji`)
        }
        const meta = this.tags.writeRecordMeta(spec.path, current.id, {
          emoji: String(coerce(schema.fields.emoji!, raw.emoji) ?? ''),
        })
        next = {
          ...next,
          ...(meta.emoji !== null ? { emoji: meta.emoji } : {}),
        }
      }
      if (bannerPatch.present) {
        this.tags.writeRecordBanner(spec.path, current.id, bannerPatch.value)
        next = this.withBanner(spec, next)
        this.notifyContent(`${spec.path}/${current.id}`)
      }
      this.refreshContentRefs(spec, next)
      await this.stampActor(spec.path, current.id)
      this.bump(spec.path)
      const beforeRow = this.decorateRecord(spec, current)
      const beforeSnap: Record<string, unknown> = {}
      const afterSnap: Record<string, unknown> = {}
      for (const key of Object.keys(raw)) {
        beforeSnap[key] = beforeRow[key] ?? null
        afterSnap[key] = next[key] ?? null
      }
      const title = String(next.title ?? next.name ?? current.id).trim() || current.id
      if (Object.keys(beforeSnap).length) {
        await this.ctx.get('contentTurns')?.recordUpdate(`${spec.path}/${current.id}`, title, beforeSnap, afterSnap)
      }
      return {
        kind: 'record' as const,
        path: `${spec.path}/${current.id}`,
        value: withoutContent(spec, this.withBanner(spec, next)),
      }
    }
    const patch = pickWritablePatch(schema, raw)
    await assertSameTableLinks(spec, patch, parts[1])
    const authorization = this.authorization()
    const actor = authorization?.currentActor()
    const parentField = spec.schema.parentField
    const moving = Boolean(parentField && parentField in patch && authorization && actor)
    const parentRecordId = moving ? String(patch[parentField!] ?? '').trim() : ''
    const resource = actor
      ? { type: 'record' as const, workspaceId: actor.workspaceId, collection: spec.path, recordId: current.id }
      : null
    const parent = actor && parentRecordId
      ? { type: 'record' as const, workspaceId: actor.workspaceId, collection: spec.path, recordId: parentRecordId }
      : null
    if (moving && resource) authorization!.validateMove(actor!, resource, parent)
    let record = Object.keys(patch).length && spec.update ? await spec.update(parts[1]!, patch) : current
    if (moving && resource) authorization!.move(actor!, resource, parent)
    const viewOnly = !bannerPatch.present && Object.keys(patch).length > 0 &&
      Object.keys(patch).every((key) => ['views', 'propViews', 'layouts'].includes(key))
    if (!viewOnly) await this.stampActor(spec.path, record.id)
    if ('emoji' in patch) {
      const meta = this.tags.writeRecordMeta(spec.path, record.id, {
        emoji: String(patch.emoji ?? ''),
      })
      record = {
        ...record,
        ...(meta.emoji !== null ? { emoji: meta.emoji } : {}),
      }
    }
    if (schema.fields.tag && 'tag' in patch) {
      record = { ...record, tag: this.persistRecordTag(spec, record.id, patch.tag, record) }
    }
    if (bannerPatch.present) {
      this.tags.writeRecordBanner(spec.path, record.id, bannerPatch.value)
      this.notifyContent(`${spec.path}/${record.id}`)
    }
    if (!viewOnly) this.indexTagRecord(spec, this.decorateRecord(spec, record))
    this.refreshContentRefs(spec, this.withBanner(spec, record), !viewOnly)
    if (viewOnly) this.notifyViewCatalog(`${spec.path}/${record.id}`)
    else this.bump(spec.path)
    const beforeSnap: Record<string, unknown> = {}
    const afterSnap: Record<string, unknown> = {}
    for (const key of Object.keys(patch)) {
      beforeSnap[key] = current[key] ?? null
      afterSnap[key] = record[key] ?? null
    }
    const title = String(record.title ?? record.name ?? record.id).trim() || record.id
    if (!viewOnly && Object.keys(patch).length) {
      await this.ctx.get('contentTurns')?.recordUpdate(`${spec.path}/${record.id}`, title, beforeSnap, afterSnap)
      this.logMemberActivity({
        action: 'record.update',
        collection: spec.path,
        recordId: record.id,
        recordTitle: title,
      })
    }
    return { kind: 'record' as const, path: `${spec.path}/${record.id}`, value: withoutContent(spec, this.withBanner(spec, this.decorateRecord(spec, record))) }
  }

  /** Sandbox may write only this record's values for one tag, through the normal update channel. */
  async patchTagSandbox(path: string, tagId: string, values: unknown) {
    if (!isPlainObject(values)) throw new Error('patch values must be an object')
    const parts = splitPath(path)
    if (parts.length !== 2) throw new Error('sandbox can only patch the current record')
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    await this.requirePath(`${spec.path}/${parts[1]}`, 'resource:update')
    if (spec.path === TAGS_COLLECTION_PATH) throw new Error('tag catalog has no instance property values')
    const schema = schemaFor(spec)
    if (!schema.fields.tag) throw new Error('record has no tag field')
    const current = await spec.get(parts[1]!)
    if (!current) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
    this.assertLiveRecord(spec, current.id, 'resource:update', current)
    const overlay = normalizeSchemaValue(this.decorateRecord(spec, current).tag)
    let id = String(tagId ?? '').trim()
    if (!id) {
      if (overlay.tags.length !== 1) throw new Error('sandbox patch needs a tag id')
      id = overlay.tags[0]!
    }
    const pack = this.tags.get(id)
    if (!pack) throw new Error(`unknown tag: ${id}`)
    const nextValues = sanitizeTagValuesPatch(pack, values)
    const tags = overlay.tags.includes(id) ? overlay.tags : [...overlay.tags, id]
    return this.update(`${spec.path}/${current.id}`, {
      tag: { tags, values: { [id]: nextValues } },
    })
  }

  private async withCreateRecordId(spec: CollectionSpec, patch: Record<string, unknown>, requested: string) {
    if (spec.records?.allocateId === false) {
      return isAssignableRecordId(requested) ? { ...patch, id: requested } : patch
    }
    return { ...patch, id: await unusedRecordId(spec, requested) }
  }

  async create(path: string, content?: unknown, options: { scope?: 'personal' | 'workspace' | 'shared' | 'local' } = {}) {
    const parts = splitPath(path)
    if (parts.length !== 1) throw new Error(`cannot create: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    if (!spec.records?.create || !spec.create) throw new Error(`collection cannot create: ${spec.path}`)
    const authorization = this.authorization()
    const actor = authorization?.currentActor()
    if (authorization && actor) {
      authorization.requireCurrent('resource:create', {
        type: 'collection',
        workspaceId: actor.workspaceId,
        collection: spec.path,
      })
    }
    const schema = schemaFor(spec)
    const bodyKey = spec.schema.contentField
    const rows = parseRecords(content)
    const records: Record<string, unknown>[] = []
    const banners: Array<PageBanner | null | undefined> = []
    const requestedIds: string[] = []
    const initialBodies: Array<string | undefined> = []
    for (const row of rows) {
      const bannerPatch = takeBannerPatch(row)
      banners.push(bannerPatch.present ? bannerPatch.value : undefined)
      requestedIds.push(takeRequestedRecordId(row))
      const rawBody =
        bodyKey && spec.path !== TAGS_COLLECTION_PATH
          ? typeof row[bodyKey] === 'string'
            ? (row[bodyKey] as string)
            : bodyKey !== 'content' && typeof row.content === 'string'
              ? (row.content as string)
              : undefined
          : undefined
      initialBodies.push(rawBody)
      if (rawBody !== undefined) {
        if (bodyKey && bodyKey in row && schema.fields[bodyKey]?.type === 'file') delete row[bodyKey]
        if (bodyKey !== 'content' && 'content' in row && !schema.fields.content) delete row.content
      }
      if ('tag' in row && schema.fields.tag) {
        row.tag = coerceTagPatch(row.tag, emptySchemaValue(), (id) => this.tags.get(id))
      }
      const patch = pickWritablePatch(schema, row)
      await assertSameTableLinks(spec, patch)
      records.push(patch)
    }
    const meaningful = records
      .map((record, index) => ({ record, index }))
      .filter((item) => Object.keys(item.record).length > 0 || initialBodies[item.index] !== undefined)
    const selected = meaningful.length ? meaningful : records.slice(0, 1).map((record, index) => ({ record, index }))
    const payloads: Record<string, unknown>[] = []
    for (const item of selected) {
      const requested = requestedIds[item.index] ?? ''
      payloads.push(await this.withCreateRecordId(spec, item.record, requested))
    }
    const created = await spec.create(payloads)
    for (const [index, record] of created.entries()) {
      await this.stampActor(spec.path, record.id)
      const sourceIndex = selected[index]?.index ?? index
      const banner = banners[sourceIndex]
      if (banner !== undefined) this.tags.writeRecordBanner(spec.path, record.id, banner)
      const input = payloads[index] ?? records[sourceIndex] ?? record
      if ('emoji' in input) {
        this.tags.writeRecordMeta(spec.path, record.id, {
          emoji: String(input.emoji ?? ''),
        })
      }
      if (schema.fields.tag) {
        this.persistRecordTag(spec, record.id, input.tag ?? record.tag, record)
      }
      const parentField = spec.schema.parentField
      const parentRecordId = parentField ? String(record[parentField] ?? '').trim() : ''
      if (spec.path !== WORKSPACE_MEMBERS_COLLECTION_PATH) {
        const device = this.deviceWorkspace()
        const workspaceOwned = options.scope === 'workspace' && !device
        const shared = options.scope === 'shared' && !parentRecordId
        const local = options.scope === 'local' && !parentRecordId
        this.attachWorkspaceRecord(spec.path, record.id, {
          accessMode: parentRecordId ? 'inherit' : workspaceOwned ? 'members' : 'private',
          ...(workspaceOwned ? { memberDefaultRole: 'editor' as const } : {}),
          ...(parentRecordId ? { parentCollection: spec.path, parentRecordId } : {}),
        })
        if (shared) this.markPublicView(spec.path, record.id)
        if (workspaceOwned && !parentRecordId) this.grantAllMembersEditable(spec.path, record.id)
        if (local || device) this.markDeviceRecord(spec.path, record.id)
      }
      const initialBody = initialBodies[sourceIndex]
      if (initialBody !== undefined && bodyKey) {
        await this.writeContent(`${spec.path}/${record.id}`, initialBody)
      }
      this.indexTagRecord(spec, this.decorateRecord(spec, record))
      this.refreshContentRefs(spec, this.withBanner(spec, record))
    }
    this.bump(spec.path)
    const items = created.map((record) => ({
      kind: 'record' as const,
      path: `${spec.path}/${record.id}`,
      value: withoutContent(spec, this.withBanner(spec, this.decorateRecord(spec, record))),
    }))
    for (const item of items) {
      const title = String(item.value.title ?? item.value.name ?? '').trim() || item.path
      await this.ctx.get('contentTurns')?.recordCreate(item.path, title, item.value)
      this.logMemberActivity({
        action: 'record.create',
        collection: spec.path,
        recordId: String(item.value.id ?? ''),
        recordTitle: title,
      })
    }
    return {
      kind: 'created' as const,
      path: spec.path,
      items,
    }
  }

  async remove(path: string, query: CollectionListQuery = {}) {
    const parts = splitPath(path)
    if (parts.length !== 1) throw new Error(`cannot delete: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    if (spec.path === DATA_COLLECTION_PATH) {
      const ids = (query.ids ?? []).map(String).filter(Boolean)
      const deleted: string[] = []
      for (const id of ids) {
        const stamp = parseStampRecordId(id)
        if (!stamp || stamp.collection === DATA_COLLECTION_PATH) continue
        await this.remove(stamp.collection, { ids: [stamp.recordId], purge: query.purge })
        deleted.push(id)
      }
      return { kind: 'deleted' as const, path: spec.path, ids: deleted }
    }
    if (!spec.records?.delete || !spec.remove) throw new Error(`collection cannot delete: ${spec.path}`)
    if (!hasCollectionDeleteQuery(query)) throw new Error('delete requires ids, q, or filter')
    const schema = schemaFor(spec)
    const q = query.q ?? ''
    const filter = query.filter
    const listQuery: CollectionListQuery = { q, filter, ids: query.ids }
    const schemaFilter = typeof filter?.tag === 'string' && filter.tag !== ''
      ? filter.tag
      : ''
    if (schemaFilter && schema.fields.tag && spec.path !== TAGS_COLLECTION_PATH) {
      const stamped = this.tags.stampedIds(spec.path, schemaFilter)
      if (!stamped.size) return { kind: 'deleted' as const, path: spec.path, ids: [] as string[] }
      listQuery.ids = query.ids?.length ? query.ids.filter((id) => stamped.has(id)) : [...stamped]
    }
    const matchedTrash = await this.matchCollectionRows(spec, { ...listQuery, trash: true }, filter, q)
    const matchedLive = await this.matchCollectionRows(spec, { ...listQuery, trash: false }, filter, q)
    const matched = this.visibleRecords(
      spec.path,
      query.purge ? (matchedTrash.length ? matchedTrash : matchedLive) : matchedLive,
      'resource:delete',
    )
    const ids = [...new Set(matched.map((row) => row.id))]
    if (!ids.length) return { kind: 'deleted' as const, path: spec.path, ids }
    const hard = Boolean(query.purge) || HARD_DELETE_PATHS.has(spec.path)
    if (spec.path === AGENTS_COLLECTION_PATH) this.disposeSessionAgents(ids)
    for (const row of matched) {
      const rec = withoutContent(spec, this.withBanner(spec, this.decorateRecord(spec, row)))
      const title = String(rec.title ?? rec.name ?? row.id).trim() || row.id
      await this.ctx.get('contentTurns')?.recordDelete(`${spec.path}/${row.id}`, title, rec)
    }
    if (!hard) {
      const at = Date.now()
      for (const id of ids) {
        this.tags.markDeleted(spec.path, id, at)
        this.shares.revokeRecord(spec.path, id)
      }
      if (spec.path === VIEWS_COLLECTION_PATH) {
        for (const row of matched) {
          const collection = normalizeCollectionPath(String(row.tablePath ?? ''))
          const viewId = String(row.viewId ?? '').trim()
          if (collection && collection !== '/' && viewId) this.shares.revokeView(collection, viewId)
        }
      }
      this.bump(spec.path)
      for (const row of matched) {
        const title = String(row.title ?? row.name ?? row.id ?? '').trim()
        this.logMemberActivity({
          action: 'record.delete',
          collection: spec.path,
          recordId: String(row.id ?? ''),
          recordTitle: title,
          detail: '移入回收站',
        })
      }
      return { kind: 'deleted' as const, path: spec.path, ids, trash: true }
    }
    await spec.remove({ ids })
    // 视图是硬删除：/views 只是 savedViews 现生成的一层行，删行必须连视图本体一起删，
    // 否则下一次列表/侧边栏拉取会把它原样吐回来（表现为「删掉的视图自己弹出来」）。
    if (spec.path === VIEWS_COLLECTION_PATH) {
      for (const key of viewRowKeys(matched)) {
        try {
          this.viewCatalog?.remove?.(rowIdOfView(key.collection, key.viewId), currentAccountId())
        } catch {
          /* 视图本体已不在（前端删视图时先走 /api/db/saved-views 整份覆盖） */
        }
      }
    }
    for (const id of ids) {
      this.tags.removeRecord(spec.path, id)
      this.shares.revokeRecord(spec.path, id)
    }
    if (spec.path === VIEWS_COLLECTION_PATH) {
      for (const key of viewRowKeys(matched)) {
        this.shares.revokeView(key.collection, key.viewId)
      }
    }
    this.bump(spec.path)
    this.recycleAssets?.()
    return { kind: 'deleted' as const, path: spec.path, ids }
  }

  async restore(path: string, query: CollectionListQuery = {}) {
    const parts = splitPath(path)
    if (parts.length !== 1) throw new Error(`cannot restore: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    if (!hasCollectionDeleteQuery(query)) throw new Error('restore requires ids, q, or filter')
    const matched = this.visibleRecords(
      spec.path,
      await this.matchCollectionRows(
        spec,
        { q: query.q ?? '', filter: query.filter, ids: query.ids, trash: true },
        query.filter,
        query.q ?? '',
      ),
      'resource:restore',
    )
    const ids = [...new Set(matched.map((row) => row.id))]
    for (const id of ids) this.tags.restoreDeleted(spec.path, id)
    this.bump(spec.path)
    return { kind: 'restored' as const, path: spec.path, ids }
  }

  async listTrash() {
    const items = []
    for (const row of this.tags.listDeleted()) {
      const spec = this.collection(row.collection)
      if (!spec) continue
      const record = await spec.get(row.record_id)
      if (!record) continue
      if (isBuiltinPluginRow(row.collection, record as { builtin?: unknown })) continue
      const authorization = this.authorization()
      const actor = authorization?.currentActor()
      if (authorization && actor) {
        const pluginTrash = row.collection === PLUGINS_COLLECTION_PATH
          && Boolean(this.collabStore()?.isMember?.(actor.accountId, actor.workspaceId))
        if (!pluginTrash && !authorization.authorize(actor, 'resource:read', {
          type: 'record',
          workspaceId: actor.workspaceId,
          collection: row.collection,
          recordId: row.record_id,
        }).allowed) continue
      } else {
        const membership = this.access.workspaceMembership()
        if (membership && !isRecordInWorkspace(membership, row.collection, row.record_id)) continue
      }
      const decorated = this.decorateRecord(spec, record)
      const title = String(decorated.title ?? decorated.name ?? record.id).trim() || record.id
      items.push({
        id: record.id,
        path: `${spec.path}/${record.id}`,
        collection: spec.path,
        collectionLabel: spec.label ?? spec.id,
        title,
        deletedAt: row.deleted_at,
      })
    }
    return { kind: 'trash' as const, items }
  }

  async action(
    path: string,
    actionId: string,
    args?: Record<string, unknown>,
  ): Promise<
    | { kind: 'record'; path: string; value: DbRecord; result?: unknown }
    | { kind: 'deleted'; path: string; ids: string[]; trash?: boolean }
  > {
    const rewritten = this.rewriteOverviewRecordPath(path)
    if (rewritten) return this.action(rewritten, actionId, args)
    const parts = splitPath(path)
    if (parts.length !== 2) throw new Error(`cannot action: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    const action = spec.actions?.find((item) => item.id === actionId)
    if (!action) throw new Error(`unknown action: ${actionId}`)
    const loaded = await spec.get(parts[1]!)
    const record = loaded ?? (action.allowMissing ? { id: parts[1]! } : null)
    if (!record) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
    const personalLoad = spec.path === PLUGINS_COLLECTION_PATH && (actionId === 'start' || actionId === 'stop')
    const pluginAuthor = spec.path === PLUGINS_COLLECTION_PATH && (actionId === 'sandbox' || actionId === 'pack')
    const builtinPlugin = this.builtinPlugin(spec, parts[1]!, record)
    if (pluginAuthor) {
      await this.requirePath(spec.path, 'resource:read')
      if (loaded && !builtinPlugin) {
        const owner = this.access.recordOwner(spec.path, record.id)
        if (!owner) this.stampPluginCreateScope(record.id, args)
        else this.assertLiveRecord(spec, record.id, 'resource:read', record)
      }
    } else if (!personalLoad && (loaded || !action.allowMissing)) {
      this.assertLiveRecord(spec, record.id, (action.requiredAction ?? 'resource:update') as PermissionAction, record)
    } else {
      await this.requirePath(spec.path, (action.requiredAction ?? 'resource:update') as PermissionAction)
    }
    if (!matchActionWhen(record, action.when)) throw new Error(`action not available: ${actionId}`)
    if ((actionId === 'delete' || actionId === 'trash') && spec.path !== TRASH_COLLECTION_PATH) {
      return this.remove(spec.path, { ids: [parts[1]!] })
    }
    if (!action.run) throw new Error(`action has no handler: ${actionId}`)
    const result = await action.run(parts[1]!, record, args)
    if (spec.path === PLUGINS_COLLECTION_PATH && actionId === 'sandbox' && !builtinPlugin && !this.access.recordOwner(spec.path, parts[1]!)) {
      this.stampPluginCreateScope(parts[1]!, args)
    }
    if (spec.path === PLUGINS_COLLECTION_PATH && !builtinPlugin && (actionId === 'sandbox' || actionId === 'pack')) {
      await this.stampActor(spec.path, parts[1]!)
    }
    const next = (await spec.get(parts[1]!)) ?? record
    this.indexTagRecord(spec, next)
    this.bump()
    return {
      kind: 'record' as const,
      path: `${spec.path}/${next.id}`,
      value: withoutContent(spec, next),
      ...(result !== undefined ? { result } : {}),
    }
  }

  async content(path: string): Promise<{ kind: 'content'; path: string; field: string; value: unknown; version?: number }> {
    const rewritten = this.rewriteOverviewRecordPath(path)
    if (rewritten) return this.content(rewritten)
    const parts = splitPath(path)
    if (parts.length !== 2) throw new Error(`cannot content: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    const schema = schemaFor(spec)
    const field = schema.contentField ?? 'content'
    const record = await spec.get(parts[1]!)
    if (!record) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
    this.assertLiveRecord(spec, record.id, 'resource:read', record)
    this.access.assertContentAccess(spec.path, record, 'read')
    if (!schema.fields[field]) throw new Error(`no content field: ${field}`)
    const editorContent = isEditorContentSpec(spec)
      ? readEditorContentRecord(this.tags.ensure(), spec.path, record.id)
      : null
    const value = editorContent ? editorContent.body : (record[field] ?? null)
    return {
      kind: 'content' as const,
      path: `${spec.path}/${record.id}`,
      field,
      value,
      ...(editorContent ? { version: editorContent.version } : {}),
    }
  }

  async writeContent(path: string, value: unknown, expectedVersion?: number) {
    const normalized = normalizeCollectionPath(path)
    return this.serializeContentWrite(normalized, () => this.writeContentNow(path, value, expectedVersion))
  }

  private async writeContentNow(
    path: string,
    value: unknown,
    expectedVersion?: number,
  ): Promise<{ kind: 'content'; path: string; field: string; value: unknown; updatedAt: number; version?: number }> {
    const rewritten = this.rewriteOverviewRecordPath(path)
    if (rewritten) return this.writeContentNow(rewritten, value, expectedVersion)
    const parts = splitPath(path)
    if (parts.length !== 2) throw new Error(`cannot write content: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    if (!spec.update) throw new Error(`collection cannot update: ${spec.path}`)
    const schema = schemaFor(spec)
    const field = schema.contentField ?? 'content'
    const existing = await spec.get(parts[1]!)
    if (!existing) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
    this.assertLiveRecord(spec, existing.id, 'resource:update', existing)
    this.access.assertContentAccess(spec.path, existing, 'write')
    if (!schema.fields[field]) throw new Error(`no content field: ${field}`)
    const persisted = typeof value === 'string' ? stripMentionLabels(value) : value
    if (isEditorContentSpec(spec)) {
      writeEditorContent(this.tags.ensure(), spec.path, parts[1]!, String(persisted ?? ''), { expectedVersion })
    }
    const patch = this.collectionCanUpdate(spec)
      ? pickWritablePatch(schema, { [field]: persisted })
      : { [field]: persisted }
    const record = await spec.update(parts[1]!, patch, isEditorContentSpec(spec) ? { persistContent: false } : undefined)
    await this.stampActor(spec.path, record.id)
    this.refreshContentRefs(spec, this.withBanner(spec, record))
    this.notifyContent(`${spec.path}/${record.id}`)
    const editorContent = isEditorContentSpec(spec)
      ? readEditorContentRecord(this.tags.ensure(), spec.path, record.id)
      : null
    return {
      kind: 'content' as const,
      path: `${spec.path}/${record.id}`,
      field,
      value: editorContent ? editorContent.body : (record[field] ?? null),
      updatedAt: Math.max(Number(record.updatedAt) || 0, Date.now()),
      ...(editorContent ? { version: editorContent.version } : {}),
    }
  }

  async contentTitle(path: string) {
    const parts = splitPath(path)
    if (parts.length !== 2) return path
    const spec = this.collection(`/${parts[0]}`)
    const record = spec ? await spec.get(parts[1]!) : null
    const title = String(record?.title ?? record?.name ?? '').trim()
    return title || parts[1] || path
  }

  private docAssetHost(): DocAssetEditHost {
    return {
      collection: (pathOrId) => this.collection(pathOrId),
      content: (path) => this.content(path),
      writeContent: (path, value, expectedVersion) => this.writeContent(path, value, expectedVersion),
      contentTitle: (path) => this.contentTitle(path),
      assertLiveRecord: (spec, id, action, record) => this.assertLiveRecord(spec, id, action, record),
      tags: this.tags,
      assets: this.assets,
      recordContentEdit: async (path, before, after, title) => {
        await this.ctx.get('contentTurns')?.recordEdit(path, before, after, title)
      },
      broadcast: (type, payload) => {
        const http = this.ctx.get('http') as { broadcast?: (type: string, payload: unknown) => void } | undefined
        http?.broadcast?.(type, payload)
      },
    }
  }

  async editContent(path: string, args: Record<string, unknown> = {}) {
    return executeEditContent(this.docAssetHost(), path, args)
  }

  async editAsset(path: string, args: Record<string, unknown> = {}) {
    return executeEditAsset(this.docAssetHost(), path, args)
  }

  async editDoc(path: string, args: Record<string, unknown> = {}) {
    return executeEditDoc(this.docAssetHost(), path, args)
  }
}

export const name = 'core-file-system'
export const inject = ['tools', 'http']

export function apply(ctx: Context) {
  const db = new DatabaseService(ctx)
  db.tags.open(biuSqlitePath())
  const assets = db.assets
  const savedViews = new SavedViewsStore()
  savedViews.open(process.env.VITEST ? ':memory:' : biuSqlitePath())
  db.savedViews = savedViews
  db.recordViews.open(biuSqlitePath())
  const account = ctx.get('account') as {
    authorization?: AuthorizationService
    workspaceLocation?: (workspaceId: string) => 'device' | 'cloud'
    store?: {
      activeWorkspaceId?: () => string | null
      members: (accountId: string, workspaceId: string) => Array<{
        id: string
        name: string
        email: string
        role: string
        member_kind: 'member' | 'external'
        created_at: number
      }>
      externallySharedRecords?: (
        accountId: string,
        workspaceId: string,
      ) => Array<{ collection: string; record_id: string }>
      setViewMetaResolver?: (
        resolver: (
          workspaceId: string,
          collection: string,
          viewId: string,
        ) => { createdBy?: string; scope?: 'personal' | 'workspace' | 'shared'; builtin?: boolean } | null,
      ) => void
      ensureViewPolicy?: (
        workspaceId: string,
        collection: string,
        viewId: string,
        fallbackActorId?: string,
      ) => string
      workspaceOwnerId?: (workspaceId: string) => string | null
      cleanupViewReferences?: (workspaceId: string, collection: string, viewId: string) => void
    }
  } | undefined
  savedViews.setWorkspaceResolver(() => resolveScopedWorkspaceId(ctx))
  account?.store?.setViewMetaResolver?.((workspaceId, collection, viewId) => {
    const view = savedViews.viewsFor(collection, '', workspaceId).find((item) => String(item.id) === viewId)
    if (!view) return null
    return {
      createdBy: view.createdBy,
      scope: view.scope,
      builtin: Boolean(view.builtin),
    }
  })
  const authorizeViewAction = (
    workspaceId: string,
    collection: string,
    view: { id: string; createdBy?: string },
    accountId: string,
    action: 'resource:read' | 'resource:update' | 'resource:delete',
  ) => {
    if (!account?.store || !account?.authorization || !workspaceId || !accountId) return true
    const recordId =
      account.store.ensureViewPolicy?.(workspaceId, collection, String(view.id), view.createdBy || accountId) ??
      rowIdOfView(collection, String(view.id))
    return account.authorization.authorize(
      { type: 'account', accountId, workspaceId },
      action,
      { type: 'record', workspaceId, collection: VIEWS_COLLECTION_PATH, recordId },
    ).allowed
  }
  savedViews.setPolicyGuard({
    // 方案 B（视图归展示，规则归安全）：视图权限与页面记录完全一致，统一走 /views 下的 resource_policies + record_grants
    // 内置视图全空间共享一份，创建人固定为空间创建人（workspace owner），且仅空间创建人可修改或删除
    isLocked: () => false,
    canEditLocked: () => true,
    workspaceOwner: (workspaceId) => account?.store?.workspaceOwnerId?.(workspaceId) ?? null,
    canSeeView: (workspaceId, collection, view, accountId) =>
      authorizeViewAction(workspaceId, collection, view, accountId, 'resource:read'),
    canModifyView: (workspaceId, collection, view, accountId) =>
      authorizeViewAction(workspaceId, collection, view, accountId, 'resource:update'),
    canRemoveView: (workspaceId, collection, view, accountId) =>
      authorizeViewAction(workspaceId, collection, view, accountId, 'resource:delete'),
    onCreated: (workspaceId, collection, view, accountId) => {
      account?.store?.ensureViewPolicy?.(workspaceId, collection, String(view.id), view.createdBy || accountId)
    },
    onRemoved: (workspaceId, collection, viewId) => {
      try {
        db.shares.revokeView(collection, viewId)
      } catch {
        /* ignore */
      }
      account?.store?.cleanupViewReferences?.(workspaceId, collection, viewId)
    },
  })
  const activeDataLocation = (): 'device' | 'cloud' => {
    if (getRuntimePolicy().hostMode === 'cloud') return 'cloud'
    const workspaceId = account?.store?.activeWorkspaceId?.()
    return workspaceId && account?.workspaceLocation?.(workspaceId) === 'cloud' ? 'cloud' : 'device'
  }
  db.viewCatalog = savedViews
  account?.authorization?.setMemberViewMatcher((workspaceId, viewId, accountId) => {
    const view = savedViews.viewsFor(WORKSPACE_MEMBERS_COLLECTION_PATH, '', workspaceId).find((item) => item.id === viewId)
      ?? stubBuiltinMemberView(viewId)
      ?? stubBuiltinAllView(viewId)
    if (!view || !account.store) return false
    const member = account.store.members(accountId, workspaceId).find((item) => item.id === accountId)
    if (!member) return false
    return matchListFilterRecord(
      {
        id: member.id,
        title: member.name || member.email,
        name: member.name,
        email: member.email,
        role: member.role,
        membershipKind: member.member_kind,
        joinedAt: member.created_at,
      },
      {
        ...(view.filters ?? {}),
        ...(view.filterTree ? { $tree: view.filterTree } : {}),
      },
    )
  })
  const parsedRuleFilterCache = new Map<string, Record<string, unknown>>()
  account?.authorization?.setAccessRuleMatcher((_workspaceId, _collection, filterTreeJson, recordId, context) => {
    if (!context.record) return false
    let tree = parsedRuleFilterCache.get(filterTreeJson)
    if (!tree) {
      try {
        const parsed = JSON.parse(filterTreeJson)
        tree = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { op: 'and', rules: [] }
      } catch {
        tree = { op: 'and', rules: [] }
      }
      if (parsedRuleFilterCache.size > 512) parsedRuleFilterCache.clear()
      parsedRuleFilterCache.set(filterTreeJson, tree)
    }
    return recordMatchesAccessRule({ id: recordId, ...context.record } as DbRecord, tree)
  })
  const shares = db.shares
  shares.open(process.env.VITEST ? ':memory:' : biuSqlitePath())
  const tags = db.tags
  db.register(dataCollection(() => db.collectionsList()))
  db.register(viewsCollection(savedViews, () => db.collectionsList().map((item) => db.publishCollection(item)), () => currentAccountId()))
  db.register(tagsCollection(tags, () => db.collectionsList().map((item) => ({
    id: item.id,
    path: item.path,
    label: item.label ?? item.id,
  }))))
  const sqlitePath = biuSqlitePath()
  const gcHooks = () => {
    let notices: { push: (input: { kind: 'session'; title: string; body: string; sourceKey: string }) => unknown } | undefined
    try {
      notices = ctx.get('notices') as typeof notices
    } catch {
      notices = undefined
    }
    return {
      db: db.tags.ensure(),
      assetsDir: db.assets.root(),
      sqlitePath,
      notices,
    }
  }
  db.register(trashCollection(db, gcHooks))
  db.recycleAssets = () => {
    if (process.env.VITEST) return
    void runWorkspaceAssetGc(gcHooks())
  }
  ctx.effect(() => {
    if (!process.env.VITEST) void runWorkspaceAssetGc(gcHooks())
    const tick = setInterval(() => {
      if (process.env.VITEST) return
      void runWorkspaceAssetGc(gcHooks())
    }, ASSET_GC_INTERVAL_MS)
    tick.unref()
    return () => clearInterval(tick)
  }, 'core-file-system.asset-gc')
  const contentTurns = new ContentTurnService(ctx).open(
    process.env.VITEST ? ':memory:' : dataPath(dataHome(), 'content-turns.json'),
  )
  ctx.http.route('GET', '/api/content-turns/file', async (route) => {
    const session = String(route.query.get('session') ?? '').trim()
    const turn = Number(route.query.get('turn'))
    const path = String(route.query.get('path') ?? '').trim()
    if (getRuntimePolicy().authzMode === 'rbac') {
      const accountId = currentAccountId().trim()
      const canReadSession = Boolean(accountId && session && getAccountPort(ctx)?.store?.canReadRecord?.('/agents', session))
      if (!canReadSession) {
        route.send(403, { error: '无权访问该会话的内容变更快照' })
        return
      }
      if (path.startsWith('/')) {
        try {
          await db.requirePath(path, 'resource:read')
        } catch {
          route.send(403, { error: '无权访问目标文档的内容变更快照' })
          return
        }
      }
    }
    const file = contentTurns.snapshot(session, turn, path)
    if (!file) {
      route.send(404, { error: 'missing' })
      return
    }
    route.send(200, { before: file.before, after: file.after })
  })
  registerDatabaseTools(ctx, db)

  registerDatabaseHttpRoutes(ctx, db, { savedViews, shares, tags, assets, activeDataLocation })
}
