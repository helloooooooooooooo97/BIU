import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { loadRecordLayouts, useActiveRecordLayout } from '@biu/core-file-system/record-layouts'
import { hydrateRecordViewCatalog, useRecordViewCatalog } from '@biu/core-file-system/record-view-catalog'
import { recordContentFallback } from '@biu/core-file-system/database-ui'
import { HeadlessPopover } from '@biu/biu-ui'
import type { SourceEditorHandle } from './source-editor.tsx'
const SourceEditor = lazy(() => import('./source-editor.tsx').then((m) => ({ default: m.SourceEditor })))
import { restorePageScroll } from './editor-scroll-pin.ts'
import { PageHostView } from './page-host-view.tsx'
import { ArrowPathIcon, ChatBubbleBottomCenterTextIcon, ChatBubbleLeftRightIcon, SparklesIcon } from '@heroicons/react/16/solid'
import { EditorContent, useEditor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/core'
import { NodeSelection, Selection } from '@tiptap/pm/state'
import type { FsContentProps } from '@biu/type-file-system/ui'
import { recordEditorExtensions } from './kit.ts'
import { PageBlockHandle } from './page-block-handle.tsx'
import { PageTableBar } from './editor-table-bar.tsx'
import { editorHostIsLive } from './editor-live.ts'
import { FOCUS_RECORD_CONTENT, FOCUS_RECORD_TITLE, enterContentFromTitle, handleContentTitleNav, shouldLeaveContentForTitle, focusRecordTitleNear, isDocStartSelection, atFirstVisibleLine, type FocusRecordContentDetail } from './title-content-nav.ts'
import { tryContentJump, contentJumpForRecord } from './content-jump.ts'
import { CONTENT_JUMP_EVENT } from '@biu/type-file-system'
import { bindEditorTextHost, getPick, pickIdFromText, pickPreview, withPickLocus } from '@biu/core-pick/web'
import { markdownLocusFromElement, markdownLocusFromRange, markdownLocusFromSelection } from './markdown-locus.ts'
import { isFindHotkey } from './find-bar.tsx'
import { applyEditorFind } from './find-plugin.ts'
import { applyStoredBlockIds, encodeBlankParagraphsForParse, markdownWithBlockIds, restoreBlankParagraphs, stripBlockIdStamps } from './block-id.ts'
import { getLivePageEditor, setLivePageEditor } from './editor-live-instance.ts'
import { PAGE_FIND_OPEN_EVENT, getPageFind, patchEditorCommentsUi, patchPageFind, useEditorCommentsUi, usePageFind } from './editor-view-state.ts'
import { captureCommentAnchor, resolveCommentAnchor } from './comment-anchor.ts'
import { collectDriftedCommentAnchors, getCommentIdsAtPos, getCommentRange, setActiveEditorComment, setEditorComments, setEditorPendingSelection } from './comment-plugin.ts'
import { sortCommentThreadsByPosition, useRecordComments, type CommentThread } from './comment-store.ts'
import { CommentInlinePopover, CommentPanel, type InlineCommentPopoverTarget } from './comment-panel.tsx'
import { InlineEditPopover, isInlineEditHotkey, type InlineEditTarget } from './inline-edit-popover.tsx'
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

export function isCommentHotkey(event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}) {
  return Boolean((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'm')
}

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
  editor.commands.setContent(encodeBlankParagraphsForParse(text), { contentType: 'markdown', emitUpdate: false })
  restoreBlankParagraphs(editor)
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

/** 节点选中（sandbox 等 pageBlock）或多格 CellSelection 不是文字选区，不要出加粗/斜体条；表格单元格内选中文字正常弹出。 */
export function pageTextBubbleOpen(editor: Editor, from: number, to: number, colorOpen = false) {
  if (editor.isActive('editorBlock')) return false
  if (editor.state.selection instanceof NodeSelection) return false
  const sel = editor.state.selection as unknown as { $anchorCell?: unknown; $headCell?: unknown }
  if (sel && sel.$anchorCell && sel.$headCell) return false
  if (colorOpen) return true
  return from !== to
}

function Bubble({
  editor,
  onSendChat,
  onAddComment,
  onInlineEdit,
  hidden = false,
}: {
  editor: Editor
  onSendChat: () => void
  onAddComment?: () => void
  onInlineEdit?: () => void
  hidden?: boolean
}) {
  const [colorOpen, setColorOpen] = useState<'text' | 'mark' | null>(null)
  const inTable = editor.isActive('table')
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
      className={hidden ? 'page-bubble is-hidden' : 'page-bubble'}
      aria-label="文字样式"
      shouldShow={({ editor: current, from, to }) => !hidden && pageTextBubbleOpen(current, from, to, Boolean(colorOpen))}
    >
      {btn('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run())}
      {btn('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run())}
      {btn('S', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run())}
      {btn('</>', editor.isActive('code'), () => editor.chain().focus().toggleCode().run())}
      {!inTable ? btn('H1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run()) : null}
      {!inTable ? btn('H2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run()) : null}
      <ColorMenus editor={editor} open={colorOpen} onOpen={setColorOpen} />
      {onAddComment ? (
        <button
          type="button"
          className="page-bubble-chat"
          title="添加批注 (⌘M)"
          aria-label="添加批注"
          onMouseDown={(event: MouseEvent) => {
            event.preventDefault()
            onAddComment()
          }}
        >
          <ChatBubbleBottomCenterTextIcon className="page-bubble-chat-icon" aria-hidden />
          批注
        </button>
      ) : null}
      {onInlineEdit ? (
        <button
          type="button"
          className="page-bubble-chat"
          title="原地修改 (⌘K)"
          aria-label="原地修改"
          onMouseDown={(event: MouseEvent) => {
            event.preventDefault()
            onInlineEdit()
          }}
        >
          <SparklesIcon className="page-bubble-chat-icon" aria-hidden />
          ⌘K
        </button>
      ) : null}
      <button
        type="button"
        className="page-bubble-chat"
        title="送到会话"
        aria-label="送到会话"
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
  return <PageTableBar editor={editor} />
}

function RecordEditorLoading() {
  return (
    <div className="page-editor page-editor-loading" data-testid="page-editor-loading" aria-busy="true" aria-live="polite">
      <ArrowPathIcon className="page-editor-loading-icon" width={22} height={22} aria-hidden />
      <span className="sr-only">正在加载正文</span>
    </div>
  )
}

function RecordEditorFailed({ onRetry }: { onRetry?: () => void }) {
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
      data-page-path={path || ''}
      tabIndex={-1}
    >
      <PageHostView
        record={record}
        viewId={viewId}
        markdown={asMarkdown(value)}
        schema={schema}
        writable={writable !== false}
        collectionPath={collectionOf(path)}
      />
    </div>
  )
}

function collectionOf(path?: string) {
  const raw = String(path ?? '').trim()
  if (!raw) return ''
  const rest = raw.replace(/^\/+/, '').replace(/\/+$/, '')
  const slash = rest.indexOf('/')
  const name = slash < 0 ? rest : rest.slice(0, slash)
  return name ? `/${name}` : ''
}

export function RecordEditor(props: FsContentProps) {
  const collection = collectionOf(props.path)
  const fallback = recordContentFallback(collection)
  const catalog = useRecordViewCatalog(collection, props.record.id)
  const fsLayout = useActiveRecordLayout(collection, props.record.id, fallback)
  const present = catalog.contentViewId || fsLayout.contentViewId || fallback
  useEffect(() => {
    hydrateRecordViewCatalog(collection, props.record.id, {
      views: props.record.views,
      propViews: props.record.propViews,
      layouts: props.record.layouts,
    })
    void loadRecordLayouts(collection, props.record.id, props.record.layouts, fallback)
  }, [collection, fallback, props.record, props.record.id, props.record.layouts])
  if (props.status === 'loading') return <RecordEditorLoading />
  if (props.status === 'failed') return <RecordEditorFailed onRetry={props.onRetry} />
  if (present === 'hidden') return null
  if (catalog.views.some((item) => item.id === present)) {
    return <PageHostShell {...props} viewId={present} />
  }
  return <PageDocEditor {...props} present={present} />
}

function PageDocEditor({ record, value, writable, onChange, path, status = 'ready', onRetry, present }: FsContentProps & { present: string }) {
  const source = present === 'source'
  const saved = useRef(asMarkdown(value))
  const sourceMode = useRef(source)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const locusTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => { if (locusTimer.current) window.clearTimeout(locusTimer.current) }, [])
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
  const commentsUi = useEditorCommentsUi(record.id)
  const comments = useRecordComments(path || '')
  const commentThreadsRef = useRef(comments.threads)
  commentThreadsRef.current = comments.threads
  const updateAnchorRef = useRef(comments.updateThreadAnchor)
  updateAnchorRef.current = comments.updateThreadAnchor

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editable: writable !== false && status !== 'loading' && status !== 'failed',
      extensions: recordEditorExtensions(),
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
        if (!(host instanceof HTMLElement)) return
        // Stamp path/title/timestamp synchronously (O(1)); defer full markdown locus to idle
        // so cursor movement and typing never serialize 1000-block docs synchronously.
        if (pathRef.current) host.dataset.livePath = pathRef.current
        else delete host.dataset.livePath
        if (titleRef.current) host.dataset.liveTitle = titleRef.current
        else delete host.dataset.liveTitle
        host.dataset.liveAt = String(Date.now())
        if (locusTimer.current) window.clearTimeout(locusTimer.current)
        locusTimer.current = window.setTimeout(() => {
          locusTimer.current = undefined
          if (current.isDestroyed) return
          const liveHost = current.view.dom.closest('.page-editor')
          if (!(liveHost instanceof HTMLElement)) return
          const locus = markdownLocusFromSelection(current)
          stampLiveEditor(liveHost, {
            path: pathRef.current,
            title: titleRef.current,
            line: locus?.start_line,
            insert: locus?.insert,
          })
        }, 150)
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
            const drifted = collectDriftedCommentAnchors(
              current,
              commentThreadsRef.current.map((t) => ({ id: t.root.id, status: t.root.status, anchor: t.root.anchor })),
            )
            for (const item of drifted) {
              void updateAnchorRef.current(item.id, item.anchor)
            }
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
    return () => {
      if (getLivePageEditor() === editor) setLivePageEditor(null)
    }
  }, [editor])

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
    const onFocus = (event: Event) => {
      if (editor.isDestroyed || !editorHostIsLive(editor)) return
      if (status === 'loading' || status === 'failed') return
      const detail = (event as CustomEvent<FocusRecordContentDetail | undefined>).detail
      if (detail?.recordId && detail.recordId !== record.id) return
      enterContentFromTitle(editor, detail)
    }
    window.addEventListener(FOCUS_RECORD_CONTENT, onFocus)
    return () => window.removeEventListener(FOCUS_RECORD_CONTENT, onFocus)
  }, [editor, record.id, status])

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

  useEffect(() => {
    if (!comments.loaded) return
    const openCount = comments.threads.filter((t) => t.root.status === 'open').length
    const resolvedCount = comments.threads.length - openCount
    if (commentsUi.openCount !== openCount || commentsUi.resolvedCount !== resolvedCount) {
      patchEditorCommentsUi(record.id, { openCount, resolvedCount })
    }
  }, [comments.loaded, comments.threads, commentsUi.openCount, commentsUi.resolvedCount, record.id])

  useEffect(() => {
    if (!editor || editor.isDestroyed || source) return
    const payload = comments.threads.map((t) => ({
      id: t.root.id,
      status: t.root.status,
      anchor: t.root.anchor,
    }))
    setEditorComments(editor, payload, commentsUi.activeId)
  }, [editor, source, comments.threads, commentsUi.activeId, value])

  useEffect(() => {
    if (!editor || editor.isDestroyed || source) return
    setActiveEditorComment(editor, commentsUi.activeId)
  }, [editor, source, commentsUi.activeId])

  const startCommentFromSelection = () => {
    if (source || !editor || editor.isDestroyed || !path) return
    const { from, to } = editor.state.selection
    const anchor = from !== to ? captureCommentAnchor(editor.state.doc, from, to) : null
    if (!anchor) return
    let rect = { top: 120, bottom: 144, left: 120, right: 240 }
    try {
      const startCoords = editor.view.coordsAtPos(from)
      const endCoords = editor.view.coordsAtPos(to)
      rect = {
        top: Math.min(startCoords.top, endCoords.top),
        bottom: Math.max(startCoords.bottom, endCoords.bottom),
        left: startCoords.left,
        right: Math.max(startCoords.right, endCoords.right),
      }
    } catch {
      /* fallback coordinates */
    }
    setInlineEditTarget(null)
    setInlineComment({ kind: 'compose', from, to, anchor, rect })
  }

  const selectCommentThread = (threadId: string) => {
    patchEditorCommentsUi(record.id, { open: true, activeId: threadId })
    if (!editor || editor.isDestroyed || source) return
    const range = getCommentRange(editor, threadId)
    if (!range) return
    try {
      const hit = editor.view.domAtPos(range.from)
      const el = hit.node instanceof Element ? hit.node : hit.node.parentElement
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch {
      /* ignore scroll failure */
    }
  }

  const askAiForComment = (thread: CommentThread) => {
    const quote = thread.root.anchor?.quote || thread.root.anchor?.originalQuote || ''
    const lines = [
      quote ? `批注原文：「${quote}」` : '',
      `批注内容：${thread.root.body}`,
      ...thread.replies.map((r) => `回复（${r.author}）：${r.body}`),
    ].filter(Boolean)
    const fullText = lines.join('\n')
    const label = pickPreview(`批注：${thread.root.body}`, 80) || '批注'
    const route = typeof window === 'undefined' ? '' : window.location.pathname
    const baseRef = {
      kind: 'text' as const,
      id: pickIdFromText(`comment:${thread.root.id}:${fullText}`),
      label,
      selection: fullText,
      text: fullText,
      route,
      ...(path ? { path } : {}),
      ...(recordTitle(record) ? { title: recordTitle(record) } : {}),
    }
    const range = editor && !editor.isDestroyed && !source ? getCommentRange(editor, thread.root.id) : null
    const locus = range && editor ? markdownLocusFromRange(editor, range.from, range.to) : null
    const ref = locus
      ? withPickLocus(baseRef, { ...locus, selection: fullText, text: fullText })
      : baseRef
    getPick()?.attach([ref])
  }

  const commentPositions = new Map<string, { from: number; to: number }>()
  const detachedCommentIds = new Set<string>()
  if (editor && !editor.isDestroyed && !source) {
    for (const thread of comments.threads) {
      if (!thread.root.anchor) continue
      const live = thread.root.status === 'open' ? getCommentRange(editor, thread.root.id) : null
      const hit = live ?? resolveCommentAnchor(editor.state.doc, thread.root.anchor)
      if (hit && hit.to > hit.from) {
        commentPositions.set(thread.root.id, { from: hit.from, to: hit.to })
      } else if (thread.root.status === 'open') {
        detachedCommentIds.add(thread.root.id)
      }
    }
  }
  const orderedCommentThreads = sortCommentThreadsByPosition(comments.threads, commentPositions)
  const [commentAnchorTops, setCommentAnchorTops] = useState<Map<string, number>>(() => new Map())
  const [draftCommentTop, setDraftCommentTop] = useState<number | null>(null)
  const [inlineEditTarget, setInlineEditTarget] = useState<InlineEditTarget | null>(null)
  const [inlineComment, setInlineComment] = useState<InlineCommentPopoverTarget | null>(null)
  const hasVisibleComments = Boolean(
    commentsUi.draftAnchor ||
      orderedCommentThreads.some((t) => commentsUi.filter === 'all' || t.root.status === commentsUi.filter),
  )
  const commentsOpen = Boolean(commentsUi.open && path && hasVisibleComments)

  useEffect(() => {
    setInlineEditTarget(null)
    setInlineComment(null)
  }, [record.id])

  useEffect(() => {
    if (commentsUi.open) setInlineComment(null)
  }, [commentsUi.open])

  useEffect(() => {
    if (!editor || editor.isDestroyed || source) return
    const range =
      inlineEditTarget && inlineEditTarget.to > inlineEditTarget.from
        ? { from: inlineEditTarget.from, to: inlineEditTarget.to }
        : inlineComment?.kind === 'compose' && inlineComment.to > inlineComment.from
          ? { from: inlineComment.from, to: inlineComment.to }
          : null
    setEditorPendingSelection(editor, range)
    return () => {
      if (!editor.isDestroyed) setEditorPendingSelection(editor, null)
    }
  }, [editor, source, inlineEditTarget, inlineComment])

  const startInlineEditFromSelection = () => {
    if (source || writable === false || !editor || editor.isDestroyed) return
    const { from, to } = editor.state.selection
    const doc = editor.state.doc
    const selection = to > from ? doc.textBetween(from, to, '\n') : ''
    const before = doc.textBetween(Math.max(0, from - 400), from, '\n')
    const after = doc.textBetween(to, Math.min(doc.content.size, to + 400), '\n')
    let top = 120
    let left = 120
    try {
      const startCoords = editor.view.coordsAtPos(from)
      const endCoords = to > from ? editor.view.coordsAtPos(to) : startCoords
      top = Math.round(Math.max(startCoords.bottom, endCoords.bottom) + 8)
      left = Math.round(startCoords.left)
    } catch {
      /* fallback coordinates */
    }
    setInlineEditTarget({ from, to, selection, before, after, top, left })
  }

  const applyInlineEdit = (text: string, target: InlineEditTarget) => {
    setInlineEditTarget(null)
    if (!editor || editor.isDestroyed) return
    const maxPos = editor.state.doc.content.size
    const from = Math.max(0, Math.min(target.from, maxPos))
    const to = Math.max(from, Math.min(target.to, maxPos))
    editor.chain().focus().insertContentAt({ from, to }, text).run()
  }

  useLayoutEffect(() => {
    if (!commentsOpen || !editor || editor.isDestroyed || source || !hostRef.current) {
      setCommentAnchorTops((prev) => (prev.size ? new Map() : prev))
      setDraftCommentTop(null)
      return
    }
    const measure = () => {
      const host = hostRef.current
      if (!host || editor.isDestroyed) return
      const rail = host.querySelector<HTMLElement>('.editor-comment-rail')
      const baseTop = (rail ?? host).getBoundingClientRect().top
      const next = new Map<string, number>()
      for (const thread of comments.threads) {
        if (!thread.root.anchor) continue
        let measuredTop: number | null = null
        if (thread.root.status === 'open') {
          const escId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(thread.root.id) : thread.root.id.replace(/["\\]/g, '\\$&')
          const markEl = host.querySelector<HTMLElement>(`.editor-comment-mark[data-comment-id="${escId}"]`)
          const visualEl = markEl?.closest('code') ?? markEl
          const firstRect = visualEl?.getClientRects?.()[0] ?? visualEl?.getBoundingClientRect?.()
          if (firstRect && firstRect.height > 0 && Number.isFinite(firstRect.top)) {
            measuredTop = firstRect.top
          }
        }
        if (measuredTop == null) {
          const live = thread.root.status === 'open' ? getCommentRange(editor, thread.root.id) : null
          const hit = live ?? resolveCommentAnchor(editor.state.doc, thread.root.anchor)
          if (!hit || hit.to <= hit.from) continue
          try {
            const coords = editor.view.coordsAtPos(hit.from)
            if (Number.isFinite(coords.top)) measuredTop = coords.top
          } catch {
            /* ignore unmeasured pos */
          }
        }
        if (measuredTop != null) {
          next.set(thread.root.id, Math.max(0, Math.round(measuredTop - baseTop)))
        }
      }
      setCommentAnchorTops((prev) => {
        if (prev.size === next.size) {
          let same = true
          for (const [k, v] of next) {
            if (prev.get(k) !== v) {
              same = false
              break
            }
          }
          if (same) return prev
        }
        return next
      })
      if (commentsUi.draftAnchor) {
        const hit = resolveCommentAnchor(editor.state.doc, commentsUi.draftAnchor)
        if (hit) {
          try {
            const coords = editor.view.coordsAtPos(hit.from)
            setDraftCommentTop(Number.isFinite(coords.top) ? Math.max(0, Math.round(coords.top - baseTop)) : null)
          } catch {
            setDraftCommentTop(null)
          }
        } else {
          setDraftCommentTop(null)
        }
      } else {
        setDraftCommentTop(null)
      }
    }
    measure()
    const raf = requestAnimationFrame(measure)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro && hostRef.current) ro.observe(hostRef.current)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [commentsOpen, commentsUi.filter, editor, source, comments.threads, commentsUi.draftAnchor, value])

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
    if (isInlineEditHotkey(event) && !source && writable !== false && editor && !editor.isDestroyed) {
      event.preventDefault()
      event.stopPropagation()
      startInlineEditFromSelection()
      return
    }
    if (isCommentHotkey(event)) {
      event.preventDefault()
      event.stopPropagation()
      startCommentFromSelection()
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
    if (event.defaultPrevented) return
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

  if (status === 'loading') return <RecordEditorLoading />
  if (status === 'failed') return <RecordEditorFailed onRetry={onRetry} />
  if (!editor) return <div className="page-editor" data-testid="page-editor-pending" />

  return (
    <div
      ref={hostRef}
      className={`page-editor${source ? ' is-source' : ''}${present === 'outline' ? ' is-outline' : ''}${present === 'table' ? ' is-table' : ''}${commentsOpen ? ' has-comments' : ''}`}
      data-page-record={record.id}
      data-page-path={path || ''}
      tabIndex={-1}
      onMouseDown={onEditorBlankMouseDown}
      onKeyDownCapture={onEditorHotkey}
    >
      <div className="page-editor-main">
        <div hidden={!source}>
          {source ? (
            <Suspense fallback={null}>
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
            </Suspense>
          ) : null}
        </div>
        <div hidden={source}>
          {present === 'table' ? (
            <PageBlocksTable editor={editor} recordId={record.id} path={path} writable={writable !== false && status === 'ready'} />
          ) : null}
          <div
            className="page-editor-doc"
            hidden={present === 'table'}
            onClick={(event) => {
              const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-comment-id]') : null
              const commentId = target?.getAttribute('data-comment-id')
              if (!commentId) return
              if (commentsOpen) {
                patchEditorCommentsUi(record.id, { activeId: commentId })
                return
              }
              const ids = [commentId]
              if (editor && !editor.isDestroyed && target) {
                try {
                  const pos = editor.view.posAtDOM(target, 0)
                  for (const id of getCommentIdsAtPos(editor, pos)) {
                    if (!ids.includes(id)) ids.push(id)
                  }
                } catch {
                  /* ignore pos lookup failure */
                }
              }
              const box = target?.getBoundingClientRect()
              const rect = box
                ? { top: box.top, bottom: box.bottom, left: box.left, right: box.right }
                : { top: event.clientY - 12, bottom: event.clientY + 12, left: event.clientX, right: event.clientX }
              setInlineEditTarget(null)
              setInlineComment({ kind: 'view', threadIds: ids, rect })
              patchEditorCommentsUi(record.id, { activeId: commentId })
            }}
          >
            <EditorContent editor={editor} />
          </div>
          {present !== 'table' && writable !== false ? <PageBlockHandle editor={editor} /> : null}
          {present !== 'table' && writable !== false ? (
            <Bubble
              editor={editor}
              onSendChat={sendToChat}
              onAddComment={path ? startCommentFromSelection : undefined}
              onInlineEdit={startInlineEditFromSelection}
              hidden={Boolean(inlineEditTarget || inlineComment)}
            />
          ) : null}
          {inlineComment && present !== 'table' && path ? (
            <CommentInlinePopover
              target={inlineComment}
              threads={orderedCommentThreads}
              totalOpenCount={commentsUi.openCount}
              detachedIds={detachedCommentIds}
              onClose={() => {
                setInlineComment(null)
                if (!commentsUi.open) patchEditorCommentsUi(record.id, { activeId: '' })
              }}
              onOpenAll={(activeId) => {
                setInlineComment(null)
                patchEditorCommentsUi(record.id, {
                  open: true,
                  ...(commentsUi.filter === 'resolved' ? { filter: 'open' } : {}),
                  ...(activeId ? { activeId } : {}),
                })
              }}
              onCreateThread={async (body, anchor) => {
                await comments.createThread(body, anchor)
              }}
              onReplyThread={async (threadId, body) => {
                await comments.replyThread(threadId, body)
              }}
              onSetStatus={async (threadId, nextStatus) => {
                await comments.setThreadStatus(threadId, nextStatus)
              }}
              onDelete={async (id) => {
                await comments.deleteComment(id)
                if (commentsUi.activeId === id) patchEditorCommentsUi(record.id, { activeId: '' })
              }}
              onAskAi={askAiForComment}
            />
          ) : null}
          {inlineEditTarget && present !== 'table' && writable !== false ? (
            <InlineEditPopover
              target={inlineEditTarget}
              title={titleRef.current}
              onApply={applyInlineEdit}
              onClose={() => {
                setInlineEditTarget(null)
                if (editor && !editor.isDestroyed) editor.commands.focus()
              }}
            />
          ) : null}
          {present !== 'table' && writable !== false ? <TableBar editor={editor} /> : null}
        </div>
      </div>
      {commentsOpen ? (
        <CommentPanel
          threads={orderedCommentThreads}
          filter={commentsUi.filter}
          activeId={commentsUi.activeId}
          detachedIds={detachedCommentIds}
          anchorTops={commentAnchorTops}
          draftAnchor={commentsUi.draftAnchor}
          draftTop={draftCommentTop}
          onCancelDraft={() => patchEditorCommentsUi(record.id, { draftAnchor: null })}
          onCreateThread={async (body, anchor) => {
            const created = await comments.createThread(body, anchor)
            if (created) patchEditorCommentsUi(record.id, { activeId: created.id })
          }}
          onReplyThread={async (threadId, body) => {
            await comments.replyThread(threadId, body)
          }}
          onSetStatus={async (threadId, nextStatus) => {
            await comments.setThreadStatus(threadId, nextStatus)
          }}
          onDelete={async (id) => {
            await comments.deleteComment(id)
            if (commentsUi.activeId === id) patchEditorCommentsUi(record.id, { activeId: '' })
          }}
          onSelectThread={selectCommentThread}
          onAskAi={askAiForComment}
        />
      ) : null}
    </div>
  )
}
