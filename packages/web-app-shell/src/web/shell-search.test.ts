import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SEARCH_SCOPES,
  openSearchHit,
  pickRecentHits,
  recordUpdatedAt,
  searchCollection,
  searchHref,
  tagsFromRecord,
  pluginRecordEnabled,
  visibleRowActions,
  previewHitRecord,
  isGlobalSearchHotkey,
} from './shell-search.tsx'

test('search opens inspector collections, not chat or database routes', () => {
  assert.equal(searchCollection('view'), '/views')
  assert.equal(searchCollection('session'), '/agents')
  assert.equal(searchCollection('task'), '/tasks')
  assert.equal(searchCollection('page'), '/pages')
  assert.equal(searchCollection('plugin'), '/plugins')
  assert.equal(searchCollection('facet'), '/facets')
  assert.deepEqual(
    SEARCH_SCOPES.map((item) => item.label),
    ['视图', '代理', '任务', '页面', '插件', '标签'],
  )
})

test('openSearchHit reveals the record in the inspector', () => {
  const seen: Array<{ collection?: string; recordId?: string }> = []
  const onReveal = (event: Event) => {
    const detail = (event as CustomEvent).detail as { collection?: string; recordId?: string }
    seen.push(detail)
  }
  window.addEventListener('biu:inspector-reveal', onReveal)
  openSearchHit({ kind: 'page', id: 'p1' })
  openSearchHit({ kind: 'session', id: 'abc' })
  openSearchHit({ kind: 'view', id: 'pages::mine', record: { tablePath: '/pages', viewId: 'mine' } })
  window.removeEventListener('biu:inspector-reveal', onReveal)
  assert.deepEqual(seen, [
    { collection: '/pages', recordId: 'p1', unique: true },
    { collection: '/agents', recordId: 'abc', unique: true },
    { collection: '/pages', viewId: 'mine', unique: true },
  ])
})

test('searchHref opens the left main pane by changing the route', () => {
  assert.equal(searchHref({ kind: 'view', id: 'pages::mine', record: { tablePath: '/pages', viewId: 'mine' } }), '/database/pages/view/mine')
  assert.equal(searchHref({ kind: 'session', id: 'abc' }), '/agents/abc')
  assert.equal(searchHref({ kind: 'page', id: 'p1' }), '/database/pages/record/p1')
  assert.equal(searchHref({ kind: 'task', id: 't1' }), '/database/tasks/record/t1')
  assert.equal(searchHref({ kind: 'plugin', id: 'g1' }), '/database/plugins/record/g1')
  assert.equal(searchHref({ kind: 'facet', id: 'f1' }), '/database/facets/record/f1')
})

test('search hits collect 标签 from facet.tags and config.facet.tags', () => {
  assert.deepEqual(tagsFromRecord({ tags: ['a', 'b'] }), [])
  assert.deepEqual(tagsFromRecord({ facet: { tags: ['dp'] } }), ['dp'])
  assert.deepEqual(tagsFromRecord({ config: { facet: { tags: ['host-ui'] } } }), ['host-ui'])
  assert.deepEqual(tagsFromRecord({ tags: ['a'], facet: { tags: ['a', 'b'] } }), ['a', 'b'])
})

test('recordUpdatedAt prefers updatedAt then createdAt', () => {
  assert.equal(recordUpdatedAt({ updatedAt: 9, createdAt: 1 }), 9)
  assert.equal(recordUpdatedAt({ createdAt: 4 }), 4)
  assert.equal(recordUpdatedAt({}), 0)
})

test('pickRecentHits takes the newest records per kind', () => {
  assert.deepEqual(
    pickRecentHits(
      [
        { id: 'old', updatedAt: 1 },
        { id: 'new', updatedAt: 9 },
        { id: 'mid', updatedAt: 5 },
      ],
      2,
    ).map((item) => item.id),
    ['new', 'mid'],
  )
})

