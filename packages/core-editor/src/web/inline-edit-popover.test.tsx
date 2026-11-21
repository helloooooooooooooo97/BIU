/** @vitest-environment jsdom */
import { afterEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InlineEditPopover, bindInlineEditSessionView, isInlineEditHotkey } from './inline-edit-popover.tsx'

afterEach(() => {
  cleanup()
  bindInlineEditSessionView(null)
  vi.unstubAllGlobals()
})

test('isInlineEditHotkey matches Cmd/Ctrl+K only', () => {
  assert.equal(isInlineEditHotkey({ key: 'k', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }), true)
  assert.equal(isInlineEditHotkey({ key: 'K', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false }), true)
  assert.equal(isInlineEditHotkey({ key: 'k', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true }), false)
  assert.equal(isInlineEditHotkey({ key: 'l', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }), false)
})

test('InlineEditPopover uses global agent avatar, forwards sessionId, submits on Enter, and closes on Escape', async () => {
  const applied: string[] = []
  let closed = 0
  let sentBody: Record<string, unknown> | null = null

  bindInlineEditSessionView({
    get: (key) =>
      key === 'sessionView'
        ? {
            get: () => ({
              sessionId: 'sess-global-42',
              sessions: [{ id: 'sess-global-42', title: '金叶真', mascot: { shape: 'leaf', color: 'yellow', eye: 15 } }],
            }),
            subscribe: () => () => undefined,
          }
        : undefined,
  })

  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      return new Response(JSON.stringify({ ok: true, text: '精简后的结果' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
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

  assert.ok(screen.getByTitle('金叶真'))
  const input = screen.getByLabelText('原地修改指令')
  fireEvent.change(input, { target: { value: '精简一下' } })
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter' })
  })
  assert.deepEqual(applied, ['精简后的结果'])
  assert.equal(sentBody?.sessionId, 'sess-global-42')

  fireEvent.keyDown(input, { key: 'Escape' })
  assert.equal(closed, 1)
})
