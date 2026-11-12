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
import { compileHostSource, loadHostComponent, SandboxPreview } from './tag-host-compile.ts'

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
            load={() => loadHostComponent(code, React, () => null, {}) as ComponentType}
          />
        </RenderBoundary>
      </div>
    )
  }

  render(<HostWithOwnHooks />)
  assert.equal(screen.getByTestId('host-hooks').textContent, '壳钩子还在')
  assert.match(screen.getByTestId('render-boundary-fallback').textContent ?? '', /sandbox boom/)
})

test('property sandbox code pane uses the shared host CodeMirror', () => {
  const src = readFileSync(resolve(import.meta.dirname, './record-prop-host.tsx'), 'utf8')
  const editor = readFileSync(resolve(import.meta.dirname, './host-source-editor.tsx'), 'utf8')
  assert.match(src, /HostSourceEditor/)
  assert.match(src, /files: createSandboxFilesApi/)
  assert.match(src, /docs: createSandboxDocsApi/)
  assert.match(src, /useLiveDbRecord/)
  assert.match(src, /useRecordViewFileTick/)
  assert.match(src, /findFieldByName/)
  assert.match(src, /fieldKey/)
  assert.match(src, /files: envRef\.current\.biu\.files/)
  assert.match(src, /docs: envRef\.current\.biu\.docs/)
  assert.match(src, /language="javascript"/)
  assert.doesNotMatch(src, /page-tag-host-source/)
  assert.match(editor, /javascript\(\{ jsx: true, typescript: true \}\)/)
  assert.match(editor, /lineNumbers/)
  assert.match(editor, /className="page-source"/)
})

test('builtin source property view is read-only JSON', () => {
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
})
