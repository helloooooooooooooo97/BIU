/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ChannelSidebarSections } from './channel-sidebar.tsx'
import { ChannelStage } from './channel-view.tsx'
import { MemberDmAction } from './members-chrome.tsx'
import { resetChannelStore } from './channel-store.ts'

beforeEach(() => {
  resetChannelStore()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('sidebar shows 群聊 and 成员 sections and opens a 1v1 DM on member click', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname === '/api/channels' && (!init?.method || init.method === 'GET')) {
      return new Response(
        JSON.stringify({
          channels: [
            {
              id: 'ch-dev',
              workspaceId: 'ws-1',
              kind: 'channel',
              dmKey: '',
              name: '研发协作群',
              topic: '',
              accessMode: 'private',
              createdBy: 'acc-alice',
              createdAt: 1,
              updatedAt: 2,
              memberCount: 2,
              agentCount: 1,
              lastMessageAt: 2,
              lastMessageText: '',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (url.pathname === '/api/account/workspace-profile') {
      return new Response(JSON.stringify({ accountId: 'acc-alice' }), { status: 200 })
    }
    if (url.pathname === '/api/account/me') {
      return new Response(JSON.stringify({ id: 'acc-alice' }), { status: 200 })
    }
    if (url.pathname === '/api/db/list') {
      return new Response(
        JSON.stringify({
          items: [
            { id: 'acc-alice', title: 'Alice', status: 'online' },
            { id: 'acc-bob', title: 'Bob', status: 'online' },
          ],
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/dm' && init?.method === 'POST') {
      return new Response(
        JSON.stringify({
          channel: {
            id: 'dm-alice-bob',
            workspaceId: 'ws-1',
            kind: 'dm',
            dmKey: 'acc-alice\0acc-bob',
            peerAccountId: 'acc-bob',
            peerName: 'Bob',
            name: 'Bob',
            topic: '',
            accessMode: 'private',
            createdBy: 'acc-alice',
            createdAt: 3,
            updatedAt: 3,
            memberCount: 2,
            agentCount: 0,
            lastMessageAt: 3,
            lastMessageText: '',
          },
          members: [],
          messages: [],
          activities: [],
          myAccountId: 'acc-alice',
          canManageMembers: true,
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({}), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const view = render(
    <MemoryRouter initialEntries={['/']}>
      <ChannelSidebarSections routeChannelId={null} />
    </MemoryRouter>,
  )

  await waitFor(() => {
    assert.ok(view.getByText('研发协作群'))
    assert.ok(view.getByTestId('sidebar-member-dm-acc-bob'))
  })

  // 群聊分区位于成员分区上方
  const html = view.container.innerHTML
  assert.ok(html.indexOf('sidebar-channels-section') < html.indexOf('sidebar-members-section'))

  fireEvent.click(view.getByTestId('sidebar-member-dm-acc-bob'))
  await waitFor(() => {
    assert.ok(
      fetchMock.mock.calls.some(
        ([u, init]) => String(u).includes('/api/channels/dm') && init?.method === 'POST',
      ),
    )
  })
})

test('ChannelStage renders IM messages, ephemeral notice, @mention popup, read-only card for others agent, and trace button', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname === '/api/channels/ch-1') {
      return new Response(
        JSON.stringify({
          channel: {
            id: 'ch-1',
            workspaceId: 'ws-1',
            kind: 'channel',
            dmKey: '',
            name: '发布群',
            topic: '讨论发布',
            accessMode: 'workspace',
            createdBy: 'acc-alice',
            createdAt: 1,
            updatedAt: 10,
            memberCount: 2,
            agentCount: 1,
            lastMessageAt: 10,
            lastMessageText: '发布已完成',
          },
          members: [
            { channelId: 'ch-1', memberType: 'account', memberId: 'acc-alice', role: 'owner', addedBy: 'acc-alice', addedAt: 1, name: 'Alice', isOwn: false },
            { channelId: 'ch-1', memberType: 'account', memberId: 'acc-bob', role: 'member', addedBy: 'acc-alice', addedAt: 1, name: 'Bob', isOwn: true },
            { channelId: 'ch-1', memberType: 'agent', memberId: 'ag-alice', role: 'member', addedBy: 'acc-alice', addedAt: 1, name: '发布助手', ownerAccountId: 'acc-alice', ownerName: 'Alice', isOwn: false },
          ],
          messages: [
            {
              id: 'm1',
              channelId: 'ch-1',
              seq: 1,
              senderType: 'agent',
              senderId: 'ag-alice',
              senderName: '发布助手',
              replyToId: '',
              text: '发布已完成',
              mentions: [],
              traceId: 'run-1',
              ephemeralTo: '',
              createdAt: 10,
            },
            {
              id: 'm2',
              channelId: 'ch-1',
              seq: 2,
              senderType: 'system',
              senderId: 'ag-alice',
              senderName: '发布助手',
              replyToId: '',
              text: '仅你可见的审批提醒',
              mentions: [],
              traceId: 'run-1',
              ephemeralTo: 'acc-bob',
              createdAt: 11,
            },
          ],
          activities: [],
          myAccountId: 'acc-bob',
          canManageMembers: false,
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({}), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const openedTabs: string[] = []
  const onTab = (e: Event) => {
    openedTabs.push(String((e as CustomEvent<{ tabId?: string }>).detail?.tabId ?? ''))
  }
  window.addEventListener('biu:inspector-tab', onTab)

  const view = render(
    <MemoryRouter initialEntries={['/channels/ch-1']}>
      <ChannelStage channelId="ch-1" />
    </MemoryRouter>,
  )

  try {
    await waitFor(() => {
      assert.equal(view.getByTestId('channel-title').textContent, '发布群')
      assert.ok(view.getByTestId('channel-ephemeral-msg'))
    })

    // 点击他人的 Agent → 打开只读名片弹窗（不进私聊）
    fireEvent.click(view.getAllByRole('button', { name: '发布助手' })[0]!)
    assert.ok(view.getByTestId('channel-agent-card'))

    // 点击「查看执行详情」→ 打开右侧 Inspector 的 channel-run 标签页
    fireEvent.click(view.getByTestId('channel-msg-trace-run-1'))
    assert.deepEqual(openedTabs, ['channel-run'])

    // 输入 @ 弹出自动补全菜单（含 @所有人、@发布助手）
    const input = view.getByTestId('channel-composer-input')
    fireEvent.change(input, { target: { value: '@' } })
    const menu = view.getByTestId('channel-mention-menu')
    assert.ok(menu.textContent?.includes('@所有人'))
    assert.ok(menu.textContent?.includes('@发布助手'))
  } finally {
    window.removeEventListener('biu:inspector-tab', onTab)
  }
})

test('iconRail always shows create-channel entry and MemberDmAction renders visible 会话 button', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ channels: [], items: [] }), { status: 200 })))

  const rail = render(
    <MemoryRouter>
      <ChannelSidebarSections routeChannelId={null} iconRail />
    </MemoryRouter>,
  )
  assert.ok(rail.getByTestId('sidebar-rail-create-channel'))
  rail.unmount()

  const action = render(
    <MemoryRouter>
      <MemberDmAction record={{ id: 'acc-bob', title: 'Bob' }} />
    </MemoryRouter>,
  )
  const btn = action.getByTestId('member-dm-action-acc-bob')
  assert.equal(btn.textContent?.includes('会话'), true)
})

test('web-app-shell declares chat-sidebar-channels and channel-stage slots in root children', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const shell = readFileSync(resolve(import.meta.dirname, '../../../web-app-shell/src/web/index.tsx'), 'utf8')
  assert.match(shell, /'chat-sidebar-channels':\s*\{\s*kind:\s*'list'\s*\}/)
  assert.match(shell, /'channel-stage':\s*\{\s*kind:\s*'list'\s*\}/)
})
