/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Editor } from '@tiptap/core'
import { ChannelComposer } from './channel-composer.tsx'
import {
  channelComposerExtensions,
  clearChannelDraft,
  insertChannelMentionAtRange,
  insertPageMentionAtRange,
  readChannelDraft,
  readChannelMentionAtCursor,
  serializeChannelComposer,
  writeChannelDraft,
} from './channel-composer-tiptap.ts'
import { resetChannelStore } from './channel-store.ts'
import type { ChannelMemberView } from '../shared/channel-types.ts'

const MEMBERS: ChannelMemberView[] = [
  {
    channelId: 'ch-1',
    memberType: 'account',
    memberId: 'acc-alice',
    role: 'owner',
    addedBy: 'acc-alice',
    addedAt: 1,
    name: 'Alice',
    isOwn: true,
  },
  {
    channelId: 'ch-1',
    memberType: 'agent',
    memberId: 'ag-1',
    role: 'member',
    addedBy: 'acc-alice',
    addedAt: 1,
    name: '赤板灵',
    ownerAccountId: 'acc-alice',
    ownerName: 'Alice',
    isOwn: true,
  },
]

beforeEach(() => {
  localStorage.clear()
  resetChannelStore()
  const rect = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) })
  if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
    Range.prototype.getClientRects = (() => [rect()]) as unknown as Range['getClientRects']
    Range.prototype.getBoundingClientRect = rect as unknown as Range['getBoundingClientRect']
  }
  if (typeof Element !== 'undefined' && !Element.prototype.getClientRects) {
    Element.prototype.getClientRects = (() => [rect()]) as unknown as Element['getClientRects']
  }
  if (typeof Text !== 'undefined' && !(Text.prototype as unknown as { getClientRects?: unknown }).getClientRects) {
    ;(Text.prototype as unknown as { getClientRects: unknown }).getClientRects = () => [rect()]
  }
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('readChannelMentionAtCursor & serializeChannelComposer handle multiple inline chips without offset drift', () => {
  const editor = new Editor({
    extensions: channelComposerExtensions(() => ''),
    content: '<p>@</p>',
  })
  try {
    editor.commands.setTextSelection(2)
    const first = readChannelMentionAtCursor(editor)
    assert.deepEqual(first, { query: '', from: 1, to: 2 })

    insertChannelMentionAtRange(editor, first!, { kind: 'agent', id: 'ag-1', label: '赤板灵' })
    editor.commands.insertContent('看一下 @设计')

    const second = readChannelMentionAtCursor(editor)
    assert.ok(second)
    assert.equal(second!.query, '设计')

    const ref = insertPageMentionAtRange(editor, second!, { id: 'page/pg-1', label: '架构设计文档' })
    assert.ok(ref)

    const packed = serializeChannelComposer(editor)
    assert.equal(packed.hasChips, true)
    assert.deepEqual(packed.mentions, [{ kind: 'agent', id: 'ag-1', label: '赤板灵' }])
    assert.equal(packed.refs.length, 1)
    assert.equal(packed.refs[0]?.id, 'pg-1')
    assert.equal(packed.refs[0]?.kind, 'page')
    assert.ok(packed.text.startsWith('@赤板灵 看一下 '))
    assert.ok(packed.text.includes('<pick'))

    // 删除 @赤板灵 原子节点后，mentions 自动归零，不会残留失效数据
    editor.chain().deleteRange({ from: 1, to: 2 }).run()
    const afterDelete = serializeChannelComposer(editor)
    assert.deepEqual(afterDelete.mentions, [])
    assert.equal(afterDelete.text.includes('@赤板灵'), false)
  } finally {
    editor.destroy()
  }
})

test('readChannelMentionAtCursor does not trigger inside email addresses', () => {
  const editor = new Editor({
    extensions: channelComposerExtensions(() => ''),
    content: '<p>lulu@qq</p>',
  })
  try {
    editor.commands.setTextSelection(8)
    assert.equal(readChannelMentionAtCursor(editor), null)
  } finally {
    editor.destroy()
  }
})

test('channel draft storage persists and clears per channelId', () => {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'channelMention', attrs: { kind: 'agent', id: 'ag-1', label: '赤板灵' } },
          { type: 'text', text: ' 帮我看一下' },
        ],
      },
    ],
  }
  writeChannelDraft('ch-a', doc)
  assert.deepEqual(readChannelDraft('ch-a'), doc)
  assert.equal(readChannelDraft('ch-b'), null)
  clearChannelDraft('ch-a')
  assert.equal(readChannelDraft('ch-a'), null)
})

