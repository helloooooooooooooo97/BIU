export type CrumbRecord = { id: string; label: string; emoji?: string; mascot?: unknown }

const memoryRecords = new Map<string, CrumbRecord[]>()
const memoryRecordMeta = new Map<string, CrumbRecord>()

function recordsKey(collectionPath: string, viewId?: string) {
  return `${collectionPath}\0${viewId ?? ''}`
}

function recordMetaKey(collectionPath: string, recordId: string) {
  return `${collectionPath}\0id:${recordId}`
}

function keepCrumbLabel(row: CrumbRecord, prev?: CrumbRecord) {
  const next = String(row.label ?? '').trim()
  const last = String(prev?.label ?? '').trim()
  if (next && next !== row.id) return next
  if (last && last !== row.id) return last
  return next || last || row.id
}

let crumbsVersion = 0
const crumbListeners = new Set<() => void>()

function emitCrumbs() {
  crumbsVersion += 1
  for (const fn of crumbListeners) fn()
}

export function getCrumbsVersion() {
  return crumbsVersion
}

export function subscribeCrumbs(fn: () => void) {
  crumbListeners.add(fn)
  return () => {
    crumbListeners.delete(fn)
  }
}

export function rememberRecords(collectionPath: string, rows: CrumbRecord[], viewId?: string) {
  const painted = rows.map((row) => {
    const last = memoryRecordMeta.get(recordMetaKey(collectionPath, row.id))
    const next = {
      ...last,
      ...row,
      label: keepCrumbLabel(row, last),
      emoji: row.emoji !== undefined ? row.emoji : last?.emoji,
      mascot: row.mascot !== undefined ? row.mascot : last?.mascot,
    }
    memoryRecordMeta.set(recordMetaKey(collectionPath, row.id), next)
    return next
  })
  memoryRecords.set(recordsKey(collectionPath, viewId), painted)
  emitCrumbs()
}

export function applyListedCrumbMutation(
  path: string,
  mutation:
    | { op: 'patch'; row: CrumbRecord }
    | { op: 'create'; row: CrumbRecord; viewId?: string | null }
    | { op: 'remove'; ids: string[] },
) {
  if (mutation.op === 'patch') {
    const last = memoryRecordMeta.get(recordMetaKey(path, mutation.row.id))
    const next = {
      ...last,
      ...mutation.row,
      label: keepCrumbLabel(mutation.row, last),
      emoji: mutation.row.emoji !== undefined ? mutation.row.emoji : last?.emoji,
      mascot: mutation.row.mascot !== undefined ? mutation.row.mascot : last?.mascot,
    }
    memoryRecordMeta.set(recordMetaKey(path, mutation.row.id), next)
    for (const [key, rows] of memoryRecords) {
      if (!key.startsWith(`${path}\0`)) continue
      const at = rows.findIndex((row) => row.id === next.id)
      if (at < 0) continue
      const copy = rows.slice()
      copy[at] = { ...copy[at], ...next }
      memoryRecords.set(key, copy)
    }
    emitCrumbs()
    return
  }
  if (mutation.op === 'remove') {
    const gone = new Set(mutation.ids.map(String))
    let changed = false
    for (const [key, rows] of memoryRecords) {
      if (!key.startsWith(`${path}\0`)) continue
      const next = rows.filter((row) => !gone.has(row.id))
      if (next.length === rows.length) continue
      memoryRecords.set(key, next)
      changed = true
    }
    for (const id of gone) {
      if (memoryRecordMeta.delete(recordMetaKey(path, id))) changed = true
    }
    if (changed) emitCrumbs()
    return
  }
  const crumb = mutation.row
  memoryRecordMeta.set(recordMetaKey(path, crumb.id), crumb)
  const key = recordsKey(path, mutation.viewId ?? undefined)
  const prev = memoryRecords.get(key) ?? []
  memoryRecords.set(key, [crumb, ...prev.filter((row) => row.id !== crumb.id)])
  emitCrumbs()
}

export function loadRecords(collectionPath: string, viewId?: string): CrumbRecord[] {
  return memoryRecords.get(recordsKey(collectionPath, viewId)) ?? []
}

export function peekRecord(collectionPath: string, recordId: string): CrumbRecord | undefined {
  return memoryRecordMeta.get(recordMetaKey(collectionPath, recordId))
}

export function clearCrumbCache() {
  memoryRecords.clear()
  memoryRecordMeta.clear()
}
