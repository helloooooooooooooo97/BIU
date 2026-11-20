/** @vitest-environment jsdom */
import { afterEach, beforeEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import React, { useMemo, useState } from 'react'
import { RenderBoundary } from '@biu/biu-ui'
import { RecordPropHostView, RecordProperties, recordPropSourceText } from './record-prop-host.tsx'
import { rememberRecordViewFile } from './record-sandboxes.ts'
import { patchRecordViewCatalog } from './record-view-catalog.ts'
import { compileHostSource, loadSandboxComponent, SandboxPreview } from './sandbox-compile.ts'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const boomSource = `export default function App() {
  throw new Error('sandbox boom')
}`

test('property sandbox throw stays in the host and does not unmount the sibling shell', () => {
  rememberRecordViewFile('/pages', 'home', 'boom-prop.jsx', boomSource)
  render(
    <div>
      <span data-testid="shell-still-here">壳还在</span>
      <RecordPropHostView
        record={{ id: 'home', title: '演示页' }}
        view={{ id: 'card1', name: '卡片', kind: 'sandbox', file: 'boom-prop.jsx', dataFile: 'boom-prop-data.json' }}
        schema={{ fields: { title: { type: 'string', label: '标题', writable: true } } }}
        collectionPath="/pages"
      />
    </div>,
  )
  assert.equal(screen.getByTestId('shell-still-here').textContent, '壳还在')
  assert.ok(screen.getByTestId('record-prop-host'))
  const fallback = screen.getByTestId('render-boundary-fallback')
  assert.equal(fallback.getAttribute('data-render-boundary-label'), '卡片')
  assert.match(fallback.textContent ?? '', /sandbox boom/)
})

test('sandbox throw is caught as a child so the host keeps its own hooks', () => {
  const compiled = compileHostSource(boomSource)
  assert.equal(compiled.ok, true)
  if (!compiled.ok) return

  function HostWithOwnHooks() {
    const [alive] = useState('壳钩子还在')
    const code = useMemo(() => compiled.code, [])
    return (
      <div>
        <span data-testid="host-hooks">{alive}</span>
        <RenderBoundary label="属性沙盒">
          <SandboxPreview
            code={code}
            load={() => loadSandboxComponent(code, { React, Field: () => null, biu: {} }) as ComponentType}
          />
        </RenderBoundary>
      </div>
    )
  }

  render(<HostWithOwnHooks />)
  assert.equal(screen.getByTestId('host-hooks').textContent, '壳钩子还在')
  assert.match(screen.getByTestId('render-boundary-fallback').textContent ?? '', /sandbox boom/)
})

test('property sandbox code pane uses the shared host CodeMirror and unified sandbox modules', () => {
  const src = readFileSync(resolve(import.meta.dirname, './record-prop-host.tsx'), 'utf8')
  const biuSrc = readFileSync(resolve(import.meta.dirname, './sandbox-biu.ts'), 'utf8')
  const shellSrc = readFileSync(resolve(import.meta.dirname, './sandbox-host-shell.tsx'), 'utf8')
  const editor = readFileSync(resolve(import.meta.dirname, './host-source-editor.tsx'), 'utf8')
  assert.match(src, /recordResourcePath\(collectionPath, recordId\)/)
  assert.match(src, /path: recordPath/)
  assert.match(src, /HostSourceEditor/)
  assert.match(src, /createRecordSandboxBiu/)
  assert.match(src, /createBiuProxy/)
  assert.match(src, /useLiveDbRecord/)
  assert.match(src, /useDebouncedSandboxSource/)
  assert.match(biuSrc, /createSandboxFilesApi/)
  assert.match(biuSrc, /createSandboxDocsApi/)
  assert.match(biuSrc, /findFieldByName/)
  assert.match(biuSrc, /fieldKey/)
  assert.match(shellSrc, /useRecordViewFileTick/)
  assert.match(src, /language="javascript"/)
  assert.doesNotMatch(src, /page-tag-host-source/)
  assert.match(editor, /javascript\(\{ jsx: true, typescript: true \}\)/)
  assert.match(editor, /lineNumbers/)
  assert.match(editor, /className="page-source"/)
})

test('property sandbox preserves useState across record updates, injects ui.icons, and returns a Promise from biu.set', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  rememberRecordViewFile(
    '/pages',
    'home',
    'state-prop.jsx',
    `export default function App() {
      const [count, setCount] = React.useState(0)
      const [saved, setSaved] = React.useState('')
      const Star = ui.icons.StarIcon
      return (
        <div>
          <Star data-testid="prop-star" />
          <span data-testid="prop-count">{count}</span>
          <span data-testid="prop-title">{biu.get('title')}</span>
          <span data-testid="prop-tag-val">{String(biu.get('tag.tag-10.状态') ?? '')}</span>
          <span data-testid="prop-saved">{saved}</span>
          <button type="button" data-testid="prop-inc" onClick={() => setCount((c) => c + 1)}>+1</button>
          <button type="button" data-testid="prop-set" onClick={() => biu.set('title', '新标题').then(() => setSaved('done'))}>set</button>
          <button type="button" data-testid="prop-set-tag" onClick={() => biu.set('tag.tag-10.状态', '已完成')}>tag</button>
        </div>
      )
    }`,
  )
  const schema = {
    fields: {
      title: { type: 'string' as const, label: '标题', writable: true },
      tag: { type: 'tag' as const, label: '标签', writable: true },
    },
  }
  const view = { id: 'card1', name: '卡片', kind: 'sandbox' as const, file: 'state-prop.jsx', dataFile: 'state-prop-data.json' }
  const { rerender } = render(
    <RecordPropHostView
      record={{ id: 'home', title: '旧标题', updatedAt: 1, tag: { tags: ['tag-10'], values: { 'tag-10': { 状态: '进行中', 优先级: 'P1' } } } }}
      view={view}
      schema={schema}
      collectionPath="/pages"
    />,
  )
  assert.ok(screen.getByTestId('prop-star'))
  assert.equal(screen.getByTestId('prop-count').textContent, '0')
  assert.equal(screen.getByTestId('prop-title').textContent, '旧标题')
  assert.equal(screen.getByTestId('prop-tag-val').textContent, '进行中')

  // Increment local state
  screen.getByTestId('prop-inc').click()
  await vi.waitFor(() => assert.equal(screen.getByTestId('prop-count').textContent, '1'))

  // Rerender with changed updatedAt & tag -> component MUST NOT remount (count stays 1)
  rerender(
    <RecordPropHostView
      record={{ id: 'home', title: '外部改了标题', updatedAt: 2, tag: { tags: ['tag-10'], values: { 'tag-10': { 状态: '待验证', 优先级: 'P1' } } } }}
      view={view}
      schema={schema}
      collectionPath="/pages"
    />,
  )
  assert.equal(screen.getByTestId('prop-count').textContent, '1')
  assert.equal(screen.getByTestId('prop-title').textContent, '外部改了标题')
  assert.equal(screen.getByTestId('prop-tag-val').textContent, '待验证')

  // biu.set returns a Promise
  screen.getByTestId('prop-set').click()
  await vi.waitFor(() => assert.equal(screen.getByTestId('prop-saved').textContent, 'done'))
  assert.equal(screen.getByTestId('prop-count').textContent, '1')

  // biu.set('tag.<id>.<key>', value) merges atomically without clobbering sibling tag values
  screen.getByTestId('prop-set-tag').click()
  await vi.waitFor(() => {
    const lastCall = fetchMock.mock.calls.at(-1) as [string, RequestInit] | undefined
    const body = lastCall ? JSON.parse(String(lastCall[1]?.body ?? '{}')) : {}
    assert.equal(body.content?.tag?.values?.['tag-10']?.['状态'], '已完成')
    assert.equal(body.content?.tag?.values?.['tag-10']?.['优先级'], 'P1')
  })
  vi.unstubAllGlobals()
})

