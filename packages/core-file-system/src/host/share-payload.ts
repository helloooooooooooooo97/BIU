import type { CollectionSchema, CollectionSchemaPack, Database, DbRecord } from '@biu/type-file-system'
import { normalizeSchemaValue } from '@biu/type-file-system'
import { collectAssetNames } from './assets-store.ts'
import type { SavedViewsStore } from './saved-views.ts'
import { freezeSchema, type ShareSnapshot } from '../share-snapshot.ts'
import { collectShareResources } from '../share-resources.ts'
import type { ShareRecord } from './shares-store.ts'
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

function withResources(
  snap: Omit<ShareSnapshot, 'resources' | 'pluginIds' | 'sharePlugins' | 'allowCopy'>,
  share: ShareRecord,
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
    owner: (() => {
      const profile = asPublicProfile()
      return profile.name || profile.avatar ? { name: profile.displayName, avatar: profile.avatar } : undefined
    })(),
  }
}

export type ShareSnapshotOpts = {
  contentIds?: readonly string[] | 'all'
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

export async function buildShareSnapshot(
  db: Pick<Database, 'stat' | 'list' | 'read' | 'content'> & { tags?: { list: () => CollectionSchemaPack[] } },
  _savedViews: SavedViewsStore,
  share: ShareRecord,
  _opts?: ShareSnapshotOpts,
): Promise<ShareSnapshot> {
  const stat = asStat(await db.stat(share.collection))
  if (stat.kind !== 'collection' || !stat.schema) throw new Error('unknown collection')
  const schema = freezeSchema(stat.schema)
  const collectionLabel = String(stat.view?.title ?? stat.label ?? share.collection.replace(/^\//, ''))
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
  throw new Error('unsupported share kind')
}
