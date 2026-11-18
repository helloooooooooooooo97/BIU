import { useEffect, useSyncExternalStore, type ComponentType } from 'react'
import type { CollectionChrome, FsContentProps } from '@biu/type-file-system/ui'
import type { DbRecord } from '@biu/type-file-system'
import { HIDDEN_CONTENT_VIEW_ID } from '@biu/type-file-system/record-views'
import { getDatabaseUi, recordContentFallback } from './database-ui.ts'
import { loadRecordLayouts, useActiveRecordLayout } from './record-layouts.ts'
import { useRecordViewCatalog } from './record-view-catalog.ts'

const EDITOR_PLUGIN = 'core-editor'

export function contentBodyOf(
  collectionPath: string,
  viewId: string,
  chrome?: CollectionChrome,
): ComponentType<FsContentProps> | undefined {
  const mode = String(viewId ?? '').trim()
  if (!mode || mode === HIDDEN_CONTENT_VIEW_ID) return undefined
  const views = getDatabaseUi()?.contentViews(collectionPath) ?? []
  const match = views.find((item) => item.id === mode)
  const own = views.length > 0 && views.every((item) => item.plugin !== EDITOR_PLUGIN)
  if (own && match?.Body) return match.Body
  if (chrome?.Content) return chrome.Content
  return match?.Body
}

export function useRecordContentBody(
  collectionPath: string | undefined,
  record: DbRecord,
  chrome?: CollectionChrome,
) {
  const path = String(collectionPath ?? '').trim()
  const id = String(record.id ?? '').trim()
  const fallback = recordContentFallback(path)
  const catalog = useRecordViewCatalog(path, id)
  const layout = useActiveRecordLayout(path, id, fallback)
  const contentViewId = catalog.contentViewId || layout.contentViewId
  useSyncExternalStore(
    (fn) => getDatabaseUi()?.subscribe(fn) ?? (() => undefined),
    () =>
      (getDatabaseUi()?.contentViews(path) ?? [])
        .map((item) => `${item.id}:${item.plugin ?? ''}:${item.Body ? 1 : 0}`)
        .join('|'),
  )
  useEffect(() => {
    if (!path || !id) return
    void loadRecordLayouts(path, id, record.layouts, fallback)
  }, [path, id, record.layouts, fallback])
  const hidden = contentViewId === HIDDEN_CONTENT_VIEW_ID
  return {
    hidden,
    Body: hidden ? undefined : contentBodyOf(path, contentViewId, chrome),
  }
}
