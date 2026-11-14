import { useEffect, useState } from 'react'
import type { DbRecord } from '@biu/type-file-system'

export async function readDbRecord(path: string): Promise<DbRecord | null> {
  const want = String(path ?? '').trim()
  if (!want) return null
  try {
    const res = await fetch(`/api/db/read?path=${encodeURIComponent(want)}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json().catch(() => ({}))) as { value?: DbRecord }
    return data.value?.id ? data.value : null
  } catch {
    return null
  }
}

/** Agent / 其它页改完记录后，属性沙箱自己再拉一次，不指望父组件把 record 换掉。 */
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
      const detail = (event as CustomEvent<{ views?: boolean }>).detail
      if (detail?.views) return
      pull()
    }
    window.addEventListener('fsdb:change', onChange)
    return () => {
      gone = true
      window.removeEventListener('fsdb:change', onChange)
    }
  }, [collectionPath, recordId])
  return [live, setLive] as const
}
