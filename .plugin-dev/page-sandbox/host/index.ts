import type { Context } from 'cordis'
import { compileSandboxSource, formatCompileReport } from '../shared/compile.ts'

export const name = 'page-sandbox'
export const inject = ['http', 'tools']

const SANDBOX_FENCE_HINT =
  'Sandbox：先 db_content /plugins/page-sandbox 读「示例写法」。围栏体只写 {"file":"assets/sandbox-….jsx","dataFile":"assets/sandbox-data-….json"}，不要把 React 源码或运行时数据写进围栏。'

const SANDBOX_DOC_HINT =
  'Sandbox 源码用 db_doc 写 file 指向的 .jsx 附件（可覆盖）。运行时数据由组件里的 biu.write 写入 dataFile 指向的 .json 附件，不要写进 .jsx，不要写进围栏，不要用 db_asset。'

export function apply(ctx: Context) {
  ctx.tools.annotate('db_content', SANDBOX_FENCE_HINT)
  ctx.tools.annotate('db_doc', SANDBOX_DOC_HINT)
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
      '只校验 Sandbox 的 React/JSX，不落盘。源码在 db_doc 的 .jsx 附件里，围栏只留 file/dataFile。不要 import/require。运行时数据用 biu.write 写到 dataFile 的 .json，不要写进源码。返回 ok + mode，或 error。',
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
