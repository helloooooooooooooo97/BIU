import type { DbRecord } from '@biu/type-file-system'
import {
  DEFAULT_RECORD_LAYOUT_ID,
  DEFAULT_RECORD_PROP_VIEW_ID,
  parseRecordLayouts,
  parseRecordSandboxes,
} from '@biu/type-file-system/record-views'
import { TAGS_COLLECTION_PATH, PAGES_COLLECTION_PATH } from './database-path.ts'
import { normalizeCollectionPath } from '../paths.ts'
import {
  getActiveRecordLayout,
  patchActiveRecordLayout,
  setActiveRecordLayoutId,
  subscribeRecordLayouts,
} from './record-layouts.ts'
import { getTagPresentMode, setTagPresentMode, subscribeTagPresent, TAG_TABLE_VIEW_ID } from './tag-present.ts'
import { getTagViews, subscribeTagViews } from './tag-views.ts'

export const VIEW_CATALOG_HOSTS_KEY = '__biuViewCatalogHosts'

export const VIEW_CATALOG_KEYS = ['views', 'propViews', 'layouts'] as const
export type ViewCatalogFieldKey = (typeof VIEW_CATALOG_KEYS)[number]

export type ViewCatalogOption = { id: string; name: string }

export type ViewCatalogHost = {
  options: (record: DbRecord, fieldKey: ViewCatalogFieldKey) => ViewCatalogOption[]
  selectedId: (record: DbRecord, fieldKey: ViewCatalogFieldKey) => string
  select: (record: DbRecord, fieldKey: ViewCatalogFieldKey, id: string) => void
  subscribe?: (fn: () => void) => () => void
}

const PAGE_CONTENT_BUILTINS: ViewCatalogOption[] = [
  { id: 'doc', name: '文档' },
  { id: 'outline', name: '大纲' },
  { id: 'table', name: '表格' },
  { id: 'source', name: '源码' },
]

const hosts = new Map<string, ViewCatalogHost>()

function windowHosts(): Record<string, ViewCatalogHost> {
  if (typeof window === 'undefined') return {}
  const bag = (window as unknown as Record<string, unknown>)[VIEW_CATALOG_HOSTS_KEY]
  if (!bag || typeof bag !== 'object') return {}
  return bag as Record<string, ViewCatalogHost>
}

export function isViewCatalogField(key: string): key is ViewCatalogFieldKey {
  return key === 'views' || key === 'propViews' || key === 'layouts'
}

export function registerViewCatalogHost(path: string, host: ViewCatalogHost) {
  const key = normalizeCollectionPath(path)
  hosts.set(key, host)
  if (typeof window !== 'undefined') {
    const bag = { ...windowHosts(), [key]: host }
    ;(window as unknown as Record<string, unknown>)[VIEW_CATALOG_HOSTS_KEY] = bag
  }
  return () => {
    if (hosts.get(key) === host) hosts.delete(key)
    if (typeof window === 'undefined') return
    const bag = { ...windowHosts() }
    if (bag[key] === host) delete bag[key]
    ;(window as unknown as Record<string, unknown>)[VIEW_CATALOG_HOSTS_KEY] = bag
  }
}

function hostFor(path: string) {
  const key = normalizeCollectionPath(path)
  return hosts.get(key) ?? windowHosts()[key]
}

function named(items: Array<{ id: string; name: string }>): ViewCatalogOption[] {
  const out: ViewCatalogOption[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const id = String(item.id ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, name: String(item.name ?? '').trim() || id })
  }
  return out
}

function withBuiltin(builtin: ViewCatalogOption, rest: ViewCatalogOption[]) {
  return named([builtin, ...rest.filter((item) => item.id !== builtin.id)])
}

