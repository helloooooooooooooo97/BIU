import { apiFetch } from '@biu/biu-ui/api-client'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { matchSchemaField, resolveSchemaFieldKey, type DbRecord } from '@biu/type-file-system'
import { normalizeCollectionPath } from '../paths.ts'
import { databaseRecordPath } from './database-path.ts'
import { showInInspector } from './inspector-db-route.ts'
import {
  putRecordViewFile,
  readRecordViewFile,
  RecordViewFileConflictError,
  useRecordViewFileTick,
} from './record-sandboxes.ts'
import { createSandboxDocsApi, createSandboxFilesApi } from './sandbox-files.ts'

export type SandboxFieldInfo = {
  key: string
  label: string
  type: string
  writable: boolean
  spec?: unknown
}

export type SandboxTagBag = {
  tags: string[]
  values: Record<string, Record<string, unknown>>
}

export type SandboxToastTone = 'info' | 'ok' | 'error'

function parseTagFieldPath(raw: string): { tagId: string; key: string } | null {
  const text = String(raw ?? '').trim()
  if (!text.startsWith('tag.')) return null
  const rest = text.slice(4)
  const dot = rest.indexOf('.')
  if (dot <= 0 || dot >= rest.length - 1) return null
  return { tagId: rest.slice(0, dot), key: rest.slice(dot + 1) }
}

export function readRecordTagBag(record: DbRecord): SandboxTagBag {
  const raw = record.tag
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
  }
  const bag = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as { tags?: unknown; values?: unknown })
    : {}
  const tags = Array.isArray(bag.tags) ? bag.tags.map((item) => String(item ?? '').trim()).filter(Boolean) : []
  const values: Record<string, Record<string, unknown>> = {}
  if (bag.values && typeof bag.values === 'object' && !Array.isArray(bag.values)) {
    for (const [tagId, entries] of Object.entries(bag.values as Record<string, unknown>)) {
      if (entries && typeof entries === 'object' && !Array.isArray(entries)) {
        values[tagId] = { ...(entries as Record<string, unknown>) }
      }
    }
  }
  return { tags, values }
}

