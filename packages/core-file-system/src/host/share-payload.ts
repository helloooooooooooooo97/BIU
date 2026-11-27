import type { CollectionSchema, CollectionSchemaPack, Database, DbRecord } from '@biu/type-file-system'
import { asPerson, normalizeSchemaValue } from '@biu/type-file-system'
import { collectAssetNames } from './assets-store.ts'
import type { SavedViewsStore, StoredView } from './saved-views.ts'
import { freezeSchema, type ShareSnapshot } from '../share-snapshot.ts'
import { collectShareResources } from '../share-resources.ts'
import type { ShareRecord, SharesStore } from './shares-store.ts'
import { VIEWS_COLLECTION_PATH, normalizeCollectionPath } from '../paths.ts'
import { matchListFilterRecord, sortRecordsBy } from '../query-logic.ts'
import { asPublicProfile } from '@biu/host-workspace'

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

function resolveShareOwner(
  snap: Omit<ShareSnapshot, 'resources' | 'pluginIds' | 'sharePlugins' | 'allowCopy'>,
  share: ShareRecord,
  opts?: ShareSnapshotOpts,
): ShareSnapshot['owner'] {
  const wsId = share.workspaceId || opts?.workspaceId || ''
  let creatorAccountId = ''
  let creatorName = ''
  if (snap.kind === 'record') {
    const primary = snap.records[0]
    const rawCreatedBy = primary?.createdBy
    if (typeof rawCreatedBy === 'string' && rawCreatedBy.trim()) {
      creatorAccountId = rawCreatedBy.trim()
    } else {
      const person = asPerson(rawCreatedBy)
      if (person?.kind === 'user') {
        creatorAccountId = person.accountId?.trim() || ''
        creatorName = person.name?.trim() || ''
      }
    }
  } else if (snap.kind === 'view') {
    const viewCreator = typeof snap.view?.createdBy === 'string' ? snap.view.createdBy.trim() : ''
    if (viewCreator) creatorAccountId = viewCreator
  }
  if (!creatorAccountId && share.createdBy) {
    creatorAccountId = share.createdBy.trim()
  }
  if (creatorAccountId && opts?.collabStore?.publicMemberProfile) {
    const member = opts.collabStore.publicMemberProfile(wsId, creatorAccountId)
    if (member && (member.name || member.avatar)) {
      return {
        accountId: member.accountId,
        name: member.name || creatorName || '分享者',
        avatar: member.avatar,
      }
    }
  }
  if (creatorName || creatorAccountId) {
    return {
      ...(creatorAccountId ? { accountId: creatorAccountId } : {}),
      name: creatorName || '分享者',
      avatar: '',
    }
  }
  const profile = asPublicProfile()
  return profile.name || profile.avatar ? { name: profile.displayName, avatar: profile.avatar } : undefined
}

function withResources(
  snap: Omit<ShareSnapshot, 'resources' | 'pluginIds' | 'sharePlugins' | 'allowCopy'>,
  share: ShareRecord,
  opts?: ShareSnapshotOpts,
): ShareSnapshot {
  const resources = collectShareResources(snap.records, snap.contents, {
    skipIds: snap.records.map((row) => String(row.id)),
    includeRecords: false,
  })
  return {
    ...snap,
    resources: { pages: resources.pages, plugins: resources.plugins, collections: resources.collections },
    pluginIds: resources.pluginIds,
    sharePlugins: share.sharePlugins,
    allowCopy: share.allowCopy,
    owner: resolveShareOwner(snap, share, opts),
  }
}

export type ShareCollabStore = {
  collectionInheritedSources?(
    workspaceId: string,
    collection: string,
    directKeys: ReadonlySet<string>,
  ): Map<string, { collection: string; recordId: string }>
  collectInheritingDescendants?(
    workspaceId: string,
    collection: string,
    rootRecordId: string,
    maxCount?: number,
  ): Array<{ collection: string; recordId: string; parentCollection: string; parentRecordId: string }>
  publicMemberProfile?(
    workspaceId: string,
    accountId: string,
  ): { accountId: string; name: string; avatar: string } | null
}

