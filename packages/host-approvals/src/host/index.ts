import { Service, type Context } from 'cordis'
import type { ToolRequest } from '@biu/host-tools'
import { currentAccountId, currentRequestWorkspaceId } from '@biu/host-plugin-loader/data-dir'

const DEFAULT_HOLD_TIMEOUT_MS = 60_000

export interface ApprovalNotifyPayload {
  id: string
  name: string
  args: Record<string, unknown>
  accountId?: string
  workspaceId?: string
}

export class ApprovalsService extends Service {
  private modes = new Map<string, 'auto' | 'hold'>()
  holdTimeoutMs = DEFAULT_HOLD_TIMEOUT_MS
  private notify: ((payload: ApprovalNotifyPayload) => void) | undefined
  private pending = new Map<
    string,
    {
      req: ToolRequest
      accountId: string
      workspaceId: string
      resolve: (allow: boolean) => void
      timer?: ReturnType<typeof setTimeout>
    }
  >()

  get mode(): 'auto' | 'hold' {
    return this.modes.get(currentAccountId().trim()) ?? 'auto'
  }

  set mode(next: 'auto' | 'hold') {
    this.modes.set(currentAccountId().trim(), next)
  }

  constructor(ctx: Context) {
    super(ctx, 'approvals')
    ctx.tools.guard(async (req) => {
      if (!needsApproval(req.name, this.mode)) return req
      const id = crypto.randomUUID()
      const accountId = currentAccountId().trim()
      const workspaceId = currentRequestWorkspaceId().trim()
      const allow = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          if (!this.pending.has(id)) return
          this.pending.delete(id)
          resolve(false)
        }, this.holdTimeoutMs)
        this.pending.set(id, { req, accountId, workspaceId, resolve, timer })
        this.notify?.({
          id,
          name: req.name,
          args: req.args,
          ...(accountId ? { accountId } : {}),
          ...(workspaceId ? { workspaceId } : {}),
        })
      })
      return allow ? req : { ...req, deny: `denied: ${req.name}` }
    })
  }

  setNotify(notify: (payload: ApprovalNotifyPayload) => void) {
    this.notify = notify
  }

  private matchesCurrentTenant(item: { accountId: string; workspaceId: string }) {
    const accountId = currentAccountId().trim()
    const workspaceId = currentRequestWorkspaceId().trim()
    if (item.accountId !== accountId) return false
    if (item.workspaceId && workspaceId && item.workspaceId !== workspaceId) return false
    return true
  }

  list() {
    return [...this.pending.entries()]
      .filter(([, item]) => this.matchesCurrentTenant(item))
      .map(([id, item]) => ({ id, name: item.req.name, args: item.req.args }))
  }

  decide(id: string, allow: boolean) {
    const item = this.pending.get(id)
    if (!item || !this.matchesCurrentTenant(item)) throw new Error(`unknown approval: ${id}`)
    this.pending.delete(id)
    if (item.timer) clearTimeout(item.timer)
    item.resolve(allow)
    try {
      const notices = this.ctx.get('notices') as { markSourceRead?: (key: string) => void } | undefined
      notices?.markSourceRead?.(`approval:${id}`)
    } catch {
      /* notices 未登记 */
    }
    return { ok: true }
  }
}

function needsApproval(name: string, mode: 'auto' | 'hold') {
  if (name === 'db_delete') return true
  if (mode === 'auto') return false
  return sensitive(name)
}

function sensitive(name: string) {
  return /^(fs_write|str_replace_editor|bash|job_start|terminal_write|lsp_start|subagent_spawn|mcp_add_stdio)$/.test(name)
}

export const name = 'approvals'
export const inject = ['tools']

export function apply(ctx: Context) {
  const approvals = new ApprovalsService(ctx)
  ctx.inject(['http'], (inner) => {
    approvals.setNotify((payload) => {
      inner.http.broadcast('approval', payload, payload.workspaceId, payload.accountId)
    })
    inner.http.route('GET', '/api/approvals', (route) => {
      route.send(200, { mode: approvals.mode, pending: approvals.list() })
    })
    inner.http.route('POST', '/api/approvals/mode', async (route) => {
      const payload = (await route.json()) as { mode?: 'auto' | 'hold' }
      if (payload.mode === 'auto' || payload.mode === 'hold') approvals.mode = payload.mode
      route.send(200, { mode: approvals.mode })
    })
    inner.http.route('POST', '/api/approvals/:id', async (route) => {
      const payload = (await route.json()) as { allow?: boolean }
      try {
        route.send(200, approvals.decide(route.params.id, Boolean(payload.allow)))
      } catch (error) {
        route.send(400, { error: String(error) })
      }
    })
  })
}
