import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { listPageHostBlocks, PageHostView } from './page-host-view.tsx'
import { resetPageFileState, setPageViews } from './page-views.ts'

test('host view paints the default sandbox when the view file is missing', async () => {
  resetPageFileState()
  setPageViews('home', [
    { id: 'site1', name: '官网', kind: 'sandbox', file: 'missing-view.jsx', dataFile: 'missing-data.json' },
  ])
  const { getByTestId, queryByTestId } = render(<PageHostView record={{ id: 'home', title: '演示页' }} viewId="site1" />)
  await waitFor(() => {
    assert.ok(getByTestId('page-host-view-root'))
  })
  assert.ok(getByTestId('page-host-side-bar'))
  assert.ok(getByTestId('page-host-type-icon'))
  assert.equal((getByTestId('page-host-title') as HTMLInputElement).value, '官网')
  assert.ok(getByTestId('page-host-edit'))
  assert.ok(getByTestId('page-host-split'))
  assert.ok(getByTestId('page-host-expand'))
  assert.ok(getByTestId('page-host-preview'))
  assert.equal(queryByTestId('page-host-code'), null)
  assert.match(getByTestId('page-host-view-root').textContent ?? '', /本页沙盒/)
  assert.match(getByTestId('page-host-view-root').textContent ?? '', /演示页/)
  const pane = getByTestId('page-host-preview')
  assert.equal(pane.hasAttribute('data-sandbox'), true)
  assert.equal(pane.getAttribute('data-biu-kind'), 'sandbox')
  const viewRoot = getByTestId('page-host-view-root')
  assert.equal(viewRoot.getAttribute('data-sandbox-pick'), '')
  assert.equal(viewRoot.getAttribute('data-biu-kind'), 'sandbox')
  const heading = viewRoot.querySelector('h1')
  assert.ok(heading)
  assert.equal(heading.getAttribute('data-sandbox-pick'), '')
  assert.equal(heading.getAttribute('data-biu-kind'), 'sandbox')
})

test('host view stays mounted when the page record object changes', async () => {
  cleanup()
  resetPageFileState()
  setPageViews('home', [
    { id: 'site1', name: '官网', kind: 'sandbox', file: 'missing-view.jsx', dataFile: 'missing-data.json' },
  ])
  const { getByTestId, rerender } = render(<PageHostView record={{ id: 'home', title: '演示页' }} viewId="site1" />)
  await waitFor(() => {
    assert.ok(getByTestId('page-host-view-root'))
  })
  const root = getByTestId('page-host-view-root')
  root.dataset.stay = '1'
  rerender(<PageHostView record={{ id: 'home', title: '演示页', touched: 1 }} viewId="site1" />)
  assert.equal(getByTestId('page-host-view-root').dataset.stay, '1')
})

test('host view shares sandbox block preview, code, split, and expand chrome', async () => {
  cleanup()
  resetPageFileState()
  setPageViews('home', [
    { id: 'site1', name: '官网', kind: 'sandbox', file: 'missing-view.jsx', dataFile: 'missing-data.json' },
  ])
  const { getByTestId, queryByTestId } = render(<PageHostView record={{ id: 'home', title: '演示页' }} viewId="site1" />)
  await waitFor(() => {
    assert.ok(getByTestId('page-host-view-root'))
  })
  fireEvent.click(getByTestId('page-host-edit'))
  assert.ok(getByTestId('page-host-code'))
  assert.equal(getByTestId('page-host-code').getAttribute('data-biu-kind'), 'sandbox')
  assert.match(getByTestId('page-host-code').getAttribute('data-biu-id') ?? '', /:source$/)
  assert.equal(queryByTestId('page-host-preview'), null)
  fireEvent.click(getByTestId('page-host-split'))
  assert.ok(getByTestId('page-host-preview'))
  assert.ok(getByTestId('page-host-code'))
  fireEvent.click(getByTestId('page-host-expand'))
  assert.equal(getByTestId('page-host-view').getAttribute('data-page-host-expanded'), '1')
  assert.ok(getByTestId('page-host-expand-nav'))
  assert.ok(getByTestId('page-host-type-icon'))
  assert.equal(queryByTestId('page-host-side-bar'), null)
  assert.ok(getByTestId('page-host-edit'))
  assert.ok(getByTestId('page-host-split'))
  assert.ok(getByTestId('page-host-expand'))
})

