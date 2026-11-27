import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { CollectionInfo } from '@biu/type-file-system'
import { DatabaseInspectorTab, bindInspectorSnapshot } from './inspector-database.tsx'

afterEach(() => {
  cleanup()
})

test('DatabaseInspectorTab stays stable when snapshot resets collections to undefined on workspace switch', () => {
  const listeners = new Set<() => void>()
  let state: { collections?: CollectionInfo[] } = {
    collections: [{ id: 'pages', path: '/pages', label: '页面' } as CollectionInfo],
  }
  bindInspectorSnapshot({
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    get: () => state,
  })

  const { container } = render(
    <DatabaseInspectorTab active paneId="database:/pages" seedCollection="/pages" />,
  )
  assert.ok(container.firstElementChild)

  // Simulate workspace switch resetting snapshot.collections to undefined
  act(() => {
    state = {}
    for (const fn of listeners) fn()
  })
  assert.ok(container.firstElementChild)
})
