import { readStorageString, writeStorageString } from '@biu/biu-ui/client-storage'
import { apiFetch } from '@biu/biu-ui/api-client'
import {
  BUILTIN_FIELDS,
  isReservedSchemaFieldKey,
  isReservedSchemaFieldLabel,
  isSchemaFieldKey,
  normalizeSchemaPack,
  type CollectionSchemaPack,
} from '@biu/type-file-system'
import { peekRecord, subscribeCrumbs } from './view-storage.ts'
import { showRecordInInspector } from './inspector-db-route.ts'
import { OPEN_TAG_EVENT } from './fsdb-events.ts'
import { TAGS_COLLECTION_PATH } from './database-path.ts'

export { OPEN_TAG_EVENT }

export const TAGS_KEY = 'fsdb.tags'

let memory: CollectionSchemaPack[] | null = null
let filledMemory: Record<string, Record<string, number>> = {}
let revision = 0
const listeners = new Set<() => void>()

function emit() {
  revision += 1
  for (const fn of listeners) fn()
}

export function tagCatalogRevision() {
  return revision
}
export function listenOpenTag() {
  if (typeof window === 'undefined') return () => undefined
  const onOpen = (event: Event) => {
    const id = String((event as CustomEvent<{ id?: unknown }>).detail?.id ?? '').trim()
    if (id) jumpTag(id)
  }
  window.addEventListener(OPEN_TAG_EVENT, onOpen)
  return () => window.removeEventListener(OPEN_TAG_EVENT, onOpen)
}

export function jumpTag(id: string, onOpen?: (id: string) => void) {
  const key = String(id ?? '').trim()
  if (!key) return
  const resolved =
    loadTags().find((tag) => tag.id === key || tag.label === key)?.id ||
    String(peekRecord(TAGS_COLLECTION_PATH, key)?.id ?? '').trim() ||
    key
  if (onOpen) {
    onOpen(resolved)
    return
  }
  showRecordInInspector(TAGS_COLLECTION_PATH, resolved)
}

export function tagLabel(id: string) {
  const key = id.trim()
  return (
    loadTags().find((tag) => tag.id === key)?.label?.trim() ||
    String(peekRecord(TAGS_COLLECTION_PATH, key)?.label ?? '').trim() ||
    key
  )
}
export function subscribeTagChrome(fn: () => void) {
  const stopTags = subscribeTags(undefined, fn)
  const stopCrumbs = subscribeCrumbs(fn)
  return () => {
    stopTags()
    stopCrumbs()
  }
}

function parseTags(raw: unknown): CollectionSchemaPack[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => normalizeSchemaPack(item)).filter((item): item is CollectionSchemaPack => Boolean(item))
}

export function subscribeTags(_collectionPath: string | undefined, fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

let tagsByIdCache: { source: CollectionSchemaPack[]; map: Map<string, CollectionSchemaPack> } | null = null

/** Same Map until the catalog array is replaced. Cell paint must not rebuild it per tag. */
export function tagsById() {
  const source = loadTags()
  if (tagsByIdCache?.source === source) return tagsByIdCache.map
  const map = new Map(source.map((tag) => [tag.id, tag]))
  tagsByIdCache = { source, map }
  return map
}

export function loadTags(_collectionPath?: string): CollectionSchemaPack[] {
  if (memory) return memory
  try {
    memory = parseTags(JSON.parse(readStorageString(TAGS_KEY, { scope: 'workspace' }) ?? '[]'))
    return memory
  } catch {
    memory = []
    return memory
  }
}

function adoptFilled(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
  const next: Record<string, Record<string, number>> = {}
  for (const [tagId, bag] of Object.entries(raw as Record<string, unknown>)) {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue
    const counts: Record<string, number> = {}
    for (const [key, value] of Object.entries(bag as Record<string, unknown>)) {
      const n = Number(value)
      if (Number.isFinite(n) && n > 0) counts[key] = Math.floor(n)
    }
    if (Object.keys(counts).length) next[tagId] = counts
  }
  filledMemory = next
}

function adoptTags(next: CollectionSchemaPack[]) {
  memory = next
  try {
    writeStorageString(TAGS_KEY, JSON.stringify(next), { scope: 'workspace' })
    try {
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
  emit()
}

export async function persistTags(tags: CollectionSchemaPack[], _collectionPath?: string) {
  const incoming = parseTags(tags)
  const res = await apiFetch('/api/db/tags', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tags: incoming }),
  })
  const body = (await res.json().catch(() => ({}))) as { tags?: unknown[]; filled?: unknown }
  if (!res.ok) throw new Error(`tags persist failed: ${res.status}`)
  adoptFilled(body.filled)
  adoptTags(Array.isArray(body.tags) ? parseTags(body.tags) : incoming)
}

