import { expect, test } from 'vitest'
import {
  getInspectorDbPath,
  registerShellDataBridge,
  restoreInspectorDbPaths,
  snapshotInspectorDbPaths,
  subscribeInspectorDbPath,
} from './data-bridge.ts'

test('buffers restoreInspectorDbPaths and subscribeInspectorDbPath until core-file-system registers bridge', () => {
  const initial = {
    'database:/pages::1': '/database/pages/record/p1',
    'database:/pages::2': '/database/pages/record/p2',
  }
  restoreInspectorDbPaths(initial)
  expect(getInspectorDbPath('database:/pages::1')).toBe('/database/pages/record/p1')
  expect(snapshotInspectorDbPaths()).toEqual(initial)

  let notifications = 0
  const stop = subscribeInspectorDbPath(() => {
    notifications += 1
  })

  let restored: Record<string, string> | undefined
  const listeners = new Set<() => void>()
  registerShellDataBridge({
    restoreInspectorDbPaths: (paths) => {
      restored = paths ? { ...paths } : {}
    },
    getInspectorDbPath: (paneId) => restored?.[paneId],
    snapshotInspectorDbPaths: () => (restored ? { ...restored } : {}),
    subscribeInspectorDbPath: (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
  })

  // Pending dbPaths are replayed immediately on registration without spurious notification
  expect(restored).toEqual(initial)
  expect(notifications).toBe(0)

  // Previously registered listener is now live and receives subsequent updates
  for (const fn of listeners) fn()
  expect(notifications).toBe(1)

  stop()
  for (const fn of listeners) fn()
  expect(notifications).toBe(1)
})

test('registerShellDataBridge wires ShareButton component for shell header', () => {
  const received: unknown[] = []
  const FakeShareButton = (props: unknown) => {
    received.push(props)
    return null
  }
  registerShellDataBridge({ ShareButton: FakeShareButton })
  expect(typeof FakeShareButton).toBe('function')
  expect(received.length).toBe(0)
})
