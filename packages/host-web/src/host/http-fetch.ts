import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { extractPageImages, extForImage, isImageContentType, looksLikeImageUrl, stripTags } from './html.ts'
import { loadRaw, webImageDir } from './http.ts'
import { WebError, type WebFetchProvider, type WebFetchRequest, type WebFetchResult } from './types.ts'

export { webImageDir }

const PRIVATE_HOSTNAME = /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i
const MAX_CHARS = 16_000
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export type DnsLookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>

const defaultDnsLookup: DnsLookupFn = (hostname) => lookup(hostname, { all: true })

function parseIpv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : -1))
  if (nums.some((n) => n < 0 || n > 255)) return null
  return nums as [number, number, number, number]
}

function isPrivateIpv4(ip: string): boolean {
  const octets = parseIpv4(ip)
  if (!octets) return false
  const [a, b] = octets
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true // 169.254.0.0/16 (link-local / cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 192 && b === 0 && octets[2] === 0) return true // 192.0.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15
  if (a >= 224) return true // 224.0.0.0/4 multicast & 240.0.0.0/4 reserved
  return false
}

function expandIpv6Hextets(raw: string): number[] | null {
  let addr = raw.toLowerCase()
  const zoneIdx = addr.indexOf('%')
  if (zoneIdx >= 0) addr = addr.slice(0, zoneIdx)

  // Handle embedded IPv4 tail (e.g. ::ffff:127.0.0.1)
  const lastColon = addr.lastIndexOf(':')
  if (lastColon >= 0 && addr.slice(lastColon + 1).includes('.')) {
    const v4 = parseIpv4(addr.slice(lastColon + 1))
    if (!v4) return null
    const hi = ((v4[0] << 8) | v4[1]).toString(16)
    const lo = ((v4[2] << 8) | v4[3]).toString(16)
    addr = `${addr.slice(0, lastColon + 1)}${hi}:${lo}`
  }

  const halves = addr.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - (left.length + right.length)
  if (halves.length === 1 && missing !== 0) return null
  if (halves.length === 2 && missing < 1) return null

  const full = [...left, ...Array<string>(Math.max(0, missing)).fill('0'), ...right]
  if (full.length !== 8) return null
  const hextets: number[] = []
  for (const part of full) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null
    hextets.push(Number.parseInt(part, 16))
  }
  return hextets
}

