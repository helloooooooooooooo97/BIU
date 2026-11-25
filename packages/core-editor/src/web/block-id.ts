import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { Node as PmNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'
import { createPageBlockId, isPageBlockId } from '../page-block-fence.ts'
import { withCodeFenceId } from './code-md.ts'

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
  'editorBlock',
  'slide',
  'blockMath',
  'image',
])

export function nodeBlockId(node: PmNode) {
  if (node.type.name === 'editorBlock' && isPageBlockId(node.attrs.id)) return String(node.attrs.id).trim()
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
      editorBlock: '组件',
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
    const attrs: Record<string, unknown> = { ...node.attrs, blockId: next }
    if (node.type.name === 'editorBlock' && !isPageBlockId(node.attrs.id)) attrs.id = next
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
    if (node.type.name === 'paragraph' && !node.textContent.trim() && node.childCount === 0) return
    const want = ids[i++]
    if (!want || nodeBlockId(node) === want) return
    const attrs: Record<string, unknown> = { ...node.attrs, blockId: want }
    if (node.type.name === 'editorBlock' && !isPageBlockId(node.attrs.id)) attrs.id = want
    tr = tr.setNodeMarkup(pos, undefined, attrs)
    dirty = true
  })
  if (dirty) editor.view.dispatch(tr.setMeta(assignKey, true))
}

const BLANK_P_SENTINEL = '\u200BBIU_BLANK_PARAGRAPH\u200B'
const LEAD_SPACE_PREFIX = '\u200BBIU_LS:'
const LIST_LINE_RE = /^\s*(?:[-*+]|\d+[.)])\s/

/**
 * CommonMark collapses consecutive blank lines, strips 1-3 leading spaces on paragraphs,
 * and turns 4+ leading spaces into indented code blocks.
 * Encode extra blank-line runs and paragraph leading spaces outside fenced blocks / lists
 * into temporary sentinels so they survive Markdown roundtrip cleanly without &nbsp;.
 */
export function encodeBlankParagraphsForParse(raw: string): string {
  const norm = String(raw ?? '').replace(/\r\n/g, '\n')
  if (!norm) return ''
  const lines = norm.split('\n')
  const out: string[] = []
  let fence: { char: string; len: number } | null = null
  let inList = false
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!
    const trimmed = line.trimStart()

    if (!fence) {
      const openFence = trimmed.match(/^(`{3,}|~{3,}|:{3,})/)
      if (openFence) {
        fence = { char: openFence[1]![0]!, len: openFence[1]!.length }
        inList = false
        out.push(line)
        i += 1
        continue
      }
    } else {
      const closeFence = trimmed.match(/^(`{3,}|~{3,}|:{3,})\s*$/)
      if (closeFence && closeFence[1]![0] === fence.char && closeFence[1]!.length >= fence.len) {
        fence = null
      }
      out.push(line)
      i += 1
      continue
    }

    if (line.trim() !== '') {
      if (LIST_LINE_RE.test(line)) {
        inList = true
        out.push(line)
      } else if (!inList && /^ +/.test(line)) {
        const spaces = line.match(/^ +/)![0]!.length
        out.push(`${LEAD_SPACE_PREFIX}${spaces}\u200B${line.slice(spaces)}`)
      } else {
        if (!/^ +/.test(line)) inList = false
        out.push(line)
      }
      i += 1
      continue
    }

    // Count consecutive blank lines outside fences
    inList = false
    const start = i
    while (i < lines.length && lines[i]!.trim() === '') i += 1
    const blankCount = i - start
    const atStart = start === 0
    const atEnd = i === lines.length

    if (atStart && atEnd) {
      const emptyCount = Math.floor((blankCount + 1) / 2)
      if (emptyCount > 1) {
        for (let k = 0; k < emptyCount; k += 1) {
          if (k > 0) out.push('')
          out.push(BLANK_P_SENTINEL)
        }
      }
      continue
    }

    const emptyCount = atStart || atEnd ? Math.floor(blankCount / 2) : Math.floor((blankCount - 1) / 2)
    if (emptyCount <= 0) {
      for (let k = 0; k < blankCount; k += 1) out.push('')
      continue
    }

    if (!atStart) out.push('')
    for (let k = 0; k < emptyCount; k += 1) {
      if (k > 0) out.push('')
      out.push(BLANK_P_SENTINEL)
    }
    if (!atEnd) out.push('')
  }

  return out.join('\n')
}

export function restoreBlankParagraphs(editor: Editor) {
  if (editor.isDestroyed) return
  let tr = editor.state.tr
  let dirty = false
  const ops: Array<{ from: number; to: number; text?: string }> = []
  editor.state.doc.forEach((node, pos) => {
    if (node.type.name !== 'paragraph') return
    if (node.textContent === BLANK_P_SENTINEL) {
      ops.push({ from: pos + 1, to: pos + node.nodeSize - 1 })
      return
    }
    const first = node.firstChild
    if (first?.isText && first.text?.startsWith(LEAD_SPACE_PREFIX)) {
      const m = first.text.match(/^\u200BBIU_LS:(\d+)\u200B/)
      if (m) {
        const count = Number(m[1]) || 0
        ops.push({
          from: pos + 1,
          to: pos + 1 + m[0].length,
          text: ' '.repeat(count),
        })
      }
    }
  })
  for (let i = ops.length - 1; i >= 0; i -= 1) {
    const op = ops[i]!
    if (op.text) tr = tr.insertText(op.text, op.from, op.to)
    else tr = tr.delete(op.from, op.to)
    dirty = true
  }
  if (dirty) editor.view.dispatch(tr.setMeta('addToHistory', false))
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
  if (!chunk) return chunk
  if (/^:::(?:editorBlock|pageBlock)\b/.test(chunk) && /\bid=/.test(chunk.slice(0, 160))) return chunk
  const nl = chunk.indexOf('\n')
  const first = nl < 0 ? chunk : chunk.slice(0, nl)
  const rest = nl < 0 ? '' : chunk.slice(nl)
  const codeHead = withCodeFenceId(first, id)
  if (codeHead) return `${codeHead}${rest}`
  if (STAMP.test(first)) return chunk
  return `${first} <!-- biu:${id} -->${rest}`
}

const chunkCache = new WeakMap<PmNode, string>()

export function cachedBlockChunks<T extends object>(
  nodes: readonly T[],
  cache: WeakMap<T, string>,
  serialize: (node: T) => string,
) {
  let fresh = 0
  const parts: string[] = []
  for (const node of nodes) {
    let chunk = cache.get(node)
    if (chunk == null) {
      chunk = serialize(node)
      cache.set(node, chunk)
      fresh += 1
    }
    parts.push(chunk)
  }
  return { markdown: parts.join('\n\n'), fresh }
}

export function markdownWithBlockIds(editor: Editor) {
  const nodes: PmNode[] = []
  editor.state.doc.forEach((node) => nodes.push(node))
  return cachedBlockChunks(nodes, chunkCache, (node) => {
    const id = nodeBlockId(node) || createPageBlockId()
    return stampChunk(serializeChild(editor, node), id)
  }).markdown
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
