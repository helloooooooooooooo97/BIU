import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { setPageBlockPluginPhase, takePageBlockFence, usePageBlockPluginPhase } from './page-block-meta.ts'
import { injectPageBlockPlugin } from './page-block-plugin-host.ts'
import { PageBlockMissing } from './page-plugin-host.tsx'
import { hostThemeCss } from './sandbox/runtime.ts'

afterEach(() => {
  cleanup()
})

/** Legacy O(N^2) takePageBlockFence (split('\n') + full scan to EOF on every block) for before/after comparison */
function legacyTakePageBlockFence(src: string) {
  const PAGE_BLOCK_OPEN = /^:::(?:editorBlock|pageBlock)(?:\s+\{([^}]*)\})?\s*(?:<!--.*?-->\s*)?$/
  const FENCE_CLOSE = /^:::\s*(?:<!--.*?-->\s*)?$/
  const lines = src.split('\n')
  const head = PAGE_BLOCK_OPEN.exec(lines[0] ?? '')
  if (!head) return null
  const closes: number[] = []
  for (let i = 1; i < lines.length; i += 1) {
    if (FENCE_CLOSE.test(lines[i] ?? '')) closes.push(i)
  }
  if (!closes.length) return null
  const looksOuter = (closeAt: number) => {
    let i = closeAt + 1
    while (i < lines.length && !String(lines[i] ?? '').trim()) i += 1
    if (i >= lines.length) return true
    return /^(:::((editorBlock|pageBlock|cell|slide|table|row|th|td|code)\b|$)|`{3,}|#{1,6}\s)/.test(String(lines[i] ?? ''))
  }
  const end = closes.find(looksOuter) ?? closes[closes.length - 1]!
  return {
    raw: lines.slice(0, end + 1).join('\n'),
    header: head[1] ?? '',
    body: lines.slice(1, end).join('\n'),
  }
}

test('1000-block editor performance benchmark: before vs after', () => {
  const COUNT = 1000
  const blocks = Array.from(
    { length: COUNT },
    (_, i) => `:::editorBlock {kind=card plugin=plugin-${i % 10} id=blk${String(i).padStart(6, '0')}}\n{"title":"Block ${i}","value":${i}}\n:::`,
  )
  const docMd = blocks.join('\n\n')

  // 1. Markdown fence tokenizer: 1000 blocks (legacy O(N^2) vs optimized O(N))
  let posLegacy = 0
  let countLegacy = 0
  const tTokBefore = performance.now()
  while (posLegacy < docMd.length) {
    const start = docMd.indexOf(':::editorBlock', posLegacy)
    if (start < 0) break
    const taken = legacyTakePageBlockFence(docMd.slice(start))
    assert.ok(taken)
    countLegacy += 1
    posLegacy = start + taken.raw.length
  }
  const tokBeforeMs = performance.now() - tTokBefore

  let posOpt = 0
  let countOpt = 0
  const tTokAfter = performance.now()
  while (posOpt < docMd.length) {
    const start = docMd.indexOf(':::editorBlock', posOpt)
    if (start < 0) break
    const taken = takePageBlockFence(docMd.slice(start))
    assert.ok(taken)
    countOpt += 1
    posOpt = start + taken.raw.length
  }
  const tokAfterMs = performance.now() - tTokAfter
  assert.equal(countLegacy, COUNT)
  assert.equal(countOpt, COUNT)

  // 2. injectPageBlockPlugin on a 25-node subtree × 200 blocks (O(M) single DFS, 0 querySelector)
  const hosts = Array.from({ length: 200 }, (_, i) => {
    const host = document.createElement('div')
    for (let j = 0; j < 25; j += 1) {
      const child = document.createElement('div')
      child.textContent = `cell-${i}-${j}`
      host.appendChild(child)
    }
    return host
  })
  const tInject = performance.now()
  for (const host of hosts) injectPageBlockPlugin(host, 'page-card')
  const inject200Ms = performance.now() - tInject
  assert.equal(hosts[0]!.firstElementChild?.getAttribute('data-biu-plugin'), 'page-card')

  // 3. Per-plugin phase subscription: updating 1 plugin among 1000 blocks wakes only its 100 blocks (not 1000)
  let phaseRenders = 0
  function PhaseProbe({ plugin }: { plugin: string }) {
    phaseRenders += 1
    const phase = usePageBlockPluginPhase(plugin)
    return <span data-phase={phase} />
  }
  const view = render(
    <div>
      {Array.from({ length: COUNT }, (_, i) => (
        <PhaseProbe key={i} plugin={`bench-plugin-${i % 10}`} />
      ))}
    </div>,
  )
  phaseRenders = 0
  act(() => {
    setPageBlockPluginPhase('bench-plugin-0', 'loading')
    setPageBlockPluginPhase('bench-plugin-0', 'ready')
  })
  const scopedPhaseRenders = phaseRenders
  // Only the 100 blocks belonging to bench-plugin-0 re-rendered (vs 2000 under global phaseVersion!)
  assert.equal(scopedPhaseRenders, 100)
  setPageBlockPluginPhase('bench-plugin-0', 'idle')
  view.unmount()

  // 4. Lightweight PageBlockMissing: mounting 200 missing blocks without CodeMirror
  const tMissing = performance.now()
  const missingView = render(
    <div>
      {Array.from({ length: 200 }, (_, i) => (
        <PageBlockMissing key={i} kind="card" plugin="plugin-x" data={{ title: `Missing ${i}` }} phase="missing" />
      ))}
    </div>,
  )
  const missing200Ms = performance.now() - tMissing
  assert.equal(missingView.container.querySelectorAll('[data-testid="page-source-editor"]').length, 200)
  missingView.unmount()

  // 5. hostThemeCss cached across 1000 calls
  const tTheme = performance.now()
  let lastCss = ''
  for (let i = 0; i < COUNT; i += 1) lastCss = hostThemeCss()
  const theme1000Ms = performance.now() - tTheme
  assert.ok(lastCss.includes(':host'))

  console.log(
    '=== 1000-BLOCK EDITOR BENCHMARK ===\n' +
      JSON.stringify(
        {
          tokenize1000BlocksBeforeMs: Number(tokBeforeMs.toFixed(2)),
          tokenize1000BlocksAfterMs: Number(tokAfterMs.toFixed(2)),
          tokenizeSpeedup: `${(tokBeforeMs / Math.max(0.01, tokAfterMs)).toFixed(1)}x`,
          inject200SubtreesMs: Number(inject200Ms.toFixed(2)),
          phaseFanoutBefore: 2000,
          phaseFanoutAfter: scopedPhaseRenders,
          missing200BlocksMs: Number(missing200Ms.toFixed(2)),
          hostThemeCss1000CallsMs: Number(theme1000Ms.toFixed(2)),
        },
        null,
        2,
      ),
  )

  assert.ok(tokAfterMs < tokBeforeMs / 5, `expected >=5x tokenize speedup, got ${tokBeforeMs}ms -> ${tokAfterMs}ms`)
})
