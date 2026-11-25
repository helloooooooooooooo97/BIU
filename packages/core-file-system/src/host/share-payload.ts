import type { CollectionSchema, CollectionSchemaPack, Database, DbRecord } from '@biu/type-file-system'
import { normalizeSchemaValue } from '@biu/type-file-system'
import { collectAssetNames } from './assets-store.ts'
import type { SavedViewsStore } from './saved-views.ts'
import { freezeSchema, type ShareSnapshot } from '../share-snapshot.ts'
import { collectShareResources } from '../share-resources.ts'
import { savedViewRecordPath } from '../paths.ts'
import { displayNameForView } from '../catalog-views.ts'
import type { ShareRecord } from './shares-store.ts'
import { asPublicProfile } from '@biu/host-workspace'
import { parseTagFlatColumnKey } from '../query-logic.ts'
import { viewShareListFilter } from '../share-view-match.ts'

const SHARE_LIMIT = 200
const CONTENT_CONCURRENCY = 8

async function mapConcurrent<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  if (!items.length) return []
  const results = new Array<R>(items.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await run(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

function asStat(raw: unknown) {
  return raw as { kind?: string; schema?: CollectionSchema; label?: string; view?: { title?: string } | null }
}

function asRecordRead(raw: unknown) {
  return raw as { value?: DbRecord }
}

function asContentRead(raw: unknown) {
  return raw as { value?: unknown }
}

/** 分享页上的人只能看。不要把创建者自己的「管理」带出去。 */
function audienceRecord(record: DbRecord): DbRecord {
  return { ...record, shareRole: '查看' }
}

function withResources(
  snap: Omit<ShareSnapshot, 'resources' | 'pluginIds' | 'sharePlugins' | 'allowCopy'>,
  share: ShareRecord,
): ShareSnapshot {
  const resources = collectShareResources(snap.records, snap.contents, {
    skipIds: snap.records.map((row) => String(row.id)),
    includeRecords: share.kind === 'view' || share.kind === 'rule',
  })
  return {
    ...snap,
    resources: { pages: resources.pages, plugins: resources.plugins, collections: resources.collections },
    pluginIds: resources.pluginIds,
    sharePlugins: share.sharePlugins,
    allowCopy: share.allowCopy,
    owner: (() => {
      const profile = asPublicProfile()
      return profile.name || profile.avatar ? { name: profile.displayName, avatar: profile.avatar } : undefined
    })(),
  }
}

export type ShareAccessRuleInput = {
  id: string
  name: string
  createdBy: string
  filterTree: Record<string, unknown>
  columns: string[] | null
  displaySnapshot: {
    mode?: string
    sorts?: unknown[]
    groupBy?: string
    groupConfig?: Record<string, unknown>
  } | null
  enabled: boolean
}

export type ShareSnapshotOpts = {
  /** View/rule shares skip bodies until the visitor opens a row (or downloads). */
  contentIds?: readonly string[] | 'all'
  /** Independent access rule definition when share.kind === 'rule'. */
  accessRule?: ShareAccessRuleInput | null
  /** Enforce single-hop creator authority (owner/manager) per record in rule shares. */
  canCreatorShareRecord?: (recordId: string) => boolean
}

function projectRuleRecordColumns(record: DbRecord, columns: string[] | null): DbRecord {
  if (!columns || columns.length === 0) return record
  const allow = new Set(['id', 'title', 'shareRole', 'emoji', ...columns])
  const out: Record<string, unknown> = { id: record.id }
  for (const [k, v] of Object.entries(record)) {
    if (allow.has(k)) out[k] = v
  }
  return out as DbRecord
}

async function loadContents(
  db: Pick<Database, 'content'>,
  collection: string,
  records: DbRecord[],
  ids: readonly string[],
) {
  const allow = new Set(ids.map(String))
  const wanted = records.filter((row) => allow.has(String(row.id)))
  const bodies = await mapConcurrent(wanted, CONTENT_CONCURRENCY, async (row) => {
    try {
      return asContentRead(await db.content(`${collection}/${row.id}`)).value ?? null
    } catch {
      return null
    }
  })
  const contents: Record<string, unknown> = {}
  wanted.forEach((row, index) => {
    contents[row.id] = bodies[index] ?? null
  })
  return contents
}

function shareTagCatalog(
  db: { tags?: { list: () => CollectionSchemaPack[] } },
  records: DbRecord[],
  view?: { groupBy?: string; columns?: string[] },
): CollectionSchemaPack[] {
  const catalog = db.tags?.list() ?? []
  if (!catalog.length) return []
  const used = new Set<string>()
  for (const row of records) {
    for (const id of normalizeSchemaValue(row.tag).tags) used.add(id)
  }
  for (const key of [view?.groupBy, ...(view?.columns ?? [])]) {
    const parsed = parseTagFlatColumnKey(String(key ?? ''))
    if (parsed) used.add(parsed.packId)
  }
  if (!used.size) return []
  return catalog.filter((tag) => used.has(tag.id))
}

function contentIdsFor(share: ShareRecord, records: DbRecord[], opts?: ShareSnapshotOpts) {
  if (share.kind === 'record' || opts?.contentIds === 'all') return records.map((row) => String(row.id))
  const allow = new Set(records.map((row) => String(row.id)))
  return [...new Set((opts?.contentIds ?? []).map(String))].filter((id) => allow.has(id))
}

export async function buildShareSnapshot(
  db: Pick<Database, 'stat' | 'list' | 'read' | 'content'> & { tags?: { list: () => CollectionSchemaPack[] } },
  savedViews: SavedViewsStore,
  share: ShareRecord,
  opts?: ShareSnapshotOpts,
): Promise<ShareSnapshot> {
  const stat = asStat(await db.stat(share.collection))
  if (stat.kind !== 'collection' || !stat.schema) throw new Error('unknown collection')
  const schema = freezeSchema(stat.schema)
  const collectionLabel = String(stat.view?.title ?? stat.label ?? share.collection.replace(/^\//, ''))
  const table = { path: share.collection, label: collectionLabel, view: { title: collectionLabel } }
  if (share.kind === 'record') {
    const got = asRecordRead(await db.read(`${share.collection}/${share.recordId}`))
    const record = got.value
    if (!record?.id) throw new Error('unknown record')
    let content: unknown = null
    try {
      content = asContentRead(await db.content(`${share.collection}/${record.id}`)).value ?? null
    } catch {
      content = null
    }
    const contents = { [record.id]: content }
    return withResources({
      kind: 'record',
      collection: share.collection,
      viewId: share.viewId,
      recordId: record.id,
      title: String(record.title ?? record.name ?? collectionLabel),
      collectionLabel,
      schema,
      records: [audienceRecord({ ...record, [schema.contentField ?? 'notes']: undefined })],
      contents,
      assets: [...collectAssetNames(record, content, record.banner)],
      banner: record.banner ?? null,
      tags: shareTagCatalog(db, [record]),
    }, share)
  }
  if (share.kind === 'rule') {
    const rule = opts?.accessRule
    if (!rule || !rule.enabled) throw new Error('unknown rule')
    const snap = rule.displaySnapshot ?? {}
    const view = {
      id: rule.id,
      name: rule.name || collectionLabel,
      mode: (typeof snap.mode === 'string' ? snap.mode : undefined) as never,
      query: '',
      sortField: 'title',
      sortDir: 'asc' as const,
      sorts: Array.isArray(snap.sorts) ? (snap.sorts as never) : undefined,
      filterTree: rule.filterTree as never,
      columns: rule.columns ?? undefined,
      groupBy: typeof snap.groupBy === 'string' ? snap.groupBy : '',
      groupConfig: snap.groupConfig && typeof snap.groupConfig === 'object' ? (snap.groupConfig as never) : undefined,
    }
    const listed = (await db.list(share.collection, viewShareListFilter(view), {
      q: '',
      sortField: view.sortField,
      sortDir: view.sortDir,
      sorts: view.sorts,
      limit: SHARE_LIMIT,
    })) as { items?: DbRecord[] }
    const rawItems = (listed.items ?? []).filter((row) =>
      opts?.canCreatorShareRecord ? opts.canCreatorShareRecord(String(row.id)) : true,
    )
    const records = rawItems.map((row) => audienceRecord(projectRuleRecordColumns(row, rule.columns)))
    const contents = await loadContents(db, share.collection, records, contentIdsFor(share, records, opts))
    return withResources({
      kind: 'rule',
      collection: share.collection,
      viewId: '',
      recordId: '',
      ruleId: rule.id,
      title: rule.name || collectionLabel,
      collectionLabel,
      schema,
      view,
      records,
      contents,
      assets: [...collectAssetNames(...records, ...Object.values(contents))],
      banner: null,
      tags: shareTagCatalog(db, records, view),
    }, share)
  }
  const stored = savedViews.viewsFor(share.collection).find((item) => item.id === share.viewId)
  const viewName = displayNameForView(share.viewId, table, stored?.name)
  const view = {
    id: share.viewId,
    name: viewName,
    query: stored?.query ?? '',
    sortField: stored?.sortField || 'title',
    sortDir: stored?.sortDir === 'desc' ? 'desc' as const : 'asc' as const,
    sorts: stored?.sorts,
    filters: stored?.filters,
    filterTree: stored?.filterTree,
    columns: stored?.columns,
    wrap: stored?.wrap,
    truncate: stored?.truncate,
    pageSize: stored?.pageSize,
    groupBy: stored?.groupBy ?? '',
  }
  const listed = (await db.list(share.collection, viewShareListFilter(view), {
    q: String(view.query ?? ''),
    sortField: view.sortField,
    sortDir: view.sortDir,
    sorts: view.sorts,
    limit: SHARE_LIMIT,
  })) as { items?: DbRecord[] }
  const records = (listed.items ?? []).map(audienceRecord)
  const contents = await loadContents(db, share.collection, records, contentIdsFor(share, records, opts))
  const banner = await readShareBanner(db, share.collection, share.viewId)
  return withResources({
    kind: 'view',
    collection: share.collection,
    viewId: share.viewId,
    recordId: '',
    title: viewName,
    collectionLabel,
    schema,
    view,
    records,
    contents,
    assets: [...collectAssetNames(...records, ...Object.values(contents), banner)],
    banner,
      tags: shareTagCatalog(db, records, view),
  }, share)
}

async function readShareBanner(
  db: Pick<Database, 'read'>,
  collection: string,
  viewId: string,
) {
  // The host deliberately has no banner for built-in/read-only views.
  // Keep the share page on the same rule even if an old banner overlay
  // still exists for that synthetic /views row.
  const path = savedViewRecordPath(collection, viewId)
  if (!path) return null
  try {
    return asRecordRead(await db.read(path)).value?.banner ?? null
  } catch {
    return null
  }
}
