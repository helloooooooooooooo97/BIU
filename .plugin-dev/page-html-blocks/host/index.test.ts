import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context, Service } from 'cordis'
import * as tools from '@biu/host-tools'
import { apply } from './index.ts'

test('page-html-blocks hangs HTML fence hints on db_content and db_doc', async () => {
  const ctx = new Context()
  class HttpStub extends Service {
    constructor(c: Context) {
      super(c, 'http')
    }
    route() {}
  }
  await ctx.plugin(tools)
  new HttpStub(ctx)
  ctx.tools.register({
    name: 'db_content',
    description: '正文',
    parameters: { type: 'object', properties: {} },
    execute: () => 'ok',
  })
  ctx.tools.register({
    name: 'db_doc',
    description: '文档',
    parameters: { type: 'object', properties: {} },
    execute: () => 'ok',
  })
  await ctx.plugin({ inject: ['http', 'tools'], apply })
  const content = ctx.tools.schemas().find((item) => item.function.name === 'db_content')?.function.description ?? ''
  const doc = ctx.tools.schemas().find((item) => item.function.name === 'db_doc')?.function.description ?? ''
  assert.match(content, /^正文 /)
  assert.match(content, /围栏体只写 \{"file":"assets\/<名>\.html"\}/)
  assert.match(content, /写进围栏的 HTML 会丢/)
  assert.match(doc, /^文档 /)
  assert.match(doc, /块本体在这里，不在 db_content 围栏/)
})
