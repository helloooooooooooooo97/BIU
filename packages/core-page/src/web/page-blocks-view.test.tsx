import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { BlockEditorService } from '@biu/core-editor/web'
import {
  PageBlocksView,
  PageBlockContent,
  openSourcePage,
  openBlockInInspector,
  pageLabelOf,
  pageNameFromRecord,
} from './page-blocks-view.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('page-blocks view paints the registered block View', async () => {
  const ctx = new Context()
  new BlockEditorService(ctx)
  ctx.blockEditor.registerBlock({
    kind: 'sandbox',
    plugin: 'page-sandbox',
    label: '静态HTML',
    View: ({ data }) => <div data-testid="html-ui">{String(data.html ?? '')}</div>,
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo) => {
      const url = String(input)
      if (url.includes('pages%2Fp1') || url.includes('/pages/p1')) return { ok: true, json: async () => ({ value: { id: 'p1', title: '首页' } }) }
      return { ok: true, json: async () => ({}) }
    }),
  )
  const opened: string[] = []
  const { container } = render(
    <PageBlocksView
      path="/editor-blocks"
      rows={[
        { id: 'p1::a1', title: '刊头', pageId: 'p1', blockKind: 'sandbox', plugin: 'page-sandbox', data: '{"html":"<b>hi</b>"}' },
        { id: 'p1::a2', title: '缺插件', blockKind: 'gone', plugin: 'missing-plugin', data: '{}' },
      ]}
      onOpen={(row) => opened.push(String(row.id))}
    />,
  )
  assert.equal(container.querySelector('[data-testid="html-ui"]')?.textContent, '<b>hi</b>')
  assert.equal(container.querySelector('[data-testid="html-ui"]')?.getAttribute('data-biu-plugin'), 'page-sandbox')
  assert.ok(container.querySelector('[data-testid="page-block-missing"]'))
  await waitFor(() => assert.equal(container.querySelector('[data-testid="page-blocks-view-page"]')?.textContent, '首页'))
  fireEvent.click(container.querySelector('[data-testid="page-blocks-view-zoom"]')!)
  assert.deepEqual(opened, ['p1::a1'])
  const seen: unknown[] = []
  const onReveal = (event: Event) => seen.push((event as CustomEvent).detail)
  window.addEventListener('biu:inspector-reveal', onReveal)
  fireEvent.click(container.querySelector('[data-testid="page-blocks-view-inspector"]')!)
  window.removeEventListener('biu:inspector-reveal', onReveal)
  assert.deepEqual(seen, [{ collection: '/editor-blocks', recordId: 'p1::a1', unique: true }])
  const title = container.querySelector('[data-testid="page-blocks-view-title"]') as HTMLInputElement
  fireEvent.change(title, { target: { value: '新刊头' } })
  fireEvent.blur(title)
  await waitFor(() => {
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    assert.ok(
      calls.some((item) => String(item[0]).includes('/api/db/update') && String(item[1]?.body ?? '').includes('新刊头')),
    )
  })
})

test('gallery page label is the page title, never the id', () => {
  assert.equal(pageLabelOf({ id: 'p1::a', pageId: 'p1', pageTitle: '首页' }), '首页')
  assert.equal(pageLabelOf({ id: 'p1::a', pageId: 'p1', pageTitle: 'p1' }), '')
  assert.equal(pageLabelOf({ id: 'p1::a', pageId: 'p1' }, '手册'), '手册')
  assert.equal(pageNameFromRecord({ id: 'p1', title: '首页' }, 'p1'), '首页')
  assert.equal(pageNameFromRecord({ id: 'p1', title: 'p1' }, 'p1'), '')
})

test('opening a block in the inspector reveals /editor-blocks', () => {
  const seen: unknown[] = []
  const onReveal = (event: Event) => seen.push((event as CustomEvent).detail)
  window.addEventListener('biu:inspector-reveal', onReveal)
  openBlockInInspector('p1::a1')
  window.removeEventListener('biu:inspector-reveal', onReveal)
  assert.deepEqual(seen, [{ collection: '/editor-blocks', recordId: 'p1::a1', unique: true }])
})

test('opening the source page reveals /pages in the inspector', () => {
  const seen: unknown[] = []
  const onReveal = (event: Event) => seen.push((event as CustomEvent).detail)
  window.addEventListener('biu:inspector-reveal', onReveal)
  openSourcePage('p1')
  window.removeEventListener('biu:inspector-reveal', onReveal)
  assert.deepEqual(seen, [{ collection: '/pages', recordId: 'p1', unique: true }])
})

test('page-block detail content paints the registered View', () => {
  const ctx = new Context()
  new BlockEditorService(ctx)
  ctx.blockEditor.registerBlock({
    kind: 'sandbox',
    plugin: 'page-sandbox',
    label: '静态HTML',
    View: ({ data }) => <div data-testid="html-detail">{String(data.html ?? '')}</div>,
  })
  const { container } = render(
    <PageBlockContent
      record={{ id: 'p1::a1', title: '刊头', blockKind: 'sandbox', plugin: 'page-sandbox' }}
      field="data"
      spec={{ type: 'string', writable: true }}
      value={{ html: '<i>detail</i>' }}
      writable
    />,
  )
  assert.ok(container.querySelector('[data-testid="page-blocks-detail"]'))
  assert.equal(container.querySelector('[data-testid="html-detail"]')?.textContent, '<i>detail</i>')
})
