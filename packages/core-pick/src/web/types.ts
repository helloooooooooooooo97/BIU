import { editorHostFromNode } from './editor-host.ts'

export type PickRef = {
  kind: string
  id: string
  action?: string
  label: string
  route: string
  /** db_content 路径，如 /pages/p002。 */
  path?: string
  /** Markdown 源码行号（1-based），不是可视编辑器行。 */
  start_line?: number
  end_line?: number
  /** 对应源码整行。 */
  text?: string
  /** 用户高亮的片段。 */
  selection?: string
}

export function pickKey(ref: PickRef) {
  return `${ref.kind}:${ref.id}:${ref.action ?? ''}`
}

function objectKey(ref: PickRef) {
  return `${ref.kind}:${ref.id}`
}

/** 同一 kind+id 只保留一条；后写覆盖，并保留已有 action/label。 */
export function dedupePicks(refs: PickRef[]): PickRef[] {
  const map = new Map<string, PickRef>()
  for (const ref of refs) {
    const key = objectKey(ref)
    const prev = map.get(key)
    if (!prev) {
      map.set(key, ref)
      continue
    }
    map.set(key, {
      kind: ref.kind,
      id: ref.id,
      label: ref.label || prev.label,
      route: ref.route || prev.route,
      ...(ref.action || prev.action ? { action: ref.action || prev.action } : {}),
      ...locusFields(ref.start_line != null ? ref : prev),
      ...sourceFields(ref.path ? ref : prev),
    })
  }
  return [...map.values()]
}

export function formatPicks(refs: PickRef[]) {
  return dedupePicks(refs)
    .map((ref) => {
      const attrs = [`kind="${escapeAttr(ref.kind)}"`, `id="${escapeAttr(ref.id)}"`]
      if (ref.action) attrs.push(`action="${escapeAttr(ref.action)}"`)
      if (ref.route) attrs.push(`route="${escapeAttr(ref.route)}"`)
      if (ref.kind !== 'text' && ref.label) attrs.push(`label="${escapeAttr(ref.label)}"`)
      if (ref.path) attrs.push(`path="${escapeAttr(ref.path)}"`)
      if (ref.start_line != null) attrs.push(`start_line="${ref.start_line}"`)
      if (ref.end_line != null) attrs.push(`end_line="${ref.end_line}"`)
      if (ref.text) attrs.push(`text="${escapeAttr(ref.text)}"`)
      if (ref.selection) attrs.push(`selection="${escapeAttr(ref.selection)}"`)
      return `<pick ${attrs.join(' ')} />`
    })
    .join('\n')
}

const PICK_TAG = /<pick\b([^>]*)\/>/gi
const ATTR = /(\w+)="([^"]*)"/g

function unescapeAttr(value: string) {
  return value.replace(/&#10;/g, '\n').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

function parsePickAttrs(raw: string): PickRef | null {
  const attrs: Record<string, string> = {}
  ATTR.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ATTR.exec(raw))) {
    attrs[match[1]] = unescapeAttr(match[2])
  }
  const kind = attrs.kind?.trim()
  const id = attrs.id?.trim()
  if (!kind || !id) return null
  const start = Number(attrs.start_line)
  const end = Number(attrs.end_line)
  const text = attrs.text?.trim() ?? ''
  const selection = attrs.selection?.trim() ?? ''
  return {
    kind,
    id,
    ...(attrs.action?.trim() ? { action: attrs.action.trim() } : {}),
    label: attrs.label?.trim() || (kind === 'text' ? selection || text : '') || id,
    route: attrs.route?.trim() || '',
    ...sourceFields({ path: attrs.path?.trim() }),
    ...locusFields({
      start_line: Number.isInteger(start) && start >= 1 ? start : undefined,
      end_line: Number.isInteger(end) && end >= 1 ? end : undefined,
      text: text || undefined,
      selection: selection || undefined,
    }),
  }
}

function sourceFields(ref: { path?: string }) {
  const path = ref.path?.trim()
  return {
    ...(path ? { path } : {}),
  }
}

function locusFields(ref: { start_line?: number; end_line?: number; text?: string; selection?: string }) {
  const start = ref.start_line
  const end = ref.end_line
  const text = ref.text?.trim()
  const selection = ref.selection?.trim()
  return {
    ...(start != null ? { start_line: start } : {}),
    ...(end != null ? { end_line: end } : {}),
    ...(text ? { text } : {}),
    ...(selection ? { selection } : {}),
  }
}

export function formatPick(ref: PickRef) {
  return formatPicks([ref])
}

