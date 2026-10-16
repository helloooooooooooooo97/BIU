import { PaperClipIcon, XMarkIcon, ArrowDownTrayIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/16/solid'

function safeFileName(name: string) {
  const base = name.replace(/^.*[/\\]/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-')
  return base || `file-${Date.now()}`
}

export async function uploadDbAsset(file: File) {
  const name = `${Date.now()}-${safeFileName(file.name)}`
  const res = await fetch(`/api/db/file/hash/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'content-type': file.type || 'application/octet-stream' },
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

export function AttachmentFile({
  file,
  onRemove,
}: {
  file: { name: string; href: string }
  onRemove?: () => void
}) {
  return (
    <span className="fsdb-file">
      <PaperClipIcon aria-hidden className="size-[14px] shrink-0 opacity-80" />
      <span className="fsdb-file-name">{file.name}</span>
      <span className="fsdb-file-tools">
        <a
          className="tasks-icon-btn fsdb-file-dl"
          href={file.href}
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
            className="tasks-icon-btn is-danger fsdb-file-del"
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
