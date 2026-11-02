import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { pageEditorExtensions } from './kit.ts'
import { listPageTableBlocks, replaceBlockPlainText, writeBackTableBlock } from './page-blocks-table.tsx'
import { PAGE_EDITOR_STYLE } from './style.ts'

test('table view lists every top-level block', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '# 甲\n\n乙\n\n- 丙',
    contentType: 'markdown',
  })
  const rows = listPageTableBlocks(editor.state.doc)
  assert.deepEqual(
    rows.map((item) => [item.kind, item.label, item.type]),
    [
      ['标题 1', '甲', 'heading'],
      ['段落', '乙', 'paragraph'],
      ['列表', '丙', 'bulletList'],
    ],
  )
  assert.equal(rows.every((item) => 'id' in item), true)
  editor.destroy()
})

test('replaceBlockPlainText writes the first textblock back', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '# 甲\n\n乙',
    contentType: 'markdown',
  })
  const rows = listPageTableBlocks(editor.state.doc)
  const para = rows.find((item) => item.type === 'paragraph')
  assert.ok(para)
  assert.equal(replaceBlockPlainText(editor, para.pos, '回改后'), true)
  assert.equal(listPageTableBlocks(editor.state.doc).find((item) => item.type === 'paragraph')?.label, '回改后')
  editor.destroy()
})

test('table mode hides the document and keeps the content peek', () => {
  assert.match(PAGE_EDITOR_STYLE, /\.page-editor\.is-table \.page-editor-doc\{display:none/)
  assert.match(PAGE_EDITOR_STYLE, /\.page-editor\.is-table \.page-blocks-table-preview \.tiptap\{display:block/)
  assert.match(PAGE_EDITOR_STYLE, /tr:hover \.page-blocks-table-kind-expand/)
})

test('writeBackTableBlock keeps the row when the embed is still empty', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: `:::pageBlock {kind=algorithm plugin=page-algorithm id=ab12cd34}
{"title":"Two Sum"}
:::
`,
    contentType: 'markdown',
  })
  const row = listPageTableBlocks(editor.state.doc).find((item) => item.type === 'pageBlock')
  assert.ok(row)
  assert.equal(writeBackTableBlock(editor, row.pos, { type: 'paragraph' }), false)
  assert.equal(listPageTableBlocks(editor.state.doc).filter((item) => item.type === 'pageBlock').length, 1)
  editor.destroy()
})

test('writeBackTableBlock writes paragraph text of the same type', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '乙',
    contentType: 'markdown',
  })
  const row = listPageTableBlocks(editor.state.doc).find((item) => item.type === 'paragraph')
  assert.ok(row)
  const id = row.id
  assert.equal(writeBackTableBlock(editor, row.pos, { type: 'paragraph', content: [{ type: 'text', text: '回改' }] }), true)
  const after = listPageTableBlocks(editor.state.doc)[0]
  assert.equal(after?.label, '回改')
  if (id) assert.equal(after?.id, id)
  editor.destroy()
})

test('table view names page blocks by their kind, not 组件', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: `:::pageBlock {kind=algorithm plugin=page-algorithm id=ab12cd34}
{"title":"Two Sum"}
:::
`,
    contentType: 'markdown',
  })
  const row = listPageTableBlocks(editor.state.doc).find((item) => item.type === 'pageBlock')
  assert.ok(row)
  assert.equal(row.kind, 'algorithm')
  assert.notEqual(row.kind, '组件')
  assert.equal(row.label, 'Two Sum')
  editor.destroy()
})
