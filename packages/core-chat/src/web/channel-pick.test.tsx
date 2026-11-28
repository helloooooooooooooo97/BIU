/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  canonicalPickKind,
  chipCaption,
  collectionPickKind,
  pickKindIcon,
  resolvePickAtPoint,
  resolvePickFromNode,
  resolvePicksInRect,
} from '@biu/core-pick/web'
import { resetChannelStore } from './channel-store.ts'
import { ChannelSidebarSections } from './channel-sidebar.tsx'
import { ChannelStage } from './channel-view.tsx'
import { ChannelFloatingSidebar } from './channel-floating-sidebar.tsx'

const originalFetch = globalThis.fetch

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function mockBox(el: Element, left: number, top: number, width: number, height: number) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }),
  })
}

beforeEach(() => {
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
  resetChannelStore()
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('channel pick support', () => {
  it('maps channel and thread kinds to canonical icons and collection kinds', () => {
    assert.equal(canonicalPickKind('channels'), 'channel')
    assert.equal(canonicalPickKind('threads'), 'thread')
    assert.equal(collectionPickKind('/channels/ch-1'), 'channel')
    assert.ok(pickKindIcon('channel'))
    assert.ok(pickKindIcon('thread'))
    assert.notEqual(pickKindIcon('channel'), pickKindIcon('thread'))
  })

  it('picks sidebar channels and expanded sub-threads in marquee while ignoring collapsed sub-threads', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost')
      if (url.pathname === '/api/channels') {
        return jsonResponse({
          channels: [
            {
              id: 'dm-lulu',
              kind: 'dm',
              name: 'lulu',
              peerAccountId: 'acc-lulu',
              accessMode: 'private',
              createdAt: 1000,
              updatedAt: 2000,
              lastMessageAt: 2000,
              memberCount: 2,
              unreadCount: 0,
              mentionCount: 0,
            },
            {
              id: 'ch-recent',
              kind: 'group',
              name: '最近的消息',
              accessMode: 'private',
              createdAt: 1000,
              updatedAt: 2500,
              lastMessageAt: 2500,
              memberCount: 3,
              unreadCount: 0,
              mentionCount: 0,
              threads: [
                { rootId: 'm-t1', title: '风险主题', replyCount: 2, lastReplyAt: 2400 },
                { rootId: 'm-t2', title: '我们不知道的事', replyCount: 3, lastReplyAt: 2450 },
              ],
            },
            {
              id: 'ch-folded',
              kind: 'group',
              name: '折叠的频道',
              accessMode: 'private',
              createdAt: 1000,
              updatedAt: 2100,
              lastMessageAt: 2100,
              memberCount: 2,
              unreadCount: 0,
              mentionCount: 0,
              threads: [{ rootId: 'm-hidden', title: '未展开的子话题', replyCount: 1, lastReplyAt: 2050 }],
            },
          ],
        })
      }
      if (url.pathname === '/api/account/workspace-profile') return jsonResponse({ accountId: 'acc-me' })
      if (url.pathname === '/api/account/me') return jsonResponse({ id: 'acc-me', name: '97' })
      if (url.pathname === '/api/db/list') return jsonResponse({ items: [] })
      return jsonResponse({})
    }) as typeof fetch

    const view = render(
      <MemoryRouter initialEntries={['/channels/ch-recent?thread=m-t1']}>
        <div className="app-side-bar">
          <ChannelSidebarSections routeChannelId="ch-recent" />
        </div>
      </MemoryRouter>,
    )

    await waitFor(() => {
      assert.ok(view.container.querySelector('[data-biu-kind="channel"][data-biu-id="ch-recent"]'))
      assert.ok(view.container.querySelector('[data-biu-kind="thread"][data-biu-id="ch-recent:m-t1"]'))
    })

    const rows = [...view.container.querySelectorAll('[data-biu-kind][data-biu-id]')]
    rows.forEach((row, index) => mockBox(row, 10, 10 + index * 32, 220, 28))

    const hits = resolvePicksInRect({ left: 0, top: 0, width: 260, height: 300 }, '/channels/ch-recent', view.container)
    const keys = hits.map((h) => `${h.ref.kind}:${h.ref.id}`)
    assert.deepEqual(keys, [
      'channel:dm-lulu',
      'channel:ch-recent',
      'thread:ch-recent:m-t1',
      'thread:ch-recent:m-t2',
      'channel:ch-folded',
    ])

    const recentHit = hits.find((h) => h.ref.id === 'ch-recent')!
    assert.equal(recentHit.ref.path, '/channels/ch-recent')
    assert.equal(chipCaption(recentHit.ref).name, '最近的消息')

    const threadHit = hits.find((h) => h.ref.id === 'ch-recent:m-t1')!
    assert.equal(threadHit.ref.path, '/channels/ch-recent')
    assert.equal(chipCaption(threadHit.ref).name, '风险主题')
  })

  it('picks channel timeline messages and agent replies with channel path and text preview', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost')
      if (url.pathname === '/api/channels/ch-msg') {
        return jsonResponse({
          channel: {
            id: 'ch-msg',
            kind: 'group',
            name: '产品讨论',
            accessMode: 'workspace',
            createdAt: 1000,
            updatedAt: 2000,
            memberCount: 2,
          },
          members: [
            { memberType: 'account', memberId: 'acc-1', name: 'lulu', role: 'owner' },
            { memberType: 'agent', memberId: 'ag-1', name: '墨方宁', role: 'member' },
          ],
          messages: [
            {
              id: 'msg-human',
              channelId: 'ch-msg',
              seq: 1,
              senderType: 'account',
              senderId: 'acc-1',
              senderName: 'lulu',
              text: '下午三点同步发布清单',
              createdAt: 1500,
            },
            {
              id: 'msg-agent',
              channelId: 'ch-msg',
              seq: 2,
              senderType: 'agent',
              senderId: 'ag-1',
              senderName: '墨方宁',
              text: '收到，我先整理当前阻塞项。',
              createdAt: 1600,
            },
          ],
          hasMoreMessages: false,
          activities: [],
          canManageMembers: true,
        })
      }
      if (url.pathname === '/api/channels/ch-msg/pins') return jsonResponse({ messages: [] })
      if (url.pathname === '/api/channels/saved') return jsonResponse({ items: [] })
      if (url.pathname === '/api/account/workspace-profile') return jsonResponse({ accountId: 'acc-me' })
      if (url.pathname === '/api/account/me') return jsonResponse({ id: 'acc-me', name: '97' })
      if (url.pathname === '/api/db/list') return jsonResponse({ items: [] })
      return jsonResponse({})
    }) as typeof fetch

    const view = render(
      <MemoryRouter initialEntries={['/channels/ch-msg']}>
        <ChannelStage channelId="ch-msg" />
      </MemoryRouter>,
    )

    await waitFor(() => {
      assert.ok(view.container.querySelector('[data-msg-id="msg-human"]'))
      assert.ok(view.container.querySelector('[data-msg-id="msg-agent"]'))
    })

    const humanCard = view.container.querySelector('[data-msg-id="msg-human"]')!
    const agentCard = view.container.querySelector('[data-msg-id="msg-agent"]')!

    const humanHit = resolvePickFromNode(humanCard, '/channels/ch-msg')
    assert.ok(humanHit)
    assert.equal(humanHit.ref.kind, 'message')
    assert.equal(humanHit.ref.id, 'msg-human')
    assert.equal(humanHit.ref.path, '/channels/ch-msg')
    assert.equal(humanHit.ref.text, '下午三点同步发布清单')
    assert.equal(chipCaption(humanHit.ref).name, 'lulu：下午三点同步发布清单')

    const agentHit = resolvePickFromNode(agentCard, '/channels/ch-msg')
    assert.ok(agentHit)
    assert.equal(agentHit.ref.kind, 'reply')
    assert.equal(agentHit.ref.id, 'msg-agent')
    assert.equal(agentHit.ref.path, '/channels/ch-msg')
    assert.equal(agentHit.ref.text, '收到，我先整理当前阻塞项。')
  })

  it('picks members, agents, pins, and isolates channel floating panel from messages behind it', () => {
    const view = render(
      <div>
        <div
          data-testid="behind-msg"
          data-biu-kind="message"
          data-biu-id="msg-behind"
          data-biu-label="背景消息"
        />
        <ChannelFloatingSidebar
          channelId="ch-f1"
          channel={{
            id: 'ch-f1',
            workspaceId: 'ws-1',
            kind: 'channel',
            dmKey: '',
            name: '测试频道',
            topic: '',
            accessMode: 'private',
            createdBy: 'acc-lulu',
            createdAt: 1000,
            updatedAt: 2000,
            memberCount: 2,
            agentCount: 1,
            lastMessageAt: 2000,
            lastMessageText: '',
          }}
          isDm={false}
          members={[
            { channelId: 'ch-f1', memberType: 'account', memberId: 'acc-lulu', name: 'lulu', role: 'owner', addedBy: 'acc-lulu', addedAt: 1000 },
            { channelId: 'ch-f1', memberType: 'agent', memberId: 'ag-1', name: '墨方宁', role: 'member', addedBy: 'acc-lulu', addedAt: 1000 },
          ]}
          activities={[]}
          myAccountId="acc-me"
          canManageMembers={true}
          pinnedMessageCount={1}
          activeTab="roster"
          resolveAvatar={() => undefined}
          isOnline={() => true}
          onMention={() => {}}
          onAgentClick={() => {}}
          onOpenDm={() => {}}
          onToggleChannelPinned={() => {}}
          onToggleChannelMuted={() => {}}
        />
      </div>,
    )

    const panel = view.getByTestId('channel-floating-panel')
    const behind = view.getByTestId('behind-msg')
    const memberRow = view.getByTestId('channel-roster-member-acc-lulu')
    const agentRow = view.getByTestId('channel-roster-agent-ag-1')

    mockBox(panel, 200, 20, 280, 400)
    mockBox(behind, 0, 0, 600, 400)
    mockBox(memberRow, 210, 100, 260, 40)
    mockBox(agentRow, 210, 150, 260, 40)

    const memberHit = resolvePickFromNode(memberRow, '/channels/ch-f1')
    assert.equal(memberHit?.ref.kind, 'member')
    assert.equal(memberHit?.ref.id, 'acc-lulu')
    assert.equal(memberHit?.ref.path, '/workspace-members/acc-lulu')

    const agentHit = resolvePickFromNode(agentRow, '/channels/ch-f1')
    assert.equal(agentHit?.ref.kind, 'session')
    assert.equal(agentHit?.ref.id, 'ag-1')

    // Clicking empty space inside the floating panel must not pick the message behind it.
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [panel, behind],
    })
    assert.equal(resolvePickAtPoint(250, 50, '/channels/ch-f1'), null)

    // Clicking a member row inside the floating panel resolves the member.
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [memberRow, panel, behind],
    })
    assert.equal(resolvePickAtPoint(250, 120, '/channels/ch-f1')?.ref.id, 'acc-lulu')
  })
})
