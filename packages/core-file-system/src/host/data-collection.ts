import type { CollectionSpec, DbRecord } from '@biu/type-file-system'
import { actionVisibleToUser, recordBuiltinValues } from '@biu/type-file-system'
import { parseStampRecordId, stampRecordId } from './tags-collection.ts'
import { normalizeCollectionPath } from '../paths.ts'
import { DATA_COLLECTION_PATH, DATA_MODULE_ID, TAGS_COLLECTION_PATH, isIndexCollection, isSystemCollection } from '../paths.ts'
import { matchActionWhen } from '../shared/fields.ts'

export function overviewActionIds(spec: Pick<CollectionSpec, 'actions'>, row: DbRecord): string[] {
  return (spec.actions ?? [])
    .filter((action) => {
      const places = action.placement ?? ['row', 'detail']
      if (!places.includes('row') || !actionVisibleToUser(action)) return false
      return matchActionWhen(row, action.when)
    })
    .map((action) => action.id)
}

export function isDataOverviewSource(path: string) {
  if (path === DATA_COLLECTION_PATH) return false
  if (isSystemCollection(path)) return false
  if (isIndexCollection(path) && normalizeCollectionPath(path) !== TAGS_COLLECTION_PATH) return false
  return true
}

export function overviewRecord(
  spec: Pick<CollectionSpec, 'path' | 'label' | 'id' | 'actions'> & {
    view?: { icon?: string; title?: string } | null
  },
  row: DbRecord,
): DbRecord {
  const sourceId = String(row.id ?? '')
  return {
    ...row,
    id: stampRecordId(spec.path, sourceId),
    title: String(row.title ?? sourceId),
    table: spec.view?.title ?? spec.label ?? spec.id,
    tablePath: spec.path,
    tableIcon: spec.view?.icon,
    sourceId,
    actionIds: overviewActionIds(spec, row),
    ...recordBuiltinValues({
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      emoji: row.emoji,
      tag: row.tag,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    }),
  }
}

export function dataCollection(tables: () => CollectionSpec[]): CollectionSpec {
  const sources = () => tables().filter((item) => isDataOverviewSource(item.path))

  return {
    id: 'data',
    path: DATA_COLLECTION_PATH,
    label: '数据',
    view: {
      moduleId: DATA_MODULE_ID,
      route: DATA_COLLECTION_PATH,
      title: '数据',
      inspector: true,
      order: 0,
      icon: 'circle-stack',
    },
    records: { update: true },
    schema: {
      columns: ['title', 'actions', 'table'],
      fields: {
        title: { type: 'string', label: '标题', writable: true },
        table: { type: 'select', label: '来源表', computed: true },
        tablePath: { type: 'string', label: '表路径', computed: true },
        sourceId: { type: 'string', label: '记录', computed: true },
      },
    },
    list: () => [],
    get: async (id) => {
      const stamp = parseStampRecordId(id)
      if (!stamp) return null
      const spec = sources().find((item) => item.path === stamp.collection)
      if (!spec) return null
      const row = await spec.get(stamp.recordId)
      return row ? overviewRecord(spec, row) : null
    },
    update: async (id, patch) => {
      const stamp = parseStampRecordId(id)
      if (!stamp) throw new Error(`unknown record: ${id}`)
      const spec = sources().find((item) => item.path === stamp.collection)
      if (!spec) throw new Error(`unknown record: ${id}`)
      if (!spec.update) throw new Error(`collection cannot update: ${spec.path}`)
      const written = await spec.update(stamp.recordId, patch)
      return overviewRecord(spec, written)
    },
  }
}