export type ShareSnapshotOpts = {
  contentIds?: readonly string[] | 'all'
  shares?: SharesStore
  collabStore?: ShareCollabStore
  workspaceId?: string
  /** 本机空间无多成员权限边界：局域网分享视图时直接包含当前视图命中的全部记录；云端默认 false，保持零泄露交集。 */
  includeAllViewRecords?: boolean
}

export function collectEffectivePublicRecordIds(
  shares: Pick<SharesStore, 'listRecords'> & Partial<Pick<SharesStore, 'list'>> | undefined,
  targetCollection: string,
  workspaceId: string | undefined,
  collabStore?: ShareCollabStore,
): Set<string> {
  const ids = new Set<string>()
  if (!shares) return ids
  const directKeys = new Set<string>()
  const allShares = typeof shares.list === 'function'
    ? shares.list().filter((item) => item.kind === 'record')
    : shares.listRecords(targetCollection)
  for (const item of allShares) {
    if (workspaceId && item.workspaceId && item.workspaceId !== workspaceId) continue
    const recordId = String(item.recordId ?? '').trim()
    if (!recordId) continue
    const shareCol = item.collection || targetCollection
    directKeys.add(`${shareCol}\t${recordId}`)
    if (shareCol === targetCollection) ids.add(recordId)
  }
  if (collabStore?.collectionInheritedSources && workspaceId && directKeys.size > 0) {
    const inherited = collabStore.collectionInheritedSources(workspaceId, targetCollection, directKeys)
    for (const recordId of inherited.keys()) {
      ids.add(recordId)
    }
  }
  return ids
}

function shareTagCatalog(
  db: { tags?: { list: () => CollectionSchemaPack[] } },
  records: DbRecord[],
): CollectionSchemaPack[] {
  const catalog = db.tags?.list() ?? []
  if (!catalog.length) return []
  const used = new Set<string>()
  for (const row of records) {
    for (const id of normalizeSchemaValue(row.tag).tags) used.add(id)
  }
  if (!used.size) return []
  return catalog.filter((tag) => used.has(tag.id))
}

export function parseViewShareRecordId(recordId: string): { targetCollection: string; viewId: string } | null {
  const raw = String(recordId ?? '').trim()
  const cut = raw.indexOf('::')
  if (cut <= 0) return null
  const table = raw.slice(0, cut).trim().replace(/^\/+/, '')
  const viewId = raw.slice(cut + 2).trim()
  if (!table || !viewId) return null
  return { targetCollection: normalizeCollectionPath(`/${table}`), viewId }
}

function viewFilterObject(view: StoredView): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...(view.filters ?? {}) }
  delete filter.$scope
  if (view.filterTree) filter.$tree = view.filterTree
  return filter
}

function matchesViewRow(
  row: DbRecord,
  view: StoredView,
  schema: CollectionSchema | undefined,
  packs: CollectionSchemaPack[],
): boolean {
  const filter = viewFilterObject(view)
  if (!matchListFilterRecord(row, filter, schema, packs)) return false
  const q = String(view.query ?? '').trim().toLowerCase()
  if (q) {
    const title = String(row.title ?? row.name ?? row.id ?? '').toLowerCase()
    if (!title.includes(q)) return false
  }
  return true
}

const SHARE_VIEW_MAX_RECORDS = 5000

async function listAllViewRows(
  db: Pick<Database, 'list'>,
  targetCollection: string,
  view: StoredView,
): Promise<{ items: DbRecord[]; total: number }> {
  const filter = viewFilterObject(view)
  const filterArg = Object.keys(filter).length ? filter : undefined
  const queryOpt = view.query ? { q: view.query } : {}
  const items: DbRecord[] = []
  let offset = 0
  let total = 0
  while (items.length < SHARE_VIEW_MAX_RECORDS) {
    const listed = (await db.list(targetCollection, filterArg, {
      ...queryOpt,
      limit: 200,
      offset,
    })) as { items?: DbRecord[]; total?: number }
    const page = listed.items ?? []
    if (typeof listed.total === 'number') total = listed.total
    if (!page.length) break
    items.push(...page)
    offset += page.length
    if (total > 0 && items.length >= total) break
    if (page.length < 200) break
  }
  return {
    items: items.slice(0, SHARE_VIEW_MAX_RECORDS),
    total: total > 0 ? total : items.length,
  }
}

