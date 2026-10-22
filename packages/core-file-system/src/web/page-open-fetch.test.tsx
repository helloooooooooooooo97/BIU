import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { cleanup, render, waitFor } from '@testing-library/react'
import { REQUIRED_RECORD_FIELDS, type CollectionSchema } from '@biu/type-file-system'
import { invalidateListReads } from './db-client.ts'
import { CollectionBrowser } from './browser.tsx'
import { inspectInspectorPage } from '../../../../scripts/page-perf/inspector-open-ready.mjs'

afterEach(() => {
  cleanup()
  invalidateListReads()
})

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = () =>
    ({
      matches: false,
      media: '',
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false
      },
    }) as MediaQueryList
}

const schema: CollectionSchema = {
  labelField: 'title',
  fields: {
    ...REQUIRED_RECORD_FIELDS,
    title: { type: 'string' },
    content: { type: 'file' },
  },
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

test('opening a record requests content before /api/db/read returns', async () => {
  const hits: string[] = []
  let releaseRead!: () => void
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve
  })
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/db/content?')) {
      hits.push('content')
      return json({ value: '正文', version: 1 })
    }
    if (url.includes('/api/db/read?')) {
      hits.push('read-start')
      await readGate
      hits.push('read-done')
      return json({ value: { id: 'p1', title: '一页', content: '正文' } })
    }
    if (url.includes('/api/db/list?')) {
      hits.push('list')
      return json({
        schema,
        items: [{ id: 'p1', title: '一页' }],
        total: 1,
      })
    }
    if (url.includes('/api/db/stat?')) {
      hits.push('stat')
      return json({
        schema,
        items: [{ id: 'p1', title: '一页' }],
        total: 1,
      })
    }
    return json({})
  }) as typeof fetch
  try {
    render(
      <CollectionBrowser
        collectionPath="/pages"
        title="页面"
        blurb=""
        routeRecordId="p1"
        tables={[{ path: '/pages', kind: 'collection', label: '页面', view: { title: '页面' } }]}
      />,
    )
    await waitFor(() => {
      assert.ok(hits.includes('content'), `hits=${hits.join(',')}`)
    })
    assert.equal(hits.includes('read-done'), false)
    assert.ok(hits.includes('read-start'))
    assert.equal(hits.includes('list'), false)
  } finally {
    releaseRead()
    globalThis.fetch = original
  }
})

test('embedded inspector page paints editor without /api/db/list', async () => {
  const hits: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/db/content?')) {
      hits.push('content')
      return json({ value: '', version: 1 })
    }
    if (url.includes('/api/db/read?')) {
      hits.push('read')
      return json({ value: { id: 'p1', title: '轻量页' } })
    }
    if (url.includes('/api/db/list?')) {
      hits.push('list')
      return json({ schema, items: [], total: 0 })
    }
    if (url.includes('/api/db/stat?')) {
      hits.push('stat')
      return json({ schema, items: [], total: 0 })
    }
    return json({})
  }) as typeof fetch
  const t0 = performance.now()
  try {
    render(
      <CollectionBrowser
        embed
        collectionPath="/pages"
        title="页面"
        blurb=""
        routeRecordId="p1"
        tables={[{ path: '/pages', kind: 'collection', label: '页面', view: { title: '页面' } }]}
        chrome={{
          Content: ({ value, status }) =>
            status === 'ready' ? (
              <div className="page-editor" data-testid="stub-page-editor">
                {String(value ?? '')}
              </div>
            ) : (
              <div data-testid="page-content-loading" />
            ),
        }}
      />,
    )
    await waitFor(() => {
      assert.equal(inspectInspectorPage(document).painted, true)
    })
    const paintedAt = Math.round(performance.now() - t0)
    console.log(JSON.stringify({ paintedAt, hits }))
    assert.equal(hits.includes('list'), false)
    assert.ok(hits.includes('content'))
    assert.ok(hits.includes('read'))
    assert.ok(paintedAt < 2000, `inspector page took ${paintedAt}ms to paint`)
  } finally {
    globalThis.fetch = original
  }
})
