import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as lu from '@heroicons/react/16/solid'
import { tagTone } from '@biu/biu-ui'
import { inspectPathTarget, pickInspectCard, pickKindIcon, pickKindTone, revealInspectPath } from './chip.tsx'

test('kind maps to distinct heroicons', () => {
  const needed = [
    'CircleStackIcon',
    'StopCircleIcon',
    'HashtagIcon',
    'Square3Stack3DIcon',
    'ClipboardDocumentCheckIcon',
    'CheckCircleIcon',
    'DocumentTextIcon',
    'Bars3BottomLeftIcon',
    'ChatBubbleLeftIcon',
    'CursorArrowRaysIcon',
    'PuzzlePieceIcon',
    'TagIcon',
    'WrenchScrewdriverIcon',
    'DocumentIcon',
    'AcademicCapIcon',
    'LinkIcon',
    'BellIcon',
    'UserGroupIcon',
    'RectangleGroupIcon',
    'ArrowTopRightOnSquareIcon',
  ] as const
  for (const name of needed) {
    assert.ok(name in lu, `${name} missing`)
  }
  assert.equal(pickKindIcon('session'), lu.CursorArrowRaysIcon)
  assert.equal(pickKindIcon('message'), lu.ChatBubbleLeftIcon)
  assert.equal(pickKindIcon('text'), lu.Bars3BottomLeftIcon)
  assert.equal(pickKindIcon('block'), lu.DocumentTextIcon)
  assert.equal(pickKindIcon('html'), lu.DocumentIcon)
  assert.equal(pickKindIcon('file'), lu.DocumentIcon)
  assert.notEqual(pickKindIcon('text'), pickKindIcon('session'))
  assert.equal(pickKindIcon('task'), lu.CheckCircleIcon)
  assert.equal(pickKindIcon('tasks'), lu.CheckCircleIcon)
  assert.equal(pickKindIcon('page'), lu.DocumentIcon)
  assert.notEqual(pickKindIcon('collection'), pickKindIcon('usage'))
  assert.equal(pickKindIcon('plugin'), lu.PuzzlePieceIcon)
  assert.equal(pickKindIcon('plugins'), lu.PuzzlePieceIcon)
  assert.equal(pickKindIcon('facet'), lu.TagIcon)
  assert.equal(pickKindIcon('facets'), lu.TagIcon)
  assert.equal(pickKindIcon('collection'), lu.TagIcon)
  assert.equal(pickKindIcon('collection', '/agents'), lu.CursorArrowRaysIcon)
  assert.equal(pickKindIcon('collection', '/tasks'), lu.CheckCircleIcon)
  assert.equal(pickKindIcon('collection', '/plugins'), lu.PuzzlePieceIcon)
  assert.equal(pickKindIcon('collection', '/pages'), lu.DocumentIcon)
  assert.equal(pickKindIcon('collection', '/skills'), lu.AcademicCapIcon)
  assert.equal(pickKindIcon('view', '/plugins::builtin-all:/plugins'), lu.PuzzlePieceIcon)
  assert.equal(pickKindIcon('unknown'), lu.TagIcon)
})

test('pick kind maps to the facet palette by string', () => {
  assert.equal(pickKindTone('session'), tagTone('session'))
  assert.equal(pickKindTone('task'), tagTone('task'))
  assert.equal(pickKindTone('tasks'), tagTone('task'))
  assert.notEqual(pickKindTone('session'), pickKindTone('task'))
})

