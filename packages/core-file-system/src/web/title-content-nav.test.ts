import { test } from 'vitest'
import assert from 'node:assert/strict'
import { shouldLeaveTitleForContent, shouldLeaveContentForTitle, focusRecordTitleNear } from './title-content-nav.ts'

test('title Enter and last-line ArrowDown leave for content', () => {
  assert.equal(shouldLeaveTitleForContent('Enter', false, 'hello', 5), true)
  assert.equal(shouldLeaveTitleForContent('Enter', true, 'hello', 5), false)
  assert.equal(shouldLeaveTitleForContent('ArrowDown', false, 'hello', 5), true)
  assert.equal(shouldLeaveTitleForContent('ArrowDown', false, 'a\nb', 1), false)
  assert.equal(shouldLeaveTitleForContent('ArrowDown', false, 'a\nb', 3), true)
  assert.equal(shouldLeaveTitleForContent('ArrowUp', false, 'hello', 0), false)
})

test('content start Backspace and ArrowUp leave for title', () => {
  const none = { shiftKey: false }
  assert.equal(shouldLeaveContentForTitle('Backspace', none, 0, true, 0), true)
  assert.equal(shouldLeaveContentForTitle('Delete', none, 0, true, 0), true)
  assert.equal(shouldLeaveContentForTitle('ArrowUp', none, 0, true, 0), true)
  assert.equal(shouldLeaveContentForTitle('Enter', none, 0, true, 0), false)
  assert.equal(shouldLeaveContentForTitle('Backspace', { shiftKey: true }, 0, true, 0), false)
  assert.equal(shouldLeaveContentForTitle('Backspace', none, 1, true, 0), false)
  assert.equal(shouldLeaveContentForTitle('Backspace', none, 0, true, 0, true), false)
  assert.equal(shouldLeaveContentForTitle('Delete', none, 0, true, 0, true), false)
  assert.equal(shouldLeaveContentForTitle('ArrowUp', none, 0, true, 0, true), true)
})

test('focusRecordTitleNear uses the title above properties, not another title on the page', () => {
  const decoy = document.createElement('textarea')
  decoy.className = 'fsdb-detail-title-input'
  decoy.value = 'wrong'
  document.body.appendChild(decoy)
  const main = document.createElement('div')
  main.className = 'fsdb-detail-main'
  const title = document.createElement('textarea')
  title.className = 'fsdb-detail-title-input'
  title.value = '页面标题'
  const editorHost = document.createElement('div')
  editorHost.className = 'page-editor'
  main.appendChild(title)
  main.appendChild(editorHost)
  document.body.appendChild(main)
  assert.equal(focusRecordTitleNear(editorHost), true)
  assert.equal(document.activeElement, title)
  assert.equal(title.selectionStart, '页面标题'.length)
  decoy.remove()
  main.remove()
})
