import { test } from 'vitest'
import assert from 'node:assert/strict'
import { contentToMarkdown, packMarkdownDocs, recordToMarkdown } from './export-markdown.ts'

test('markdown export prefixes yaml with tags then the content body', () => {
  const md = recordToMarkdown({ id: 'p1', title: '笔记', tags: ['meta', 'work'] }, '# hello\n')
  assert.equal(
    md,
    `---\nid: "p1"\ntitle: "笔记"\ntags:\n  - "meta"\n  - "work"\n---\n# hello\n`,
  )
  assert.equal(contentToMarkdown({ body: '段落' }), '段落')
})

test('pack joins selected docs and still lists empty tags', () => {
  const a = recordToMarkdown({ id: 'a', title: 'A', tags: [] }, 'one')
  const b = recordToMarkdown({ id: 'b', tags: ['x'] }, 'two')
  assert.match(a, /^---\n[\s\S]*tags: \[\]\n---\none$/)
  assert.equal(packMarkdownDocs([a, b]), `${a}\n\n${b}`)
})
