import { test } from 'vitest'
import assert from 'node:assert/strict'
import { applyNoticeClick, noticeClickPlan } from './notice-open.ts'

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

test('applyNoticeClick reveals /notices then the linked record', () => {
  const seen: unknown[] = []
  const onReveal = (event: Event) => seen.push((event as CustomEvent).detail)
  window.addEventListener('biu:inspector-reveal', onReveal)
  const href = applyNoticeClick({ id: 'n9', href: '/database/tasks/record/t1' })
  window.removeEventListener('biu:inspector-reveal', onReveal)
  assert.equal(href, '')
  assert.deepEqual(seen, [
    { collection: '/notices', recordId: 'n9', unique: true },
    { collection: '/tasks', recordId: 't1', unique: true },
  ])
})
