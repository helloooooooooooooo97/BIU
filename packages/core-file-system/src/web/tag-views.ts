import { apiFetch } from '@biu/biu-ui/api-client'
import { PAGES_COLLECTION_PATH } from './database-path.ts'
import { FSDB_CHANGE_EVENT } from './fsdb-events.ts'

export function openHostRecordPath() {
  if (typeof document === 'undefined') return ''
  const host = document.querySelector('.page-editor')
  if (!(host instanceof HTMLElement)) return ''
  const stamped = String(host.dataset.livePath || host.dataset.pagePath || '').trim()
  if (stamped) return stamped
  const rec = String(host.dataset.pageRecord || '').trim()
  return rec ? `${PAGES_COLLECTION_PATH}/${rec}` : ''
}

export async function patchTagSandbox(path: string, tagId: string, values: Record<string, unknown>) {
  const recordPath = String(path ?? '').trim()
  const id = String(tagId ?? '').trim()
  if (!recordPath) throw new Error('no current record')
  if (!id) throw new Error('missing tag')
  const res = await apiFetch('/api/tag/sandbox/patch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: recordPath, tagId: id, values }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; value?: unknown }
  if (!res.ok) throw new Error(data.error || res.statusText)
  window.dispatchEvent(new Event(FSDB_CHANGE_EVENT))
  return data
}
