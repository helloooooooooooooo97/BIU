import type { Context } from 'cordis'

export const name = 'core-editor'
export const inject: string[] = []

export {
  listPageBlockFences,
  pageBlockData,
  pageBlockRecordId,
  parsePageBlockRecordId,
  patchPageBlockMarkdown,
} from '../page-block-fence.ts'
export type { PageBlockAttrsPatch, PageBlockFence } from '../page-block-fence.ts'

/** 编辑器只在 Web；Host 占位以便目录加载。 */
export function apply(_ctx: Context) {}
