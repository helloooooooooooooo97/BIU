import { DocumentIcon, PaperClipIcon, XMarkIcon, ArrowDownTrayIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/16/solid'

function safeFileName(name: string) {
  const base = name.replace(/^.*[/\\]/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-')
  return base || `file-${Date.now()}`
}

export function recordResourcePath(collectionPath?: string, recordId?: string) {
  const col = String(collectionPath ?? '').trim().replace(/\/+$/, '')
  const id = String(recordId ?? '').trim()
  if (!col) return id
  if (!id) return col
  if (col === id || col.endsWith(`/${id}`)) return col
  return `${col}/${id}`
}

export function isHashedFileName(name: string) {
  return /^[a-f0-9]{64}\./i.test(String(name ?? '').replace(/^.*[/\\]/, ''))
}

export function documentLogicalName(
  recordId: string,
  fieldKey: string,
  original: string,
  existing: Array<{ name: string; href: string }> = [],
) {
  const display = original.replace(/^.*[/\\]/, '') || `doc-${Date.now()}`
  const hit = existing.find((item) => item.name === display)
  const fromHref = hit
    ? String(hit.href ?? '')
        .split('?')[0]
        ?.replace(/^.*\//, '')
    : ''
  let decoded = fromHref
  try {
    decoded = fromHref ? decodeURIComponent(fromHref) : ''
  } catch {
    decoded = fromHref
  }
  if (decoded && !isHashedFileName(decoded)) return decoded
  const id = String(recordId || 'rec').replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'rec'
  const field = String(fieldKey || 'doc').replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'doc'
  return `doc-${id}-${field}-${safeFileName(display)}`
}

export async function uploadDbDocument(file: File, resourcePath: string, logicalName: string) {
  const path = String(resourcePath ?? '').trim()
  if (!path) throw new Error('resource path required')
  const name = String(logicalName ?? '').replace(/^.*[/\\]/, '').trim()
  if (!name || name.includes('/') || isHashedFileName(name)) throw new Error('invalid document name')
  const url = `/api/db/file/${encodeURIComponent(name)}?path=${encodeURIComponent(path)}`
  const headers: Record<string, string> = {
    'content-type': file.type || 'application/octet-stream',
    'x-biu-resource-path': path,
  }
  const prev = await fetch(url)
  if (prev.ok) {
    const etag = String(prev.headers.get('etag') ?? '').replace(/^W\//, '').replaceAll('"', '')
    if (etag) headers['if-match'] = `"${etag}"`
  }
  let res = await fetch(url, { method: 'PUT', headers, body: file })
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { etag?: string }
    const next = String(body.etag ?? res.headers.get('etag') ?? '').replace(/^W\//, '').replaceAll('"', '')
    if (next) {
      headers['if-match'] = `"${next}"`
      res = await fetch(url, { method: 'PUT', headers, body: file })
    }
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; href?: string; name?: string }
  if (!res.ok) throw new Error(data.error || res.statusText)
  return { name: data.name || name, href: data.href || `/api/db/file/${encodeURIComponent(data.name || name)}` }
}

export async function uploadDbAsset(file: File, resourcePath: string) {
  const path = String(resourcePath ?? '').trim()
  if (!path) throw new Error('resource path required')
  const name = `${Date.now()}-${safeFileName(file.name)}`
  const res = await fetch(`/api/db/file/hash/${encodeURIComponent(name)}?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: {
      'content-type': file.type || 'application/octet-stream',
      'x-biu-resource-path': path,
    },
    body: file,
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string; href?: string; name?: string }
  if (!res.ok) throw new Error(body.error || res.statusText)
  return { name: body.name || name, href: body.href || `/api/db/file/${encodeURIComponent(body.name || name)}` }
}

export function commitImages(list: string[], onCommit: (next: unknown) => void) {
  if (!list.length) onCommit('')
  else if (list.length === 1) onCommit(list[0])
  else onCommit(list)
}

function uniqueImageFiles(files: Array<File | null | undefined>): File[] {
  const seen = new Set<string>()
  const out: File[] = []
  for (const file of files) {
    if (!file || !file.type.startsWith('image/')) continue
    const key = `${file.name}\0${file.size}\0${file.lastModified}\0${file.type}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(file)
  }
  return out
}

export function uniqueFiles(files: Array<File | null | undefined>): File[] {
  const seen = new Set<string>()
  const out: File[] = []
  for (const file of files) {
    if (!file) continue
    const key = `${file.name}\0${file.size}\0${file.lastModified}\0${file.type}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(file)
  }
  return out
}

export function collectClipboardImages(clipboard: DataTransfer | null | undefined): File[] {
  if (!clipboard) return []
  const fromFiles = uniqueImageFiles(Array.from(clipboard.files ?? []))
  if (fromFiles.length) return fromFiles
  return uniqueImageFiles(Array.from(clipboard.items ?? []).map((item) => (item.kind === 'file' ? item.getAsFile() : null)))
}

export function collectClipboardFiles(clipboard: DataTransfer | null | undefined): File[] {
  if (!clipboard) return []
  const fromFiles = uniqueFiles(Array.from(clipboard.files ?? []))
  if (fromFiles.length) return fromFiles
  return uniqueFiles(Array.from(clipboard.items ?? []).map((item) => (item.kind === 'file' ? item.getAsFile() : null)))
}

export function pasteTargetIsField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

export function assetDownloadHref(href: string, name: string) {
  const path = String(href ?? '').trim()
  const file = String(name ?? '').replace(/^.*[/\\]/, '').trim()
  if (!file || !/^\/api\/(?:db|doc)\/file\//.test(path.split('?')[0] ?? '')) return path
  const join = path.includes('?') ? '&' : '?'
  return `${path}${join}download=${encodeURIComponent(file)}`
}

export function AttachmentFile({
  file,
  onRemove,
  kind = 'attachment',
}: {
  file: { name: string; href: string }
  onRemove?: () => void
  kind?: 'attachment' | 'document'
}) {
  return (
    <span className="fsdb-file is-chip" title={file.name}>
      {kind === 'document' ? (
        <DocumentIcon aria-hidden className="size-[14px] shrink-0" />
      ) : (
        <PaperClipIcon aria-hidden className="size-[14px] shrink-0" />
      )}
      <span className="fsdb-file-name">{file.name}</span>
      <span className="fsdb-file-tools">
        <a
          className="fsdb-file-act fsdb-file-dl"
          href={assetDownloadHref(file.href, file.name)}
          download={file.name}
          title="下载"
          aria-label={`下载 ${file.name}`}
          data-testid="fsdb-file-download"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ArrowDownTrayIcon aria-hidden className="size-[14px]" />
        </a>
        {onRemove ? (
          <button
            type="button"
            className="fsdb-file-act fsdb-file-del"
            title="删除"
            aria-label={`删除 ${file.name}`}
            data-testid="fsdb-file-remove"
            onClick={(event) => {
              event.stopPropagation()
              onRemove()
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <XMarkIcon aria-hidden className="size-[14px]" />
          </button>
        ) : null}
      </span>
    </span>
  )
}

export function UrlHref({ href }: { href: string }) {
  return (
    <span className="fsdb-file">
      <span className="fsdb-file-name">{href}</span>
      <span className="fsdb-file-tools">
        <a
          className="tasks-icon-btn fsdb-file-open"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title="新标签页打开"
          aria-label="新标签页打开"
          data-testid="fsdb-url-open"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ArrowTopRightOnSquareIcon aria-hidden className="size-[14px]" />
        </a>
      </span>
    </span>
  )
}
