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

export const TAGS_KEY = 'fsdb.tags'
const LEGACY_TAGS_KEY = 'fsdb.facets'

let memory: CollectionSchemaPack[] | null = null
let revision = 0
const listeners = new Set<() => void>()

function emit() {
  revision += 1
  for (const fn of listeners) fn()
}

export function tagCatalogRevision() {
  return revision
}

export function jumpTag(id: string, onOpen?: (id: string) => void) {
  const key = String(id ?? '').trim()
  if (!key) return
  const resolved =
    loadTags().find((tag) => tag.id === key || tag.label === key)?.id ||
    String(peekRecord('/tags', key)?.id ?? '').trim() ||
    key
  if (onOpen) {
    onOpen(resolved)
    return
  }
  showRecordInInspector('/tags', resolved)
}

export function tagLabel(id: string) {
  const key = id.trim()
  return (
    loadTags().find((tag) => tag.id === key)?.label?.trim() ||
    String(peekRecord('/tags', key)?.title ?? '').trim() ||
    key
  )
}

export function tagEmoji(id: string) {
  return peekRecord('/tags', id)?.emoji?.trim() ?? ''
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

export function loadTags(_collectionPath?: string): CollectionSchemaPack[] {
  if (memory) return memory
  try {
    memory = parseTags(JSON.parse(localStorage.getItem(TAGS_KEY) ?? localStorage.getItem(LEGACY_TAGS_KEY) ?? '[]'))
    return memory
  } catch {
    memory = []
    return memory
  }
}

function adoptTags(next: CollectionSchemaPack[]) {
  memory = next
  try {
    localStorage.setItem(TAGS_KEY, JSON.stringify(next))
    try {
      localStorage.removeItem(LEGACY_TAGS_KEY)
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
  emit()
}

async function serverFacets(): Promise<CollectionSchemaPack[] | null> {
  try {
    const res = await fetch('/api/db/tags')
    const body = (await res.json()) as { tags?: unknown[]; facets?: unknown[] }
    const listed = body.tags ?? body.facets
    if (!res.ok || !Array.isArray(listed)) return null
    return parseTags(listed)
  } catch {
    return null
  }
}

function mergeFacetCatalog(base: CollectionSchemaPack[], incoming: CollectionSchemaPack[]) {
  const byId = new Map(base.map((tag) => [tag.id, tag]))
  for (const tag of incoming) byId.set(tag.id, tag)
  return [...byId.values()]
}

export async function persistTags(facets: CollectionSchemaPack[], _collectionPath?: string) {
  const incoming = parseTags(facets)
  const remote = await serverFacets()
  const next = parseTags(remote ? mergeFacetCatalog(remote, incoming) : incoming)
  const res = await fetch('/api/db/tags', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tags: next }),
  })
  if (!res.ok) throw new Error(`tags persist failed: ${res.status}`)
  adoptTags(next)
}

export async function createTag(title: string): Promise<CollectionSchemaPack> {
  const name = title.trim() || '未命名标签'
  const res = await fetch('/api/db/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: '/tags', records: [{ title: name }] }),
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

export async function pullTags(_collectionPath?: string) {
  try {
    const res = await fetch('/api/db/tags')
    const body = (await res.json()) as { tags?: unknown[]; facets?: unknown[] }
    const listed = body.tags ?? body.facets
    if (!res.ok || !Array.isArray(listed)) return loadTags()
    const facets = parseTags(listed)
    const prev = JSON.stringify(memory ?? [])
    const next = JSON.stringify(facets)
    if (prev !== next) adoptTags(facets)
    else memory = facets
    return facets
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

export function randomFacetFieldKey(used: Set<string>) {
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

export function fieldKeyFromLabel(_label: string, used: Set<string>) {
  return randomFacetFieldKey(used)
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
  const key = randomFacetFieldKey(usedKeys)
  if (usedKeys.has(key)) return null
  return key
}
