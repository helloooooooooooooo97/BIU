import type { Context } from 'cordis'
import { findRepoRoot } from '@biu/host-plugin-loader'
import { currentAccountId } from '@biu/host-plugin-loader/data-dir'
import { getAccountPort } from '@biu/host-plugin-loader/ports'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
import { behindMain, fetchMain, mergeMain, scheduleRestart, updateSource } from './git.ts'

export const name = 'update'
export const inject = ['http']

export type UpdateStatus = {
  behind: number
  ready: boolean
  remote?: string
  ref?: string
  error?: string
}

export function apply(ctx: Context) {
  const root = findRepoRoot()
  let status: UpdateStatus = { behind: 0, ready: false }
  let applying = false

  async function refresh() {
    try {
      await fetchMain(root)
      status = { behind: await behindMain(root), ready: true, ...updateSource() }
    } catch (error) {
      status = { ...status, ready: true, error: String(error) }
      ctx.logger('update').warn(error)
    }
    return status
  }

  ctx.on('http/ready', () => {
    void refresh()
  })

  function requireSuperAdmin(route: { send(status: number, body: unknown): void }): boolean {
    if (getRuntimePolicy().authzMode !== 'rbac') return true
    const accountId = currentAccountId()
    const isSuperAdmin = Boolean(accountId && getAccountPort(ctx)?.store?.isSuperAdmin?.(accountId))
    if (!isSuperAdmin) {
      route.send(403, { error: '仅超级管理员可执行云端服务更新' })
      return false
    }
    return true
  }

  ctx.http.route('GET', '/api/update', async (route) => {
    if (!requireSuperAdmin(route)) return
    if (!status.ready) await refresh()
    route.send(200, status)
  })

  ctx.http.route('POST', '/api/update', async (route) => {
    if (!requireSuperAdmin(route)) return
    if (applying) {
      route.send(409, { error: '更新进行中' })
      return
    }
    applying = true
    try {
      await fetchMain(root)
      const behind = await behindMain(root)
      if (behind <= 0) {
        applying = false
        status = { behind: 0, ready: true }
        route.send(200, { ok: true, restarting: false, merged: 0 })
        return
      }
      await mergeMain(root)
      status = { behind: 0, ready: true }
      route.send(200, { ok: true, restarting: true, merged: behind })
      setTimeout(() => {
        scheduleRestart(root)
        process.exit(0)
      }, 250)
    } catch (error) {
      applying = false
      const message = String(error)
      status = { ...status, error: message }
      ctx.logger('update').error(error)
      route.send(500, { error: message })
    }
  })
}