test('empty search lists every kind by updatedAt instead of skipping remotes', () => {
  const src = readFileSync(resolve(import.meta.dirname, './shell-search.tsx'), 'utf8')
  assert.doesNotMatch(src, /if \(!needle && scope === 'all'\) \{\s*setHits\(\[\]\)/)
  assert.match(src, /sort: 'updatedAt'/)
  assert.match(src, /item.id === 'session' \? '\/agents'/)
  assert.match(src, /空着时视图、代理、任务、页面、插件、标签各按更新时间列最近/)
  assert.doesNotMatch(src, /window\.confirm/)
  assert.match(src, /<ConfirmDialog/)
})

test('plugin search hits turn the icon green when enabled', () => {
  assert.equal(pluginRecordEnabled({ enabled: true }), true)
  assert.equal(pluginRecordEnabled({ enabled: 'true' }), true)
  assert.equal(pluginRecordEnabled({}), false)
  const src = readFileSync(resolve(import.meta.dirname, './shell-search.tsx'), 'utf8')
  assert.match(src, /pluginRecordEnabled\(item\.record\)/)
  assert.match(src, /shell-search-hit-icon\$\{[^}]*is-enabled/)
  assert.doesNotMatch(src, /plugin-enabled-dot/)
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  assert.match(css, /\.shell-search-hit-icon\.is-enabled[^}]*color:\s*var\(--biu-color-ink-green\)/)
})

test('session task page plugin hits render tags left of actions', () => {
  const src = readFileSync(resolve(import.meta.dirname, './shell-search.tsx'), 'utf8')
  assert.doesNotMatch(src, /HitKindTag/)
  assert.match(src, /HitRecordTags/)
  assert.match(src, /HitActions/)
  assert.match(src, /<span>\{action\.label\}<\/span>/)
  assert.match(src, /shell-search-hit-aside/)
  assert.match(src, /shell-search-hit-tags/)
  assert.match(src, /shell-search-hit-actions/)
  assert.match(src, /const cls = 'size-4'/)
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  assert.match(css, /\.shell-search-hit-aside\s*\{[^}]*margin-left:\s*auto/s)
  assert.match(css, /\.shell-search-input\s*\{[^}]*font-weight:\s*500/s)
  assert.match(css, /\.shell-search-hit\s*\{[^}]*font-weight:\s*500/s)
  assert.match(css, /\.shell-search-hint\s*\{[^}]*font-weight:\s*600/s)
  assert.match(css, /\.shell-search-foot\s*\{[^}]*font-weight:\s*600/s)
  assert.match(css, /\.shell-search-hit-tags \.biu-tag\s*\{[^}]*font-weight:\s*400/s)
  assert.match(css, /\.shell-search-go\s*\{[^}]*color:\s*var\(--biu-color-icon\)/s)
  assert.match(css, /\.shell-search-hit-icon\s*\{[^}]*color:\s*var\(--biu-color-icon\)/s)
  assert.match(css, /\.shell-search-hit\.is-active \.shell-search-hit-icon[\s\S]*?color:\s*var\(--biu-color-icon-active\)/s)
  assert.match(css, /\.shell-search-hit-action\s*\{[^}]*--biu-tag:\s*var\(--biu-color-ink-gray\)/s)
  assert.match(css, /\.shell-search-hit-action\.is-danger\s*\{[^}]*--biu-tag:\s*var\(--biu-color-danger\)/s)
  assert.match(css, /\.shell-search-hit-action\s*\{[^}]*border-radius:\s*var\(--biu-radius-xl\)/s)
  assert.match(css, /\.shell-search-hit-action\s*\{[^}]*height:\s*22px/s)
  assert.match(css, /\.shell-search-hit-action\s*\{[^}]*padding:\s*0 8px/s)
})

test('search hit icons follow record mark: emoji, else session mascot', () => {
  const src = readFileSync(resolve(import.meta.dirname, './shell-search.tsx'), 'utf8')
  assert.match(src, /function HitMark/)
  assert.match(src, /fsdb-record-emoji/)
  assert.match(src, /SidebarMascot/)
  assert.match(src, /resolveSessionMascot/)
  assert.match(src, /scrollIntoView\(\{ block: 'nearest' \}\)/)
})

