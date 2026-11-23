import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react/menus'
import { TrashIcon, SwatchIcon } from '@heroicons/react/16/solid'
import { HeadlessPopover } from '@biu/biu-ui'
import { WASH_TONES } from './color-swatches.ts'

function isMultiCellSelection(editor: Editor) {
  const sel = editor.state.selection as unknown as { $anchorCell?: unknown; $headCell?: unknown }
  return Boolean(sel && sel.$anchorCell && sel.$headCell)
}

export function pageTableBarOpen(editor: Editor, from: number, to: number, bgOpen = false) {
  if (!editor.isEditable || !editor.isActive('table')) return false
  if (bgOpen) return true
  if (isMultiCellSelection(editor)) return true
  // Single-cell text selection belongs to the text style bubble (B / I / S / color / highlight)
  return from === to
}

function tableRectForEditor(editor: Editor): DOMRect | null {
  try {
    const domAt = editor.view.domAtPos(editor.state.selection.from)
    const node = domAt.node instanceof Element ? domAt.node : domAt.node.parentElement
    const table = node?.closest('table')
    if (table) return table.getBoundingClientRect()
  } catch {
    /* ignore */
  }
  return null
}

function SvgIcon({ children }: { children: ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}

const ICONS = {
  rowAbove: (
    <SvgIcon>
      <rect x="2.5" y="7.5" width="11" height="5.5" rx="1.2" />
      <path d="M8 2v3.5M6.2 3.75h3.6" />
    </SvgIcon>
  ),
  rowBelow: (
    <SvgIcon>
      <rect x="2.5" y="3" width="11" height="5.5" rx="1.2" />
      <path d="M8 10.5V14M6.2 12.25h3.6" />
    </SvgIcon>
  ),
  headerRow: (
    <SvgIcon>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12" />
      <rect x="2.5" y="3" width="11" height="3" fill="currentColor" stroke="none" opacity="0.35" />
    </SvgIcon>
  ),
  colLeft: (
    <SvgIcon>
      <rect x="7.5" y="2.5" width="5.5" height="11" rx="1.2" />
      <path d="M2 8h3.5M3.75 6.2v3.6" />
    </SvgIcon>
  ),
  colRight: (
    <SvgIcon>
      <rect x="3" y="2.5" width="5.5" height="11" rx="1.2" />
      <path d="M10.5 8H14M12.25 6.2v3.6" />
    </SvgIcon>
  ),
  headerCol: (
    <SvgIcon>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M6.5 2.5v11" />
      <rect x="2.5" y="3" width="3.5" height="10" fill="currentColor" stroke="none" opacity="0.35" />
    </SvgIcon>
  ),
  alignLeft: (
    <SvgIcon>
      <path d="M2.5 4h11M2.5 8h7.5M2.5 12h9.5" />
    </SvgIcon>
  ),
  alignCenter: (
    <SvgIcon>
      <path d="M2.5 4h11M4.25 8h7.5M3.25 12h9.5" />
    </SvgIcon>
  ),
  alignRight: (
    <SvgIcon>
      <path d="M2.5 4h11M6 8h7.5M4 12h9.5" />
    </SvgIcon>
  ),
  merge: (
    <SvgIcon>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M5 8h6M6.8 6.2L5 8l1.8 1.8M9.2 6.2L11 8l-1.8 1.8" />
    </SvgIcon>
  ),
  split: (
    <SvgIcon>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M8 2.5v11M4.2 8h2M9.8 8h2" />
    </SvgIcon>
  ),
  delRow: (
    <SvgIcon>
      <rect x="2.5" y="5" width="11" height="6" rx="1.2" />
      <path d="M6 8h4" />
    </SvgIcon>
  ),
  delCol: (
    <SvgIcon>
      <rect x="5" y="2.5" width="6" height="11" rx="1.2" />
      <path d="M6.5 8h3" />
    </SvgIcon>
  ),
}

export function PageTableBar({ editor }: { editor: Editor }) {
  const [bgOpen, setBgOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const bgTriggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const reset = () => setConfirmDelete(false)
    editor.on('selectionUpdate', reset)
    editor.on('blur', reset)
    return () => {
      editor.off('selectionUpdate', reset)
      editor.off('blur', reset)
    }
  }, [editor])

  useEffect(() => {
    if (!confirmDelete) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmDelete(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmDelete])

  const cellAttrs = editor.getAttributes('tableCell')
  const headerAttrs = editor.getAttributes('tableHeader')
  const currentAlign = String(cellAttrs.align || headerAttrs.align || '')
  const currentBg = String(cellAttrs.background || headerAttrs.background || '')
  const canMerge = editor.can().mergeCells()
  const canSplit = editor.can().splitCell()

  const iconBtn = (opts: {
    label: string
    icon: ReactNode
    on?: boolean
    danger?: boolean
    confirm?: boolean
    disabled?: boolean
    testId?: string
    run: () => void
  }) => (
    <button
      type="button"
      className={[opts.on ? 'is-on' : '', opts.danger ? 'is-danger' : '', opts.confirm ? 'is-confirm' : '']
        .filter(Boolean)
        .join(' ') || undefined}
      title={opts.label}
      aria-label={opts.label}
      data-testid={opts.testId}
      disabled={opts.disabled}
      onMouseDown={(event: MouseEvent) => {
        event.preventDefault()
        if (opts.disabled) return
        opts.run()
      }}
    >
      {opts.icon}
    </button>
  )

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="page-table-bar"
      className="page-bubble page-table-bar"
      aria-label="表格工具栏"
      options={{ placement: 'top-start', offset: 6 }}
      getReferencedVirtualElement={() => {
        const rect = tableRectForEditor(editor)
        if (!rect) return null
        return { getBoundingClientRect: () => rect }
      }}
      shouldShow={({ editor: current, from, to }) => pageTableBarOpen(current, from, to, bgOpen)}
    >
      {/* 行操作 */}
      {iconBtn({ label: '在上方插入行', icon: ICONS.rowAbove, testId: 'table-add-row-before', run: () => { setConfirmDelete(false); editor.chain().focus().addRowBefore().run() } })}
      {iconBtn({ label: '在下方插入行', icon: ICONS.rowBelow, testId: 'table-add-row-after', run: () => { setConfirmDelete(false); editor.chain().focus().addRowAfter().run() } })}
      {iconBtn({ label: '切换表头行', icon: ICONS.headerRow, testId: 'table-toggle-header-row', run: () => { setConfirmDelete(false); editor.chain().focus().toggleHeaderRow().run() } })}

      <span className="page-table-bar-sep" aria-hidden />

      {/* 列操作 */}
      {iconBtn({ label: '在左侧插入列', icon: ICONS.colLeft, testId: 'table-add-col-before', run: () => { setConfirmDelete(false); editor.chain().focus().addColumnBefore().run() } })}
      {iconBtn({ label: '在右侧插入列', icon: ICONS.colRight, testId: 'table-add-col-after', run: () => { setConfirmDelete(false); editor.chain().focus().addColumnAfter().run() } })}
      {iconBtn({ label: '切换表头列', icon: ICONS.headerCol, testId: 'table-toggle-header-col', run: () => { setConfirmDelete(false); editor.chain().focus().toggleHeaderColumn().run() } })}

      <span className="page-table-bar-sep" aria-hidden />

      {/* 对齐 + 合并/拆分 + 单元格底色 */}
      {iconBtn({ label: '左对齐', icon: ICONS.alignLeft, on: currentAlign === 'left', testId: 'table-align-left', run: () => editor.chain().focus().setCellAttribute('align', currentAlign === 'left' ? null : 'left').run() })}
      {iconBtn({ label: '居中对齐', icon: ICONS.alignCenter, on: currentAlign === 'center', testId: 'table-align-center', run: () => editor.chain().focus().setCellAttribute('align', currentAlign === 'center' ? null : 'center').run() })}
      {iconBtn({ label: '右对齐', icon: ICONS.alignRight, on: currentAlign === 'right', testId: 'table-align-right', run: () => editor.chain().focus().setCellAttribute('align', currentAlign === 'right' ? null : 'right').run() })}
      {canMerge ? iconBtn({ label: '合并单元格', icon: ICONS.merge, testId: 'table-merge-cells', run: () => editor.chain().focus().mergeCells().run() }) : null}
      {canSplit ? iconBtn({ label: '拆分单元格', icon: ICONS.split, testId: 'table-split-cell', run: () => editor.chain().focus().splitCell().run() }) : null}

      <button
        ref={bgTriggerRef}
        type="button"
        className={bgOpen || currentBg ? 'is-on' : undefined}
        title="单元格背景色"
        aria-label="单元格背景色"
        data-testid="table-cell-bg"
        onMouseDown={(event: MouseEvent) => {
          event.preventDefault()
          setConfirmDelete(false)
          setBgOpen((prev) => !prev)
        }}
      >
        <SwatchIcon width={15} height={15} aria-hidden />
      </button>
      <HeadlessPopover
        open={bgOpen}
        onOpenChange={setBgOpen}
        anchorRef={bgTriggerRef}
        side="bottom"
        align="start"
      >
        <div className="page-color-pop page-table-cell-bg-pop">
          <div className="page-color-grid" role="menu" aria-label="单元格背景色">
            <button
              type="button"
              className={`page-color-swatch${!currentBg ? ' is-on' : ''}`}
              title="无背景色"
              aria-label="无背景色"
              onMouseDown={(event) => {
                event.preventDefault()
                editor.chain().focus().setCellAttribute('background', null).run()
                setBgOpen(false)
              }}
            >
              ✕
            </button>
            {WASH_TONES.slice(0, 10).map((tone) => (
              <button
                key={tone.id}
                type="button"
                className={`page-color-swatch${currentBg === tone.value ? ' is-on' : ''}`}
                title={`背景：${tone.label}`}
                aria-label={`背景：${tone.label}`}
                style={{ background: tone.value }}
                onMouseDown={(event) => {
                  event.preventDefault()
                  editor.chain().focus().setCellAttribute('background', tone.value).run()
                  setBgOpen(false)
                }}
              />
            ))}
          </div>
        </div>
      </HeadlessPopover>

      <span className="page-table-bar-sep" aria-hidden />

      {/* 破坏性操作：删行 / 删列 / 删表（二次确认） */}
      {iconBtn({ label: '删除当前行', icon: ICONS.delRow, danger: true, testId: 'table-delete-row', run: () => { setConfirmDelete(false); editor.chain().focus().deleteRow().run() } })}
      {iconBtn({ label: '删除当前列', icon: ICONS.delCol, danger: true, testId: 'table-delete-col', run: () => { setConfirmDelete(false); editor.chain().focus().deleteColumn().run() } })}
      {iconBtn({
        label: confirmDelete ? '再次点击确认删除表格' : '删除表格',
        icon: <TrashIcon width={15} height={15} aria-hidden />,
        danger: true,
        confirm: confirmDelete,
        testId: 'table-delete-table',
        run: () => {
          if (!confirmDelete) {
            setConfirmDelete(true)
            return
          }
          setConfirmDelete(false)
          editor.chain().focus().deleteTable().run()
        },
      })}
    </BubbleMenu>
  )
}
