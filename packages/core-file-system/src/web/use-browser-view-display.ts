import { useCallback } from 'react'
import { normalizeSorts, resolveViewFilterTree, type FilterGroup, type SortRule } from '../query-logic.ts'
import type { ViewMode } from './fields.ts'
import { normalizeColumnSummaries, type ColumnSummaryOp } from './column-summary.ts'
import { normalizeColumnViews, type ColumnViewConfig } from './column-sandbox-model.ts'
import {
  normalizeColumnWidths,
  normalizeGroupConfig,
  normalizePageSize,
  type GroupConfig,
  type SavedView,
} from './saved-view.ts'

export type ViewDisplaySnapshot = {
  mode: ViewMode
  sortField: string
  sortDir: 'asc' | 'desc'
  sorts: SortRule[]
  filters: Record<string, string>
  filterTree: FilterGroup
  columnWidths: Record<string, number>
  columnSummaries: Record<string, ColumnSummaryOp>
  columnViews: Record<string, ColumnViewConfig>
  groupBy: string
  groupConfig: GroupConfig | undefined
  showTree: boolean
  wrapCells: boolean
  truncateCells: boolean
  freezeTitle: boolean
  freezeUntil: string
  query: string
  pageSize: number
}

export type ViewDisplayOverrides = Partial<
  Pick<ViewDisplaySnapshot, 'sorts' | 'groupBy' | 'wrapCells' | 'query' | 'pageSize'>
>

/**
 * Pure normalization of all display & query properties from a SavedView.
 * Single source of truth used across initial hydration, route sync, pending view commit, and view switching.
 */
export function extractViewDisplayState(
  view: SavedView,
  overrides?: ViewDisplayOverrides,
): ViewDisplaySnapshot {
  const query = overrides?.query ?? view.query ?? ''
  return {
    mode: view.mode,
    sortField: view.sortField,
    sortDir: view.sortDir,
    sorts: overrides?.sorts ?? normalizeSorts(view.sorts, view.sortField, view.sortDir),
    filters: view.filters,
    filterTree: resolveViewFilterTree(view),
    columnWidths: normalizeColumnWidths(view.columnWidths),
    columnSummaries: normalizeColumnSummaries(view.columnSummaries) ?? {},
    columnViews: normalizeColumnViews(view.columnViews) ?? {},
    groupBy: overrides?.groupBy ?? view.groupBy ?? '',
    groupConfig: normalizeGroupConfig(view.groupConfig),
    showTree: Boolean(view.tree),
    wrapCells: overrides?.wrapCells ?? Boolean(view.wrap),
    truncateCells: view.truncate !== false,
    freezeTitle: Boolean(view.freezeTitle),
    freezeUntil: view.freezeUntil ?? '',
    query,
    pageSize: overrides?.pageSize ?? normalizePageSize(view.pageSize),
  }
}

export type ViewDisplaySetters = {
  setMode: (v: ViewMode) => void
  setSortField: (v: string) => void
  setSortDir: (v: 'asc' | 'desc') => void
  setSorts: (v: SortRule[]) => void
  setFilters: (v: Record<string, string>) => void
  setFilterTree: (v: FilterGroup) => void
  setColumnKeys: (v: string[]) => void
  setColumnWidths: (v: Record<string, number>) => void
  setColumnSummaries: (v: Record<string, ColumnSummaryOp>) => void
  setColumnViews: (v: Record<string, ColumnViewConfig>) => void
  setGroupBy: (v: string) => void
  setGroupConfig: (v: GroupConfig | undefined) => void
  setShowTree: (v: boolean) => void
  setWrapCells: (v: boolean) => void
  setTruncateCells: (v: boolean) => void
  setFreezeTitle: (v: boolean) => void
  setFreezeUntil: (v: string) => void
  setQuery: (v: string) => void
  setFetchQuery: (v: string) => void
  setPageSize: (v: number) => void
}

/**
 * Returns a single atomic applier for all 19 view-display setters so every hydration /
 * route-switch / view-select path updates the exact same set of fields (including freezeTitle/freezeUntil).
 */
export function useViewDisplayApplier(setters: ViewDisplaySetters) {
  return useCallback(
    (view: SavedView, columns: string[], overrides?: ViewDisplayOverrides) => {
      const snap = extractViewDisplayState(view, overrides)
      setters.setMode(snap.mode)
      setters.setSortField(snap.sortField)
      setters.setSortDir(snap.sortDir)
      setters.setSorts(snap.sorts)
      setters.setFilters(snap.filters)
      setters.setFilterTree(snap.filterTree)
      setters.setColumnKeys(columns)
      setters.setColumnWidths(snap.columnWidths)
      setters.setColumnSummaries(snap.columnSummaries)
      setters.setColumnViews(snap.columnViews)
      setters.setGroupBy(snap.groupBy)
      setters.setGroupConfig(snap.groupConfig)
      setters.setShowTree(snap.showTree)
      setters.setWrapCells(snap.wrapCells)
      setters.setTruncateCells(snap.truncateCells)
      setters.setFreezeTitle(snap.freezeTitle)
      setters.setFreezeUntil(snap.freezeUntil)
      setters.setQuery(snap.query)
      setters.setFetchQuery(snap.query)
      setters.setPageSize(snap.pageSize)
    },
    // React state setters are referentially stable.
    [],
  )
}
