import type { Editor } from '@tiptap/core'
import {
  pickIdFromText,
  pickPreview,
  withPickLocus,
  type PickRef,
} from '@biu/core-pick/web'
import { markdownLocusFromSelection, type MarkdownLocus } from './markdown-locus.ts'

function chord(
  event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean },
  key: string,
) {
  if (event.isComposing) return false
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  return event.key === key || event.key === key.toUpperCase()
}

export function isSendChatHotkey(event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
}) {
  return chord(event, 'l')
}

export function pickFromLocus(
  path: string | undefined,
  locus: MarkdownLocus | null,
  route = typeof window === 'undefined' ? '' : window.location.pathname,
  title?: string,
): PickRef | null {
  if (!locus) return null
  const hasSel = Boolean(locus.selection?.trim())
  const hasInsert = locus.insert != null
  if (!hasSel && !hasInsert && !locus.text.trim()) return null
  const label = pickPreview(locus.selection || locus.text, 80) || (locus.start_line ? `L${locus.start_line}` : '')
  if (!label) return null
  return withPickLocus(
    {
      kind: 'text',
      id: pickIdFromText(locus.text || `${locus.start_line}:${locus.insert ?? ''}`),
      label,
      route,
      ...(path ? { path } : {}),
      ...(title?.trim() ? { title: title.trim() } : {}),
    },
    locus,
  )
}

export function pickFromEditor(editor: Editor, path: string | undefined, title?: string): PickRef | null {
  if (editor.isDestroyed) return null
  return pickFromLocus(path, markdownLocusFromSelection(editor), undefined, title)
}