/**
 * 计算视图外链的透明预览计数：
 * - 云端空间（includeAllViewRecords = false）：当前操作者可见命中数 N，以及其中有效公开的记录数 M。
 * - 本机空间（includeAllViewRecords = true）：无多成员权限边界，局域网分享直接包含当前视图命中的全部 N 条记录。
 */
export async function computeViewPublicStats(
  db: Pick<Database, 'stat' | 'list'> & { tags?: { list: () => CollectionSchemaPack[] } },
  savedViews: SavedViewsStore,
  shares: SharesStore,
  viewRecordId: string,
  accountId = '',
  workspaceId?: string,
  collabStore?: ShareCollabStore,
  includeAllViewRecords = false,
): Promise<{ matchedCount: number; publicCount: number } | null> {
  const parsed = parseViewShareRecordId(viewRecordId)
  if (!parsed) return null
  const { targetCollection, viewId } = parsed
  const view = savedViews.viewsFor(targetCollection, accountId, workspaceId).find((v) => String(v.id) === viewId)
  if (!view) return null
  const listed = await listAllViewRows(db, targetCollection, view)
  const matchedCount = listed.total
  if (includeAllViewRecords) {
    return { matchedCount, publicCount: matchedCount }
  }
  const publicIds = collectEffectivePublicRecordIds(shares, targetCollection, workspaceId, collabStore)
  let publicCount = 0
  for (const row of listed.items) {
    if (publicIds.has(String(row.id ?? ''))) publicCount += 1
  }
  return {
    matchedCount,
    publicCount,
  }
}

