import type { Context } from 'cordis'
import { compileHtmlSource, formatCompileReport } from '../shared/compile.ts'

export const name = 'page-html-blocks'
export const inject = ['http', 'tools']

export function apply(ctx: Context) {
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
      'Compile/verify page-html-blocks source (static HTML/CSS or dynamic HTML/JS/JSX). Call after writing the attachment. External script src and import/require are rejected. Returns ok + mode, or error.',
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
