import { test } from 'vitest'
import assert from 'node:assert/strict'
import { applyNoticeClick, noticeClickPlan, noticeOpenHref } from './notice-open.ts'

test('notice click always opens the notice record, plus task or session', () => {
  assert.deepEqual(noticeClickPlan({ id: 'n1', href: '' }), {
    noticeId: 'n1',
    sessionHref: '',
    record: null,
  })
  assert.deepEqual(noticeClickPlan({ id: 'n2', href: '/s/abc' }), {
    noticeId: 'n2',
    sessionHref: '/s/abc',
    record: null,
  })
  assert.deepEqual(noticeClickPlan({ id: 'n3', href: '/database/tasks/record/t%201' }), {
    noticeId: 'n3',
    sessionHref: '',
    record: { collection: '/tasks', recordId: 't 1' },
  })
})

test('noticeOpenHref always has a page to open', () => {
  assert.equal(noticeOpenHref({ id: 'n1' }), '/database/notices/record/n1')
  assert.equal(noticeOpenHref({ id: 'n2', href: '/s/abc' }), '/s/abc')
  assert.equal(noticeOpenHref({ id: 'n3', href: '/database/tasks/record/t1' }), '/database/tasks/record/t1')
})

test('applyNoticeClick does not open notices in the inspector', () => {
  const seen: unknown[] = []
  const onReveal = (event: Event) => seen.push((event as CustomEvent).detail)
  window.addEventListener('biu:inspector-reveal', onReveal)
  const href = applyNoticeClick({ id: 'n9', href: '/database/tasks/record/t1' })
  const noticeOnly = applyNoticeClick({ id: 'n1', href: '' })
  window.removeEventListener('biu:inspector-reveal', onReveal)
  assert.equal(href, '/database/tasks/record/t1')
  assert.equal(noticeOnly, '/database/notices/record/n1')
  assert.deepEqual(seen, [{ collection: '/tasks', recordId: 't1', unique: true }])
})
