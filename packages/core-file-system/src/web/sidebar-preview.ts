import type { CollectionSchema, DbRecord } from '@biu/type-file-system'
import { isBuiltinBlockKindViewId, isBuiltinTagViewId } from '../catalog-views.ts'
import type { SavedView } from './saved-view.ts'
import { listCollection, readJson } from './db-client.ts'
import { viewForPath } from './view-storage.ts'

export const SIDEBAR_PREVIEW_PAGE = 20
export const SIDEBAR_PREVIEW_MAX = 100
export const VIEW_TOTAL_IDLE_MS = 2800
export const VIEW_PREVIEW_IDLE_MS = 800

let paintedListReady = false

export function resetPaintedListReady() {
  paintedListReady = false
}

export function markPaintedListReady() {
  paintedListReady = true
}

export function isPaintedListReady() {
  return paintedListReady
}

/** 侧栏预览等首屏 list 画完再拉，避免和主表抢同一轮 /api/db/list。 */
export function whenListIdle(fn: () => void, idleMs = VIEW_PREVIEW_IDLE_MS) {
  let cancelled = false
  let timer = 0
  const run = () => {
    if (!cancelled) fn()
  }
  if (typeof window === 'undefined') {
    run()
    return () => {
      cancelled = true
    }
  }
  if (paintedListReady) {
    timer = window.setTimeout(run, idleMs)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }
  const onReady = () => {
    window.removeEventListener('fsdb:list-ready', onReady)
    timer = window.setTimeout(run, idleMs)
  }
  window.addEventListener('fsdb:list-ready', onReady)
  return () => {
    cancelled = true
    window.clearTimeout(timer)
    window.removeEventListener('fsdb:list-ready', onReady)
  }
}

export type PreviewPage = {
  items: DbRecord[]
  total: number
  schema?: CollectionSchema
}

export function previewCacheKey(path: string, view: Pick<SavedView, 'id' | 'sortField' | 'sortDir' | 'filters' | 'query' | 'groupBy'>) {
  return `${path}\0${view.id}\0${view.sortField}\0${view.sortDir}\0${view.groupBy ?? ''}\0${JSON.stringify(view.filters ?? {})}\0${view.query ?? ''}`
}

export function normalizeRecordEmoji(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return [...text].slice(0, 2).join('')
}

export function recordPreviewEmoji(row: DbRecord) {
  return normalizeRecordEmoji(row.emoji)
}

export function recordPreviewLabel(row: DbRecord, labelField?: string) {
  if (labelField) {
    const labeled = row[labelField]
    if (labeled != null && String(labeled).trim()) return String(labeled)
  }
  for (const key of ['title', 'name', 'label']) {
    const value = row[key]
    if (value != null && String(value).trim()) return String(value)
  }
  return String(row.id)
}

/** 面包屑与列表共用：labelField 若是 id，改走 title/name，避免只显示编号。 */
export function crumbRecordLabel(row: DbRecord, labelField?: string) {
  return recordPreviewLabel(row, labelField && labelField !== 'id' ? labelField : undefined)
}

export function nextPreviewLimit(loaded: number, total: number) {
  if (loaded >= total) return 0
  return Math.min(SIDEBAR_PREVIEW_PAGE, SIDEBAR_PREVIEW_MAX - loaded, total - loaded)
}

const totalCache = new Map<string, number>()
const totalListeners = new Set<() => void>()
let totalsVersion = 0

export function rememberPreviewTotal(key: string, total: number) {
  if (totalCache.get(key) === total) return
  totalCache.set(key, total)
  totalsVersion += 1
  for (const fn of totalListeners) fn()
}

export function invalidatePreviewTotals() {
  totalCache.clear()
  totalsVersion += 1
  for (const fn of totalListeners) fn()
}

/** Drop sibling-view counts for this table so they refetch; keep the open view’s bumped total. */
export function forgetPreviewTotalsForPath(path: string, keepPrefix?: string) {
  const prefix = `${path}\0`
  let dropped = false
  for (const key of [...totalCache.keys()]) {
    if (key !== path && !key.startsWith(prefix)) continue
    if (keepPrefix && (key === keepPrefix || key.startsWith(keepPrefix))) continue
    totalCache.delete(key)
    dropped = true
  }
  if (!dropped) return
  totalsVersion += 1
  for (const fn of totalListeners) fn()
}

