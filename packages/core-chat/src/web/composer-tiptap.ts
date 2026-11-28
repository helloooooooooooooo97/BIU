import type { Editor } from '@tiptap/react'
import { mentionPickFromAttrs } from '@biu/core-editor/mention'
import { formatPick, pickChipAttrs, pickKey, pickRefFromAttrs, splitPickStream, type PickRef } from '@biu/core-pick/web'

/** 胶囊行：左右 padding 10+10、两段 gap 8、与 CSS `.composer-pill-row` 一致。 */
const COMPACT_ROW_PAD_X = 20
const COMPACT_ROW_GAP_X = 16
export const COMPOSER_LINE_PX = 28
/** 粘贴超过这个字数时改成 pick 芯片，括号里显示字数。 */
export const COMPOSER_PASTE_PICK_CHARS = 160

/** 用「按钮还在同一行时」的编辑器宽度测是否折行，避免变方后变宽又缩回导致闪跳。 */
export function editorWrapsInCompactRow(form: HTMLElement, editorDom: HTMLElement) {
  const left = (form.querySelector('.composer-pill-left') ?? form.querySelector('.composer-plus')) as HTMLElement | null
  const right = form.querySelector('.composer-pill-right') as HTMLElement | null
  const compactW =
    form.clientWidth -
    COMPACT_ROW_PAD_X -
    COMPACT_ROW_GAP_X -
    (left?.offsetWidth ?? 28) -
    (right?.offsetWidth ?? 80)
  if (compactW <= 0) return false
  const probe = editorDom.cloneNode(true) as HTMLElement
  probe.removeAttribute('contenteditable')
  probe.style.cssText = [
    'position:absolute',
    'left:-9999px',
    'top:0',
    `width:${compactW}px`,
    'height:auto',
    'max-height:none',
    'overflow:visible',
    `line-height:${COMPOSER_LINE_PX}px`,
    'word-break:break-word',
  ].join(';')
  document.body.append(probe)
  const wraps = probe.scrollHeight > COMPOSER_LINE_PX + 4
  probe.remove()
  return wraps
}

function attrsToRef(attrs: Record<string, unknown>): PickRef | null {
  return pickRefFromAttrs(attrs)
}

export function composerEditorReady(editor: Editor | null | undefined): editor is Editor {
  return Boolean(editor && !editor.isDestroyed)
}

export function runComposerCommands(editor: Editor | null | undefined, run: (editor: Editor) => void) {
  if (!composerEditorReady(editor)) return
  try {
    run(editor)
  } catch {
    /* commandManager 已空时 TipTap 读 .commands 会抛 */
  }
}

export function serializeComposer(editor: Editor | null): { text: string; refs: PickRef[]; plain: string } {
  if (!composerEditorReady(editor)) return { text: '', refs: [], plain: '' }
  let text = ''
  let plain = ''
  const refs: PickRef[] = []
  let block = 0
  editor.state.doc.forEach((node) => {
    if (block++ > 0) {
      text += '\n'
      plain += '\n'
    }
    node.forEach((child) => {
      if (child.isText) {
        const value = child.text ?? ''
        text += value
        plain += value
        return
      }
      if (child.type.name === 'hardBreak') {
        text += '\n'
        plain += '\n'
        return
      }
      if (child.type.name === 'pickChip' || child.type.name === 'mention') {
        const ref =
          child.type.name === 'mention' ? mentionPickFromAttrs(child.attrs) : attrsToRef(child.attrs)
        if (!ref) return
        refs.push(ref)
        text += formatPick(ref)
      }
    })
  })
  return { text: text.replace(/\s+$/g, '').trim(), refs, plain }
}

export function jsonFromDraft(raw: string) {
  const parts = splitPickStream(raw)
  const content: Array<Record<string, unknown>> = []
  for (const part of parts) {
    if (part.type === 'text') {
      const lines = part.value.split('\n')
      lines.forEach((line, index) => {
        if (index > 0) content.push({ type: 'hardBreak' })
        if (line) content.push({ type: 'text', text: line })
      })
    } else {
      const ref = part.ref
      content.push({
        type: 'pickChip',
        attrs: pickChipAttrs(ref),
      })
    }
  }
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        ...(content.length ? { content } : {}),
      },
    ],
  }
}

export function collectPickKeys(editor: Editor | null) {
  const keys = new Set<string>()
  if (!editor) return keys
  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'pickChip' && node.type.name !== 'mention') return
    const ref = node.type.name === 'mention' ? mentionPickFromAttrs(node.attrs) : attrsToRef(node.attrs)
    if (ref) keys.add(pickKey(ref))
  })
  return keys
}

function chipContent(ref: PickRef) {
  return {
    type: 'pickChip',
    attrs: pickChipAttrs(ref),
  }
}

export function insertPickChips(editor: Editor, refs: PickRef[]) {
  if (!refs.length || editor.isDestroyed) return
  editor
    .chain()
    .focus()
    .insertContent(refs.map(chipContent))
    .run()
}

export function editorCaretPlain(editor: Editor | null): { value: string; cursor: number } {
  if (!editor) return { value: '', cursor: 0 }
  const doc = editor.state.doc
  const from = editor.state.selection.from
  return {
    value: doc.textBetween(0, doc.content.size, '\n', ''),
    cursor: doc.textBetween(0, from, '\n', '').length,
  }
}

export function deletePlainRange(editor: Editor, start: number, end: number) {
  const from = posAtPlainOffset(editor, start)
  const to = posAtPlainOffset(editor, end)
  if (to > from) editor.chain().focus().deleteRange({ from, to }).run()
}

function posAtPlainOffset(editor: Editor, offset: number) {
  let seen = 0
  let found = 1
  editor.state.doc.descendants((node, pos) => {
    if (node.isText) {
      const len = node.text?.length ?? 0
      if (seen + len >= offset) {
        found = pos + (offset - seen)
        return false
      }
      seen += len
      return false
    }
    if (node.type.name === 'hardBreak') {
      if (seen + 1 >= offset) {
        found = pos + 1
        return false
      }
      seen += 1
      return false
    }
    return true
  })
  return found
}