test('pick chips can show the facet close mark', () => {
  const src = readFileSync(resolve(import.meta.dirname, './chip.tsx'), 'utf8')
  assert.match(src, /onRemove/)
  assert.match(src, /biu-tag-x/)
  assert.match(src, /TagChipCloseMark/)
  assert.match(src, /pick-chip-name/)
  assert.match(src, /pick-chip-host/)
  assert.match(src, /pick-chip-field/)
  assert.match(src, /pick-chip-lines/)
  assert.match(src, /HeadlessPopover/)
  assert.match(src, /onOpenChange=\{setOpen\}/)
  assert.match(src, /type="button"/)
  assert.match(src, /side="top"/)
  assert.match(src, /avoidCollisions=\{false\}/)
  assert.match(src, /container=\{typeof document === 'undefined' \? null : document\.body\}/)
  assert.match(src, /event\.stopPropagation\(\)/)
  assert.match(src, /z-index:300/)
  assert.match(src, /overlayZ\(300\)/)
  assert.match(src, /pick-chip-data/)
  assert.doesNotMatch(src, /pick-chip-data-quote/)
  assert.match(src, /pick-chip-data-fields/)
  assert.match(src, /pick-chip-data-head/)
  assert.match(src, /pick-chip-data-head\{[^}]*color-mix\(in srgb,var\(--biu-tag,var\(--biu-color-emphasis\)\) 22%,transparent\)/)
  assert.match(src, /pickKindTone\(pick\.kind\)/)
  assert.doesNotMatch(src, /pick-chip-data-mark/)
  assert.doesNotMatch(src, /box-shadow:var\(--biu-shadow-md\)/)
  assert.match(src, /box-shadow:none/)
  assert.match(src, /width:min\(360px/)
  assert.match(src, /pick-chip-data\{[^}]*background:var\(--biu-color-bg-subtle/)
  assert.doesNotMatch(src, /html\.dark \.pick-chip-data\{background:#202020\}/)
  assert.match(src, /pick-chip-data\{[^}]*border:0/)
  assert.match(src, /72px minmax\(0,1fr\)/)
  assert.match(src, /pick-chip-data-row\{[^}]*align-items:flex-start/)
  assert.match(src, /pick-chip-data-v\{display:flex;align-items:flex-start/)
  assert.match(src, /pick-chip-data-v\{[^}]*background:transparent/)
  assert.match(src, /pick-chip-data-v\{[^}]*border:0/)
  assert.doesNotMatch(src, /pick-chip-data-v\{[^}]*border:var\(--biu-stroke-width\)/)
  assert.match(src, /pick-chip-data-v-text\{[^}]*-webkit-line-clamp:2/)
  assert.doesNotMatch(src, /pick-chip-data-v\{[^}]*overflow:auto/)
  assert.match(src, /title=\{item\.value\}/)
  assert.doesNotMatch(src, /pick-chip-data-v\{[^}]*color-mix/)
  assert.match(src, /min-height:28px/)
  assert.match(src, /font-size:var\(--biu-font-size-4\)/)
  assert.match(src, /pick-chip-data-jump/)
  assert.match(src, /ArrowTopRightOnSquareIcon/)
})

test('inspect card lists every stored field without a quote preview', () => {
  const card = pickInspectCard({
    kind: 'sandbox',
    id: 'sandbox:0-x:0/0',
    label: '能做什么',
    route: '/p/p002',
    title: '能力边界',
    path: '/pages/p002',
    plugin: 'page-sandbox',
    selection: '能做什么，不能做什么',
    element: '<h1>能做什么</h1>',
  })
  assert.equal(card.kind, 'sandbox')
  assert.equal(card.title, '能做什么')
  assert.equal('quote' in card, false)
  assert.equal(card.fields.find((item) => item.key === 'selection')?.value, '能做什么，不能做什么')
  assert.deepEqual(
    card.fields.map((item) => item.key),
    ['kind', 'id', 'label', 'title', 'path', 'plugin', 'route', 'selection', 'element'],
  )
  assert.equal(card.fields.find((item) => item.key === 'path')?.value, '/pages/p002')
  assert.equal(card.fields.find((item) => item.key === 'path')?.jump, true)
  assert.equal(card.fields.find((item) => item.key === 'route')?.jump, false)
  assert.equal(card.fields.find((item) => item.key === 'element')?.value, '<h1>能做什么</h1>')
  assert.equal(card.fields.find((item) => item.key === 'id')?.label, 'ID')
  assert.equal(card.fields.find((item) => item.key === 'element')?.stack, false)
  assert.equal(card.fields.find((item) => item.key === 'id')?.stack, false)
  const wrapped = pickInspectCard({
    kind: 'sandbox',
    id: 'x',
    text: 'line one\nline two',
    route: '/s/655414355-47600-4f3dd-a9338-512fa6e34c26-this-is-long-but-one-line',
  })
  assert.equal(wrapped.fields.find((item) => item.key === 'text')?.stack, true)
  assert.equal(wrapped.fields.find((item) => item.key === 'route')?.stack, false)
})

test('path jump opens the record in the inspector', () => {
  assert.deepEqual(inspectPathTarget('/pages/p147'), {
    collection: '/pages',
    recordId: 'p147',
    unique: true,
  })
  assert.equal(inspectPathTarget('/pages'), null)
  assert.equal(inspectPathTarget(''), null)
  const seen: unknown[] = []
  const opened: string[] = []
  const onReveal = (event: Event) => seen.push((event as CustomEvent).detail)
  const onOpen = () => opened.push('open')
  window.addEventListener('biu:inspector-reveal', onReveal)
  window.addEventListener('biu:inspector-open', onOpen)
  assert.deepEqual(revealInspectPath('/pages/p147'), {
    collection: '/pages',
    recordId: 'p147',
    unique: true,
  })
  window.removeEventListener('biu:inspector-reveal', onReveal)
  window.removeEventListener('biu:inspector-open', onOpen)
  assert.deepEqual(opened, ['open'])
  assert.deepEqual(seen, [{ collection: '/pages', recordId: 'p147', unique: true }])
  const src = readFileSync(resolve(import.meta.dirname, './chip.tsx'), 'utf8')
  assert.match(src, /data-testid="pick-chip-path-jump"/)
  assert.match(src, /onPointerDown/)
  assert.match(src, /revealInspectPath\(item\.value\)/)
  assert.match(src, /在检查器打开/)
})
