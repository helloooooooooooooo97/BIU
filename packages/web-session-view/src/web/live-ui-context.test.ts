import { test } from 'vitest'
import assert from 'node:assert/strict'
import { captureLiveUiContext } from './live-ui-context.ts'

test('captureLiveUiContext snapshots the main session', () => {
  const live = captureLiveUiContext({
    get: () => ({
      sessionId: 's1',
      sessions: [{ id: 's1', title: '配图讨论' }],
      sessionInspector: { tab: 'database:/pages' },
    }),
  })
  assert.equal(live?.sessionId, 's1')
  assert.equal(live?.sessionTitle, '配图讨论')
  assert.equal(live?.inspectorTab, 'database:/pages')
})
