import { apiFetch } from '@biu/biu-ui/api-client'
import { useEffect, useState } from 'react'
import type { DbRecord } from '@biu/type-file-system'
import { FSDB_CHANGE_EVENT, parseFsdbChange, type FsdbChangeDetail } from '@biu/type-file-system'
import { hydrateRecordViewCatalog } from './record-view-catalog.ts'

export async function readDbRecord(path: string): Promise<DbRecord | null> {
  const want = String(path ?? '').trim()
  if (!want) return null
  try {
    const res = await apiFetch(`/api/db/read?path=${encodeURIComponent(want)}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json().catch(() => ({}))) as { value?: DbRecord }
    return data.value?.id ? data.value : null
  } catch {
    return null
  }
}

/** Agent / 其它页改完记录后，属性沙箱自己再拉一次，不指望父组件把 record 换掉。 */
export function liveRecordShouldPull(change: FsdbChangeDetail, collectionPath: string, recordId: string) {
  const want = `${collectionPath}/${recordId}`
  if (change.scope === 'views') return Boolean(change.path) && change.path === want
  if (change.scope !== 'records' && change.scope !== 'content') return false
  return change.path === want
}

export function useLiveDbRecord(collectionPath: string, record: DbRecord) {
  const recordId = String(record.id ?? '').trim()
  const [live, setLive] = useState(record)
  useEffect(() => {
    setLive(record)
  }, [record])
  useEffect(() => {
    if (!collectionPath || !recordId) return
    let gone = false
    const pull = () => {
      void readDbRecord(`${collectionPath}/${recordId}`).then((row) => {
        if (gone || !row?.id || row.id !== recordId) return
        setLive((prev) => ({ ...prev, ...row }))
      })
    }
    const onChange = (event: Event) => {
      const change = parseFsdbChange(event)
      const want = `${collectionPath}/${recordId}`
      if (change.scope === 'views') {
        if (!change.path || change.path !== want) return
        void readDbRecord(want).then((row) => {
          if (gone || !row?.id || row.id !== recordId) return
          hydrateRecordViewCatalog(collectionPath, recordId, row)
          setLive((prev) => ({
            ...prev,
            views: row.views,
            propViews: row.propViews,
            layouts: row.layouts,
          }))
        })
        return
      }
      if (change.scope === 'content' && change.path && change.path !== want) return
      if (!liveRecordShouldPull(change, collectionPath, recordId)) return
      pull()
    }
    window.addEventListener(FSDB_CHANGE_EVENT, onChange)
    return () => {
      gone = true
      window.removeEventListener(FSDB_CHANGE_EVENT, onChange)
    }
  }, [collectionPath, recordId])
  return [live, setLive] as const
}
