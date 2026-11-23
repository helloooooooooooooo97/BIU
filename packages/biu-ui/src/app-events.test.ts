import { test } from 'vitest'
import assert from 'node:assert/strict'
import { emitAppEvent, onAppEvent, onAppEvents } from './app-events.ts'

test('emitAppEvent and onAppEvent deliver typed payloads and remain compatible with window CustomEvent', () => {
  const seen: Array<{ plugin: string; phase: string }> = []
  const off = onAppEvent('biu:page-block-plugin-phase', (detail) => {
    seen.push(detail)
  })
  const multiSeen: string[] = []
  const offMulti = onAppEvents(['biu:account-token', 'biu:chat-config-changed'], (type) => {
    multiSeen.push(type)
  })

  try {
    emitAppEvent('biu:page-block-plugin-phase', { plugin: 'page-toc', phase: 'ready' })
    assert.deepEqual(seen, [{ plugin: 'page-toc', phase: 'ready' }])

    emitAppEvent('biu:account-token', undefined)
    emitAppEvent('biu:chat-config-changed', undefined)
    assert.deepEqual(multiSeen, ['biu:account-token', 'biu:chat-config-changed'])
  } finally {
    off()
    offMulti()
  }

  // Unsubscribed listeners do not fire
  emitAppEvent('biu:page-block-plugin-phase', { plugin: 'page-toc', phase: 'idle' })
  assert.equal(seen.length, 1)
})