test('host blocks come from page markdown and write back through the db api', () => {
  const blocks = listPageHostBlocks(
    'home',
    `:::pageBlock {kind=sandbox plugin=page-sandbox id=ab12cd34}
{"title":"沙箱"}
:::
`,
  )
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0]?.id, '/pages::home::ab12cd34')
  assert.equal(blocks[0]?.title, '沙箱')
  const src = readFileSync(resolve(import.meta.dirname, './page-host-view.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, './style.ts'), 'utf8')
  assert.match(css, /\.page-block-expand-nav,.page-editor \.page-block-expand-nav\{[^}]*grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/)
  assert.match(css, /\.page-block-expand-nav,.page-editor \.page-block-expand-nav\{[^}]*height:var\(--biu-size-control-lg\)/)
  assert.match(css, /\.page-block-expand-nav,.page-editor \.page-block-expand-nav\{[^}]*font-size:var\(--biu-font-size-3\)/)
  assert.match(css, /\.page-block-expand-nav-title,.page-editor \.page-block-expand-nav-title\{[^}]*height:24px/)
  assert.match(css, /\.page-block-expand-nav-title,.page-editor \.page-block-expand-nav-title\{[^}]*max-width:min\(560px,92%\)/)
  assert.match(css, /\.page-editor \.page-block-expand-nav svg[^{]*\{[^}]*width:var\(--biu-size-icon\)/)
  assert.match(css, /\.page-block-expand-nav-title,.page-editor \.page-block-expand-nav-title\{[^}]*font-size:var\(--biu-font-size-3\)/)
  assert.match(css, /\.page-block-expand-nav,.page-editor \.page-block-expand-nav\{[^}]*background:var\(--biu-color-bg-subtle\)/)
  assert.match(css, /\.page-block-expand-nav,.page-editor \.page-block-expand-nav\{[^}]*padding:0 4px/)
  assert.match(css, /\.page-block-expand-nav,.page-editor \.page-block-expand-nav\{[^}]*border:0/)
  assert.match(css, /\.page-block-expand-nav,.page-editor \.page-block-expand-nav\{[^}]*border-radius:0/)
  assert.match(css, /\.page-block-expand-nav,.page-editor \.page-block-expand-nav\{[^}]*z-index:0/)
  assert.doesNotMatch(css, /data-sandbox-selected\]::after/)
  assert.match(css, /page-sandbox-block\]\{[^}]*border:0/)
  assert.match(css, /data-page-block=sandbox\]:has\(\[data-sandbox-selected\]\)\{[^}]*box-shadow:0 0 0 var\(--biu-stroke-width-thick\) var\(--biu-color-emphasis-border\)/)
  assert.match(css, /\.page-editor \.react-renderer\.node-pageBlock\.ProseMirror-selectednode\{outline:none;box-shadow:none;border-radius:0\}/)
  assert.match(css, />\.page-block-expand-nav\{border-top-left-radius:0;border-top-right-radius:0\}/)
  assert.doesNotMatch(css, /\.page-block-expand-nav,.page-editor \.page-block-expand-nav\{[^}]*border-bottom:/)
  assert.match(css, /\.page-block-expand-nav-title,.page-editor \.page-block-expand-nav-title\{[^}]*justify-self:center/)
  assert.match(css, /\.page-block-expand-nav-tools\{[^}]*justify-self:end/)
  assert.doesNotMatch(css, /\.page-block-expand-nav-tools\{[^}]*justify-self:center/)
  assert.doesNotMatch(css, /\.page-host-view\.is-expanded>\.page-slide-bar/)
  assert.match(src, /writePageHostBlock/)
  assert.match(src, /writeBlockData/)
  assert.match(src, /capturePageScroll/)
  assert.match(src, /update: \(id: string, patch: Record<string, unknown>\) => writePageHostBlock/)
  assert.doesNotMatch(src, /getLivePageEditor/)
  assert.doesNotMatch(src, /persistLivePageEditor/)
  assert.match(src, /data-testid="page-host-edit"/)
  assert.match(src, /data-testid="page-host-split"/)
  assert.match(src, /page-host-expand-nav/)
  assert.match(src, /page-block-expand-nav/)
  assert.match(src, /page-host-title/)
  assert.match(src, /renamePageSandboxView/)
  assert.match(src, /SandboxKindIcon/)
  assert.match(src, /language="javascript"/)
  assert.match(src, /ViewColumnsIcon/)
  assert.match(src, /createPortal\(card, document\.body\)/)
  assert.doesNotMatch(src, /requestFullscreen/)
  assert.match(css, /\.page-host-view\.is-expanded\{[^}]*z-index:var\(--biu-z-modal\)/)
  assert.match(css, /\.page-host-view\.is-expanded\{[^}]*overflow:visible/)
  assert.doesNotMatch(css, /2147483646/)
  assert.match(css, /\.page-host-view \.page-block iframe\{pointer-events:auto\}/)
  assert.match(css, /\.page-host-view:not\(\.is-expanded\)>\.page-block-expand-nav/)
  assert.doesNotMatch(src, /className="page-slide-bar"/)
  assert.match(css, /\.page-host-view \.page-block\{[^}]*line-height:var\(--fsdb-body-leading,1\.7\)/)
  assert.match(css, /\.page-editor \.tiptap table\{[^}]*margin:8px 0/)
  assert.match(css, /\.page-tag-block \.tasks-table[^}]*margin:8px 0/)
  assert.match(src, /void writePageHostBlock\(hit\.pageId, hit\.blockId, next\)/)
  assert.match(src, /key=\{hit\.blockId\}/)
  assert.match(src, /usePageFileTick/)
  assert.match(src, /bindSandboxPickPane/)
  assert.match(src, /data-sandbox=""/)
  assert.match(src, /pickHost=\{\{/)
  assert.match(src, /name: view\?\.file/)
  assert.match(src, /data-biu-name=\{view\?\.file/)
  assert.match(src, /data-biu-kind="sandbox"/)
  assert.match(src, /:source/)
  assert.doesNotMatch(src, /defaultLayoutSandboxSource/)
})
