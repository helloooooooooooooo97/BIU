import { mergeAttributes } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import Mention from '@tiptap/extension-mention'
import { ReactNodeViewRenderer, ReactRenderer } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { pickChipAttrs, pickKindTone } from '@biu/core-pick/web'
import { MentionList, type MentionPick } from './mention-list.tsx'
import { mentionIconSpec } from './mention-kind.tsx'
import { MentionChipView } from './mention-chip.tsx'
import {
  MENTION_SCOPES,
  decodeMentionId,
  encodeMentionId,
  mentionPickFromAttrs,
  openMention,
} from './mention-ref.ts'
import { placeSlashInWindow } from './slash-place.ts'
import { slashMayOpen } from './editor-live.ts'

export type { MentionKind } from './mention-kind.tsx'
export {
  MENTION_SCOPES,
  decodeMentionId,
  encodeMentionId,
  mentionCollection,
  mentionHref,
  mentionPickFromAttrs,
  mentionReveal,
  openMention,
} from './mention-ref.ts'

const PER_KIND = 6

function recordTitle(row: Record<string, unknown>) {
  const title = row.title ?? row.name ?? row.label
  const text = String(title ?? '').trim()
  return text || String(row.id ?? '')
}

export async function fetchMentionItems(query: string, signal?: AbortSignal): Promise<MentionPick[]> {
  const q = query.trim()
  const groups = await Promise.all(
    MENTION_SCOPES.map(async (scope) => {
      const params = new URLSearchParams({
        path: scope.path,
        limit: String(PER_KIND),
        offset: '0',
        q,
        sort: 'updatedAt',
        dir: 'desc',
        filter: '{}',
      })
      const res = await fetch(`/api/db/list?${params}`, { signal })
      const body = (await res.json()) as { items?: Array<Record<string, unknown>> }
      const items = Array.isArray(body.items) ? body.items : []
      return items
        .map((row) => {
          const recordId = String(row.id ?? '').trim()
          if (!recordId) return null
          return {
            id: encodeMentionId(scope.kind, recordId),
            label: recordTitle(row),
            kind: scope.kind,
            kindLabel: scope.label,
          } satisfies MentionPick
        })
        .filter((item): item is MentionPick => Boolean(item))
    }),
  )
  return groups.flat()
}

/** 输入框 schema 有 pickChip 时插芯片；正文编辑器插 mention 节点。 */
export function mentionSuggestionContent(
  schema: { nodes: Record<string, unknown> },
  props: { id: string; label: string },
) {
  const space = { type: 'text', text: ' ' }
  if (schema.nodes.pickChip) {
    return [
      {
        type: 'pickChip',
        attrs: pickChipAttrs(mentionPickFromAttrs({ id: props.id, label: props.label })),
      },
      space,
    ]
  }
  return [{ type: 'mention', attrs: { id: props.id, label: props.label } }, space]
}

function mentionAnchor(target: EventTarget | null, root: Element) {
  if (!(target instanceof Element)) return null
  const el = target.closest('a[data-type="mention"], span[data-type="mention"]')
  if (!(el instanceof HTMLElement) || !root.contains(el)) return null
  return el
}

function renderMentionMenu() {
  let component: ReactRenderer<unknown, Record<string, unknown>> | null = null
  let unmount: (() => void) | undefined
  let cancelled = false
  let pending: ({ editor: Editor; mount: (el: HTMLElement) => () => void } & Record<string, unknown>) | null = null

  return {
    onStart(props: { editor: Editor; mount: (el: HTMLElement) => () => void } & Record<string, unknown>) {
      cancelled = false
      pending = props
      if (!slashMayOpen(props.editor)) return
      queueMicrotask(() => {
        if (cancelled || !pending) return
        component = new ReactRenderer(MentionList, {
          props: pending,
          editor: pending.editor,
        })
        const el = component.element as HTMLElement
        el.style.zIndex = '10000'
        el.style.maxHeight = `${Math.min(280, Math.max(120, window.innerHeight - 16))}px`
        unmount = pending.mount(el)
      })
    },
    onUpdate(props: Record<string, unknown>) {
      pending = { ...(pending ?? {}), ...props } as typeof pending
      component?.updateProps(props)
    },
    onKeyDown(props: { event: KeyboardEvent }) {
      if (props.event.key === 'Escape') {
        cancelled = true
        unmount?.()
        return true
      }
      const ref = component?.ref as { onKeyDown?: (props: { event: KeyboardEvent }) => boolean } | null
      return ref?.onKeyDown?.(props) ?? false
    },
    onExit() {
      cancelled = true
      pending = null
      unmount?.()
      unmount = undefined
      component?.destroy()
      component = null
    },
  }
}

