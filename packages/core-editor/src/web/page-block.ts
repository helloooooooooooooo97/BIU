import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node as PmNode } from '@tiptap/pm/model'
import { PageBlockView } from './page-block-view.tsx'
import { getPageEditor } from './service.ts'
import { formatPageBlockFence, parsePageBlockData, parsePageBlockMeta } from './page-block-meta.ts'

const metaKey = new PluginKey('page-block-meta')
const uniqueFilesKey = new PluginKey('page-block-unique-files')
const assignIdsKey = new PluginKey('page-block-ids')

function parseData(raw: string | null) {
  if (!raw) return {}
  try {
    return JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>
  } catch {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {}
    }
  }
}

function blockFile(node: PmNode) {
  const data = node.attrs.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ''
  const file = (data as { file?: unknown }).file
  return typeof file === 'string' ? file : ''
}

/** 复制块时换一个 assets 文件名，内容由 View 按 cloneFrom 再拷一份。 */
export function duplicateAssetPath(file: string) {
  const raw = file.replace(/^assets\//, '')
  const dot = raw.lastIndexOf('.')
  const ext = dot >= 0 ? raw.slice(dot) : '.json'
  let stem = dot >= 0 ? raw.slice(0, dot) : raw
  stem = stem.replace(/-copy-[0-9a-f]{8}$/i, '')
  const id = createPageBlockId()
  return `assets/${stem}-copy-${id}${ext}`
}

export function createPageBlockId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}

export function isPageBlockId(raw: unknown) {
  return typeof raw === 'string' && /^[a-z0-9]{6,32}$/i.test(raw.trim())
}

function nodePageBlockId(node: PmNode) {
  return isPageBlockId(node.attrs.id) ? String(node.attrs.id).trim() : ''
}

export const pageBlock = Node.create({
  name: 'pageBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      kind: { default: 'card' },
      plugin: { default: '' },
      id: { default: '' },
      data: { default: {}, rendered: false },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-page-block]',
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false
          return {
            kind: el.getAttribute('data-page-block') || 'card',
            plugin: el.getAttribute('data-page-block-plugin') || '',
            id: el.getAttribute('data-page-block-id') || '',
            data: parseData(el.getAttribute('data-page-block-data')),
          }
        },
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-page-block': String(node.attrs.kind ?? 'card'),
        'data-page-block-plugin': String(node.attrs.plugin ?? ''),
        'data-page-block-id': String(node.attrs.id ?? ''),
        'data-page-block-data': encodeURIComponent(JSON.stringify(node.attrs.data ?? {})),
      }),
    ]
  },

  parseMarkdown: (token, helpers) => {
    const kind = String(token.attributes?.kind ?? 'card')
    const plugin = String(token.attributes?.plugin ?? '')
    const id = isPageBlockId(token.attributes?.id) ? String(token.attributes.id) : ''
    const extras: Record<string, unknown> = {}
    if (typeof token.attributes?.deck === 'boolean') extras.deck = token.attributes.deck
    if (typeof token.attributes?.height === 'number') extras.height = token.attributes.height
    const data = parsePageBlockData(kind, String(token.content ?? ''), extras)
    return helpers.createNode('pageBlock', { kind, plugin, id, data })
  },

  renderMarkdown: (node) => {
    const kind = String(node.attrs?.kind ?? 'card')
    const stored = String(node.attrs?.plugin ?? '').trim()
    const plugin = stored || getPageEditor()?.block(kind)?.plugin || ''
    const id = nodePageBlockId(node as PmNode)
    const data = { ...((node.attrs?.data && typeof node.attrs.data === 'object' ? node.attrs.data : {}) as Record<string, unknown>) }
    return formatPageBlockFence(kind, plugin, data, id)
  },

  markdownTokenizer: {
    name: 'pageBlock',
    level: 'block',
    start(src) {
      return src.match(/^:::pageBlock/m)?.index ?? -1
    },
    tokenize(src) {
      const match = src.match(/^:::pageBlock(?:\s+\{([^}]*)\})?\s*\n([\s\S]*?)\n:::/)
      if (!match) return undefined
      const { kind, plugin, extras, id } = parsePageBlockMeta(match[1] ?? '')
      return {
        type: 'pageBlock',
        raw: match[0],
        attributes: { kind, plugin, id, ...extras },
        content: match[2] ?? '',
      }
    },
  },

  addStorage() {
    return { stop: undefined as undefined | (() => void) }
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageBlockView, {
      className: 'page-block',
      update({ oldNode, newNode, updateProps }) {
        if (
          oldNode.attrs.kind === newNode.attrs.kind &&
          oldNode.attrs.plugin === newNode.attrs.plugin &&
          oldNode.attrs.id === newNode.attrs.id &&
          JSON.stringify(oldNode.attrs.data) === JSON.stringify(newNode.attrs.data)
        ) {
          return true
        }
        updateProps()
        return true
      },
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null
        return Boolean(target?.closest('.page-block, [data-page-block-capture], textarea, input, select, button, canvas, .excalidraw'))
      },
    })
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: uniqueFilesKey,
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((item) => item.docChanged)) return null
          const seen = new Set<string>()
          const dupes: { pos: number; node: PmNode }[] = []
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'pageBlock') return
            const file = blockFile(node)
            if (!file) return
            if (!seen.has(file)) {
              seen.add(file)
              return
            }
            dupes.push({ pos, node })
          })
          if (!dupes.length) return null
          let tr = state.tr
          for (const { pos, node } of dupes.slice().sort((a, b) => b.pos - a.pos)) {
            const data = {
              ...((node.attrs.data && typeof node.attrs.data === 'object' ? node.attrs.data : {}) as Record<string, unknown>),
            }
            const from = String(data.file)
            data.file = duplicateAssetPath(from)
            data.cloneFrom = from
            tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, data })
          }
          return tr
        },
      }),
      new Plugin({
        key: assignIdsKey,
        view(editorView) {
          queueMicrotask(() => {
            if (editorView.isDestroyed) return
            editorView.dispatch(editorView.state.tr.setMeta(assignIdsKey, true))
          })
          return {}
        },
        appendTransaction(transactions, _old, state) {
          const force = transactions.some((item) => item.getMeta(assignIdsKey))
          if (!force && !transactions.some((item) => item.docChanged)) return null
          const seen = new Set<string>()
          const patch: { pos: number; node: PmNode }[] = []
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'pageBlock') return
            const id = nodePageBlockId(node)
            if (!id || seen.has(id)) {
              patch.push({ pos, node })
              return
            }
            seen.add(id)
          })
          if (!patch.length) return null
          let tr = state.tr
          for (const { pos, node } of patch.slice().sort((a, b) => b.pos - a.pos)) {
            let next = createPageBlockId()
            while (seen.has(next)) next = createPageBlockId()
            seen.add(next)
            tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: next })
          }
          return tr
        },
      }),
    ]
  },

  onCreate() {
    const editor = this.editor
    const stop = getPageEditor()?.subscribe(() => {
      if (editor.isDestroyed) return
      editor.view.dispatch(editor.state.tr.setMeta(metaKey, true))
    })
    this.storage.stop = stop
  },

  onDestroy() {
    this.storage.stop?.()
  },
})
