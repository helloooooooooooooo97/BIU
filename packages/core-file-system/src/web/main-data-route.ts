import { readStorageString, writeStorageString } from '@biu/biu-ui/client-storage'
import { DATA_MODULE_PATH } from './database-path.ts'

export const MAIN_DATA_ROUTE_KEY = 'fsdb.mainRoute'

export function isMainDataRoute(pathname: string) {
  return pathname.startsWith(`${DATA_MODULE_PATH}/`)
}

export function readMainDataRoute() {
  try {
    const raw = readStorageString(MAIN_DATA_ROUTE_KEY, { scope: 'workspace' }) ?? ''
    return isMainDataRoute(raw) ? raw : ''
  } catch {
    return ''
  }
}

/** 代理页点小人：回到上次数据路由，没有就进页面表。 */
export function overlayDataRoute() {
  return readMainDataRoute() || `${DATA_MODULE_PATH}/pages`
}

export function writeMainDataRoute(pathname: string) {
  try {
    if (!isMainDataRoute(pathname)) return
    writeStorageString(MAIN_DATA_ROUTE_KEY, pathname, { scope: 'workspace' })
  } catch {
    /* ignore */
  }
}
