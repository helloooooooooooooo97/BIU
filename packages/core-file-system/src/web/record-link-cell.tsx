import { useEffect, useMemo, useState } from 'react'
import { ArrowPathIcon } from '@heroicons/react/16/solid'
import { PickOption, PickPanel } from '@biu/database-ui/search'
import type { DbRecord, FieldSpec } from '@biu/type-file-system'
import { listCollection, readJson } from './db-client.ts'
import { getDatabaseUi } from './database-ui.ts'
import { showRecordInInspector } from './inspector-db-route.ts'
import { RecordMark, recordMarkStub } from './record-mark.tsx'
import { crumbRecordLabel, normalizeRecordEmoji } from './sidebar-preview.ts'
import { isSingleRefField, recordLinkIds } from './fields.ts'

export type RecordLinkPeer = { id: string; label: string; emoji: string }

function labelOf(row: DbRecord, labelField?: string) {
  return crumbRecordLabel(row, labelField)
}

function asPeers(rows: DbRecord[], labelField?: string): RecordLinkPeer[] {
  return rows.map((row) => ({ id: row.id, label: labelOf(row, labelField), emoji: normalizeRecordEmoji(row.emoji) }))
}

const TABLE_PAGE = 200
const TABLE_CAP = 500

async function loadTablePeers(path: string, labelField?: string): Promise<RecordLinkPeer[]> {
  const first = await listCollection({ path, limit: TABLE_PAGE, offset: 0, sortField: 'id', columns: ['label', 'emoji'] })
  const rows = [...first.items]
  while (rows.length < first.total && rows.length < TABLE_CAP) {
    const more = await listCollection({ path, limit: TABLE_PAGE, offset: rows.length, sortField: 'id', columns: ['label', 'emoji'] })
    if (!more.items.length) break
    rows.push(...more.items)
  }
  return asPeers(rows, labelField ?? first.schema?.labelField)
}

const peerReads = new Map<string, Promise<RecordLinkPeer | null>>()

async function readPeer(collectionPath: string, id: string, labelField?: string): Promise<RecordLinkPeer | null> {
  const key = `${collectionPath}\0${id}\0${labelField ?? ''}`
  const pending = peerReads.get(key)
  if (pending) return pending
  const request = (async () => {
    try {
      const body = await readJson<{ value?: DbRecord }>(
        `/api/db/read?path=${encodeURIComponent(`${collectionPath}/${id}`)}`,
      )
      const row = body.value
      if (!row?.id) return null
      return { id: row.id, label: labelOf(row, labelField), emoji: normalizeRecordEmoji(row.emoji) }
    } catch {
      return null
    }
  })()
  peerReads.set(key, request)
  return request
}

function linkCollection(field: FieldSpec | undefined, fallback?: string) {
  const raw = typeof field?.collection === 'string' ? field.collection.trim() : ''
  return raw || fallback || ''
}

function collectionMarkIcon(path: string) {
  return path.replace(/\/+$/, '') === '/pages' ? 'document' : undefined
}

function PeerMark({ id, emoji, collectionPath }: { id: string; emoji?: string; collectionPath: string }) {
  const Icon = getDatabaseUi()?.chrome(collectionPath).Icon
  return (
    <span className="fsdb-ref-mark">
      <RecordMark
        emoji={emoji}
        record={recordMarkStub({ id, emoji })}
        Icon={Icon}
        tableIcon={collectionMarkIcon(collectionPath)}
        className="size-4"
      />
    </span>
  )
}

function jumpRecord(collectionPath: string | undefined, id: string, onOpen?: (id: string) => void) {
  if (!id) return
  if (onOpen) {
    onOpen(id)
    return
  }
  if (!collectionPath) return
  showRecordInInspector(collectionPath, id)
}

function useResolvedPeerLabels(
  ids: string[],
  seed: RecordLinkPeer[] | undefined,
  collectionPath: string | undefined,
  labelField?: string,
  deferMissing?: boolean,
) {
  const seedMap = useMemo(() => new Map((seed ?? []).map((item) => [item.id, item])), [seed])
  const idKey = ids.join('\0')
  const [extra, setExtra] = useState<Record<string, RecordLinkPeer>>({})
  useEffect(() => {
    const missing = ids.filter((id) => !seedMap.has(id))
    if (deferMissing || !collectionPath || !missing.length) {
      setExtra({})
      return
    }
    let cancelled = false
    void Promise.all(missing.map((id) => readPeer(collectionPath, id, labelField))).then((rows) => {
      if (cancelled) return
      const next: Record<string, RecordLinkPeer> = {}
      missing.forEach((id, index) => {
        const peer = rows[index]
        if (peer) next[id] = peer
      })
      setExtra(next)
    })
    return () => {
      cancelled = true
    }
  }, [collectionPath, deferMissing, idKey, labelField, seedMap])
  return (id: string) => seedMap.get(id) ?? extra[id]
}

