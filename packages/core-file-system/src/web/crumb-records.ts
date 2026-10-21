import type { DbRecord } from '@biu/type-file-system'
import { encodeListFilter, resolveViewFilterTree } from '../query-logic.ts'
import { listCollection } from './db-client.ts'
import { recordPreviewMascot } from './record-mark.tsx'
import { recordCrumbLabel, type Crumb, type CrumbChoice } from './sidebar-nav.ts'
import { crumbRecordLabel, recordPreviewEmoji } from './sidebar-preview.ts'
import { rememberRecords, viewForPath, type CrumbRecord } from './view-storage.ts'

export const CRUMB_RECORD_LIMIT = 40
export const CRUMB_QUERY_DEBOUNCE_MS = 180

function rowToCrumb(row: DbRecord, labelField?: string): CrumbRecord {
  return {
    id: String(row.id),
    label: crumbRecordLabel(row, labelField),
    emoji: recordPreviewEmoji(row),
    mascot: recordPreviewMascot(row),
  }
}

export function recordChoicesFromRows(crumb: Crumb, rows: CrumbRecord[]): CrumbChoice[] {
  const collection = crumb.target.kind === 'record' ? crumb.target.collection : ''
  const viewId = crumb.target.kind === 'record' ? crumb.target.viewId : undefined
  const listed = rows.some((row) => row.id === crumb.id)
    ? rows
    : [{ id: crumb.id, label: crumb.label, emoji: crumb.emoji, mascot: crumb.mascot }, ...rows]
  return listed.map((row) => ({
    id: row.id,
    label: recordCrumbLabel(row.label, row.id),
    icon: crumb.icon,
    emoji: row.emoji,
    mascot: row.mascot,
    target: { kind: 'record', collection, recordId: row.id, viewId },
  }))
}

/** 面包屑记录菜单：拉一页最新（或按关键字搜），空查询才写回记录缓存。 */
export async function pullCrumbRecords(opts: {
  collection: string
  viewId?: string
  query?: string
}): Promise<CrumbRecord[]> {
  const collection = String(opts.collection ?? '').trim()
  if (!collection) return []
  const query = String(opts.query ?? '').trim()
  const view = viewForPath(collection, opts.viewId)
  const listed = await listCollection({
    path: collection,
    limit: CRUMB_RECORD_LIMIT,
    offset: 0,
    query: query || view?.query || '',
    sortField: view?.sortField || 'title',
    sortDir: view?.sortDir,
    sorts: view?.sorts,
    filters: encodeListFilter(view?.filters ?? {}, resolveViewFilterTree(view ?? { filters: {} })),
    columns: [...new Set(['id', 'title', 'name', 'emoji', 'mascot', view?.sortField || 'title'].filter(Boolean))],
    fresh: true,
  })
  const labelField = listed.schema?.labelField
  const rows = listed.items.map((row) => rowToCrumb(row, labelField))
  if (!query) {
    rememberRecords(collection, rows, opts.viewId)
    window.dispatchEvent(new Event('fsdb:crumb-labels'))
  }
  return rows
}

export function delayCrumbQuery(fn: () => void, ms = CRUMB_QUERY_DEBOUNCE_MS) {
  const timer = window.setTimeout(fn, ms)
  return () => window.clearTimeout(timer)
}
