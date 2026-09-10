import { render } from '@testing-library/react'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { PageEditorService } from './service.ts'
import { parsePageBlockRowData, PageBlocksView, PageBlockContent } from './page-blocks-view.tsx'

test('parsePageBlockRowData reads json string or object', () => {
  assert.deepEqual(parsePageBlockRowData('{"html":"<p>a</p>"}'), { html: '<p>a</p>' })
  assert.deepEqual(parsePageBlockRowData({ html: '<p>b</p>' }), { html: '<p>b</p>' })
  assert.deepEqual(parsePageBlockRowData(''), {})
})

test('page-blocks view paints the registered block View', () => {
  const ctx = new Context()
  new PageEditorService(ctx)
  ctx.pageEditor.registerBlock({
    kind: 'html',
    plugin: 'page-html-blocks',
    label: '静态HTML',
    View: ({ data }) => <div data-testid="html-ui">{String(data.html ?? '')}</div>,
  })
  const { container } = render(
    <PageBlocksView
      path="/page-blocks"
      rows={[
        { id: 'p1::a1', title: '刊头', blockKind: 'html', plugin: 'page-html-blocks', data: '{"html":"<b>hi</b>"}' },
        { id: 'p1::a2', title: '缺插件', blockKind: 'gone', plugin: 'missing-plugin', data: '{}' },
      ]}
      onOpen={() => undefined}
    />,
  )
  assert.equal(container.querySelector('[data-testid="html-ui"]')?.textContent, '<b>hi</b>')
  assert.ok(container.querySelector('[data-testid="page-block-missing"]'))
})

test('page-block detail content paints the registered View', () => {
  const ctx = new Context()
  new PageEditorService(ctx)
  ctx.pageEditor.registerBlock({
    kind: 'html',
    plugin: 'page-html-blocks',
    label: '静态HTML',
    View: ({ data }) => <div data-testid="html-detail">{String(data.html ?? '')}</div>,
  })
  const { container } = render(
    <PageBlockContent
      record={{ id: 'p1::a1', title: '刊头', blockKind: 'html', plugin: 'page-html-blocks' }}
      field="data"
      spec={{ type: 'string', writable: true }}
      value={{ html: '<i>detail</i>' }}
      writable
    />,
  )
  assert.ok(container.querySelector('[data-testid="page-blocks-detail"]'))
  assert.equal(container.querySelector('[data-testid="html-detail"]')?.textContent, '<i>detail</i>')
})