test('facet search scope is named 标签 with tag icon', () => {
  const src = readFileSync(resolve(import.meta.dirname, './shell-search.tsx'), 'utf8')
  assert.match(src, /label: '视图'/)
  assert.match(src, /kind === 'view'[\s\S]*return <TableCellsIcon/)
  assert.match(src, /label: '标签'/)
  assert.match(src, /kind === 'plugin'[\s\S]*return <PuzzlePieceIcon/)
  assert.match(src, /return <TagIcon className=\{className\} \/>/)
  assert.doesNotMatch(src, /label: '类型'/)
})

test('search does not draw agent progress as a hit action', () => {
  const src = readFileSync(resolve(import.meta.dirname, './shell-search.tsx'), 'utf8')
  assert.match(src, /actionVisibleToUser\(action\)/)
  assert.match(src, /SEARCH_SKIP_ACTION_IDS/)
  assert.match(src, /id === 'deliver'\) return <PaperAirplaneIcon/)
})

test('search hits hide agent-only actions', () => {
  assert.deepEqual(
    visibleRowActions(
      [
        { id: 'start', label: '运行' },
        { id: 'progress', label: '进度', for: 'agent' },
        { id: 'progress-row', label: '进度', for: 'agent', placement: ['row'] },
      ],
      { id: 's1' },
    ).map((item) => item.id),
    ['start'],
  )
})

test('search hits never show report even if placement is row', () => {
  assert.deepEqual(
    visibleRowActions(
      [
        { id: 'report', label: '汇报进度', placement: ['row', 'detail'], for: 'both' },
        { id: 'deliver', label: '派工', placement: ['row', 'detail'], for: 'both' },
      ],
      { id: 't1' },
    ).map((item) => item.id),
    ['deliver'],
  )
})

test('search hit actions use collection chrome.Actions when registered', () => {
  const src = readFileSync(resolve(import.meta.dirname, './shell-search.tsx'), 'utf8')
  assert.match(src, /getDatabaseUi\(\)\?\.chrome\(searchCollection\(hit\.kind\)\)\.Actions/)
  assert.match(src, /placedRowActions\(hit\.actions\)/)
  assert.match(src, /<Actions/)
  assert.doesNotMatch(src, /if \(next !== record\) setRecord\(next\)/)
  assert.match(src, /addEventListener\('fsdb:change'/)
})

test('previewHitRecord drops start/stop after uninstall', () => {
  const row = { id: 'p1', installed: true, running: true, enabled: true, sandbox: true }
  const next = previewHitRecord(row, { id: 'uninstall', label: '卸载', when: { installed: true } })
  assert.equal(next.installed, false)
  assert.equal(next.running, false)
  const start = { id: 'start', label: '运行', when: { installed: true, running: false } }
  const stop = { id: 'stop', label: '停止', when: { installed: true, running: true } }
  assert.deepEqual(
    visibleRowActions([start, stop, { id: 'pack', label: '打包', when: { sandbox: true } }], next).map((item) => item.id),
    ['pack'],
  )
})

test('⌘⇧F always opens global search; ⌘F skips the page editor', () => {
  assert.equal(isGlobalSearchHotkey({ key: 'f', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true }), true)
  assert.equal(isGlobalSearchHotkey({ key: 'F', metaKey: false, ctrlKey: true, altKey: false, shiftKey: true }, { inPageEditor: true }), true)
  assert.equal(isGlobalSearchHotkey({ key: 'f', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }), true)
  assert.equal(isGlobalSearchHotkey({ key: 'f', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, { inPageEditor: true }), false)
  assert.equal(isGlobalSearchHotkey({ key: 'f', metaKey: false, ctrlKey: false, altKey: false, shiftKey: true }), false)
})

test('opening a session on the left closes search and focuses the composer', () => {
  const src = readFileSync(resolve(import.meta.dirname, './shell-search.tsx'), 'utf8')
  assert.match(src, /onClose\(\)\s*if \(side === 'left' && hit\.kind === 'session'\) requestComposerFocus\(\)/)
  assert.doesNotMatch(src, /refocusSearchField/)
})
