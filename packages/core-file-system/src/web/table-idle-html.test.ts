import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  escapeTableHtml,
  idleBoolInnerHtml,
  idleEmptyUsageInnerHtml,
  idleActionsInnerHtml,
  idlePersonInnerHtml,
  idleSelectInnerHtml,
  idleTableRowHtml,
  idleTagChipsInnerHtml,
  IDLE_CELL_TEXT_MAX,
  idleClipText,
  idleTextInnerHtml,
  idleTitleInnerHtml,
  tableHtmlAttr,
} from './table-idle-html.ts'

test('idle table html escapes cell text and attributes', () => {
  assert.equal(escapeTableHtml('a <b> & "c"'), 'a &lt;b&gt; &amp; &quot;c&quot;')
  assert.equal(tableHtmlAttr('title', 'x<"y'), ' title="x&lt;&quot;y"')
  assert.equal(tableHtmlAttr('hidden', false), '')
})

test('idle title uses the CSS glyph and keeps the label as text', () => {
  const html = idleTitleInnerHtml('全部任务', 'check')
  assert.match(html, /class="fsdb-title-host"/)
  assert.match(html, /data-icon="check"/)
  assert.match(html, /class="fsdb-title-text">全部任务</)
  assert.doesNotMatch(html, /<svg/)
})

test('idle title prefers a record emoji over the table glyph', () => {
  const html = idleTitleInnerHtml('Hello <x>', 'chat', '📌')
  assert.match(html, /class="fsdb-record-emoji">📌</)
  assert.match(html, /class="fsdb-title-text">Hello &lt;x&gt;</)
  assert.doesNotMatch(html, /data-icon/)
})

test('idle chips, person, and actions paint without waiting for hover', () => {
  const chips = idleTagChipsInnerHtml([{ id: 'open', label: '进行中' }, { id: 'done', label: '完成' }])
  assert.match(chips, /class="biu-tags"/)
  assert.match(chips, /class="biu-tag"/)
  assert.match(chips, /进行中/)
  const person = idlePersonInnerHtml({ kind: 'user', name: 'Ada' })
  assert.match(person, /fsdb-person-list/)
  assert.match(person, /fsdb-person-avatar/)
  assert.match(person, />Ada</)
  const actions = idleActionsInnerHtml([{ label: '打开' }, { label: '删除', danger: true }])
  assert.match(actions, /tasks-row-actions/)
  assert.match(actions, /fsdb-action-tag is-danger/)
  assert.match(actions, />打开</)
  assert.equal(idleActionsInnerHtml([]), '')
})

test('idle cells match the text / bool / usage / facet first paint', () => {
  assert.match(idleBoolInnerHtml(true), /fsdb-boolbox is-on/)
  assert.match(idleBoolInnerHtml(false), /title="否"/)
  assert.doesNotMatch(idleBoolInnerHtml(true), /<svg/)
  assert.match(idleEmptyUsageInnerHtml(), /traj-usage-empty/)
  assert.match(idleSelectInnerHtml('进行中、完成'), /fsdb-select-text/)
  assert.equal(idleTextInnerHtml(''), '')
  assert.equal(idleTextInnerHtml('私人'), '私人')
  assert.equal(idleClipText('x'.repeat(IDLE_CELL_TEXT_MAX + 12)).length, IDLE_CELL_TEXT_MAX)
  assert.equal(idleTextInnerHtml('y'.repeat(IDLE_CELL_TEXT_MAX + 12)).length, IDLE_CELL_TEXT_MAX)
  assert.equal(idleTitleInnerHtml('z'.repeat(IDLE_CELL_TEXT_MAX + 12), 'check').includes('z'.repeat(IDLE_CELL_TEXT_MAX + 1)), false)
})

test('idle row html is one td per column with data-col-key', () => {
  const html = idleTableRowHtml([
    { key: 'title', inner: idleTitleInnerHtml('任务', 'check'), className: 'is-pin-col' },
    { key: 'shareScope', inner: idleTextInnerHtml('私人'), style: { width: '80px', minWidth: '80px', maxWidth: '80px' } },
    { key: 'actions', inner: idleActionsInnerHtml([{ label: '打开' }]) },
  ])
  assert.match(html, /data-col-key="title"/)
  assert.match(html, /class="is-pin-col"/)
  assert.match(html, /data-col-key="shareScope"/)
  assert.match(html, /style="width:80px;min-width:80px;max-width:80px"/)
  assert.match(html, /data-col-key="actions"/)
  assert.equal([...html.matchAll(/<td/g)].length, 3)
})

test('idle pad cells omit data-col-key', () => {
  const html = idleTableRowHtml([
    { key: 'title', inner: '任务' },
    { key: '', inner: '', className: 'fsdb-col-pad', style: { width: '240px', minWidth: '240px', maxWidth: '240px' } },
  ])
  assert.match(html, /class="fsdb-col-pad"/)
  assert.doesNotMatch(html, /data-col-key=""/)
  assert.equal([...html.matchAll(/data-col-key=/g)].length, 1)
})
