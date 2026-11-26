import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { Service, type Context } from 'cordis'
import { assetsRootPath, contentAddressHash, hashedAssetName } from '@biu/host-plugin-loader'
import type { BlobObjectMeta, BlobSignedTicket, BlobStorePort } from '@biu/host-plugin-loader/ports'

const DEFAULT_ASSET_TICKET_TTL_MS = 15 * 60 * 1000
const MAX_ASSET_TICKET_TTL_MS = 60 * 60 * 1000

function normalizeRelKey(key: string): string {
  const cleaned = String(key ?? '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!cleaned || cleaned.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) {
    throw new Error(`invalid blob key: ${key}`)
  }
  return cleaned
}

function resolveInsideRoot(rootDir: string, key: string): string {
  const base = resolve(rootDir)
  const target = resolve(base, normalizeRelKey(key))
  const rel = relative(base, target)
  if (!rel || rel.startsWith('..')) {
    throw new Error(`blob key escapes root: ${key}`)
  }
  return target
}

export class LocalFsBlobDriver extends Service implements BlobStorePort {
  readonly driver = 'local-fs'
  private fallbackProcessSecret: Buffer | null = null
  private readonly defaultRootDir?: string

  constructor(ctx: Context, config?: { rootDir?: string }) {
    super(ctx, 'blob')
    this.defaultRootDir = config?.rootDir
  }

  private root(override?: string): string {
    return override || this.defaultRootDir || assetsRootPath()
  }

  private signingSecret(): Buffer {
    const configured = String(process.env.BIU_ASSET_SIGN_SECRET ?? '').trim()
    if (configured) return Buffer.from(configured, 'utf8')
    if (!this.fallbackProcessSecret) this.fallbackProcessSecret = randomBytes(32)
    return this.fallbackProcessSecret
  }

  private computeSignature(uid: string, ws: string, exp: number): string {
    return createHmac('sha256', this.signingSecret())
      .update(`biu-asset-v1\n${uid}\n${ws}\n${exp}`)
      .digest('base64url')
  }

  async put(
    key: string,
    data: Buffer | Uint8Array | string,
    opts?: { contentType?: string; rootDir?: string },
  ): Promise<BlobObjectMeta> {
    const target = resolveInsideRoot(this.root(opts?.rootDir), key)
    await mkdir(dirname(target), { recursive: true })
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)
    await writeFile(target, buf)
    return {
      key: normalizeRelKey(key),
      size: buf.length,
      contentType: opts?.contentType,
      etag: contentAddressHash(buf),
      updatedAt: Date.now(),
    }
  }

  async get(key: string, opts?: { rootDir?: string }): Promise<Buffer | null> {
    const target = resolveInsideRoot(this.root(opts?.rootDir), key)
    try {
      return await readFile(target)
    } catch (error: any) {
      if (error?.code === 'ENOENT') return null
      throw error
    }
  }

  async head(key: string, opts?: { rootDir?: string }): Promise<BlobObjectMeta | null> {
    const target = resolveInsideRoot(this.root(opts?.rootDir), key)
    try {
      const info = await stat(target)
      if (!info.isFile()) return null
      return {
        key: normalizeRelKey(key),
        size: info.size,
        updatedAt: Math.floor(info.mtimeMs),
      }
    } catch (error: any) {
      if (error?.code === 'ENOENT') return null
      throw error
    }
  }

  async delete(key: string, opts?: { rootDir?: string }): Promise<boolean> {
    const target = resolveInsideRoot(this.root(opts?.rootDir), key)
    try {
      await unlink(target)
      return true
    } catch (error: any) {
      if (error?.code === 'ENOENT') return false
      throw error
    }
  }

  async list(prefix = '', opts?: { rootDir?: string }): Promise<string[]> {
    const base = resolve(this.root(opts?.rootDir))
    const normalizedPrefix = prefix.replace(/\\/g, '/').replace(/^\/+/, '')
    const results: string[] = []
    const walk = async (dir: string) => {
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch (error: any) {
        if (error?.code === 'ENOENT') return
        throw error
      }
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(full)
        } else if (entry.isFile()) {
          const rel = relative(base, full).replace(/\\/g, '/')
          if (!normalizedPrefix || rel.startsWith(normalizedPrefix)) {
            results.push(rel)
          }
        }
      }
    }
    await walk(base)
    results.sort()
    return results
  }

  async putCas(
    data: Buffer | Uint8Array,
    opts?: { ext?: string; rootDir?: string },
  ): Promise<{ hash: string; name: string; size: number }> {
    const buf = Buffer.from(data)
    const hash = contentAddressHash(buf)
    const ext = opts?.ext ? (opts.ext.startsWith('.') ? opts.ext : `.${opts.ext}`) : ''
    const name = hashedAssetName(buf, `blob${ext || '.bin'}`)
    const existing = await this.head(name, { rootDir: opts?.rootDir })
    if (!existing) {
      await this.put(name, buf, { rootDir: opts?.rootDir })
    }
    return { hash, name, size: buf.length }
  }

  async getCas(name: string, opts?: { rootDir?: string }): Promise<Buffer | null> {
    return this.get(name, { rootDir: opts?.rootDir })
  }

  signAssetTicket(input: {
    accountId: string
    workspaceId: string
    ttlMs?: number
    now?: number
  }): BlobSignedTicket {
    const uid = input.accountId.trim()
    const ws = input.workspaceId.trim()
    if (!uid || !ws) throw new Error('accountId and workspaceId are required to sign asset ticket')
    const now = input.now ?? Date.now()
    const ttl = Math.max(1_000, Math.min(input.ttlMs ?? DEFAULT_ASSET_TICKET_TTL_MS, MAX_ASSET_TICKET_TTL_MS))
    const exp = now + ttl
    const sig = this.computeSignature(uid, ws, exp)
    return { uid, ws, exp, sig }
  }

  verifyAssetTicket(
    query: URLSearchParams,
    now = Date.now(),
  ): { accountId: string; workspaceId: string } | null {
    const uid = String(query.get('uid') ?? '').trim()
    const ws = String(query.get('ws') ?? '').trim()
    const expRaw = String(query.get('exp') ?? '').trim()
    const sig = String(query.get('sig') ?? '').trim()
    if (!uid || !ws || !expRaw || !sig) return null
    const exp = Number(expRaw)
    if (!Number.isFinite(exp) || exp <= now) return null
    const expected = this.computeSignature(uid, ws, exp)
    const a = Buffer.from(sig, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    return { accountId: uid, workspaceId: ws }
  }

  resolveDownloadUrl(name: string, ticket?: BlobSignedTicket): string {
    const safeName = encodeURIComponent(name)
    const base = `/api/db/file/${safeName}`
    if (!ticket) return base
    const qs = new URLSearchParams({
      uid: ticket.uid,
      ws: ticket.ws,
      exp: String(ticket.exp),
      sig: ticket.sig,
    })
    return `${base}?${qs.toString()}`
  }
}

export const name = 'driver-blob-fs'
export const inject = [] as const

export function apply(ctx: Context, config?: { rootDir?: string }) {
  new LocalFsBlobDriver(ctx, config)
}

export { extname }
