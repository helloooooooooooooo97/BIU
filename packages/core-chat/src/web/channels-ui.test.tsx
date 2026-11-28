/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ChannelSidebarSections } from './channel-sidebar.tsx'
import { ChannelStage } from './channel-view.tsx'
import { MemberDmAction, MemberIcon, membersChrome } from './members-chrome.tsx'
import { resetChannelStore } from './channel-store.ts'
import type { ChannelMessageView } from '../shared/channel-types.ts'

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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('sidebar shows 聊天 section without 成员 section or empty dashed prompt, and lists active group/DM chats', async () => {
  const bobAvatar = 'data:image/svg+xml;utf8,bob-silver'
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
              name: '研发协作',
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
            {
              id: 'dm-alice-bob',
              workspaceId: 'ws-1',
              kind: 'dm',
              dmKey: 'acc-alice\0acc-bob',
              peerAccountId: 'acc-bob',
              peerName: 'Bob',
              peerAvatar: bobAvatar,
              name: 'Bob',
              topic: '',
              accessMode: 'private',
              createdBy: 'acc-alice',
              createdAt: 3,
              updatedAt: 4,
              memberCount: 2,
              agentCount: 0,
              lastMessageAt: 4,
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
            { id: 'acc-bob', title: 'Bob', avatar: bobAvatar, status: 'online' },
            { id: 'acc-carol', title: 'Carol', status: 'online' },
          ],
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
    assert.ok(view.getByText('聊天'))
    assert.ok(view.getByText('研发协作'))
    assert.ok(view.getByText('Bob'))
  })

  // 不再渲染「成员」分区与未聊天的成员（Carol），也没有「群聊」标题或虚线新建提示
  assert.equal(view.queryByTestId('sidebar-members-section'), null)
  assert.equal(view.queryByTestId('sidebar-create-first-channel'), null)
  assert.equal(view.queryByText('群聊'), null)
  assert.equal(view.queryByText('Carol'), null)
  assert.ok(view.getByTestId('sidebar-create-channel'))
  const imgs = [...view.container.querySelectorAll('img')]
  assert.ok(imgs.map((el) => el.getAttribute('src')).includes(bobAvatar))
  const bobImg = imgs.find((el) => el.getAttribute('src') === bobAvatar)
  assert.equal(Boolean(bobImg?.className.includes('max-w-none')), true)
  assert.equal(Boolean(bobImg?.parentElement?.className.includes('!size-[18px]')), true)

  // 空列表时也不应出现下方虚线「新建群聊」提示，只保留右上角 + 按钮
  view.unmount()
  resetChannelStore()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ channels: [], items: [] }), { status: 200 })),
  )
  const emptyView = render(
    <MemoryRouter initialEntries={['/']}>
      <ChannelSidebarSections routeChannelId={null} />
    </MemoryRouter>,
  )
  await waitFor(() => {
    assert.ok(emptyView.getByTestId('sidebar-create-channel'))
  })
  assert.equal(emptyView.queryByTestId('sidebar-create-first-channel'), null)
  assert.equal(emptyView.queryByTestId('sidebar-members-section'), null)
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
    await waitFor(() => {
    const agentRow = view.container.querySelector('[data-testid="channel-message"][data-sender-type="agent"]')
    assert.ok(agentRow?.querySelector('.chat-user-card')?.className.includes('!w-3/4'))
    assert.ok(agentRow?.querySelector('.chat-user-card-body .chat-assistant-body'))
    assert.ok(agentRow?.querySelector('.user-turn-bar [data-testid="channel-msg-avatar"]'))
    assert.ok(view.getByTestId('channel-msg-trace-run-1'))
  })
  fireEvent.click(view.getByTestId('channel-msg-trace-run-1'))
    assert.deepEqual(openedTabs, ['channel-run'])

    // 点击 + 按钮插入 @ 弹出统一自动补全菜单（含 @所有人、@发布助手）
    await waitFor(() => {
      assert.equal(Boolean(view.queryByTestId('channel-composer-input')), true)
    })
    fireEvent.click(view.getByTestId('channel-mention-btn'))
    await waitFor(() => {
      const menu = view.queryByTestId('channel-mention-menu')
      assert.equal(Boolean(menu), true)
      assert.equal(Boolean(menu?.textContent?.includes('@所有人')), true)
      assert.equal(Boolean(menu?.textContent?.includes('@发布助手')), true)
    })
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

