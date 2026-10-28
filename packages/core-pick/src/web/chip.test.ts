import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as lu from '@heroicons/react/16/solid'
import { tagTone } from '@biu/biu-ui'
import { pickInspectCard, pickKindIcon, pickKindTone } from './chip.tsx'

test('kind maps to distinct heroicons', () => {
  const needed = [
    'CircleStackIcon',
    'StopCircleIcon',
    'HashtagIcon',
    'Square3Stack3DIcon',
    'ClipboardDocumentCheckIcon',
    'CheckCircleIcon',
    'DocumentTextIcon',
    'ChatBubbleLeftIcon',
    'PuzzlePieceIcon',
    'TagIcon',
    'WrenchScrewdriverIcon',
    'DocumentIcon',
  ] as const
  for (const name of needed) {
    assert.ok(name in lu, `${name} missing`)
  }
  assert.equal(pickKindIcon('session'), lu.ChatBubbleLeftIcon)
  assert.equal(pickKindIcon('message'), lu.ChatBubbleLeftIcon)
  assert.equal(pickKindIcon('text'), lu.DocumentTextIcon)
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
  assert.match(src, /pick-chip-data/)
  assert.match(src, /pick-chip-data-quote/)
  assert.match(src, /pick-chip-data-code/)
  assert.match(src, /pick-chip-data-pill/)
})

test('inspect card leads with the quote, not raw field keys', () => {
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
  assert.equal(card.quote, '能做什么，不能做什么')
  assert.match(card.snippet, /<h1>能做什么<\/h1>/)
  assert.deepEqual(
    card.meta.map((item) => item.label),
    ['页面', '路径', '插件'],
  )
})
