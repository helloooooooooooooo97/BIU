import { test } from 'vitest'
import assert from 'node:assert/strict'
import { render } from '@testing-library/react'
import { ENABLE_PAGE_BLOCK_PLUGIN, formatPageBlockFence, parsePageBlockMeta, requestEnablePageBlockPlugin } from './page-block-meta.ts'
import { PageBlockMissing } from './page-block-view.tsx'

test('page block fence keeps plugin id in the document', () => {
  assert.deepEqual(parsePageBlockMeta('kind=excalidraw plugin=page-excalidraw'), {
    kind: 'excalidraw',
    plugin: 'page-excalidraw',
  })
  assert.match(
    formatPageBlockFence('excalidraw', 'page-excalidraw', { file: 'assets/a.json' }),
    /:::pageBlock \{kind=excalidraw plugin=page-excalidraw\}/,
  )
})

test('missing block shows stored source and asks to enable the stored plugin', () => {
  const { container } = render(
    <PageBlockMissing kind="excalidraw" plugin="page-excalidraw" data={{ file: 'assets/a.json' }} />,
  )
  const text = container.textContent ?? ''
  assert.match(text, /未启用「excalidraw」块/)
  assert.match(text, /page-excalidraw/)
  assert.match(text, /assets\/a\.json/)
  assert.ok(container.querySelector('[data-testid="page-block-enable"]'))
})

test('enable button only dispatches the stored plugin id', () => {
  const seen: string[] = []
  const onEnable = (event: Event) => {
    seen.push(String((event as CustomEvent<{ plugin?: string }>).detail?.plugin ?? ''))
  }
  window.addEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
  requestEnablePageBlockPlugin('page-excalidraw', 'excalidraw')
  window.removeEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
  assert.deepEqual(seen, ['page-excalidraw'])
})
