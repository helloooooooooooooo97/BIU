import { test } from 'vitest'
import assert from 'node:assert/strict'
import { noticeFiles, parseAccessRequestNotice } from './chrome.tsx'

test('notice detail cards read the content list, not the summary', () => {
  assert.deepEqual(
    noticeFiles([
      { name: 'cover.png', href: '/api/db/file/cover.png', image: true },
      { name: 'notes.pdf', href: '/api/db/file/notes.pdf', image: false },
      { name: '', href: '/api/db/file/skip' },
    ]),
    [
      { name: 'cover.png', href: '/api/db/file/cover.png', image: true },
      { name: 'notes.pdf', href: '/api/db/file/notes.pdf', image: false },
    ],
  )
  assert.deepEqual(noticeFiles('页面和记录都不再用到下面这些文件。'), [])
})

test('parseAccessRequestNotice parses structured approval payloads and ignores unrelated values', () => {
  assert.equal(parseAccessRequestNotice(null), null)
  assert.equal(parseAccessRequestNotice([]), null)
  assert.equal(parseAccessRequestNotice({ type: 'other' }), null)
  const parsed = parseAccessRequestNotice({
    type: 'access-request',
    requestId: 'areq_1',
    collection: '/pages',
    recordId: 'doc-1',
    recordTitle: '设计文档',
    requesterId: 'acc_2',
    requesterName: 'Bob',
    requesterEmail: 'bob@example.com',
    requestedRole: 'editor',
    note: '需要补充接口',
    status: 'pending',
  })
  assert.deepEqual(parsed, {
    type: 'access-request',
    requestId: 'areq_1',
    collection: '/pages',
    recordId: 'doc-1',
    recordTitle: '设计文档',
    requesterId: 'acc_2',
    requesterName: 'Bob',
    requesterEmail: 'bob@example.com',
    requesterMemberKind: 'member',
    requestedRole: 'editor',
    note: '需要补充接口',
    status: 'pending',
  })
})
