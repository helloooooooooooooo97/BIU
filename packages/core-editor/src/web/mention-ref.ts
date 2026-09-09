import type { MentionKind } from './mention-kind.tsx'

export const MENTION_SCOPES: Array<{ kind: MentionKind; label: string; path: string }> = [
  { kind: 'page', label: '页面', path: '/pages' },
  { kind: 'task', label: '任务', path: '/tasks' },
  { kind: 'facet', label: '合集', path: '/facets' },
  { kind: 'session', label: '会话', path: '/sessions' },
]

const KIND_SET = new Set<string>(MENTION_SCOPES.map((item) => item.kind))
const INSPECTOR_REVEAL = 'biu:inspector-reveal'

export function encodeMentionId(kind: MentionKind, recordId: string) {
  return `${kind}/${recordId}`
}

export function decodeMentionId(id: string) {
  const text = String(id ?? '').trim()
  const slash = text.indexOf('/')
  if (slash <= 0) return null
  const kind = text.slice(0, slash)
  const recordId = text.slice(slash + 1).trim()
  if (!KIND_SET.has(kind) || !recordId) return null
  return { kind: kind as MentionKind, recordId }
}

export function mentionCollection(kind: MentionKind) {
  if (kind === 'session') return '/sessions'
  if (kind === 'task') return '/tasks'
  if (kind === 'facet') return '/facets'
  return '/pages'
}

export function mentionHref(id: string) {
  const parsed = decodeMentionId(id)
  if (!parsed) return ''
  if (parsed.kind === 'session') return `/s/${encodeURIComponent(parsed.recordId)}`
  return `/database${mentionCollection(parsed.kind)}/record/${encodeURIComponent(parsed.recordId)}`
}

export function mentionReveal(id: string) {
  const parsed = decodeMentionId(id)
  if (!parsed) return null
  return { collection: mentionCollection(parsed.kind), recordId: parsed.recordId, unique: true }
}

export function openMention(id: string) {
  const detail = mentionReveal(id)
  if (!detail || typeof window === 'undefined') return false
  window.dispatchEvent(new CustomEvent(INSPECTOR_REVEAL, { detail }))
  return true
}

export function mentionPickFromAttrs(attrs: Record<string, unknown>) {
  const id = String(attrs.id ?? '')
  const parsed = decodeMentionId(id)
  const kind = parsed?.kind ?? 'page'
  const recordId = parsed?.recordId ?? id
  const label = String(attrs.label ?? recordId)
  return {
    kind,
    id: recordId,
    label,
    title: label,
    route: mentionHref(id),
  }
}
