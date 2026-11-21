import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PmNode } from '@tiptap/pm/model'
import { captureCommentAnchor, resolveCommentAnchor, type CommentAnchor } from './comment-anchor.ts'

export type CommentHighlightThread = {
  id: string
  status: 'open' | 'resolved'
  anchor: CommentAnchor | null
}

type MappedRange = {
  id: string
  from: number
  to: number
}

type CommentPluginState = {
  threads: CommentHighlightThread[]
  activeId: string
  ranges: MappedRange[]
  decorations: DecorationSet
}

type CommentPluginMeta = {
  threads?: CommentHighlightThread[]
  activeId?: string
}

export const editorCommentsKey = new PluginKey<CommentPluginState>('editor-comments')

function buildDecorations(doc: PmNode, ranges: MappedRange[], activeId: string): DecorationSet {
  if (!ranges.length) return DecorationSet.empty
  const decos: Decoration[] = []
  for (let i = 0; i < ranges.length; i += 1) {
    const item = ranges[i]!
    if (item.to <= item.from || item.from < 0 || item.to > doc.content.size) continue
    let overlap = false
    for (let j = 0; j < ranges.length; j += 1) {
      if (i === j) continue
      const other = ranges[j]!
      if (other.from < item.to && item.from < other.to) {
        overlap = true
        break
      }
    }
    const classes = ['editor-comment-mark']
    if (overlap) classes.push('is-overlap')
    if (activeId && item.id === activeId) classes.push('is-active')
    decos.push(
      Decoration.inline(item.from, item.to, {
        class: classes.join(' '),
        'data-comment-id': item.id,
      }),
    )
  }
  return DecorationSet.create(doc, decos)
}

function resolveOpenRanges(doc: PmNode, threads: CommentHighlightThread[]): MappedRange[] {
  const out: MappedRange[] = []
  for (const thread of threads) {
    if (thread.status !== 'open' || !thread.anchor) continue
    const hit = resolveCommentAnchor(doc, thread.anchor)
    if (hit && hit.to > hit.from) {
      out.push({ id: thread.id, from: hit.from, to: hit.to })
    }
  }
  return out
}

export function setEditorComments(editor: Editor, threads: CommentHighlightThread[], activeId = '') {
  if (editor.isDestroyed) return
  editor.view.dispatch(
    editor.state.tr.setMeta(editorCommentsKey, {
      threads,
      activeId,
    } satisfies CommentPluginMeta),
  )
}

export function setActiveEditorComment(editor: Editor, activeId: string) {
  if (editor.isDestroyed) return
  editor.view.dispatch(
    editor.state.tr.setMeta(editorCommentsKey, {
      activeId,
    } satisfies CommentPluginMeta),
  )
}

export function getCommentRange(editor: Editor, threadId: string): { from: number; to: number } | null {
  if (editor.isDestroyed) return null
  const state = editorCommentsKey.getState(editor.state)
  const hit = state?.ranges.find((item) => item.id === threadId)
  return hit ? { from: hit.from, to: hit.to } : null
}

/**
 * Inspect mapped comment ranges after local edits and return updated anchors
 * for any thread whose text, offset, or blockId has drifted.
 */
export function collectDriftedCommentAnchors(
  editor: Editor,
  threads: CommentHighlightThread[],
): Array<{ id: string; anchor: CommentAnchor }> {
  if (editor.isDestroyed) return []
  const state = editorCommentsKey.getState(editor.state)
  if (!state) return []
  const rangeById = new Map(state.ranges.map((item) => [item.id, item]))
  const updates: Array<{ id: string; anchor: CommentAnchor }> = []
  for (const thread of threads) {
    if (thread.status !== 'open' || !thread.anchor) continue
    const range = rangeById.get(thread.id)
    if (!range || range.to <= range.from) continue
    const fresh = captureCommentAnchor(editor.state.doc, range.from, range.to)
    if (!fresh) continue
    const prev = thread.anchor
    const drifted =
      fresh.blockId !== prev.blockId ||
      fresh.offset !== prev.offset ||
      fresh.quote !== prev.quote ||
      fresh.prefix !== prev.prefix ||
      fresh.suffix !== prev.suffix
    if (drifted) {
      updates.push({
        id: thread.id,
        anchor: {
          ...fresh,
          originalQuote: prev.originalQuote || prev.quote,
        },
      })
    }
  }
  return updates
}

export const editorComments = Extension.create({
  name: 'editorComments',
  addProseMirrorPlugins() {
    return [
      new Plugin<CommentPluginState>({
        key: editorCommentsKey,
        state: {
          init: () => ({
            threads: [],
            activeId: '',
            ranges: [],
            decorations: DecorationSet.empty,
          }),
          apply(tr, prev) {
            const meta = tr.getMeta(editorCommentsKey) as CommentPluginMeta | undefined
            const threads = meta?.threads ?? prev.threads
            const activeId = meta?.activeId !== undefined ? meta.activeId : prev.activeId
            if (meta?.threads) {
              const ranges = resolveOpenRanges(tr.doc, threads)
              return {
                threads,
                activeId,
                ranges,
                decorations: buildDecorations(tr.doc, ranges, activeId),
              }
            }
            if (tr.docChanged) {
              const mapped: MappedRange[] = []
              for (const item of prev.ranges) {
                const from = tr.mapping.map(item.from, 1)
                const to = tr.mapping.map(item.to, -1)
                if (to > from && from >= 0 && to <= tr.doc.content.size) {
                  mapped.push({ id: item.id, from, to })
                }
              }
              return {
                threads,
                activeId,
                ranges: mapped,
                decorations: buildDecorations(tr.doc, mapped, activeId),
              }
            }
            if (meta?.activeId !== undefined && meta.activeId !== prev.activeId) {
              return {
                ...prev,
                activeId,
                decorations: buildDecorations(tr.doc, prev.ranges, activeId),
              }
            }
            return prev
          },
        },
        props: {
          decorations(state) {
            return editorCommentsKey.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})
