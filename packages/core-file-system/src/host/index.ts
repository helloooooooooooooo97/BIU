import { readFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { isAbsolute, resolve } from 'node:path'
import {
  biuSqlitePath,
  dataHome,
  dataPath,
  EditorContentConflictError,
  currentAccountId,
  currentRequestWorkspaceId,
  readEditorContent,
  readEditorContentRecord,
  writeEditorContent,
  ASSET_GC_INTERVAL_MS,
  isDesktopRuntime,
  isOnlineRuntime,
} from '@biu/host-plugin-loader/data-dir'
import { asPublicProfile, readWorkspaceProfile, writeWorkspaceProfile } from '@biu/host-workspace'
import { roleCoversAction, type Action as PermissionAction, type AuthorizationService } from '@biu/host-account/authorization'
import { isRegisteredBuiltinPlugin } from '@biu/host-account/store'
import { forwardCloud } from '@biu/host-account/mirror'
import { Service, type Context } from 'cordis'
import {
  DATABASE_CHANNEL,
  databaseChannelPayload,
  asAttachmentList,
  asPerson,
  asPersonList,
  appendPerson,
  asHttpHref,
  asImageSrc,
  asImageSrcList,
  isTagFieldType,
  bindSchemaValue,
  emptySchemaValue,
  isEmptySchemaValue,
  normalizeSchemaPack,
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
  type FieldSpec,
  type SchemaFieldValue,
  type ListPage,
  type PersonValue,
  parseContentJump,
  allocateRecordId,
  isAssignableRecordId,
} from '@biu/type-file-system'
import { parsePageBanner, type PageBanner } from '../page-banner.ts'
import {
  applyTagBagPatch,
  asColumnKeys,
  asCreateRecords,
  asDeleteQuery,
  asFilter,
  asIds,
  assertSameTableLinks,
  coerce,
  coerceList,
  coerceTagPatch,
  coerceUrl,
  isPlainObject,
  isTextDoc,
  packFieldKey,
  parseContent,
  parseListColumnsParam,
  parseRecords,
  parseSortsParam,
  pickWritablePatch,
  pruneTagBags,
  remapTagBag,
  tagBagValueEmpty,
  takeBannerPatch,
  takeRequestedRecordId,
  unusedRecordId,
  writableFieldKeys,
} from './schema-coerce.ts'
import { registerDatabaseTools } from './agent-tools.ts'
import { databaseHttpFailure, registerDatabaseHttpRoutes } from './http-routes.ts'
export { databaseHttpFailure }
import { SavedViewsStore, clientViewFromDbRow, viewsCollection, type StoredView } from './saved-views.ts'
import { RecordViewsStore, wrapCollectionRecordViews } from './record-views.ts'
import { publicShareUrl } from './share-origin.ts'
import { readSharePluginWebJs, zipSharePluginSource } from './share-plugin-pack.ts'
import { isSharePluginId } from '../share-resources.ts'
import { TagStore } from './tags-store.ts'
import { SharesStore, dropSharesForRemovedViews } from './shares-store.ts'
import { builtinAllView, builtinAllViewId, builtinMemberViews, displayNameForView, isReadOnlyViewId, stubBuiltinAllView, stubBuiltinMemberView } from '../catalog-views.ts'
import { DATA_COLLECTION_PATH, isIndexCollection, isSystemCollection } from '../web/database-path.ts'
import { dataCollection, isDataOverviewSource, overviewRecord } from './data-collection.ts'
import { effectiveDataScope, highestViewRole, recordMatchesGrantedView, type DataScopeName, type ViewGrantRole } from '../view-access.ts'
import { recordMatchesSharedView, resolveSharedView, type SharedViewDef } from '../share-view-match.ts'
import { buildShareSnapshot } from './share-payload.ts'
import { FileSystemAssets, collectAssetNames, assetNamesFromMarkdown, assetNamesFromHtml, isAssetFileName, isHashedAssetName, mimeOfAsset, assetContentDisposition, AssetConflictError, parseIfMatch } from './assets-store.ts'
import { tagsCollection, parseStampRecordId } from './tags-collection.ts'
import { trashCollection } from './trash-collection.ts'
import { runWorkspaceAssetGc } from './asset-gc-run.ts'
import { ContentTurnService } from './content-turn-service.ts'
import {
  asContentText,
  findReplaceText,
  insertText,
  replaceLinesText,
  resolveContentCommand,
  strReplaceText,
  viewContent,
  writeContentText,
  mutationLocus,
  type ContentCommand,
} from './content-edit.ts'
import {
  MENTION_KIND_PATH,
  listMentionRefs,
  mentionRefsByCollection,
  projectMentionLabels,
  stripMentionLabels,
} from '../mention-markup.ts'
import { currentSessionId } from '@biu/host-sessions/scope'
import { databaseRevealForTool, normalizeCollectionPath, splitResourcePath } from '../paths.ts'
import { matchListFilterRecord, normalizeSorts, parseTagFlatColumnKey, readTagFieldValue, sortRecordsBy } from '../query-logic.ts'
import { actionWhenKeys } from '../web/fields.ts'
import { AgentDbCompact } from './agent-payload.ts'

const agentDbCompact = new AgentDbCompact()

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
  'tagId',
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

const SHARE_SCOPE_LABEL = {
  personal: '私人',
  workspace: '空间',
  shared: '共享',
} as const

const ACCESS_RANK = { viewer: 1, editor: 2, manager: 3, owner: 4 } as const

function accessLabel(role: keyof typeof ACCESS_RANK | null | undefined) {
  if (role === 'editor') return '编辑'
  if (role === 'viewer') return '阅读'
  if (role === 'manager' || role === 'owner') return '管理'
  return '阅读'
}

function higherAccess(left: keyof typeof ACCESS_RANK | null, right: keyof typeof ACCESS_RANK | null) {
  if (!left) return right
  if (!right) return left
  return ACCESS_RANK[left] >= ACCESS_RANK[right] ? left : right
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
      enum: ['管理', '编辑', '阅读'],
      description: '计算属性。当前用户对这一条的权限：管理、编辑或阅读。记录授权和视图授权里取较高的一级。',
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
  return {
    id: item.id,
    path: item.path,
    kind: 'collection',
    label: item.label ?? item.id,
    view: item.view ?? null,
  }
}

function splitPath(path: string): string[] {
  const hit = splitResourcePath(path)
  if (!hit) return []
  const name = hit.collection.replace(/^\//, '')
  return hit.recordId ? [name, hit.recordId] : [name]
}

function linkUploadedAsset(db: { tags: { linkContentRef: (collection: string, recordId: string, name: string, source?: string) => void } }, path: string, name: string) {
  const parts = splitPath(path)
  if (parts.length < 2 || !name) return
  db.tags.linkContentRef(`/${parts[0]}`, parts.slice(1).join('/'), name, 'asset')
}

function sessionTitleFromRow(row: unknown): string {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return ''
  const rec = row as Record<string, unknown>
  const title = String(rec.title ?? rec.name ?? '').trim()
  if (title) return title
  const config = rec.config
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    return String((config as { title?: unknown }).title ?? '').trim()
  }
  return ''
}

function sessionMascotFromRow(row: unknown): PersonValue['mascot'] {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return undefined
  const raw = (row as { mascot?: unknown }).mascot
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const rec = raw as { shape?: unknown; color?: unknown; eye?: unknown }
  if (typeof rec.shape !== 'string' || typeof rec.color !== 'string') return undefined
  return {
    shape: rec.shape,
    color: rec.color,
    ...(typeof rec.eye === 'number' ? { eye: rec.eye } : {}),
  }
}

function sessionPersonFromRow(row: unknown): { name: string; mascot?: PersonValue['mascot'] } {
  const name = sessionTitleFromRow(row)
  const mascot = sessionMascotFromRow(row)
  return mascot ? { name, mascot } : { name }
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
  if (route === '/' || route === '/s' || route === '/agents') throw new Error(`view.route 与内置路由冲突：${view.route}`)
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
const HARD_DELETE_PATHS = new Set(['/events', '/trash', '/workspace-members', '/views'])

type VisibleSortedPack = {
  rows: DbRecord[]
  personal: DbRecord[]
  workspace: DbRecord[]
  shared: DbRecord[]
}

type WorkspaceMembership = {
  active: string | null
  home: string | null
  mine: Set<string>
  any: Set<string>
  strict?: boolean
}

type WorkspaceFiles = {
  activeWorkspaceId(): string | null
  workspacePerson?(accountId: string): { accountId: string; workspaceId: string; name: string } | null
  membership(): WorkspaceMembership
  attach(
    workspaceId: string,
    collection: string,
    recordId: string,
    now?: number,
    policy?: {
      accessMode?: 'inherit' | 'private' | 'members' | 'restricted'
      memberDefaultRole?: 'viewer' | 'editor'
      parentCollection?: string
      parentRecordId?: string
    },
  ): void
  grantMap?(workspaceId: string, collection: string): Map<string, Set<string>>
  collectionOwnership?(workspaceId: string, collection: string): Map<string, 'personal' | 'workspace' | 'shared'>
  viewGrantAudiences?(
    workspaceId: string,
    collection: string,
  ): Array<{
    view_id: string
    subject_type: 'account' | 'member_view'
    subject_id: string
    granted_by?: string
    member_kind: string
  }>
  viewGrantsFor?(
    workspaceId: string,
    collection: string,
  ): Array<{
    view_id: string
    subject_type: 'account' | 'member_view'
    subject_id: string
    role: ViewGrantRole
    granted_by?: string
  }>
  collectionRecordOwners?(workspaceId: string, collection: string): Map<string, string>
  isMember?(accountId: string, workspaceId: string): boolean
  isSuperAdmin?(accountId?: string | null): boolean
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
  viewCatalog?: { viewsFor(collectionPath: string): SharedViewDef[] }
  recordViews = new RecordViewsStore()
  private ownershipCache: { key: string; map: Map<string, 'personal' | 'workspace' | 'shared'> } | null = null
  private ownerCache: { key: string; map: Map<string, string> } | null = null
  private viewAudienceCache: {
    key: string
    rows: Array<{ view_id: string; subject_type: 'account' | 'member_view'; subject_id: string; granted_by?: string; member_kind: string }>
  } | null = null
  private viewShareCache: { key: string; views: SharedViewDef[] } | null = null
  private recordShareCache: { key: string; ids: Set<string> } | null = null
  private inflightMatches = new Map<string, Promise<DbRecord[]>>()
  private inflightScans = new Map<string, Promise<DbRecord[]>>()
  private inflightVisible = new Map<string, Promise<VisibleSortedPack>>()
  private visibleCache = new Map<string, VisibleSortedPack>()
  private visibleGen = 0
  private boundAuth?: AuthorizationService
  private unbindAuth?: () => void
  recycleAssets?: () => void

  private bumpQueued = false
  private pendingBumpTenants = new Map<string, { workspaceId: string; accountId: string }>()

  constructor(ctx: Context) {
    super(ctx, 'database')
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

  /** 成员表在本地和云端都出现：本机用户自己是成员，局域网访客按设备码列入。 */
  membersInSystemData() {
    return true
  }

  publishCollection(item: CollectionSpec): CollectionInfo {
    const info = publicCollection(item)
    if (item.path === '/workspace-members' && !this.membersInSystemData()) return { ...info, view: null }
    return info
  }

  private async loadCollectionRows(spec: CollectionSpec, query: CollectionListQuery) {
    const rows = await spec.list(query)
    const listed = !query.ids?.length ? rows : rows.filter((row) => query.ids!.includes(row.id))
    const hidden = this.tags.deletedIds(spec.path)
    const builtinPlugin = (row: { builtin?: unknown }) => spec.path === '/plugins' && row.builtin === true
    return query.trash
      ? listed.filter((row) => hidden.has(row.id) && !builtinPlugin(row))
      : listed.filter((row) => !hidden.has(row.id) || builtinPlugin(row))
  }

  private decorateSlice(spec: CollectionSpec, rows: DbRecord[], wanted?: string[] | null) {
    this.ownershipCache = null
    this.ownerCache = null
    this.viewAudienceCache = null
    this.viewShareCache = null
    this.recordShareCache = null
    try {
      const need = listDecorateNeed(wanted)
      return rows.map((row) => this.decorateRecord(spec, row, need))
    } finally {
      this.ownershipCache = null
      this.ownerCache = null
      this.viewAudienceCache = null
      this.viewShareCache = null
      this.recordShareCache = null
    }
  }

  private collabStore() {
    try {
      return (this.ctx.get('account') as { store?: WorkspaceFiles } | undefined)?.store
    } catch {
      return undefined
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

  private workspaceMembership() {
    const store = this.collabStore()
    if (!store?.activeWorkspaceId()) return null
    return store.membership()
  }

  private scopeTarget(collection: string, id: string, row?: { pageId?: unknown; collection?: unknown; sessionId?: unknown; sourceId?: unknown; tablePath?: unknown }) {
    if (collection === '/trash' || collection === DATA_COLLECTION_PATH) {
      const tablePath = String(row?.tablePath ?? '')
      const sourceId = String(row?.sourceId ?? '')
      if (tablePath && sourceId) return { collection: tablePath, id: sourceId }
      const parsed = parseStampRecordId(id)
      if (parsed) return { collection: parsed.collection, id: parsed.recordId }
    }
    if (collection === '/events') {
      const sessionId = String(row?.sessionId ?? (id.lastIndexOf(':') > 0 ? id.slice(0, id.lastIndexOf(':')) : ''))
      if (sessionId) return { collection: '/agents', id: sessionId }
    }
    if (collection === '/tags') {
      const tablePath = String(row?.tablePath ?? '')
      const sourceId = String(row?.sourceId ?? '')
      if (tablePath && sourceId) return { collection: tablePath, id: sourceId }
    }
    if (collection === '/editor-blocks') {
      const pageId = String(row?.pageId ?? '')
      const parent = String(row?.collection ?? '')
      if (pageId && parent) return { collection: parent, id: pageId }
      const parts = id.split('::')
      if (parts.length >= 3) {
        const parent = parts[0]!.startsWith('/') ? parts[0]! : `/${parts[0]}`
        return { collection: parent, id: parts[1]! }
      }
    }
    return { collection, id }
  }

  private inWorkspace(membership: WorkspaceMembership, collection: string, id: string) {
    const key = `${collection}\t${id}`
    if (membership.mine.has(key)) return true
    if (membership.any.has(key)) return false
    if (membership.strict) return false
    return membership.active === membership.home
  }

  private visibleRecords<T extends { id?: unknown; pageId?: unknown; collection?: unknown; sessionId?: unknown; sourceId?: unknown; tablePath?: unknown }>(
    collection: string,
    rows: T[],
    action: PermissionAction = 'resource:read',
  ) {
    const authorization = this.authorization()
    const actor = authorization?.currentActor()
    if (authorization && actor) {
      return rows.filter((row) => {
        if (collection === '/plugins' && (row as { builtin?: unknown }).builtin === true) {
          return action === 'resource:read' || action === 'resource:list'
        }
        const target = this.scopeTarget(collection, String(row.id ?? ''), row)
        const resource = {
          type: 'record' as const,
          workspaceId: actor.workspaceId,
          collection: target.collection,
          recordId: target.id,
        }
        if (collection === '/tags' && !String(row.sourceId ?? '') && !String(row.tablePath ?? '')) {
          return this.indexTagVisible(String(row.id ?? ''), actor.accountId)
        }
        if (authorization.authorize(actor, action, resource).allowed) return true
        const viaView = this.viewGrantRole(actor.workspaceId, collection, row, actor.accountId)
        return Boolean(viaView && roleCoversAction(viaView, action))
      })
    }
    const membership = this.workspaceMembership()
    if (!membership) return rows
    const store = this.collabStore()
    const workspaceId = store?.activeWorkspaceId() ?? ''
    const grants = new Map<string, Map<string, Set<string>>>()
    return rows.filter((row) => {
      if (collection === '/plugins' && (row as { builtin?: unknown }).builtin === true) {
        return action === 'resource:read' || action === 'resource:list'
      }
      const target = this.scopeTarget(collection, String(row.id ?? ''), row)
      if (!this.inWorkspace(membership, target.collection, target.id)) return false
      if (!membership.strict || !store?.grantMap || !workspaceId) return true
      let map = grants.get(target.collection)
      if (!map) {
        map = store.grantMap(workspaceId, target.collection)
        grants.set(target.collection, map)
      }
      const people = map.get(target.id)
      if (!people || people.size === 0) return true
      return people.has(currentAccountId())
    })
  }

  /** 标签目录只留下当前用户能读到的源记录上贴过的标签；还没贴到公开数据上的，只留给创建人。 */
  private indexTagVisible(id: string, accountId: string) {
    const found = this.tags.collect(id)
    for (const item of found.items) {
      if (this.tags.isDeleted(item.collection, item.id)) continue
      if (item.collection === '/tags') continue
      if (this.visibleRecords(item.collection, [{ id: item.id }]).length > 0) return true
    }
    const createdBy = this.tags.recordMeta('/tags', id)?.createdBy?.accountId
    if (createdBy) return createdBy === accountId
    return Boolean(this.tags.get(id))
  }

  private recordsInScope<T extends { id?: unknown; pageId?: unknown; collection?: unknown; sessionId?: unknown; sourceId?: unknown; tablePath?: unknown }>(
    collection: string,
    rows: T[],
    scope: 'personal' | 'workspace' | 'shared' | '',
  ) {
    if (!scope) return rows
    const authorization = this.authorization()
    const actor = authorization?.currentActor()
    if (!authorization || !actor) return rows
    return rows.filter((row) => {
      if (collection === '/plugins' && (row as { builtin?: unknown }).builtin === true) return scope === 'shared'
      const target = this.scopeTarget(collection, String(row.id ?? ''), row)
      return authorization.scopeCurrent({
        type: 'record',
        workspaceId: actor.workspaceId,
        collection: target.collection,
        recordId: target.id,
      }) === scope
    })
  }

  allowsViaView(collection: string, record: { id?: unknown }, action: PermissionAction = 'resource:read') {
    const authorization = this.authorization()
    const actor = authorization?.currentActor()
    if (!authorization || !actor) return false
    const role = this.viewGrantRole(actor.workspaceId, collection, record, actor.accountId)
    return Boolean(role && roleCoversAction(role, action))
  }

  private viewGrantRole(
    workspaceId: string,
    collection: string,
    record: { id?: unknown },
    accountId: string,
  ): ViewGrantRole | null {
    const store = this.collabStore()
    const authorization = this.authorization()
    if (!store?.viewGrantsFor || !authorization) return null
    const saved = [builtinAllView({ path: collection }), ...(this.viewCatalog?.viewsFor(collection) ?? [])]
    const roles: ViewGrantRole[] = []
    for (const grant of store.viewGrantsFor(workspaceId, collection)) {
      const subjectMatches = grant.subject_type === 'account'
        ? grant.subject_id === accountId
        : authorization.matchesMemberView(workspaceId, grant.subject_id, accountId)
      if (!subjectMatches) continue
      const target = this.scopeTarget(collection, String(record.id ?? ''), record)
      const scope = authorization.scopeCurrent({
        type: 'record',
        workspaceId,
        collection: target.collection,
        recordId: target.id,
      })
      const ownerId = this.recordOwner(target.collection, target.id)
      if (recordMatchesGrantedView(record as never, grant.view_id, saved, scope, { grantedBy: grant.granted_by, recordOwnerId: ownerId })) roles.push(grant.role)
    }
    return highestViewRole(roles)
  }

  private grantAllows(collection: string, id: string) {
    const membership = this.workspaceMembership()
    const store = this.collabStore()
    const workspaceId = store?.activeWorkspaceId()
    if (!membership?.strict || !store?.grantMap || !workspaceId) return true
    const people = store.grantMap(workspaceId, collection).get(id)
    if (!people || people.size === 0) return true
    return people.has(currentAccountId())
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
    const store = this.collabStore()
    const workspaceId = store?.activeWorkspaceId()
    if (!store || !workspaceId) return
    store.attach(workspaceId, collection, recordId, Date.now(), policy)
    this.ownerCache = null
    this.ownershipCache = null
  }

  /** 分享里的「按成员视图批量授权」：全部成员可编辑。 */
  private grantAllMembersEditable(collection: string, recordId: string) {
    const store = this.collabStore() as {
      grantMemberView?: (
        actorId: string,
        collection: string,
        recordId: string,
        viewId: string,
        role: 'editor',
      ) => void
    } | undefined
    const actorId = currentAccountId()
    if (!store?.grantMemberView || !actorId) return
    try {
      store.grantMemberView(actorId, collection, recordId, builtinAllViewId('/workspace-members'), 'editor')
      this.ownerCache = null
      this.ownershipCache = null
    } catch {
      /* 还没挂上工作区时，记录仍按空间归属保留 */
    }
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
    this.rememberScope('/plugins', recordId, scope)
    const raw = String(args?.scope ?? '').trim()
    if ((raw === 'local' || this.deviceWorkspace()) && scope !== 'shared') this.markDeviceRecord('/plugins', recordId)
  }

  rememberScope(collection: string, recordId: string, scope: 'personal' | 'workspace' | 'shared') {
    if (scope === 'shared') {
      const device = this.deviceWorkspace()
      this.attachWorkspaceRecord(collection, recordId, {
        accessMode: device ? 'private' : 'members',
        ...(!device ? { memberDefaultRole: 'viewer' as const } : {}),
      })
      this.markPublicView(collection, recordId)
      return
    }
    this.attachWorkspaceRecord(collection, recordId, {
      accessMode: scope === 'workspace' ? 'members' : 'private',
      ...(scope === 'workspace' ? { memberDefaultRole: 'editor' as const } : {}),
    })
    if (scope === 'workspace') this.grantAllMembersEditable(collection, recordId)
  }

  /** 开启公开/局域网链接。不改协作者归属，关掉链接后仍按创建者和协作者计算。 */
  markPublicView(collection: string, recordId: string) {
    try {
      this.shares.upsert({ kind: 'record', collection, recordId, password: null, allowCopy: false })
    } catch {
      /* 分享库还没打开时，列表仍按协作者计算 */
    }
  }

  private builtinPlugin(spec: CollectionSpec, id: string, record?: { builtin?: unknown }) {
    if (spec.path !== '/plugins') return false
    return record?.builtin === true || isRegisteredBuiltinPlugin(id)
  }

  private assertLiveRecord(
    spec: CollectionSpec,
    id: string,
    action: PermissionAction = 'resource:read',
    record?: { id?: unknown },
  ) {
    if (this.builtinPlugin(spec, id, record)) {
      if (action === 'resource:read' || action === 'resource:list') return
      if (this.collabStore()?.isSuperAdmin?.(currentAccountId())) return
      throw new Error('permission denied: INSUFFICIENT_PERMISSION')
    }
    if (this.tags.isDeleted(spec.path, id)) throw new Error(`unknown record: ${spec.path}/${id}`)
    const authorization = this.authorization()
    const actor = authorization?.currentActor()
    if (authorization && actor) {
      const target = this.scopeTarget(spec.path, id, record)
      const decision = authorization.authorize(actor, action, {
        type: 'record',
        workspaceId: actor.workspaceId,
        collection: target.collection,
        recordId: target.id,
      })
      if (!decision.allowed) {
        if (
          spec.path === '/tags' &&
          (action === 'resource:read' || action === 'resource:list') &&
          this.indexTagVisible(id, actor.accountId)
        ) {
          return
        }
        const viaView = record
          ? this.viewGrantRole(actor.workspaceId, spec.path, record, actor.accountId)
          : null
        if (!viaView || !roleCoversAction(viaView, action)) {
          throw new Error(`unknown record: ${spec.path}/${id}`)
        }
      }
      return
    }
    const membership = this.workspaceMembership()
    if (!membership) return
    const target = this.scopeTarget(spec.path, id)
    if (!this.inWorkspace(membership, target.collection, target.id) || !this.grantAllows(target.collection, target.id)) {
      throw new Error(`unknown record: ${spec.path}/${id}`)
    }
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
      if (authorization.authorize(actor, action, resource).allowed) return true
      return this.allowsViaView(ref.collection, { id: ref.record_id }, action)
    })
    if (allowed) return
    if (action === 'resource:update' && refs.length === 0) {
      authorization.requireCurrent('resource:create', {
        type: 'collection',
        workspaceId: actor.workspaceId,
        collection: '/pages',
      })
      return
    }
    throw new Error('permission denied: INSUFFICIENT_PERMISSION')
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
    return path === '/trash' || path === '/events' || path === '/tags' || path === '/editor-blocks'
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
      const target = this.scopeTarget(specPath, String(row.id ?? ''), row)
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
      : `${this.collabStore()?.activeWorkspaceId() ?? ''}\t${currentAccountId()}`
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
    const tagFilter = spec.path === '/tags' ? String(query.filter?.tagId ?? '').trim() : ''
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
      if (collection === '/plugins' && (row as { builtin?: unknown }).builtin === true) {
        shared.push(row)
        continue
      }
      const id = String(row.id ?? '')
      const stored = this.ownershipOf(collection, id)
      const label = this.shareScopeLabel(collection, id, row, stored)
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
    const tagFilter = spec.path === '/tags' ? String(filter?.tagId ?? '').trim() : ''
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
    this.viewShareCache = null
    this.recordShareCache = null
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

  bump() {
    this.visibleGen += 1
    this.viewShareCache = null
    this.recordShareCache = null
    this.inflightMatches.clear()
    this.inflightScans.clear()
    this.inflightVisible.clear()
    this.visibleCache.clear()
    this.ctx.emit('database/change')
    const workspaceId = currentRequestWorkspaceId() || this.collabStore()?.activeWorkspaceId?.() || ''
    const accountId = currentAccountId()
    this.pendingBumpTenants.set(`${workspaceId}\0${accountId}`, { workspaceId, accountId })
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
        http?.broadcast?.(
          DATABASE_CHANNEL,
          databaseChannelPayload('records'),
          tenant.workspaceId || undefined,
          tenant.accountId || undefined,
        )
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

  /** 当前账号能读到的记录，带上正文，给本机和集中部署对拷。 */
  async syncedRecords() {
    const out: Array<{ path: string; records: DbRecord[] }> = []
    for (const spec of this.collections.values()) {
      if (!spec.list || !spec.get) continue
      try {
        const listed = await this.list(spec.path)
        if (listed.kind !== 'collection') continue
        const records: DbRecord[] = []
        for (const item of listed.items) {
          const full = await spec.get(String(item.id))
          records.push((full as DbRecord | null) ?? item)
        }
        out.push({ path: spec.path, records })
      } catch {
        /* 这张表读不了就跳过，不挡住别的表 */
      }
    }
    return out
  }

  /** 按 id 写入。对方更新时间不比本地新就跳过。 */
  async applySynced(path: string, records: DbRecord[]) {
    const spec = this.collection(path)
    if (!spec?.get || !spec.create || !spec.update) return
    for (const record of records) {
      const id = String(record?.id ?? '')
      if (!id) continue
      try {
        const existing = await spec.get(id)
        const incomingAt = Number(record.updatedAt) || 0
        const existingAt = Number((existing as DbRecord | null)?.updatedAt) || 0
        if (existing && existingAt >= incomingAt) continue
        if (!existing) await spec.create([{ ...record, id }])
        else await spec.update(id, record)
      } catch (error) {
        console.warn('[replica] skip', path, id, error)
      }
    }
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
    if (schemaFilter && schema.fields.tag && spec.path !== '/tags') {
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
    if (auth && actor) auth.preloadCollection(actor.workspaceId, spec.path, actor.accountId)
    try {
      const overlay = listNeedsMatchOverlay(liveFilter, q, sortField, page?.sorts)
      const pack = await this.visibleSortedCollectionRows(spec, query, sortField, sortDir, page?.sorts, overlay)
      const visible = scopeFilter ? pack[scopeFilter] : pack.rows
      const tagFilter = spec.path === '/tags' ? String(filter?.tagId ?? '').trim() : ''
      if (tagFilter) schema = schemaWithTagPack(schema, this.tags.get(tagFilter))
      const packs = this.tags.list()
      const sorted = visible.filter((row) => matchListFilter(row, liveFilter, schema, packs) && matchQuery(row, q, packs))
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
          const value = withoutContent(spec, row)
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
    if (spec.path === '/plugins' && row.builtin === true) {
      return {
        ...withMeta,
        ...(!need || need.shareScope ? { shareScope: '共享' } : {}),
        ...(!need || need.shareRole ? { shareRole: '阅读' } : {}),
      }
    }
    const wantScope = !need || need.shareScope
    const wantRole = !need || need.shareRole
    const stored = wantScope ? this.ownershipOf(spec.path, String(row.id ?? '')) : 'personal'
    return {
      ...withMeta,
      ...(wantScope ? { shareScope: this.shareScopeLabel(spec.path, String(row.id ?? ''), withMeta, stored) } : {}),
      ...(wantRole ? { shareRole: this.shareRoleLabel(spec, withMeta) } : {}),
    }
  }

  private shareScopeLabel(collection: string, id: string, record: DbRecord, stored: 'personal' | 'workspace' | 'shared') {
    if (this.hasPublicShare(collection, id, record, stored)) return '共享'
    if (this.deviceWorkspace()) return '私人'
    const scope = this.effectiveScope(collection, record, stored)
    if (scope === 'workspace') return '空间'
    if (scope === 'personal') return '私人'
    return SHARE_SCOPE_LABEL[scope]
  }

  private recordShareIds(collection: string) {
    if (this.recordShareCache?.key === collection) return this.recordShareCache.ids
    const ids = new Set<string>()
    try {
      for (const share of this.shares.listRecords(collection)) {
        const recordId = String(share.recordId ?? '').trim()
        if (recordId) ids.add(recordId)
      }
    } catch {
      /* 分享库还没打开时，仍按视图链接现算 */
    }
    this.recordShareCache = { key: collection, ids }
    return ids
  }

  private hasPublicShare(collection: string, id: string, record?: DbRecord, stored?: DataScopeName) {
    if (this.recordShareIds(collection).has(id)) return true
    if (!record || !stored) return false
    const spec = this.collections.get(collection)
    const tagged = spec ? this.applyTagOverlay(spec, record) : record
    const schema = spec ? schemaFor(spec) : undefined
    const packs = this.tags.list()
    return this.sharedViewsFor(collection).some((view) => recordMatchesSharedView(tagged, view, stored, schema, packs))
  }

  private sharedViewsFor(collection: string): SharedViewDef[] {
    if (this.viewShareCache?.key === collection) return this.viewShareCache.views
    let shares: Array<{ viewId: string }> = []
    try {
      shares = this.shares.listViews(collection)
    } catch {
      shares = []
    }
    const saved = [
      builtinAllView({ path: collection }),
      ...(this.viewCatalog?.viewsFor(collection) ?? []),
    ]
    const views: SharedViewDef[] = []
    for (const share of shares) {
      const view = resolveSharedView(share.viewId, saved)
      if (view) views.push(view)
    }
    this.viewShareCache = { key: collection, views }
    return views
  }

  /**
   * 当前用户对这一条的权限。记录上的角色和视图授权取较高的一级。
   * 局域网链接只让访客在分享页上是阅读，不改创建者自己在本机列表里的角色。
   */
  private shareRoleLabel(spec: CollectionSpec, record: DbRecord) {
    const authorization = this.authorization()
    const actor = authorization?.currentActor()
    if (!authorization || !actor) return '管理'
    const target = this.scopeTarget(spec.path, String(record.id ?? ''), record)
    const decision = authorization.authorize(actor, 'resource:read', {
      type: 'record',
      workspaceId: actor.workspaceId,
      collection: target.collection,
      recordId: target.id,
    })
    const direct = decision.allowed ? decision.effectiveRole : null
    const via = this.viewGrantRole(actor.workspaceId, spec.path, record, actor.accountId)
    return accessLabel(higherAccess(direct, via))
  }

  private effectiveScope(collection: string, record: DbRecord, stored: DataScopeName): DataScopeName {
    const store = this.collabStore()
    const workspaceId = store?.activeWorkspaceId?.() || currentRequestWorkspaceId() || ''
    if (!workspaceId) return stored
    const key = `${workspaceId}\t${collection}`
    const grantRows = store.viewGrantAudiences?.(workspaceId, collection)
      ?? store.viewGrantsFor?.(workspaceId, collection)?.map((row) => ({
        view_id: row.view_id,
        subject_type: row.subject_type,
        subject_id: row.subject_id,
        granted_by: row.granted_by,
        member_kind: '',
      }))
      ?? []
    if (!this.viewAudienceCache || this.viewAudienceCache.key !== key) {
      this.viewAudienceCache = { key, rows: grantRows }
    }
    const memberViews = [
      builtinAllView({ path: '/workspace-members' }),
      ...builtinMemberViews(),
      ...(this.viewCatalog?.viewsFor('/workspace-members') ?? []),
    ]
    const dataViews = [
      builtinAllView({ path: collection }),
      ...(this.viewCatalog?.viewsFor(collection) ?? []),
    ]
    return effectiveDataScope(
      stored,
      record,
      this.viewAudienceCache.rows.map((row) => ({
        viewId: row.view_id,
        subjectType: row.subject_type,
        subjectId: row.subject_id,
        memberKind: row.member_kind,
        grantedBy: row.granted_by,
      })),
      dataViews,
      memberViews,
      this.recordOwner(collection, String(record.id ?? '')),
    )
  }

  private ownershipOf(collection: string, id: string): 'personal' | 'workspace' | 'shared' {
    const store = this.collabStore()
    const workspaceId = store?.activeWorkspaceId?.() ?? ''
    if (!store?.collectionOwnership || !workspaceId) return 'personal'
    const key = `${workspaceId}\t${collection}`
    if (!this.ownershipCache || this.ownershipCache.key !== key) {
      this.ownershipCache = { key, map: store.collectionOwnership(workspaceId, collection) }
    }
    return this.ownershipCache.map.get(id) ?? 'personal'
  }

  private recordOwner(collection: string, id: string) {
    const store = this.collabStore()
    const workspaceId = store?.activeWorkspaceId?.() ?? ''
    if (!store?.collectionRecordOwners || !workspaceId) return ''
    const key = `${workspaceId}\t${collection}`
    if (!this.ownerCache || this.ownerCache.key !== key) {
      this.ownerCache = { key, map: store.collectionRecordOwners(workspaceId, collection) }
    }
    return this.ownerCache.map.get(id) ?? ''
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

  private applyPersonOverlay(spec: CollectionSpec, row: DbRecord): DbRecord {
    if (spec.path === '/plugins' && row.builtin === true) {
      const official = { kind: 'user' as const, name: 'BIU官方', url: 'https://github.com/helloooooooooooooo97/biu' }
      return { ...row, createdBy: official, updatedBy: [official] }
    }
    const meta = this.tags.recordMeta(spec.path, row.id)
    if (!meta) return row
    const editors = asPersonList(meta.updatedBy).map((item) => this.namedPerson(item))
    return {
      ...row,
      ...(meta.createdBy ? { createdBy: this.namedPerson(meta.createdBy) } : {}),
      ...(editors.length ? { updatedBy: editors } : {}),
    }
  }

  /** 本机空间：私人与共享都留在这台设备。 */
  private deviceWorkspace() {
    if (isOnlineRuntime()) return false
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
    await this.stampActor(collection, recordId)
    if (isOnlineRuntime()) return
    try {
      const account = this.ctx.get('account') as {
        markLocal?: (collection: string, id: string) => void
        workspaceLocation?: (workspaceId: string) => 'device' | 'cloud'
        store?: { activeWorkspaceId?: () => string | null }
      } | undefined
      const workspaceId = account?.store?.activeWorkspaceId?.() ?? ''
      if (!workspaceId || account?.workspaceLocation?.(workspaceId) !== 'cloud') {
        account?.markLocal?.(collection, recordId)
      }
    } catch {
      /* 没有账号服务时只记录创建人 */
    }
  }

  private async stampActor(collection: string, recordId: string) {
    const actor = await this.currentPerson()
    const existing = this.tags.recordMeta(collection, recordId)
    this.tags.writeRecordMeta(collection, recordId, {
      ...(existing?.createdBy ? {} : { createdBy: actor }),
      updatedBy: appendPerson(existing?.updatedBy, actor),
    })
  }

  private async currentPerson(): Promise<PersonValue> {
    const sid = currentSessionId()?.trim()
    if (!sid) {
      const accountId = currentAccountId()
      const member = accountId ? this.collabStore()?.workspacePerson?.(accountId) : null
      if (member?.name) return { kind: 'user', name: member.name, accountId }
      const name = readWorkspaceProfile().name.trim() || '用户'
      return { kind: 'user', name }
    }
    const peeked = await this.querySessionPerson(sid)
    return {
      kind: 'agent',
      name: peeked.name || sid.slice(0, 8),
      sessionId: sid,
      ...(peeked.mascot ? { mascot: peeked.mascot } : {}),
    }
  }

  private namedPerson(person: PersonValue): PersonValue {
    if (person.kind === 'user' && person.accountId) {
      const member = this.collabStore()?.workspacePerson?.(person.accountId)
      return member?.name ? { ...person, name: member.name } : person
    }
    if (person.kind !== 'agent' || !person.sessionId) return person
    const peeked = this.peekSessionPerson(person.sessionId)
    return {
      ...person,
      ...(peeked.name ? { name: peeked.name } : {}),
      ...(peeked.mascot ? { mascot: peeked.mascot } : {}),
    }
  }

  /**
   * 同步读会话行，给创建人/编辑人列用。
   * 只走内存缓存，绝不调用集合 get()：那是 async，会 await list() 全表重列，
   * 再 require() 把整条 events 读出来，表格每渲染一格就被卡一次。
   */
  private peekSessionRow(sessionId: string): unknown {
    const sessions = this.collection('/agents') as
      | { peek?: (id: string) => unknown; get?: (id: string) => unknown }
      | undefined
    const peeked = sessions?.peek?.(sessionId)
    if (peeked) return peeked
    return this.sessionsService()?.peek?.(sessionId)
  }

  private peekSessionPerson(sessionId: string) {
    return sessionPersonFromRow(this.peekSessionRow(sessionId))
  }

  private sessionsService(): { peek?: (id: string) => unknown; get?: (id: string) => Promise<unknown> } | undefined {
    try {
      return this.ctx.get('sessions') as { peek?: (id: string) => unknown; get?: (id: string) => Promise<unknown> }
    } catch {
      return undefined
    }
  }

  private async querySessionPerson(sessionId: string): Promise<{ name: string; mascot?: PersonValue['mascot'] }> {
    const peeked = this.peekSessionPerson(sessionId)
    if (peeked.name || peeked.mascot) return peeked
    // 只有 peek 完全落空才回落到真正的读取；正常热路径不会走到这里，
    // 也就不会为了写一个 createdBy 把整条会话的 events 拉进内存。
    const sessions = this.collection('/agents')
    if (sessions?.get) {
      const fromCollection = sessionPersonFromRow(await sessions.get(sessionId))
      if (fromCollection.name || fromCollection.mascot) return fromCollection
    }
    return sessionPersonFromRow(await this.sessionsService()?.get?.(sessionId))
  }

  private applyTagOverlay(spec: CollectionSpec, row: DbRecord): DbRecord {
    if (!schemaFor(spec).fields.tag) return row
    // Collected rows are projections, not records owned by /tags. Never write
    // them back to /tags: that would collect the projection again on each read.
    const stamp = spec.path === '/tags' ? parseStampRecordId(row.id) : null
    let overlay = this.tags.recordTag(stamp?.collection ?? spec.path, stamp?.recordId ?? row.id)
    if (!overlay && row.tag != null) {
      const value = normalizeSchemaValue(row.tag)
      if (!isEmptySchemaValue(value)) overlay = stamp ? value : this.persistRecordTag(spec, row.id, value, row)
    }
    if (!overlay) return row
    return { ...row, tag: pruneSchemaValue(overlay, this.tags.list()) }
  }

  private applyMetaOverlay(spec: CollectionSpec, row: DbRecord): DbRecord {
    const stamp = spec.path === '/tags' ? parseStampRecordId(row.id) : null
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
    return { kind: 'record' as const, path: `${spec.path}/${record.id}`, schema: this.schemaForCurrent(spec), value: withoutContent(spec, this.withBanner(spec, this.decorateRecord(spec, record))) }
  }

  async update(path: string, content: unknown) {
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
      this.bump()
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
    let record = Object.keys(patch).length ? await spec.update(parts[1]!, patch) : current
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
    else this.bump()
    const beforeSnap: Record<string, unknown> = {}
    const afterSnap: Record<string, unknown> = {}
    for (const key of Object.keys(patch)) {
      beforeSnap[key] = current[key] ?? null
      afterSnap[key] = record[key] ?? null
    }
    const title = String(record.title ?? record.name ?? record.id).trim() || record.id
    if (!viewOnly && Object.keys(patch).length) {
      await this.ctx.get('contentTurns')?.recordUpdate(`${spec.path}/${record.id}`, title, beforeSnap, afterSnap)
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
    if (spec.path === '/tags') throw new Error('tag catalog has no instance property values')
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
        bodyKey && spec.path !== '/tags'
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
      const initialBody = initialBodies[sourceIndex]
      if (initialBody !== undefined && bodyKey) {
        await this.writeContent(`${spec.path}/${record.id}`, initialBody)
      }
      this.indexTagRecord(spec, this.decorateRecord(spec, record))
      this.refreshContentRefs(spec, this.withBanner(spec, record))
      const parentField = spec.schema.parentField
      const parentRecordId = parentField ? String(record[parentField] ?? '').trim() : ''
      if (spec.path !== '/workspace-members') {
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
    }
    this.bump()
    const items = created.map((record) => ({
      kind: 'record' as const,
      path: `${spec.path}/${record.id}`,
      value: withoutContent(spec, this.withBanner(spec, this.decorateRecord(spec, record))),
    }))
    for (const item of items) {
      const title = String(item.value.title ?? item.value.name ?? '').trim() || item.path
      await this.ctx.get('contentTurns')?.recordCreate(item.path, title, item.value)
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
    if (schemaFilter && schema.fields.tag && spec.path !== '/tags') {
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
    if (spec.path === '/agents') this.disposeSessionAgents(ids)
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
      if (spec.path === '/views') {
        for (const row of matched) {
          const collection = normalizeCollectionPath(String(row.tablePath ?? ''))
          const viewId = String(row.viewId ?? '').trim()
          if (collection && collection !== '/' && viewId) this.shares.revokeView(collection, viewId)
        }
      }
      this.bump()
      return { kind: 'deleted' as const, path: spec.path, ids, trash: true }
    }
    await spec.remove({ ids })
    // 视图是硬删除：/views 只是 savedViews 现生成的一层行，删行必须连视图本体一起删，
    // 否则下一次列表/侧边栏拉取会把它原样吐回来（表现为「删掉的视图自己弹出来」）。
    if (spec.path === '/views') {
      for (const key of viewRowKeys(matched)) {
        try {
          savedViews.remove(rowIdOfView(key.collection, key.viewId), currentAccountId())
        } catch {
          /* 视图本体已不在（前端删视图时先走 /api/db/saved-views 整份覆盖） */
        }
      }
    }
    for (const id of ids) {
      this.tags.removeRecord(spec.path, id)
      this.shares.revokeRecord(spec.path, id)
    }
    if (spec.path === '/views') {
      for (const key of viewRowKeys(matched)) {
        this.shares.revokeView(key.collection, key.viewId)
      }
    }
    this.bump()
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
    this.bump()
    return { kind: 'restored' as const, path: spec.path, ids }
  }

  async listTrash() {
    const items = []
    for (const row of this.tags.listDeleted()) {
      const spec = this.collection(row.collection)
      if (!spec) continue
      const record = await spec.get(row.record_id)
      if (!record) continue
      if (row.collection === '/plugins' && (record as { builtin?: unknown }).builtin === true) continue
      const authorization = this.authorization()
      const actor = authorization?.currentActor()
      if (authorization && actor) {
        const pluginTrash = row.collection === '/plugins'
          && Boolean(this.collabStore()?.isMember?.(actor.accountId, actor.workspaceId))
        if (!pluginTrash && !authorization.authorize(actor, 'resource:read', {
          type: 'record',
          workspaceId: actor.workspaceId,
          collection: row.collection,
          recordId: row.record_id,
        }).allowed) continue
      } else {
        const membership = this.workspaceMembership()
        if (membership && !this.inWorkspace(membership, row.collection, row.record_id)) continue
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

  async action(path: string, actionId: string, args?: Record<string, unknown>) {
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
    const personalLoad = spec.path === '/plugins' && (actionId === 'start' || actionId === 'stop')
    const pluginAuthor = spec.path === '/plugins' && (actionId === 'sandbox' || actionId === 'pack')
    const builtinPlugin = this.builtinPlugin(spec, parts[1]!, record)
    if (pluginAuthor) {
      await this.requirePath(spec.path, 'resource:read')
      if (loaded && !builtinPlugin) {
        const owner = this.recordOwner(spec.path, record.id)
        if (!owner) this.stampPluginCreateScope(record.id, args)
        else this.assertLiveRecord(spec, record.id, 'resource:read', record)
      }
    } else if (!personalLoad && (loaded || !action.allowMissing)) {
      this.assertLiveRecord(spec, record.id, (action.requiredAction ?? 'resource:update') as PermissionAction, record)
    } else {
      await this.requirePath(spec.path, (action.requiredAction ?? 'resource:update') as PermissionAction)
    }
    if (!matchActionWhen(record, action.when)) throw new Error(`action not available: ${actionId}`)
    if ((actionId === 'delete' || actionId === 'trash') && spec.path !== '/trash') {
      return this.remove(spec.path, { ids: [parts[1]!] })
    }
    const result = await action.run(parts[1]!, record, args)
    if (spec.path === '/plugins' && actionId === 'sandbox' && !builtinPlugin && !this.recordOwner(spec.path, parts[1]!)) {
      this.stampPluginCreateScope(parts[1]!, args)
    }
    if (spec.path === '/plugins' && !builtinPlugin && (actionId === 'sandbox' || actionId === 'pack')) {
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

  async content(path: string) {
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

  private async writeContentNow(path: string, value: unknown, expectedVersion?: number) {
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
    if (!schema.fields[field]) throw new Error(`no content field: ${field}`)
    const persisted = typeof value === 'string' ? stripMentionLabels(value) : value
    if (isEditorContentSpec(spec)) {
      writeEditorContent(this.tags.ensure(), spec.path, parts[1]!, String(persisted ?? ''), { expectedVersion })
    }
    const patch = this.collectionCanUpdate(spec)
      ? pickWritablePatch(schema, { [field]: persisted })
      : { [field]: persisted }
    const record = await spec.update(parts[1]!, patch)
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

  private async mentionTitles(markdown: string) {
    const groups = mentionRefsByCollection(listMentionRefs(markdown))
    const titles: Record<string, string> = {}
    for (const [path, ids] of groups) {
      const spec = this.collection(path)
      if (!spec) continue
      const rows = await spec.list({ ids })
      const kind = (Object.entries(MENTION_KIND_PATH).find(([, item]) => item === path)?.[0] ?? 'page') as keyof typeof MENTION_KIND_PATH
      for (const row of rows) {
        const id = String(row.id ?? '').trim()
        if (!id || !ids.includes(id)) continue
        const title = String(row.title ?? row.name ?? '').trim()
        if (title) titles[`${kind}/${id}`] = title
      }
    }
    return titles
  }

  async editContent(path: string, args: Record<string, unknown> = {}) {
    const command = resolveContentCommand(args)
    const current = await this.content(path)
    const text = stripMentionLabels(asContentText(current.value))
    if (command === 'view') {
      const viewed = viewContent(text, args.view_range)
      const titles = await this.mentionTitles(viewed.text)
      return {
        kind: 'content' as const,
        path: current.path,
        field: current.field,
        command,
        start: viewed.start,
        end: viewed.end,
        total: viewed.total,
        truncated: viewed.truncated,
        text: projectMentionLabels(viewed.text, titles),
      }
    }
    let replaced: number | undefined
    const incoming = stripMentionLabels(await resolveIncomingText(command, args))
    const oldStr = args.old_str != null ? stripMentionLabels(String(args.old_str)) : args.old_str
    const patch = { ...args, old_str: oldStr, new_str: incoming, ...(command === 'write' ? { value: incoming } : {}) }
    const next =
      command === 'write'
        ? writeContentText(incoming)
        : command === 'str_replace'
          ? strReplaceText(text, oldStr, incoming)
          : command === 'find_replace'
            ? resolveFindReplace(text, { ...args, old_str: oldStr, new_str: incoming })
            : command === 'insert'
              ? insertText(text, args.insert_line, incoming)
              : replaceLinesText(text, args.start_line, args.end_line, incoming)
    if (typeof next === 'object') {
      replaced = next.replaced
    }
    const nextText = typeof next === 'object' ? next.text : next
    await this.writeContent(path, nextText, current.version)
    const locus = mutationLocus(command === 'find_replace' ? 'str_replace' : command, text, nextText, patch)
    const written = await this.content(current.path)
    const after = asContentText(written.value)
    const title = await this.contentTitle(current.path)
    await this.ctx.get('contentTurns')?.recordEdit(current.path, text, after, title)
    return {
      kind: 'content' as const,
      path: current.path,
      field: current.field,
      command,
      ok: true as const,
      ...(replaced != null ? { replaced } : {}),
      ...(locus ? { start_line: locus.start_line, end_line: locus.end_line, ...(locus.text ? { text: locus.text } : {}) } : {}),
    }
  }

  async editAsset(path: string, args: Record<string, unknown> = {}) {
    const parts = splitPath(path)
    if (parts.length !== 2) throw new Error(`cannot asset: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    const record = await spec.get(parts[1]!)
    if (!record) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
    const from = String(args.from ?? '').trim()
    const command = String(args.command ?? (args.value != null || from ? 'write' : 'view'))
    this.assertLiveRecord(spec, record.id, command === 'view' ? 'resource:read' : 'resource:update', record)
    const names = new Set([
      ...collectAssetNames(record, this.tags.recordBanner(spec.path, record.id)?.html),
      ...this.tags.listedAttachmentNames(spec.path, record.id),
    ])
    const file = String(args.name ?? '')
      .trim()
      .replace(/^assets\//, '')
      .replace(/^.*[/\\]/, '')
    const recPath = `${spec.path}/${record.id}`
    if (command === 'view' && !file) {
      const assets = []
      for (const name of [...names].sort()) {
        try {
          const read = await this.assets.readAny(name)
          assets.push({ name, etag: read.etag, type: read.type })
        } catch {
          assets.push({ name, missing: true })
        }
      }
      return { kind: 'asset' as const, path: recPath, command: 'view' as const, assets }
    }
    if (!isAssetFileName(file)) throw new Error('invalid asset')
    if (command === 'view') {
      if (!names.has(file)) throw new Error(`asset not referenced: ${file}`)
      try {
        const read = await this.assets.readAny(file)
        const text =
          read.type.startsWith('text/') || read.type.includes('json') ? read.bytes.toString('utf8') : undefined
        return {
          kind: 'asset' as const,
          path: recPath,
          command: 'view' as const,
          name: file,
          etag: read.etag,
          type: read.type,
          ...(text != null ? { text } : {}),
        }
      } catch {
        return {
          kind: 'asset' as const,
          path: recPath,
          command: 'view' as const,
          name: file,
          missing: true,
          etag: '',
        }
      }
    }
    if (command !== 'write') throw new Error(`unknown asset command: ${command}`)
    const body = from ? await readLocalWriteFile(from) : String(args.value ?? '')
    if (!from && args.value == null) throw new Error('write needs value or from')
    const written = await this.assets.write(file, body)
    const kind = String(args.kind ?? '') === 'core' ? 'core' : 'asset'
    const blockId = String(args.block_id ?? args.blockId ?? '').trim()
    const source = String(args.source ?? (blockId ? `block:${blockId}` : 'asset')).trim() || 'asset'
    this.tags.putAttachment({
      name: written.name,
      etag: written.etag,
      mime: mimeOfAsset(written.name),
      bytes: written.bytes,
      kind,
      storage: 'hash',
    })
    if (Array.isArray(args.refs)) {
      const refs = args.refs.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const rec = item as Record<string, unknown>
        const name = String(rec.name ?? '').trim()
        if (!isAssetFileName(name)) return []
        return [{ name, source: String(rec.source ?? source) }]
      })
      if (blockId) this.tags.replaceBlockRefs(spec.path, record.id, blockId, refs.length ? refs : [{ name: written.name, source }])
    } else if (blockId) {
      this.tags.upsertBlockRef(spec.path, record.id, blockId, written.name, source)
    }
    this.broadcastAsset(recPath, written.name, written.etag)
    return { kind: 'asset' as const, ok: true as const, path: recPath, name: written.name, etag: written.etag, storage: 'hash' as const }
  }

  async editDoc(path: string, args: Record<string, unknown> = {}) {
    const parts = splitPath(path)
    if (parts.length !== 2) throw new Error(`cannot doc: ${normalizeCollectionPath(path)}`)
    const spec = this.collection(`/${parts[0]}`)
    if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
    const record = await spec.get(parts[1]!)
    if (!record) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
    const command = resolveContentCommand(args)
    this.assertLiveRecord(spec, record.id, command === 'view' ? 'resource:read' : 'resource:update', record)
    const names = new Set([
      ...collectAssetNames(record, this.tags.recordBanner(spec.path, record.id)?.html),
      ...this.tags.listedAttachmentNames(spec.path, record.id),
    ])
    const file = String(args.name ?? '')
      .trim()
      .replace(/^assets\//, '')
      .replace(/^.*[/\\]/, '')
    const recPath = `${spec.path}/${record.id}`
    const readOwnedOrAsset = async (name: string) => this.assets.readAny(name)
    if (command === 'view' && !file) {
      const assets = []
      for (const name of [...names].sort()) {
        try {
          const read = await readOwnedOrAsset(name)
          assets.push({
            name,
            etag: read.etag,
            type: read.type,
            ...('storage' in read ? { storage: (read as { storage?: string }).storage } : {}),
          })
        } catch {
          assets.push({ name, missing: true })
        }
      }
      return { kind: 'doc' as const, path: recPath, command: 'view' as const, assets }
    }
    if (!isAssetFileName(file)) throw new Error('invalid asset')
    if (!names.has(file)) throw new Error(`doc not referenced: ${file}`)
    const readDoc = async () => this.assets.readDoc(file)
    let current: { text: string; etag: string; type: string } | null = null
    try {
      const read = await readDoc()
      const raw = Buffer.from(read.bytes).toString('utf8')
      current = { text: raw, etag: read.etag, type: read.type }
    } catch {
      current = null
    }
    if (command === 'view') {
      if (!current) {
        return { kind: 'doc' as const, path: recPath, command: 'view' as const, name: file, missing: true, etag: '' }
      }
      const viewed = viewContent(current.text, args.view_range)
      return {
        kind: 'doc' as const,
        path: recPath,
        command: 'view' as const,
        name: file,
        etag: current.etag,
        type: current.type,
        start: viewed.start,
        end: viewed.end,
        total: viewed.total,
        truncated: viewed.truncated,
        text: viewed.text,
      }
    }
    if (command !== 'write' && !current) throw new Error(`doc missing: ${file}`)
    if (command !== 'write' && current && !isTextDoc(file, current.type)) throw new Error(`doc is not text: ${file}`)
    let replaced: number | undefined
    const incoming = await resolveIncomingText(command, args)
    const base = current?.text ?? ''
    const patch = { ...args, new_str: incoming, ...(command === 'write' ? { value: incoming } : {}) }
    const next =
      command === 'write'
        ? writeContentText(incoming)
        : command === 'str_replace'
          ? strReplaceText(base, args.old_str, incoming)
          : command === 'find_replace'
            ? resolveFindReplace(base, { ...args, new_str: incoming })
            : command === 'insert'
              ? insertText(base, args.insert_line, incoming)
              : replaceLinesText(base, args.start_line, args.end_line, incoming)
    if (typeof next === 'object') replaced = next.replaced
    const nextText = typeof next === 'object' ? next.text : next
    const matchEtag = String(args.etag ?? current?.etag ?? '')
    const written = await this.assets.writeDoc(file, nextText, { etag: matchEtag })
    const kind = String(args.kind ?? '') === 'core' ? 'core' : 'asset'
    const blockId = String(args.block_id ?? args.blockId ?? '').trim()
    const source = String(args.source ?? (blockId ? `block:${blockId}` : 'doc')).trim() || 'doc'
    this.tags.putAttachment({
      name: written.name,
      etag: written.etag,
      mime: mimeOfAsset(written.name),
      bytes: written.bytes ?? Buffer.byteLength(nextText),
      kind,
      storage: 'name',
    })
    if (blockId) this.tags.upsertBlockRef(spec.path, record.id, blockId, written.name, source)
    this.broadcastAsset(recPath, written.name, written.etag)
    const locus = mutationLocus(command === 'find_replace' ? 'str_replace' : command, base, nextText, patch)
    return {
      kind: 'doc' as const,
      ok: true as const,
      path: recPath,
      name: written.name,
      etag: written.etag,
      storage: 'name' as const,
      command,
      ...(replaced != null ? { replaced } : {}),
      ...(locus ? { start_line: locus.start_line, end_line: locus.end_line, ...(locus.text ? { text: locus.text } : {}) } : {}),
    }
  }

  private broadcastAsset(path: string, name: string, etag: string) {
    const http = this.ctx.get('http') as { broadcast?: (type: string, payload: unknown) => void } | undefined
    http?.broadcast?.(DATABASE_CHANNEL, databaseChannelPayload('asset', { asset: { name, etag, path } }))
  }
}

async function readLocalWriteFile(raw: string) {
  const file = isAbsolute(raw) ? raw : resolve(process.cwd(), raw)
  try {
    return await readFile(file)
  } catch {
    throw new Error(`cannot read from: ${raw}`)
  }
}

/**
 * 写入侧正文：短文本用 value/new_str 内联；长文本用 from 读本地文件（工作区或 /tmp）。
 * 两者都可出现在参数里；给了 from 就用文件内容。write 用 value（可用 new_str 别名）；
 * insert / str_replace / find_replace / replace_lines 用 new_str。
 */
async function resolveIncomingText(command: ContentCommand, args: Record<string, unknown>): Promise<string> {
  const rawFrom = String(args.from ?? '').trim()
  if (rawFrom) {
    const bytes = await readLocalWriteFile(rawFrom)
    return bytes.toString('utf8')
  }
  if (command === 'write') return asContentText(args.value ?? args.new_str)
  if (command === 'insert' || command === 'replace_lines') {
    if (typeof args.new_str !== 'string') throw new Error(`${command} needs new_str or from`)
    return args.new_str
  }
  return typeof args.new_str === 'string' ? args.new_str : String(args.new_str ?? '')
}

function resolveFindReplace(text: string, args: Record<string, unknown>) {
  return findReplaceText(text, args.old_str, args.new_str, {
    regex: args.regex,
    all: args.all,
    count: args.count,
  })
}

export const name = 'core-file-system'
export const inject = ['tools', 'http']

export function apply(ctx: Context) {
  const db = new DatabaseService(ctx)
  db.tags.open(biuSqlitePath())
  const assets = db.assets
  const savedViews = new SavedViewsStore()
  savedViews.open(process.env.VITEST ? ':memory:' : biuSqlitePath())
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
      viewGrantsFor?: (
        workspaceId: string,
        collection: string,
      ) => Array<{
        view_id: string
        subject_type: 'account' | 'member_view'
        subject_id: string
        role: 'viewer' | 'editor' | 'manager' | 'owner'
      }>
    }
  } | undefined
  const activeDataLocation = (): 'device' | 'cloud' => {
    if (isOnlineRuntime()) return 'cloud'
    const workspaceId = account?.store?.activeWorkspaceId?.()
    return workspaceId && account?.workspaceLocation?.(workspaceId) === 'cloud' ? 'cloud' : 'device'
  }
  db.viewCatalog = savedViews
  ctx.inject(['sessions'], (inner) => {
    inner.sessions.viewAccess = (id, record) => db.allowsViaView('/agents', { ...record, id })
  })
  account?.authorization?.setMemberViewMatcher((workspaceId, viewId, accountId) => {
    const view = savedViews.viewsFor('/workspace-members').find((item) => item.id === viewId)
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
  ctx.http.route('GET', '/api/content-turns/file', (route) => {
    const session = String(route.query.get('session') ?? '').trim()
    const turn = Number(route.query.get('turn'))
    const path = String(route.query.get('path') ?? '').trim()
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
