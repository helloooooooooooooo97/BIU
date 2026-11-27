import { spawn } from 'node:child_process'
import { mkdir, readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { currentRequestWorkspaceId } from '@biu/host-plugin-loader/data-dir'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
import { combineSignals, fetchHeaders } from './html.ts'
import { WebError } from './types.ts'

const MAX_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export function webImageDir(): string {
  const base = join(tmpdir(), 'biu-web')
  if (!getRuntimePolicy().isolateWorkspaceDirs) return base
  const workspaceId = currentRequestWorkspaceId().trim().replace(/[^a-zA-Z0-9_-]/g, '')
  if (!workspaceId) {
    throw new WebError('WEB_PROVIDER_ERROR', '云端模式缺少工作区上下文，拒绝写入网页临时缓存')
  }
  return join(base, 'workspaces', workspaceId)
}

function curlAvailable() {
  return new Promise<boolean>((resolve) => {
    const child = spawn('curl', ['--version'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}

let curlOk: Promise<boolean> | undefined
function hasCurl() {
  curlOk ??= curlAvailable()
  return curlOk
}

function runCurl(argv: string[], signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('curl', argv, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    const err: Buffer[] = []
    const onAbort = () => {
      child.kill('SIGTERM')
      reject(new Error('curl aborted'))
    }
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    child.stdout.on('data', (chunk) => chunks.push(chunk as Buffer))
    child.stderr.on('data', (chunk) => err.push(chunk as Buffer))
    child.on('error', reject)
    child.on('exit', (code) => {
      signal?.removeEventListener('abort', onAbort)
      if (code !== 0) {
        reject(new Error(`curl exited ${code}: ${Buffer.concat(err).toString('utf8').slice(0, 200)}`))
        return
      }
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
  })
}

const UA = fetchHeaders()['User-Agent']

async function fetchText(
  url: string,
  init: { method?: 'GET' | 'POST'; body?: string; headers?: Record<string, string>; signal?: AbortSignal },
) {
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    body: init.body,
    headers: fetchHeaders(init.headers),
    signal: combineSignals(init.signal),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.text()
}

export async function loadText(
  url: string,
  init: { method?: 'GET' | 'POST'; body?: string; headers?: Record<string, string>; signal?: AbortSignal } = {},
) {
  if (process.env.VITEST === 'true') return fetchText(url, init)
  const method = init.method ?? 'GET'
  if (await hasCurl()) {
    const argv = [
      '-sS',
      '--max-time',
      '15',
      '-A',
      UA,
      '-H',
      'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
    ]
    for (const [key, value] of Object.entries(init.headers ?? {})) {
      if (method === 'POST' && key.toLowerCase() === 'content-type') continue
      argv.push('-H', `${key}: ${value}`)
    }
    if (method === 'POST') argv.push('--data', init.body ?? '')
    else argv.push('-L')
    argv.push(url)
    return runCurl(argv, init.signal)
  }
  return fetchText(url, init)
}

export async function loadJson(url: string, signal?: AbortSignal) {
  const text = await loadText(url, { signal, headers: { Accept: 'application/json' } })
  return JSON.parse(text) as unknown
}

export type LoadRawOptions = {
  signal?: AbortSignal
  headers?: Record<string, string>
  validateUrl?: (url: string) => Promise<void> | void
}

async function fetchRaw(url: string, init: LoadRawOptions = {}) {
  let currentUrl = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(currentUrl, {
      headers: fetchHeaders(init.headers),
      signal: combineSignals(init.signal),
      redirect: init.validateUrl ? 'manual' : 'follow',
    })
    if (init.validateUrl && REDIRECT_STATUSES.has(res.status)) {
      const location = res.headers.get('location')
      if (!location) {
        const bytes = Buffer.from(await res.arrayBuffer())
        return { status: res.status, url: res.url || currentUrl, type: res.headers.get('content-type') ?? '', bytes }
      }
      if (hop >= MAX_REDIRECTS) {
        throw new WebError('WEB_PROVIDER_ERROR', `too many redirects (max ${MAX_REDIRECTS})`)
      }
      const nextUrl = new URL(location, currentUrl).href
      await init.validateUrl(nextUrl)
      currentUrl = nextUrl
      continue
    }
    const bytes = Buffer.from(await res.arrayBuffer())
    return {
      status: res.status,
      url: res.url || currentUrl,
      type: res.headers.get('content-type') ?? '',
      bytes,
    }
  }
  throw new WebError('WEB_PROVIDER_ERROR', `too many redirects (max ${MAX_REDIRECTS})`)
}

function sniffImageType(bytes: Buffer, url: string) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif'
  if (bytes.toString('ascii', 0, 16).includes('WEBP')) return 'image/webp'
  if (bytes.toString('utf8', 0, 200).includes('<svg')) return 'image/svg+xml'
  return url
}

export async function loadRaw(url: string, init: LoadRawOptions = {}) {
  if (process.env.VITEST === 'true') return fetchRaw(url, init)
  if (await hasCurl()) {
    const dir = webImageDir()
    await mkdir(dir, { recursive: true })
    let currentUrl = url
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const dest = join(dir, `page-${Date.now()}-${Math.random().toString(16).slice(2)}`)
      try {
        const argv = [
          '-sS',
          ...(init.validateUrl ? [] : ['-L']),
          '--max-time',
          '20',
          '-A',
          UA,
          '-o',
          dest,
          '-w',
          '%{http_code}\n%{content_type}\n%{url_effective}\n%{redirect_url}',
        ]
        for (const [key, value] of Object.entries(init.headers ?? {})) {
          argv.push('-H', `${key}: ${value}`)
        }
        argv.push(currentUrl)
        const meta = (await runCurl(argv, init.signal)).split('\n')
        const status = Number(meta[0]?.trim() || 0) || 200
        const type = (meta[1] || '').trim()
        const finalUrl = (meta[2] || currentUrl).trim() || currentUrl
        const redirectUrl = (meta[3] || '').trim()

        if (init.validateUrl && REDIRECT_STATUSES.has(status) && redirectUrl) {
          if (hop >= MAX_REDIRECTS) {
            throw new WebError('WEB_PROVIDER_ERROR', `too many redirects (max ${MAX_REDIRECTS})`)
          }
          const nextUrl = new URL(redirectUrl, currentUrl).href
          await init.validateUrl(nextUrl)
          currentUrl = nextUrl
          continue
        }

        const bytes = await readFile(dest)
        const sniffed = sniffImageType(bytes, '')
        return {
          status,
          url: finalUrl,
          type: type || (sniffed.startsWith('image/') ? sniffed : ''),
          bytes,
        }
      } finally {
        await unlink(dest).catch(() => undefined)
      }
    }
    throw new WebError('WEB_PROVIDER_ERROR', `too many redirects (max ${MAX_REDIRECTS})`)
  }
  return fetchRaw(url, init)
}
