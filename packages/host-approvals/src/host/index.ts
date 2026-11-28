import { Service, type Context } from 'cordis'
import type { ToolRequest } from '@biu/host-tools'
import { currentActorContext, currentTenantScope } from '@biu/host-plugin-loader/data-dir'
import { getNoticesPort } from '@biu/host-plugin-loader/ports'
import { TenantStateMap } from '@biu/host-plugin-loader/tenant-state'

const DEFAULT_HOLD_TIMEOUT_MS = 60_000

export interface ApprovalNotifyPayload {
  id: string
  name: string
  args: Record<string, unknown>
  accountId?: string
  workspaceId?: string
  channelId?: string
  runId?: string
  agentId?: string
  invokerId?: string
}

export class ApprovalsService extends Service {
  private modes: TenantStateMap<'auto' | 'hold'>
  holdTimeoutMs = DEFAULT_HOLD_TIMEOUT_MS
  private notify: ((payload: ApprovalNotifyPayload) => void) | undefined
  private notifyListeners = new Set<(payload: ApprovalNotifyPayload) => void>()
  private decideListeners = new Set<(payload: { id: string; allow: boolean; channelId?: string; runId?: string; accountId: string }) => void>()
  private pending = new Map<
    string,
    {
      req: ToolRequest
      accountId: string
      workspaceId: string
      channelId?: string
      runId?: string
      agentId?: string
      invokerId?: string
      resolve: (allow: boolean) => void
      timer?: ReturnType<typeof setTimeout>
    }
  >()

  get mode(): 'auto' | 'hold' {
    return this.modes.get() ?? 'auto'
  }

  set mode(next: 'auto' | 'hold') {
    this.modes.set(next)
  }

  constructor(ctx: Context) {
    super(ctx, 'approvals')
    this.modes = new TenantStateMap(ctx, { granularity: 'account' })
    ctx.effect(() => {
      const rejectMatching = (predicate: (item: { accountId: string; workspaceId: string }) => boolean) => {
        for (const [id, item] of [...this.pending]) {
          if (!predicate(item)) continue
          this.pending.delete(id)
          if (item.timer) clearTimeout(item.timer)
          item.resolve(false)
        }
      }
      const offRevoked = ctx.on('tenant/revoked', (payload) => {
        rejectMatching(
          (item) =>
            item.accountId === payload.accountId &&
            (!payload.workspaceId || item.workspaceId === payload.workspaceId),
        )
      })
      const offDeleted = ctx.on('workspace/deleted', (payload) => {
        rejectMatching((item) => item.workspaceId === payload.workspaceId)
      })
      return () => {
        offRevoked()
        offDeleted()
      }
    }, 'approvals.tenant-lifecycle')
    ctx.tools.guard(async (req) => {
      const actor = currentActorContext()
      const delegatedGroupCall = Boolean(
        actor?.type === 'agent' && actor.roomContext && actor.invokerId && actor.invokerId !== actor.delegatedBy,
      )
      if (!needsApproval(req.name, this.mode, delegatedGroupCall)) return req
      const id = crypto.randomUUID()
      const tenant = currentTenantScope()
      // 群聊跨人调用 Agent 触发敏感工具时，审批强绑定给 Agent Owner（delegatedBy），他人无法代点允许
      const accountId = (delegatedGroupCall && actor?.delegatedBy) || tenant.accountId
      const workspaceId = tenant.workspaceId
      const channelId = actor?.roomContext?.channelId
      const runId = actor?.runId
      const agentId = actor?.type === 'agent' ? actor.actorId : undefined
      const invokerId = actor?.invokerId
      const allow = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          if (!this.pending.has(id)) return
          this.pending.delete(id)
          resolve(false)
        }, this.holdTimeoutMs)
        this.pending.set(id, {
          req,
          accountId,
          workspaceId,
          ...(channelId ? { channelId } : {}),
          ...(runId ? { runId } : {}),
          ...(agentId ? { agentId } : {}),
          ...(invokerId ? { invokerId } : {}),
          resolve,
          timer,
        })
        const payload: ApprovalNotifyPayload = {
          id,
          name: req.name,
          args: req.args,
          ...(accountId ? { accountId } : {}),
          ...(workspaceId ? { workspaceId } : {}),
          ...(channelId ? { channelId } : {}),
          ...(runId ? { runId } : {}),
          ...(agentId ? { agentId } : {}),
          ...(invokerId ? { invokerId } : {}),
        }
        this.notify?.(payload)
        for (const fn of this.notifyListeners) {
          try {
            fn(payload)
          } catch {
            /* ignore */
          }
        }
      })
      return allow ? req : { ...req, deny: `denied: ${req.name}` }
    })
  }

  setNotify(notify: (payload: ApprovalNotifyPayload) => void) {
    this.notify = notify
  }

  onNotify(fn: (payload: ApprovalNotifyPayload) => void): () => void {
    this.notifyListeners.add(fn)
    return () => this.notifyListeners.delete(fn)
  }

  onDecide(fn: (payload: { id: string; allow: boolean; channelId?: string; runId?: string; accountId: string }) => void): () => void {
    this.decideListeners.add(fn)
    return () => this.decideListeners.delete(fn)
  }

  private matchesCurrentTenant(item: { accountId: string; workspaceId: string }) {
    const { accountId, workspaceId } = currentTenantScope()
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
    for (const fn of this.decideListeners) {
      try {
        fn({ id, allow, channelId: item.channelId, runId: item.runId, accountId: item.accountId })
      } catch {
        /* ignore */
      }
    }
    getNoticesPort(this.ctx)?.markSourceRead?.(`approval:${id}`)
    return { ok: true }
  }
}

function needsApproval(name: string, mode: 'auto' | 'hold', delegatedGroupCall = false) {
  if (name === 'db_delete') return true
  if (delegatedGroupCall) return sensitive(name) || name.startsWith('mcp_')
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
