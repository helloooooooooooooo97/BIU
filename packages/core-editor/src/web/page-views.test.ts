import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyPageAssetChanged, deletePageSandboxView, peekPageFile, readPageFile, rememberPageFile, resetPageFileState, setPageViews, uniqueViewName, writePageFile } from './page-views.ts'
import { applyPageLayout, getActivePageLayout, setActivePageLayoutId, setPageLayouts } from './page-layouts.ts'
import { getPagePresentMode, setPagePresentMode } from './source-mode.ts'

afterEach(() => {
  resetPageFileState()
  Reflect.deleteProperty(globalThis, 'fetch')
})

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; text?: string; etag?: string }) {
  const calls: Array<{ url: string; method: string }> = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: String(init?.method ?? 'GET') })
    const result = handler(url, init)
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: new Headers(result.etag ? { etag: `"${result.etag}"` } : {}),
      text: async () => result.text ?? '',
      json: async () => ({ etag: result.etag }),
      clone() {
        return this
      },
    } as Response
  }) as typeof fetch
  return calls
}

test('deleting a content view falls back to 文档 even if the layout still points at it', async () => {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({}),
  })) as typeof fetch
  setPageViews('p-del', [{ id: 'need', name: '新视图', kind: 'sandbox', file: 'a.jsx', dataFile: 'b.json' }])
  setPageLayouts('p-del', [{ id: 'lay', name: '组合', contentViewId: 'need', propViewId: 'table', sort: 'doc', filterKinds: [] }])
  setActivePageLayoutId('p-del', 'lay')
  setPagePresentMode('p-del', 'need')
  applyPageLayout('p-del', getActivePageLayout('p-del'))
  assert.equal(getPagePresentMode('p-del'), 'need')
  await deletePageSandboxView('p-del', 'need')
  applyPageLayout('p-del', getActivePageLayout('p-del'))
  assert.equal(getPagePresentMode('p-del'), 'doc')
})

test('unique view names match table copy numbering', () => {
  assert.equal(uniqueViewName('官网 副本', []), '官网 副本')
  assert.equal(uniqueViewName('官网 副本', ['官网 副本']), '官网 副本 2')
  assert.equal(uniqueViewName('官网 副本', ['官网 副本', '官网 副本 2']), '官网 副本 3')
  const copy = readFileSync(resolve(import.meta.dirname, './page-views.ts'), 'utf8')
  const fn = copy.slice(copy.indexOf('export async function copyPageSandboxView'), copy.indexOf('export async function deletePageSandboxView'))
  assert.match(fn, /seedRecordSandbox/)
  assert.match(fn, /fieldKey: 'views'/)
  assert.doesNotMatch(fn, /Date\.now\(\)/)
  const props = readFileSync(resolve(import.meta.dirname, './page-prop-views.ts'), 'utf8')
  const propCopy = props.slice(props.indexOf('export async function copyPagePropSandboxView'), props.indexOf('export async function deletePagePropSandboxView'))
  assert.match(propCopy, /seedRecordSandbox/)
  assert.match(propCopy, /fieldKey: 'propViews'/)
  assert.doesNotMatch(propCopy, /Date\.now\(\)/)
})

test('readPageFile uses memory and does not GET again after a 404', async () => {
  rememberPageFile('view-p1-a.jsx', 'export default function App(){return 1}')
  const calls = mockFetch(() => ({ status: 404 }))
  assert.equal(await readPageFile('view-p1-a.jsx'), 'export default function App(){return 1}')
  assert.equal(calls.length, 0)
  const missing = await readPageFile('view-p1-missing.jsx', 'fallback')
  assert.equal(missing, 'fallback')
  assert.equal(calls.length, 1)
  assert.equal(await readPageFile('view-p1-missing.jsx', 'fallback'), 'fallback')
  assert.equal(calls.length, 1)
})

test('writePageFile puts without a prior GET', async () => {
  const calls = mockFetch(() => ({ status: 200, etag: 'etag-1' }))
  await writePageFile('view-p1-a.jsx', 'export default function App(){return 2}')
  assert.equal(calls.map((item) => item.method).join(','), 'PUT')
  assert.equal(peekPageFile('view-p1-a.jsx'), 'export default function App(){return 2}')
  assert.equal(await readPageFile('view-p1-a.jsx'), 'export default function App(){return 2}')
  assert.equal(calls.length, 1)
})

test('asset-changed drops page file cache so the next read hits the server', async () => {
  rememberPageFile('view-p1-a.jsx', 'export default function App(){return 1}', 'old')
  assert.equal(applyPageAssetChanged({ name: 'view-p1-a.jsx', etag: 'old' }), false)
  assert.equal(peekPageFile('view-p1-a.jsx'), 'export default function App(){return 1}')
  assert.equal(applyPageAssetChanged({ name: 'view-p1-a.jsx', etag: 'new' }), true)
  assert.equal(peekPageFile('view-p1-a.jsx'), undefined)
  const calls = mockFetch(() => ({ status: 200, text: 'export default function App(){return 2}', etag: 'new' }))
  assert.equal(await readPageFile('view-p1-a.jsx'), 'export default function App(){return 2}')
  assert.equal(calls.length, 1)
})
