import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { pageEditorExtensions } from './kit.ts'
import {
  decodeMentionId,
  encodeMentionId,
  fetchMentionItems,
  mentionHref,
  mentionReveal,
  openMention,
} from './mention.ts'

test('mention id encodes collection kind for jump targets', () => {
  assert.equal(encodeMentionId('page', 'p1'), 'page/p1')
  assert.deepEqual(decodeMentionId('task/t-2'), { kind: 'task', recordId: 't-2' })
  assert.equal(mentionHref('page/p1'), '/database/pages/record/p1')
  assert.equal(mentionHref('session/abc'), '/s/abc')
  assert.deepEqual(mentionReveal('facet/f1'), { collection: '/facets', recordId: 'f1', unique: true })
  assert.equal(decodeMentionId('nope'), null)
})

test('fetchMentionItems lists pages tasks facets and sessions', async () => {
  const seen: string[] = []
  const orig = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    seen.push(url)
    const path = new URL(url, 'http://local.test').searchParams.get('path')
    const id = path === '/pages' ? 'p1' : path === '/tasks' ? 't1' : path === '/facets' ? 'f1' : 's1'
    const title = path === '/pages' ? '首页' : path === '/tasks' ? '任务甲' : path === '/facets' ? '合集' : '会话'
    return {
      ok: true,
      json: async () => ({ items: [{ id, title }] }),
    } as Response
  }) as typeof fetch
  try {
    const items = await fetchMentionItems('首')
    assert.equal(seen.length, 4)
    assert.ok(items.some((item) => item.id === 'page/p1' && item.label === '首页'))
    assert.ok(items.some((item) => item.id === 'task/t1'))
    assert.ok(items.some((item) => item.id === 'facet/f1'))
    assert.ok(items.some((item) => item.id === 'session/s1'))
  } finally {
    globalThis.fetch = orig
  }
})

test('mention node roundtrips through markdown and opens inspector', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '',
    contentType: 'markdown',
  })
  editor.chain().focus().insertContent([
    {
      type: 'mention',
      attrs: { id: 'page/p1', label: '首页', mentionSuggestionChar: '@' },
    },
    { type: 'text', text: ' ' },
  ]).run()
  const html = editor.getHTML()
  const md = editor.getMarkdown()
  assert.match(html, /data-type="mention"/)
  assert.match(html, /data-id="page\/p1"/)
  assert.match(html, /href="\/database\/pages\/record\/p1"/)
  assert.match(md, /page\/p1/)
  editor.destroy()

  const loaded = new Editor({
    extensions: pageEditorExtensions(),
    content: md,
    contentType: 'markdown',
  })
  assert.match(loaded.getHTML(), /data-id="page\/p1"/)
  loaded.destroy()

  const seen: unknown[] = []
  const onReveal = (event: Event) => seen.push((event as CustomEvent).detail)
  window.addEventListener('biu:inspector-reveal', onReveal)
  assert.equal(openMention('task/t9'), true)
  window.removeEventListener('biu:inspector-reveal', onReveal)
  assert.deepEqual(seen, [{ collection: '/tasks', recordId: 't9', unique: true }])
})