export async function createTag(title: string): Promise<CollectionSchemaPack> {
  const name = title.trim() || '未命名标签'
  const res = await apiFetch('/api/db/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: TAGS_COLLECTION_PATH, records: [{ title: name }] }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    items?: Array<{ value?: { id?: string; title?: string; fields?: unknown } }>
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `tag create failed: ${res.status}`)
  const value = body.items?.[0]?.value
  const id = String(value?.id ?? '').trim()
  if (!id) throw new Error('tag create failed: missing id')
  const pack = normalizeSchemaPack({
    id,
    label: String(value?.title ?? name).trim() || name,
    fields: value?.fields ?? [],
  })
  if (!pack) throw new Error('tag create failed: invalid pack')
  adoptTags([...loadTags().filter((tag) => tag.id !== pack.id), pack])
  return pack
}

export async function pullTags(_collectionPath?: string, opts?: { filled?: boolean }) {
  try {
    const res = await fetch(opts?.filled ? '/api/db/tags?filled=1' : '/api/db/tags')
    const body = (await res.json()) as { tags?: unknown[]; filled?: unknown }
    const listed = body.tags
    if (!res.ok || !Array.isArray(listed)) return loadTags()
    const tags = parseTags(listed)
    adoptFilled(body.filled)
    const prev = JSON.stringify(memory ?? [])
    const next = JSON.stringify(tags)
    if (prev !== next) adoptTags(tags)
    else memory = tags
    return tags
  } catch {
    /* ignore */
  }
  return loadTags()
}

export function slugTagId(label: string, used: Set<string>) {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'tag'
  let id = /^[a-z]/.test(base) ? base : `f-${base}`
  let n = 2
  while (used.has(id) || !/^[a-z][a-z0-9-]{0,31}$/.test(id)) {
    id = `${base.slice(0, 20)}-${n}`
    if (!/^[a-z]/.test(id)) id = `f-${id}`
    n += 1
  }
  return id
}

export function randomTagFieldKey(used: Set<string>) {
  const blocked = new Set([...used, ...Object.keys(BUILTIN_FIELDS)])
  for (let i = 0; i < 64; i++) {
    const key = String((Math.random() * 0x7fffffff) | 0)
    if (key !== '0' && isSchemaFieldKey(key) && !blocked.has(key) && !isReservedSchemaFieldKey(key)) return key
  }
  let n = Date.now()
  let key = String(n)
  while (blocked.has(key) || !isSchemaFieldKey(key)) {
    n += 1
    key = String(n)
  }
  return key
}
export function tagFieldLabelOk(label: string, usedLabels: Iterable<string> = []) {
  const name = label.trim()
  if (!name) return false
  if (isReservedSchemaFieldKey(name) || isReservedSchemaFieldLabel(name)) return false
  const taken = new Set([...usedLabels].map((item) => String(item).trim().toLowerCase()).filter(Boolean))
  return !taken.has(name.toLowerCase())
}

export function registerTagFieldKey(
  label: string,
  used: { keys?: Iterable<string>; labels?: Iterable<string> } = {},
): string | null {
  if (!tagFieldLabelOk(label, used.labels ?? [])) return null
  const usedKeys = new Set(used.keys ?? [])
  const key = randomTagFieldKey(usedKeys)
  if (usedKeys.has(key)) return null
  return key
}
