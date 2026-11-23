import { apiFetch } from '@biu/biu-ui/api-client'
import type { PickRef } from '@biu/core-pick/web'
import { filePickFromPath } from '@biu/core-pick/web'
import { IMAGE_MIMES } from './clipboard-images.ts'
import { fileAbsolutePath } from './drop-file-paths.ts'

/** 浏览器拖放拿不到本机路径时，文件写入会话 artifacts；超过 32MB 拒绝。 */
export const MAX_COMPOSER_UPLOAD_BYTES = 32 * 1024 * 1024

export function filesNeedingUpload(files: FileList | File[] | null | undefined): File[] {
  if (!files) return []
  return Array.from(files).filter((file) => !fileAbsolutePath(file) && !IMAGE_MIMES.has(file.type))
}

export async function uploadComposerFile(sessionId: string, file: File): Promise<string> {
  if (!sessionId) throw new Error('session required')
  if (file.size > MAX_COMPOSER_UPLOAD_BYTES) throw new Error('文件太大')
  const name = encodeURIComponent(file.name || 'file.bin')
  const res = await apiFetch(`/api/agents/${encodeURIComponent(sessionId)}/artifacts?name=${name}`, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string; path?: string }
  if (!res.ok || !body.path) throw new Error(body.error || '上传失败')
  return body.path
}

export function filePickFromUpload(path: string, file: File, route = ''): PickRef | null {
  const ref = filePickFromPath(path, route)
  if (!ref) return null
  const label = file.name.trim() || ref.label
  return { ...ref, label, title: label }
}
