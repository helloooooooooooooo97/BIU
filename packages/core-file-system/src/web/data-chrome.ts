import type { CollectionChrome } from '@biu/type-file-system/ui'
import { builtinAllView, stampRowOpenTarget } from '../catalog-views.ts'
import { DATA_COLLECTION_PATH } from './database-path.ts'
import type { SavedView } from './saved-view.ts'

export const dataChrome: CollectionChrome = {
  openRow(row) {
    const stamp = stampRowOpenTarget(row)
    if (!stamp) return false
    return { kind: 'record', recordId: stamp.recordId, collection: stamp.collection }
  },
  listViews(_tables, user) {
    const all = builtinAllView({ path: DATA_COLLECTION_PATH, label: '数据', view: { title: '数据' } })
    return [
      { ...all, groupBy: '', columns: ['title', 'actions', 'table'] },
      ...(user as SavedView[]).filter((view) => !view.builtin),
    ]
  },
}