test('ChannelComposer inserts atomic @mention chip, fetches page mentions in unified popup, and sends structured mentions', async () => {
  let sentBody: Record<string, unknown> | null = null
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname === '/api/db/list') {
      const path = url.searchParams.get('path')
      if (path === '/pages') {
        return new Response(JSON.stringify({ items: [{ id: 'pg-99', title: '发布清单' }] }), { status: 200 })
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    }
    if (url.pathname === '/api/channels/ch-1/messages' && init?.method === 'POST') {
      sentBody = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          message: {
            id: 'm-new',
            channelId: 'ch-1',
            seq: 1,
            senderType: 'account',
            senderId: 'acc-alice',
            senderName: 'Alice',
            replyToId: '',
            text: String(sentBody.text ?? ''),
            mentions: sentBody.mentions ?? [],
            traceId: '',
            ephemeralTo: '',
            createdAt: Date.now(),
          },
          triggeredRunIds: [],
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const view = render(
    <MemoryRouter initialEntries={['/channels/ch-1']}>
      <ChannelComposer
        channelId="ch-1"
        isDm={false}
        members={MEMBERS}
        resolveAvatar={() => undefined}
        replyTo={null}
        onClearReplyTo={() => {}}
        onError={() => {}}
      />
    </MemoryRouter>,
  )

  await waitFor(() => {
    assert.equal(Boolean(view.queryByTestId('channel-composer-input')), true)
  })

  // 打开统一 @ 弹层：同时展示成员/Agent 与页面引用
  fireEvent.click(view.getByTestId('channel-mention-btn'))
  await waitFor(() => {
    const menu = view.queryByTestId('channel-mention-menu')
    assert.equal(Boolean(menu), true)
    assert.equal(Boolean(menu?.textContent?.includes('@赤板灵')), true)
    assert.equal(Boolean(menu?.textContent?.includes('发布清单')), true)
  })

  // 选中 @赤板灵 → 插入原子芯片
  const menu = view.getByTestId('channel-mention-menu')
  const agentOpt = [...menu.querySelectorAll('[role="option"]')].find((el) =>
    el.textContent?.includes('@赤板灵'),
  )
  assert.ok(agentOpt)
  fireEvent.mouseDown(agentOpt!)

  await waitFor(() => {
    const chip = view.queryByTestId('channel-mention-chip')
    assert.equal(Boolean(chip), true)
    assert.equal(chip?.getAttribute('data-mention-id'), 'ag-1')
  })

  // 提交发送，验证 mentions 与 text 一致
  const sendBtn = view.getByTestId('channel-composer-send') as HTMLButtonElement
  await waitFor(() => {
    assert.equal(sendBtn.disabled, false)
  })
  fireEvent.click(sendBtn)

  await waitFor(() => {
    assert.equal(Boolean(sentBody), true)
    assert.equal(sentBody?.text, '@赤板灵')
    assert.deepEqual(sentBody?.mentions, [{ kind: 'agent', id: 'ag-1', label: '赤板灵' }])
  })
})

test('ChannelComposer isolates drafts across channels and renders image uploads via ImageThumbs', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname.endsWith('/uploads') && init?.method === 'POST') {
      return new Response(
        JSON.stringify({
          attachment: {
            id: 'img-1.png',
            name: 'shot.png',
            mime: 'image/png',
            size: 128,
            url: '/api/channels/ch-1/uploads/img-1.png',
            kind: 'image',
          },
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  // 预置两个频道的独立草稿
  writeChannelDraft('ch-1', {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '一号群草稿' }] }],
  })
  writeChannelDraft('ch-2', {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '二号群草稿' }] }],
  })

  const view = render(
    <MemoryRouter initialEntries={['/channels/ch-1']}>
      <ChannelComposer
        channelId="ch-1"
        isDm={false}
        members={MEMBERS}
        resolveAvatar={() => undefined}
        replyTo={null}
        onClearReplyTo={() => {}}
        onError={() => {}}
      />
    </MemoryRouter>,
  )

  await waitFor(() => {
    assert.equal(view.queryByTestId('channel-composer-input')?.textContent?.includes('一号群草稿'), true)
  })

  // 上传图片 → 使用与 Agent 输入框一致的 ImageThumbs 预览
  const fileInput = view.getByTestId('channel-file-input') as HTMLInputElement
  const imgFile = new File([new Uint8Array([1, 2, 3, 4])], 'shot.png', { type: 'image/png' })
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [imgFile] } })
  })
  await waitFor(() => {
    assert.equal(Boolean(view.queryByTestId('composer-image-thumbs')), true)
  })

  // 切换到 ch-2 → 自动恢复二号群草稿，不串用一号群内容或图片
  view.rerender(
    <MemoryRouter initialEntries={['/channels/ch-2']}>
      <ChannelComposer
        channelId="ch-2"
        isDm={false}
        members={MEMBERS}
        resolveAvatar={() => undefined}
        replyTo={null}
        onClearReplyTo={() => {}}
        onError={() => {}}
      />
    </MemoryRouter>,
  )

  await waitFor(() => {
    assert.equal(view.queryByTestId('channel-composer-input')?.textContent?.includes('二号群草稿'), true)
    assert.equal(Boolean(view.queryByTestId('composer-image-thumbs')), false)
  })
})

