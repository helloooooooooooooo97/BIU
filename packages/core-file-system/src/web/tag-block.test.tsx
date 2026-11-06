import { test } from 'vitest'
import assert from 'node:assert/strict'
import { render } from '@testing-library/react'
import { parseBlockValues, parseTagId, parseTagIds, TagBlockView } from './tag-block.tsx'

test('parseTagId keeps a single tag and reads legacy tagIds', () => {
  assert.equal(parseTagId({}), '')
  assert.equal(parseTagId({ tagId: 'a', tagIds: ['b'] }), 'a')
  assert.equal(parseTagId({ tagIds: ['', 'b', 'c'] }), 'b')
  assert.deepEqual(parseTagIds({ tagIds: ['a', 'a'] }), ['a'])
  assert.deepEqual(parseBlockValues({}), {})
  assert.deepEqual(parseBlockValues({ values: { 优先级: '高' } }), { 优先级: '高' })
})

test('writable tag block starts as a single picker and paints the table view', () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ tags: [], value: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
  try {
    const empty = render(<TagBlockView data={{ tagId: '' }} update={() => undefined} writable />)
    assert.ok(empty.container.querySelector('[data-testid="page-tag-block"]'))
    assert.match(empty.container.textContent ?? '', /选择标签/)
    assert.match(empty.container.textContent ?? '', /表格/)
    assert.ok(empty.container.querySelector('.tasks-toolbar'))
    assert.equal(empty.container.querySelector('.tasks-table'), null)
    assert.equal(empty.container.querySelector('[data-testid="page-tag-block-view"]')?.textContent?.includes('表格'), true)
    empty.unmount()

    const filled = render(<TagBlockView data={{ tagId: 'demo' }} update={() => undefined} writable />)
    assert.equal(filled.container.querySelector('[data-tag-id="demo"]')?.getAttribute('data-tag-id'), 'demo')
    assert.match(filled.container.textContent ?? '', /属性名/)
    assert.match(filled.container.textContent ?? '', /属性值/)
    assert.equal(filled.container.querySelector('[data-testid="page-tag-block-view"]')?.textContent?.trim(), '表格')
    assert.match(filled.container.querySelector('[data-testid="page-tag-block-switch"]')?.textContent ?? '', /demo/)
    assert.ok(filled.container.querySelector('[data-testid="page-tag-block-switch"] .biu-tag'))
    assert.doesNotMatch(filled.container.textContent ?? '', /更换标签/)
    assert.doesNotMatch(filled.container.textContent ?? '', /添加属性/)
    filled.unmount()
  } finally {
    globalThis.fetch = original
  }
})
