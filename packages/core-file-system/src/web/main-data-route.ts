import { parseAppPath } from '@biu/web-session-view'
import { DATA_MODULE, DATA_MODULE_PATH } from './database-path.ts'

export const MAIN_DATA_ROUTE_KEY = 'fsdb.mainRoute'

export function isMainDataRoute(pathname: string) {
  return pathname.startsWith(`${DATA_MODULE_PATH}/`)
}

export function readMainDataRoute() {
  try {
    const raw = localStorage.getItem(MAIN_DATA_ROUTE_KEY) ?? ''
    return isMainDataRoute(raw) ? raw : ''
  } catch {
    return ''
  }
}

export function writeMainDataRoute(pathname: string) {
  try {
    if (!isMainDataRoute(pathname)) return
    localStorage.setItem(MAIN_DATA_ROUTE_KEY, pathname)
  } catch {
    /* ignore */
  }
}

export function pickMainDataRoute(stored: string, tables: Array<{ path: string }>) {
  if (!isMainDataRoute(stored) || !tables.length) return ''
  const parsed = parseAppPath(stored, [DATA_MODULE])
  const collection =
    parsed.kind === 'collection-view' || parsed.kind === 'record' ? parsed.collection : ''
  if (!collection || !tables.some((item) => item.path === collection)) return ''
  return stored
}
