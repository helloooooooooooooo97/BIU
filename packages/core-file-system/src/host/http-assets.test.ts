/** @vitest-environment node */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from 'cordis'
import type { RouteContext, RouteHandler } from '@biu/types/http'
import { registerDatabaseHttpRoutes } from './http-routes.ts'
import { DatabaseService } from './index.ts'
import { SavedViewsStore } from './saved-views.ts'
import { FileSystemAssets } from './assets-store.ts'

test('legacy and current attachment routes share authorization, references and ETag conflicts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'http-assets-'))
  const ctx = new Context()
  const handlers = new Map<string, RouteHandler>()
  const broadcasts: unknown[][] = []
  class Http extends Service {
    constructor() { super(ctx, 'http') }
    route(method: string, path: string, handler: RouteHandler) { handlers.set(`${method} ${path}`, handler) }
    broadcast(...args: unknown[]) { broadcasts.push(args) }
  }
  new Http()
  const db = new DatabaseService(ctx)
  db.register({
    id: 'pages', path: '/pages', schema: { fields: {} },
    list: () => [{ id: 'p1', title: 'Page' }],
    get: (id) => id === 'p1' ? { id, title: 'Page' } : null,
  })
  registerDatabaseHttpRoutes(ctx, db, {
    savedViews: new SavedViewsStore(), shares: db.shares, tags: db.tags,
    assets: new FileSystemAssets(root), activeDataLocation: () => 'device',
  })
  const request = async (method: string, prefix: string, body = '', etag = '', resource = '/pages/p1') => {
    const result = { status: 0, headers: {} as Record<string, string>, body: undefined as unknown }
    const route = {
      params: { name: 'drawing.json' }, query: new URLSearchParams(resource ? { path: resource } : {}),
      req: { headers: etag ? { 'if-match': `"${etag}"` } : {} },
      res: {
        writeHead(status: number, headers: Record<string, string>) { result.status = status; result.headers = headers },
        end(value: unknown) { result.body = value },
      },
      bytes: async () => Buffer.from(body),
      send(status: number, value: unknown) { result.status = status; result.body = value },
    } as unknown as RouteContext
    const handler = handlers.get(`${method} ${prefix}/:name`)
    assert.ok(handler)
    await handler(route)
    return result
  }
  try {
    assert.equal(handlers.get('GET /api/page/file/:name'), handlers.get('GET /api/db/file/:name'))
    const created = await request('PUT', '/api/page/file', '{"a":1}')
    assert.equal(created.status, 200)
    const first = created.body as { etag: string }
    const current = await request('GET', '/api/db/file')
    assert.equal(current.status, 200)
    assert.equal(String(current.body), '{"a":1}')
    assert.equal(current.headers.etag, `"${first.etag}"`)
    assert.equal((await request('PUT', '/api/db/file', '{"a":2}')).status, 409)
    assert.equal((await request('PUT', '/api/page/file', '{"a":2}', 'stale')).status, 409)
    assert.equal((await request('PUT', '/api/db/file', '{"a":2}', first.etag)).status, 200)
    assert.equal(String((await request('GET', '/api/page/file')).body), '{"a":2}')
    assert.equal((await request('GET', '/api/page/file', '', '', '/pages/missing')).status, 404)
    assert.equal((await request('PUT', '/api/db/file', '{}', '', '')).status, 400)
    assert.equal(broadcasts.filter((args) => (args[1] as { scope?: string })?.scope === 'asset').length, 2)
    const attachment = db.tags.ensure().prepare('SELECT storage FROM attachments WHERE name = ?').get('drawing.json')
    assert.equal(attachment?.storage, 'name')
    const ref = db.tags.ensure().prepare('SELECT * FROM content_refs WHERE collection = ? AND record_id = ? AND name = ?').get('/pages', 'p1', 'drawing.json')
    assert.ok(ref)
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
