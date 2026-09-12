import type { CollectionInfo } from '@biu/type-file-system'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import { mergePageBlockViews, type BlockKindRef } from '../catalog-views.ts'
import { PAGE_BLOCKS_COLLECTION_PATH } from './database-path.ts'
import { normalizeCollectionPath } from '../paths.ts'
import type { SavedView } from './saved-view.ts'

export function pageBlocksChrome(kinds: () => BlockKindRef[]): CollectionChrome {
  return {
    listViews(tables: CollectionInfo[], user: unknown[]) {
      const table = tables.find((item) => normalizeCollectionPath(item.path) === PAGE_BLOCKS_COLLECTION_PATH) ?? {
        path: PAGE_BLOCKS_COLLECTION_PATH,
        label: '组件',
        view: { title: '组件' },
      }
      return mergePageBlockViews(table, kinds(), user as SavedView[])
    },
  }
}
