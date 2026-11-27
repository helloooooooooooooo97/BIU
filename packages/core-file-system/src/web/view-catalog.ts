import type { ComponentType } from 'react'
import type { DbRecord } from '@biu/type-file-system'
import {
  DEFAULT_RECORD_LAYOUT_ID,
  DEFAULT_RECORD_PROP_VIEW_ID,
  HIDDEN_CONTENT_VIEW_ID,
  HIDDEN_CONTENT_VIEW_LABEL,
  SOURCE_RECORD_PROP_VIEW_ID,
  SOURCE_RECORD_PROP_VIEW_LABEL,
  listedRecordLayouts as mergeRecordLayouts,
  parseRecordSandboxes,
} from '@biu/type-file-system/record-views'
import { getDatabaseUi } from './database-ui.ts'
import { normalizeCollectionPath, splitResourcePath } from '../paths.ts'
import {
  addRecordLayout,
  copyRecordLayout,
  deleteRecordLayout,
  getActiveRecordLayout,
  listedRecordLayouts,
  patchActiveRecordLayout,
  renameRecordLayout,
  setActiveRecordLayoutId,
  subscribeRecordLayouts,
} from './record-layouts.ts'
import { getRecordViewCatalog, patchRecordViewCatalog, subscribeRecordViewCatalog } from './record-view-catalog.ts'
import { createRecordSandboxView, writeRecordViewCatalog } from './record-sandboxes.ts'

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
  /** 必须返回一个有效视图 id，调用方不再兜底。 */
  selectedId: (record: DbRecord, fieldKey: ViewCatalogFieldKey) => string
  select: (record: DbRecord, fieldKey: ViewCatalogFieldKey, id: string) => void
  copy?: (record: DbRecord, fieldKey: ViewCatalogFieldKey, id: string) => void | Promise<unknown>
  remove?: (record: DbRecord, fieldKey: ViewCatalogFieldKey, id: string) => void | Promise<unknown>
  create?: (record: DbRecord, fieldKey: ViewCatalogFieldKey) => void | Promise<unknown>
  rename?: (record: DbRecord, fieldKey: ViewCatalogFieldKey, id: string, name: string) => void | Promise<unknown>
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
  return EDITOR_CONTENT_FALLBACK
}

export function fallbackContent(path: string) {
  return registeredContent(path)[0]?.id ?? 'doc'
}

function listedSandboxes(collectionPath: string, record: DbRecord, fieldKey: 'views' | 'propViews') {
  const path = collectionOf(collectionPath)
  const live = parseRecordSandboxes(getRecordViewCatalog(path, String(record.id ?? '').trim())[fieldKey])
  return live.length ? live : parseRecordSandboxes(record[fieldKey])
}

function defaultOptions(collectionPath: string, record: DbRecord, fieldKey: ViewCatalogFieldKey): ViewCatalogOption[] {
  const path = collectionOf(collectionPath)
  if (fieldKey === 'layouts') {
    const id = String(record.id ?? '').trim()
    const live = getRecordViewCatalog(path, id).layouts
    const listed = live.length
      ? listedRecordLayouts(path, id, fallbackContent(path))
      : mergeRecordLayouts(record.layouts, fallbackContent(path))
    return listed.map((item) => ({
      id: item.id,
      name: item.name,
      icon: 'layout' as const,
      builtin: Boolean(item.builtin) || item.id === DEFAULT_RECORD_LAYOUT_ID,
    }))
  }
  if (fieldKey === 'propViews') {
    return named([
      { id: DEFAULT_RECORD_PROP_VIEW_ID, name: '表格', icon: 'table', builtin: true },
      { id: SOURCE_RECORD_PROP_VIEW_ID, name: SOURCE_RECORD_PROP_VIEW_LABEL, icon: 'source', builtin: true },
      { id: HIDDEN_CONTENT_VIEW_ID, name: HIDDEN_CONTENT_VIEW_LABEL, icon: 'hidden', builtin: true },
      ...listedSandboxes(path, record, 'propViews').map((item) => ({
        id: item.id,
        name: item.name,
        icon: 'sandbox' as const,
      })),
    ])
  }
  return named([
    ...registeredContent(path),
    { id: HIDDEN_CONTENT_VIEW_ID, name: HIDDEN_CONTENT_VIEW_LABEL, icon: 'hidden', builtin: true },
    ...listedSandboxes(path, record, 'views').map((item) => ({
      id: item.id,
      name: item.name,
      icon: 'sandbox' as const,
    })),
  ])
}

