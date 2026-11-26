import type { Context } from 'cordis'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
import type { RouteContext } from '@biu/types/http'
import { CollabError } from './store.ts'
import type { AccountService } from './index.ts'

function bearer(route: RouteContext) {
  const header = String(route.req.headers.authorization ?? '')
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  if (match) return match[1]!
  const cookie = String(route.req.headers.cookie ?? '')
  for (const part of cookie.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith('biu_account=')) return decodeURIComponent(trimmed.slice('biu_account='.length))
    if (trimmed.startsWith('biu_legacy_account=')) return decodeURIComponent(trimmed.slice('biu_legacy_account='.length))
  }
  return ''
}

function fail(route: RouteContext, error: unknown) {
  if (error instanceof CollabError) {
    route.send(error.status, { error: error.message })
    return
  }
  route.send(500, { error: String(error instanceof Error ? error.message : error) })
}

function cacheWorkspaceList(account: AccountService, accountId: string, payload: Record<string, unknown>) {
  const workspaces = Array.isArray(payload.workspaces) ? payload.workspaces : []
  for (const item of workspaces) {
    if (!item || typeof item !== 'object') continue
    const row = item as { id?: string; name?: string; ownerId?: string; role?: string; createdAt?: number }
    if (!row.id) continue
    account.store.upsertPulledWorkspace({
      accountId,
      id: String(row.id),
      name: String(row.name ?? ''),
      ownerId: row.ownerId,
      role: row.role,
      createdAt: row.createdAt,
    })
    account.markCloudWorkspace(String(row.id))
  }
}

export const name = 'desktop-cloud-link'
export const inject = ['http', 'account'] as const

/**
 * 桌面端专属：连接远端云端账号（cloud_connections / workspace_place / /api/account/cloud*）。
 * 通过 cordis.plugins.json 的 `profiles: ["desktop"]` 物理隔离，云端镜像不会打包或加载本插件。
 */
