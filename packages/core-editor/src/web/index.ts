import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'
import type { Context } from 'cordis'
import { DEFAULT_CHROME_PATH, type DatabaseUi } from '@biu/type-file-system/ui'
import { RecordEditor } from './page-editor.tsx'
import { BlockEditorService } from './service.ts'
import { PAGE_EDITOR_STYLE } from './style.ts'
import { RecordDetailBar } from './page-detail-bar.tsx'
import { bindPageViewCatalogHost } from './page-view-catalog.ts'
import { registerSandboxBlock } from './sandbox/block.tsx'
import { EDITOR_CONTENT_VIEWS, EDITOR_DETAIL_TOOLS } from './editor-content-views.ts'

export { RecordEditor } from './page-editor.tsx'
export { RecordDetailBar } from './page-detail-bar.tsx'
export {
  BlockEditorService,
  BASIC_BLOCK_TYPE,
  getBlockEditor,
  useBlockEditorVersion,
} from './service.ts'
export type { HeadingReplacement, EditorBlockSpec, PageBlockViewProps, SlashCommandSpec, SlashInsert } from './service.ts'
export { recordEditorExtensions } from './kit.ts'
export { slideExtensions } from './slide.ts'
export { LayoutPicker, LayoutGlyph, type LayoutPreset } from './layout-picker.tsx'
export { markdownLocusFromRange, markdownLocusFromSelection, markdownLocusFromElement } from './markdown-locus.ts'
export { PageBlockStage } from './page-blocks-view.tsx'
export { PageHostView } from './page-host-view.tsx'
export { parsePageViews, viewsAssetName, createPageSandboxView, loadPageViews } from './page-views.ts'
export { PageProperties } from './page-prop-host.tsx'
export { parsePagePropViews, propViewsAssetName, createPagePropSandboxView, loadPagePropViews } from './page-prop-views.ts'
export { parsePageLayouts, layoutsAssetName, PAGE_DEFAULT_LAYOUT_ID, loadPageLayouts } from './page-layouts.ts'

export const name = 'core-editor-ui'
export const inject = ['databaseUi']

export function apply(ctx: Context) {
  new BlockEditorService(ctx)
  registerSandboxBlock(ctx.blockEditor)
  const ui = ctx.get('databaseUi') as DatabaseUi
  // 凡是有 file 正文的表都走 Markdown；没有 contentField 的表不会用到这份 chrome。
  ctx.effect(() => ui.decorate(DEFAULT_CHROME_PATH, { Content: RecordEditor, DetailBar: RecordDetailBar }).dispose)
  ctx.effect(() => {
    const views = EDITOR_CONTENT_VIEWS.map((view) =>
      ui.registerContentView(DEFAULT_CHROME_PATH, { ...view, Body: RecordEditor }),
    )
    const tools = ui.registerDetailTools(DEFAULT_CHROME_PATH, EDITOR_DETAIL_TOOLS)
    return () => {
      for (const item of views) item.dispose()
      tools.dispose()
    }
  })
  ctx.effect(() => bindPageViewCatalogHost())
}

if (typeof document !== 'undefined') {
  const id = 'biu-core-editor-style'
  const style = document.getElementById(id) ?? document.createElement('style')
  style.id = id
  style.textContent = PAGE_EDITOR_STYLE
  document.head.appendChild(style)
}
