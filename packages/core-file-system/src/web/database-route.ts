import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { parseAppPath } from '@biu/web-session-view'
import { builtinAllViewId } from '../catalog-views.ts'
import { DATA_COLLECTION_PATH, DATA_MODULE, DATA_MODULE_ID } from './database-path.ts'
import { pathForCenter } from './sidebar-nav.ts'

export type DatabaseOpen = {
  collection: string
  viewId?: string
  recordId?: string | null
}

export type DatabaseCenter =
  | { kind: 'overview'; collection: typeof DATA_COLLECTION_PATH; viewId: string; recordId: null }
  | { kind: 'collection'; collection: string; viewId: string; recordId: null }
  | { kind: 'record'; collection: string; viewId: string; recordId: string }
  | { kind: 'other'; collection: ''; viewId: undefined; recordId: null }

export function parseDatabaseCenter(pathname: string): DatabaseCenter {
  const parsed = parseAppPath(pathname, [DATA_MODULE])
  if (parsed.kind === 'module' && parsed.moduleId === DATA_MODULE_ID) {
    return {
      kind: 'overview',
      collection: DATA_COLLECTION_PATH,
      viewId: builtinAllViewId(DATA_COLLECTION_PATH),
      recordId: null,
    }
  }
  if (parsed.kind === 'record') {
    return {
      kind: 'record',
      collection: parsed.collection,
      viewId: parsed.viewId || builtinAllViewId(parsed.collection),
      recordId: parsed.recordId,
    }
  }
  if (parsed.kind === 'collection-view') {
    return {
      kind: 'collection',
      collection: parsed.collection,
      viewId: parsed.viewId || builtinAllViewId(parsed.collection),
      recordId: null,
    }
  }
  return { kind: 'other', collection: '', viewId: undefined, recordId: null }
}

export function databaseCenterHref(next: DatabaseOpen) {
  return pathForCenter({
    collection: next.collection,
    viewId: next.viewId,
    recordId: next.recordId ?? undefined,
  })
}

/** 数据中心只认 React Router 的 location。侧栏点一下就是 navigate，主区按 collection + viewId 换数。 */
export function useDatabaseCenter() {
  const location = useLocation()
  const navigate = useNavigate()
  const center = useMemo(() => parseDatabaseCenter(location.pathname), [location.pathname])
  const open = (next: DatabaseOpen, opts?: { replace?: boolean }) => {
    navigate(databaseCenterHref(next), opts)
  }
  return { ...center, pathname: location.pathname, search: location.search, open, navigate }
}
