import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { HeadlessPopover } from '@biu/biu-ui'
import { SourceEditor, type SourceEditorHandle } from './source-editor.tsx'
import { restorePageScroll } from './page-scroll-pin.ts'
import { isPageCustomView, usePagePresentMode } from './source-mode.ts'
import { usePageViews } from './page-views.ts'
import { useActivePageLayout } from './page-layouts.ts'
import { PageHostView } from './page-host-view.tsx'
import { ArrowPathIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/16/solid'
import { EditorContent, useEditor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/core'
import { NodeSelection, Selection } from '@tiptap/pm/state'
import type { FsContentProps } from '@biu/type-file-system/ui'
import { pageEditorExtensions } from './kit.ts'
import { PageBlockHandle } from './page-block-handle.tsx'
import { editorHostIsLive } from './editor-live.ts'
import { FOCUS_RECORD_CONTENT, FOCUS_RECORD_TITLE, handleContentTitleNav, shouldLeaveContentForTitle, focusRecordTitleNear, isDocStartSelection, atFirstVisibleLine } from './title-content-nav.ts'
import { tryContentJump, contentJumpForRecord } from './content-jump.ts'
import { CONTENT_JUMP_EVENT } from '@biu/type-file-system'
import { bindEditorTextHost, getPick } from '@biu/core-pick/web'
import { markdownLocusFromElement, markdownLocusFromSelection } from './markdown-locus.ts'
import { isFindHotkey } from './find-bar.tsx'
import { applyEditorFind } from './find-plugin.ts'
import { applyStoredBlockIds, markdownWithBlockIds, stripBlockIdStamps } from './block-id.ts'
import { getLivePageEditor, setLivePageEditor, setLivePagePersist } from './page-live-editor.ts'
import { PAGE_FIND_OPEN_EVENT, getPageFind, patchPageFind, usePageFind } from './page-view-state.ts'
import { PageBlocksTable } from './page-blocks-table.tsx'
import {
  INK_TONES,
  WASH_TONES,
  isLastColorHotkey,
  lastColorSwatch,
  readLastEditorColor,
  writeLastEditorColor,
  type LastEditorColor,
} from './color-swatches.ts'
import { isSendChatHotkey, pickFromEditor, pickFromLocus } from './editor-ask.ts'

const LOCAL_EDIT_MS = 600

/** 本地刚打过字时不要用远端正文盖掉光标；只看聚焦会挡住 db_content 的实时套入。 */
export function shouldApplyRemoteMarkdown(args: {
  focused: boolean
  live: boolean
  hasJump: boolean
  recentlyLocal: boolean
}) {
  if (args.hasJump) return true
  if (args.focused && args.live && args.recentlyLocal) return false
  return true
}

export function recentlyLocalEdit(typedAt: number, now = Date.now()) {
  return now - typedAt < LOCAL_EDIT_MS
}

function jumpToPending(editor: Editor, markdown: string, recordId: string, force = false) {
  const run = () => {
    if (editor.isDestroyed) return
    tryContentJump(editor, markdown, recordId, force)
  }
  run()
  requestAnimationFrame(run)
}

function persistEditorMarkdown(editor: Editor) {
  return markdownWithBlockIds(editor)
}

function hydrateEditorMarkdown(editor: Editor, raw: string) {
  const { text, ids } = stripBlockIdStamps(raw)
  editor.commands.setContent(text, { contentType: 'markdown', emitUpdate: false })
  applyStoredBlockIds(editor, ids)
}

function asMarkdown(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && !Array.isArray(value) && typeof (value as { body?: unknown }).body === 'string') {
    return String((value as { body: string }).body)
  }
  return String(value)
}

function recordTitle(record: { title?: unknown; name?: unknown; id?: unknown }) {
  return String(record.title ?? record.name ?? '').trim()
}

function stampLiveEditor(
  root: HTMLElement | null,
  next: { path?: string; title?: string; line?: number; insert?: number },
) {
  if (!root) return
  if (next.path) root.dataset.livePath = next.path
  else delete root.dataset.livePath
  if (next.title) root.dataset.liveTitle = next.title
  else delete root.dataset.liveTitle
  if (next.line != null) root.dataset.liveLine = String(next.line)
  else delete root.dataset.liveLine
  if (next.insert != null) root.dataset.liveInsert = String(next.insert)
  else delete root.dataset.liveInsert
  root.dataset.liveAt = String(Date.now())
}

function holdSelection(event: MouseEvent) {
  event.preventDefault()
}

function ColorMenus({
  editor,
  open,
  onOpen,
}: {
  editor: Editor
  open: 'text' | 'mark' | null
  onOpen: (next: 'text' | 'mark' | null) => void
}) {
  const color = String(editor.getAttributes('textStyle').color ?? '')
  const highlight = String(editor.getAttributes('highlight').color ?? '')

  const applyColor = (next: LastEditorColor | null) => {
    if (!next) {
      editor.chain().focus().unsetColor().unsetHighlight().run()
      onOpen(null)
      return
    }
    writeLastEditorColor(next)
    if (next.kind === 'text') editor.chain().focus().setColor(next.value).run()
    else editor.chain().focus().setHighlight({ color: next.value }).run()
    onOpen(null)
  }

  const last = readLastEditorColor()
  const lastSwatch = lastColorSwatch(last)

  const flyout = () => (
      <div className="page-color-menu" role="menu" aria-label="颜色" onMouseDown={holdSelection}>
        <div className="page-color-recent-h">
          <span>上次使用颜色</span>
          <span className="page-color-kbd">⌘+Shift+H</span>
        </div>
        <div className="page-color-recent">
          {last ? (
            <button
              type="button"
              role="menuitem"
              aria-label="上次使用颜色"
              data-testid="page-color-last"
              className={last.kind === 'mark' ? 'page-color-wash' : undefined}
              style={{ background: lastSwatch }}
              onMouseDown={holdSelection}
              onClick={() => applyColor(last)}
            />
          ) : null}
        </div>
        <div className="page-color-menu-h">Text Colorful</div>
        <div className="page-color-grid">
          <button
            type="button"
            role="menuitemradio"
            className={!color ? 'page-color-none is-on' : 'page-color-none'}
            aria-checked={!color}
            aria-label="默认文字色"
            data-testid="page-color-none"
            onMouseDown={holdSelection}
            onClick={() => {
              editor.chain().focus().unsetColor().run()
              onOpen(null)
            }}
          />
          {INK_TONES.map((tone) => {
            const on = color === tone.value
            return (
              <button
                key={tone.id}
                type="button"
                role="menuitemradio"
                className={on ? 'is-on' : undefined}
                aria-checked={on}
                aria-label={tone.label}
                data-testid={`page-color-${tone.id}`}
                style={{ color: tone.value }}
                onMouseDown={holdSelection}
                onClick={() => applyColor({ kind: 'text', value: tone.value })}
              >
                A
              </button>
            )
          })}
        </div>
        <div className="page-color-menu-h">Background Colorful</div>
        <div className="page-color-grid">
          <button
            type="button"
            role="menuitemradio"
            className={!highlight ? 'page-color-none is-on' : 'page-color-none'}
            aria-checked={!highlight}
            aria-label="无背景色"
            data-testid="page-highlight-none"
            onMouseDown={holdSelection}
            onClick={() => {
              editor.chain().focus().unsetHighlight().run()
              onOpen(null)
            }}
          />
          {WASH_TONES.map((tone) => {
            const on = highlight === tone.value
            return (
              <button
                key={tone.id}
                type="button"
                role="menuitemradio"
                className={on ? 'page-color-wash is-on' : 'page-color-wash'}
                aria-checked={on}
                aria-label={tone.label}
                data-testid={`page-highlight-${tone.id}`}
                style={{ background: tone.swatch ?? tone.value }}
                onMouseDown={holdSelection}
                onClick={() => applyColor({ kind: 'mark', value: tone.value })}
              />
            )
          })}
        </div>
      </div>
    )

  return (
    <>
      <HeadlessPopover
        open={open === 'text'}
        onOpenChange={(next) => onOpen(next ? 'text' : null)}
        side="bottom"
        align="start"
        trigger={
          <button
            type="button"
            className={color || open === 'text' ? 'is-on' : undefined}
            title="文字颜色"
            aria-label="文字颜色"
            aria-haspopup="menu"
            aria-expanded={open === 'text'}
            onMouseDown={holdSelection}
          >
            <span className="page-bubble-letter" style={{ color: color || undefined }}>
              A
            </span>
          </button>
        }
      >
        {flyout()}
      </HeadlessPopover>
    </>
  )
}

/** 节点选中（sandbox 等 pageBlock）不是文字选区，不要出加粗/斜体条。 */
export function pageTextBubbleOpen(editor: Editor, from: number, to: number, colorOpen = false) {
  if (editor.isActive('table') || editor.isActive('pageBlock')) return false
  if (editor.state.selection instanceof NodeSelection) return false
  if (colorOpen) return true
  return from !== to
}

function Bubble({
  editor,
  onSendChat,
}: {
  editor: Editor
  onSendChat: () => void
}) {
  const [colorOpen, setColorOpen] = useState<'text' | 'mark' | null>(null)
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
      shouldShow={({ editor: current, from, to }) => pageTextBubbleOpen(current, from, to, Boolean(colorOpen))}
    >
      {btn('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run())}
      {btn('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run())}
      {btn('S', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run())}
      {btn('</>', editor.isActive('code'), () => editor.chain().focus().toggleCode().run())}
      {btn('H1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
      {btn('H2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
      <ColorMenus editor={editor} open={colorOpen} onOpen={setColorOpen} />
      <button
        type="button"
        className="page-bubble-chat"
        title="送到对话"
        aria-label="送到对话"
        onMouseDown={(event: MouseEvent) => {
          event.preventDefault()
          onSendChat()
        }}
      >
        <ChatBubbleLeftRightIcon className="page-bubble-chat-icon" aria-hidden />
        ⌘L
      </button>
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

function PageEditorLoading() {
  return (
    <div className="page-editor page-editor-loading" data-testid="page-editor-loading" aria-busy="true" aria-live="polite">
      <ArrowPathIcon className="page-editor-loading-icon" width={22} height={22} aria-hidden />
      <span className="sr-only">正在加载正文</span>
    </div>
  )
}

function PageEditorFailed({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="page-editor page-editor-failed" data-testid="page-editor-failed" role="alert">
      <p>正文加载失败</p>
      {onRetry ? (
        <button type="button" className="page-editor-retry" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  )
}

function PageHostShell({
  record,
  value,
  writable,
  path,
  viewId,
  schema,
}: FsContentProps & { viewId: string }) {
  return (
    <div
      className="page-editor is-host"
      data-testid="page-editor-host"
      data-page-record={record.id}
      data-page-path={path || `/pages/${record.id}`}
      tabIndex={-1}
    >
      <PageHostView
        record={record}
        viewId={viewId}
        markdown={asMarkdown(value)}
        schema={schema}
        writable={writable !== false}
      />
    </div>
  )
}

export function PageEditor(props: FsContentProps) {
  const present = usePagePresentMode(props.record.id)
  const views = usePageViews(props.record.id)
  const layout = useActivePageLayout(props.record.id)
  if (props.status === 'loading') return <PageEditorLoading />
  if (props.status === 'failed') return <PageEditorFailed onRetry={props.onRetry} />
  if (present === 'hidden') return null
  if (layout.kind === 'sandbox' && layout.file) {
    return <PageHostShell {...props} viewId={layout.id} />
  }
  if (isPageCustomView(present) && views.some((item) => item.id === present)) {
    return <PageHostShell {...props} viewId={present} />
  }
  return <PageDocEditor {...props} />
}

function PageDocEditor({ record, value, writable, onChange, path, status = 'ready', onRetry }: FsContentProps) {
  const present = usePagePresentMode(record.id)
  const source = present === 'source'
  const saved = useRef(asMarkdown(value))
  const sourceMode = useRef(source)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typedAt = useRef(0)
  const valueRef = useRef(value)
  valueRef.current = value
  const hydratedId = useRef<string | null>(null)
  const sourceFind = useRef<SourceEditorHandle>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const pathRef = useRef(path)
  pathRef.current = path
  const writableRef = useRef(writable)
  writableRef.current = writable
  const titleRef = useRef(recordTitle(record))
  titleRef.current = recordTitle(record)
  const find = usePageFind(record.id)

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editable: writable !== false && status !== 'loading' && status !== 'failed',
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
          if (isFindHotkey(event)) {
            event.preventDefault()
            const { from, to } = view.state.selection
            patchPageFind(record.id, {
              open: true,
              query: from !== to ? view.state.doc.textBetween(from, to) : getPageFind(record.id).query,
            })
            return true
          }
          return handleContentTitleNav(view, event)
        },
        handleDOMEvents: {
          dragover(view, event) {
            if (!view.dragging?.move || !event.dataTransfer) return false
            event.dataTransfer.dropEffect = 'move'
            return false
          },
        },
      },
      onSelectionUpdate: ({ editor: current }) => {
        const host = current.view.dom.closest('.page-editor')
        if (host instanceof HTMLElement) {
          const locus = markdownLocusFromSelection(current)
          stampLiveEditor(host, {
            path: pathRef.current,
            title: titleRef.current,
            line: locus?.start_line,
            insert: locus?.insert,
          })
        }
      },
      onUpdate: ({ editor: current }) => {
        if (hydratedId.current !== record.id) return
        if (writableRef.current === false) return
        typedAt.current = Date.now()
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          queueMicrotask(() => {
            if (current.isDestroyed || writableRef.current === false) return
            const next = persistEditorMarkdown(current)
            if (next === saved.current) return
            saved.current = next
            onChange?.(next)
          })
        }, 400)
      },
      onBlur: ({ editor: current }) => {
        if (hydratedId.current !== record.id) return
        if (writableRef.current === false) return
        if (timer.current) clearTimeout(timer.current)
        queueMicrotask(() => {
          if (current.isDestroyed || writableRef.current === false) return
          const next = persistEditorMarkdown(current)
          if (next === saved.current) return
          saved.current = next
          onChange?.(next)
        })
      },
    },
    [record.id],
  )
  editorRef.current = editor ?? null

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    setLivePageEditor(editor)
    setLivePagePersist((current) => {
      if (current.isDestroyed || writableRef.current === false) return
      const next = persistEditorMarkdown(current)
      if (next === saved.current) return
      saved.current = next
      onChange?.(next)
    })
    return () => {
      if (getLivePageEditor() === editor) setLivePageEditor(null)
      setLivePagePersist(null)
    }
  }, [editor, onChange])

  useEffect(() => {
    const onFind = (event: Event) => {
      const id = (event as CustomEvent<{ recordId?: string }>).detail?.recordId
      if (id && id !== record.id) return
      patchPageFind(record.id, { open: true })
    }
    window.addEventListener(PAGE_FIND_OPEN_EVENT, onFind)
    return () => {
      window.removeEventListener(PAGE_FIND_OPEN_EVENT, onFind)
    }
  }, [editor, record.id])

  useEffect(() => {
    hydratedId.current = null
  }, [record.id])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const md = asMarkdown(value)
    if (hydratedId.current !== record.id) {
      if (status === 'loading' || status === 'failed') return
      hydratedId.current = record.id
      hydrateEditorMarkdown(editor, md)
      const stamped = persistEditorMarkdown(editor)
      saved.current = stamped
      if (stamped !== md) onChange?.(stamped)
      jumpToPending(editor, stripBlockIdStamps(stamped).text, record.id, true)
      return
    }
    if (md === saved.current) {
      jumpToPending(editor, stripBlockIdStamps(md).text, record.id)
      return
    }
    const paint = (next: string) => {
      hydrateEditorMarkdown(editor, next)
      saved.current = persistEditorMarkdown(editor)
      jumpToPending(editor, stripBlockIdStamps(saved.current).text, record.id, true)
    }
    const canPaint = () =>
      shouldApplyRemoteMarkdown({
        focused: editor.isFocused,
        live: editorHostIsLive(editor),
        hasJump: Boolean(contentJumpForRecord(record.id)),
        recentlyLocal: recentlyLocalEdit(typedAt.current),
      })
    if (!canPaint()) {
      if (remoteTimer.current) clearTimeout(remoteTimer.current)
      const wait = () => {
        if (editor.isDestroyed) return
        const next = asMarkdown(valueRef.current)
        if (next === saved.current) return
        if (!canPaint()) {
          remoteTimer.current = setTimeout(wait, LOCAL_EDIT_MS)
          return
        }
        paint(next)
      }
      remoteTimer.current = setTimeout(wait, LOCAL_EDIT_MS)
      return
    }
    paint(md)
  }, [editor, record.id, value, status])

  useEffect(() => () => {
    if (remoteTimer.current) clearTimeout(remoteTimer.current)
  }, [])

  useEffect(() => {
    if (!editor || editor.isDestroyed || source) return
    const el = editor.view.dom
    bindEditorTextHost(el, {
      path: path || undefined,
      title: recordTitle(record) || undefined,
      locusFromSelection: () => markdownLocusFromSelection(editor),
      locusFromElement: (node) => markdownLocusFromElement(editor, node),
    })
    return () => bindEditorTextHost(el, null)
  }, [editor, source, path, record])

  useEffect(() => {
    if (!editor || editor.isDestroyed || !source) return
    if (!timer.current) return
    clearTimeout(timer.current)
    timer.current = null
    const next = persistEditorMarkdown(editor)
    if (next === saved.current) return
    saved.current = next
    onChange?.(next)
  }, [source, editor])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const leavingSource = sourceMode.current && !source
    sourceMode.current = source
    if (source || !leavingSource) return
    const md = asMarkdown(value)
    hydrateEditorMarkdown(editor, md)
    saved.current = persistEditorMarkdown(editor)
  }, [source, editor, value])

  useLayoutEffect(() => {
    restorePageScroll()
    const id = requestAnimationFrame(() => {
      restorePageScroll()
      requestAnimationFrame(restorePageScroll)
    })
    return () => cancelAnimationFrame(id)
  }, [source, present])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setEditable(writable !== false && status !== 'loading' && status !== 'failed')
  }, [editor, writable, status])

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
      if (status === 'loading' || status === 'failed') return
      editor.commands.focus('start')
    }
    window.addEventListener(FOCUS_RECORD_CONTENT, onFocus)
    return () => window.removeEventListener(FOCUS_RECORD_CONTENT, onFocus)
  }, [editor, status])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const onJump = () => {
      if (editor.isDestroyed) return
      jumpToPending(editor, asMarkdown(value), record.id, true)
    }
    window.addEventListener(CONTENT_JUMP_EVENT, onJump)
    return () => window.removeEventListener(CONTENT_JUMP_EVENT, onJump)
  }, [editor, record.id, value])

  const runFind = (query: string, index: number) => {
    const next = source
      ? sourceFind.current?.applyFind(query, index) ?? { total: 0, index: 0 }
      : !editor || editor.isDestroyed
        ? { total: 0, index: 0 }
        : applyEditorFind(editor, query, index)
    const cur = getPageFind(record.id)
    if (cur.index !== next.index || cur.total !== next.total) patchPageFind(record.id, next)
  }

  useEffect(() => {
    if (!find.open) {
      if (source) sourceFind.current?.applyFind('', 0)
      else if (editor && !editor.isDestroyed) applyEditorFind(editor, '', 0)
      if (find.total) patchPageFind(record.id, { total: 0, index: 0 })
      return
    }
    if (!source) {
      runFind(find.query, find.index)
      return
    }
    const id = requestAnimationFrame(() => runFind(find.query, find.index))
    return () => cancelAnimationFrame(id)
  }, [find.open, find.query, find.index, source, editor, record.id])

  const currentPick = () => {
    if (source) return pickFromLocus(path, sourceFind.current?.getLocus() ?? null, undefined, recordTitle(record))
    if (!editor || editor.isDestroyed) return null
    return pickFromEditor(editor, path, recordTitle(record))
  }

  const sendToChat = () => {
    const ref = currentPick()
    if (ref) getPick()?.attach([ref])
  }

  const onEditorHotkey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === ' ' && event.target === event.currentTarget) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (isFindHotkey(event)) {
      event.preventDefault()
      event.stopPropagation()
      const { from, to } = !source && editor && !editor.isDestroyed ? editor.state.selection : { from: 0, to: 0 }
      patchPageFind(record.id, {
        open: true,
        query: from !== to ? editor!.state.doc.textBetween(from, to) : getPageFind(record.id).query,
      })
      return
    }
    if (isSendChatHotkey(event)) {
      event.preventDefault()
      event.stopPropagation()
      sendToChat()
      return
    }
    if (isLastColorHotkey(event) && !source && editor && !editor.isDestroyed) {
      const last = readLastEditorColor()
      if (last) {
        event.preventDefault()
        event.stopPropagation()
        if (last.kind === 'text') editor.chain().focus().setColor(last.value).run()
        else editor.chain().focus().setHighlight({ color: last.value }).run()
      }
      return
    }
    if (!source && editor && !editor.isDestroyed && handleContentTitleNav(editor.view, event.nativeEvent)) {
      event.stopPropagation()
      return
    }
    const atDocStart = source
      ? Boolean(sourceFind.current?.isAtStart())
      : Boolean(
          editor &&
            !editor.isDestroyed &&
            (isDocStartSelection(
              editor.state.selection.from,
              editor.state.selection.empty,
              Selection.atStart(editor.state.doc).from,
            ) ||
              (event.key === 'ArrowUp' && atFirstVisibleLine(editor.view))),
        )
    const nested = Boolean(
      !source && editor && !editor.isDestroyed && editor.state.selection.$from.depth > 1,
    )
    if (atDocStart && shouldLeaveContentForTitle(event.key, event, 0, true, 0, nested)) {
      event.preventDefault()
      event.stopPropagation()
      if (!focusRecordTitleNear(event.currentTarget)) {
        window.dispatchEvent(new Event(FOCUS_RECORD_TITLE))
      }
    }
  }

  const onEditorBlankMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    if (status === 'loading' || status === 'failed') return
    if (present === 'table') return
    if (!source && writable !== false && editor && !editor.isDestroyed) {
      editor.commands.focus('end')
      return
    }
    event.currentTarget.focus({ preventScroll: true })
  }

  if (status === 'loading') return <PageEditorLoading />
  if (status === 'failed') return <PageEditorFailed onRetry={onRetry} />
  if (!editor) return <div className="page-editor" data-testid="page-editor-pending" />

  return (
    <div
      ref={hostRef}
      className={`page-editor${source ? ' is-source' : ''}${present === 'outline' ? ' is-outline' : ''}${present === 'table' ? ' is-table' : ''}`}
      data-page-record={record.id}
      data-page-path={path || `/pages/${record.id}`}
      tabIndex={-1}
      onMouseDown={onEditorBlankMouseDown}
      onKeyDownCapture={onEditorHotkey}
    >
      <div hidden={!source}>
        {source ? (
          <SourceEditor
            ref={sourceFind}
            value={asMarkdown(value)}
            writable={writable !== false && status === 'ready'}
            onChange={(next) => {
              if (next === saved.current) return
              saved.current = next
              onChange?.(next)
            }}
          />
        ) : null}
      </div>
      <div hidden={source}>
        {present === 'table' ? (
          <PageBlocksTable editor={editor} recordId={record.id} path={path} writable={writable !== false && status === 'ready'} />
        ) : null}
        <div className="page-editor-doc" hidden={present === 'table'}>
          <EditorContent editor={editor} />
        </div>
        {present !== 'table' && writable !== false ? <PageBlockHandle editor={editor} /> : null}
        {present !== 'table' && writable !== false ? <Bubble editor={editor} onSendChat={sendToChat} /> : null}
        {present !== 'table' && writable !== false ? <TableBar editor={editor} /> : null}
      </div>
    </div>
  )
}
