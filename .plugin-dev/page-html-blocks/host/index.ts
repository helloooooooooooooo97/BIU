import type { Context } from 'cordis'
import { compileHtmlSource, formatCompileReport } from '../shared/compile.ts'

export const name = 'page-html-blocks'
export const inject = ['http', 'tools']

const HTML_FENCE_HINT =
  'html/htmlframe：先 db_content /plugins/page-html-blocks 读「示例写法」，再写围栏。'

const HTML_DOC_HINT =
  'html/htmlframe 源码约定见 /plugins/page-html-blocks 介绍，不要把 HTML 写进页面围栏。'

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
      '校验 HTML 块源码（静态 HTML/CSS 或动态 HTML/JS/JSX）。先读 /plugins/page-html-blocks「示例写法」再写附件。本工具只编译、不落盘。外链 script、import/require 会失败。返回 ok + mode，或 error。',
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
