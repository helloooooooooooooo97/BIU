/** @vitest-environment jsdom */
import { afterEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { cleanup, render, screen } from '@testing-library/react'
import { RecordPropHostView } from './record-prop-host.tsx'
import { applyRecordViewAssetChanged, rememberRecordViewFile, resetRecordViewFileState } from './record-sandboxes.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetRecordViewFileState()
})

test('biu.useData loads, reloads on remote asset-changed, and retries 409 via updateData', async () => {
  let serverVersion = 1
  let serverBody = JSON.stringify({ count: 10 })
  let conflictOnce = true

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      const method = String(init?.method ?? 'GET').toUpperCase()
      if (url.includes('hook-data.json')) {
        if (method === 'GET') {
          return new Response(serverBody, {
            status: 200,
            headers: { 'content-type': 'application/json', etag: `"v${serverVersion}"` },
          })
        }
        if (method === 'PUT') {
          if (conflictOnce) {
            conflictOnce = false
            serverVersion = 2
            serverBody = JSON.stringify({ count: 20 })
            return new Response('conflict', {
              status: 409,
              headers: { etag: `"v${serverVersion}"` },
            })
          }
          serverVersion += 1
          serverBody = String(init?.body ?? 'null')
          return new Response('', { status: 200, headers: { etag: `"v${serverVersion}"` } })
        }
      }
      return new Response('{}', { status: 200 })
    }),
  )

  rememberRecordViewFile(
    '/pages',
    'p1',
    'hook-view.jsx',
    `export default function App() {
      const [data, setData] = biu.useData({ count: 0 })
      return (
        <div>
          <span data-testid="data-count">{data.count}</span>
          <button type="button" data-testid="bump-data" onClick={() => setData((cur) => ({ count: (cur?.count ?? 0) + 1 }))}>+1</button>
          <button type="button" data-testid="show-toast" onClick={() => biu.toast('已保存', 'ok')}>toast</button>
        </div>
      )
    }`,
  )

  render(
    <RecordPropHostView
      record={{ id: 'p1', title: '测试' }}
      view={{ id: 'v1', name: 'Hook测试', kind: 'sandbox', file: 'hook-view.jsx', dataFile: 'hook-data.json' }}
      schema={{ fields: { title: { type: 'string', label: '标题', writable: true } } }}
      collectionPath="/pages"
    />,
  )

  await vi.waitFor(() => assert.equal(screen.getByTestId('data-count').textContent, '10'))

  // Clicking +1 triggers a 409 conflict; updateData re-reads server (20) and saves 21!
  screen.getByTestId('bump-data').click()
  await vi.waitFor(() => assert.equal(screen.getByTestId('data-count').textContent, '21'))
  assert.equal(JSON.parse(serverBody).count, 21)

  // Remote Agent updates dataFile -> asset-changed event reloads biu.useData automatically
  serverVersion = 9
  serverBody = JSON.stringify({ count: 99 })
  applyRecordViewAssetChanged({ name: 'hook-data.json', etag: 'v9' })
  await vi.waitFor(() => assert.equal(screen.getByTestId('data-count').textContent, '99'))

  // biu.toast renders feedback banner
  screen.getByTestId('show-toast').click()
  await vi.waitFor(() => assert.equal(screen.getByTestId('record-prop-host-toast').textContent, '已保存'))
})