export async function buildShareSnapshot(
  db: Pick<Database, 'stat' | 'list' | 'read' | 'content'> & { tags?: { list: () => CollectionSchemaPack[] } },
  savedViews: SavedViewsStore,
  share: ShareRecord,
  opts?: ShareSnapshotOpts,
): Promise<ShareSnapshot> {
  // 视图外链：shares 中存储为 kind = 'record', collection = '/views', record_id = '<tableName>::<viewId>'
  // - 本机空间（opts.includeAllViewRecords = true）：无多成员权限边界，局域网分享直接返回当前视图命中的全部记录；
  // - 云端空间（默认 false）：零泄露交集「目标表中已单独开启公开链接的记录 ∩ 视图筛选条件」，绝不泄露未公开记录。
  if (share.kind === 'record' && normalizeCollectionPath(share.collection) === VIEWS_COLLECTION_PATH) {
    const parsed = parseViewShareRecordId(share.recordId)
    if (!parsed) throw new Error('unknown record')
    const { targetCollection, viewId } = parsed
    const views = savedViews.viewsFor(targetCollection, share.createdBy ?? '', share.workspaceId)
    const view = views.find((item) => String(item.id) === viewId)
    if (!view) throw new Error('unknown record')
    const targetStat = asStat(await db.stat(targetCollection))
    if (targetStat.kind !== 'collection' || !targetStat.schema) throw new Error('unknown collection')
    const schema = freezeSchema(targetStat.schema)
    const collectionLabel = String(targetStat.view?.title ?? targetStat.label ?? targetCollection.replace(/^\//, ''))
    const matchedRows: DbRecord[] = []
    if (opts?.includeAllViewRecords) {
      const listed = await listAllViewRows(db, targetCollection, view)
      matchedRows.push(...listed.items)
    } else {
      const publicRecordIds = collectEffectivePublicRecordIds(
        opts?.shares,
        targetCollection,
        share.workspaceId || opts?.workspaceId,
        opts?.collabStore,
      )
      const packs = db.tags?.list() ?? []
      for (const publicId of publicRecordIds) {
        if (!publicId) continue
        try {
          const got = asRecordRead(await db.read(`${targetCollection}/${publicId}`))
          const row = got.value
          if (!row?.id) continue
          if (!matchesViewRow(row, view, targetStat.schema, packs)) continue
          matchedRows.push(row)
        } catch {
          /* record removed or unreadable */
        }
      }
    }
    const sorted = sortRecordsBy(
      matchedRows,
      view.sorts?.length
        ? view.sorts
        : [{ id: `s:${view.sortField || 'updatedAt'}`, field: view.sortField || 'updatedAt', dir: view.sortDir === 'asc' ? 'asc' : 'desc' }],
    )
    const wantContentIds =
      opts?.contentIds === 'all'
        ? sorted.map((r) => String(r.id))
        : Array.isArray(opts?.contentIds)
          ? opts.contentIds
          : []
    const contents: Record<string, unknown> = {}
    const assetSet = new Set<string>()
    for (const row of sorted) {
      for (const name of collectAssetNames(row, null, row.banner)) assetSet.add(name)
      if (wantContentIds.includes(String(row.id))) {
        try {
          const content = asContentRead(await db.content(`${targetCollection}/${row.id}`)).value ?? null
          contents[String(row.id)] = content
          for (const name of collectAssetNames(row, content, row.banner)) assetSet.add(name)
        } catch {
          contents[String(row.id)] = null
        }
      }
    }
    const contentField = schema.contentField ?? 'notes'
    return withResources({
      kind: 'view',
      collection: targetCollection,
      viewId: view.id,
      recordId: share.recordId,
      title: String(view.name || collectionLabel),
      collectionLabel,
      schema,
      view,
      records: sorted.map((row) => audienceRecord({ ...row, [contentField]: undefined })),
      contents,
      assets: [...assetSet],
      tags: shareTagCatalog(db, sorted),
    }, share, opts)
  }

  const stat = asStat(await db.stat(share.collection))
  if (stat.kind !== 'collection' || !stat.schema) throw new Error('unknown collection')
  const schema = freezeSchema(stat.schema)
  const collectionLabel = String(stat.view?.title ?? stat.label ?? share.collection.replace(/^\//, ''))
  if (share.kind === 'record') {
    const got = asRecordRead(await db.read(`${share.collection}/${share.recordId}`))
    const record = got.value
    if (!record?.id) throw new Error('unknown record')
    const allRecords: DbRecord[] = [record]
    const seenIds = new Set<string>([String(record.id)])
    const wsId = share.workspaceId || opts?.workspaceId || ''
    if (wsId && opts?.collabStore?.collectInheritingDescendants) {
      const descendants = opts.collabStore.collectInheritingDescendants(wsId, share.collection, record.id)
      for (const desc of descendants) {
        if (desc.collection !== share.collection) continue
        if (seenIds.has(desc.recordId)) continue
        try {
          const childGot = asRecordRead(await db.read(`${desc.collection}/${desc.recordId}`))
          const child = childGot.value
          if (!child?.id) continue
          seenIds.add(String(child.id))
          allRecords.push(child)
        } catch {
          /* 子记录已删除或不可读时跳过 */
        }
      }
    }
    const wantContentIds =
      opts?.contentIds === 'all'
        ? allRecords.map((r) => String(r.id))
        : Array.isArray(opts?.contentIds)
          ? [...new Set([String(record.id), ...opts.contentIds.map((id) => String(id))])]
          : [String(record.id)]
    const contents: Record<string, unknown> = {}
    const assetSet = new Set<string>()
    for (const row of allRecords) {
      const id = String(row.id)
      for (const name of collectAssetNames(row, null, row.banner)) assetSet.add(name)
      if (wantContentIds.includes(id)) {
        try {
          const content = asContentRead(await db.content(`${share.collection}/${id}`)).value ?? null
          contents[id] = content
          for (const name of collectAssetNames(row, content, row.banner)) assetSet.add(name)
        } catch {
          contents[id] = null
        }
      }
    }
    const contentField = schema.contentField ?? 'notes'
    return withResources({
      kind: 'record',
      collection: share.collection,
      viewId: share.viewId,
      recordId: record.id,
      title: String(record.title ?? record.name ?? collectionLabel),
      collectionLabel,
      schema,
      records: allRecords.map((row) => audienceRecord({ ...row, [contentField]: undefined })),
      contents,
      assets: [...assetSet],
      banner: record.banner ?? null,
      tags: shareTagCatalog(db, allRecords),
    }, share, opts)
  }
  throw new Error('unsupported share kind')
}