export const pageMention = Mention.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MentionChipView, { as: 'span' })
  },
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: new PluginKey('page-mention-open'),
        props: {
          handleDOMEvents: {
            click(view, event) {
              const el = mentionAnchor(event.target, view.dom)
              if (!el) return false
              const id = el.getAttribute('data-id') || ''
              if (!openMention(id)) return false
              event.preventDefault()
              event.stopPropagation()
              return true
            },
          },
        },
      }),
    ]
  },
}).configure({
  HTMLAttributes: {
    class: 'mention biu-tag composer-tool-chip is-pick',
  },
  renderHTML({ options, node }) {
    const kind = decodeMentionId(String(node.attrs.id ?? ''))?.kind ?? 'page'
    const label = String(node.attrs.label ?? node.attrs.id ?? '')
    return [
      'span',
      mergeAttributes(
        {
          'data-type': 'mention',
          'data-kind': kind,
          style: `--biu-tag:${pickKindTone(kind)}`,
        },
        options.HTMLAttributes,
      ),
      mentionIconSpec(kind),
      ['span', { class: 'pick-chip-name' }, label],
    ]
  },
  suggestion: {
    char: '@',
    allowSpaces: true,
    debounce: 160,
    allow: ({ editor, state, range }) => {
      if (!slashMayOpen(editor)) return false
      const $from = state.doc.resolve(range.from)
      const parent = $from.parent.type.contentMatch
      const mention = state.schema.nodes.mention
      const pick = state.schema.nodes.pickChip
      return !!(mention && parent.matchType(mention)) || !!(pick && parent.matchType(pick))
    },
    command: ({ editor, range, props }) => {
      const nodeAfter = editor.state.selection.$to.nodeAfter
      const to = nodeAfter?.text?.startsWith(' ') ? range.to + 1 : range.to
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: range.from, to },
          mentionSuggestionContent(editor.schema, {
            id: String(props.id ?? ''),
            label: String(props.label ?? props.id ?? ''),
          }),
        )
        .run()
      window.getSelection()?.collapseToEnd()
    },
    items: async ({ query, editor, signal }) => {
      if (!slashMayOpen(editor)) return []
      try {
        return await fetchMentionItems(query, signal)
      } catch {
        return []
      }
    },
    placement: 'bottom-start',
    flip: false,
    floatingUi: {
      strategy: 'fixed',
      middleware: [
        {
          name: 'keepInWindow',
          fn({ rects, elements }: { rects: { reference: { x: number; y: number; height: number }; floating: { width: number; height: number } }; elements: { floating: HTMLElement } }) {
            const placed = placeSlashInWindow({
              caret: {
                top: rects.reference.y,
                bottom: rects.reference.y + rects.reference.height,
                left: rects.reference.x,
              },
              menu: {
                width: Math.max(rects.floating.width, 240),
                height: Math.max(rects.floating.height, 1),
              },
              viewport: { width: window.innerWidth, height: window.innerHeight },
            })
            elements.floating.style.maxHeight = `${placed.maxHeight}px`
            return { x: placed.left, y: placed.top }
          },
        },
      ],
    },
    render: renderMentionMenu,
  },
})
