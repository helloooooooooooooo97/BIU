import { resolve } from 'node:path'
import type { Context } from 'cordis'
import { compileSandboxSource, formatCompileReport } from '../shared/sandbox-compile.ts'
import { CommentsStore } from './comments-store.ts'
import { commentsCollection } from './comments-collection.ts'
import { runInlineEdit } from './inline-edit.ts'

export const name = 'core-editor'
export const inject = ['http', 'tools']

export { CommentsStore, commentToRecord, normalizeCommentAnchor, normalizeCommentStatus } from './comments-store.ts'
export type { CommentAnchor, CommentInput, CommentRow, CommentStatus } from './comments-store.ts'
export { COMMENTS_COLLECTION_PATH, commentsCollection } from './comments-collection.ts'
export {
  INLINE_EDIT_SYSTEM_PROMPT,
  buildInlineEditUserMessage,
  runInlineEdit,
  sanitizeInlineEditOutput,
} from './inline-edit.ts'
export type { InlineEditInput } from './inline-edit.ts'

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

const SANDBOX_FENCE_HINT =
  '沙箱是内置块：围栏 :::editorBlock {kind=sandbox plugin=page-sandbox}，体只写 {"file":"assets/sandbox-….jsx","dataFile":"assets/sandbox-data-….json"}，不要把 React 源码或运行时数据写进围栏。'

const SANDBOX_DOC_HINT =
  '沙箱源码用 db_file 写 file 指向的 .jsx 附件（可覆盖）。运行时数据由组件里的 biu.write 写入 dataFile 指向的 .json 附件，不要写进 .jsx，不要写进围栏，不要用 db_media。'

/** 编辑器在 Web；Host 提供沙箱编译闸门。 */
export function apply(ctx: Context) {
  ctx.tools.annotate('db_content', SANDBOX_FENCE_HINT)
  ctx.tools.annotate('db_file', SANDBOX_DOC_HINT)
  ctx.inject(['database'], (inner) => {
    const fsSvc = inner.get('fs') as { workspace?: { resolve?: (rel: string) => string } } | undefined
    const file =
      fsSvc?.workspace?.resolve?.('.biu/editor-comments.json') ?? resolve(process.cwd(), '.biu/editor-comments.json')
    const store = new CommentsStore().open(file)
    inner.database.register(commentsCollection(store))
  })
  ctx.http.route('POST', '/api/page-sandbox/compile', async (route) => {
    const body = await route.json<{ source?: string }>()
    const source = typeof body.source === 'string' ? body.source : ''
    const result = compileSandboxSource(source)
    if (!result.ok) {
      route.send(400, { ok: false, error: result.error, mode: result.mode, report: formatCompileReport(result) })
      return
    }
    route.send(200, { ok: true, mode: result.mode, report: formatCompileReport(result) })
  })

  ctx.http.route('POST', '/api/editor/inline-edit', async (route) => {
    try {
      const body = await route.json<{
        instruction?: string
        selection?: string
        before?: string
        after?: string
        title?: string
        sessionId?: string
      }>()
      const text = await runInlineEdit(ctx, {
        instruction: String(body.instruction ?? ''),
        selection: typeof body.selection === 'string' ? body.selection : '',
        before: typeof body.before === 'string' ? body.before : '',
        after: typeof body.after === 'string' ? body.after : '',
        title: typeof body.title === 'string' ? body.title : '',
        sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
      })
      route.send(200, { ok: true, text })
    } catch (error) {
      route.send(400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  })

  ctx.tools.register({
    name: 'sandbox_compile',
    description:
      '只校验沙箱的 React/JSX，不落盘。源码在 db_file 的 .jsx 附件里，围栏只留 file/dataFile。不要 import/require。运行时数据用 biu.write 写到 dataFile 的 .json，不要写进源码。返回 ok + mode，或 error。',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'React function / JSX source for the sandbox block.' },
      },
    },
    execute: (args) => {
      const source = String(args.source ?? '')
      const result = compileSandboxSource(source)
      if (!result.ok) return { ok: false, error: result.error, mode: result.mode, report: formatCompileReport(result) }
      return { ok: true, mode: result.mode, report: formatCompileReport(result) }
    },
  })
}
