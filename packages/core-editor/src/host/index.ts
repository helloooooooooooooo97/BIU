import type { Context } from 'cordis'

export const name = 'core-editor'
export const inject: string[] = []

export {
  createPageBlockId,
  isPageBlockId,
  listPageBlockFences,
  pageBlockData,
  pageBlockRecordId,
  parsePageBlockRecordId,
  patchPageBlockMarkdown,
  uniquifyPageBlockMarkdown,
  defaultPageBlockTitle,
} from '../page-block-fence.ts'
export type { PageBlockAttrsPatch, PageBlockFence } from '../page-block-fence.ts'
export { parsePageViews, viewsAssetName, defaultSandboxSource } from '../page-views.ts'
export type { PageSandboxView } from '../page-views.ts'
export { parsePagePropViews, propViewsAssetName, defaultPropSandboxSource } from '../page-prop-views.ts'
export { parsePageLayouts, layoutsAssetName, defaultPageLayout, defaultLayoutSandboxSource, PAGE_DEFAULT_LAYOUT_ID } from '../page-layouts.ts'

/** 编辑器只在 Web；Host 占位以便目录加载。 */
export function apply(_ctx: Context) {}
