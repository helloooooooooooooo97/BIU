import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { pageEditorExtensions } from './kit.ts'
import { filterSlashItems } from './slash.ts'
import { takeSlideFence } from './slide-md.ts'
import { PAGE_EDITOR_STYLE } from './style.ts'

function editorOf(markdown: string) {
  return new Editor({
    extensions: pageEditorExtensions(),
    content: markdown,
    contentType: 'markdown',
  })
}

test('slide css grids cells on the slide body', () => {
  assert.match(PAGE_EDITOR_STYLE, /\[data-slide\]\[data-layout=split\] \.page-slide-body/)
  assert.match(PAGE_EDITOR_STYLE, /\.page-slide-body\{display:grid/)
  assert.match(PAGE_EDITOR_STYLE, /react-renderer\.node-slide\{display:block;width:100%;min-width:0;border:0/)
  assert.match(PAGE_EDITOR_STYLE, /\[data-slide\]\{display:flex/)
  assert.match(PAGE_EDITOR_STYLE, /\[data-slide\]\{[^}]*background:transparent/)
  assert.doesNotMatch(PAGE_EDITOR_STYLE, /data-deck|page-deck|:::deck/)
})

test('slash lists Slide as a core container, not a page plugin', () => {
  const item = filterSlashItems('gamma').find((entry) => entry.id === 'slide')
  assert.equal(item?.label, 'Slide')
  assert.equal(item?.pluginId, undefined)
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '/',
    contentType: 'markdown',
  })
  const from = editor.state.selection.from - 1
  item!.command({ editor, range: { from: Math.max(1, from), to: editor.state.selection.from } })
  const node = editor.getJSON().content?.find((entry) => entry.type === 'slide')
  assert.ok(node)
  assert.equal(node?.content?.[0]?.type, 'slideCell')
  editor.destroy()
})

test('slide markdown keeps nested pageBlock fences', () => {
  const src = `:::slide {layout=split}

:::cell
:::pageBlock {kind=excalidraw plugin=page-excalidraw id=ab12cd34}
{"file":"assets/board.json"}
:::
:::

:::cell
对比表
:::

:::
`
  const fence = takeSlideFence(src)
  assert.ok(fence)
  assert.equal(fence?.layout, 'split')
  assert.match(fence?.cells[0] ?? '', /:::pageBlock \{kind=excalidraw/)
  assert.match(fence?.cells[0] ?? '', /assets\/board\.json/)
  const editor = editorOf(src)
  const types: string[] = []
  editor.state.doc.descendants((node) => {
    types.push(node.type.name)
  })
  assert.equal(types.includes('slide'), true)
  assert.equal(types.includes('slideCell'), true)
  assert.equal(types.includes('deck'), false)
  assert.equal(types.includes('pageBlock'), true)
  const out = editor.getMarkdown()
  assert.match(out, /:::slide \{layout=split\}/)
  assert.doesNotMatch(out, /:::deck/)
  assert.match(out, /:::pageBlock \{kind=excalidraw plugin=page-excalidraw id=ab12cd34\}/)
  editor.destroy()
})

test('setSlideLayout pads cells so more blocks can sit together', () => {
  const editor = editorOf('')
  editor.commands.insertSlide('split')
  editor.commands.setSlideLayout('trio')
  let cells = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'slideCell') cells += 1
  })
  assert.equal(cells, 3)
  editor.destroy()
})

test('slideCell accepts real block children: table and pageBlock', () => {
  const editor = editorOf('')
  editor.commands.insertContent({
    type: 'slide',
    attrs: { layout: 'split' },
    content: [
      {
        type: 'slideCell',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '需求' }] }] },
                  { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '方案' }] }] },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'slideCell',
        content: [
          {
            type: 'pageBlock',
            attrs: { kind: 'excalidraw', plugin: 'page-excalidraw', id: 'ab12cd34', data: { file: 'assets/board.json' } },
          },
        ],
      },
    ],
  })
  const names = new Set<string>()
  editor.state.doc.descendants((node) => {
    names.add(node.type.name)
  })
  assert.equal(names.has('slide'), true)
  assert.equal(names.has('slideCell'), true)
  assert.equal(names.has('table'), true)
  assert.equal(names.has('pageBlock'), true)
  editor.destroy()
})
