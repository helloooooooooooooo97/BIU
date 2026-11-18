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

export function createSandboxFilesApi(resourcePath: () => string) {
  return {
    list: asAttachmentList,
    read: async (hrefOrName: string, as: 'text' | 'bytes' = 'text') => {
      const name = sandboxAssetName(hrefOrName)
      if (!name) throw new Error('attachment href required')
      const res = await fetch(`/api/db/file/${encodeURIComponent(name)}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || res.statusText)
      if (as === 'bytes') return new Uint8Array(await res.arrayBuffer())
      return res.text()
    },
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
    read: async (hrefOrName: string, as: 'text' | 'bytes' = 'text') => {
      const name = sandboxAssetName(hrefOrName)
      if (!name) throw new Error('document href required')
      const res = await fetch(`/api/db/file/${encodeURIComponent(name)}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || res.statusText)
      if (as === 'bytes') return new Uint8Array(await res.arrayBuffer())
      return res.text()
    },
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
