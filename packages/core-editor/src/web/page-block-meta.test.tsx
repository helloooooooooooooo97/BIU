import { test } from 'vitest'
import assert from 'node:assert/strict'
import { render, waitFor } from '@testing-library/react'
import { blockDataUnchanged, ENABLE_PAGE_BLOCK_PLUGIN, formatPageBlockFence, parsePageBlockData, parsePageBlockMeta, readPageBlockFence, requestEnablePageBlockPlugin, setPageBlockPluginPhase } from './page-block-meta.ts'
import { PageBlockMissing } from './page-plugin-host.tsx'

test('page block fence keeps plugin id in the document', () => {
  assert.deepEqual(parsePageBlockMeta('kind=excalidraw plugin=page-excalidraw'), {
    kind: 'excalidraw',
    plugin: 'page-excalidraw',
    id: '',
    extras: {},
  })
  assert.match(
    formatPageBlockFence('excalidraw', 'page-excalidraw', { file: 'assets/a.json' }, 'ab12cd34'),
    /:::pageBlock \{kind=excalidraw plugin=page-excalidraw id=ab12cd34\}/,
  )
})

test('missing block shows stored source and asks to enable the stored plugin', async () => {
  const { container } = render(
    <PageBlockMissing kind="excalidraw" plugin="page-excalidraw" data={{ file: 'assets/a.json' }} />,
  )
  await waitFor(() => assert.match(container.textContent ?? '', /assets\/a\.json/))
  const text = container.textContent ?? ''
  assert.doesNotMatch(text, /未启用「/)
  assert.doesNotMatch(text, /文档里已经存/)
  assert.match(text, /page-excalidraw/)
  assert.doesNotMatch(text, /未运行/)
  assert.doesNotMatch(text, /源码/)
  const enable = container.querySelector('[data-testid="page-block-enable"]')
  assert.equal(enable?.getAttribute('aria-label'), '启用')
  assert.ok(enable?.querySelector('svg'))
  assert.ok(container.querySelector('[data-testid="page-source-editor"]'))
})

test('sandbox pageBlock fence stores code and data as attachments', () => {
  assert.deepEqual(parsePageBlockMeta('kind=sandbox plugin=page-sandbox deck=true'), {
    kind: 'sandbox',
    plugin: 'page-sandbox',
    id: '',
    extras: { deck: true },
  })
  const src = formatPageBlockFence('sandbox', 'page-sandbox', {
    file: 'assets/sandbox-ab12cd34.jsx',
    dataFile: 'assets/sandbox-data-ab12cd34.json',
    source: 'export default function App() { return <div>爱乐之城</div> }',
    deck: true,
  })
  assert.match(src, /:::pageBlock \{kind=sandbox plugin=page-sandbox\}/)
  assert.doesNotMatch(src, /\bdeck=/)
  assert.match(src, /"file": "assets\/sandbox-ab12cd34.jsx"/)
  assert.match(src, /"dataFile": "assets\/sandbox-data-ab12cd34.json"/)
  assert.doesNotMatch(src, /export default function App/)
  assert.doesNotMatch(src, /"html":/)
  const legacy = formatPageBlockFence('sandbox', 'page-sandbox', {
    source: 'export default function App() { return <div>爱乐之城</div> }',
  })
  assert.match(legacy, /export default function App/)
  assert.match(legacy, /爱乐之城/)
  const live = formatPageBlockFence('sandbox', 'page-sandbox', {
    html: 'export default function App() { return <div>Sandbox</div> }',
    deck: true,
  })
  assert.match(live, /export default function App/)
  assert.deepEqual(parsePageBlockData('sandbox', 'export default function App() { return <div /> }', { deck: false }), {
    deck: false,
    source: 'export default function App() { return <div /> }',
  })
  assert.equal(parsePageBlockData('sandbox', '{"html":"<p>旧</p>","deck":true}').source, '<p>旧</p>')
  const sized = formatPageBlockFence('sandbox', 'page-sandbox', {
    source: 'export default function App() { return <div>卡</div> }',
    deck: true,
    width: '100%',
    height: '100vh',
  })
  assert.match(sized, /width=100%/)
  assert.match(sized, /height=100vh/)
  assert.deepEqual(parsePageBlockMeta('kind=sandbox plugin=page-sandbox id=ab12cd34 deck=true'), {
    kind: 'sandbox',
    plugin: 'page-sandbox',
    id: 'ab12cd34',
    extras: { deck: true },
  })
})

test('video pageBlock fence stores the tag script, not JSON', () => {
  const src = formatPageBlockFence('video', 'page-video', {
    script: '<timeline fps=30>\n  <track><title dur=1s>Hi</title></track>\n</timeline>',
    clips: [{ kind: 'title' }],
  }, 'viddemo1')
  assert.match(src, /:::pageBlock \{kind=video plugin=page-video id=viddemo1\}/)
  assert.match(src, /<title dur=1s>Hi<\/title>/)
  assert.doesNotMatch(src, /"script":/)
  assert.deepEqual(parsePageBlockData('video', '<timeline fps=24>\n  <track><scene dur=1s>A</scene></track>\n</timeline>'), {
    script: '<timeline fps=24>\n  <track><scene dur=1s>A</scene></track>\n</timeline>',
  })
  assert.match(String(parsePageBlockData('video', '{"script":"<timeline></timeline>"}').script), /<timeline><\/timeline>/)
})