function parseJsonOrNull(text: string): unknown {
  const trimmed = String(text ?? '').trim()
  if (!trimmed || trimmed === 'null') return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

export type RecordSandboxBiuOptions<TExtra extends Record<string, unknown> = Record<string, never>> = {
  collectionPath: string
  recordId: string
  live: DbRecord
  fields: SandboxFieldInfo[]
  dataFile?: string
  writeRecord: (bag: Record<string, unknown>) => Promise<void>
  subscribeRecord: (listener: () => void) => () => void
  getLiveRecord: () => DbRecord
  onToast?: (message: string, tone: SandboxToastTone) => void
  extra?: TExtra
}

export function createRecordSandboxBiu<TExtra extends Record<string, unknown> = Record<string, never>>(
  opts: RecordSandboxBiuOptions<TExtra>,
) {
  const collectionPath = normalizeCollectionPath(opts.collectionPath)
  const recordId = String(opts.recordId ?? '').trim()
  const recordPath = collectionPath && recordId ? `${collectionPath}/${recordId}` : ''
  const dataFile = String(opts.dataFile ?? '').trim()
  const files = createSandboxFilesApi(() => recordPath)
  const docs = createSandboxDocsApi(() => recordPath)

  const getTagValue = (tagId: string, key: string) => {
    const id = String(tagId ?? '').trim()
    const field = String(key ?? '').trim()
    if (!id || !field) return undefined
    const bag = readRecordTagBag(opts.getLiveRecord())
    return bag.values[id]?.[field]
  }

  const setTagValue = async (tagId: string, key: string, value: unknown) => {
    const id = String(tagId ?? '').trim()
    const field = String(key ?? '').trim()
    if (!id || !field) return
    const current = readRecordTagBag(opts.getLiveRecord())
    const nextTags = current.tags.includes(id) ? current.tags : [...current.tags, id]
    const nextValues = {
      ...current.values,
      [id]: {
        ...(current.values[id] ?? {}),
        [field]: value,
      },
    }
    await opts.writeRecord({ tag: { tags: nextTags, values: nextValues } })
  }

  const get = (key: string) => {
    const tagHit = parseTagFieldPath(key)
    if (tagHit) return getTagValue(tagHit.tagId, tagHit.key)
    const live = opts.getLiveRecord()
    return live[resolveSchemaFieldKey(opts.fields, key)]
  }

  const set = async (key: string, value: unknown) => {
    const tagHit = parseTagFieldPath(key)
    if (tagHit) {
      await setTagValue(tagHit.tagId, tagHit.key, value)
      return
    }
    const nextKey = resolveSchemaFieldKey(opts.fields, key)
    if (!nextKey) return
    await opts.writeRecord({ [nextKey]: value })
  }

  const patch = async (bag: unknown) => {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) {
      throw new Error('patch values must be an object')
    }
    await opts.writeRecord(bag as Record<string, unknown>)
  }

  const read = async () => {
    if (!dataFile) return null
    const text = await readRecordViewFile(collectionPath, recordId, dataFile, 'null')
    return parseJsonOrNull(text)
  }

  const write = async (value: unknown) => {
    if (!dataFile) return
    await putRecordViewFile(
      collectionPath,
      recordId,
      dataFile,
      JSON.stringify(value ?? null, null, 2),
      'application/json',
    )
  }

  const updateData = async <T = unknown>(updater: (current: T | null) => T): Promise<T | null> => {
    if (!dataFile) return null
    const maxAttempts = 3
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const text = await readRecordViewFile(collectionPath, recordId, dataFile, 'null', { fresh: attempt > 0 })
      const current = parseJsonOrNull(text) as T | null
      const next = updater(current)
      try {
        await putRecordViewFile(
          collectionPath,
          recordId,
          dataFile,
          JSON.stringify(next ?? null, null, 2),
          'application/json',
          { onConflict: attempt < maxAttempts - 1 ? 'throw' : 'overwrite' },
        )
        return next
      } catch (error) {
        if (error instanceof RecordViewFileConflictError && attempt < maxAttempts - 1) continue
        throw error
      }
    }
    return null
  }

  const open = (target: string) => {
    const raw = String(target ?? '').trim()
    if (!raw || typeof window === 'undefined') return
    if (raw.startsWith('/')) {
      const parts = raw.split('/').filter(Boolean)
      if (parts.length < 2) return
      const targetId = parts.pop()!
      const targetCollection = `/${parts.join('/')}`
      showInInspector(targetCollection, databaseRecordPath(targetCollection, targetId), { unique: true })
      return
    }
    if (!collectionPath) return
    showInInspector(collectionPath, databaseRecordPath(collectionPath, raw), { unique: true })
  }

  const toast = (message: string, tone: SandboxToastTone = 'info') => {
    const text = String(message ?? '').trim()
    if (!text) return
    opts.onToast?.(text, tone)
  }

  const children = async (): Promise<DbRecord[]> => {
    if (!collectionPath || !recordId) return []
    const res = await apiFetch('/api/db/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: collectionPath }),
    })
    if (!res.ok) return []
    const payload = (await res.json().catch(() => ({}))) as { records?: DbRecord[]; items?: DbRecord[] }
    const list = Array.isArray(payload.records)
      ? payload.records
      : Array.isArray(payload.items)
        ? payload.items
        : []
    return list.filter((item) => String(item.parentId ?? '') === recordId)
  }

  const useRecord = () => {
    const live = useSyncExternalStore(opts.subscribeRecord, opts.getLiveRecord)
    return { ...live, path: recordPath }
  }

  const useField = <T = unknown>(name: string): [T, (value: T) => Promise<void>] => {
    useSyncExternalStore(opts.subscribeRecord, opts.getLiveRecord)
    const value = get(name) as T
    const setValue = useCallback((next: T) => set(name, next), [name])
    return [value, setValue]
  }

  const useData = <T = unknown>(
    defaultValue: T,
  ): [T, (next: T | ((prev: T) => T)) => Promise<void>, { loading: boolean; error: string; reload: () => Promise<void> }] => {
    const tick = useRecordViewFileTick()
    const [data, setDataState] = useState<T>(defaultValue)
    const [loading, setLoading] = useState<boolean>(Boolean(dataFile))
    const [error, setError] = useState('')

    const reload = useCallback(async () => {
      if (!dataFile) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const value = await read()
        setDataState((value == null ? defaultValue : value) as T)
        setError('')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }, [])

    useEffect(() => {
      let gone = false
      if (!dataFile) {
        setLoading(false)
        return
      }
      void read()
        .then((value) => {
          if (gone) return
          setDataState((value == null ? defaultValue : value) as T)
          setError('')
          setLoading(false)
        })
        .catch((err) => {
          if (gone) return
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        })
      return () => {
        gone = true
      }
    }, [tick])

    const setData = useCallback(async (next: T | ((prev: T) => T)) => {
      try {
        if (typeof next === 'function') {
          const fn = next as (prev: T) => T
          const saved = await updateData<T>((cur) => fn((cur == null ? defaultValue : cur) as T))
          if (saved != null) setDataState(saved)
        } else {
          setDataState(next)
          await write(next)
        }
        setError('')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        throw err
      }
    }, [])

    return [data, setData, { loading, error, reload }]
  }

  const base = {
    record: () => ({ ...opts.getLiveRecord(), path: recordPath }),
    fields: () => opts.fields.map(({ spec: _spec, ...item }) => ({ ...item })),
    values: () => {
      const live = opts.getLiveRecord()
      return Object.fromEntries(opts.fields.map((item) => [item.key, live[item.key]]))
    },
    findFieldByName: (name: string) => {
      const hit = matchSchemaField(opts.fields, name)
      if (!hit) return undefined
      const { spec: _spec, ...info } = hit
      return { ...info }
    },
    fieldKey: (name: string) => matchSchemaField(opts.fields, name)?.key ?? '',
    get,
    set,
    patch,
    tags: () => readRecordTagBag(opts.getLiveRecord()),
    getTagValue,
    setTagValue,
    read,
    write,
    updateData,
    files,
    docs,
    open,
    toast,
    children,
    useRecord,
    useField,
    useData,
  }

  return opts.extra ? { ...base, ...opts.extra } : base
}

/**
 * Stable proxy over `envRef.current.biu` so user sandbox components keep a
 * fixed `biu` reference across re-renders while always reading fresh host closures.
 */
export function createBiuProxy<TBiu extends Record<string, unknown>>(envRef: { current: { biu: TBiu } }): TBiu {
  return new Proxy({} as TBiu, {
    get(_target, prop) {
      const target = envRef.current.biu as Record<PropertyKey, unknown>
      const value = target[prop]
      if (typeof value === 'function') {
        return (...args: unknown[]) => (envRef.current.biu as Record<PropertyKey, (...a: unknown[]) => unknown>)[prop](...args)
      }
      return value
    },
    has(_target, prop) {
      return prop in envRef.current.biu
    },
    ownKeys() {
      return Reflect.ownKeys(envRef.current.biu)
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Reflect.getOwnPropertyDescriptor(envRef.current.biu, prop)
    },
  })
}
