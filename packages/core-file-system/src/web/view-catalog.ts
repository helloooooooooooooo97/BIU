import type { ComponentType } from 'react'
import type { DbRecord } from '@biu/type-file-system'
import {
  DEFAULT_RECORD_LAYOUT_ID,
  DEFAULT_RECORD_PROP_VIEW_ID,
  HIDDEN_CONTENT_VIEW_ID,
  HIDDEN_CONTENT_VIEW_LABEL,
  SOURCE_RECORD_PROP_VIEW_ID,
  SOURCE_RECORD_PROP_VIEW_LABEL,
  parseRecordLayouts,
  parseRecordSandboxes,
} from '@biu/type-file-system/record-views'
import { getDatabaseUi } from './database-ui.ts'
import { TAGS_COLLECTION_PATH, PAGES_COLLECTION_PATH } from './database-path.ts'
import { AGENTS_COLLECTION_PATH, normalizeCollectionPath, splitResourcePath } from '../paths.ts'
import {
  copyRecordLayout,
  deleteRecordLayout,
  getActiveRecordLayout,
  listedRecordLayouts,
  patchActiveRecordLayout,
  setActiveRecordLayoutId,
  subscribeRecordLayouts,
} from './record-layouts.ts'
import { subscribeTagPresent, TAG_TABLE_VIEW_ID } from './tag-present.ts'
import { copyTagSandboxView, createTagSandboxView, deleteTagSandboxView, getTagViews, subscribeTagViews } from './tag-views.ts'
import { createRecordSandboxView } from './record-sandboxes.ts'

export const VIEW_CATALOG_HOSTS_KEY = '__biuViewCatalogHosts'

export const VIEW_CATALOG_KEYS = ['views', 'propViews', 'layouts'] as const
export type ViewCatalogFieldKey = (typeof VIEW_CATALOG_KEYS)[number]

export type ViewCatalogIcon = 'doc' | 'outline' | 'table' | 'source' | 'hidden' | 'sandbox' | 'layout' | 'props'

export type ViewCatalogOption = {
  id: string
  name: string
  icon?: ViewCatalogIcon
  Icon?: ComponentType<{ className?: string }>
  builtin?: boolean
}

export type ViewCatalogHost = {
  options: (record: DbRecord, fieldKey: ViewCatalogFieldKey) => ViewCatalogOption[]
  selectedId: (record: DbRecord, fieldKey: ViewCatalogFieldKey) => string
  select: (record: DbRecord, fieldKey: ViewCatalogFieldKey, id: string) => void
  copy?: (record: DbRecord, fieldKey: ViewCatalogFieldKey, id: string) => void | Promise<unknown>
  remove?: (record: DbRecord, fieldKey: ViewCatalogFieldKey, id: string) => void | Promise<unknown>
  subscribe?: (fn: () => void) => () => void
}

const BUILTIN_CONTENT_NAMES: Record<string, string> = {
  [HIDDEN_CONTENT_VIEW_ID]: HIDDEN_CONTENT_VIEW_LABEL,
  doc: '文档',
  outline: '大纲',
  table: '表格',
  source: '源码',
  chat: '聊天',
}

function catalogName(id: string, name?: string) {
  if (BUILTIN_CONTENT_NAMES[id]) return BUILTIN_CONTENT_NAMES[id]
  const next = String(name ?? '').trim()
  return next || id
}

function collectionOf(path: string) {
  const normalized = normalizeCollectionPath(path)
  return splitResourcePath(normalized)?.collection ?? normalized
}

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
      name: catalogName(id, item.name),
      icon: item.Icon ? item.icon : item.icon ?? (BUILTIN_CONTENT_NAMES[id] ? contentIcon(id) : 'sandbox'),
      Icon: item.Icon,
      builtin: Boolean(item.builtin) || Boolean(BUILTIN_CONTENT_NAMES[id]),
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
  if (id === 'hidden') return 'hidden'
  if (id === 'doc') return 'doc'
  return 'sandbox'
}