/** 按原文顺序拆成文字段和 pick 块，供输入框混排还原。 */
export function splitPickStream(text: string): Array<{ type: 'text'; value: string } | { type: 'pick'; ref: PickRef }> {
  const parts: Array<{ type: 'text'; value: string } | { type: 'pick'; ref: PickRef }> = []
  PICK_TAG.lastIndex = 0
  let last = 0
  let match: RegExpExecArray | null
  while ((match = PICK_TAG.exec(text))) {
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) })
    const ref = parsePickAttrs(match[1] ?? '')
    if (ref) parts.push({ type: 'pick', ref })
    else parts.push({ type: 'text', value: match[0] })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts
}
export function parsePicks(text: string): { refs: PickRef[]; rest: string } {
  const refs: PickRef[] = []
  PICK_TAG.lastIndex = 0
  const rest = text
    .replace(PICK_TAG, (_all, raw: string) => {
      const ref = parsePickAttrs(raw)
      if (ref) refs.push(ref)
      return '\n'
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { refs: dedupePicks(refs), rest }
}

function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;')
}

export function lineSpanLabel(ref: PickRef) {
  if (ref.start_line == null) return ''
  if (ref.end_line != null && ref.end_line !== ref.start_line) return `L${ref.start_line}–${ref.end_line}`
  return `L${ref.start_line}`
}

export function chipLabel(ref: PickRef) {
  if (ref.kind === 'text') {
    const snippet = pickPreview(ref.selection || ref.text || ref.label, 24)
    return snippet || '选区'
  }
  const lines = lineSpanLabel(ref)
  const where = ref.path
  if (ref.action) return `${ref.label} · ${ref.action}`
  if (lines && where) return `${lines} ${where}`
  if (lines) return `${lines} ${ref.label}`
  return ref.label
}

export function pickPreview(text: string, max = 48) {
  const value = text.replace(/\s+/g, ' ').trim()
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max)}…` : value
}

export function pickIdFromText(raw: string) {
  let hash = 0
  const key = raw.replace(/\s+/g, ' ').trim()
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) >>> 0
  return hash.toString(16)
}

export function withPickLocus(ref: PickRef, locus: { start_line: number; end_line: number; text: string; selection?: string } | null | undefined): PickRef {
  if (!locus) return ref
  return {
    ...ref,
    id: pickIdFromText(`${locus.start_line}:${locus.end_line}:${locus.selection || locus.text || ref.label}`),
    ...sourceFields(ref),
    ...locusFields({
      ...locus,
      selection: locus.selection || ref.selection,
    }),
  }
}

export function withHostSource(ref: PickRef, node: Node | null): PickRef {
  const host = editorHostFromNode(node)
  return {
    ...ref,
    ...sourceFields({ path: host?.path || ref.path }),
  }
}

/** 选取态下划到的一段正文；空选区返回 null。编辑器选区附带 Markdown 源码行号。 */
export function textPickFromSelection(
  route: string,
  selection: Pick<Selection, 'isCollapsed' | 'toString' | 'rangeCount'> | null = typeof window === 'undefined' ? null : window.getSelection(),
): PickRef | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
  const raw = selection.toString()
  const label = pickPreview(raw, 80)
  if (!label) return null
  const anchor = 'anchorNode' in selection ? (selection as Selection).anchorNode : null
  const host = editorHostFromNode(anchor)
  const locus = host ? host.locusFromSelection() : null
  return withPickLocus(
    withHostSource({ kind: 'text', id: pickIdFromText(raw), label, route, selection: raw.trim() }, anchor),
    locus,
  )
}

export function pickChipAttrs(ref: PickRef) {
  return {
    kind: ref.kind,
    id: ref.id,
    label: ref.label,
    route: ref.route,
    action: ref.action ?? null,
    path: ref.path ?? null,
    start_line: ref.start_line ?? null,
    end_line: ref.end_line ?? null,
    text: ref.text ?? null,
    selection: ref.selection ?? null,
  }
}

export function pickRefFromAttrs(attrs: Record<string, unknown>): PickRef | null {
  const kind = String(attrs.kind ?? '').trim()
  const id = String(attrs.id ?? '').trim()
  if (!kind || !id) return null
  const action = String(attrs.action ?? '').trim()
  const path = String(attrs.path ?? '').trim()
  const start = Number(attrs.start_line)
  const end = Number(attrs.end_line)
  const text = typeof attrs.text === 'string' ? attrs.text.trim() : ''
  const selection = typeof attrs.selection === 'string' ? attrs.selection.trim() : ''
  return {
    kind,
    id,
    label: String(attrs.label ?? '').trim() || (kind === 'text' ? selection || text : '') || id,
    route: String(attrs.route ?? ''),
    ...(action ? { action } : {}),
    ...sourceFields({ path }),
    ...locusFields({
      start_line: Number.isInteger(start) && start >= 1 ? start : undefined,
      end_line: Number.isInteger(end) && end >= 1 ? end : undefined,
      text: text || undefined,
      selection: selection || undefined,
    }),
  }
}

export function pickDomAttrs(kind: string, id: string, label?: string) {
  return {
    'data-biu-kind': kind,
    'data-biu-id': id,
    ...(label ? { 'data-biu-label': label } : {}),
  }
}
