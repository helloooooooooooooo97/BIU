import { test } from 'vitest'
import assert from 'node:assert/strict'
import { apply } from './host.ts'

test('page-terminal host runs the workspace shell and returns stdout', async () => {
  const calls: string[] = []
  let handler: ((route: { json: () => Promise<unknown>; send: (status: number, body: unknown) => void }) => unknown) | undefined
  apply({
    http: {
      route(_method, path, next) {
        assert.equal(path, '/api/page-terminal/run')
        handler = next
      },
    },
    shell: {
      async run(command) {
        calls.push(command)
        return { code: 0, stdout: 'v22\n', stderr: '' }
      },
    },
  })
  assert.ok(handler)
  let sent: { status: number; body: unknown } | undefined
  await handler!({
    json: async () => ({ command: 'node -v' }),
    send: (status, body) => {
      sent = { status, body }
    },
  })
  assert.deepEqual(calls, ['node -v'])
  assert.equal(sent?.status, 200)
  assert.deepEqual(sent?.body, { code: 0, stdout: 'v22\n', stderr: '' })
})
