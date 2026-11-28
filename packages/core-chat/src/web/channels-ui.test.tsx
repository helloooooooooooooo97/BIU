/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ChannelSidebarSections } from './channel-sidebar.tsx'
import { ChannelStage } from './channel-view.tsx'
import { MemberDmAction, MemberIcon, membersChrome } from './members-chrome.tsx'
import { resetChannelStore } from './channel-store.ts'

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
  const imgs = [...view.container.querySelectorAll('img')].map((el) => el.getAttribute('src'))
  assert.ok(imgs.includes(bobAvatar))

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
  })

  // 打开「群成员与 Agent」弹窗：必须使用统一 .biu-float-overlay / .scfg-float 且头像一致
  fireEvent.click(view.getByTestId('channel-manage-members'))
  const modal = document.querySelector('.biu-float-overlay .biu-float.scfg-float')
  assert.ok(modal, 'members modal must reuse unified .biu-float.scfg-float dialog style')
  const modalImgs = [...modal.querySelectorAll('img')].map((el) => el.getAttribute('src'))
  assert.ok(modalImgs.includes(aliceAvatar))
  assert.ok(modalImgs.includes(bobAvatar))
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
    assert.ok(view.getByTestId('channel-msg-sync-m-ag'))
  })

  // 归属人点击单条消息上的「同步到 1v1」
  fireEvent.click(view.getByTestId('channel-msg-sync-m-ag'))
  await waitFor(() => {
    assert.deepEqual(syncedPayload, { agentId: 'ag-mine', messageId: 'm-ag' })
  })

  // 打开群成员与 Agent 弹窗并切换只读上下文模式
  fireEvent.click(view.getByTestId('channel-manage-members'))
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

  fireEvent.click(stage.getByTestId('channel-msg-edit-m-2'))
  const editorBox = stage.getByTestId('channel-msg-editor-m-2').querySelector('textarea')!
  fireEvent.change(editorBox, { target: { value: '编辑后的内容' } })
  fireEvent.click(stage.getByTestId('channel-msg-edit-save-m-2'))
  await waitFor(() => {
    assert.equal(editedBody, '编辑后的内容')
    assert.ok(stage.getByTestId('channel-msg-edited-m-2'))
  })

  fireEvent.click(stage.getByTestId('channel-msg-recall-m-2'))
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

  // 2. 置顶与收藏消息
  fireEvent.click(stage.getByTestId('channel-msg-pin-m-1'))
  fireEvent.click(stage.getByTestId('channel-msg-save-m-1'))
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
  fireEvent.click(stage.getByTestId('channel-manage-members'))
  await waitFor(() => assert.ok(stage.getByTestId('channel-leave-btn')))
  fireEvent.click(stage.getByTestId('channel-pref-pin'))
  await waitFor(() => {
    assert.deepEqual(prefPatched, { pinned: true })
  })
})

test('ChannelStage supports Threads drawer, AI summary modal, and saving message to BIU page', async () => {
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

  const stage = render(
    <MemoryRouter initialEntries={['/channels/ch-p2']}>
      <ChannelStage channelId="ch-p2" />
    </MemoryRouter>,
  )

  // 1. 点击「1 条回复」打开右侧讨论串面板并发送串内回复
  const threadBar = await waitFor(() => stage.getByTestId('channel-thread-bar-m-root'))
  fireEvent.click(threadBar)
  await waitFor(() => assert.ok(stage.getByTestId('channel-thread-reply-m-r1')))

  fireEvent.change(stage.getByTestId('channel-thread-input'), { target: { value: '同意这个方案' } })
  fireEvent.click(stage.getByTestId('channel-thread-send'))
  await waitFor(() => {
    assert.equal(threadSentBody?.threadRootId, 'm-root')
    assert.equal(threadSentBody?.text, '同意这个方案')
    assert.ok(stage.getByTestId('channel-thread-reply-m-r2'))
  })

  // 2. 点击「✨ 总结」弹出 AI 聊天要点总结，并一键存为 BIU 页面
  fireEvent.click(stage.getByTestId('channel-summarize-btn'))
  await waitFor(() => {
    assert.ok(stage.getByTestId('channel-summary-modal').textContent?.includes('按租户分片'))
  })
  fireEvent.click(stage.getByTestId('channel-summary-save-page'))
  await waitFor(() => {
    assert.equal(createdPageBody?.path, '/pages')
    assert.ok(stage.getByTestId('channel-saved-page-toast'))
  })
})
