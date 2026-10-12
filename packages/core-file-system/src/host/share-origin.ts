import { networkInterfaces } from 'node:os'
import type { IncomingMessage } from 'node:http'

export function firstLanIPv4() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address
    }
  }
  return ''
}

export function resolvedSharePort() {
  const raw = process.env.SHARE_PORT
  if (raw !== undefined && raw !== '') return Number(raw)
  if (process.env.VITEST) return 0
  return Number(process.env.PORT ?? 3141)
}

function browserOrigin(req?: IncomingMessage) {
  const origin = String(req?.headers.origin ?? '').trim()
  if (/^https?:\/\//i.test(origin)) {
    try {
      return new URL(origin).origin
    } catch {
      /* ignore malformed Origin */
    }
  }
  const referer = String(req?.headers.referer ?? '').trim()
  if (/^https?:\/\//i.test(referer)) {
    try {
      return new URL(referer).origin
    } catch {
      /* ignore malformed Referer */
    }
  }
  const host = String(req?.headers.host ?? '').trim()
  if (!host) return ''
  const proto = String(req?.headers['x-forwarded-proto'] ?? 'http')
  return `${proto}://${host}`
}

/** 本机回环地址换成局域网 IP，端口保持访问时的端口。 */
function withLanHost(origin: string) {
  try {
    const url = new URL(origin)
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1' && url.hostname !== '::1') return url.origin
    const ip = firstLanIPv4()
    if (!ip) return url.origin
    url.hostname = ip
    return url.origin
  } catch {
    return origin
  }
}

/** 分享走已经打开的页面端口：本机 UI 或云端 UI，不再另开分享端口。 */
export function publicShareOrigin(req?: IncomingMessage) {
  const env = process.env.SHARE_PUBLIC_URL?.replace(/\/$/, '')
  if (env) return env
  const ui = process.env.SHARE_PROXY_UI?.replace(/\/$/, '')
  if (ui) return withLanHost(ui)
  const fromRequest = browserOrigin(req)
  if (fromRequest) return withLanHost(fromRequest)
  const sharePort = resolvedSharePort()
  if (sharePort > 0) {
    const ip = firstLanIPv4()
    return `http://${ip || '127.0.0.1'}:${sharePort}`
  }
  return 'http://127.0.0.1:3141'
}

export function publicShareUrl(req: IncomingMessage | undefined, token: string) {
  return `${publicShareOrigin(req)}/share/${encodeURIComponent(token)}`
}
