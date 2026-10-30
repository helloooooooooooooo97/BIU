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
  assert.match(content, /db_content \/plugins\/page-html-blocks 读「示例写法」/)
  assert.equal(content.includes('围栏体只写'), false)
  assert.match(doc, /^文档 /)
  assert.match(doc, /源码约定见 \/plugins\/page-html-blocks 介绍/)
})