export function rememberPreviewTotalForView(path: string, viewId: string | null | undefined, total: number) {
  const id = String(viewId ?? '')
  const keepPrefix = id ? `${path}\0${id}\0` : ''
  let hit = false
  if (keepPrefix) {
    for (const key of [...totalCache.keys()]) {
      if (!key.startsWith(keepPrefix)) continue
      rememberPreviewTotal(key, total)
      hit = true
    }
  }
  if (!hit && id) {
    const view = viewForPath(path, id)
    if (view) rememberPreviewTotal(viewTotalKey(path, view), total)
  }
}

export function getPreviewTotalsVersion() {
  return totalsVersion
}

export function getPreviewTotal(key: string) {
  return totalCache.get(key)
}

export function subscribePreviewTotals(fn: () => void) {
  totalListeners.add(fn)
  return () => {
    totalListeners.delete(fn)
  }
}

export function viewTotalKey(path: string, view: Pick<SavedView, 'id' | 'sortField' | 'sortDir' | 'filters' | 'query'>) {
  return previewCacheKey(path, view)
}

function isCurrentView(opts: {
  path: string
  view: Pick<SavedView, 'id'>
  collectionPath: string
  activeViewId?: string | null
}) {
  return opts.path === opts.collectionPath && opts.view.id === opts.activeViewId
}

/** 块类型/标签内置视图很多，只给当前正在看的那一条拉总数。当前表的活动视图由 list 自己写入。 */
export function shouldFetchViewTotal(opts: {
  path: string
  view: Pick<SavedView, 'id'>
  collectionPath: string
  activeViewId?: string | null
}) {
  const current = isCurrentView(opts)
  if (isBuiltinBlockKindViewId(opts.view.id) || isBuiltinTagViewId(opts.view.id)) return current
  return !current
}

/** 当前表已经拉过这一页，侧栏展开不再另开一次 list。 */
export function shouldFetchViewPreview(opts: {
  path: string
  view: Pick<SavedView, 'id'>
  collectionPath: string
  activeViewId?: string | null
}) {
  return !isCurrentView(opts)
}

export function orderViewTotalJobs<T extends { path: string }>(jobs: T[], collectionPath: string) {
  return jobs
    .map((job, index) => ({ job, index }))
    .sort((a, b) => {
      const diff = Number(a.job.path !== collectionPath) - Number(b.job.path !== collectionPath)
      return diff !== 0 ? diff : a.index - b.index
    })
    .map((item) => item.job)
}

export async function fetchViewTotal(
  path: string,
  view: Pick<SavedView, 'id' | 'sortField' | 'sortDir' | 'filters' | 'query'>,
) {
  const key = viewTotalKey(path, view)
  const cached = totalCache.get(key)
  if (cached != null) return cached
  const page = await fetchViewPreview(path, view, 0, 1)
  rememberPreviewTotal(key, page.total)
  return page.total
}

export async function writeRecordEmoji(path: string, recordId: string, emoji: string) {
  const next = normalizeRecordEmoji(emoji)
  const body = await readJson<{ value?: DbRecord }>('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `${path}/${recordId}`, content: { emoji: next } }),
  })
  return normalizeRecordEmoji(body.value?.emoji ?? next)
}

export function previewColumns(view: Pick<SavedView, 'groupBy'>) {
  const columns = ['title', 'emoji', 'mascot', 'parentId']
  const groupBy = String(view.groupBy ?? '').trim()
  if (groupBy && !columns.includes(groupBy)) columns.push(groupBy)
  return columns
}

export async function fetchViewPreview(
  path: string,
  view: Pick<SavedView, 'sortField' | 'sortDir' | 'filters' | 'query' | 'groupBy'>,
  offset: number,
  limit = SIDEBAR_PREVIEW_PAGE,
): Promise<PreviewPage> {
  return listCollection({
    path,
    limit: Math.min(limit, SIDEBAR_PREVIEW_PAGE),
    offset,
    query: view.query,
    sortField: view.sortField,
    sortDir: view.sortDir,
    filters: view.filters,
    columns: previewColumns(view),
  })
}
