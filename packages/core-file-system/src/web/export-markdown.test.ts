import { test } from 'vitest'
import assert from 'node:assert/strict'
import { contentToMarkdown, markdownFileName, recordMatter, recordToMarkdown, zipMarkdownPack } from './export-markdown.ts'

test('yaml carries tags, times, and filled facet values', () => {
  const md = recordToMarkdown(
    {
      id: 'p1',
      title: '笔记',
      tags: ['meta'],
      createdAt: Date.parse('2026-01-02T03:04:05.000Z'),
      updatedAt: Date.parse('2026-01-03T03:04:05.000Z'),
      facet: { tags: ['films'], values: { films: { 导演: '查泽雷', empty: '' } } },
      notes: 'SECRET',
    },
    '# hello\n',
    'notes',
  )
  assert.match(md, /^---\n/)
  assert.match(md, /^tags:\n  - meta$/m)
  assert.match(md, /^createdAt: "2026-01-02T03:04:05.000Z"$/m)
  assert.match(md, /^updatedAt: "2026-01-03T03:04:05.000Z"$/m)
  assert.match(md, /导演: /)
  assert.doesNotMatch(md, /empty:/)
  assert.doesNotMatch(md, /SECRET/)
  assert.match(md, /\n---\n# hello\n/)
  assert.equal(contentToMarkdown({ body: '段落' }), '段落')
})

test('empty metadata is omitted', () => {
  const matter = recordMatter({ id: 'x', title: '空', tags: [], parentId: '', emoji: '' })
  assert.equal(matter.tags, undefined)
  assert.equal(matter.facet, undefined)
  assert.equal(matter.id, 'x')
})

test('zip pack has one markdown file per selected record', async () => {
  const blob = zipMarkdownPack([
    { name: 'a.md', text: recordToMarkdown({ id: 'a', title: 'A', tags: ['x'] }, 'one') },
    { name: 'b.md', text: recordToMarkdown({ id: 'b', title: 'B' }, 'two') },
  ])
  const buf = new Uint8Array(await blob.arrayBuffer())
  assert.equal(buf[0], 0x50)
  assert.equal(buf[1], 0x4b)
  const text = new TextDecoder().decode(buf)
  assert.match(text, /a\.md/)
  assert.match(text, /b\.md/)
  assert.equal(markdownFileName({ id: 'a' }), 'a.md')
})
