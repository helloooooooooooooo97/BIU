import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { pageEditorExtensions } from './kit.ts'
import { listPageTableBlocks } from './page-blocks-table.tsx'

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
  editor.destroy()
})
