import { mergeAttributes } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import Mention from '@tiptap/extension-mention'
import { ReactRenderer } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { MentionList, type MentionPick } from './mention-list.tsx'
import { mentionIconSpec, type MentionKind } from './mention-kind.tsx'
import { placeSlashInWindow } from './slash-place.ts'
import { slashMayOpen } from './editor-live.ts'

export type { MentionKind } from './mention-kind.tsx'

export const MENTION_SCOPES: Array<{ kind: MentionKind; label: string; path: string }> = [
  { kind: 'page', label: '页面', path: '/pages' },
  { kind: 'task', label: '任务', path: '/tasks' },
  { kind: 'facet', label: '合集', path: '/facets' },
  { kind: 'session', label: '会话', path: '/sessions' },
]

const KIND_SET = new Set<string>(MENTION_SCOPES.map((item) => item.kind))
const PER_KIND = 6
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
    class: 'mention',
  },
  renderHTML({ options, node }) {
    const kind = decodeMentionId(String(node.attrs.id ?? ''))?.kind ?? 'page'
    return [
      'span',
      mergeAttributes({ 'data-type': 'mention', 'data-kind': kind }, options.HTMLAttributes),
      mentionIconSpec(kind),
      `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`,
    ]
  },
  suggestion: {
    char: '@',
    allowSpaces: true,
    debounce: 160,
    allow: ({ editor, state, range }) => {
      if (!slashMayOpen(editor)) return false
      const $from = state.doc.resolve(range.from)
      const type = state.schema.nodes.mention
      return !!type && !!$from.parent.type.contentMatch.matchType(type)
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
