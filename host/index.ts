import { Context } from 'cordis'
import { join } from 'node:path'
import { importConfiguredPackage, readCordisConfig, resolveHostProfile, findRepoRoot, closeAllSharedBiuConnections } from '@biu/host-plugin-loader'
import { adoptPackedUserData, loadBiuEnv } from '@biu/host-plugin-loader/data-dir'
import { lanIPv4, printReadyBanner } from './banner.ts'
import './types.ts'

loadBiuEnv()
process.env.BIU_ONLINE = process.env.BIU_ONLINE || '1'

const rootDir = findRepoRoot()
const dataRoot = process.env.BIU_HOME || rootDir
const profile = resolveHostProfile()
adoptPackedUserData(rootDir, dataRoot, process.env.CORDIS_WORKSPACE || join(dataRoot, 'workspace'))

const ctx = new Context()
ctx.logger.exporter({
  export(message) {
    const time = new Date(message.ts).toISOString().slice(11, 23)
    const args = message.args.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' ')
    console.log(`${time} ${message.type.padEnd(5)} ${message.name} ${args}`)
  },
})

let shuttingDown = false
async function gracefulShutdown(signal: string) {
  if (shuttingDown) {
    process.exit(1)
    return
  }
  shuttingDown = true
  const timeoutMs = Math.max(1_000, Number(process.env.BIU_SHUTDOWN_TIMEOUT_MS) || 10_000)
  const forceTimer = setTimeout(() => {
    ctx.logger('boot').warn(`graceful shutdown timed out after ${timeoutMs}ms (${signal}), forcing exit`)
    process.exit(1)
  }, timeoutMs)
  forceTimer.unref()
  ctx.logger('boot').info(`received ${signal}, draining (${profile})...`)
  try {
    const http = ctx.get('http') as { beginDrain?: () => void } | undefined
    http?.beginDrain?.()
    await ctx.fiber.dispose()
    closeAllSharedBiuConnections()
  } catch (error) {
    ctx.logger('boot').error('shutdown error', error)
  } finally {
    clearTimeout(forceTimer)
    process.exit(0)
  }
}

process.once('SIGTERM', () => void gracefulShutdown('SIGTERM'))
process.once('SIGINT', () => void gracefulShutdown('SIGINT'))

let resolveHostReady!: (port: number) => void
const hostReady = new Promise<number>((resolve) => {
  resolveHostReady = resolve
})
ctx.on('http/ready', ({ port: ready }) => {
  resolveHostReady(ready)
  const ui = process.env.SHARE_PROXY_UI || `http://127.0.0.1:${ready}/`
  const api = `http://127.0.0.1:${ready}/`
  const share = `${ui.replace(/\/$/, '')}/share`
  if (process.env.SHARE_PROXY_UI) {
    ctx.logger('boot').info(`profile=${profile}  ·  api ${api}  ·  ui ${ui}  ·  share ${share}`)
    return
  }
  const lan = lanIPv4()
  printReadyBanner({
    ui,
    api,
    share: lan ? `http://${lan}:${ready}/share` : share,
  })
})

async function boot() {
  const config = readCordisConfig(rootDir, { profile })
  const hasHttp = (config.host ?? []).some((item) => item.id === 'http' && item.enabled !== false)
  for (const item of config.host ?? []) {
    if (!item.package || item.enabled === false) continue
    const mod = await importConfiguredPackage(rootDir, item.package)
    await ctx.plugin(mod, item.config)
  }
  if (!hasHttp) {
    ctx.logger('boot').info(`worker profile=${profile} ready (no HTTP listener)`)
    process.send?.({ type: 'biu:host-ready', port: 0 })
    return
  }
  const port = await hostReady
  process.send?.({ type: 'biu:host-ready', port })
}

boot().catch((error) => {
  console.error('boot failed', error)
  process.exit(1)
})
