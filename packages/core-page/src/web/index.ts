import type { Context } from 'cordis'
import type { DatabaseUi } from '@biu/type-file-system/ui'
import { pageBlocksCollectionView, PageBlockContent } from './page-blocks-view.tsx'

export { PageBlockContent, PageBlocksView, pageBlocksCollectionView, PAGE_BLOCKS_VIEW_ID } from './page-blocks-view.tsx'

export const name = 'page-ui'
export const inject = ['databaseUi']

export function apply(ctx: Context) {
  const ui = ctx.get('databaseUi') as DatabaseUi
  ctx.effect(() => ui.decorate('/editor-blocks', { Content: PageBlockContent }).dispose)
  ctx.effect(() => ui.registerView('/editor-blocks', pageBlocksCollectionView).dispose)
}
