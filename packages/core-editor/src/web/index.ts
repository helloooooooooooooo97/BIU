import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'
import type { Context } from 'cordis'
import { DEFAULT_CHROME_PATH, type DatabaseUi } from '@biu/type-file-system/ui'
import { PageEditor } from './page-editor.tsx'
import { PageEditorService } from './service.ts'
import { PAGE_EDITOR_STYLE } from './style.ts'
import { SourceToggle } from './source-toggle.tsx'

export { PageEditor, PageEditor as RecordEditor } from './page-editor.tsx'
export { SourceToggle } from './source-toggle.tsx'
export { PageEditorService, BASIC_BLOCK_TYPE, getPageEditor, usePageEditorVersion } from './service.ts'
export type { HeadingReplacement, PageBlockSpec, PageBlockViewProps, SlashCommandSpec, SlashInsert } from './service.ts'
export { pageEditorExtensions } from './kit.ts'
export { markdownLocusFromRange, markdownLocusFromSelection, markdownLocusFromElement } from './markdown-locus.ts'

export const name = 'core-editor-ui'
export const inject = ['databaseUi']

export function apply(ctx: Context) {
  new PageEditorService(ctx)
  const ui = ctx.get('databaseUi') as DatabaseUi
  // 凡是有 file 正文的表都走 Markdown；没有 contentField 的表不会用到这份 chrome。
  ctx.effect(() => ui.decorate(DEFAULT_CHROME_PATH, { Content: PageEditor, DetailTools: SourceToggle }).dispose)
}

if (typeof document !== 'undefined') {
  const id = 'biu-core-editor-style'
  const style = document.getElementById(id) ?? document.createElement('style')
  style.id = id
  style.textContent = PAGE_EDITOR_STYLE
  document.head.appendChild(style)
}
