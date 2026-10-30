import {
  BUILTIN_FIELDS,
  isReservedSchemaFieldKey,
  isReservedSchemaFieldLabel,
  isSchemaFieldKey,
  normalizeSchemaPack,
  type CollectionSchemaPack,
} from '@biu/type-file-system'
import { peekRecord, subscribeCrumbs } from './view-storage.ts'

export const FACETS_KEY = 'fsdb.facets'

let memory: CollectionSchemaPack[] | null = null
let revision = 0
const listeners = new Set<() => void>()

function emit() {
  revision += 1
  for (const fn of listeners) fn()
}

export function facetCatalogRevision() {
  return revision
}

export function facetLabel(id: string) {
  const key = id.trim()
  return loadFacets().find((tag) => tag.id === key)?.label?.trim() || key
}

export function facetEmoji(id: string) {
  return peekRecord('/facets', id)?.emoji?.trim() ?? ''
}

export function subscribeFacetChrome(fn: () => void) {
  const stopFacets = subscribeFacets(undefined, fn)
  const stopCrumbs = subscribeCrumbs(fn)
  return () => {
    stopFacets()
    stopCrumbs()
  }
}

function parseFacets(raw: unknown): CollectionSchemaPack[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => normalizeSchemaPack(item)).filter((item): item is CollectionSchemaPack => Boolean(item))
}

export function subscribeFacets(_collectionPath: string | undefined, fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function loadFacets(_collectionPath?: string): CollectionSchemaPack[] {
  if (memory) return memory
  try {
    memory = parseFacets(JSON.parse(localStorage.getItem(FACETS_KEY) ?? '[]'))
    return memory
  } catch {
    memory = []
    return memory
  }
}

function adoptFacets(next: CollectionSchemaPack[]) {
  memory = next
  try {
    localStorage.setItem(FACETS_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  emit()
}

export async function persistFacets(facets: CollectionSchemaPack[], _collectionPath?: string) {
  const next = parseFacets(facets)
  const res = await fetch('/api/db/facets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ facets: next }),
  })
  if (!res.ok) throw new Error(`facets persist failed: ${res.status}`)
  adoptFacets(next)
}

export async function pullFacets(_collectionPath?: string) {
  try {
    const res = await fetch('/api/db/facets')
    const body = (await res.json()) as { facets?: unknown[] }
    if (!res.ok || !Array.isArray(body.facets)) return loadFacets()
    const facets = parseFacets(body.facets)
    const prev = JSON.stringify(memory ?? [])
    const next = JSON.stringify(facets)
    if (prev !== next) adoptFacets(facets)
    else memory = facets
    return facets
  } catch {
    /* ignore */
  }
  return loadFacets()
}

export function slugFacetId(label: string, used: Set<string>) {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'facet'
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

export function facetFieldLabelOk(label: string, usedLabels: Iterable<string> = []) {
  const name = label.trim()
  if (!name) return false
  if (isReservedSchemaFieldKey(name) || isReservedSchemaFieldLabel(name)) return false
  const taken = new Set([...usedLabels].map((item) => String(item).trim().toLowerCase()).filter(Boolean))
  return !taken.has(name.toLowerCase())
}

export function registerFacetFieldKey(
  label: string,
  used: { keys?: Iterable<string>; labels?: Iterable<string> } = {},
): string | null {
  if (!facetFieldLabelOk(label, used.labels ?? [])) return null
  const usedKeys = new Set(used.keys ?? [])
  const key = randomFacetFieldKey(usedKeys)
  if (usedKeys.has(key)) return null
  return key
}
