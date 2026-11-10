import type { DbRecord } from '@biu/type-file-system'
import {
  DEFAULT_RECORD_LAYOUT_ID,
  DEFAULT_RECORD_PROP_VIEW_ID,
  parseRecordLayouts,
  parseRecordSandboxes,
  uniqueViewName,
  type RecordSandboxView,
} from '@biu/type-file-system/record-views'
import { TAGS_COLLECTION_PATH, PAGES_COLLECTION_PATH } from './database-path.ts'
import { normalizeCollectionPath } from '../paths.ts'
import {
  copyRecordLayout,
  deleteRecordLayout,
  getActiveRecordLayout,
  listedRecordLayouts,
  patchActiveRecordLayout,
  setActiveRecordLayoutId,
  subscribeRecordLayouts,
} from './record-layouts.ts'
import { getTagPresentMode, setTagPresentMode, subscribeTagPresent, TAG_TABLE_VIEW_ID } from './tag-present.ts'
import { copyTagSandboxView, createTagSandboxView, deleteTagSandboxView, getTagViews, subscribeTagViews } from './tag-views.ts'

export const VIEW_CATALOG_HOSTS_KEY = '__biuViewCatalogHosts'

export const VIEW_CATALOG_KEYS = ['views', 'propViews', 'layouts'] as const
export type ViewCatalogFieldKey = (typeof VIEW_CATALOG_KEYS)[number]

export type ViewCatalogIcon = 'doc' | 'outline' | 'table' | 'source' | 'sandbox' | 'layout' | 'props'

export type ViewCatalogOption = { id: string; name: string; icon: ViewCatalogIcon; builtin?: boolean }

export type ViewCatalogHost = {
  options: (record: DbRecord, fieldKey: ViewCatalogFieldKey) => ViewCatalogOption[]
  selectedId: (record: DbRecord, fieldKey: ViewCatalogFieldKey) => string
  select: (record: DbRecord, fieldKey: ViewCatalogFieldKey, id: string) => void
  copy?: (record: DbRecord, fieldKey: ViewCatalogFieldKey, id: string) => void | Promise<unknown>
  remove?: (record: DbRecord, fieldKey: ViewCatalogFieldKey, id: string) => void | Promise<unknown>
  subscribe?: (fn: () => void) => () => void
}

const PAGE_CONTENT_BUILTINS: ViewCatalogOption[] = [
  { id: 'doc', name: '文档', icon: 'doc', builtin: true },
  { id: 'outline', name: '大纲', icon: 'outline', builtin: true },
  { id: 'table', name: '表格', icon: 'table', builtin: true },
  { id: 'source', name: '源码', icon: 'source', builtin: true },
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

function named(items: Array<Partial<ViewCatalogOption> & { id: string; name: string }>): ViewCatalogOption[] {
  const out: ViewCatalogOption[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const id = String(item.id ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      name: String(item.name ?? '').trim() || id,
      icon: item.icon ?? 'sandbox',
      builtin: Boolean(item.builtin),
    })
  }
  return out
}

function withBuiltin(builtin: ViewCatalogOption, rest: ViewCatalogOption[]) {
  return named([builtin, ...rest.filter((item) => item.id !== builtin.id)])
}

function contentIcon(id: string): ViewCatalogIcon {
  if (id === 'outline') return 'outline'
  if (id === 'table') return 'table'
  if (id === 'source') return 'source'
  if (id === 'doc') return 'doc'
  return 'sandbox'
}

function defaultOptions(collectionPath: string, record: DbRecord, fieldKey: ViewCatalogFieldKey): ViewCatalogOption[] {
  const path = normalizeCollectionPath(collectionPath)
  if (fieldKey === 'layouts') {
    return withBuiltin(
      { id: DEFAULT_RECORD_LAYOUT_ID, name: '默认视图', icon: 'layout', builtin: true },
      parseRecordLayouts(record.layouts).map((item) => ({ id: item.id, name: item.name, icon: 'layout' as const })),
    )
  }
  if (fieldKey === 'propViews') {
    return withBuiltin(
      { id: DEFAULT_RECORD_PROP_VIEW_ID, name: '表格', icon: 'table', builtin: true },
      parseRecordSandboxes(record.propViews).map((item) => ({ id: item.id, name: item.name, icon: 'props' as const })),
    )
  }
  if (path === TAGS_COLLECTION_PATH) {
    const live = getTagViews(String(record.id ?? ''))
    const listed = live.length ? live : parseRecordSandboxes(record.views)
    return withBuiltin(
      { id: TAG_TABLE_VIEW_ID, name: '表格', icon: 'table', builtin: true },
      listed.map((item) => ({ id: item.id, name: item.name, icon: 'sandbox' as const })),
    )
  }
  const sandboxes = parseRecordSandboxes(record.views).map((item) => ({
    id: item.id,
    name: item.name,
    icon: 'sandbox' as const,
  }))
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
  return options.find((item) => item.id === id) ?? options[0] ?? (id ? { id, name: id, icon: contentIcon(id) } : null)
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

function fallbackContent(path: string) {
  return path === TAGS_COLLECTION_PATH ? 'table' : 'doc'
}

function newSandbox(name: string, taken: string[], prefix: string, recordId: string): RecordSandboxView {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  return {
    id,
    name: uniqueViewName(name, taken),
    kind: 'sandbox',
    file: `${prefix}-${recordId}-${id}.jsx`,
    dataFile: `${prefix}-data-${recordId}-${id}.json`,
  }
}

async function writeRecordCatalog(
  collectionPath: string,
  recordId: string,
  fieldKey: 'views' | 'propViews' | 'layouts',
  value: unknown,
) {
  const res = await fetch('/api/db/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: `${collectionPath}/${recordId}`, content: { [fieldKey]: JSON.stringify(value) } }),
  })
  if (!res.ok) return false
  window.dispatchEvent(new Event('fsdb:change'))
  return true
}

