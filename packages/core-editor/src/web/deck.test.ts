import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { pageEditorExtensions } from './kit.ts'
import { filterSlashItems } from './slash.ts'
import { takeDeckFence } from './deck-md.ts'
import { PAGE_EDITOR_STYLE } from './style.ts'

function editorOf(markdown: string) {
  return new Editor({
    extensions: pageEditorExtensions(),
    content: markdown,
    contentType: 'markdown',
  })
}

test('deck css grids cells on the deck body', () => {
  assert.match(PAGE_EDITOR_STYLE, /\[data-deck\]\[data-layout=split\] \.page-deck-body/)
  assert.match(PAGE_EDITOR_STYLE, /\.page-deck-body\{display:grid/)
  assert.match(PAGE_EDITOR_STYLE, /react-renderer\.node-deck\{display:block;width:100%;min-width:0;border:0/)
  assert.match(PAGE_EDITOR_STYLE, /\[data-deck\]\{display:flex/)
  assert.match(PAGE_EDITOR_STYLE, /\[data-deck\]\{[^}]*background:transparent/)
  assert.doesNotMatch(PAGE_EDITOR_STYLE, /data-deck-slide|page-deck-slides/)
})

test('slash lists Deck as a core container, not a page plugin', () => {
  const item = filterSlashItems('gamma').find((entry) => entry.id === 'deck')
  assert.equal(item?.label, 'Deck')
  assert.equal(item?.pluginId, undefined)
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '/',
    contentType: 'markdown',
  })
  const from = editor.state.selection.from - 1
  item!.command({ editor, range: { from: Math.max(1, from), to: editor.state.selection.from } })
  const deck = editor.getJSON().content?.find((node) => node.type === 'deck')
  assert.ok(deck)
  assert.equal(deck?.content?.[0]?.type, 'deckCell')
  editor.destroy()
})

test('deck markdown keeps nested pageBlock fences', () => {
  const src = `:::deck {layout=split}

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
  const fence = takeDeckFence(src)
  assert.ok(fence)
  assert.equal(fence?.layout, 'split')
  assert.match(fence?.cells[0] ?? '', /:::pageBlock \{kind=excalidraw/)
  assert.match(fence?.cells[0] ?? '', /assets\/board\.json/)
  const editor = editorOf(src)
  const types: string[] = []
  editor.state.doc.descendants((node) => {
    types.push(node.type.name)
  })
  assert.equal(types.includes('deck'), true)
  assert.equal(types.includes('deckSlide'), false)
  assert.equal(types.includes('deckCell'), true)
  assert.equal(types.includes('pageBlock'), true)
  const out = editor.getMarkdown()
  assert.match(out, /:::deck \{layout=split\}/)
  assert.doesNotMatch(out, /:::slide/)
  assert.match(out, /:::pageBlock \{kind=excalidraw plugin=page-excalidraw id=ab12cd34\}/)
  editor.destroy()
})

test('setDeckLayout pads cells so more blocks can sit together', () => {
  const editor = editorOf('')
  editor.commands.insertDeck('split')
  editor.commands.setDeckLayout('trio')
  let cells = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'deckCell') cells += 1
  })
  assert.equal(cells, 3)
  editor.destroy()
})

test('deckCell accepts real block children: table and pageBlock', () => {
  const editor = editorOf('')
  editor.commands.insertContent({
    type: 'deck',
    attrs: { layout: 'split' },
    content: [
      {
        type: 'deckCell',
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
        type: 'deckCell',
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
  assert.equal(names.has('deck'), true)
  assert.equal(names.has('deckSlide'), false)
  assert.equal(names.has('table'), true)
  assert.equal(names.has('pageBlock'), true)
  editor.destroy()
})
