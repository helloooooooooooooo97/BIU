import type { DbRecord } from '@biu/type-file-system'
import { listedPageLayouts, selectPageLayout, subscribePageLayouts, getActivePageLayout, patchActivePageLayout } from './page-layouts.ts'
import { getPageViews, subscribePageViews } from './page-views.ts'
import { getPagePropViews, subscribePagePropViews } from './page-prop-views.ts'
import { getPagePresentMode, PAGE_BUILTIN_MODES, subscribePagePresent } from './source-mode.ts'
import { getPagePropPresentMode, PAGE_PROP_TABLE_VIEW_ID, subscribePagePropPresent } from './page-prop-present.ts'

const VIEW_CATALOG_HOSTS_KEY = '__biuViewCatalogHosts'

const CONTENT_BUILTINS = [
  { id: 'doc', name: '文档' },
  { id: 'outline', name: '大纲' },
  { id: 'table', name: '表格' },
  { id: 'source', name: '源码' },
] as const

type FieldKey = 'views' | 'propViews' | 'layouts'
type Option = { id: string; name: string }

function options(record: DbRecord, fieldKey: FieldKey): Option[] {
  const id = String(record.id ?? '').trim()
  if (fieldKey === 'layouts') {
    return listedPageLayouts(id).map((item) => ({ id: item.id, name: item.name }))
  }
  if (fieldKey === 'propViews') {
    return [
      { id: PAGE_PROP_TABLE_VIEW_ID, name: '表格' },
      ...getPagePropViews(id).map((item) => ({ id: item.id, name: item.name })),
    ]
  }
  const builtins = CONTENT_BUILTINS.filter((item) => (PAGE_BUILTIN_MODES as readonly string[]).includes(item.id))
  return [...builtins, ...getPageViews(id).map((item) => ({ id: item.id, name: item.name }))]
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
  const host = { options, selectedId, select, subscribe }
  bag['/pages'] = host
  ;(window as unknown as Record<string, unknown>)[VIEW_CATALOG_HOSTS_KEY] = bag
  return () => {
    const live = ((window as unknown as Record<string, unknown>)[VIEW_CATALOG_HOSTS_KEY] as Record<string, unknown>) ?? {}
    if (live['/pages'] === host) delete live['/pages']
  }
}
