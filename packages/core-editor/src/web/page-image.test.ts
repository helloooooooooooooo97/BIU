import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Editor } from '@tiptap/core'
import {
  collectClipboardImages,
  insertClipboardImages,
  pageImageMarkdown,
  stripPastedDataImages,
  uploadPageImage,
} from './page-image.ts'
import { recordEditorExtensions } from './kit.ts'

test('uploadPageImage PUTs to hash storage and returns the asset href', async () => {
  const calls: Array<{ url: string; method: string; headers?: HeadersInit }> = []
  const prev = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: String(init?.method ?? 'GET'), headers: init?.headers })
    return new Response(JSON.stringify({ name: 'ab'.repeat(32) + '.png', href: '/api/db/file/' + 'ab'.repeat(32) + '.png' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const href = await uploadPageImage(new File([new Uint8Array([0x89, 0x50])], 'shot.png', { type: 'image/png' }), '/pages/p1')
    assert.match(calls[0]?.url ?? '', /\/api\/db\/file\/hash\/.*[?&]path=%2Fpages%2Fp1/)
    assert.equal(calls[0]?.method, 'PUT')
    assert.equal((calls[0]?.headers as Record<string, string>)['x-biu-resource-path'], '/pages/p1')
    assert.match(href, /^\/api\/db\/file\/[a-f0-9]+\.png$/i)
  } finally {
    globalThis.fetch = prev
  }
})

test('insertClipboardImages writes an asset href, not a data URL', async () => {
  const prev = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ href: '/api/db/file/deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef.png' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch
  const editor = new Editor({
    extensions: recordEditorExtensions(),
    content: 'hello',
    contentType: 'markdown',
  })
  try {
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'paste.png', { type: 'image/png' })
    await insertClipboardImages(editor, [file], editor.state.selection.from)
    const md = editor.getMarkdown()
    assert.match(md, /!\[paste\.png\]\(\/api\/db\/file\/deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef\.png\)/)
    assert.doesNotMatch(md, /data:image/)
  } finally {
    editor.destroy()
    globalThis.fetch = prev
  }
})

test('pageImageMarkdown keeps simple images and writes html when sized or aligned', () => {
  assert.equal(pageImageMarkdown({ src: '/a.png', alt: '封面' }), '![封面](/a.png)')
  assert.match(pageImageMarkdown({ src: '/a.png', alt: '封面', width: 240, align: 'center' }), /<img /)
  assert.match(pageImageMarkdown({ src: '/a.png', alt: '封面', width: 240, align: 'center' }), /width="240"/)
  assert.match(pageImageMarkdown({ src: '/a.png', alt: '封面', width: 240, align: 'center' }), /data-align="center"/)
})

test('image size and align persist through markdown', () => {
  const first = new Editor({
    extensions: recordEditorExtensions(),
    content: '![封面](/api/db/file/cover.png)',
    contentType: 'markdown',
  })
  try {
    first.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') first.commands.setNodeSelection(pos)
    })
    first.commands.updateAttributes('image', { width: 240, align: 'center' })
    const md = first.getMarkdown()
    assert.match(md, /<img /)
    const second = new Editor({
      extensions: recordEditorExtensions(),
      content: md,
      contentType: 'markdown',
    })
    try {
      let attrs: Record<string, unknown> | null = null
      second.state.doc.descendants((node) => {
        if (node.type.name === 'image') attrs = node.attrs as Record<string, unknown>
      })
      assert.equal(attrs?.alt, '封面')
      assert.equal(Number(attrs?.width), 240)
      assert.equal(attrs?.align, 'center')
    } finally {
      second.destroy()
    }
  } finally {
    first.destroy()
  }
})

test('image chrome uses the same top slide bar as html and slide', () => {
  const view = readFileSync(resolve(import.meta.dirname, './page-image-view.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, './style.ts'), 'utf8')
  assert.match(view, /className="page-slide-bar"/)
  assert.match(view, /ArrowsPointingOutIcon/)
  assert.doesNotMatch(view, /page-image-bar/)
  assert.match(css, /\.page-editor \.tiptap \.page-image \.page-slide-bar\{top:8px;right:8px;left:auto\}/)
})

test('collectClipboardImages keeps image files and stripPastedDataImages drops inline data URLs', () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' })
  const clipboard = {
    files: [file],
    items: [] as DataTransferItem[],
  } as unknown as DataTransfer
  assert.equal(collectClipboardImages(clipboard).length, 1)
  assert.equal(stripPastedDataImages('<p>x</p><img src="data:image/png;base64,QQ==">'), '<p>x</p>')
})
