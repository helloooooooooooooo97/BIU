import { asAttachmentList, type AttachmentValue } from '@biu/type-file-system'
import { documentLogicalName, uploadDbAsset, uploadDbDocument } from './cell-media.tsx'

export function sandboxAssetName(hrefOrName: string) {
  const raw = String(hrefOrName ?? '').trim()
  const path = raw.split('?')[0] ?? ''
  const hit = /\/api\/(?:db|doc)\/file\/([^/]+)$/.exec(path)
  if (hit?.[1]) {
    try {
      return decodeURIComponent(hit[1])
    } catch {
      return hit[1]
    }
  }
  if (raw && !raw.includes('/') && raw !== '.') return raw
  return ''
}

async function readDbAsset(
  hrefOrName: string,
  resourcePath: () => string,
  as: 'text' | 'bytes',
  emptyError: string,
) {
  const name = sandboxAssetName(hrefOrName)
  if (!name) throw new Error(emptyError)
  const path = String(resourcePath() ?? '').trim()
  const url = path
    ? `/api/db/file/${encodeURIComponent(name)}?path=${encodeURIComponent(path)}`
    : `/api/db/file/${encodeURIComponent(name)}`
  const init: RequestInit | undefined = path ? { headers: { 'x-biu-resource-path': path } } : undefined
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || res.statusText)
  if (as === 'bytes') return new Uint8Array(await res.arrayBuffer())
  return res.text()
}

export function createSandboxFilesApi(resourcePath: () => string) {
  return {
    list: asAttachmentList,
    read: (hrefOrName: string, as: 'text' | 'bytes' = 'text') =>
      readDbAsset(hrefOrName, resourcePath, as, 'attachment href required'),
    upload: async (file: File): Promise<AttachmentValue> => {
      const written = await uploadDbAsset(file, resourcePath())
      return {
        name: file.name || written.name,
        href: written.href,
        bytes: file.size,
      }
    },
  }
}

export function createSandboxDocsApi(resourcePath: () => string) {
  return {
    list: asAttachmentList,
    read: (hrefOrName: string, as: 'text' | 'bytes' = 'text') =>
      readDbAsset(hrefOrName, resourcePath, as, 'document href required'),
    write: async (hrefOrName: string, content: string | Blob) => {
      const name = sandboxAssetName(hrefOrName)
      if (!name) throw new Error('document href required')
      const blob = typeof content === 'string' ? new Blob([content], { type: 'text/plain; charset=utf-8' }) : content
      const file = blob instanceof File ? blob : new File([blob], name, { type: blob.type || 'application/octet-stream' })
      return uploadDbDocument(file, resourcePath(), name)
    },
    upload: async (file: File, opts?: { fieldKey?: string; recordId?: string; existing?: AttachmentValue[] }): Promise<AttachmentValue> => {
      const logical = documentLogicalName(opts?.recordId ?? '', opts?.fieldKey ?? 'doc', file.name, opts?.existing)
      const written = await uploadDbDocument(file, resourcePath(), logical)
      return {
        name: file.name || written.name,
        href: written.href,
        bytes: file.size,
      }
    },
  }
}
