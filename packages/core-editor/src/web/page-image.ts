import type { Editor } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { imageCaptionFromFile, pageImageAlign, pageImageMarkdown } from './page-image-attrs.ts'
import { PageImageView } from './page-image-view.tsx'

export {
  clampImageWidth,
  imageCaptionFromFile,
  pageImageAlign,
  pageImageMarkdown,
  type PageImageAlign,
} from './page-image-attrs.ts'

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

function fileFingerprint(file: File) {
  return `${file.type}\0${file.size}`
}

export function uniqueImageFiles(files: Array<File | null | undefined>): File[] {
  const seen = new Set<string>()
  const out: File[] = []
  for (const file of files) {
    if (!file || !IMAGE_MIMES.has(file.type)) continue
    const key = fileFingerprint(file)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(file)
  }
  return out
}

export function collectClipboardImages(clipboard: DataTransfer | null | undefined): File[] {
  if (!clipboard) return []
  const fromFiles = uniqueImageFiles(Array.from(clipboard.files ?? []))
  if (fromFiles.length) return fromFiles
  return uniqueImageFiles(Array.from(clipboard.items ?? []).map((item) => (item.kind === 'file' ? item.getAsFile() : null)))
}

function safeAssetFileName(name: string) {
  const base = name.replace(/^.*[/\\]/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-')
  return base || `image-${Date.now()}.png`
}

export function pageResourcePath(editor?: Editor | null) {
  const host = editor?.view.dom.closest('.page-editor')
  if (host instanceof HTMLElement) {
    const stamped = String(host.dataset.livePath || host.dataset.pagePath || '').trim()
    if (stamped) return stamped
    const rec = String(host.dataset.pageRecord || '').trim()
    if (rec) return `/pages/${rec}`
  }
  return '/pages'
}

export async function uploadPageImage(file: File, path = '/pages') {
  const hint = `${Date.now()}-${safeAssetFileName(file.name)}`
  const resource = path.trim() || '/pages'
  const res = await fetch(`/api/db/file/hash/${encodeURIComponent(hint)}?path=${encodeURIComponent(resource)}`, {
    method: 'PUT',
    headers: {
      'content-type': file.type || 'application/octet-stream',
      'x-biu-resource-path': resource,
    },
    body: file,
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string; href?: string; name?: string }
  if (!res.ok) throw new Error(body.error || res.statusText)
  const name = body.name || hint
  return body.href || `/api/db/file/${encodeURIComponent(name)}`
}

function insertSrc(editor: Editor, src: string, alt = '') {
  if (editor.isDestroyed || !src) return
  if (editor.chain().focus().setImage({ src, alt }).run()) return
  editor.chain().focus().insertContent({ type: 'image', attrs: { src, alt } }).run()
}

export async function insertClipboardImages(editor: Editor, files: File[], _pos?: number) {
  for (const file of files) {
    try {
      const src = await uploadPageImage(file, pageResourcePath(editor))
      if (editor.isDestroyed) return
      insertSrc(editor, src, imageCaptionFromFile(file.name))
    } catch {
      /* skip failed upload */
    }
  }
}

export function stripPastedDataImages(html: string) {
  return html.replace(/<img\b[^>]*\bsrc=["']data:image[^"']*["'][^>]*>/gi, '')
}

const pageImagePasteKey = new PluginKey('page-image-paste')

export const pageImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'left',
        parseHTML: (el) => pageImageAlign(el.getAttribute('data-align')),
        renderHTML: (attrs) => {
          const align = pageImageAlign(attrs.align)
          return align === 'left' ? {} : { 'data-align': align }
        },
      },
    }
  },

  renderMarkdown: (node) => pageImageMarkdown((node.attrs ?? {}) as Record<string, unknown>),

  addNodeView() {
    return ReactNodeViewRenderer(PageImageView, {
      className: 'page-image-node',
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null
        return Boolean(target?.closest('input, button, .page-slide-bar, .page-image-resize, .page-image-lightbox'))
      },
    })
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: pageImagePasteKey,
        props: {
          transformPastedHTML(html) {
            return stripPastedDataImages(html)
          },
          handlePaste(_view, event) {
            const files = collectClipboardImages(event.clipboardData)
            if (!files.length) return false
            event.preventDefault()
            const pos = editor.state.selection.from
            void insertClipboardImages(editor, files, pos)
            return true
          },
          handleDrop(view, event) {
            const files = uniqueImageFiles(Array.from(event.dataTransfer?.files ?? []))
            if (!files.length) return false
            event.preventDefault()
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
            const pos = coords?.pos ?? editor.state.selection.from
            void insertClipboardImages(editor, files, pos)
            return true
          },
        },
      }),
    ]
  },
}).configure({ inline: false, allowBase64: false })
