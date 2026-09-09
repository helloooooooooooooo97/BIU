import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { render } from '@testing-library/react'
import { Editor } from '@tiptap/core'
import { pageEditorExtensions } from './kit.ts'
import { PAGE_EDITOR_STYLE } from './style.ts'
import { MentionList } from './mention-list.tsx'
import {
  decodeMentionId,
  encodeMentionId,
  fetchMentionItems,
  mentionHref,
  mentionReveal,
  mentionSuggestionContent,
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

test('mention suggestion inserts pickChip when the schema has it', () => {
  const withPick = mentionSuggestionContent(
    { nodes: { pickChip: {}, mention: {} } },
    { id: 'page/p1', label: '首页' },
  )
  assert.equal(withPick[0]?.type, 'pickChip')
  assert.equal((withPick[0] as { attrs: { kind: string; id: string; label: string } }).attrs.kind, 'page')
  assert.equal((withPick[0] as { attrs: { kind: string; id: string; label: string } }).attrs.id, 'p1')
  assert.equal((withPick[0] as { attrs: { kind: string; id: string; label: string } }).attrs.label, '首页')
  const mentionOnly = mentionSuggestionContent({ nodes: { mention: {} } }, { id: 'task/t1', label: '任务甲' })
  assert.equal(mentionOnly[0]?.type, 'mention')
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
  assert.match(html, /<span[^>]*data-type="mention"/)
  assert.match(html, /data-id="page\/p1"/)
  assert.match(html, /class="[^"]*biu-tag[^"]*composer-tool-chip[^"]*is-pick/)
  assert.match(html, /data-kind="page"/)
  assert.match(html, /pick-chip-name/)
  assert.match(html, /--biu-tag/)
  assert.doesNotMatch(html, /@首页/)
  assert.doesNotMatch(html, /<a[^>]*data-type="mention"/)
  assert.match(md, /page\/p1/)
  assert.match(PAGE_EDITOR_STYLE, /span\[data-type=mention\]\.biu-tag\{[^}]*height:1\.7em/)
  assert.match(PAGE_EDITOR_STYLE, /span\[data-type=mention\]\.biu-tag\{[^}]*line-height:1\.7em/)
  assert.doesNotMatch(PAGE_EDITOR_STYLE, /vertical-align:text-top/)
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

test('mention list shows a kind icon on each hit', () => {
  const { container } = render(
    createElement(MentionList, {
      items: [
        { id: 'page/p1', label: '首页', kind: 'page', kindLabel: '页面' },
        { id: 'task/t1', label: '任务甲', kind: 'task', kindLabel: '任务' },
        { id: 'facet/f1', label: '合集', kind: 'facet', kindLabel: '合集' },
        { id: 'session/s1', label: '会话', kind: 'session', kindLabel: '会话' },
      ],
      command: () => undefined,
    }),
  )
  assert.equal(container.querySelectorAll('[data-pick-kind=page]').length, 1)
  assert.equal(container.querySelectorAll('[data-pick-kind=task]').length, 1)
  assert.equal(container.querySelectorAll('[data-pick-kind=facet]').length, 1)
  assert.equal(container.querySelectorAll('[data-pick-kind=session]').length, 1)
})