function defaultOptions(collectionPath: string, record: DbRecord, fieldKey: ViewCatalogFieldKey): ViewCatalogOption[] {
  const path = normalizeCollectionPath(collectionPath)
  if (fieldKey === 'layouts') {
    return withBuiltin(
      { id: DEFAULT_RECORD_LAYOUT_ID, name: '默认视图' },
      parseRecordLayouts(record.layouts).map((item) => ({ id: item.id, name: item.name })),
    )
  }
  if (fieldKey === 'propViews') {
    return withBuiltin(
      { id: DEFAULT_RECORD_PROP_VIEW_ID, name: '表格' },
      parseRecordSandboxes(record.propViews).map((item) => ({ id: item.id, name: item.name })),
    )
  }
  if (path === TAGS_COLLECTION_PATH) {
    const live = getTagViews(String(record.id ?? ''))
    const listed = live.length ? live : parseRecordSandboxes(record.views)
    return withBuiltin(
      { id: TAG_TABLE_VIEW_ID, name: '表格' },
      listed.map((item) => ({ id: item.id, name: item.name })),
    )
  }
  const sandboxes = parseRecordSandboxes(record.views).map((item) => ({ id: item.id, name: item.name }))
  if (path === PAGES_COLLECTION_PATH) return named([...PAGE_CONTENT_BUILTINS, ...sandboxes])
  return named(sandboxes)
}

function defaultSelected(collectionPath: string, record: DbRecord, fieldKey: ViewCatalogFieldKey) {
  const path = normalizeCollectionPath(collectionPath)
  const id = String(record.id ?? '').trim()
  if (path === TAGS_COLLECTION_PATH && fieldKey === 'views') return getTagPresentMode(id)
  const layout = getActiveRecordLayout(path, id, path === TAGS_COLLECTION_PATH ? 'table' : 'doc')
  if (fieldKey === 'layouts') return layout.id
  if (fieldKey === 'propViews') return layout.propViewId || DEFAULT_RECORD_PROP_VIEW_ID
  return layout.contentViewId
}

function defaultSelect(collectionPath: string, record: DbRecord, fieldKey: ViewCatalogFieldKey, viewId: string) {
  const path = normalizeCollectionPath(collectionPath)
  const id = String(record.id ?? '').trim()
  const next = String(viewId ?? '').trim()
  if (!path || !id || !next) return
  if (path === TAGS_COLLECTION_PATH && fieldKey === 'views') {
    setTagPresentMode(id, next)
    return
  }
  if (fieldKey === 'layouts') {
    setActiveRecordLayoutId(path, id, next)
    return
  }
  if (fieldKey === 'propViews') {
    void patchActiveRecordLayout(path, id, { propViewId: next }, path === TAGS_COLLECTION_PATH ? 'table' : 'doc')
    return
  }
  void patchActiveRecordLayout(path, id, { contentViewId: next }, path === TAGS_COLLECTION_PATH ? 'table' : 'doc')
}

export function listViewCatalogOptions(collectionPath: string, record: DbRecord, fieldKey: string): ViewCatalogOption[] {
  if (!isViewCatalogField(fieldKey)) return []
  const host = hostFor(collectionPath)
  if (host) return named(host.options(record, fieldKey))
  return defaultOptions(collectionPath, record, fieldKey)
}

export function selectedViewCatalogId(collectionPath: string, record: DbRecord, fieldKey: string) {
  if (!isViewCatalogField(fieldKey)) return ''
  const host = hostFor(collectionPath)
  const id = host ? host.selectedId(record, fieldKey) : defaultSelected(collectionPath, record, fieldKey)
  return String(id ?? '').trim()
}

export function selectedViewCatalogOption(collectionPath: string, record: DbRecord, fieldKey: string) {
  const options = listViewCatalogOptions(collectionPath, record, fieldKey)
  const id = selectedViewCatalogId(collectionPath, record, fieldKey)
  return options.find((item) => item.id === id) ?? options[0] ?? (id ? { id, name: id } : null)
}

export function selectViewCatalog(collectionPath: string, record: DbRecord, fieldKey: string, viewId: string) {
  if (!isViewCatalogField(fieldKey)) return
  const host = hostFor(collectionPath)
  if (host) {
    host.select(record, fieldKey, viewId)
    return
  }
  defaultSelect(collectionPath, record, fieldKey, viewId)
}

export function subscribeViewCatalog(collectionPath: string, fn: () => void) {
  const host = hostFor(collectionPath)
  if (host?.subscribe) return host.subscribe(fn)
  const offLayouts = subscribeRecordLayouts(fn)
  const offPresent = subscribeTagPresent(fn)
  const offViews = subscribeTagViews(fn)
  return () => {
    offLayouts()
    offPresent()
    offViews()
  }
}