test('ChannelStage reuses 1v1 chat card/composer/float styles and syncs workspace avatars identically', async () => {
  const aliceAvatar = 'data:image/svg+xml;utf8,alice-maroon-orb'
  const bobAvatar = 'data:image/svg+xml;utf8,bob-silver-orb'
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname === '/api/db/list') {
      return new Response(
        JSON.stringify({
          items: [
            { id: 'acc-alice', title: 'lulu@qq.com', avatar: aliceAvatar },
            { id: 'acc-bob', title: '97', avatar: bobAvatar },
          ],
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/dm-1') {
      return new Response(
        JSON.stringify({
          channel: {
            id: 'dm-1',
            workspaceId: 'ws-1',
            kind: 'dm',
            dmKey: 'acc-alice\0acc-bob',
            peerAccountId: 'acc-bob',
            peerName: '97',
            name: '97',
            topic: '',
            accessMode: 'private',
            createdBy: 'acc-alice',
            createdAt: 1,
            updatedAt: 10,
            memberCount: 2,
            agentCount: 0,
            lastMessageAt: 10,
            lastMessageText: '你好',
          },
          members: [
            { channelId: 'dm-1', memberType: 'account', memberId: 'acc-alice', role: 'owner', addedBy: 'acc-alice', addedAt: 1, name: 'lulu@qq.com', isOwn: true },
            { channelId: 'dm-1', memberType: 'account', memberId: 'acc-bob', role: 'member', addedBy: 'acc-alice', addedAt: 1, name: '97', isOwn: false },
          ],
          messages: [
            {
              id: 'm-bob',
              channelId: 'dm-1',
              seq: 1,
              senderType: 'account',
              senderId: 'acc-bob',
              senderName: '97',
              replyToId: '',
              text: '你好呀',
              mentions: [],
              traceId: '',
              ephemeralTo: '',
              createdAt: 10,
            },
            {
              id: 'm-alice',
              channelId: 'dm-1',
              seq: 2,
              senderType: 'account',
              senderId: 'acc-alice',
              senderName: 'lulu@qq.com',
              viaAgentId: 'ag-alice',
              viaAgentName: '赤板灵',
              replyToId: '',
              text: '收到！',
              mentions: [],
              traceId: '',
              ephemeralTo: '',
              createdAt: 11,
            },
          ],
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
    <MemoryRouter initialEntries={['/channels/dm-1']}>
      <ChannelStage channelId="dm-1" />
    </MemoryRouter>,
  )

  await waitFor(() => {
    // 复用与 1v1 聊天一致的核心 DOM 类名
    assert.ok(view.container.querySelector('.chat-view-header'))
    assert.ok(view.container.querySelector('.chat-stage'))
    assert.ok(view.container.querySelector('.chat-node-list'))
    assert.ok(view.container.querySelector('.chat-user-card'))
    assert.ok(view.container.querySelector('.user-turn-bar'))
    assert.ok(view.container.querySelector('.chat-composer-dock'))
    assert.ok(view.container.querySelector('.composer-pill'))
    assert.ok(view.container.querySelector('.composer-plus'))
    assert.ok(view.container.querySelector('.composer-send'))

    // 头像全部与空间成员表头像一致，不能退化成默认彩虹 AiAvatar
    const imgs = [...view.container.querySelectorAll('img')].map((el) => el.getAttribute('src'))
    assert.ok(imgs.includes(bobAvatar), 'peer avatar in header/message must match workspace avatar')
    assert.ok(imgs.includes(aliceAvatar), 'self avatar in message must match workspace avatar')
    assert.equal(view.container.querySelector('[data-ai-avatar="mesh"]'), null)

    // 我发的消息在右侧、他人发的消息在左侧；左右消息卡片统一占 3/4 宽，头像直接展示在底部统计条内而非气泡框外
    const rows = [...view.container.querySelectorAll('[data-testid="channel-message"]')]
    assert.equal(rows.length, 2)
    const otherRow = rows[0]!
    const selfRow = rows[1]!
    assert.equal(otherRow.getAttribute('data-self'), 'false')
    assert.ok(otherRow.className.includes('justify-start'))
    assert.equal(otherRow.children.length, 1)
    assert.ok(otherRow.querySelector('.chat-user-card')?.className.includes('!w-3/4'))
    assert.ok(otherRow.querySelector('.user-turn-bar [data-testid="channel-msg-avatar"]'))
    assert.equal(otherRow.querySelector('.user-turn-bar')?.className.includes('flex-row-reverse'), false)
    assert.equal(selfRow.getAttribute('data-self'), 'true')
    assert.ok(selfRow.className.includes('justify-end'))
    assert.equal(selfRow.children.length, 1)
    assert.ok(selfRow.querySelector('.chat-user-card')?.className.includes('!w-3/4'))
    assert.ok(selfRow.querySelector('.user-turn-bar [data-testid="channel-msg-avatar"]'))
    assert.equal(selfRow.querySelector('.user-turn-bar')?.className.includes('flex-row-reverse'), true)
    assert.equal(
      selfRow.querySelector('.user-turn-bar [data-testid="channel-msg-avatar"]')?.className.includes('flex-row-reverse'),
      true,
    )
    const viaBadge = selfRow.querySelector('[data-testid="channel-msg-via-agent"]')
    assert.equal(Boolean(viaBadge), true)
    assert.equal(Boolean(viaBadge?.textContent?.includes('赤板灵')), true)
  })

  // 顶栏不再显示「2 人 · 1 Agent」计数按钮；所有成员与设置统一原地开在右侧悬浮面板（不再弹中心遮罩弹窗）且头像一致
  assert.equal(view.container.querySelector('.chat-view-header')?.textContent?.includes('2 人'), false)
  fireEvent.click(view.getByTestId('channel-more-menu-btn'))
  fireEvent.click(await waitFor(() => view.getByTestId('channel-manage-members')))
  const panel = await waitFor(() => view.getByTestId('channel-manage-panel'))
  assert.equal(document.querySelector('.biu-float-overlay'), null, 'manage view must stay in-place in right floating panel with no modal overlay')
  const panelImgs = [...panel.querySelectorAll('img')].map((el) => el.getAttribute('src'))
  assert.ok(panelImgs.includes(aliceAvatar))
  assert.ok(panelImgs.includes(bobAvatar))
})

test('membersChrome Icon renders workspace avatar with green dot for online members and no dot when offline', () => {
  const chrome = membersChrome()
  assert.equal(chrome.Icon, MemberIcon)

  const onlineAvatar = 'data:image/svg+xml;utf8,online-97'
  const onlineView = render(
    <MemberIcon record={{ id: 'acc-97', title: '97', avatar: onlineAvatar, status: 'online' }} />,
  )
  assert.equal(onlineView.getByTestId('member-row-avatar-acc-97').getAttribute('data-online'), 'true')
  assert.ok(onlineView.container.querySelector(`img[src="${onlineAvatar}"]`))
  assert.ok(onlineView.getByTestId('member-online-dot-acc-97'))
  onlineView.unmount()

  const offlineView = render(
    <MemberIcon record={{ id: 'acc-offline', title: 'Bob', avatar: '', status: 'active' }} />,
  )
  assert.equal(offlineView.getByTestId('member-row-avatar-acc-offline').getAttribute('data-online'), 'false')
  assert.ok(offlineView.container.querySelector('[data-ai-avatar="mesh"]'))
  assert.equal(offlineView.queryByTestId('member-online-dot-acc-offline'), null)
})

test('CreateChannelDialog replaces name/topic fields with search box and builds human-first default name', async () => {
  let postedBody: Record<string, unknown> | null = null
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname === '/api/channels' && init?.method === 'POST') {
      postedBody = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          channel: {
            id: 'ch-new',
            workspaceId: 'ws-1',
            kind: 'channel',
            dmKey: '',
            name: String(postedBody.name ?? ''),
            topic: '',
            accessMode: 'private',
            createdBy: 'acc-alice',
            createdAt: 1,
            updatedAt: 1,
            memberCount: 2,
            agentCount: 1,
            lastMessageAt: 1,
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
    if (url.pathname === '/api/channels') {
      return new Response(JSON.stringify({ channels: [] }), { status: 200 })
    }
    if (url.pathname === '/api/account/workspace-profile') {
      return new Response(JSON.stringify({ accountId: 'acc-alice' }), { status: 200 })
    }
    if (url.pathname === '/api/db/list') {
      return new Response(
        JSON.stringify({
          items: [
            { id: 'acc-alice', title: 'Alice' },
            { id: 'acc-97', title: '97', email: '97@example.com' },
            { id: 'acc-bob', title: 'Bob', email: 'bob@example.com' },
          ],
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({}), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const fakeUseSessionView = ((selector: (s: { sessions: Array<{ id: string; title: string; createdBy?: string }> }) => unknown) =>
    selector({
      sessions: [
        { id: 'ag-1', title: '赤板灵', createdBy: 'acc-alice' },
        { id: 'ag-2', title: '紫晶美', createdBy: 'acc-alice' },
      ],
    })) as unknown as Parameters<typeof ChannelSidebarSections>[0]['useSessionView']

  const view = render(
    <MemoryRouter initialEntries={['/']}>
      <ChannelSidebarSections routeChannelId={null} useSessionView={fakeUseSessionView} />
    </MemoryRouter>,
  )

  fireEvent.click(view.getByTestId('sidebar-create-channel'))
  const dialog = await waitFor(() => view.getByTestId('create-channel-dialog'))

  // 不再渲染「聊天名称」和「主题（可选）」输入框，改为搜索框
  assert.equal(dialog.textContent?.includes('聊天名称'), false)
  assert.equal(dialog.textContent?.includes('主题（可选）'), false)
  const searchInput = view.getByTestId('create-channel-search')

  // 搜索过滤 Agent
  fireEvent.change(searchInput, { target: { value: '赤板' } })
  assert.ok(dialog.textContent?.includes('赤板灵'))
  assert.equal(dialog.textContent?.includes('紫晶美'), false)

  // 先勾选 Agent「赤板灵」→ 显示只读上下文模式开关，可切换为仅群聊隔离
  fireEvent.click(view.getByText('赤板灵'))
  assert.ok(view.getByTestId('create-channel-agent-context-mode'))
  fireEvent.click(view.getByTestId('create-context-mode-isolated'))

  // 清空搜索并勾选人类成员「97」
  fireEvent.change(searchInput, { target: { value: '' } })
  await waitFor(() => assert.ok(view.getByText('97')))
  fireEvent.click(view.getByText('97'))

  // 默认名称必须人类成员优先在前，其次 Agent
  assert.equal(view.getByTestId('create-channel-default-name').textContent, '默认名称：Alice、97、赤板灵')

  fireEvent.click(view.getByTestId('create-channel-submit'))
  await waitFor(() => {
    assert.equal(postedBody?.name, 'Alice、97、赤板灵')
    assert.equal(postedBody?.agentContextMode, 'isolated')
  })
})

test('CreateChannelDialog supports one-time static batch import from member views and agent views', async () => {
  let postedBody: Record<string, unknown> | null = null
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname === '/api/channels' && init?.method === 'POST') {
      postedBody = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          channel: {
            id: 'ch-view-import',
            workspaceId: 'ws-1',
            kind: 'channel',
            dmKey: '',
            name: String(postedBody.name ?? ''),
            topic: '',
            accessMode: 'private',
            createdBy: 'acc-alice',
            createdAt: 1,
            updatedAt: 1,
            memberCount: 3,
            agentCount: 1,
            lastMessageAt: 1,
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
    if (url.pathname === '/api/channels') {
      return new Response(JSON.stringify({ channels: [] }), { status: 200 })
    }
    if (url.pathname === '/api/account/workspace-profile') {
      return new Response(JSON.stringify({ accountId: 'acc-alice' }), { status: 200 })
    }
    if (url.pathname === '/api/db/saved-views') {
      const p = url.searchParams.get('path')
      if (p === '/workspace-members') {
        return new Response(JSON.stringify({ views: [{ id: 'mv-core', name: '核心成员' }] }), { status: 200 })
      }
      if (p === '/agents') {
        return new Response(JSON.stringify({ views: [{ id: 'av-code', name: '代码助手' }] }), { status: 200 })
      }
      return new Response(JSON.stringify({ views: [] }), { status: 200 })
    }
    if (url.pathname === '/api/db/list') {
      const p = url.searchParams.get('path')
      const viewId = url.searchParams.get('view_id')
      if (p === '/workspace-members' && viewId === 'mv-core') {
        return new Response(
          JSON.stringify({ items: [{ id: 'acc-alice' }, { id: 'acc-97' }, { id: 'acc-bob' }], total: 3 }),
          { status: 200 },
        )
      }
      if (p === '/agents' && viewId === 'av-code') {
        return new Response(
          JSON.stringify({ items: [{ id: 'ag-1' }, { id: 'ag-foreign' }], total: 2 }),
          { status: 200 },
        )
      }
      return new Response(
        JSON.stringify({
          items: [
            { id: 'acc-alice', title: 'Alice' },
            { id: 'acc-97', title: '97', email: '97@example.com' },
            { id: 'acc-bob', title: 'Bob', email: 'bob@example.com' },
          ],
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({}), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const fakeUseSessionView = ((selector: (s: { sessions: Array<{ id: string; title: string; createdBy?: string }> }) => unknown) =>
    selector({
      sessions: [
        { id: 'ag-1', title: '赤板灵', createdBy: 'acc-alice' },
        { id: 'ag-2', title: '紫晶美', createdBy: 'acc-alice' },
      ],
    })) as unknown as Parameters<typeof ChannelSidebarSections>[0]['useSessionView']

  const view = render(
    <MemoryRouter initialEntries={['/']}>
      <ChannelSidebarSections routeChannelId={null} useSessionView={fakeUseSessionView} />
    </MemoryRouter>,
  )

  fireEvent.click(view.getByTestId('sidebar-create-channel'))
  await waitFor(() => view.getByTestId('create-channel-dialog'))

  // 从成员视图静态批量勾选（排除自己）
  const memberViewBtn = await waitFor(() => view.getByTestId('create-import-member-view-mv-core'))
  fireEvent.click(memberViewBtn)
  await waitFor(() => {
    const notice = view.getByTestId('create-channel-view-import-notice').textContent ?? ''
    assert.ok(notice.includes('静态勾选 2 位成员'))
  })

  // 从 Agent 视图静态批量勾选（自动忽略他人归属的 ag-foreign）
  const agentViewBtn = await waitFor(() => view.getByTestId('create-import-agent-view-av-code'))
  fireEvent.click(agentViewBtn)
  await waitFor(() => {
    const notice = view.getByTestId('create-channel-view-import-notice').textContent ?? ''
    assert.ok(notice.includes('静态勾选 1 个 Agent'))
    assert.ok(notice.includes('1 个他人归属已忽略'))
  })

  // 因为是静态快照，用户仍可手动取消勾选其中某位成员（Bob）
  fireEvent.click(view.getByText('Bob'))

  fireEvent.click(view.getByTestId('create-channel-submit'))
  await waitFor(() => {
    assert.deepEqual(postedBody?.memberAccountIds, ['acc-97'])
    assert.deepEqual(postedBody?.agentIds, ['ag-1'])
  })
})

test('ChannelStage allows agent owner to toggle contextMode and manually sync conclusions back to 1v1', async () => {
  let patchedMode: string | null = null
  let syncedPayload: Record<string, unknown> | null = null
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname === '/api/channels/ch-own' && (!init?.method || init.method === 'GET')) {
      return new Response(
        JSON.stringify({
          channel: {
            id: 'ch-own',
            workspaceId: 'ws-1',
            kind: 'channel',
            dmKey: '',
            name: '排障群',
            topic: '',
            accessMode: 'private',
            createdBy: 'acc-alice',
            createdAt: 1,
            updatedAt: 10,
            memberCount: 1,
            agentCount: 1,
            lastMessageAt: 10,
            lastMessageText: '已定位根因',
          },
          members: [
            { channelId: 'ch-own', memberType: 'account', memberId: 'acc-alice', role: 'owner', addedBy: 'acc-alice', addedAt: 1, name: 'Alice', isOwn: true },
            { channelId: 'ch-own', memberType: 'agent', memberId: 'ag-mine', role: 'member', addedBy: 'acc-alice', addedAt: 1, name: '排障助手', ownerAccountId: 'acc-alice', ownerName: 'Alice', contextMode: 'summary', isOwn: true },
          ],
          messages: [
            {
              id: 'm-ag',
              channelId: 'ch-own',
              seq: 1,
              senderType: 'agent',
              senderId: 'ag-mine',
              senderName: '排障助手',
              replyToId: '',
              text: '已定位根因：超时设置偏短',
              mentions: [],
              traceId: 'run-own',
              ephemeralTo: '',
              createdAt: 10,
            },
          ],
          activities: [],
          myAccountId: 'acc-alice',
          canManageMembers: true,
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-own/members/agent/ag-mine' && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body ?? '{}')) as { contextMode?: string }
      patchedMode = body.contextMode ?? null
      return new Response(
        JSON.stringify({
          members: [
            { channelId: 'ch-own', memberType: 'account', memberId: 'acc-alice', role: 'owner', addedBy: 'acc-alice', addedAt: 1, name: 'Alice', isOwn: true },
            { channelId: 'ch-own', memberType: 'agent', memberId: 'ag-mine', role: 'member', addedBy: 'acc-alice', addedAt: 1, name: '排障助手', ownerAccountId: 'acc-alice', ownerName: 'Alice', contextMode: patchedMode, isOwn: true },
          ],
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-own/sync-to-agent' && init?.method === 'POST') {
      syncedPayload = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>
      return new Response(JSON.stringify({ ok: true, agentId: 'ag-mine', syncedText: 'ok' }), { status: 200 })
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const view = render(
    <MemoryRouter initialEntries={['/channels/ch-own']}>
      <ChannelStage channelId="ch-own" />
    </MemoryRouter>,
  )

  await waitFor(() => {
    assert.ok(view.getByTestId('channel-msg-more-m-ag'))
  })

  // 归属人通过消息「更多」菜单点击「同步到 1v1」
  fireEvent.click(view.getByTestId('channel-msg-more-m-ag'))
  fireEvent.click(await waitFor(() => view.getByTestId('channel-msg-sync-m-ag')))
  await waitFor(() => {
    assert.deepEqual(syncedPayload, { agentId: 'ag-mine', messageId: 'm-ag' })
  })

  // 打开群成员与 Agent 弹窗并切换只读上下文模式
  fireEvent.click(view.getByTestId('channel-more-menu-btn'))
  fireEvent.click(await waitFor(() => view.getByTestId('channel-manage-members')))
  const toggleBtn = await waitFor(() => view.getByTestId('agent-context-mode-ag-mine'))
  assert.equal(toggleBtn.textContent, '同步工作摘要')
  fireEvent.click(toggleBtn)
  await waitFor(() => {
    assert.equal(patchedMode, 'isolated')
    assert.equal(view.getByTestId('agent-context-mode-ag-mine').textContent, '仅群聊隔离')
  })
})

test('ChannelSidebarSections displays unread badges and online dot, and ChannelStage supports edit, recall, unread divider, attachments, and older paging', async () => {
  let editedBody: string | null = null
  let recalledId: string | null = null
  let readCalled = false
  const now = Date.now()
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname === '/api/channels' && (!init?.method || init.method === 'GET')) {
      return new Response(
        JSON.stringify({
          channels: [
            {
              id: 'ch-unread',
              workspaceId: 'ws-1',
              kind: 'channel',
              dmKey: '',
              name: '告警群',
              topic: '',
              accessMode: 'private',
              createdBy: 'acc-alice',
              createdAt: now - 5000,
              updatedAt: now,
              memberCount: 2,
              agentCount: 0,
              lastMessageAt: now,
              lastMessageText: '@Alice 看一下',
              unreadCount: 3,
              mentionCount: 1,
              lastReadSeq: 1,
            },
            {
              id: 'dm-97',
              workspaceId: 'ws-1',
              kind: 'dm',
              dmKey: 'acc-97\0acc-alice',
              peerAccountId: 'acc-97',
              peerName: '97',
              name: '97',
              topic: '',
              accessMode: 'private',
              createdBy: 'acc-alice',
              createdAt: now - 5000,
              updatedAt: now - 1000,
              memberCount: 2,
              agentCount: 0,
              lastMessageAt: now - 1000,
              lastMessageText: 'hi',
              unreadCount: 2,
              mentionCount: 0,
              lastReadSeq: 0,
            },
          ],
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/db/list') {
      return new Response(
        JSON.stringify({
          items: [
            { id: 'acc-alice', title: 'Alice', status: 'online' },
            { id: 'acc-97', title: '97', status: 'online' },
          ],
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/account/workspace-profile') {
      return new Response(JSON.stringify({ accountId: 'acc-alice', name: 'Alice' }), { status: 200 })
    }
    if (url.pathname === '/api/channels/ch-unread' && (!init?.method || init.method === 'GET')) {
      return new Response(
        JSON.stringify({
          channel: {
            id: 'ch-unread',
            workspaceId: 'ws-1',
            kind: 'channel',
            dmKey: '',
            name: '告警群',
            topic: '',
            accessMode: 'private',
            createdBy: 'acc-alice',
            createdAt: now - 5000,
            updatedAt: now,
            memberCount: 2,
            agentCount: 0,
            lastMessageAt: now,
            lastMessageText: '@Alice 看一下',
            unreadCount: 1,
            mentionCount: 1,
            lastReadSeq: 2,
          },
          members: [
            { channelId: 'ch-unread', memberType: 'account', memberId: 'acc-alice', role: 'owner', addedBy: 'acc-alice', addedAt: 1, name: 'Alice', isOwn: true },
            { channelId: 'ch-unread', memberType: 'account', memberId: 'acc-97', role: 'member', addedBy: 'acc-alice', addedAt: 1, name: '97', isOwn: false },
          ],
          messages: [
            {
              id: 'm-2',
              channelId: 'ch-unread',
              seq: 2,
              senderType: 'account',
              senderId: 'acc-alice',
              senderName: 'Alice',
              replyToId: '',
              text: '我发的消息',
              mentions: [],
              attachments: [
                { id: 'att-1.png', name: 'shot.png', mime: 'image/png', size: 1024, url: '/api/channels/ch-unread/uploads/att-1.png', kind: 'image' },
              ],
              traceId: '',
              ephemeralTo: '',
              createdAt: now - 2000,
            },
            {
              id: 'm-3',
              channelId: 'ch-unread',
              seq: 3,
              senderType: 'account',
              senderId: 'acc-97',
              senderName: '97',
              replyToId: '',
              text: '@Alice 请看截图',
              mentions: [{ kind: 'account', id: 'acc-alice', label: 'Alice' }],
              traceId: '',
              ephemeralTo: '',
              createdAt: now - 1000,
            },
          ],
          hasMoreMessages: true,
          activities: [],
          myAccountId: 'acc-alice',
          canManageMembers: true,
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-unread/read' && init?.method === 'POST') {
      readCalled = true
      return new Response(JSON.stringify({ ok: true, channelId: 'ch-unread', lastReadSeq: 3 }), { status: 200 })
    }
    if (url.pathname === '/api/channels/ch-unread/messages' && (!init?.method || init.method === 'GET')) {
      return new Response(
        JSON.stringify({
          messages: [
            {
              id: 'm-1',
              channelId: 'ch-unread',
              seq: 1,
              senderType: 'account',
              senderId: 'acc-97',
              senderName: '97',
              replyToId: '',
              text: '更早的一条历史消息',
              mentions: [],
              traceId: '',
              ephemeralTo: '',
              createdAt: now - 86_400_000,
            },
          ],
          hasMore: false,
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-unread/messages/m-2' && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body ?? '{}')) as { text?: string }
      editedBody = body.text ?? null
      return new Response(
        JSON.stringify({
          message: {
            id: 'm-2',
            channelId: 'ch-unread',
            seq: 2,
            senderType: 'account',
            senderId: 'acc-alice',
            senderName: 'Alice',
            replyToId: '',
            text: editedBody,
            mentions: [],
            traceId: '',
            ephemeralTo: '',
            editedAt: now,
            createdAt: now - 2000,
          },
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-unread/messages/m-2' && init?.method === 'DELETE') {
      recalledId = 'm-2'
      return new Response(
        JSON.stringify({
          message: {
            id: 'm-2',
            channelId: 'ch-unread',
            seq: 2,
            senderType: 'account',
            senderId: 'acc-alice',
            senderName: 'Alice',
            replyToId: '',
            text: '',
            mentions: [],
            traceId: '',
            ephemeralTo: '',
            deletedAt: now,
            createdAt: now - 2000,
          },
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({}), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const sidebar = render(
    <MemoryRouter initialEntries={['/']}>
      <ChannelSidebarSections routeChannelId={null} />
    </MemoryRouter>,
  )
  await waitFor(() => {
    assert.equal(sidebar.getByTestId('sidebar-channel-unread-ch-unread').textContent, '@1')
    assert.equal(sidebar.getByTestId('sidebar-channel-unread-dm-97').textContent, '2')
    assert.ok(sidebar.getByTestId('sidebar-dm-online-dm-97'))
  })
  sidebar.unmount()

  const stage = render(
    <MemoryRouter initialEntries={['/channels/ch-unread']}>
      <ChannelStage channelId="ch-unread" />
    </MemoryRouter>,
  )
  await waitFor(() => {
    assert.ok(stage.getByTestId('channel-unread-divider'))
    assert.ok(stage.getByTestId('channel-msg-attachments-m-2'))
    assert.ok(stage.getByTestId('channel-load-older'))
    assert.equal(readCalled, true)
  })

  fireEvent.click(stage.getByTestId('channel-load-older'))
  await waitFor(() => {
    assert.ok(stage.container.textContent?.includes('更早的一条历史消息'))
  })

  fireEvent.click(stage.getByTestId('channel-msg-more-m-2'))
  fireEvent.click(await waitFor(() => stage.getByTestId('channel-msg-edit-m-2')))
  const editorBox = stage.getByTestId('channel-msg-editor-m-2').querySelector('textarea')!
  fireEvent.change(editorBox, { target: { value: '编辑后的内容' } })
  fireEvent.click(stage.getByTestId('channel-msg-edit-save-m-2'))
  await waitFor(() => {
    assert.equal(editedBody, '编辑后的内容')
    assert.ok(stage.getByTestId('channel-msg-edited-m-2'))
  })

  fireEvent.click(stage.getByTestId('channel-msg-more-m-2'))
  fireEvent.click(await waitFor(() => stage.getByTestId('channel-msg-recall-m-2')))
  await waitFor(() => {
    assert.equal(recalledId, 'm-2')
    assert.ok(stage.getByTestId('channel-msg-recalled-m-2'))
  })
})

test('ChannelStage supports emoji reactions, pin/save, in-channel search, and channel preferences', async () => {
  let reactedEmoji: string | null = null
  let pinnedToggled = false
  let savedToggled = false
  let prefPatched: Record<string, unknown> | null = null
  const now = Date.now()
  const baseMsg = {
    id: 'm-1',
    channelId: 'ch-p1',
    seq: 1,
    senderType: 'account',
    senderId: 'acc-97',
    senderName: '97',
    replyToId: '',
    text: '发布脚本已更新完成',
    mentions: [],
    traceId: '',
    ephemeralTo: '',
    createdAt: now,
  }
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname === '/api/channels/ch-p1' && (!init?.method || init.method === 'GET')) {
      return new Response(
        JSON.stringify({
          channel: {
            id: 'ch-p1',
            workspaceId: 'ws-1',
            kind: 'channel',
            dmKey: '',
            name: '发布群',
            topic: '',
            accessMode: 'private',
            createdBy: 'acc-97',
            createdAt: now,
            updatedAt: now,
            memberCount: 2,
            agentCount: 0,
            lastMessageAt: now,
            lastMessageText: baseMsg.text,
            pinned: false,
            muted: false,
          },
          members: [
            { channelId: 'ch-p1', memberType: 'account', memberId: 'acc-97', role: 'owner', addedBy: 'acc-97', addedAt: 1, name: '97', isOwn: false },
            { channelId: 'ch-p1', memberType: 'account', memberId: 'acc-alice', role: 'member', addedBy: 'acc-97', addedAt: 1, name: 'Alice', isOwn: true },
          ],
          messages: [baseMsg],
          activities: [],
          myAccountId: 'acc-alice',
          canManageMembers: false,
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-p1/messages/m-1/reactions' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body ?? '{}')) as { emoji?: string }
      reactedEmoji = body.emoji ?? null
      return new Response(
        JSON.stringify({
          channelId: 'ch-p1',
          messageId: 'm-1',
          reactions: [{ emoji: reactedEmoji, count: 1, reactedByMe: true, accountIds: ['acc-alice'], accountNames: ['Alice'] }],
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-p1/messages/m-1/pin' && init?.method === 'POST') {
      pinnedToggled = true
      return new Response(JSON.stringify({ message: { ...baseMsg, pinnedAt: now, pinnedBy: 'acc-alice', pinnedByName: 'Alice' } }), { status: 200 })
    }
    if (url.pathname === '/api/channels/ch-p1/messages/m-1/save' && init?.method === 'POST') {
      savedToggled = true
      return new Response(JSON.stringify({ ok: true, saved: true, messageId: 'm-1' }), { status: 200 })
    }
    if (url.pathname === '/api/channels/search') {
      return new Response(
        JSON.stringify({
          hits: [{ ...baseMsg, channelName: '发布群', channelKind: 'channel' }],
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-p1/preferences' && init?.method === 'PATCH') {
      prefPatched = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          channel: {
            id: 'ch-p1',
            workspaceId: 'ws-1',
            kind: 'channel',
            dmKey: '',
            name: '发布群',
            topic: '',
            accessMode: 'private',
            createdBy: 'acc-97',
            createdAt: now,
            updatedAt: now,
            memberCount: 2,
            agentCount: 0,
            lastMessageAt: now,
            lastMessageText: baseMsg.text,
            pinned: Boolean(prefPatched?.pinned),
            muted: Boolean(prefPatched?.muted),
          },
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const stage = render(
    <MemoryRouter initialEntries={['/channels/ch-p1']}>
      <ChannelStage channelId="ch-p1" />
    </MemoryRouter>,
  )

  await waitFor(() => assert.ok(stage.getByTestId('channel-msg-react-m-1')))

  // 1. 添加表情回应 👍
  fireEvent.click(stage.getByTestId('channel-msg-react-m-1'))
  const picker = await waitFor(() => stage.getByTestId('channel-msg-react-picker-m-1'))
  fireEvent.click(picker.querySelector('button')!)
  await waitFor(() => {
    assert.equal(reactedEmoji, '👍')
    assert.ok(stage.getByTestId('channel-msg-reaction-m-1-👍'))
  })

  // 2. 通过「更多」菜单置顶与收藏消息
  fireEvent.click(stage.getByTestId('channel-msg-more-m-1'))
  fireEvent.click(await waitFor(() => stage.getByTestId('channel-msg-pin-m-1')))
  fireEvent.click(stage.getByTestId('channel-msg-more-m-1'))
  fireEvent.click(await waitFor(() => stage.getByTestId('channel-msg-save-m-1')))
  await waitFor(() => {
    assert.equal(pinnedToggled, true)
    assert.equal(savedToggled, true)
    assert.ok(stage.getByTestId('channel-msg-pinned-badge-m-1'))
  })

  // 3. 群内搜索
  fireEvent.click(stage.getByTestId('channel-search-toggle'))
  fireEvent.change(stage.getByTestId('channel-search-input'), { target: { value: '发布脚本' } })
  await waitFor(() => assert.ok(stage.getByTestId('channel-search-hit-m-1')))

  // 4. 偏好设置（置顶聊天）与非群主可见退群按钮
  fireEvent.click(stage.getByTestId('channel-more-menu-btn'))
  fireEvent.click(await waitFor(() => stage.getByTestId('channel-manage-members')))
  await waitFor(() => assert.ok(stage.getByTestId('channel-leave-btn')))
  fireEvent.click(stage.getByTestId('channel-pref-pin'))
  await waitFor(() => {
    assert.deepEqual(prefPatched, { pinned: true })
  })
})

test('ChannelStage supports Breadcrumb Threads, sidebar expandable sub-threads, AI summary modal, and saving message to BIU page', async () => {
  let threadSentBody: Record<string, unknown> | null = null
  let createdPageBody: Record<string, unknown> | null = null
  const now = Date.now()
  const rootMsg = {
    id: 'm-root',
    channelId: 'ch-p2',
    seq: 1,
    senderType: 'account',
    senderId: 'acc-97',
    senderName: '97',
    replyToId: '',
    text: '讨论一下数据库分库方案',
    mentions: [],
    threadSummary: { replyCount: 1, lastReplyAt: now, participantNames: ['Alice'] },
    traceId: '',
    ephemeralTo: '',
    createdAt: now - 5000,
  }
  const existingReply = {
    id: 'm-r1',
    channelId: 'ch-p2',
    seq: 2,
    senderType: 'account',
    senderId: 'acc-alice',
    senderName: 'Alice',
    replyToId: '',
    threadRootId: 'm-root',
    text: '先按租户分片吧',
    mentions: [],
    traceId: '',
    ephemeralTo: '',
    createdAt: now - 2000,
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname === '/api/channels' && (!init?.method || init.method === 'GET')) {
      return new Response(
        JSON.stringify({
          channels: [
            {
              id: 'ch-p2',
              workspaceId: 'ws-1',
              kind: 'channel',
              dmKey: '',
              name: '架构群',
              topic: '',
              accessMode: 'private',
              createdBy: 'acc-alice',
              createdAt: now - 5000,
              updatedAt: now,
              memberCount: 2,
              agentCount: 0,
              lastMessageAt: now,
              lastMessageText: rootMsg.text,
              threads: [
                {
                  rootId: 'm-root',
                  title: '讨论一下数据库分库方案',
                  replyCount: 1,
                  lastReplyAt: now,
                },
              ],
            },
          ],
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-p2' && (!init?.method || init.method === 'GET')) {
      return new Response(
        JSON.stringify({
          channel: {
            id: 'ch-p2',
            workspaceId: 'ws-1',
            kind: 'channel',
            dmKey: '',
            name: '架构群',
            topic: '',
            accessMode: 'private',
            createdBy: 'acc-alice',
            createdAt: now - 5000,
            updatedAt: now,
            memberCount: 2,
            agentCount: 0,
            lastMessageAt: now,
            lastMessageText: rootMsg.text,
            threads: [
              {
                rootId: 'm-root',
                title: '讨论一下数据库分库方案',
                replyCount: 1,
                lastReplyAt: now,
              },
            ],
          },
          members: [
            { channelId: 'ch-p2', memberType: 'account', memberId: 'acc-alice', role: 'owner', addedBy: 'acc-alice', addedAt: 1, name: 'Alice', isOwn: true },
            { channelId: 'ch-p2', memberType: 'account', memberId: 'acc-97', role: 'member', addedBy: 'acc-alice', addedAt: 1, name: '97', isOwn: false },
          ],
          messages: [rootMsg],
          activities: [],
          myAccountId: 'acc-alice',
          canManageMembers: true,
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-p2/threads/m-root' && (!init?.method || init.method === 'GET')) {
      return new Response(JSON.stringify({ channelId: 'ch-p2', root: rootMsg, replies: [existingReply] }), { status: 200 })
    }
    if (url.pathname === '/api/channels/ch-p2/messages' && init?.method === 'POST') {
      threadSentBody = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          message: {
            id: 'm-r2',
            channelId: 'ch-p2',
            seq: 3,
            senderType: 'account',
            senderId: 'acc-alice',
            senderName: 'Alice',
            replyToId: '',
            threadRootId: 'm-root',
            text: String(threadSentBody.text ?? ''),
            mentions: [],
            traceId: '',
            ephemeralTo: '',
            createdAt: now,
          },
          triggeredRunIds: [],
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-p2/summarize' && init?.method === 'POST') {
      return new Response(
        JSON.stringify({ summary: '核心结论：按租户分片。', messageCount: 2, scopeLabel: '近期消息' }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/db/create' && init?.method === 'POST') {
      createdPageBody = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>
      return new Response(JSON.stringify({ ok: true, ids: ['pg-new-1'] }), { status: 200 })
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  // 0. 左侧侧边栏支持原生 hover 切换展开/收起图标（sidebar-group-fold），点击后展开子讨论串
  const sidebar = render(
    <MemoryRouter initialEntries={['/channels/ch-p2']}>
      <ChannelSidebarSections routeChannelId="ch-p2" />
    </MemoryRouter>,
  )
  const toggleBtn = await waitFor(() => sidebar.getByTestId('sidebar-channel-threads-toggle-ch-p2'))
  assert.ok(toggleBtn.querySelector('.sidebar-group-fold .sidebar-group-fold-face'))
  assert.ok(toggleBtn.querySelector('.sidebar-group-fold .sidebar-group-fold-chevron .sidebar-chevron'))
  assert.equal(toggleBtn.querySelector('.sidebar-chevron.is-open'), null)
  fireEvent.click(toggleBtn)
  await waitFor(() => {
    assert.ok(toggleBtn.querySelector('.sidebar-chevron.is-open'))
  })
  const threadLink = await waitFor(() => sidebar.getByTestId('sidebar-thread-m-root'))
  assert.equal(threadLink.getAttribute('href'), '/channels/ch-p2?thread=m-root')
  assert.ok(threadLink.textContent?.includes('讨论一下数据库分库方案'))
  sidebar.unmount()

  const stage = render(
    <MemoryRouter initialEntries={['/channels/ch-p2']}>
      <ChannelStage channelId="ch-p2" />
    </MemoryRouter>,
  )

  // 1. 点击「1 条回复」在同一主画布切入二级面包屑讨论串（不再开第 4 栏），并复用主编辑器发送串内回复
  const threadBar = await waitFor(() => stage.getByTestId('channel-thread-bar-m-root'))
  fireEvent.click(threadBar)
  await waitFor(() => {
    assert.ok(stage.getByTestId('channel-breadcrumb-parent'))
    assert.ok(stage.getByTestId('channel-thread-crumb').textContent?.includes('讨论一下数据库分库方案'))
    assert.ok(stage.getByTestId('channel-thread-reply-m-r1'))
  })

  // 复用主 Tiptap ChannelComposer 插入 @97 并发送，自动带上 threadRootId
  fireEvent.click(stage.getByTestId('channel-mention-btn'))
  const menu = await waitFor(() => stage.getByTestId('channel-mention-menu'))
  const opt97 = [...menu.querySelectorAll('[role="option"]')].find((el) => el.textContent?.includes('@97'))
  assert.ok(opt97)
  fireEvent.mouseDown(opt97!)
  const sendBtn = stage.getByTestId('channel-composer-send') as HTMLButtonElement
  await waitFor(() => assert.equal(sendBtn.disabled, false))
  fireEvent.click(sendBtn)
  await waitFor(() => {
    assert.equal(threadSentBody?.threadRootId, 'm-root')
    assert.equal(threadSentBody?.text, '@97')
    assert.ok(stage.getByTestId('channel-thread-reply-m-r2'))
  })

  // 点击父级面包屑返回主聊天流
  fireEvent.click(stage.getByTestId('channel-breadcrumb-parent'))
  await waitFor(() => {
    assert.equal(stage.queryByTestId('channel-thread-crumb'), null)
    assert.ok(stage.getByTestId('channel-thread-bar-m-root'))
  })

  // 2. 通过顶栏「更多」菜单点击「AI 总结要点」，并一键存为 BIU 页面
  fireEvent.click(stage.getByTestId('channel-more-menu-btn'))
  fireEvent.click(await waitFor(() => stage.getByTestId('channel-summarize-btn')))
  await waitFor(() => {
    assert.ok(stage.getByTestId('channel-summary-modal').textContent?.includes('按租户分片'))
  })
  fireEvent.click(stage.getByTestId('channel-summary-save-page'))
  await waitFor(() => {
    assert.equal(createdPageBody?.path, '/pages')
    assert.ok(stage.getByTestId('channel-saved-page-toast'))
  })
})

test('ChannelSidebarSections derives expandable sub-threads from loaded channel detail when /api/channels omits threads', async () => {
  const now = Date.now()
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname === '/api/channels') {
      return new Response(
        JSON.stringify({
          channels: [
            {
              id: 'ch-legacy',
              workspaceId: 'ws-1',
              kind: 'channel',
              dmKey: '',
              name: '最近的消息',
              topic: '',
              accessMode: 'workspace',
              createdBy: 'acc-alice',
              createdAt: now,
              updatedAt: now,
              memberCount: 2,
              agentCount: 1,
              lastMessageAt: now,
              lastMessageText: '根消息',
            },
          ],
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-legacy') {
      return new Response(
        JSON.stringify({
          channel: {
            id: 'ch-legacy',
            workspaceId: 'ws-1',
            kind: 'channel',
            dmKey: '',
            name: '最近的消息',
            topic: '',
            accessMode: 'workspace',
            createdBy: 'acc-alice',
            createdAt: now,
            updatedAt: now,
            memberCount: 2,
            agentCount: 1,
            lastMessageAt: now,
            lastMessageText: '根消息',
          },
          members: [],
          messages: [
            {
              id: 'm-thread-root',
              channelId: 'ch-legacy',
              seq: 1,
              senderType: 'agent',
              senderId: 'ag-1',
              senderName: '助手',
              replyToId: '',
              text: '关于产品数据划分的方案',
              mentions: [],
              threadSummary: { replyCount: 3, lastReplyAt: now, participantNames: ['lulu'] },
              traceId: '',
              ephemeralTo: '',
              createdAt: now,
            },
          ],
          activities: [],
          myAccountId: 'acc-alice',
          canManageMembers: true,
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const view = render(
    <MemoryRouter initialEntries={['/channels/ch-legacy']}>
      <ChannelSidebarSections routeChannelId="ch-legacy" />
      <ChannelStage channelId="ch-legacy" />
    </MemoryRouter>,
  )

  const toggleBtn = await waitFor(() => view.getByTestId('sidebar-channel-threads-toggle-ch-legacy'))
  fireEvent.click(toggleBtn)
  const link = await waitFor(() => view.getByTestId('sidebar-thread-m-thread-root'))
  assert.ok(link.textContent?.includes('关于产品数据划分的方案'))
  assert.ok(link.textContent?.includes('3'))
})

test('sidebar uses hide/leave/unfollow menus, breadcrumb toggles thread follow, and disband requires two-step confirm in members modal', async () => {
  let hiddenCalled = false
  let unfollowedCalled = false
  let disbandCalled = false
  const now = Date.now()
  const rootMsg = {
    id: 'm-root-f',
    channelId: 'ch-grp',
    seq: 1,
    senderType: 'account',
    senderId: 'acc-alice',
    senderName: 'Alice',
    replyToId: '',
    text: '讨论 Follow 机制',
    mentions: [],
    threadSummary: { replyCount: 1, lastReplyAt: now, participantNames: ['Bob'], following: true },
    traceId: '',
    ephemeralTo: '',
    createdAt: now - 2000,
  }
  const replyMsg = {
    id: 'm-rep-f',
    channelId: 'ch-grp',
    seq: 2,
    senderType: 'account',
    senderId: 'acc-bob',
    senderName: 'Bob',
    replyToId: '',
    threadRootId: 'm-root-f',
    text: '完全同意',
    mentions: [],
    traceId: '',
    ephemeralTo: '',
    createdAt: now - 1000,
  }
  const chGrp = {
    id: 'ch-grp',
    workspaceId: 'ws-1',
    kind: 'channel',
    dmKey: '',
    name: '产品讨论组',
    topic: '',
    accessMode: 'private',
    createdBy: 'acc-alice',
    createdAt: now - 5000,
    updatedAt: now,
    memberCount: 2,
    agentCount: 0,
    lastMessageAt: now,
    lastMessageText: rootMsg.text,
    canManage: true,
    threads: [{ rootId: 'm-root-f', title: '讨论 Follow 机制', replyCount: 1, lastReplyAt: now }],
  }
  const dmBob = {
    id: 'dm-bob',
    workspaceId: 'ws-1',
    kind: 'dm',
    dmKey: 'acc-alice\0acc-bob',
    peerAccountId: 'acc-bob',
    peerName: 'Bob',
    name: 'Bob',
    topic: '',
    accessMode: 'private',
    createdBy: 'acc-alice',
    createdAt: now - 4000,
    updatedAt: now - 1000,
    memberCount: 2,
    agentCount: 0,
    lastMessageAt: now - 1000,
    lastMessageText: 'hi',
    canManage: true,
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname === '/api/channels' && (!init?.method || init.method === 'GET')) {
      return new Response(JSON.stringify({ channels: [chGrp, dmBob] }), { status: 200 })
    }
    if (url.pathname === '/api/account/workspace-profile') {
      return new Response(JSON.stringify({ accountId: 'acc-alice', name: 'Alice' }), { status: 200 })
    }
    if (url.pathname === '/api/channels/ch-grp' && (!init?.method || init.method === 'GET')) {
      return new Response(
        JSON.stringify({
          channel: chGrp,
          members: [
            { channelId: 'ch-grp', memberType: 'account', memberId: 'acc-alice', role: 'owner', addedBy: 'acc-alice', addedAt: 1, name: 'Alice', isOwn: true },
            { channelId: 'ch-grp', memberType: 'account', memberId: 'acc-bob', role: 'member', addedBy: 'acc-alice', addedAt: 1, name: 'Bob', isOwn: false },
          ],
          messages: [rootMsg],
          activities: [],
          myAccountId: 'acc-alice',
          canManageMembers: true,
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-grp/threads/m-root-f' && (!init?.method || init.method === 'GET')) {
      return new Response(JSON.stringify({ channelId: 'ch-grp', root: rootMsg, replies: [replyMsg], following: true }), { status: 200 })
    }
    if (url.pathname === '/api/channels/ch-grp/threads/m-root-f/follow' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body ?? '{}')) as { follow?: boolean }
      if (body.follow === false) unfollowedCalled = true
      return new Response(
        JSON.stringify({
          ok: true,
          channelId: 'ch-grp',
          rootId: 'm-root-f',
          following: Boolean(body.follow),
          channel: { ...chGrp, threads: body.follow ? chGrp.threads : [] },
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/dm-bob/preferences' && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body ?? '{}')) as { hidden?: boolean }
      if (body.hidden) hiddenCalled = true
      return new Response(JSON.stringify({ channel: { ...dmBob, hidden: Boolean(body.hidden) } }), { status: 200 })
    }
    if (url.pathname === '/api/channels/ch-grp' && init?.method === 'DELETE') {
      disbandCalled = true
      return new Response(JSON.stringify({ ok: true, id: 'ch-grp' }), { status: 200 })
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const view = render(
    <MemoryRouter initialEntries={['/channels/ch-grp?thread=m-root-f']}>
      <ChannelSidebarSections routeChannelId="ch-grp" />
      <ChannelStage channelId="ch-grp" />
    </MemoryRouter>,
  )

  // 1. 私聊侧栏 ⋯ 菜单包含置顶、免打扰、隐藏对话（且不含解散/删除），点击隐藏仅移除自身侧栏
  const moreBtns = await waitFor(() => {
    const btns = view.getAllByTestId('sidebar-row-more')
    assert.ok(btns.length >= 2)
    return btns
  })
  const dmMoreBtn = moreBtns.find((b) => b.getAttribute('aria-label') === 'Bob 更多操作')!
  fireEvent.click(dmMoreBtn)
  const hideDmItem = await waitFor(() => view.getByTestId('sidebar-row-menu-hide'))
  assert.ok(view.getByTestId('sidebar-row-menu-pin'))
  assert.ok(view.getByTestId('sidebar-row-menu-mute'))
  assert.equal(hideDmItem.textContent?.includes('隐藏对话'), true)
  assert.equal(view.queryByTestId('sidebar-row-menu-delete'), null)
  assert.equal(view.queryByTestId('sidebar-row-menu-disband'), null)
  fireEvent.click(hideDmItem)
  await waitFor(() => {
    assert.equal(hiddenCalled, true)
    assert.equal(view.getByTestId('sidebar-channels-section').textContent?.includes('Bob'), false)
  })

  // 1.5 群主在多人聊天侧栏 ⋯ 菜单可见置顶、免打扰、隐藏聊天与「解散聊天」（点解散先弹二次确认框，不直接删）
  const grpMoreBtn = view.getAllByTestId('sidebar-row-more').find((b) => b.getAttribute('aria-label') === '产品讨论组 更多操作')!
  fireEvent.click(grpMoreBtn)
  assert.ok(await waitFor(() => view.getByTestId('sidebar-row-menu-pin')))
  assert.ok(view.getByTestId('sidebar-row-menu-mute'))
  assert.ok(view.getByTestId('sidebar-row-menu-hide'))
  fireEvent.click(view.getByTestId('sidebar-row-menu-disband'))
  assert.ok(await waitFor(() => view.getByTestId('sidebar-disband-confirm-dialog')))
  assert.equal(disbandCalled, false)
  fireEvent.click(view.getByText('取消'))
  await waitFor(() => assert.equal(view.queryByTestId('sidebar-disband-confirm-dialog'), null))

  // 2. 二级面包屑顶栏「已关注」按钮可切换取消关注，并同步从侧栏移除子讨论串
  const followBtn = await waitFor(() => view.getByTestId('channel-thread-follow-btn'))
  assert.equal(followBtn.getAttribute('aria-pressed'), 'true')
  fireEvent.click(followBtn)
  await waitFor(() => {
    assert.equal(unfollowedCalled, true)
    assert.equal(view.getByTestId('channel-thread-follow-btn').getAttribute('aria-pressed'), 'false')
    assert.equal(view.queryByTestId('sidebar-thread-m-root-f'), null)
  })

  // 3. 群成员弹窗常驻「添加成员 / 添加 Agent」入口（无候选人时展示明确提示而非隐身），群主解散需二次确认
  fireEvent.click(view.getByTestId('channel-more-menu-btn'))
  fireEvent.click(await waitFor(() => view.getByTestId('channel-manage-members')))
  fireEvent.click(await waitFor(() => view.getByTestId('channel-open-add-member')))
  assert.ok(await waitFor(() => view.getByTestId('channel-add-member-panel').textContent?.includes('全部成员均已在该聊天中')))
  fireEvent.click(view.getByTestId('channel-open-add-agent'))
  assert.ok(await waitFor(() => view.getByTestId('channel-add-agent-panel').textContent?.includes('已全部在该聊天中')))
  fireEvent.click(await waitFor(() => view.getByTestId('channel-disband-btn')))
  assert.equal(disbandCalled, false)
  fireEvent.click(await waitFor(() => view.getByTestId('channel-disband-confirm-btn')))
  await waitFor(() => {
    assert.equal(disbandCalled, true)
  })
})

test('ChannelStage renders webhook messages with badge and manages webhooks in-place inside right floating panel', async () => {
  const now = Date.now()
  let webhooks: Array<{
    id: string
    channelId: string
    name: string
    token: string
    url: string
    enabled: boolean
    autoTriggerAgentId?: string
    createdBy: string
    createdByName: string
    canManage: boolean
    lastUsedAt: number
    createdAt: number
    updatedAt: number
  }> = []
  let testedWebhookId = ''
  let rotatedWebhookId = ''

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost')
    if (url.pathname === '/api/channels/ch-wh') {
      return new Response(
        JSON.stringify({
          channel: {
            id: 'ch-wh',
            workspaceId: 'ws-1',
            kind: 'channel',
            dmKey: '',
            name: '自动化告警群',
            topic: '',
            accessMode: 'private',
            createdBy: 'acc-alice',
            createdAt: now,
            updatedAt: now,
            memberCount: 1,
            agentCount: 1,
            lastMessageAt: now,
            lastMessageText: '构建通过',
          },
          members: [
            {
              channelId: 'ch-wh',
              memberType: 'account',
              memberId: 'acc-alice',
              role: 'owner',
              addedBy: 'acc-alice',
              addedAt: now,
              name: 'Alice',
              isOwn: true,
            },
            {
              channelId: 'ch-wh',
              memberType: 'agent',
              memberId: 'ag-ops',
              role: 'member',
              addedBy: 'acc-alice',
              addedAt: now,
              name: '运维助手',
              ownerAccountId: 'acc-alice',
              ownerName: 'Alice',
              isOwn: true,
            },
          ],
          messages: [
            {
              id: 'm-wh-1',
              channelId: 'ch-wh',
              seq: 1,
              senderType: 'webhook',
              senderId: 'wh-existing',
              senderName: 'GitHub Actions',
              replyToId: '',
              text: '**main 构建通过**\n\n全部 37 项单测通过',
              mentions: [],
              traceId: '',
              ephemeralTo: '',
              meta: { kind: 'info', webhookId: 'wh-existing', webhookName: 'GitHub Actions' },
              createdAt: now,
            },
          ],
          activities: [],
          myAccountId: 'acc-alice',
          canManageMembers: true,
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-wh/webhooks' && (!init?.method || init.method === 'GET')) {
      return new Response(JSON.stringify({ webhooks }), { status: 200 })
    }
    if (url.pathname === '/api/channels/ch-wh/webhooks' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body ?? '{}')) as { name?: string; autoTriggerAgentId?: string }
      const created = {
        id: 'wh-1',
        channelId: 'ch-wh',
        name: body.name || 'Webhook',
        token: 'wh_secret_1',
        url: '/api/webhooks/channels/wh_secret_1',
        enabled: true,
        ...(body.autoTriggerAgentId ? { autoTriggerAgentId: body.autoTriggerAgentId } : {}),
        createdBy: 'acc-alice',
        createdByName: 'Alice',
        canManage: true,
        lastUsedAt: 0,
        createdAt: now,
        updatedAt: now,
      }
      webhooks = [created, ...webhooks]
      return new Response(JSON.stringify({ webhook: created }), { status: 200 })
    }
    if (url.pathname === '/api/channels/ch-wh/webhooks/wh-1/test' && init?.method === 'POST') {
      testedWebhookId = 'wh-1'
      return new Response(
        JSON.stringify({
          message: {
            id: 'm-wh-test',
            channelId: 'ch-wh',
            seq: 2,
            senderType: 'webhook',
            senderId: 'wh-1',
            senderName: 'Sentry',
            replyToId: '',
            text: '测试消息',
            mentions: [],
            traceId: '',
            ephemeralTo: '',
            createdAt: now,
          },
          triggeredRunIds: [],
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-wh/webhooks/wh-1/rotate' && init?.method === 'POST') {
      rotatedWebhookId = 'wh-1'
      webhooks = webhooks.map((w) =>
        w.id === 'wh-1' ? { ...w, token: 'wh_secret_2', url: '/api/webhooks/channels/wh_secret_2' } : w,
      )
      return new Response(JSON.stringify({ webhook: webhooks[0] }), { status: 200 })
    }
    if (url.pathname === '/api/channels/ch-wh/webhooks/wh-1' && init?.method === 'DELETE') {
      webhooks = webhooks.filter((w) => w.id !== 'wh-1')
      return new Response(JSON.stringify({ ok: true, id: 'wh-1' }), { status: 200 })
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const stage = render(
    <MemoryRouter initialEntries={['/channels/ch-wh']}>
      <ChannelStage channelId="ch-wh" />
    </MemoryRouter>,
  )

  // 1. Webhook 消息带有 Webhook 徽标与 Markdown 内容
  await waitFor(() => {
    assert.ok(stage.queryByTestId('channel-msg-webhook-badge'))
    assert.ok(stage.container.textContent?.includes('GitHub Actions'))
    assert.ok(stage.container.textContent?.includes('main 构建通过'))
  })

  // 2. 在右侧悬浮面板「管理」中新建、查看 URL、发送测试、重置密钥与删除（零居中弹窗）
  fireEvent.click(stage.getByTestId('channel-more-menu-btn'))
  fireEvent.click(await waitFor(() => stage.getByTestId('channel-manage-members')))
  assert.equal(document.querySelector('.biu-float-overlay'), null)
  fireEvent.click(await waitFor(() => stage.getByTestId('channel-open-add-webhook')))
  fireEvent.change(stage.getByTestId('channel-webhook-name-input'), { target: { value: 'Sentry 告警' } })
  fireEvent.change(stage.getByTestId('channel-webhook-agent-select'), { target: { value: 'ag-ops' } })
  fireEvent.click(stage.getByTestId('channel-create-webhook-submit'))

  await waitFor(() => {
    assert.ok(stage.queryByTestId('channel-webhook-url-wh-1')?.textContent?.includes('/api/webhooks/channels/wh_secret_1'))
  })

  fireEvent.click(stage.getByTestId('channel-webhook-test-wh-1'))
  await waitFor(() => {
    assert.equal(testedWebhookId, 'wh-1')
    assert.ok(stage.container.textContent?.includes('发送一条测试消息'))
  })

  fireEvent.click(stage.getByTestId('channel-webhook-rotate-wh-1'))
  await waitFor(() => {
    assert.equal(rotatedWebhookId, 'wh-1')
    assert.ok(stage.queryByTestId('channel-webhook-url-wh-1')?.textContent?.includes('/api/webhooks/channels/wh_secret_2'))
    assert.ok(stage.container.textContent?.includes('旧链接已失效'))
  })

  fireEvent.click(stage.getByTestId('channel-webhook-delete-wh-1'))
  await waitFor(() => {
    assert.equal(Boolean(stage.queryByTestId('channel-webhook-row-wh-1')), false)
  })
})

test('sidebar create dialog supports announcement/forum modes and Announcement channel renders read-only dock for non-admins', async () => {
  const now = Date.now()
  let createdPayload: Record<string, unknown> | null = null
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname === '/api/channels' && (!init?.method || init.method === 'GET')) {
      return new Response(
        JSON.stringify({
          channels: [
            {
              id: 'ch-ann',
              workspaceId: 'ws-1',
              kind: 'announcement',
              dmKey: '',
              name: '发版公告',
              topic: '',
              accessMode: 'workspace',
              createdBy: 'acc-alice',
              createdAt: now,
              updatedAt: now,
              memberCount: 2,
              agentCount: 0,
              lastMessageAt: now,
              lastMessageText: 'v3.0 上线',
              canManage: false,
              canPost: false,
            },
            {
              id: 'ch-forum',
              workspaceId: 'ws-1',
              kind: 'forum',
              dmKey: '',
              name: '方案讨论',
              topic: '',
              accessMode: 'workspace',
              createdBy: 'acc-alice',
              createdAt: now,
              updatedAt: now,
              memberCount: 2,
              agentCount: 0,
              lastMessageAt: now,
              lastMessageText: '设计评审',
              canManage: true,
              canPost: true,
            },
          ],
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels' && init?.method === 'POST') {
      createdPayload = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          channel: {
            id: 'ch-new-ann',
            workspaceId: 'ws-1',
            kind: createdPayload.kind ?? 'announcement',
            dmKey: '',
            name: createdPayload.name ?? '发版公告',
            topic: '',
            accessMode: createdPayload.accessMode ?? 'private',
            createdBy: 'acc-bob',
            createdAt: now,
            updatedAt: now,
            memberCount: 1,
            agentCount: 0,
            lastMessageAt: now,
            lastMessageText: '',
            canManage: true,
            canPost: true,
          },
          members: [],
          messages: [],
          activities: [],
          myAccountId: 'acc-bob',
          canManageMembers: true,
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-ann') {
      return new Response(
        JSON.stringify({
          channel: {
            id: 'ch-ann',
            workspaceId: 'ws-1',
            kind: 'announcement',
            dmKey: '',
            name: '发版公告',
            topic: '',
            accessMode: 'workspace',
            createdBy: 'acc-alice',
            createdAt: now,
            updatedAt: now,
            memberCount: 2,
            agentCount: 0,
            lastMessageAt: now,
            lastMessageText: 'v3.0 上线',
            canManage: false,
            canPost: false,
          },
          members: [
            { channelId: 'ch-ann', memberType: 'account', memberId: 'acc-alice', role: 'owner', addedBy: 'acc-alice', addedAt: now, name: 'Alice', isOwn: false },
            { channelId: 'ch-ann', memberType: 'account', memberId: 'acc-bob', role: 'member', addedBy: 'acc-alice', addedAt: now, name: 'Bob', isOwn: true },
          ],
          messages: [
            {
              id: 'm-ann-1',
              channelId: 'ch-ann',
              seq: 1,
              senderType: 'account',
              senderId: 'acc-alice',
              senderName: 'Alice',
              replyToId: '',
              text: 'v3.0 正式上线！',
              mentions: [],
              traceId: '',
              ephemeralTo: '',
              createdAt: now,
            },
          ],
          activities: [],
          myAccountId: 'acc-bob',
          canManageMembers: false,
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/account/workspace-profile') {
      return new Response(JSON.stringify({ accountId: 'acc-bob' }), { status: 200 })
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const view = render(
    <MemoryRouter initialEntries={['/channels/ch-ann']}>
      <ChannelSidebarSections routeChannelId="ch-ann" />
      <ChannelStage channelId="ch-ann" />
    </MemoryRouter>,
  )

  await waitFor(() => {
    assert.ok(view.queryByTestId('sidebar-channel-icon-announcement-ch-ann'))
    assert.ok(view.queryByTestId('sidebar-channel-icon-forum-ch-forum'))
    assert.ok(view.queryByTestId('channel-announcement-banner'))
    assert.ok(view.queryByTestId('channel-announcement-badge-m-ann-1'))
    assert.ok(view.queryByTestId('channel-announcement-readonly-bar'))
  })

  // 打开新建聊天弹窗并创建一个公告频道（无需强制选人即可直接创建）
  fireEvent.click(view.getByTestId('sidebar-create-channel'))
  fireEvent.click(await waitFor(() => view.getByTestId('create-channel-kind-announcement')))
  fireEvent.change(view.getByTestId('create-channel-name'), { target: { value: '全员通知' } })
  fireEvent.click(view.getByTestId('create-channel-submit'))

  await waitFor(() => {
    assert.equal(createdPayload?.kind, 'announcement')
    assert.equal(createdPayload?.name, '全员通知')
  })
})

test('Forum channel renders board, creates new posts, filters by status, and toggles post status in thread detail', async () => {
  const now = Date.now()
  let posts: ChannelMessageView[] = [
    {
      id: 'post-1',
      channelId: 'ch-forum',
      seq: 1,
      senderType: 'account',
      senderId: 'acc-alice',
      senderName: 'Alice',
      replyToId: '',
      text: '计划下周重构缓存层，请大家评审。',
      mentions: [],
      traceId: '',
      ephemeralTo: '',
      meta: { postTitle: '缓存层重构方案', postTags: ['方案'], postStatus: 'open' },
      threadSummary: { replyCount: 1, lastReplyAt: now + 1000, participantNames: ['Bob'], following: true },
      createdAt: now,
    },
  ]

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname === '/api/channels/ch-forum' && (!init?.method || init.method === 'GET')) {
      return new Response(
        JSON.stringify({
          channel: {
            id: 'ch-forum',
            workspaceId: 'ws-1',
            kind: 'forum',
            dmKey: '',
            name: '架构讨论区',
            topic: '',
            accessMode: 'workspace',
            forumTags: ['讨论', '问题', '方案'],
            createdBy: 'acc-alice',
            createdAt: now,
            updatedAt: now,
            memberCount: 2,
            agentCount: 0,
            lastMessageAt: now,
            lastMessageText: '缓存层重构方案',
            canManage: true,
            canPost: true,
          },
          members: [
            { channelId: 'ch-forum', memberType: 'account', memberId: 'acc-alice', role: 'owner', addedBy: 'acc-alice', addedAt: now, name: 'Alice', isOwn: true },
          ],
          messages: posts,
          activities: [],
          myAccountId: 'acc-alice',
          canManageMembers: true,
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-forum/messages' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body ?? '{}')) as { text?: string; postTitle?: string; postTags?: string[] }
      const created = {
        id: 'post-2',
        channelId: 'ch-forum',
        seq: 2,
        senderType: 'account' as const,
        senderId: 'acc-alice',
        senderName: 'Alice',
        replyToId: '',
        text: body.text ?? '',
        mentions: [],
        traceId: '',
        ephemeralTo: '',
        meta: { postTitle: body.postTitle ?? '未命名帖子', postTags: body.postTags ?? [], postStatus: 'open' as const },
        createdAt: now + 2000,
      }
      posts = [...posts, created]
      return new Response(JSON.stringify({ message: created, triggeredRunIds: [] }), { status: 200 })
    }
    if (url.pathname === '/api/channels/ch-forum/threads/post-1') {
      return new Response(
        JSON.stringify({
          channelId: 'ch-forum',
          root: posts[0],
          replies: [
            {
              id: 'reply-1',
              channelId: 'ch-forum',
              seq: 3,
              senderType: 'account',
              senderId: 'acc-bob',
              senderName: 'Bob',
              replyToId: '',
              threadRootId: 'post-1',
              text: '同意这个方案！',
              mentions: [],
              traceId: '',
              ephemeralTo: '',
              createdAt: now + 1000,
            },
          ],
          following: true,
        }),
        { status: 200 },
      )
    }
    if (url.pathname === '/api/channels/ch-forum/messages/post-1' && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body ?? '{}')) as { postStatus?: 'open' | 'resolved' | 'closed' }
      posts = posts.map((p) =>
        p.id === 'post-1' ? { ...p, meta: { ...p.meta, postStatus: body.postStatus ?? p.meta?.postStatus } } : p,
      )
      return new Response(JSON.stringify({ message: posts[0] }), { status: 200 })
    }
    if (url.pathname === '/api/account/workspace-profile') {
      return new Response(JSON.stringify({ accountId: 'acc-alice' }), { status: 200 })
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const stage = render(
    <MemoryRouter initialEntries={['/channels/ch-forum']}>
      <ChannelStage channelId="ch-forum" />
    </MemoryRouter>,
  )

  // 1. 论坛主视图展示帖子卡片
  await waitFor(() => {
    assert.ok(stage.queryByTestId('channel-forum-board'))
    assert.ok(stage.queryByTestId('forum-post-card-post-1'))
    assert.ok(stage.container.textContent?.includes('缓存层重构方案'))
  })

  // 2. 新建一篇帖子
  fireEvent.click(stage.getByTestId('forum-new-post-btn'))
  fireEvent.change(stage.getByTestId('forum-post-title-input'), { target: { value: '搜索慢查询排查' } })
  fireEvent.change(stage.getByTestId('forum-post-body-input'), { target: { value: '需要加复合索引' } })
  fireEvent.click(stage.getByTestId('forum-draft-tag-问题'))
  fireEvent.click(stage.getByTestId('forum-post-submit'))

  await waitFor(() => {
    assert.ok(stage.queryByTestId('forum-post-card-post-2'))
    assert.ok(stage.container.textContent?.includes('搜索慢查询排查'))
  })

  // 3. 点击帖子进入详情并关闭帖子 -> 展示已关闭只读条
  fireEvent.click(stage.getByTestId('forum-post-card-post-1'))
  await waitFor(() => {
    assert.ok(stage.queryByTestId('forum-post-detail-header'))
    assert.ok(stage.container.textContent?.includes('同意这个方案！'))
  })

  fireEvent.click(stage.getByTestId('forum-thread-toggle-closed'))
  await waitFor(() => {
    assert.ok(stage.queryByTestId('forum-post-closed-bar'))
  })
})
