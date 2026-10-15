import type { DbRecord } from '@biu/type-file-system'
import { stubAnyBuiltinView } from './catalog-views.ts'
import {
  encodeListFilter,
  matchListFilterRecord,
  resolveViewFilterTree,
  type FilterGroup,
} from './query-logic.ts'
import type { DataScopeName } from './view-access.ts'

export type SharedViewDef = {
  id: string
  name?: string
  filters?: Record<string, unknown>
  filterTree?: FilterGroup | null
  builtin?: boolean
}

/** 和分享页快照同一套筛选，避免列上的命中和链接里列出的记录对不上。 */
export function viewShareListFilter(view: {
  filters?: Record<string, unknown>
  filterTree?: unknown
  builtin?: boolean
}) {
  const filters: Record<string, string> = {}
  for (const [key, value] of Object.entries(view.filters ?? {})) {
    if (key === '$tree' || value == null || typeof value === 'object') continue
    filters[key] = String(value)
  }
  return encodeListFilter(
    filters,
    resolveViewFilterTree({
      builtin: view.builtin,
      filters,
      filterTree: view.filterTree as FilterGroup | null | undefined,
    }),
  )
}

export function resolveSharedView(viewId: string, saved: SharedViewDef[]): SharedViewDef | null {
  const id = String(viewId ?? '').trim()
  if (!id) return null
  const stored = saved.find((view) => view.id === id)
  if (stored) return stored
  return stubAnyBuiltinView(id, saved as Parameters<typeof stubAnyBuiltinView>[1])
}

export function recordMatchesSharedView(
  record: DbRecord,
  view: SharedViewDef,
  storedScope: DataScopeName,
) {
  const declared = view.filters?.$scope
  const scope = declared === 'personal' || declared === 'workspace' || declared === 'shared' ? declared : ''
  if (scope && storedScope !== scope) return false
  return matchListFilterRecord(record, viewShareListFilter(view))
}
