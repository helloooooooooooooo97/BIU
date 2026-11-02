import { useEffect, useRef, useState, type ComponentType, type SVGProps } from 'react'
import type { Editor } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { EditorContent, useEditor } from '@tiptap/react'
import { pageEmbedExtensions } from './kit.ts'
import {
  Bars3BottomLeftIcon,
  ChatBubbleBottomCenterTextIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CodeBracketIcon,
  CubeIcon,
  DocumentTextIcon,
  HashtagIcon,
  ListBulletIcon,
  MinusIcon,
  PhotoIcon,
  RectangleStackIcon,
  TableCellsIcon,
  VariableIcon,
} from '@heroicons/react/16/solid'
import { kindLabel, nodeBlockId } from './block-id.ts'
import { comparePageBlocks } from './page-filter-plugin.ts'
import { usePageViewState } from './page-view-state.ts'
import { getPageEditor, usePageEditorVersion } from './service.ts'
import { rememberedPageBlocks, useSlashCatalogVersion } from './slash-memory.ts'

type Hero = ComponentType<SVGProps<SVGSVGElement>>

function kindIcon(type: string, heading = 0): Hero {
  if (type === 'heading' || heading) return HashtagIcon
  if (type === 'blockquote') return ChatBubbleBottomCenterTextIcon
  if (type === 'bulletList' || type === 'orderedList') return ListBulletIcon
  if (type === 'codeBlock') return CodeBracketIcon
  if (type === 'horizontalRule') return MinusIcon
  if (type === 'table') return TableCellsIcon
  if (type === 'pageBlock') return CubeIcon
  if (type === 'slide') return RectangleStackIcon
  if (type === 'blockMath') return VariableIcon
  if (type === 'image') return PhotoIcon
  return Bars3BottomLeftIcon
}

export function pageBlockKindLabel(node: Node) {
  const raw = String(node.attrs.kind ?? '').trim()
  if (!raw) return kindLabel('pageBlock')
  const spec = getPageEditor()?.block(raw)
  if (spec?.label) return spec.label
  const remembered = rememberedPageBlocks().find((item) => item.kind === raw)
  if (remembered?.label) return remembered.label
  return raw
}

function blockTitle(node: Node) {
  const data = node.attrs.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const title = (data as { title?: unknown }).title
    if (typeof title === 'string' && title.trim()) return title.trim()
  }
  return ''
}

export function listPageTableBlocks(doc: Node) {
  const out: { id: string; kind: string; type: string; label: string; pos: number }[] = []
  doc.forEach((node, pos) => {
    const type = node.type.name
    const heading = type === 'heading' ? Math.min(3, Math.max(1, Number(node.attrs.level) || 1)) : 0
    const kind = heading ? `标题 ${heading}` : type === 'pageBlock' ? pageBlockKindLabel(node) : kindLabel(type)
    const label = node.textContent.replace(/\s+/g, ' ').trim() || blockTitle(node) || kind
    out.push({ id: nodeBlockId(node), kind, type, label, pos })
  })
  return out
}

function firstTextRange(doc: Node, pos: number) {
  const node = doc.nodeAt(pos)
  if (!node) return null
  if (node.isTextblock) return { from: pos + 1, to: pos + node.nodeSize - 1 }
  let range: { from: number; to: number } | null = null
  node.descendants((inner, innerPos) => {
    if (range || !inner.isTextblock) return
    const abs = pos + 1 + innerPos
    range = { from: abs + 1, to: abs + inner.nodeSize - 1 }
    return false
  })
  return range
}

export function replaceBlockPlainText(editor: Editor, pos: number, text: string) {
  const range = firstTextRange(editor.state.doc, pos)
  if (!range) return false
  editor
    .chain()
    .command(({ tr }) => {
      tr.insertText(text, range.from, range.to)
      return true
    })
    .run()
  return true
}

export function writeBackTableBlock(editor: Editor, pos: number, nextJson: Record<string, unknown>) {
  const current = editor.state.doc.nodeAt(pos)
  if (!current) return false
  let next: Node
  try {
    next = editor.schema.nodeFromJSON(nextJson)
  } catch {
    return false
  }
  if (next.type !== current.type) return false
  const attrs = { ...next.attrs }
  if (current.attrs.blockId && !attrs.blockId) attrs.blockId = current.attrs.blockId
  if (current.attrs.id && !attrs.id) attrs.id = current.attrs.id
  next = next.type.create(attrs, next.content, next.marks)
  if (current.eq(next)) return false
  const tr = editor.state.tr.replaceWith(pos, pos + current.nodeSize, next)
  editor.view.dispatch(tr)
  return true
}

function flushEmbed(editor: Editor, pos: number, child: Editor | null) {
  const next = child?.state.doc.firstChild
  if (!next) return
  writeBackTableBlock(editor, pos, next.toJSON() as Record<string, unknown>)
}