test('builtin source property view is read-only JSON', () => {
  patchRecordViewCatalog('/pages', 'home', { propViewId: 'source' })
  render(
    <RecordProperties
      record={{
        id: 'home',
        title: '演示页',
        share: 'private',
        layouts: [{ id: 'need', name: '需求', contentViewId: 'doc', propViewId: 'source' }],
      }}
      collectionPath="/pages"
      schema={{ fields: { title: { type: 'string', label: '标题' }, share: { type: 'select', label: '分享' } } }}
    >
      <div data-testid="prop-table">表格</div>
    </RecordProperties>,
  )
  assert.equal(screen.queryByTestId('prop-table'), null)
  assert.ok(screen.getByTestId('record-prop-source'))
})

test('property source pretty-prints JSON string fields instead of escaping them', () => {
  const text = recordPropSourceText(
    {
      id: 'tag-13',
      title: '附件',
      tag: { tags: ['tag-9'], values: { 'tag-9': { 状态: '321321' } } },
      fields: JSON.stringify([
        { key: '530659262', type: 'attachment', writable: true, label: '附件' },
        { key: '5800840175', type: 'boolean', writable: true, label: '是否你好' },
      ]),
    },
    {
      fields: {
        title: { type: 'string', label: '标题' },
        tag: { type: 'tag', label: '标签' },
        fields: { type: 'string', label: '属性' },
      },
    },
  )
  assert.match(text, /"tag": \{/)
  assert.match(text, /"fields": \[/)
  assert.match(text, /"type": "attachment"/)
  assert.doesNotMatch(text, /\\"/)
  assert.match(text, /"views": \[\]/)
  assert.match(text, /"propViews": \[\]/)
  assert.match(text, /"layouts": \[\]/)
})

test('property source includes content, property and layout view catalogs', () => {
  const text = recordPropSourceText(
    {
      id: 'p187',
      title: '石犀平台需求拆解',
      views: [{ id: 'doc', name: '文档', kind: 'sandbox', file: 'view-doc.jsx' }],
      propViews: [{ id: 'card', name: '卡片', kind: 'sandbox', file: 'prop-view-card.jsx', dataFile: 'prop-view-card.json' }],
      layouts: [{ id: 'need', name: '需求', contentViewId: 'doc', propViewId: 'card' }],
    },
    {
      fields: {
        title: { type: 'string', label: '标题' },
        views: { type: 'string', label: '内容视图' },
        propViews: { type: 'string', label: '属性视图' },
        layouts: { type: 'string', label: '全局视图' },
      },
    },
  )
  assert.match(text, /"views": \[/)
  assert.match(text, /"file": "view-doc.jsx"/)
  assert.match(text, /"propViews": \[/)
  assert.match(text, /"file": "prop-view-card.jsx"/)
  assert.match(text, /"layouts": \[/)
  assert.match(text, /"contentViewId": "doc"/)
  assert.match(text, /"propViewId": "card"/)
})
