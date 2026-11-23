import { readStorageString, writeStorageString } from '@biu/biu-ui/client-storage'
import type { CollectionSchema, CollectionSchemaPack, DbRecord } from '@biu/type-file-system'
import { schemaSearchHaystack } from '@biu/type-file-system'
import {
  countFilterRules,
  encodeListFilter,
  matchListFilterRecord,
  normalizeSorts,
  parseTagFlatColumnKey,
  resolveViewFilterTree,
  sortRecordsBy,
  type FilterGroup,
  type SortRule,
} from '../query-logic.ts'
import { normalizePageSize, type SavedView } from './saved-view.ts'

export type ShareQueryState = {
  q: string
  sorts: SortRule[]
  filterTree: FilterGroup
  columns: string[]
  wrap: boolean
  truncate: boolean
  pageSize: number
}

export function shareQueryStorageKey(token: string) {
  return `fsdb.share.query:${token}`
}

function restoreShareColumns(parsed: unknown, fallback: string[]) {
  if (!Array.isArray(parsed)) return fallback
  const columns = parsed.filter((key): key is string => typeof key === 'string')
  const parsedHasTag = columns.some((key) => parseTagFlatColumnKey(key))
  const fallbackHasTag = fallback.some((key) => parseTagFlatColumnKey(key))
  if (fallbackHasTag && !parsedHasTag) return fallback
  return columns
}

export function shareQueryFromView(view?: Partial<SavedView>): ShareQueryState {
  return {
    q: String(view?.query ?? ''),
    sorts: normalizeSorts(view?.sorts, view?.sortField || 'title', view?.sortDir === 'desc' ? 'desc' : 'asc'),
    filterTree: resolveViewFilterTree({
      filters: view?.filters,
      filterTree: view?.filterTree,
    }),
    columns: Array.isArray(view?.columns) ? [...view.columns] : [],
    wrap: Boolean(view?.wrap),
    truncate: view?.truncate !== false,
    pageSize: normalizePageSize(view?.pageSize),
  }
}

export function loadShareQuery(token: string, fallback: ShareQueryState): ShareQueryState {
  try {
    const raw = readStorageString(shareQueryStorageKey(token))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<ShareQueryState>
    return {
      q: typeof parsed.q === 'string' ? parsed.q : fallback.q,
      sorts: Array.isArray(parsed.sorts) ? normalizeSorts(parsed.sorts, fallback.sorts[0]?.field, fallback.sorts[0]?.dir) : fallback.sorts,
      filterTree: parsed.filterTree ? resolveViewFilterTree({ filterTree: parsed.filterTree, filters: {} }) : fallback.filterTree,
      columns: restoreShareColumns(parsed.columns, fallback.columns),
      wrap: typeof parsed.wrap === 'boolean' ? parsed.wrap : fallback.wrap,
      truncate: typeof parsed.truncate === 'boolean' ? parsed.truncate : fallback.truncate,
      pageSize: normalizePageSize(parsed.pageSize ?? fallback.pageSize),
    }
  } catch {
    return fallback
  }
}

export function saveShareQuery(token: string, state: ShareQueryState) {
  try {
    writeStorageString(shareQueryStorageKey(token), JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function applyShareQuery(
  records: DbRecord[],
  schema: CollectionSchema,
  state: ShareQueryState,
  contents: Record<string, unknown> = {},
  packs: CollectionSchemaPack[] = [],
) {
  const filter = encodeListFilter({}, countFilterRules(state.filterTree) ? state.filterTree : undefined)
  const needle = state.q.trim().toLowerCase()
  const matched = records.filter((row) => {
    if (!matchListFilterRecord(row, filter, schema, packs)) return false
    if (!needle) return true
    const bits = [
      schemaSearchHaystack(row),
      ...Object.values(row).map((item) => (item == null ? '' : String(item))),
      schemaSearchHaystack(contents[row.id] ?? ''),
      typeof contents[row.id] === 'string' ? String(contents[row.id]) : '',
    ]
    return bits.join(' ').toLowerCase().includes(needle)
  })
  return sortRecordsBy(matched, state.sorts)
}
