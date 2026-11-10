import type { DbRecord } from '@biu/type-file-system'
import {
  copyPageLayout,
  deletePageLayout,
  listedPageLayouts,
  getPageLayouts,
  parsePageLayouts,
  selectPageLayout,
  subscribePageLayouts,
  getActivePageLayout,
  patchActivePageLayout,
  PAGE_DEFAULT_LAYOUT_ID,
} from './page-layouts.ts'
import { listedPageLayouts as mergeListedLayouts } from '../page-layouts.ts'
import { copyPageSandboxView, deletePageSandboxView, getPageViews, parsePageViews, subscribePageViews } from './page-views.ts'
import { copyPagePropSandboxView, deletePagePropSandboxView, getPagePropViews, parsePagePropViews, subscribePagePropViews } from './page-prop-views.ts'
import { getPagePresentMode, PAGE_BUILTIN_MODES, subscribePagePresent } from './source-mode.ts'
import { getPagePropPresentMode, PAGE_PROP_TABLE_VIEW_ID, subscribePagePropPresent } from './page-prop-present.ts'

const VIEW_CATALOG_HOSTS_KEY = '__biuViewCatalogHosts'

const CONTENT_BUILTINS = [
  { id: 'doc', name: '文档', icon: 'doc' as const, builtin: true },
  { id: 'outline', name: '大纲', icon: 'outline' as const, builtin: true },
  { id: 'table', name: '表格', icon: 'table' as const, builtin: true },
  { id: 'source', name: '源码', icon: 'source' as const, builtin: true },
]

type FieldKey = 'views' | 'propViews' | 'layouts'
type Option = { id: string; name: string; icon: 'doc' | 'outline' | 'table' | 'source' | 'sandbox' | 'layout' | 'props'; builtin?: boolean }

function options(record: DbRecord, fieldKey: FieldKey): Option[] {
  const id = String(record.id ?? '').trim()
  if (fieldKey === 'layouts') {
    const listed = getPageLayouts(id).length ? listedPageLayouts(id) : mergeListedLayouts(parsePageLayouts(record.layouts))
    return listed.map((item) => ({
      id: item.id,
      name: item.name,
      icon: item.kind === 'sandbox' ? 'sandbox' : 'layout',
      builtin: Boolean(item.builtin) || item.id === PAGE_DEFAULT_LAYOUT_ID,
    }))
  }
  if (fieldKey === 'propViews') {
    const live = getPagePropViews(id)
    const listed = live.length ? live : parsePagePropViews(record.propViews)
    return [
      { id: PAGE_PROP_TABLE_VIEW_ID, name: '表格', icon: 'table', builtin: true },
      ...listed.map((item) => ({ id: item.id, name: item.name, icon: 'props' as const })),
    ]
  }
  const builtins = CONTENT_BUILTINS.filter((item) => (PAGE_BUILTIN_MODES as readonly string[]).includes(item.id))
  const live = getPageViews(id)
  const listed = live.length ? live : parsePageViews(record.views)
  return [...builtins, ...listed.map((item) => ({ id: item.id, name: item.name, icon: 'sandbox' as const }))]
}

function selectedId(record: DbRecord, fieldKey: FieldKey) {
  const id = String(record.id ?? '').trim()
  if (fieldKey === 'layouts') return getActivePageLayout(id).id
  if (fieldKey === 'propViews') return getPagePropPresentMode(id)
  return getPagePresentMode(id)
}

function select(record: DbRecord, fieldKey: FieldKey, viewId: string) {
  const id = String(record.id ?? '').trim()
  const next = String(viewId ?? '').trim()
  if (!id || !next) return
  if (fieldKey === 'layouts') {
    const layout = listedPageLayouts(id).find((item) => item.id === next)
    if (layout) selectPageLayout(id, layout)
    return
  }
  if (fieldKey === 'propViews') {
    void patchActivePageLayout(id, { propViewId: next })
    return
  }
  void patchActivePageLayout(id, { contentViewId: next })
}

function copy(record: DbRecord, fieldKey: FieldKey, viewId: string) {
  const id = String(record.id ?? '').trim()
  const target = String(viewId ?? '').trim()
  if (!id || !target) return
  const title = String(record.title ?? '')
  if (fieldKey === 'layouts') {
    const source = listedPageLayouts(id).find((item) => item.id === target)
    return copyPageLayout(id, source)
  }
  if (fieldKey === 'propViews') {
    return copyPagePropSandboxView(id, target, title, target === PAGE_PROP_TABLE_VIEW_ID ? '表格' : '')
  }
  const builtin = CONTENT_BUILTINS.find((item) => item.id === target)
  return copyPageSandboxView(id, target, title, builtin?.name ?? '')
}

function remove(record: DbRecord, fieldKey: FieldKey, viewId: string) {
  const id = String(record.id ?? '').trim()
  const target = String(viewId ?? '').trim()
  if (!id || !target) return
  const option = options(record, fieldKey).find((item) => item.id === target)
  if (option?.builtin) return
  if (fieldKey === 'layouts') return deletePageLayout(id, target)
  if (fieldKey === 'propViews') return deletePagePropSandboxView(id, target)
  return deletePageSandboxView(id, target)
}

function subscribe(fn: () => void) {
  const offs = [
    subscribePageLayouts(fn),
    subscribePageViews(fn),
    subscribePagePropViews(fn),
    subscribePagePresent(fn),
    subscribePagePropPresent(fn),
  ]
  return () => {
    for (const off of offs) off()
  }
}

export function bindPageViewCatalogHost() {
  if (typeof window === 'undefined') return () => undefined
  const bag = ((window as unknown as Record<string, unknown>)[VIEW_CATALOG_HOSTS_KEY] as Record<string, unknown>) ?? {}
  const host = { options, selectedId, select, copy, remove, subscribe }
  bag['/pages'] = host
  ;(window as unknown as Record<string, unknown>)[VIEW_CATALOG_HOSTS_KEY] = bag
  return () => {
    const live = ((window as unknown as Record<string, unknown>)[VIEW_CATALOG_HOSTS_KEY] as Record<string, unknown>) ?? {}
    if (live['/pages'] === host) delete live['/pages']
  }
}
