/** @vitest-environment jsdom */
import { afterEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InlineEditPopover, isInlineEditHotkey } from './inline-edit-popover.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('isInlineEditHotkey matches Cmd/Ctrl+K only', () => {
  assert.equal(isInlineEditHotkey({ key: 'k', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }), true)
  assert.equal(isInlineEditHotkey({ key: 'K', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false }), true)
  assert.equal(isInlineEditHotkey({ key: 'k', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true }), false)
  assert.equal(isInlineEditHotkey({ key: 'l', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }), false)
})

test('InlineEditPopover submits on Enter, applies returned text, and closes on Escape', async () => {
  const applied: string[] = []
  let closed = 0

  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, text: '精简后的结果' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  )

  const target = {
    from: 10,
    to: 20,
    selection: '需要修改的原文',
    before: '前文',
    after: '后文',
    top: 100,
    left: 100,
  }

  render(
    <InlineEditPopover
      target={target}
      title="测试页"
      onApply={(text) => applied.push(text)}
      onClose={() => {
        closed += 1
      }}
    />,
  )

  const input = screen.getByLabelText('原地修改指令')
  fireEvent.change(input, { target: { value: '精简一下' } })
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter' })
  })
  assert.deepEqual(applied, ['精简后的结果'])

  fireEvent.keyDown(input, { key: 'Escape' })
  assert.equal(closed, 1)
})
