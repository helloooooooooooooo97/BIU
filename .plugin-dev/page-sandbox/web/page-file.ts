export function assetName(file: string) {
  return file.replace(/^assets\//, '')
}

export function assetEtag(raw: string) {
  return raw.replace(/^W\//, '').replaceAll('"', '')
}

const fresh = new Set<string>()
const absent = new Set<string>()
const seedInflight = new Map<string, Promise<{ text: string; etag: string }>>()

export function markFreshSandboxAssets(...files: string[]) {
  for (const file of files) {
    const name = assetName(file)
    if (name) fresh.add(name)
  }
}

export function isFreshSandboxAsset(file: string) {
  return fresh.has(assetName(file))
}

export function resetSandboxAssetState() {
  fresh.clear()
  absent.clear()
  seedInflight.clear()
}

export function isAbsentSandboxAsset(file: string) {
  return absent.has(assetName(file))
}

export function pageResourcePath() {
  if (typeof document === 'undefined') return ''
  const host = document.querySelector('.page-editor')
  if (!(host instanceof HTMLElement)) return ''
  const stamped = String(host.dataset.livePath || host.dataset.pagePath || '').trim()
  if (stamped) return stamped
  const rec = String(host.dataset.pageRecord || '').trim()
  return rec ? `/pages/${rec}` : ''
}

export function pageFileUrl(name: string, opts?: { bust?: boolean; path?: string }) {
  const params = new URLSearchParams()
  if (opts?.bust) params.set('t', String(Date.now()))
  const path = String(opts?.path ?? pageResourcePath()).trim()
  if (path) params.set('path', path)
  const q = params.toString()
  return `/api/page/file/${encodeURIComponent(name)}${q ? `?${q}` : ''}`
}

function pageFileHeaders(headers: Record<string, string>, path: string) {
  if (path) headers['x-biu-resource-path'] = path
  return headers
}

export async function responseEtag(res: Response) {
  const header = assetEtag(String(res.headers.get('etag') ?? ''))
  if (header) return header
  try {
    const body = (await res.clone().json()) as { etag?: unknown }
    return assetEtag(String(body?.etag ?? ''))
  } catch {
    return ''
  }
}

export async function seedTextAsset(file: string, text: string, opts?: { json?: boolean; path?: string }) {
  const name = assetName(file)
  const pending = seedInflight.get(name)
  if (pending) return pending
  const path = String(opts?.path ?? pageResourcePath()).trim()
  const job = (async () => {
    const url = pageFileUrl(name, { path })
    const res = await fetch(url, {
      method: 'PUT',
      headers: pageFileHeaders(
        {
          'Content-Type': opts?.json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
        },
        path,
      ),
      body: text,
    })
    if (res.status === 409) {
      const current = await fetch(url)
      if (current.ok) {
        fresh.delete(name)
        absent.delete(name)
        return { text: await current.text(), etag: assetEtag(String(current.headers.get('etag') ?? '')) }
      }
      fresh.delete(name)
      return { text, etag: await responseEtag(res) }
    }
    if (!res.ok) {
      fresh.delete(name)
      return { text, etag: '' }
    }
    fresh.delete(name)
    absent.delete(name)
    return { text, etag: (await responseEtag(res)) || '' }
  })()
  seedInflight.set(name, job)
  try {
    return await job
  } finally {
    if (seedInflight.get(name) === job) seedInflight.delete(name)
  }
}

export async function loadTextAsset(
  file: string,
  fallback: string,
  opts?: { bust?: boolean; createOnMiss?: boolean; path?: string; json?: boolean },
) {
  const name = assetName(file)
  const path = String(opts?.path ?? pageResourcePath()).trim()
  const createOnMiss = opts?.createOnMiss !== false
  if (!opts?.bust && fresh.has(name) && createOnMiss) return seedTextAsset(file, fallback, { json: opts?.json, path })
  if (!createOnMiss && absent.has(name)) return { text: fallback, etag: '' }
  const res = await fetch(pageFileUrl(name, { bust: opts?.bust, path }))
  if (res.ok) {
    fresh.delete(name)
    absent.delete(name)
    return { text: await res.text(), etag: assetEtag(String(res.headers.get('etag') ?? '')) }
  }
  if (res.status === 404) {
    if (opts?.bust || !createOnMiss) {
      if (!createOnMiss) absent.add(name)
      return { text: fallback, etag: '' }
    }
    return seedTextAsset(file, fallback, { json: opts?.json, path })
  }
  return { text: fallback, etag: '' }
}

export async function saveTextAsset(
  file: string,
  text: string,
  etag: string,
  opts?: { json?: boolean; path?: string } | boolean,
) {
  const json = typeof opts === 'boolean' ? opts : Boolean(opts?.json)
  const path = String((typeof opts === 'boolean' ? undefined : opts?.path) ?? pageResourcePath()).trim()
  const name = assetName(file)
  const url = pageFileUrl(name, { path })
  const put = (match: string) => {
    const headers = pageFileHeaders(
      {
        'Content-Type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
      },
      path,
    )
    if (match) headers['If-Match'] = match
    return fetch(url, { method: 'PUT', headers, body: text })
  }
  let res = await put(etag)
  if (res.status === 409) {
    let next = await responseEtag(res)
    if (!next) {
      const current = await fetch(url)
      next = assetEtag(String(current.headers.get('etag') ?? ''))
    }
    if (next) res = await put(next)
  }
  if (!res.ok) return etag
  fresh.delete(name)
  absent.delete(name)
  return (await responseEtag(res)) || etag
}
