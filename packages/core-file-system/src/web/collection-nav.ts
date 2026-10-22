import type { CollectionInfo } from '@biu/type-file-system'
import { mergeTableViews } from '../catalog-views.ts'
import { getDatabaseUi } from './database-ui.ts'
import { rankListedViews, type SavedView } from './saved-view.ts'
import { loadViews, withViewDisplay } from './view-storage.ts'

export function viewsForRegisteredCollection(
  path: string,
  tables: CollectionInfo[],
  user: SavedView[],
) {
  const listed = getDatabaseUi()?.chrome(path).listViews?.(tables, user)
  if (listed) return listed as SavedView[]
  const table = tables.find((item) => item.path === path) ?? { path, label: path.replace(/^\//, '') }
  return mergeTableViews(table, user)
}

/** merge 会把内置视图插到数组头；真正顺序跟 overlay / 上次 rank 走。 */
export function paintCollectionViews(
  path: string,
  tables: CollectionInfo[],
  user: SavedView[] = loadViews(path),
) {
  return rankListedViews(
    viewsForRegisteredCollection(path, tables, user).map((view) => withViewDisplay(path, view)),
    user,
  )
}
