import type { Context } from 'cordis'
import { compileSandboxSource, formatCompileReport } from '../shared/compile.ts'

export const name = 'page-sandbox'
export const inject = ['http', 'tools']

export function apply(ctx: Context) {
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

  ctx.tools.register({
    name: 'sandbox_compile',
    description:
      'Compile/verify page-sandbox React/JSX source. Do not import or require modules. Returns ok + mode, or error.',
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
