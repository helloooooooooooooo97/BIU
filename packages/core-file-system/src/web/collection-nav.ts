import type { CollectionInfo } from '@biu/type-file-system'
import { getDatabaseUi } from './database-ui.ts'
import { normalizeSavedView, rankListedViews, type SavedView } from './saved-view.ts'
import { loadViews } from './view-storage.ts'

export function viewsForRegisteredCollection(
  path: string,
  tables: CollectionInfo[],
  user: SavedView[],
) {
  const listed = getDatabaseUi()?.chrome(path).listViews?.(tables, user)
  if (listed) return (listed as SavedView[]).map((view) => normalizeSavedView(view))
  return user.map((view) => normalizeSavedView(view))
}

export function paintCollectionViews(
  path: string,
  tables: CollectionInfo[],
  user: SavedView[] = loadViews(path),
) {
  return rankListedViews(viewsForRegisteredCollection(path, tables, user), user)
}
