import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  activeColumnSandboxItem,
  compileColumnSandbox,
  defaultColumnSandboxCode,
  normalizeColumnViews,
} from './column-sandbox-view.tsx'

test('defaultColumnSandboxCode compiles cleanly for every field kind', () => {
  for (const kind of ['string', 'number', 'boolean', 'select', 'multi-select', 'url', 'datetime'] as const) {
    const code = defaultColumnSandboxCode({ key: 'k', label: '测试列', kind })
    const res = compileColumnSandbox(code)
    assert.equal(res.ok, true, `failed to compile default template for ${kind}: ${res.ok ? '' : res.error}`)
  }
})

test('compileColumnSandbox blocks external imports and surfaces syntax errors', () => {
  const blocked = compileColumnSandbox(`import fs from 'node:fs'\nexport default function Cell() { return <span /> }`)
  assert.equal(blocked.ok, false)
  const bad = compileColumnSandbox(`export default function Cell() { return <span> }`)
  assert.equal(bad.ok, false)
})

test('normalizeColumnViews validates items, activeId, and JSON string input', () => {
  const raw = JSON.stringify({
    priority: {
      activeId: 'sv-1',
      items: [{ id: 'sv-1', name: '彩色徽章', code: 'export default function Cell({ value }) { return <span>{value}</span> }' }],
    },
    broken: { activeId: 'missing', items: [{ id: 'sv-2', name: 'A', code: '' }] },
    empty: { activeId: 'default', items: [] },
  })
  const norm = normalizeColumnViews(raw)
  assert.ok(norm)
  assert.equal(norm.priority?.activeId, 'sv-1')
  assert.equal(activeColumnSandboxItem(norm.priority)?.name, '彩色徽章')
  assert.equal(norm.broken?.activeId, 'default')
  assert.equal(activeColumnSandboxItem(norm.broken), null)
  assert.equal(norm.empty, undefined)
})
