/** 正文引用只存 id。label 是展示/agent 读路径上的投影，不落盘。 */
import {
  AGENTS_COLLECTION_PATH,
  PAGES_COLLECTION_PATH,
  TAGS_COLLECTION_PATH,
} from './paths.ts'

export const MENTION_KIND_PATH = {
  page: PAGES_COLLECTION_PATH,
  tag: TAGS_COLLECTION_PATH,
  session: AGENTS_COLLECTION_PATH,
} as const

export type MentionKind = keyof typeof MENTION_KIND_PATH

export type MentionRef = {
  id: string
  kind: MentionKind
  recordId: string
  label: string
  raw: string
  start: number
  end: number
}

const ATTR = /(\w+)=(?:"([^"]*)"|'([^']*)')/g
const TOKEN = /\[@((?:\s+\w+=(?:"[^"]*"|'[^']*'))*)\s*\]/g

function unescapeAttr(value: string) {
  return value.replace(/\\"/g, '"').replace(/\\'/g, "'")
}

function escapeAttr(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function parseMentionAttrs(inner: string) {
  const out: Record<string, string> = {}
  ATTR.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ATTR.exec(inner))) {
    out[match[1]!] = unescapeAttr(match[2] ?? match[3] ?? '')
  }
  return out
}

export function parseMentionId(id: string) {
  const text = String(id ?? '').trim()
  const slash = text.indexOf('/')
  if (slash <= 0) return null
  const rawKind = text.slice(0, slash)
  const kind = rawKind as MentionKind
  const recordId = text.slice(slash + 1).trim()
  if (!(kind in MENTION_KIND_PATH) || !recordId) return null
  return { kind, recordId }
}

export function formatMentionMarkup(id: string, label?: string) {
  const parsed = parseMentionId(id)
  if (!parsed) return ''
  const attrs = [`id="${escapeAttr(`${parsed.kind}/${parsed.recordId}`)}"`]
  const name = String(label ?? '').trim()
  if (name) attrs.push(`label="${escapeAttr(name)}"`)
  return `[@ ${attrs.join(' ')}]`
}

export function takeMentionMarkup(src: string) {
  const match = src.match(/^\[@((?:\s+\w+=(?:"[^"]*"|'[^']*'))*)\s*\]/)
  if (!match) return null
  const attrs = parseMentionAttrs(match[1] ?? '')
  const parsed = parseMentionId(attrs.id ?? '')
  if (!parsed) return null
  return {
    raw: match[0],
    id: `${parsed.kind}/${parsed.recordId}`,
    kind: parsed.kind,
    recordId: parsed.recordId,
    label: String(attrs.label ?? '').trim(),
  }
}

export function listMentionRefs(markdown: string): MentionRef[] {
  const out: MentionRef[] = []
  TOKEN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN.exec(markdown))) {
    const attrs = parseMentionAttrs(match[1] ?? '')
    const parsed = parseMentionId(attrs.id ?? '')
    if (!parsed) continue
    out.push({
      id: `${parsed.kind}/${parsed.recordId}`,
      kind: parsed.kind,
      recordId: parsed.recordId,
      label: String(attrs.label ?? '').trim(),
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return out
}

export function stripMentionLabels(markdown: string) {
  return markdown.replace(TOKEN, (raw, inner: string) => {
    const attrs = parseMentionAttrs(inner)
    const parsed = parseMentionId(attrs.id ?? '')
    if (!parsed) return raw
    return formatMentionMarkup(`${parsed.kind}/${parsed.recordId}`)
  })
}

export function projectMentionLabels(markdown: string, titles: Record<string, string>) {
  return markdown.replace(TOKEN, (raw, inner: string) => {
    const attrs = parseMentionAttrs(inner)
    const parsed = parseMentionId(attrs.id ?? '')
    if (!parsed) return raw
    const id = `${parsed.kind}/${parsed.recordId}`
    const title = String(titles[id] ?? attrs.label ?? '').trim()
    return formatMentionMarkup(id, title)
  })
}

export function mentionRefsByCollection(refs: MentionRef[]) {
  const groups = new Map<string, string[]>()
  for (const ref of refs) {
    const path = MENTION_KIND_PATH[ref.kind]
    const ids = groups.get(path) ?? []
    if (!ids.includes(ref.recordId)) ids.push(ref.recordId)
    groups.set(path, ids)
  }
  return groups
}
