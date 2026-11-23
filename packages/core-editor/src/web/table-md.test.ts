import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { recordEditorExtensions } from './kit.ts'
import { tableNeedsFence, takeTableFence } from './table-md.ts'

function editorOf(markdown: string) {
  return new Editor({
    extensions: recordEditorExtensions(),
    content: markdown,
    contentType: 'markdown',
  })
}

test('plain GFM tables still roundtrip', () => {
  const editor = editorOf(`| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |\n`)
  assert.equal(editor.getJSON().content?.some((node) => node.type === 'table'), true)
  assert.match(editor.getMarkdown(), /\|/)
  assert.doesNotMatch(editor.getMarkdown(), /:::table/)
  editor.destroy()
})

test('table fence keeps a registered pageBlock inside a cell', () => {
  const src = `:::table

:::row

:::th
需求
:::

:::th
方案
:::

:::

:::row

:::td
说明
:::

:::td
:::editorBlock {kind=sandbox plugin=page-sandbox id=ab12cd34}
{"file":"assets/a.isx"}
:::
:::

:::

:::
`
  const fence = takeTableFence(src)
  assert.ok(fence)
  assert.equal(fence?.rows.length, 2)
  assert.match(fence?.rows[1]?.cells[1]?.md ?? '', /:::editorBlock \{kind=sandbox/)
  const editor = editorOf(src)
  const names = new Set<string>()
  editor.state.doc.descendants((node) => {
    names.add(node.type.name)
  })
  assert.equal(names.has('table'), true)
  assert.equal(names.has('editorBlock'), true)
  const out = editor.getMarkdown()
  assert.match(out, /:::table/)
  assert.match(out, /:::editorBlock \{kind=sandbox plugin=page-sandbox id=ab12cd34\}/)
  editor.commands.setContent(out, { contentType: 'markdown' })
  let blocks = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'editorBlock') blocks += 1
  })
  assert.equal(blocks, 1)
  editor.destroy()
})

test('inserting a pageBlock into a table writes a fence, not a one-line GFM cell', () => {
  const editor = editorOf('')
  editor.commands.insertContent({
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: [
          { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '甲' }] }] },
          { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '乙' }] }] },
        ],
      },
      {
        type: 'tableRow',
        content: [
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
          {
            type: 'tableCell',
            content: [
              {
                type: 'editorBlock',
                attrs: { kind: 'video', plugin: 'page-video', id: 'viddemo1', data: { script: '<timeline>\n:::\n<track />\n</timeline>' } },
              },
            ],
          },
        ],
      },
    ],
  })
  assert.equal(tableNeedsFence(editor.getJSON().content?.find((node) => node.type === 'table') ?? {}), true)
  const md = editor.getMarkdown()
  assert.match(md, /:::table/)
  assert.match(md, /:::editorBlock \{kind=video[\s\S]*:::\n<track \/>/)
  editor.commands.setContent(md, { contentType: 'markdown' })
  const names = new Set<string>()
  editor.state.doc.descendants((node) => {
    names.add(node.type.name)
  })
  assert.equal(names.has('editorBlock'), true)
  assert.equal(names.has('table'), true)
  editor.destroy()
})

test('table cells preserve bold, text color, highlight, align, and background across markdown roundtrip', () => {
  const editor = editorOf('| A | B |\n| --- | --- |\n| hello | world |\n')
  let helloPos = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === 'hello') helloPos = pos
  })
  assert.ok(helloPos > 0)
  editor
    .chain()
    .setTextSelection({ from: helloPos, to: helloPos + 5 })
    .toggleBold()
    .setColor('var(--biu-color-ink-red)')
    .setHighlight({ color: 'var(--biu-color-wash-yellow)' })
    .setCellAttribute('align', 'center')
    .setCellAttribute('background', 'var(--biu-color-wash-sky)')
    .run()

  const md = editor.getMarkdown()
  assert.match(md, /:::table/)
  assert.match(md, /align=center/)
  assert.match(md, /bg="var\(--biu-color-wash-sky\)"/)

  editor.commands.setContent(md, { contentType: 'markdown' })
  const restored: { cell: Record<string, unknown> | null } = { cell: null }
  const marks = new Set<string>()
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'tableCell' && node.textContent === 'hello') {
      restored.cell = node.attrs as Record<string, unknown>
    }
    if (node.isText && node.text === 'hello') {
      for (const m of node.marks) marks.add(m.type.name)
    }
  })
  assert.equal(restored.cell?.align, 'center')
  assert.equal(restored.cell?.background, 'var(--biu-color-wash-sky)')
  assert.equal(marks.has('bold'), true)
  assert.equal(marks.has('textStyle'), true)
  assert.equal(marks.has('highlight'), true)
  editor.destroy()
})