const EDITOR_CONTENT_FALLBACK: ViewCatalogOption[] = [
  { id: 'doc', name: '文档', icon: 'doc', builtin: true },
  { id: 'outline', name: '大纲', icon: 'outline', builtin: true },
  { id: 'table', name: '表格', icon: 'table', builtin: true },
  { id: 'source', name: '源码', icon: 'source', builtin: true },
]

function registeredContent(path: string): ViewCatalogOption[] {
  const views = getDatabaseUi()?.contentViews(path) ?? []
  if (views.length) {
    return views.map((item) => ({
      id: item.id,
      name: catalogName(item.id, item.label),
      Icon: item.Icon,
      builtin: true,
    }))
  }
  if (path === AGENTS_COLLECTION_PATH) {
    return [{ id: 'chat', name: '聊天', builtin: true }]
  }
  return EDITOR_CONTENT_FALLBACK
}

function defaultOptions(collectionPath: string, record: DbRecord, fieldKey: ViewCatalogFieldKey): ViewCatalogOption[] {
  const path = collectionOf(collectionPath)
  if (fieldKey === 'layouts') {
    return withBuiltin(
      { id: DEFAULT_RECORD_LAYOUT_ID, name: '默认视图', icon: 'layout', builtin: true },
      parseRecordLayouts(record.layouts).map((item) => ({
        id: item.id,
        name: item.name,
        icon: item.kind === 'sandbox' ? ('sandbox' as const) : ('layout' as const),
      })),
    )
  }
  if (fieldKey === 'propViews') {
    const listed = parseRecordSandboxes(record.propViews).map((item) => ({
      id: item.id,
      name: item.name,
      icon: 'sandbox' as const,
    }))
    if (path === PAGES_COLLECTION_PATH) {
      return named([
        { id: DEFAULT_RECORD_PROP_VIEW_ID, name: '表格', icon: 'table', builtin: true },
        { id: SOURCE_RECORD_PROP_VIEW_ID, name: SOURCE_RECORD_PROP_VIEW_LABEL, icon: 'source', builtin: true },
        { id: 'hidden', name: '隐藏', icon: 'hidden', builtin: true },
        ...listed,
      ])
    }
    return named([
      { id: DEFAULT_RECORD_PROP_VIEW_ID, name: '表格', icon: 'table', builtin: true },
      { id: SOURCE_RECORD_PROP_VIEW_ID, name: SOURCE_RECORD_PROP_VIEW_LABEL, icon: 'source', builtin: true },
      ...listed,
    ])
  }
  const liveTag = path === TAGS_COLLECTION_PATH ? getTagViews(String(record.id ?? '')) : []
  const sandboxes = (liveTag.length ? liveTag : parseRecordSandboxes(record.views)).map((item) => ({
    id: item.id,
    name: item.name,
    icon: 'sandbox' as const,
  }))
  return named([
    ...registeredContent(path),
    { id: HIDDEN_CONTENT_VIEW_ID, name: HIDDEN_CONTENT_VIEW_LABEL, icon: 'hidden', builtin: true },
    ...sandboxes,
  ])
}

function defaultSelected(collectionPath: string, record: DbRecord, fieldKey: ViewCatalogFieldKey) {
  const path = collectionOf(collectionPath)
  const id = String(record.id ?? '').trim()
  const layout = getActiveRecordLayout(path, id, path === TAGS_COLLECTION_PATH ? 'table' : 'doc')
  if (fieldKey === 'layouts') return layout.id
  if (fieldKey === 'propViews') return layout.propViewId || DEFAULT_RECORD_PROP_VIEW_ID
  return layout.contentViewId
}

function defaultSelect(collectionPath: string, record: DbRecord, fieldKey: ViewCatalogFieldKey, viewId: string) {
  const path = collectionOf(collectionPath)
  const id = String(record.id ?? '').trim()
  const next = String(viewId ?? '').trim()
  if (!path || !id || !next) return
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
  const host = hostFor(collectionOf(collectionPath))
  const fromHost = host ? named(host.options(record, fieldKey) ?? []) : []
  if (fromHost.length) return fromHost
  return defaultOptions(collectionPath, record, fieldKey)
}

