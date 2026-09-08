import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { findInPmDoc, findRanges, wrapFindIndex } from './find-ranges.ts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyEditorFind } from './find-plugin.ts'
import { pageEditorExtensions } from './kit.ts'
import { isFindHotkey } from './find-bar.tsx'
import { PAGE_EDITOR_STYLE } from './style.ts'
import { TAG_TONE_ROSE } from '@biu/public-ui'

test('findRanges is case-insensitive and walks every hit', () => {
  assert.deepEqual(findRanges('Hello hello HELLO', 'hello'), [
    { from: 0, to: 5 },
    { from: 6, to: 11 },
    { from: 12, to: 17 },
  ])
  assert.deepEqual(findRanges('abc', 'z'), [])
  assert.deepEqual(findRanges('abc', '  '), [])
})

test('wrapFindIndex wraps around', () => {
  assert.equal(wrapFindIndex(0, 3), 0)
  assert.equal(wrapFindIndex(3, 3), 0)
  assert.equal(wrapFindIndex(-1, 3), 2)
  assert.equal(wrapFindIndex(0, 0), 0)
})

test('findInPmDoc matches visible text positions', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '第一段\n\n你好世界\n\n你好',
    contentType: 'markdown',
  })
  const hits = findInPmDoc(editor.state.doc, '你好')
  assert.equal(hits.length, 2)
  const first = applyEditorFind(editor, '你好', 0)
  assert.equal(first.total, 2)
  assert.equal(editor.state.selection.empty, true)
  assert.equal(editor.state.selection.from, hits[0]!.from)
  applyEditorFind(editor, '你好', 1)
  assert.equal(editor.state.selection.empty, true)
  assert.equal(editor.state.selection.from, hits[1]!.from)
  editor.destroy()
})

test('findInPmDoc matches across marks in one paragraph', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '前 **你好**世界 后',
    contentType: 'markdown',
  })
  const hits = findInPmDoc(editor.state.doc, '你好世界')
  assert.equal(hits.length, 1)
  applyEditorFind(editor, '你好世界', 0)
  assert.equal(editor.state.selection.empty, true)
  assert.equal(editor.state.selection.from, hits[0]!.from)
  editor.destroy()
})

test('find jump does not range-select, so the style bubble stays down', () => {
  const plugin = readFileSync(resolve(import.meta.dirname, './find-plugin.ts'), 'utf8')
  assert.match(plugin, /TextSelection\.create\(editor\.state\.doc, hit\.from\)/)
  assert.doesNotMatch(plugin, /TextSelection\.create\(editor\.state\.doc, hit\.from, hit\.to\)/)
})

test('tiptap find jump uses outline scroll, not ProseMirror scrollIntoView', () => {
  const plugin = readFileSync(resolve(import.meta.dirname, './find-plugin.ts'), 'utf8')
  assert.match(plugin, /scrollOutlineTarget/)
  assert.match(plugin, /scrollFindLikeOutline/)
  assert.match(plugin, /handleScrollToSelection/)
  assert.doesNotMatch(plugin, /tr\.scrollIntoView/)
})

test('isFindHotkey is command/ctrl f without shift', () => {
  assert.equal(isFindHotkey({ key: 'f', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }), true)
  assert.equal(isFindHotkey({ key: 'f', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false }), true)
  assert.equal(isFindHotkey({ key: 'f', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true }), false)
})

test('find bar pins to the inspector chrome, not the scrolling body', () => {
  const src = readFileSync(resolve(import.meta.dirname, './find-bar.tsx'), 'utf8')
  assert.match(src, /createPortal/)
  assert.match(src, /fsdb-right/)
  assert.match(src, /page-find-slot/)
  assert.match(src, /appendChild/)
  assert.match(PAGE_EDITOR_STYLE, /\.page-find-slot\{[^}]*position:absolute/)
  assert.match(PAGE_EDITOR_STYLE, /\.fsdb-right:has\(\.page-find-slot\)\{[^}]*position:relative/)
  assert.doesNotMatch(PAGE_EDITOR_STYLE, /\.page-find-slot\{[^}]*height:0/)
  assert.doesNotMatch(PAGE_EDITOR_STYLE, /\.page-find\{[^}]*position:sticky/)
})

test('find hits use rose tag text and wash', () => {
  assert.match(PAGE_EDITOR_STYLE, new RegExp(`\\.page-find-hit\\{[^}]*color:${TAG_TONE_ROSE}`))
  assert.match(PAGE_EDITOR_STYLE, /color-mix\(in srgb,#e255a1 22%,transparent\)/)
  assert.match(PAGE_EDITOR_STYLE, /color-mix\(in srgb,#e255a1 34%,transparent\)/)
})