async function defaultCopy(collectionPath: string, record: DbRecord, fieldKey: ViewCatalogFieldKey, viewId: string) {
  const path = normalizeCollectionPath(collectionPath)
  const id = String(record.id ?? '').trim()
  const target = String(viewId ?? '').trim()
  if (!path || !id || !target) return
  if (fieldKey === 'layouts') {
    const listed = listedRecordLayouts(path, id, fallbackContent(path))
    const source = listed.find((item) => item.id === target)
    await copyRecordLayout(path, id, source, fallbackContent(path))
    return
  }
  if (path === TAGS_COLLECTION_PATH && fieldKey === 'views') {
    if (target === TAG_TABLE_VIEW_ID) await createTagSandboxView(id, String(record.title ?? ''), '表格 副本')
    else await copyTagSandboxView(id, target, String(record.title ?? ''))
    return
  }
  const key = fieldKey === 'propViews' ? 'propViews' : 'views'
  const listed = parseRecordSandboxes(record[key])
  const source = listed.find((item) => item.id === target)
  const view = newSandbox(
    `${source?.name || (fieldKey === 'propViews' ? '表格' : '新视图')} 副本`,
    listed.map((item) => item.name),
    fieldKey === 'propViews' ? 'prop-view' : 'view',
    id,
  )
  const ok = await writeRecordCatalog(path, id, key, [...listed, view])
  if (ok) defaultSelect(path, record, fieldKey, view.id)
}

async function defaultRemove(collectionPath: string, record: DbRecord, fieldKey: ViewCatalogFieldKey, viewId: string) {
  const path = normalizeCollectionPath(collectionPath)
  const id = String(record.id ?? '').trim()
  const target = String(viewId ?? '').trim()
  if (!path || !id || !target) return
  const current = listViewCatalogOptions(path, record, fieldKey).find((item) => item.id === target)
  if (current?.builtin) return
  if (fieldKey === 'layouts') {
    await deleteRecordLayout(path, id, target, fallbackContent(path))
    return
  }
  if (path === TAGS_COLLECTION_PATH && fieldKey === 'views') {
    await deleteTagSandboxView(id, target)
    return
  }
  const key = fieldKey === 'propViews' ? 'propViews' : 'views'
  const listed = parseRecordSandboxes(record[key]).filter((item) => item.id !== target)
  const ok = await writeRecordCatalog(path, id, key, listed)
  if (!ok) return
  if (selectedViewCatalogId(path, record, fieldKey) === target) {
    defaultSelect(path, record, fieldKey, fieldKey === 'propViews' ? DEFAULT_RECORD_PROP_VIEW_ID : listed[0]?.id ?? 'doc')
  }
}

export function canCopyViewCatalogItem(fieldKey: string, item: { builtin?: boolean }) {
  if (item.builtin) return false
  return fieldKey === 'views' || fieldKey === 'propViews'
}

export function copyViewCatalog(collectionPath: string, record: DbRecord, fieldKey: string, viewId: string) {
  if (!isViewCatalogField(fieldKey)) return
  const option = listViewCatalogOptions(collectionPath, record, fieldKey).find((item) => item.id === viewId)
  if (!option || !canCopyViewCatalogItem(fieldKey, option)) return
  const host = hostFor(collectionPath)
  if (host?.copy) {
    void host.copy(record, fieldKey, viewId)
    return
  }
  void defaultCopy(collectionPath, record, fieldKey, viewId)
}

export function deleteViewCatalog(collectionPath: string, record: DbRecord, fieldKey: string, viewId: string) {
  if (!isViewCatalogField(fieldKey)) return
  const host = hostFor(collectionPath)
  if (host?.remove) {
    void host.remove(record, fieldKey, viewId)
    return
  }
  void defaultRemove(collectionPath, record, fieldKey, viewId)
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
