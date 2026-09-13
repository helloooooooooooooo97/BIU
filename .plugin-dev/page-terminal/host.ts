export const name = 'page-terminal'
export const inject = ['http', 'shell']

type ShellResult = { code: number | null; stdout: string; stderr: string }

type Route = {
  json: () => Promise<unknown>
  send: (status: number, body: unknown) => void
}

const OUTPUT_CAP = 80_000

function clip(text: string) {
  if (text.length <= OUTPUT_CAP) return text
  return `${text.slice(0, OUTPUT_CAP)}\n…(output truncated)`
}

export function apply(ctx: {
  http: { route: (method: string, path: string, handler: (route: Route) => unknown) => void }
  shell: { run: (command: string, signal?: AbortSignal) => Promise<ShellResult> }
}) {
  ctx.http.route('POST', '/api/page-terminal/run', async (route) => {
    const body = ((await route.json()) ?? {}) as { command?: unknown }
    const command = String(body.command ?? '').trim()
    if (!command) {
      route.send(200, { code: 0, stdout: '', stderr: '' })
      return
    }
    const result = await ctx.shell.run(command)
    route.send(200, {
      code: result.code,
      stdout: clip(String(result.stdout ?? '')),
      stderr: clip(String(result.stderr ?? '')),
    })
  })
}
