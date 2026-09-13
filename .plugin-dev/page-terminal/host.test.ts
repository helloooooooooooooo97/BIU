import { test } from 'vitest'
import assert from 'node:assert/strict'
import { apply } from './host.ts'

test('page-terminal host registers a plugin WebSocket, not host-terminal', () => {
  const paths: string[] = []
  apply({
    sandbox: {
      wrap: () => ({ cwd: process.cwd(), env: process.env }),
    },
    http: {
      ws(path) {
        paths.push(path)
      },
    },
  })
  assert.deepEqual(paths, ['/ws/page-terminal'])
})