function defaultSelected(collectionPath: string, record: DbRecord, fieldKey: ViewCatalogFieldKey) {
  const path = collectionOf(collectionPath)
  const id = String(record.id ?? '').trim()
  const catalog = getRecordViewCatalog(path, id)
  if (fieldKey === 'layouts') return catalog.activeLayoutId || getActiveRecordLayout(path, id, fallbackContent(path)).id
  if (fieldKey === 'propViews') {
    return catalog.propViewId || getActiveRecordLayout(path, id, fallbackContent(path)).propViewId || DEFAULT_RECORD_PROP_VIEW_ID
  }
  return catalog.contentViewId || getActiveRecordLayout(path, id, fallbackContent(path)).contentViewId
}

function defaultSelect(collectionPath: string, record: DbRecord, fieldKey: ViewCatalogFieldKey, viewId: string) {
  const path = collectionOf(collectionPath)
  const id = String(record.id ?? '').trim()
  const next = String(viewId ?? '').trim()
  if (!path || !id || !next) return
  if (fieldKey === 'layouts') {
    const layout = listedRecordLayouts(path, id, fallbackContent(path)).find((item) => item.id === next)
    patchRecordViewCatalog(path, id, {
      activeLayoutId: next,
      ...(layout
        ? { contentViewId: layout.contentViewId, propViewId: layout.propViewId }
        : {}),
    })
    setActiveRecordLayoutId(path, id, next)
    return
  }
  if (fieldKey === 'propViews') {
    patchRecordViewCatalog(path, id, { propViewId: next })
    void patchActiveRecordLayout(path, id, { propViewId: next }, fallbackContent(path))
    return
  }
  patchRecordViewCatalog(path, id, { contentViewId: next })
  void patchActiveRecordLayout(path, id, { contentViewId: next }, fallbackContent(path))
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
  const key = fieldKey === 'propViews' ? 'propViews' : 'views'
  const listed = listedSandboxes(path, record, key)
  const source = listed.find((item) => item.id === target)
  const view = await createRecordSandboxView({
    collectionPath: path,
    recordId: id,
    fieldKey: key,
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
  const key = fieldKey === 'propViews' ? 'propViews' : 'views'
  const remaining = listedSandboxes(path, record, key).filter((item) => item.id !== target)
  const ok = await writeRecordViewCatalog(path, id, key, remaining)
  if (!ok) return
  if (selectedViewCatalogId(path, record, fieldKey) === target) {
    defaultSelect(
      path,
      record,
      fieldKey,
      fieldKey === 'propViews' ? DEFAULT_RECORD_PROP_VIEW_ID : remaining[0]?.id ?? fallbackContent(path),
    )
  }
}

async function defaultCreate(collectionPath: string, record: DbRecord, fieldKey: ViewCatalogFieldKey) {
  const path = normalizeCollectionPath(collectionPath)
  const id = String(record.id ?? '').trim()
  if (!path || !id) return
  if (fieldKey === 'layouts') return addRecordLayout(path, id, fallbackContent(path))
  const key = fieldKey === 'propViews' ? 'propViews' : 'views'
  const view = await createRecordSandboxView({
    collectionPath: path,
    recordId: id,
    fieldKey: key,
    name: '新视图',
    title: String(record.title ?? ''),
  })
  defaultSelect(path, record, fieldKey, view.id)
  return view
}

async function defaultRename(collectionPath: string, record: DbRecord, fieldKey: ViewCatalogFieldKey, viewId: string, name: string) {
  const path = normalizeCollectionPath(collectionPath)
  const id = String(record.id ?? '').trim()
  const target = String(viewId ?? '').trim()
  const nextName = name.trim()
  if (!path || !id || !target || !nextName) return
  if (fieldKey === 'layouts') return renameRecordLayout(path, id, target, nextName)
  const key = fieldKey === 'propViews' ? 'propViews' : 'views'
  await writeRecordViewCatalog(
    path,
    id,
    key,
    listedSandboxes(path, record, key).map((item) => (item.id === target ? { ...item, name: nextName } : item)),
  )
}

function defaultSubscribe(fn: () => void) {
  const offLayouts = subscribeRecordLayouts(fn)
  const offCatalog = subscribeRecordViewCatalog(fn)
  return () => {
    offLayouts()
    offCatalog()
  }
}

const defaultHosts = new Map<string, ViewCatalogHost>()

function bindHost(collectionPath: string): ViewCatalogHost {
  const path = collectionOf(collectionPath)
  const registered = hosts.get(path) ?? windowHosts()[path]
  if (registered) return registered
  const cached = defaultHosts.get(path)
  if (cached) return cached
  const host: ViewCatalogHost = {
    options: (record, fieldKey) => defaultOptions(path, record, fieldKey),
    selectedId: (record, fieldKey) => defaultSelected(path, record, fieldKey),
    select: (record, fieldKey, id) => defaultSelect(path, record, fieldKey, id),
    copy: (record, fieldKey, id) => defaultCopy(path, record, fieldKey, id),
    remove: (record, fieldKey, id) => defaultRemove(path, record, fieldKey, id),
    create: (record, fieldKey) => defaultCreate(path, record, fieldKey),
    rename: (record, fieldKey, id, name) => defaultRename(path, record, fieldKey, id, name),
    subscribe: defaultSubscribe,
  }
  defaultHosts.set(path, host)
  return host
}

export function listViewCatalogOptions(collectionPath: string, record: DbRecord, fieldKey: string): ViewCatalogOption[] {
  if (!isViewCatalogField(fieldKey)) return []
  return named(bindHost(collectionPath).options(record, fieldKey) ?? [])
}

export function selectedViewCatalogId(collectionPath: string, record: DbRecord, fieldKey: string) {
  if (!isViewCatalogField(fieldKey)) return ''
  return String(bindHost(collectionPath).selectedId(record, fieldKey) ?? '').trim()
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
  bindHost(collectionPath).select(record, fieldKey, viewId)
}

const CONTENT_BUILTIN_IDS = new Set(['doc', 'outline', 'table', 'source', 'hidden', 'chat'])

export function canCopyViewCatalogItem(fieldKey: string, item: { id?: string; builtin?: boolean }) {
  if (fieldKey !== 'views' && fieldKey !== 'propViews') return false
  const id = String(item.id ?? '').trim()
  if (!id) return false
  if (item.builtin) return false
  if (fieldKey === 'views' && CONTENT_BUILTIN_IDS.has(id)) return false
  if (fieldKey === 'propViews' && (id === DEFAULT_RECORD_PROP_VIEW_ID || id === 'table' || id === SOURCE_RECORD_PROP_VIEW_ID || id === 'hidden')) return false
  return true
}

export function copyViewCatalog(collectionPath: string, record: DbRecord, fieldKey: string, viewId: string) {
  if (!isViewCatalogField(fieldKey)) return
  if (fieldKey !== 'layouts') {
    const option = listViewCatalogOptions(collectionPath, record, fieldKey).find((item) => item.id === viewId)
    if (!option || !canCopyViewCatalogItem(fieldKey, option)) return
  }
  void bindHost(collectionPath).copy?.(record, fieldKey, viewId)
}

export function deleteViewCatalog(collectionPath: string, record: DbRecord, fieldKey: string, viewId: string) {
  if (!isViewCatalogField(fieldKey)) return
  void bindHost(collectionPath).remove?.(record, fieldKey, viewId)
}

export function createViewCatalog(collectionPath: string, record: DbRecord, fieldKey: string) {
  if (!isViewCatalogField(fieldKey)) return
  return bindHost(collectionPath).create?.(record, fieldKey)
}

export function renameViewCatalog(collectionPath: string, record: DbRecord, fieldKey: string, viewId: string, name: string) {
  if (!isViewCatalogField(fieldKey)) return
  return bindHost(collectionPath).rename?.(record, fieldKey, viewId, name)
}

export function subscribeViewCatalog(collectionPath: string, fn: () => void) {
  const offUi = getDatabaseUi()?.subscribe(fn)
  const offHost = bindHost(collectionPath).subscribe?.(fn)
  return () => {
    offHost?.()
    offUi?.()
  }
}
