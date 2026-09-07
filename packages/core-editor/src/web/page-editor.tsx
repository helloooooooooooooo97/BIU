import { useEffect, useRef, type MouseEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/core'
import { Selection } from '@tiptap/pm/state'
import type { FsContentProps } from '@biu/type-file-system/ui'
import { pageEditorExtensions } from './kit.ts'
import { PageBlockHandle } from './page-block-handle.tsx'
import { editorHostIsLive } from './editor-live.ts'
import { FOCUS_RECORD_CONTENT, FOCUS_RECORD_TITLE, isDocStartSelection } from './title-content-nav.ts'
import { tryContentJump } from './content-jump.ts'
import { CONTENT_JUMP_EVENT } from '@biu/type-file-system'

function jumpToPending(editor: Editor, markdown: string, recordId: string, force = false) {
  requestAnimationFrame(() => {
    if (editor.isDestroyed) return
    tryContentJump(editor, markdown, recordId, force)
  })
}

function asMarkdown(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && !Array.isArray(value) && typeof (value as { body?: unknown }).body === 'string') {
    return String((value as { body: string }).body)
  }
  return String(value)
}

function Bubble({ editor }: { editor: Editor }) {
  const btn = (label: string, on: boolean, run: () => void) => (
    <button
      type="button"
      className={on ? 'is-on' : undefined}
      onMouseDown={(event: MouseEvent) => {
        event.preventDefault()
        run()
      }}
    >
      {label}
    </button>
  )

  return (
    <BubbleMenu
      editor={editor}
      className="page-bubble"
      aria-label="文字样式"
      shouldShow={({ editor: current, from, to }) => !current.isActive('table') && from !== to}
    >
      {btn('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run())}
      {btn('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run())}
      {btn('S', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run())}
      {btn('</>', editor.isActive('code'), () => editor.chain().focus().toggleCode().run())}
      {btn('H1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
      {btn('H2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
    </BubbleMenu>
  )
}

function TableBar({ editor }: { editor: Editor }) {
  const btn = (label: string, run: () => void) => (
    <button
      type="button"
      onMouseDown={(event: MouseEvent) => {
        event.preventDefault()
        run()
      }}
    >
      {label}
    </button>
  )
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="page-table-bar"
      className="page-bubble"
      aria-label="表格"
      shouldShow={({ editor: current }) => current.isActive('table')}
    >
      {btn('+列', () => editor.chain().focus().addColumnAfter().run())}
      {btn('+行', () => editor.chain().focus().addRowAfter().run())}
      {btn('删列', () => editor.chain().focus().deleteColumn().run())}
      {btn('删行', () => editor.chain().focus().deleteRow().run())}
      {btn('删表', () => editor.chain().focus().deleteTable().run())}
    </BubbleMenu>
  )
}

export function PageEditor({ record, value, writable, onChange }: FsContentProps) {
  const saved = useRef(asMarkdown(value))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hydratedId = useRef<string | null>(null)

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editable: writable !== false,
      extensions: pageEditorExtensions(),
      content: asMarkdown(value),
      contentType: 'markdown',
      editorProps: {
        attributes: {
          class: 'tiptap',
          role: 'textbox',
          'aria-label': '正文',
          'data-testid': 'page-editor',
        },
        handleKeyDown: (view, event) => {
          if (event.key !== 'ArrowUp' || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return false
          if (event.isComposing) return false
          const sel = view.state.selection
          const start = Selection.atStart(view.state.doc).from
          if (!isDocStartSelection(sel.from, sel.empty, start)) return false
          event.preventDefault()
          window.dispatchEvent(new Event(FOCUS_RECORD_TITLE))
          return true
        },
        handleDOMEvents: {
          dragover(view, event) {
            if (!view.dragging?.move || !event.dataTransfer) return false
            event.dataTransfer.dropEffect = 'move'
            return false
          },
        },
      },
      onUpdate: ({ editor: current }) => {
        if (hydratedId.current !== record.id) return
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          queueMicrotask(() => {
            if (current.isDestroyed) return
            const next = current.getMarkdown()
            if (next === saved.current) return
            saved.current = next
            onChange?.(next)
          })
        }, 400)
      },
      onBlur: ({ editor: current }) => {
        if (hydratedId.current !== record.id) return
        if (timer.current) clearTimeout(timer.current)
        queueMicrotask(() => {
          if (current.isDestroyed) return
          const next = current.getMarkdown()
          if (next === saved.current) return
          saved.current = next
          onChange?.(next)
        })
      },
    },
    [record.id],
  )

  useEffect(() => {
    hydratedId.current = null
  }, [record.id])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const md = asMarkdown(value)
    if (hydratedId.current !== record.id) {
      if (value == null) return
      saved.current = md
      hydratedId.current = record.id
      editor.commands.setContent(md, { contentType: 'markdown', emitUpdate: false })
      jumpToPending(editor, md, record.id, true)
      return
    }
    if (md === saved.current) {
      jumpToPending(editor, md, record.id)
      return
    }
    if (editor.isFocused) return
    saved.current = md
    editor.commands.setContent(md, { contentType: 'markdown', emitUpdate: false })
    jumpToPending(editor, md, record.id, true)
  }, [editor, record.id, value])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setEditable(writable !== false)
  }, [editor, writable])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const onFocus = () => {
      if (editor.isDestroyed || !editorHostIsLive(editor)) return
      editor.commands.focus('start')
    }
    window.addEventListener(FOCUS_RECORD_CONTENT, onFocus)
    return () => window.removeEventListener(FOCUS_RECORD_CONTENT, onFocus)
  }, [editor])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const onJump = () => {
      if (editor.isDestroyed || editor.isFocused) return
      jumpToPending(editor, asMarkdown(value), record.id)
    }
    window.addEventListener(CONTENT_JUMP_EVENT, onJump)
    return () => window.removeEventListener(CONTENT_JUMP_EVENT, onJump)
  }, [editor, record.id, value])

  if (!editor) return <div className="page-editor" data-testid="page-editor-pending" />

  return (
    <div className="page-editor">
      <EditorContent editor={editor} />
      {writable !== false ? <PageBlockHandle editor={editor} /> : null}
      {writable !== false ? <Bubble editor={editor} /> : null}
      {writable !== false ? <TableBar editor={editor} /> : null}
    </div>
  )
}
