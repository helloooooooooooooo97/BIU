import { test } from 'vitest'
import assert from 'node:assert/strict'
import { applyNoticeClick, markAllNoticesRead, noticeClickPlan, noticeOpenHref } from './notice-open.ts'

test('notice click always opens the notice record, plus task or session', () => {
  assert.deepEqual(noticeClickPlan({ id: 'n1', href: '' }), {
    noticeId: 'n1',
    sessionHref: '',
    record: null,
  })
  assert.deepEqual(noticeClickPlan({ id: 'n2', href: '/agents/abc' }), {
    noticeId: 'n2',
    sessionHref: '/agents/abc',
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
  assert.equal(noticeOpenHref({ id: 'n2', href: '/agents/abc' }), '/agents/abc')
  assert.equal(noticeOpenHref({ id: 'n4', href: '/channels/ch-1?msg=m1' }), '/channels/ch-1?msg=m1')
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

test('markAllNoticesRead uses /api/db/notices/read-all when available', async () => {
  const calls: Array<{ url: string; body?: string }> = []
  const ok = await markAllNoticesRead(['n1', 'n2'], async (url, init) => {
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined })
    return { ok: true, status: 200 }
  })
  assert.equal(ok, true)
  assert.deepEqual(calls, [{ url: '/api/db/notices/read-all', body: undefined }])
})

test('markAllNoticesRead falls back to /api/db/update when /api/db/notices/read-all returns 404', async () => {
  const calls: Array<{ url: string; body?: string }> = []
  const ok = await markAllNoticesRead(['n1', 'n2', 'n1'], async (url, init) => {
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined })
    if (url === '/api/db/notices/read-all') return { ok: false, status: 404 }
    return { ok: true, status: 200 }
  })
  assert.equal(ok, true)
  assert.deepEqual(calls, [
    { url: '/api/db/notices/read-all', body: undefined },
    { url: '/api/db/update', body: JSON.stringify({ path: '/notices/n1', content: { read: true } }) },
    { url: '/api/db/update', body: JSON.stringify({ path: '/notices/n2', content: { read: true } }) },
  ])
})