test('ChannelComposer collapses long paste into a PickChip and deletes last attachment on empty Backspace', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname.endsWith('/uploads') && init?.method === 'POST') {
      return new Response(
        JSON.stringify({
          attachment: {
            id: 'doc-1.pdf',
            name: 'spec.pdf',
            mime: 'application/pdf',
            size: 512,
            url: '/api/channels/ch-1/uploads/doc-1.pdf',
            kind: 'file',
          },
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const view = render(
    <MemoryRouter initialEntries={['/channels/ch-1']}>
      <ChannelComposer
        channelId="ch-1"
        isDm={false}
        members={MEMBERS}
        resolveAvatar={() => undefined}
        replyTo={null}
        onClearReplyTo={() => {}}
        onError={() => {}}
      />
    </MemoryRouter>,
  )

  const input = await waitFor(() => view.getByTestId('channel-composer-input'))

  // 1. 上传非图片文件 → 渲染文件 chip，空框 Backspace 移除最后一个附件
  const fileInput = view.getByTestId('channel-file-input') as HTMLInputElement
  const pdfFile = new File([new Uint8Array([1, 2, 3])], 'spec.pdf', { type: 'application/pdf' })
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [pdfFile] } })
  })
  await waitFor(() => {
    assert.equal(Boolean(view.queryByTestId('composer-attachment-doc-1.pdf')), true)
  })
  fireEvent.keyDown(input, { key: 'Backspace' })
  await waitFor(() => {
    assert.equal(Boolean(view.queryByTestId('composer-attachment-doc-1.pdf')), false)
  })

  // 2. 粘贴 >= 160 字的长文本 → 自动折成 PickChip 芯片
  const longText = '这是一段超过一百六十个字的长日志内容，用于验证群聊输入框与 Agent 输入框一致的长粘贴自动折叠成文本芯片能力。'.repeat(5)
  fireEvent.paste(input, {
    clipboardData: {
      items: [],
      files: [],
      getData: (type: string) => (type === 'text/plain' ? longText : ''),
    },
  })
  await waitFor(() => {
    assert.equal(Boolean(view.container.querySelector('[data-pick-chip]')), true)
  })
})

test('ChannelComposer previews pasted image via local blob URL and revokes it on remove', async () => {
  const createdUrls: string[] = []
  const revokedUrls: string[] = []
  const origCreate = URL.createObjectURL
  const origRevoke = URL.revokeObjectURL
  URL.createObjectURL = vi.fn(() => {
    const u = `blob:test-preview-${createdUrls.length + 1}`
    createdUrls.push(u)
    return u
  })
  URL.revokeObjectURL = vi.fn((u: string) => {
    revokedUrls.push(u)
  })

  try {
    let uploadedName = ''
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://test.local')
      if (url.pathname.endsWith('/uploads') && init?.method === 'POST') {
        uploadedName = url.searchParams.get('name') ?? ''
        return new Response(
          JSON.stringify({
            attachment: {
              id: 'pasted-1.png',
              name: uploadedName || 'image.png',
              mime: 'image/png',
              size: 16,
              url: '/api/channels/ch-1/uploads/pasted-1.png',
              kind: 'image',
            },
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const view = render(
      <MemoryRouter initialEntries={['/channels/ch-1']}>
        <ChannelComposer
          channelId="ch-1"
          isDm={false}
          members={MEMBERS}
          resolveAvatar={() => undefined}
          replyTo={null}
          onClearReplyTo={() => {}}
          onError={() => {}}
        />
      </MemoryRouter>,
    )

    const input = await waitFor(() => view.getByTestId('channel-composer-input'))
    const clipFile = new File([new Uint8Array([137, 80, 78, 71])], '', { type: 'image/png' })
    await act(async () => {
      fireEvent.paste(input, {
        clipboardData: {
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => clipFile }],
          files: [clipFile],
          getData: () => '',
        },
      })
    })

    await waitFor(() => {
      const thumbImg = view.container.querySelector('[data-testid="composer-image-thumbs"] img')
      assert.equal(thumbImg?.getAttribute('src'), 'blob:test-preview-1')
    })
    assert.equal(uploadedName, 'image.png')

    const removeBtn = view.container.querySelector('.composer-image-remove') as HTMLButtonElement
    assert.ok(removeBtn)
    fireEvent.click(removeBtn)
    await waitFor(() => {
      assert.equal(Boolean(view.queryByTestId('composer-image-thumbs')), false)
    })
    assert.deepEqual(revokedUrls, ['blob:test-preview-1'])
  } finally {
    URL.createObjectURL = origCreate
    URL.revokeObjectURL = origRevoke
  }
})

