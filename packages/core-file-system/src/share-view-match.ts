import type { CollectionSchema, CollectionSchemaPack, DbRecord } from '@biu/type-file-system'
import { stubAnyBuiltinView } from './catalog-views.ts'
import {
  encodeListFilter,
  looksLikeFilterTree,
  matchListFilterRecord,
  normalizeFilterGroup,
  resolveViewFilterTree,
  type FilterGroup,
} from './query-logic.ts'
import type { DataScopeName } from './view-access.ts'

export type SharedViewDef = {
  id: string
  name?: string
  filters?: Record<string, unknown>
  filterTree?: FilterGroup | null
  columns?: string[]
  builtin?: boolean
}

/** 和分享页快照同一套筛选，避免列上的命中和链接里列出的记录对不上。 */
function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string' || !value.trim()) return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function asFilterMap(value: unknown): Record<string, unknown> {
  const parsed = parseMaybeJson(value)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !looksLikeFilterTree(parsed)) {
    return parsed as Record<string, unknown>
  }
  return {}
}

function asFilterTree(value: unknown): FilterGroup | null {
  const parsed = parseMaybeJson(value)
  if (!looksLikeFilterTree(parsed)) return null
  return normalizeFilterGroup(parsed)
}

export function viewShareListFilter(view: {
  filters?: Record<string, unknown>
  filterTree?: unknown
  builtin?: boolean
}) {
  const raw = asFilterMap(view.filters)
  const filters: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key === '$tree' || key === '$scope' || key === '$ids' || value == null || typeof value === 'object') continue
    filters[key] = String(value)
  }
  const filterTree = asFilterTree(view.filterTree) ?? asFilterTree(raw.$tree) ?? asFilterTree(view.filters)
  return encodeListFilter(
    filters,
    resolveViewFilterTree({
      builtin: view.builtin,
      filters,
      filterTree,
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
  schema?: CollectionSchema,
  packs: CollectionSchemaPack[] = [],
) {
  const declared = view.filters?.$scope
  const scope = declared === 'personal' || declared === 'workspace' || declared === 'shared' ? declared : ''
  if (scope && storedScope !== scope) return false
  return matchListFilterRecord(record, viewShareListFilter(view), schema, packs)
}
