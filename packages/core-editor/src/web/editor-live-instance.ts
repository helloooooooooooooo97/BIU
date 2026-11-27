import type { Editor } from '@tiptap/core'

let live: Editor | null = null

export function setLivePageEditor(editor: Editor | null) {
  live = editor && !editor.isDestroyed ? editor : null
}

export function getLivePageEditor() {
  return live && !live.isDestroyed ? live : null
}