function BlockEmbed({ editor, pos }: { editor: Editor; pos: number }) {
  const posRef = useRef(pos)
  posRef.current = pos
  const live = useRef(false)
  const timer = useRef<number>(0)
  const childRef = useRef<Editor | null>(null)
  const json = editor.state.doc.nodeAt(pos)?.toJSON()
  const embed = useEditor({
    extensions: pageEmbedExtensions(),
    content: json ? { type: 'doc', content: [json] } : { type: 'doc', content: [] },
    editable: editor.isEditable,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: { attributes: { class: 'tiptap' } },
    onCreate: ({ editor: child }) => {
      childRef.current = child
      requestAnimationFrame(() => {
        live.current = true
      })
    },
    onUpdate: ({ editor: child, transaction }) => {
      childRef.current = child
      if (!live.current || !transaction.docChanged) return
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => flushEmbed(editor, posRef.current, child), 240)
    },
  })

  useEffect(() => {
    embed?.setEditable(editor.isEditable)
  }, [embed, editor.isEditable])

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      flushEmbed(editor, posRef.current, childRef.current)
    },
    [editor],
  )

  return (
    <div
      className="page-blocks-table-embed"
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <EditorContent editor={embed} />
    </div>
  )
}

function Th({ Icon, children }: { Icon: Hero; children: string }) {
  return (
    <span className="tasks-th">
      <span className="tasks-th-ico">
        <Icon aria-hidden className="size-[14px]" />
      </span>
      {children}
    </span>
  )
}

function KindCell({
  type,
  kind,
  open,
  onToggle,
}: {
  type: string
  kind: string
  open: boolean
  onToggle: () => void
}) {
  const Icon = kindIcon(type)
  return (
    <button
      type="button"
      className="page-blocks-table-kind"
      aria-expanded={open}
      aria-label={open ? `收起${kind}` : `展开${kind}`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
    >
      <span className="page-blocks-table-kind-swap" aria-hidden>
        <Icon className="page-blocks-table-kind-type" />
        {open ? <ChevronDownIcon className="page-blocks-table-kind-expand" /> : <ChevronRightIcon className="page-blocks-table-kind-expand" />}
      </span>
      <span>{kind}</span>
    </button>
  )
}

export function PageBlocksTable({ editor, recordId }: { editor: Editor; recordId: string }) {
  usePageEditorVersion()
  useSlashCatalogVersion()
  const view = usePageViewState(recordId)
  const [openIds, setOpenIds] = useState<string[]>([])
  const openRef = useRef(openIds)
  openRef.current = openIds
  const [, setTick] = useState(0)
  useEffect(() => {
    const bump = () => {
      if (openRef.current.length) return
      setTick((n) => n + 1)
    }
    editor.on('update', bump)
    return () => {
      editor.off('update', bump)
    }
  }, [editor])

  const allow = view.filterKinds.length ? new Set(view.filterKinds) : null
  let rows = listPageTableBlocks(editor.state.doc)
  if (allow) rows = rows.filter((item) => allow.has(item.type))
  if (view.sort !== 'doc') {
    rows = rows
      .slice()
      .sort((a, b) => comparePageBlocks({ kind: a.type, label: a.label }, { kind: b.type, label: b.label }, view.sort) || a.id.localeCompare(b.id) || a.pos - b.pos)
  }

  const toggle = (key: string) => {
    setOpenIds((cur) => (cur.includes(key) ? cur.filter((id) => id !== key) : [...cur, key]))
  }

  return (
    <div className="page-blocks-table-wrap" data-testid="page-blocks-table">
      <table className="tasks-table is-wrap">
        <thead>
          <tr>
            <th>
              <Th Icon={Bars3BottomLeftIcon}>类型</Th>
            </th>
            <th>
              <Th Icon={HashtagIcon}>ID</Th>
            </th>
            <th>
              <Th Icon={DocumentTextIcon}>内容</Th>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => {
              const key = row.id || `i-${index}`
              const open = openIds.includes(key)
              return <FragmentRow key={key} row={row} open={open} editor={editor} onToggle={() => toggle(key)} />
            })
          ) : (
            <tr>
              <td colSpan={3}>
                <div className="fsdb-cell">没有块</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function FragmentRow({
  row,
  open,
  editor,
  onToggle,
}: {
  row: { id: string; kind: string; type: string; label: string; pos: number }
  open: boolean
  editor: Editor
  onToggle: () => void
}) {
  return (
    <>
      <tr className={open ? 'is-open' : undefined}>
        <td>
          <KindCell type={row.type} kind={row.kind} open={open} onToggle={onToggle} />
        </td>
        <td>
          <div className="fsdb-cell page-blocks-table-id">{row.id || '—'}</div>
        </td>
        <td>
          <div className="page-blocks-table-content">{row.label}</div>
        </td>
      </tr>
      {open ? (
        <tr className="page-blocks-table-expand">
          <td colSpan={3}>
            <div className="page-blocks-table-preview" data-testid="page-blocks-table-editor">
              <BlockEmbed editor={editor} pos={row.pos} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}
