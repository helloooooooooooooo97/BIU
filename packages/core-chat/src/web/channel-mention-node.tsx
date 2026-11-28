import type { CSSProperties } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { createRoot, type Root } from 'react-dom/client'
import type { ChannelMention } from '../shared/channel-types.ts'

export type ChannelMentionAttrs = {
  kind: ChannelMention['kind']
  id: string
  label: string
}

function normalizeKind(raw: unknown): ChannelMention['kind'] {
  if (raw === 'everyone' || raw === 'agent' || raw === 'account') return raw
  return 'account'
}

function mentionTone(kind: ChannelMention['kind']): string {
  if (kind === 'everyone') return 'var(--biu-color-ink-orange)'
  if (kind === 'agent') return 'var(--biu-color-ink-purple)'
  return 'var(--biu-color-ink-blue)'
}

function ChannelMentionView({
  attrs,
  onRemove,
}: {
  attrs: Record<string, unknown>
  onRemove?: () => void
}) {
  const kind = normalizeKind(attrs.kind)
  const id = String(attrs.id ?? '')
  const label = String(attrs.label ?? id)
  return (
    <span
      className="biu-tag composer-tool-chip is-pick is-channel-mention"
      data-testid="channel-mention-chip"
      data-mention-kind={kind}
      data-mention-id={id}
      style={{ '--biu-tag': mentionTone(kind) } as CSSProperties}
    >
      <span className="pick-chip-name">@{label}</span>
      {onRemove ? (
        <button
          type="button"
          className="biu-tag-x"
          title={`移除 @${label}`}
          aria-label={`移除 @${label}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onRemove()
          }}
        >
          ×
        </button>
      ) : null}
    </span>
  )
}

/** 频道聊天输入框内的原子 @ 提及芯片（@所有人 / @Agent / @成员），一次退格整块删除。 */
export const ChannelMentionNode = Node.create({
  name: 'channelMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      kind: { default: 'account' },
      id: { default: '' },
      label: { default: '' },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-channel-mention]',
        getAttrs(dom) {
          if (!(dom instanceof HTMLElement)) return false
          return {
            kind: normalizeKind(dom.getAttribute('data-mention-kind')),
            id: dom.getAttribute('data-mention-id') ?? '',
            label: dom.getAttribute('data-mention-label') ?? '',
          }
        },
      },
    ]
  },
  renderHTML({ HTMLAttributes, node }) {
    const kind = normalizeKind(node.attrs.kind)
    const id = String(node.attrs.id ?? '')
    const label = String(node.attrs.label ?? id)
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-channel-mention': '',
        'data-mention-kind': kind,
        'data-mention-id': id,
        'data-mention-label': label,
        class: 'biu-tag composer-tool-chip is-pick is-channel-mention',
        style: `--biu-tag:${mentionTone(kind)}`,
      }),
      `@${label}`,
    ]
  },
  addNodeView() {
    return ({ editor, getPos, node }) => {
      const dom = document.createElement('span')
      dom.className = 'composer-inline-chip'
      dom.setAttribute('data-channel-mention', '')
      dom.contentEditable = 'false'
      let attrs = node.attrs as Record<string, unknown>
      let root: Root | null = createRoot(dom)
      let paintQueued = false
      const remove = () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (typeof pos !== 'number') return
        const size = editor.state.doc.nodeAt(pos)?.nodeSize ?? 1
        editor.chain().focus().deleteRange({ from: pos, to: pos + size }).run()
      }
      const paint = () => {
        paintQueued = false
        root?.render(<ChannelMentionView attrs={attrs} onRemove={remove} />)
      }
      const schedulePaint = () => {
        if (paintQueued || !root) return
        paintQueued = true
        queueMicrotask(paint)
      }
      schedulePaint()
      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'channelMention') return false
          attrs = updated.attrs as Record<string, unknown>
          schedulePaint()
          return true
        },
        destroy() {
          const current = root
          root = null
          queueMicrotask(() => current?.unmount())
        },
        stopEvent(event) {
          const type = event.type
          return type === 'mousedown' || type === 'mouseup' || type === 'click' || type === 'pointerdown'
        },
      }
    }
  },
})
