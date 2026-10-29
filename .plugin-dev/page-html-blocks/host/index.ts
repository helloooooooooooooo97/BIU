import type { Context } from 'cordis'
import { compileHtmlSource, formatCompileReport } from '../shared/compile.ts'

export const name = 'page-html-blocks'
export const inject = ['http', 'tools']

const HTML_FENCE_HINT =
  'HTML 块（:::pageBlock kind=html 或 htmlframe）：围栏体只写 {"file":"assets/<名>.html"}，禁止把 HTML/JSX 写进围栏。源码必须 db_doc command=write name=<名>.html（或 /api/page/file/<名>.html）。打开块时附件会覆盖围栏体，写进围栏的 HTML 会丢。'

const HTML_DOC_HINT =
  'HTML/htmlframe 块本体在这里，不在 db_content 围栏。先 db_doc write name=<名>.html value/from=源码，再在页面围栏只贴 {"file":"assets/<名>.html"}。围栏里的 HTML 会被附件覆盖丢掉。'

export function apply(ctx: Context) {
  ctx.tools.annotate('db_content', HTML_FENCE_HINT)
  ctx.tools.annotate('db_doc', HTML_DOC_HINT)
  ctx.http.route('POST', '/api/page-html-blocks/compile', async (route) => {
    const body = await route.json<{ source?: string; html?: string }>()
    const source = typeof body.source === 'string' ? body.source : typeof body.html === 'string' ? body.html : ''
    const result = compileHtmlSource(source)
    if (!result.ok) {
      route.send(400, { ok: false, error: result.error, mode: result.mode, report: formatCompileReport(result) })
      return
    }
    route.send(200, { ok: true, mode: result.mode, report: formatCompileReport(result) })
  })

  ctx.tools.register({
    name: 'html_block_compile',
    description:
      '校验 HTML 块源码（静态 HTML/CSS 或动态 HTML/JS/JSX）。源码必须先 db_doc write 到附件（name=<名>.html），页面围栏只写 {"file":"assets/<名>.html"}；写进围栏会被附件覆盖。本工具只编译、不落盘。外链 script、import/require 会失败。返回 ok + mode，或 error。',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Full HTML document, fragment, or React function/JSX source.' },
        html: { type: 'string', description: 'Alias of source.' },
      },
    },
    execute: (args) => {
      const source = String(args.source ?? args.html ?? '')
      const result = compileHtmlSource(source)
      if (!result.ok) return { ok: false, error: result.error, mode: result.mode, report: formatCompileReport(result) }
      return { ok: true, mode: result.mode, report: formatCompileReport(result) }
    },
  })
}
