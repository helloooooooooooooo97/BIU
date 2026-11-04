import type { CollectionSpec, CollectionInfo, DbRecord } from '@biu/type-file-system'
import { actionVisibleToUser, REQUIRED_RECORD_FIELDS, recordBuiltinValues } from '@biu/type-file-system'
import { parseStampRecordId, stampRecordId } from './tags-collection.ts'
import { normalizeCollectionPath } from '../paths.ts'
import { DATA_COLLECTION_PATH, TAGS_COLLECTION_PATH, isIndexCollection, isSystemCollection } from '../web/database-path.ts'
import { matchActionWhen } from '../web/fields.ts'

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
  spec: Pick<CollectionInfo, 'path' | 'label' | 'id'> & {
    view?: { icon?: string; title?: string } | null
    actions?: CollectionSpec['actions']
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
    records: {},
    schema: {
      labelField: 'title',
      columns: ['title', 'actions', 'table'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '标题' },
        table: { type: 'string', label: '来源表', computed: true },
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
  }
}
