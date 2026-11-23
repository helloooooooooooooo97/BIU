import { useCallback, useReducer, type Dispatch, type SetStateAction } from 'react'
import {
  normalizeColumnWidths,
  normalizeGroupConfig,
  normalizePageSize,
  type GroupConfig,
  type SavedView,
  type ViewMode,
} from './saved-view.ts'
import { normalizeColumnSummaries, type ColumnSummaryOp } from './column-summary.ts'
import { normalizeColumnViews, type ColumnViewConfig } from './column-sandbox-model.ts'
import {
  normalizeSorts,
  resolveViewFilterTree,
  type FilterGroup,
  type SortRule,
} from '../query-logic.ts'

export interface BrowserViewConfigState {
  pageSize: number
  fetchQuery: string
  mode: ViewMode
  sortField: string
  sortDir: 'asc' | 'desc'
  sorts: SortRule[]
  filters: Record<string, string>
  filterTree: FilterGroup
  columnKeys: string[]
  columnWidths: Record<string, number>
  columnSummaries: Record<string, ColumnSummaryOp>
  columnViews: Record<string, ColumnViewConfig>
  wrapCells: boolean
  truncateCells: boolean
  freezeTitle: boolean
  freezeUntil: string
  groupBy: string
  groupConfig: GroupConfig | undefined
  showTree: boolean
}

export type BrowserViewConfigAction =
  | {
      type: 'SET'
      key: keyof BrowserViewConfigState
      value: SetStateAction<BrowserViewConfigState[keyof BrowserViewConfigState]>
    }
  | {
      type: 'PATCH'
      patch: Partial<BrowserViewConfigState>
    }

export function browserViewConfigReducer(
  state: BrowserViewConfigState,
  action: BrowserViewConfigAction,
): BrowserViewConfigState {
  if (action.type === 'PATCH') {
    let changed = false
    for (const key of Object.keys(action.patch) as Array<keyof BrowserViewConfigState>) {
      if (!Object.is(state[key], action.patch[key])) {
        changed = true
        break
      }
    }
    return changed ? { ...state, ...action.patch } : state
  }
  const prev = state[action.key]
  const next =
    typeof action.value === 'function'
      ? (action.value as (p: unknown) => unknown)(prev)
      : action.value
  if (Object.is(prev, next)) return state
  return { ...state, [action.key]: next }
}

export function createInitialViewConfig(
  initialView: SavedView | undefined,
  initialColumns: string[],
): BrowserViewConfigState {
  return {
    pageSize: normalizePageSize(initialView?.pageSize),
    fetchQuery: initialView?.query ?? '',
    mode: initialView?.mode ?? 'table',
    sortField: initialView?.sortField ?? 'title',
    sortDir: initialView?.sortDir ?? 'asc',
    sorts: normalizeSorts(initialView?.sorts, initialView?.sortField ?? 'title', initialView?.sortDir ?? 'asc'),
    filters: initialView?.filters ?? {},
    filterTree: resolveViewFilterTree(initialView ?? { filters: {} }),
    columnKeys: initialColumns,
    columnWidths: normalizeColumnWidths(initialView?.columnWidths),
    columnSummaries: normalizeColumnSummaries(initialView?.columnSummaries) ?? {},
    columnViews: normalizeColumnViews(initialView?.columnViews) ?? {},
    wrapCells: !!initialView?.wrap,
    truncateCells: initialView?.truncate !== false,
    freezeTitle: Boolean(initialView?.freezeTitle),
    freezeUntil: initialView?.freezeUntil ?? '',
    groupBy: initialView?.groupBy ?? '',
    groupConfig: normalizeGroupConfig(initialView?.groupConfig),
    showTree: Boolean(initialView?.tree),
  }
}

/**
 * Consolidates 19 separate SavedView display/query `useState` hooks into one atomic `useReducer`,
 * preventing partial-update intermediate states when switching views or syncing remote updates.
 */
export function useBrowserViewConfig(
  initialView: SavedView | undefined,
  initialColumns: string[],
) {
  const [state, dispatch] = useReducer(
    browserViewConfigReducer,
    { initialView, initialColumns },
    ({ initialView: v, initialColumns: cols }) => createInitialViewConfig(v, cols),
  )

  const patchViewConfig = useCallback((patch: Partial<BrowserViewConfigState>) => {
    dispatch({ type: 'PATCH', patch })
  }, [])

  const makeSetter = <K extends keyof BrowserViewConfigState>(
    key: K,
  ): Dispatch<SetStateAction<BrowserViewConfigState[K]>> =>
    useCallback(
      (value: SetStateAction<BrowserViewConfigState[K]>) => {
        dispatch({
          type: 'SET',
          key,
          value: value as SetStateAction<BrowserViewConfigState[keyof BrowserViewConfigState]>,
        })
      },
      [key],
    )

  const setPageSize = makeSetter('pageSize')
  const setFetchQuery = makeSetter('fetchQuery')
  const setMode = makeSetter('mode')
  const setSortField = makeSetter('sortField')
  const setSortDir = makeSetter('sortDir')
  const setSorts = makeSetter('sorts')
  const setFilters = makeSetter('filters')
  const setFilterTree = makeSetter('filterTree')
  const setColumnKeys = makeSetter('columnKeys')
  const setColumnWidths = makeSetter('columnWidths')
  const setColumnSummaries = makeSetter('columnSummaries')
  const setColumnViews = makeSetter('columnViews')
  const setWrapCells = makeSetter('wrapCells')
  const setTruncateCells = makeSetter('truncateCells')
  const setFreezeTitle = makeSetter('freezeTitle')
  const setFreezeUntil = makeSetter('freezeUntil')
  const setGroupBy = makeSetter('groupBy')
  const setGroupConfig = makeSetter('groupConfig')
  const setShowTree = makeSetter('showTree')

  return {
    viewConfig: state,
    patchViewConfig,
    pageSize: state.pageSize,
    setPageSize,
    fetchQuery: state.fetchQuery,
    setFetchQuery,
    mode: state.mode,
    setMode,
    sortField: state.sortField,
    setSortField,
    sortDir: state.sortDir,
    setSortDir,
    sorts: state.sorts,
    setSorts,
    filters: state.filters,
    setFilters,
    filterTree: state.filterTree,
    setFilterTree,
    columnKeys: state.columnKeys,
    setColumnKeys,
    columnWidths: state.columnWidths,
    setColumnWidths,
    columnSummaries: state.columnSummaries,
    setColumnSummaries,
    columnViews: state.columnViews,
    setColumnViews,
    wrapCells: state.wrapCells,
    setWrapCells,
    truncateCells: state.truncateCells,
    setTruncateCells,
    freezeTitle: state.freezeTitle,
    setFreezeTitle,
    freezeUntil: state.freezeUntil,
    setFreezeUntil,
    groupBy: state.groupBy,
    setGroupBy,
    groupConfig: state.groupConfig,
    setGroupConfig,
    showTree: state.showTree,
    setShowTree,
  }
}
