import type { CollectionSchema, CollectionSchemaPack, DbRecord } from '@biu/type-file-system'
import { matchListFilterRecord, type FilterGroup } from './query-logic.ts'
import { viewShareListFilter } from './share-view-match.ts'

export type DataScopeName = 'personal' | 'workspace' | 'shared'
export type ViewGrantRole = 'viewer' | 'commenter' | 'editor' | 'manager' | 'owner'

export function recordMatchesAccessRule(
  record: DbRecord,
  filterTree: FilterGroup | Record<string, unknown> | null | undefined,
  schema?: CollectionSchema,
  packs: CollectionSchemaPack[] = [],
) {
  const filters = filterTree && typeof filterTree === 'object'
    ? viewShareListFilter({ filterTree: filterTree as FilterGroup })
    : undefined
  return matchListFilterRecord(record, filters, schema, packs)
}
