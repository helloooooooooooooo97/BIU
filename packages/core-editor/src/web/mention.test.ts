import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { render } from '@testing-library/react'
import { Editor } from '@tiptap/core'
import { recordEditorExtensions } from './kit.ts'
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
  assert.deepEqual(decodeMentionId('tag/t-2'), { kind: 'tag', recordId: 't-2' })
  assert.equal(mentionHref('page/p1'), '/database/pages/record/p1')
  assert.equal(mentionHref('session/abc'), '/agents/abc')
  assert.deepEqual(mentionReveal('tag/f1'), { collection: '/tags', recordId: 'f1', unique: true })
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
  const mentionOnly = mentionSuggestionContent({ nodes: { mention: {} } }, { id: 'tag/t1', label: '标签甲' })
  assert.equal(mentionOnly[0]?.type, 'mention')
  assert.equal((mentionOnly[0] as { attrs: { id: string; label?: string } }).attrs.id, 'tag/t1')
  assert.equal((mentionOnly[0] as { attrs: { label?: string } }).attrs.label, undefined)
})

test('fetchMentionItems lists pages tags and sessions', async () => {
  const seen: string[] = []
  const orig = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    seen.push(url)
    const path = new URL(url, 'http://local.test').searchParams.get('path')
    const id = path === '/pages' ? 'p1' : path === '/tags' ? 'f1' : 's1'
    const title = path === '/pages' ? '首页' : path === '/tags' ? '标签' : '代理'
    return {
      ok: true,
      json: async () => ({ items: [{ id, title }] }),
    } as Response
  }) as typeof fetch
  try {
    const items = await fetchMentionItems('首')
    assert.equal(seen.length, 3)
    assert.ok(items.some((item) => item.id === 'page/p1' && item.label === '首页'))
    assert.ok(items.some((item) => item.id === 'tag/f1'))
    assert.ok(items.some((item) => item.id === 'session/s1'))
  } finally {
    globalThis.fetch = orig
  }
})

test('mention node roundtrips through markdown and opens inspector', () => {
  const editor = new Editor({
    extensions: recordEditorExtensions(),
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
  assert.match(md, /\[@ id="page\/p1"\]/)
  assert.doesNotMatch(md, /label=/)
  assert.match(PAGE_EDITOR_STYLE, /span\[data-type=mention\]\.biu-tag\{[^}]*height:var\(--biu-space-5\)/)
  assert.match(PAGE_EDITOR_STYLE, /span\[data-type=mention\]\.biu-tag\{[^}]*line-height:var\(--biu-space-5\)/)
  assert.doesNotMatch(PAGE_EDITOR_STYLE, /vertical-align:text-top/)
  editor.destroy()

  const loaded = new Editor({
    extensions: recordEditorExtensions(),
    content: md,
    contentType: 'markdown',
  })
  assert.match(loaded.getHTML(), /data-id="page\/p1"/)
  loaded.destroy()

  const legacy = new Editor({
    extensions: recordEditorExtensions(),
    content: '见 [@ id="page/p1" label="首页"]',
    contentType: 'markdown',
  })
  assert.match(legacy.getHTML(), /data-id="page\/p1"/)
  assert.doesNotMatch(legacy.getMarkdown(), /label=/)
  legacy.destroy()

  const seen: unknown[] = []
  const onReveal = (event: Event) => seen.push((event as CustomEvent).detail)
  window.addEventListener('biu:inspector-reveal', onReveal)
  assert.equal(openMention('tag/t9'), true)
  window.removeEventListener('biu:inspector-reveal', onReveal)
  assert.deepEqual(seen, [{ collection: '/tags', recordId: 't9', unique: true }])
})

test('mention list shows a kind icon on each hit', () => {
  const { container } = render(
    createElement(MentionList, {
      items: [
        { id: 'page/p1', label: '首页', kind: 'page', kindLabel: '页面' },
        { id: 'tag/f1', label: '标签', kind: 'tag', kindLabel: '标签' },
        { id: 'session/s1', label: '代理', kind: 'session', kindLabel: '代理' },
      ],
      command: () => undefined,
    }),
  )
  assert.equal(container.querySelectorAll('[data-pick-kind=page]').length, 1)
  assert.equal(container.querySelectorAll('[data-pick-kind=tag]').length, 1)
  assert.equal(container.querySelectorAll('[data-pick-kind=session]').length, 1)
})