export function selectedViewCatalogId(collectionPath: string, record: DbRecord, fieldKey: string) {
  if (!isViewCatalogField(fieldKey)) return ''
  const host = hostFor(collectionOf(collectionPath))
  const id = host ? host.selectedId(record, fieldKey) : defaultSelected(collectionPath, record, fieldKey)
  return String(id ?? '').trim()
}

export function selectedViewCatalogOption(collectionPath: string, record: DbRecord, fieldKey: string) {
  const options = listViewCatalogOptions(collectionPath, record, fieldKey)
  const id = selectedViewCatalogId(collectionPath, record, fieldKey)
  return (
    options.find((item) => item.id === id) ??
    options[0] ??
    (id ? { id, name: catalogName(id), icon: contentIcon(id), builtin: Boolean(BUILTIN_CONTENT_NAMES[id]) } : null)
  )
}

export function selectViewCatalog(collectionPath: string, record: DbRecord, fieldKey: string, viewId: string) {
  if (!isViewCatalogField(fieldKey)) return
  const host = hostFor(collectionOf(collectionPath))
  if (host) {
    host.select(record, fieldKey, viewId)
    return
  }
  defaultSelect(collectionPath, record, fieldKey, viewId)
}

function fallbackContent(path: string) {
  return path === TAGS_COLLECTION_PATH ? 'table' : 'doc'
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
  const view = await createRecordSandboxView({
    collectionPath: path,
    recordId: id,
    fieldKey: key,
    listed,
    name: `${source?.name || (fieldKey === 'propViews' ? '表格' : '新视图')} 副本`,
    title: String(record.title ?? ''),
    source,
  })
  defaultSelect(path, record, fieldKey, view.id)
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

const CONTENT_BUILTIN_IDS = new Set(['doc', 'outline', 'table', 'source', 'hidden', 'chat'])

export function canCopyViewCatalogItem(fieldKey: string, item: { id?: string; builtin?: boolean }) {
  if (fieldKey !== 'views' && fieldKey !== 'propViews') return false
  const id = String(item.id ?? '').trim()
  if (!id) return false
  if (item.builtin) return false
  if (fieldKey === 'views' && (CONTENT_BUILTIN_IDS.has(id) || id === TAG_TABLE_VIEW_ID)) return false
  if (fieldKey === 'propViews' && (id === DEFAULT_RECORD_PROP_VIEW_ID || id === 'table' || id === SOURCE_RECORD_PROP_VIEW_ID || id === 'hidden')) return false
  return true
}

export function copyViewCatalog(collectionPath: string, record: DbRecord, fieldKey: string, viewId: string) {
  if (!isViewCatalogField(fieldKey)) return
  const option = listViewCatalogOptions(collectionPath, record, fieldKey).find((item) => item.id === viewId)
  if (!option || !canCopyViewCatalogItem(fieldKey, option)) return
  const host = hostFor(collectionOf(collectionPath))
  if (host?.copy) {
    void host.copy(record, fieldKey, viewId)
    return
  }
  void defaultCopy(collectionPath, record, fieldKey, viewId)
}

export function deleteViewCatalog(collectionPath: string, record: DbRecord, fieldKey: string, viewId: string) {
  if (!isViewCatalogField(fieldKey)) return
  const host = hostFor(collectionOf(collectionPath))
  if (host?.remove) {
    void host.remove(record, fieldKey, viewId)
    return
  }
  void defaultRemove(collectionPath, record, fieldKey, viewId)
}

export function subscribeViewCatalog(collectionPath: string, fn: () => void) {
  const host = hostFor(collectionOf(collectionPath))
  const offUi = getDatabaseUi()?.subscribe(fn)
  if (host?.subscribe) {
    const offHost = host.subscribe(fn)
    return () => {
      offHost()
      offUi?.()
    }
  }
  const offLayouts = subscribeRecordLayouts(fn)
  const offPresent = subscribeTagPresent(fn)
  const offViews = subscribeTagViews(fn)
  return () => {
    offLayouts()
    offPresent()
    offViews()
    offUi?.()
  }
}