test('page block fence format then parse roundtrips kind plugin id and data', () => {
  const json = readPageBlockFence(formatPageBlockFence('excalidraw', 'page-excalidraw', { file: 'assets/a.json' }, 'ab12cd34'))
  assert.equal(json.kind, 'excalidraw')
  assert.equal(json.plugin, 'page-excalidraw')
  assert.equal(json.id, 'ab12cd34')
  assert.equal(json.data.file, 'assets/a.json')
  const box = readPageBlockFence(formatPageBlockFence('sandbox', 'page-sandbox', { file: 'assets/sandbox-sandbx01.jsx', dataFile: 'assets/sandbox-data-sandbx01.json', deck: true, title: '海报' }, 'sandbx01'))
  assert.equal(box.kind, 'sandbox')
  assert.equal(box.plugin, 'page-sandbox')
  assert.equal(box.id, 'sandbx01')
  assert.equal(box.data.file, 'assets/sandbox-sandbx01.jsx')
  assert.equal(box.data.dataFile, 'assets/sandbox-data-sandbx01.json')
  assert.equal(box.data.source, undefined)
  assert.equal(box.data.deck, undefined)
  assert.equal(box.data.title, '海报')
  const legacy = readPageBlockFence(formatPageBlockFence('sandbox', 'page-sandbox', { source: 'export default function App(){return <div/>}' }, 'sandbx01'))
  assert.equal(legacy.data.source, 'export default function App(){return <div/>}')
  const video = readPageBlockFence(formatPageBlockFence('video', 'page-video', { script: '<timeline></timeline>' }, 'viddemo1'))
  assert.equal(video.kind, 'video')
  assert.equal(video.plugin, 'page-video')
  assert.equal(video.id, 'viddemo1')
  assert.equal(video.data.script, '<timeline></timeline>')
})

test('sandbox pageBlock fence keeps title on the header', () => {
  const src = formatPageBlockFence('sandbox', 'page-sandbox', {
    source: 'export default function App(){return <div/>}',
    title: '海报',
  }, 'ab12cd34')
  assert.match(src, /title="海报"/)
  assert.equal(parsePageBlockMeta(src.match(/\{([^}]*)\}/)?.[1] ?? '').extras.title, '海报')
})

test('unchanged block data does not count as an edit', () => {
  assert.equal(blockDataUnchanged({ sid: 'a', n: 1 }, { sid: 'a', n: 1 }), true)
  assert.equal(blockDataUnchanged({ sid: 'a' }, { sid: 'b' }), false)
  assert.equal(blockDataUnchanged({ nested: { on: true } }, { nested: { on: true } }), true)
})

test('missing plugin keeps the fence and says it does not exist', () => {
  const { container } = render(
    <PageBlockMissing kind="geo" plugin="page-geo" data={{ title: '地球' }} phase="missing" />,
  )
  assert.equal(container.querySelector('[data-testid="page-block-missing"]')?.getAttribute('data-plugin-phase'), 'missing')
  assert.match(container.textContent ?? '', /插件不存在/)
  assert.match(container.textContent ?? '', /"title": "地球"/)
  assert.doesNotMatch(container.textContent ?? '', /:::pageBlock/)
  assert.doesNotMatch(container.textContent ?? '', /正在加载/)
  assert.ok(container.querySelector('[data-testid="page-source-editor"]'))
  assert.ok(container.querySelector('[data-testid="page-block-enable"]'))
})

test('loading plugin hides the fence and keeps the block shell', () => {
  const { container } = render(
    <PageBlockMissing kind="excalidraw" plugin="page-excalidraw" data={{ file: 'assets/a.json' }} phase="loading" />,
  )
  assert.equal(container.querySelector('[data-testid="page-block-missing"]')?.getAttribute('data-plugin-phase'), 'loading')
  assert.match(container.textContent ?? '', /正在加载/)
  assert.equal(container.querySelector('.page-block-missing-source'), null)
  assert.equal(container.querySelector('[data-testid="page-block-enable"]'), null)
})

test('deferred plugins wait for a forced enable click', () => {
  setPageBlockPluginPhase('page-excalidraw', 'deferred')
  const seen: Array<{ plugin: string; force: boolean }> = []
  const onEnable = (event: Event) => {
    const detail = (event as CustomEvent<{ plugin?: string; force?: boolean }>).detail
    seen.push({ plugin: String(detail?.plugin ?? ''), force: detail?.force === true })
  }
  window.addEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
  requestEnablePageBlockPlugin('page-excalidraw', 'excalidraw')
  assert.deepEqual(seen, [])
  requestEnablePageBlockPlugin('page-excalidraw', 'excalidraw', { force: true })
  window.removeEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
  assert.deepEqual(seen, [{ plugin: 'page-excalidraw', force: true }])
  setPageBlockPluginPhase('page-excalidraw', 'idle')
  const pending = (globalThis as typeof globalThis & { __biuPendingPageBlockEnables?: Map<string, string> }).__biuPendingPageBlockEnables
  pending?.delete('page-excalidraw')
})

test('enable button only dispatches the stored plugin id', () => {
  setPageBlockPluginPhase('page-excalidraw', 'idle')
  const seen: string[] = []
  const onEnable = (event: Event) => {
    seen.push(String((event as CustomEvent<{ plugin?: string }>).detail?.plugin ?? ''))
  }
  window.addEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
  requestEnablePageBlockPlugin('page-excalidraw', 'excalidraw')
  window.removeEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
  assert.deepEqual(seen, ['page-excalidraw'])
  const pending = (globalThis as typeof globalThis & { __biuPendingPageBlockEnables?: Map<string, string> }).__biuPendingPageBlockEnables
  assert.equal(pending?.get('page-excalidraw'), 'excalidraw')
  setPageBlockPluginPhase('page-excalidraw', 'idle')
  pending?.delete('page-excalidraw')
})