export function apply(ctx: Context) {
  if (!getRuntimePolicy().allowCloudLinking) return
  const account = ctx.get('account' as never) as AccountService | undefined
  if (!account) return

  function actor(route: RouteContext) {
    const token = bearer(route)
    const found = token ? account!.store.accountByToken(token) : null
    if (!found) throw new CollabError('需要登录', 401)
    return found
  }

  async function connectCloudIdentity(
    local: { id: string },
    action: 'login' | 'register',
    email: string,
    password: string,
    requestedOrigin = '',
    remoteName = '',
  ) {
    const origin = requestedOrigin.trim()
      ? account!.setConfiguredCloudOrigin(requestedOrigin)
      : account!.configuredCloudOrigin()
    if (!origin) throw new CollabError('请先配置远程主机服务地址', 400)
    let remote: Response
    try {
      remote = await fetch(`${origin}/api/account/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(remoteName.trim() ? { name: remoteName.trim() } : {}),
        }),
      })
    } catch {
      throw new CollabError('云端暂时连不上', 503)
    }
    const payload = (await remote.json().catch(() => ({}))) as {
      id?: string
      name?: string
      avatar?: string
      token?: string
      workspaceId?: string
      error?: string
    }
    if (!remote.ok || !payload.id || !payload.token) {
      throw new CollabError(payload.error || (action === 'login' ? '云端登录失败' : '云端注册失败'), remote.status || 400)
    }
    if (typeof payload.avatar === 'string') {
      account!.setCloudAvatar(origin, payload.id, payload.avatar)
    }
    const connection = account!.saveCloudConnection({
      localAccountId: local.id,
      origin,
      remoteAccountId: payload.id,
      remoteName: payload.name || remoteName.trim() || email,
      remoteEmail: email.trim().toLowerCase(),
      token: payload.token,
    })
    let workspaces: unknown[] = []
    try {
      const listed = await fetch(`${origin}/api/account/workspaces`, {
        headers: { authorization: `Bearer ${payload.token}` },
      })
      const listedBody = (await listed.json().catch(() => ({}))) as Record<string, unknown>
      if (listed.ok) {
        cacheWorkspaceList(account!, local.id, listedBody)
        workspaces = Array.isArray(listedBody.workspaces) ? listedBody.workspaces : []
      }
    } catch {
      /* 登录已经成功，空间稍后重试加载 */
    }
    const workspaceId = String(payload.workspaceId ?? '')
    if (workspaceId) {
      account!.markCloudWorkspace(workspaceId)
    }
    return {
      account: {
        id: connection.remoteAccountId,
        name: connection.remoteName,
        email: connection.remoteEmail,
        avatar: account!.cloudAvatar(connection.origin, connection.remoteAccountId),
      },
      origin: connection.origin,
      workspaceId,
      workspaces,
    }
  }

  async function connectCloud(route: RouteContext, action: 'login' | 'register') {
    const local = actor(route)
    const body = (await route.json()) as { email?: string; password?: string; origin?: string; name?: string }
    return connectCloudIdentity(
      local,
      action,
      String(body.email ?? ''),
      String(body.password ?? ''),
      String(body.origin ?? ''),
      String(body.name ?? ''),
    )
  }

  type RouteArg = Parameters<Parameters<typeof ctx.http.route>[2]>[0]
  const handledRoute = (
    method: Parameters<typeof ctx.http.route>[0],
    path: string,
    fn: (route: RouteArg) => Promise<void> | void,
  ) =>
    ctx.http.route(method, path, async (route) => {
      try {
        await fn(route)
      } catch (error) {
        fail(route, error)
      }
    })
  const authedRoute = (
    method: Parameters<typeof ctx.http.route>[0],
    path: string,
    fn: (route: RouteArg, me: ReturnType<typeof actor>) => Promise<void> | void,
  ) => handledRoute(method, path, (route) => fn(route, actor(route)))

  ctx.http.route(
    'GET',
    '/api/account/cloud/endpoint',
    async (route) => {
      try {
        const requested = String(route.query.get('workspaceId') ?? '').trim()
        const me = actor(route)
        const targetWorkspace = requested || account.store.activeWorkspaceId() || ''
        if (!targetWorkspace || account.workspaceLocation(targetWorkspace) !== 'cloud') {
          route.send(200, { mode: 'local', workspaceId: targetWorkspace })
          return
        }
        const remote = account.resolveCloudTarget(targetWorkspace, me.id)
        if (!remote) {
          route.send(401, { error: '请先登录云端账号' })
          return
        }
        route.send(200, {
          mode: 'cloud',
          origin: remote.origin,
          workspaceId: remote.workspaceId,
          token: remote.token,
        })
      } catch (error) {
        fail(route, error)
      }
    },
    { scope: 'host' },
  )

  handledRoute('GET', '/api/account/cloud', async (route) => {
    const me = actor(route)
    const initial = account.cloudConnection(me.id)
    if (initial?.origin && initial.token) {
      try {
        const res = await fetch(`${initial.origin}/api/account/me`, {
          headers: { authorization: `Bearer ${initial.token}` },
          signal: AbortSignal.timeout(2000),
        })
        if (res.ok) {
          const remoteMe = (await res.json().catch(() => ({}))) as {
            name?: unknown
            email?: unknown
            avatar?: unknown
          }
          account.updateCloudIdentity(me.id, initial.origin, initial.remoteAccountId, {
            ...(typeof remoteMe.name === 'string' && remoteMe.name.trim() ? { name: remoteMe.name } : {}),
            ...(typeof remoteMe.email === 'string' && remoteMe.email.trim() ? { email: remoteMe.email } : {}),
            ...(typeof remoteMe.avatar === 'string' ? { avatar: remoteMe.avatar } : {}),
          })
        }
      } catch {
        /* 远端不可达时沿用本地缓存的名称与默认头像 */
      }
    }
    const connection = account.cloudConnection(me.id)
    const configuredOrigin = account.configuredCloudOrigin()
    const accounts = account.listCloudConnections(me.id).map((item) => ({
      id: item.remoteAccountId,
      name: item.remoteName,
      email: item.remoteEmail,
      avatar: account.cloudAvatar(item.origin, item.remoteAccountId),
      origin: item.origin,
      active: item.active,
    }))
    route.send(200, {
      available: true,
      configuredOrigin,
      connected: Boolean(connection),
      accounts,
      ...(connection
        ? {
            account: {
              id: connection.remoteAccountId,
              name: connection.remoteName,
              email: connection.remoteEmail,
              avatar: account.cloudAvatar(connection.origin, connection.remoteAccountId),
            },
            origin: connection.origin,
          }
        : {}),
    })
  })

  handledRoute('POST', '/api/account/cloud/config', async (route) => {
    actor(route)
    const body = (await route.json()) as { origin?: string }
    const origin = account.setConfiguredCloudOrigin(String(body.origin ?? ''))
    route.send(200, { origin, available: true })
  })

  handledRoute('POST', '/api/account/cloud/login', async (route) => {
    route.send(200, await connectCloud(route, 'login'))
  })

  handledRoute('POST', '/api/account/cloud/register', async (route) => {
    route.send(201, await connectCloud(route, 'register'))
  })

  handledRoute('POST', '/api/account/cloud/sync-create', async (route) => {
    const local = actor(route)
    const body = (await route.json().catch(() => ({}))) as { origin?: string }
    const requestedOrigin = String(body.origin ?? '')
    if (!local.email) throw new CollabError('本地账号没有可同步的邮箱', 400)
    const password = account.store.recalledPassword(local.id)
    if (!password) throw new CollabError('请退出后重新登录一次，就能用本地密码创建云端账号', 400)
    try {
      route.send(201, {
        ...(await connectCloudIdentity(local, 'register', local.email, password, requestedOrigin, local.name)),
        created: true,
      })
    } catch (error) {
      if (!(error instanceof CollabError) || error.status !== 409) throw error
      route.send(200, {
        ...(await connectCloudIdentity(local, 'login', local.email, password, requestedOrigin)),
        created: false,
      })
    }
  })

  authedRoute('POST', '/api/account/cloud/active', async (route, me) => {
    const body = (await route.json()) as { remoteAccountId?: string; origin?: string }
    const connection = account.activateCloud(me.id, String(body.origin ?? ''), String(body.remoteAccountId ?? ''))
    ctx.http.broadcast('database', { ts: Date.now() })
    route.send(200, {
      account: {
        id: connection.remoteAccountId,
        name: connection.remoteName,
        email: connection.remoteEmail,
        avatar: account.cloudAvatar(connection.origin, connection.remoteAccountId),
      },
      origin: connection.origin,
    })
  })

  authedRoute('DELETE', '/api/account/cloud', async (route, me) => {
    const queryOrigin = String(route.query.get('origin') ?? '').trim()
    let bodyOrigin = ''
    if (!queryOrigin) {
      const body = (await route.json().catch(() => ({}))) as { origin?: string }
      bodyOrigin = String(body?.origin ?? '').trim()
    }
    account.removeCloudConnection(me.id, queryOrigin || bodyOrigin || undefined)
    ctx.http.broadcast('database', { ts: Date.now() })
    route.send(200, { ok: true, workspaceId: account.store.activeWorkspaceId() })
  })
}