export function RecordLinkChips({
  field,
  fieldKey,
  value,
  records,
  collectionPath,
  labelField,
  deferMissing,
  onOpen,
}: {
  field?: FieldSpec
  fieldKey: string
  value: unknown
  records?: DbRecord[]
  collectionPath?: string
  labelField?: string
  deferMissing?: boolean
  /** 分享页里跳到同一条分享链接下的记录，而不是打开本机检查器。 */
  onOpen?: (id: string) => void
}) {
  const ids = recordLinkIds(field, value, fieldKey)
  const peerPath = linkCollection(field, collectionPath)
  const seed = useMemo(() => asPeers(records ?? [], labelField), [labelField, records])
  const labelOfId = useResolvedPeerLabels(ids, seed, peerPath, labelField, deferMissing)
  if (!ids.length) return null
  return (
    <span className="fsdb-ref-chips">
      {ids.map((id) => {
        const peer = labelOfId(id)
        const label = (peer?.label ?? '').replace(/\s+/g, ' ').trim()
        return (
          <button
            key={id}
            type="button"
            className="fsdb-ref-chip"
            title={onOpen ? (label || '打开') : label ? `在右侧打开 ${label}` : '在右侧打开'}
            onClick={(event) => {
              event.stopPropagation()
              jumpRecord(peerPath, id, onOpen)
            }}
          >
            <PeerMark id={id} emoji={peer?.emoji} collectionPath={peerPath} />
            <span className="fsdb-ref-chip-title">{label || (deferMissing ? id : '…')}</span>
          </button>
        )
      })}
    </span>
  )
}

export function RecordPickPanel({
  field,
  fieldKey,
  value,
  collectionPath,
  excludeId,
  labelField,
  seed,
  onChange,
  onPicked,
  onJump,
}: {
  field?: FieldSpec
  fieldKey: string
  value: unknown
  collectionPath: string
  excludeId?: string
  labelField?: string
  seed?: DbRecord[]
  onChange: (next: unknown) => void
  onPicked?: () => void
  onJump?: () => void
}) {
  const multiple = !isSingleRefField(field, fieldKey)
  const peerPath = linkCollection(field, collectionPath)
  const selected = recordLinkIds(field, value, fieldKey)
  const [query, setQuery] = useState('')
  const [peers, setPeers] = useState<RecordLinkPeer[]>(() => asPeers(seed ?? [], labelField))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void loadTablePeers(peerPath, labelField)
      .then((rows) => {
        if (!cancelled) setPeers(rows)
      })
      .catch(() => {
        if (!cancelled) setPeers(asPeers(seed ?? [], labelField))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [peerPath, labelField])

  const byId = useMemo(() => new Map(peers.map((item) => [item.id, item])), [peers])
  const selectedKey = selected.join('\0')
  const [extra, setExtra] = useState<Record<string, RecordLinkPeer>>({})
  useEffect(() => {
    const missing = selected.filter((id) => !byId.has(id))
    if (!missing.length) {
      setExtra({})
      return
    }
    let cancelled = false
    void Promise.all(missing.map((id) => readPeer(peerPath, id, labelField))).then((rows) => {
      if (cancelled) return
      const next: Record<string, RecordLinkPeer> = {}
      missing.forEach((id, index) => {
        const peer = rows[index]
        if (peer) next[id] = peer
      })
      setExtra(next)
    })
    return () => {
      cancelled = true
    }
  }, [byId, peerPath, labelField, selectedKey])
  const peerOf = (id: string) => byId.get(id) ?? extra[id]
  const titleOf = (id: string) => {
    const labeled = peerOf(id)?.label
    return labeled && labeled.trim() ? labeled : ''
  }
  const q = query.trim().toLowerCase()
  const available = peers.filter(
    (item) =>
      item.id !== excludeId &&
      (!q || item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)),
  )

  function commit(nextIds: string[]) {
    if (multiple) onChange(nextIds)
    else onChange(nextIds[0] ?? '')
  }

  function pick(id: string) {
    if (!id || id === excludeId) return
    if (multiple) {
      commit(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id])
    } else {
      commit(id === selected[0] ? [] : [id])
      onPicked?.()
    }
    setQuery('')
  }

  function jump(id: string) {
    jumpRecord(peerPath, id)
    onJump?.()
  }

  return (
    <PickPanel
      className="fsdb-ref-pick"
      query={query}
      onQuery={setQuery}
      placeholder="搜索本表记录"
      onEnter={() => {
        if (available[0]) pick(available[0].id)
      }}
      picked={
        selected.length
          ? selected.map((id) => (
              <div key={id} className="fsdb-ref-picked-row">
                <button type="button" className="fsdb-ref-jump" onClick={() => jump(id)} title={titleOf(id) || '在右侧打开'}>
                  <PeerMark id={id} emoji={peerOf(id)?.emoji} collectionPath={peerPath} />
                  <span className="fsdb-ref-title">{titleOf(id) || '…'}</span>
                </button>
                <button
                  type="button"
                  className="fsdb-ref-x"
                  aria-label={`取消引用 ${titleOf(id) || '记录'}`}
                  onClick={() => commit(selected.filter((item) => item !== id))}
                >
                  ×
                </button>
              </div>
            ))
          : null
      }
      empty={
        loading ? (
          <div className="fsdb-person-loading">
            <ArrowPathIcon className="size-[14px] fsdb-spin" aria-hidden />
            加载本表…
          </div>
        ) : !available.length ? (
          <div className="fsdb-person-loading">本表没有可选项</div>
        ) : null
      }
    >
      {available.map((item) => (
        <PickOption
          key={item.id}
          className="fsdb-ref-row"
          selected={selected.includes(item.id)}
          title={item.label}
          onClick={() => pick(item.id)}
        >
          <PeerMark id={item.id} emoji={item.emoji} collectionPath={peerPath} />
          <span className="fsdb-ref-title">{item.label}</span>
        </PickOption>
      ))}
    </PickPanel>
  )
}
