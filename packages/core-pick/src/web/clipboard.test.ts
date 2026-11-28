import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import {
  PICK_CLIPBOARD_MIME,
  clearPickClipboard,
  consumePlainPasteIntent,
  isPlainPasteHotkey,
  markPlainPasteIntent,
  readPickClipboard,
  rememberPickClipboard,
} from './clipboard.ts'
import type { PickRef } from './types.ts'

afterEach(() => {
  clearPickClipboard()
})

const singleCellRef: PickRef = {
  kind: 'page',
  id: 'p1::status',
  label: '状态',
  title: '架构文档',
  path: '/pages/p1',
  route: '/database/pages',
  field: 'status',
  type: 'select',
  text: '进行中',
}

test('readPickClipboard matches remembered picks when plain text matches', () => {
  rememberPickClipboard('进行中', [singleCellRef], 1000)
  const hit = readPickClipboard(null, '进行中\r\n', 1100)
  assert.deepEqual(hit, [singleCellRef])
  // 剪贴板被外部复制覆盖后不再命中
  assert.equal(readPickClipboard(null, '别的文本', 1100), null)
})

test('readPickClipboard prefers custom MIME payload when present', () => {
  const mimeRef: PickRef = {
    kind: 'page',
    id: 'range:abc',
    label: '页面 · 2 行 × 2 列',
    title: '页面 · 2 行 × 2 列',
    path: '/pages',
    route: '/database/pages',
    text: 'A\t1\nB\t2',
    cells: [
      { id: 'p1', path: '/pages/p1', title: 'A', field: 'title', label: '标题', type: 'string', text: 'A' },
      { id: 'p1', path: '/pages/p1', title: 'A', field: 'score', label: '评分', type: 'number', text: '1' },
    ],
  }
  const dt = {
    getData: (type: string) => (type === PICK_CLIPBOARD_MIME ? JSON.stringify([mimeRef]) : 'unrelated'),
  }
  const hit = readPickClipboard(dt)
  assert.deepEqual(hit, [mimeRef])
})

test('empty plain clipboard match expires after TTL', () => {
  rememberPickClipboard('', [singleCellRef], 1000)
  assert.deepEqual(readPickClipboard(null, '', 5000), [singleCellRef])
  assert.equal(readPickClipboard(null, '', 40_000), null)
})

test('plain paste hotkey and intent work for Cmd+Shift+V / Ctrl+Shift+V', () => {
  assert.equal(
    isPlainPasteHotkey({ key: 'v', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }),
    true,
  )
  assert.equal(
    isPlainPasteHotkey({ key: 'V', metaKey: false, ctrlKey: true, shiftKey: true, altKey: false }),
    true,
  )
  assert.equal(
    isPlainPasteHotkey({ key: 'v', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }),
    false,
  )

  markPlainPasteIntent(1000)
  assert.equal(consumePlainPasteIntent(1200), true)
  assert.equal(consumePlainPasteIntent(1250), false)

  markPlainPasteIntent(1000)
  assert.equal(consumePlainPasteIntent(2000), false)
})
