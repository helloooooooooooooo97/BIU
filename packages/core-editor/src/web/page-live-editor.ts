import type { Editor } from '@tiptap/core'

let live: Editor | null = null
let persist: ((editor: Editor) => void) | null = null

export function setLivePageEditor(editor: Editor | null) {
  live = editor && !editor.isDestroyed ? editor : null
  if (!live) persist = null
}

export function getLivePageEditor() {
  return live && !live.isDestroyed ? live : null
}

export function setLivePagePersist(fn: ((editor: Editor) => void) | null) {
  persist = fn
}

export function persistLivePageEditor() {
  const editor = getLivePageEditor()
  if (!editor || !persist) return
  persist(editor)
}