export function isPrivateIp(rawIp: string): boolean {
  const ip = rawIp.trim().replace(/^\[|\]$/g, '')
  const version = isIP(ip.split('%')[0] ?? ip)
  if (version === 4) return isPrivateIpv4(ip)
  if (version === 6) {
    const h = expandIpv6Hextets(ip)
    if (!h) return true
    const allZeroPrefix = h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0
    // :: (unspecified) and ::1 (loopback)
    if (allZeroPrefix && h[5] === 0 && h[6] === 0 && (h[7] === 0 || h[7] === 1)) return true
    // ::ffff:0:0/96 (IPv4-mapped IPv6, both dotted and hex forms)
    if (allZeroPrefix && h[5] === 0xffff) {
      const v4 = `${h[6]! >> 8}.${h[6]! & 0xff}.${h[7]! >> 8}.${h[7]! & 0xff}`
      return isPrivateIpv4(v4)
    }
    // 64:ff9b::/96 (NAT64 well-known prefix embedding IPv4)
    if (h[0] === 0x0064 && h[1] === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) {
      const v4 = `${h[6]! >> 8}.${h[6]! & 0xff}.${h[7]! >> 8}.${h[7]! & 0xff}`
      return isPrivateIpv4(v4)
    }
    // fc00::/7 (unique local)
    if ((h[0]! & 0xfe00) === 0xfc00) return true
    // fe80::/10 (link-local)
    if ((h[0]! & 0xffc0) === 0xfe80) return true
    // ff00::/8 (multicast)
    if ((h[0]! & 0xff00) === 0xff00) return true
    // 100::/64 (discard-only)
    if (h[0] === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return true
    return false
  }
  return false
}

export function assertHttpUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new WebError('WEB_INVALID_URL', `invalid url: ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebError('WEB_INVALID_URL', `only http/https urls are allowed: ${raw}`)
  }
  if (url.username || url.password) {
    throw new WebError('WEB_BLOCKED_URL', `refusing urls with credentials: ${url.origin}`)
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (PRIVATE_HOSTNAME.test(host) || isPrivateIp(host)) {
    throw new WebError('WEB_BLOCKED_URL', `refusing private/local url: ${raw}`)
  }
  return url
}

export async function assertSafeHttpUrl(raw: string, lookupFn?: DnsLookupFn): Promise<URL> {
  const url = assertHttpUrl(raw)
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (isIP(host) !== 0) return url
  // In Vitest without an explicit lookup mock, skip live DNS so mocked-fetch tests remain offline.
  if (!lookupFn && process.env.VITEST === 'true') return url
  const resolveHost = lookupFn ?? defaultDnsLookup
  let records: Array<{ address: string; family: number }>
  try {
    records = await resolveHost(host)
  } catch (error) {
    throw new WebError('WEB_PROVIDER_ERROR', `dns lookup failed for ${host}: ${String(error)}`)
  }
  if (!records.length) {
    throw new WebError('WEB_BLOCKED_URL', `no dns records for host: ${host}`)
  }
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new WebError('WEB_BLOCKED_URL', `refusing private/local resolved address (${record.address}) for: ${raw}`)
    }
  }
  return url
}

async function saveImageFile(url: string, mime: string, bytes: Buffer) {
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new WebError('WEB_PROVIDER_ERROR', `image too large: ${bytes.length} bytes`)
  }
  const dir = webImageDir()
  await mkdir(dir, { recursive: true })
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 12)
  const dest = join(dir, `${hash}${extForImage(mime, url)}`)
  await writeFile(dest, bytes)
  return dest
}

function sniffImageMime(bytes: Buffer): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif'
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  const head = bytes.toString('utf8', 0, Math.min(256, bytes.length)).trimStart()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml'
  return null
}

function sniffOrFallback(bytes: Buffer, url: string) {
  const sniffed = sniffImageMime(bytes)
  if (sniffed) return sniffed
  try {
    const path = new URL(url).pathname.toLowerCase()
    if (path.endsWith('.svg')) return 'image/svg+xml'
  } catch {
    if (/\.svg(\?|#|$)/i.test(url)) return 'image/svg+xml'
  }
  return looksLikeImageUrl(url) ? 'image/jpeg' : 'application/octet-stream'
}

export function httpFetchProvider(options?: { lookup?: DnsLookupFn }): WebFetchProvider {
  return {
    id: 'http',
    available: () => true,
    async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
      const target = await assertSafeHttpUrl(request.url, options?.lookup)
      let raw
      try {
        raw = await loadRaw(target.href, {
          signal,
          headers: looksLikeImageUrl(target.href)
            ? { Accept: 'image/*,*/*;q=0.8' }
            : { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
          validateUrl: async (nextUrl) => {
            await assertSafeHttpUrl(nextUrl, options?.lookup)
          },
        })
      } catch (error) {
        if (error instanceof WebError) throw error
        throw new WebError('WEB_PROVIDER_ERROR', `fetch failed: ${String(error)}`)
      }
      const type = raw.type.toLowerCase()
      const asImage = isImageContentType(type) || (looksLikeImageUrl(target.href) && !type.includes('html'))
      if (asImage) {
        const mime = sniffImageMime(raw.bytes) ?? (isImageContentType(type) ? type.split(';')[0]!.trim() : sniffOrFallback(raw.bytes, target.href))
        const path = await saveImageFile(raw.url || target.href, mime, raw.bytes)
        return {
          url: raw.url || target.href,
          statusCode: raw.status,
          body: {
            kind: 'file',
            content: `saved image ${mime} ${raw.bytes.length} bytes → ${path}`,
            path,
            mime,
            bytes: raw.bytes.length,
          },
          truncated: false,
        }
      }
      const text = raw.bytes.toString('utf8')
      const html = type.includes('html') || /<html[\s>]/i.test(text)
      const content = html ? stripTags(text) : text.replace(/\s+/g, ' ').trim()
      const truncated = content.length > MAX_CHARS
      const images = html ? extractPageImages(text, raw.url || target.href) : undefined
      return {
        url: raw.url || target.href,
        statusCode: raw.status,
        body: { kind: html ? 'html' : 'text', content: truncated ? content.slice(0, MAX_CHARS) : content },
        truncated,
        ...(images?.length ? { images } : {}),
      }
    },
  }
}
