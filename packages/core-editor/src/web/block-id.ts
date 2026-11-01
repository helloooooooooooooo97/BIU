import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { Node as PmNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'
import { createPageBlockId, isPageBlockId } from '../page-block-fence.ts'

const assignKey = new PluginKey('page-block-ids-all')
const STAMP = / <!-- biu:([a-z0-9]{6,32}) -->/gi
const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'codeBlock',
  'horizontalRule',
  'table',
  'pageBlock',
  'slide',
  'blockMath',
  'image',
])

export function nodeBlockId(node: PmNode) {
  if (node.type.name === 'pageBlock' && isPageBlockId(node.attrs.id)) return String(node.attrs.id).trim()
  return isPageBlockId(node.attrs.blockId) ? String(node.attrs.blockId).trim() : ''
}

export function listDocBlocks(doc: PmNode) {
  const out: { id: string; kind: string; label: string; pos: number }[] = []
  doc.forEach((node, pos) => {
    const id = nodeBlockId(node)
    if (!id) return
    const label = node.textContent.replace(/\s+/g, ' ').trim() || kindLabel(node.type.name)
    out.push({ id, kind: node.type.name, label, pos })
  })
  return out
}

export function kindLabel(kind: string) {
  return (
    {
      paragraph: '段落',
      heading: '标题',
      blockquote: '引用',
      bulletList: '列表',
      orderedList: '有序列表',
      codeBlock: '代码',
      horizontalRule: '分隔线',
      table: '表格',
      pageBlock: '组件',
      slide: '幻灯片',
      blockMath: '公式',
      image: '图片',
    }[kind] ?? kind
  )
}

function shouldAssign(transactions: readonly Transaction[]) {
  return transactions.some((item) => item.docChanged || item.getMeta(assignKey))
}

export function assignTopLevelBlockIds(state: EditorState): Transaction | null {
  const seen = new Set<string>()
  const patch: { pos: number; node: PmNode }[] = []
  state.doc.forEach((node, pos) => {
    const id = nodeBlockId(node)
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
    const attrs = { ...node.attrs, blockId: next }
    if (node.type.name === 'pageBlock' && !isPageBlockId(node.attrs.id)) attrs.id = next
    tr = tr.setNodeMarkup(pos, undefined, attrs)
  }
  return tr
}

export function applyStoredBlockIds(editor: Editor, ids: string[]) {
  if (editor.isDestroyed || !ids.length) return
  let tr = editor.state.tr
  let i = 0
  let dirty = false
  editor.state.doc.forEach((node, pos) => {
    const want = ids[i++]
    if (!want || nodeBlockId(node) === want) return
    const attrs = { ...node.attrs, blockId: want }
    if (node.type.name === 'pageBlock' && !isPageBlockId(node.attrs.id)) attrs.id = want
    tr = tr.setNodeMarkup(pos, undefined, attrs)
    dirty = true
  })
  if (dirty) editor.view.dispatch(tr.setMeta(assignKey, true))
}

export function stripBlockIdStamps(raw: string) {
  const ids: string[] = []
  const text = String(raw ?? '').replace(STAMP, (_, id: string) => {
    ids.push(id)
    return ''
  })
  return { text, ids }
}

function serializeChild(editor: Editor, node: PmNode) {
  const manager = editor.storage.markdown?.manager as { serialize?: (json: unknown) => string } | undefined
  const json = { type: 'doc', content: [node.toJSON()] }
  const chunk = manager?.serialize?.(json)
  return String(chunk ?? '').trimEnd()
}

function stampChunk(chunk: string, id: string) {
  if (!chunk || /:::pageBlock[\s\S]*\bid=/.test(chunk.slice(0, 80))) return chunk
  const nl = chunk.indexOf('\n')
  const first = nl < 0 ? chunk : chunk.slice(0, nl)
  const rest = nl < 0 ? '' : chunk.slice(nl)
  if (STAMP.test(first)) return chunk
  return `${first} <!-- biu:${id} -->${rest}`
}

export function markdownWithBlockIds(editor: Editor) {
  const parts: string[] = []
  editor.state.doc.forEach((node) => {
    const id = nodeBlockId(node) || createPageBlockId()
    parts.push(stampChunk(serializeChild(editor, node), id))
  })
  return parts.filter(Boolean).join('\n\n')
}

export function focusBlockById(editor: Editor, id: string) {
  let pos = -1
  editor.state.doc.forEach((node, offset) => {
    if (nodeBlockId(node) === id) pos = offset
  })
  if (pos < 0) return false
  editor.chain().focus().setTextSelection(pos + 1).run()
  const dom = editor.view.nodeDOM(pos)
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'center' })
  return true
}

export const pageBlockIds = Extension.create({
  name: 'pageBlockIds',
  addGlobalAttributes() {
    return [
      {
        types: [...BLOCK_TYPES],
        attributes: {
          blockId: {
            default: '',
            rendered: false,
            keepOnSplit: false,
          },
        },
      },
    ]
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: assignKey,
        appendTransaction(transactions, _old, state) {
          if (!shouldAssign(transactions)) return null
          return assignTopLevelBlockIds(state)
        },
      }),
    ]
  },
})
