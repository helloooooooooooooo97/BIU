import { useCallback, useReducer, type Dispatch, type SetStateAction } from 'react'
import type { DbRecord } from '@biu/type-file-system'

export type DetailBodyStatus = 'loading' | 'ready' | 'failed'

export interface BrowserDetailState<TOriginNav = unknown> {
  openDetailId: string | null
  detailRow: DbRecord | null
  originNav: TOriginNav | null
  detailBody: unknown
  detailBodyStatus: DetailBodyStatus
  detailBodyError: string
  draft: Record<string, string>
  acting: boolean
}

type DetailAction<TOriginNav> =
  | {
      type: 'SET'
      key: keyof BrowserDetailState<TOriginNav>
      value: SetStateAction<BrowserDetailState<TOriginNav>[keyof BrowserDetailState<TOriginNav>]>
    }
  | {
      type: 'PATCH'
      patch: Partial<BrowserDetailState<TOriginNav>>
    }

export function createInitialDetailState<TOriginNav = unknown>(
  routeRecordId: string | null,
): BrowserDetailState<TOriginNav> {
  return {
    openDetailId: routeRecordId,
    detailRow: null,
    originNav: null,
    detailBody: null,
    detailBodyStatus: 'loading',
    detailBodyError: '',
    draft: {},
    acting: false,
  }
}

export function browserDetailReducer<TOriginNav>(
  state: BrowserDetailState<TOriginNav>,
  action: DetailAction<TOriginNav>,
): BrowserDetailState<TOriginNav> {
  if (action.type === 'PATCH') {
    let changed = false
    for (const key of Object.keys(action.patch) as Array<keyof BrowserDetailState<TOriginNav>>) {
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

/**
 * Consolidates 8 record-detail `useState` hooks out of CollectionBrowser into a single
 * reducer with reference-preserving no-op checks and atomic multi-field updates.
 */
export function useBrowserDetailState<TOriginNav = unknown>(routeRecordId: string | null) {
  const [state, dispatch] = useReducer(
    browserDetailReducer<TOriginNav>,
    routeRecordId,
    createInitialDetailState<TOriginNav>,
  )

  const patchDetailState = useCallback((patch: Partial<BrowserDetailState<TOriginNav>>) => {
    dispatch({ type: 'PATCH', patch })
  }, [])

  const makeSetter = <K extends keyof BrowserDetailState<TOriginNav>>(
    key: K,
  ): Dispatch<SetStateAction<BrowserDetailState<TOriginNav>[K]>> =>
    useCallback(
      (value: SetStateAction<BrowserDetailState<TOriginNav>[K]>) => {
        dispatch({
          type: 'SET',
          key,
          value: value as SetStateAction<
            BrowserDetailState<TOriginNav>[keyof BrowserDetailState<TOriginNav>]
          >,
        })
      },
      [key],
    )

  const setOpenDetailId = makeSetter('openDetailId')
  const setDetailRow = makeSetter('detailRow')
  const setOriginNav = makeSetter('originNav')
  const setDetailBody = makeSetter('detailBody')
  const setDetailBodyStatus = makeSetter('detailBodyStatus')
  const setDetailBodyError = makeSetter('detailBodyError')
  const setDraft = makeSetter('draft')
  const setActing = makeSetter('acting')

  return {
    detailState: state,
    patchDetailState,
    openDetailId: state.openDetailId,
    setOpenDetailId,
    detailRow: state.detailRow,
    setDetailRow,
    originNav: state.originNav,
    setOriginNav,
    detailBody: state.detailBody,
    setDetailBody,
    detailBodyStatus: state.detailBodyStatus,
    setDetailBodyStatus,
    detailBodyError: state.detailBodyError,
    setDetailBodyError,
    draft: state.draft,
    setDraft,
    acting: state.acting,
    setActing,
  }
}
