import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { runWithSession } from '@biu/host-sessions/scope'
import { ContentTurnService } from './content-turn-service.ts'

test('parallel recordEdit of five 你好 pages publishes every file', async () => {
  const published: Array<Array<{ path: string }>> = []
  const sessions = {
    peek: () => ({ events: [{ type: 'turn/start', turn: 1 }] }),
    append: async (_id: string, body: { files?: Array<{ path: string }> }) => {
      await new Promise((resolve) => setTimeout(resolve, 8))
      if (body.files) published.push(body.files)
    },
  }
  const ctx = new Context()
  const service = new ContentTurnService(ctx).open(':memory:')
  const get = service.ctx.get.bind(service.ctx)
  service.ctx.get = ((name: string) => (name === 'sessions' ? sessions : get(name))) as typeof service.ctx.get
  await runWithSession('sess-hello', async () => {
    await Promise.all([1, 2, 3, 4, 5].map((n) => service.recordEdit(`/pages/p${n}`, '', '你好', '你好')))
  })
  const last = published.at(-1)?.map((file) => file.path) ?? []
  assert.deepEqual(last.sort(), ['/pages/p1', '/pages/p2', '/pages/p3', '/pages/p4', '/pages/p5'])
  assert.equal(service.summaries('sess-hello', 1).length, 5)
})
