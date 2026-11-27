import { apiFetch } from '@biu/biu-ui/api-client'
import { MENTION_KIND_PATH, parseMentionId } from '@biu/core-file-system/mention-markup'

const MAX_MENTION_TITLES = 500
const titles = new Map<string, string>()

function putTitle(key: string, value: string) {
  if (titles.has(key)) titles.delete(key)
  else if (titles.size >= MAX_MENTION_TITLES) {
    const oldest = titles.keys().next().value
    if (oldest !== undefined) titles.delete(oldest)
  }
  titles.set(key, value)
}
const listeners = new Set<() => void>()
const pending = new Set<string>()
let inflight: Promise<void> | null = null
let bound = false
let cacheGen = 0

function notify() {
  for (const listener of listeners) listener()
}

export function clearMentionTitleCache() {
  cacheGen += 1
  titles.clear()
  pending.clear()
  notify()
}

export function peekMentionTitle(id: string) {
  return titles.get(id)
}

export function rememberMentionTitle(id: string, title: string) {
  const parsed = parseMentionId(id)
  if (!parsed) return
  const key = `${parsed.kind}/${parsed.recordId}`
  const next = title.trim()
  if (!next || titles.get(key) === next) return
  putTitle(key, next)
  notify()
}

export function subscribeMentionTitles(listener: () => void) {
  listeners.add(listener)
  bindChange()
  return () => {
    listeners.delete(listener)
  }
}

export function requestMentionTitles(ids: Iterable<string>) {
  bindChange()
  let queued = false
  for (const raw of ids) {
    const parsed = parseMentionId(raw)
    if (!parsed) continue
    const key = `${parsed.kind}/${parsed.recordId}`
    if (titles.has(key) || pending.has(key)) continue
    pending.add(key)
    queued = true
  }
  if (queued) void flushMentionTitles()
}

function bindChange() {
  if (bound || typeof window === 'undefined') return
  bound = true
  window.addEventListener('fsdb:change', clearMentionTitleCache)
  window.addEventListener('biu:account-token', clearMentionTitleCache)
}

async function flushMentionTitles() {
  if (inflight) return inflight
  inflight = (async () => {
    while (pending.size) {
      const startGen = cacheGen
      const batch = [...pending]
      pending.clear()
      const groups = new Map<string, string[]>()
      for (const id of batch) {
        const parsed = parseMentionId(id)
        if (!parsed) continue
        const path = MENTION_KIND_PATH[parsed.kind]
        const ids = groups.get(path) ?? []
        if (!ids.includes(parsed.recordId)) ids.push(parsed.recordId)
        groups.set(path, ids)
      }
      await Promise.all(
        [...groups].map(async ([path, ids]) => {
          const params = new URLSearchParams({
            path,
            limit: String(Math.max(ids.length, 1)),
            offset: '0',
            q: '',
            sort: 'title',
            dir: 'asc',
            filter: JSON.stringify({ $ids: ids }),
            columns: 'id,title',
          })
          const res = await apiFetch(`/api/db/list?${params}`)
          if (cacheGen !== startGen) return
          const body = (await res.json()) as { items?: Array<Record<string, unknown>> }
          if (cacheGen !== startGen) return
          const items = Array.isArray(body.items) ? body.items : []
          for (const row of items) {
            const recordId = String(row.id ?? '').trim()
            const title = String(row.title ?? row.name ?? '').trim()
            if (!recordId || !title) continue
            const kind = (Object.entries(MENTION_KIND_PATH).find(([, item]) => item === path)?.[0] ?? 'page') as string
            putTitle(`${kind}/${recordId}`, title)
          }
        }),
      )
      notify()
    }
  })().finally(() => {
    inflight = null
  })
  return inflight
}
