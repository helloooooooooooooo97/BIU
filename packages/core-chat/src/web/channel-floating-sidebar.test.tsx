/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { ChannelFloatingSidebar } from './channel-floating-sidebar.tsx'
import type { ChannelMemberView, ChannelMention, ChannelSummary } from '../shared/channel-types.ts'

const CHANNEL: ChannelSummary = {
  id: 'ch-1',
  workspaceId: 'ws-1',
  kind: 'channel',
  dmKey: '',
  name: '数据小组',
  topic: '',
  accessMode: 'private',
  createdBy: 'acc-97',
  createdAt: 1,
  updatedAt: 2,
  memberCount: 2,
  agentCount: 1,
  lastMessageAt: 2,
  lastMessageText: 'hello?',
  pinned: false,
  muted: false,
}

const MEMBERS: ChannelMemberView[] = [
  {
    channelId: 'ch-1',
    memberType: 'account',
    memberId: 'acc-97',
    role: 'owner',
    addedBy: 'acc-97',
    addedAt: 1,
    name: '97',
    isOwn: true,
  },
  {
    channelId: 'ch-1',
    memberType: 'account',
    memberId: 'acc-lulu',
    role: 'member',
    addedBy: 'acc-97',
    addedAt: 1,
    name: 'lulu@qq.com',
    isOwn: false,
  },
  {
    channelId: 'ch-1',
    memberType: 'agent',
    memberId: 'ag-1',
    role: 'member',
    addedBy: 'acc-97',
    addedAt: 1,
    name: '赤豆新',
    ownerAccountId: 'acc-97',
    ownerName: '97',
    isOwn: true,
  },
]

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

test('ChannelFloatingSidebar collapses to avatar rail, expands on hover, persists pin state, and triggers quick actions', async () => {
  const mentioned: ChannelMention[] = []
  const clickedAgents: string[] = []
  const dmTargets: string[] = []
  let pinsOpened = 0
  const summarizeCalls: boolean[] = []

  const renderSidebar = () =>
    render(
      <ChannelFloatingSidebar
        channel={CHANNEL}
        isDm={false}
        members={MEMBERS}
        activities={[]}
        myAccountId="acc-97"
        canManageMembers
        pinnedMessageCount={2}
        resolveAvatar={() => undefined}
        isOnline={(id) => id === 'acc-97'}
        onMention={(m) => mentioned.push(m)}
        onAgentClick={(id) => clickedAgents.push(id)}
        onOpenDm={(id) => dmTargets.push(id)}
        onOpenManageMembers={() => {}}
        onOpenPins={() => {
          pinsOpened += 1
        }}
        onOpenSaved={() => {}}
        onSummarize={(unreadOnly) => {
          summarizeCalls.push(Boolean(unreadOnly))
        }}
        onToggleSearch={() => {}}
        onToggleChannelPinned={() => {}}
        onToggleChannelMuted={() => {}}
      />,
    )

  const view = renderSidebar()

  // 默认收起为悬浮竖向头像轨
  assert.equal(Boolean(view.queryByTestId('channel-floating-rail')), true)
  assert.equal(Boolean(view.queryByTestId('channel-floating-panel')), false)

  // 胶囊轨中 Agent 头像槽位尺寸大于槽位（28px > 24px），必须用 flex 居中而非 CSS Grid 默认 start 轨道，避免向右下偏移
  const railAgentSlot = view.getByTestId('channel-floating-rail-agent-ag-1')
  assert.equal(railAgentSlot.classList.contains('flex'), true)
  assert.equal(railAgentSlot.classList.contains('items-center'), true)
  assert.equal(railAgentSlot.classList.contains('justify-center'), true)
  assert.equal(railAgentSlot.classList.contains('grid'), false)
  const railAgentMascot = railAgentSlot.querySelector('.sidebar-mascot')
  assert.equal(Boolean(railAgentMascot?.classList.contains('shrink-0')), true)

  // 鼠标悬停展开悬浮面板，可见所有成员与 Agent，且成员在 Agent 上方
  fireEvent.mouseEnter(view.getByTestId('channel-floating-sidebar'))
  assert.equal(Boolean(view.queryByTestId('channel-floating-panel')), true)
  const humansSection = view.getByTestId('channel-roster-humans-section')
  const agentsSection = view.getByTestId('channel-roster-agents-section')
  assert.equal(Boolean(humansSection.compareDocumentPosition(agentsSection) & Node.DOCUMENT_POSITION_FOLLOWING), true)
  assert.equal(Boolean(view.queryByTestId('channel-roster-agent-ag-1')), true)
  assert.equal(Boolean(view.queryByTestId('channel-roster-member-acc-97')), true)
  assert.equal(Boolean(view.queryByTestId('channel-roster-member-acc-lulu')), true)

  // 成员上方搜索框可过滤成员与 Agent
  const rosterSearch = view.getByTestId('channel-roster-search')
  fireEvent.change(rosterSearch, { target: { value: 'lulu' } })
  assert.equal(Boolean(view.queryByTestId('channel-roster-member-acc-lulu')), true)
  assert.equal(Boolean(view.queryByTestId('channel-roster-member-acc-97')), false)
  assert.equal(Boolean(view.queryByTestId('channel-roster-agent-ag-1')), false)
  fireEvent.change(rosterSearch, { target: { value: '' } })
  assert.equal(Boolean(view.queryByTestId('channel-roster-agent-ag-1')), true)

  // 一键 @提及 Agent 与人类成员
  fireEvent.click(view.getByTestId('channel-roster-mention-agent-ag-1'))
  fireEvent.click(view.getByTestId('channel-roster-mention-account-acc-lulu'))
  assert.deepEqual(mentioned, [
    { kind: 'agent', id: 'ag-1', label: '赤豆新' },
    { kind: 'account', id: 'acc-lulu', label: 'lulu@qq.com' },
  ])

  // 快捷入口：在右侧悬浮面板内原地切换置顶、总结、搜索
  fireEvent.click(view.getByTestId('channel-quick-pins'))
  assert.equal(Boolean(view.queryByTestId('channel-pins-modal')), true)
  // 切换到总结 Tab 不应自动触发 AI 调用；切换范围也不自动调用，点击「生成总结」才触发
  fireEvent.click(view.getByTestId('channel-quick-summarize'))
  assert.equal(Boolean(view.queryByTestId('channel-summary-modal')), true)
  assert.deepEqual(summarizeCalls, [])
  fireEvent.click(view.getByTestId('channel-summary-scope-unread'))
  assert.deepEqual(summarizeCalls, [])
  fireEvent.click(view.getByTestId('channel-summary-generate'))
  assert.deepEqual(summarizeCalls, [true])
  // 原「搜索」Tab 已改为「聊天」，且内部保留搜索框
  const chatTab = view.getByTestId('channel-quick-search')
  assert.equal(chatTab.textContent?.trim(), '聊天')
  fireEvent.click(chatTab)
  assert.equal(Boolean(view.queryByTestId('channel-search-input')), true)
  fireEvent.click(view.getByTestId('channel-quick-roster'))
  fireEvent.click(view.getByTestId('channel-roster-dm-acc-lulu'))
  assert.equal(pinsOpened, 1)
  assert.deepEqual(dmTargets, ['acc-lulu'])

  // 点击图钉固定右侧栏，持久化到 localStorage，重新挂载后保持展开常驻
  fireEvent.click(view.getByTestId('channel-floating-pin'))
  assert.equal(view.getByTestId('channel-floating-sidebar').getAttribute('data-pinned'), 'true')
  view.unmount()

  const remounted = renderSidebar()
  await waitFor(() => {
    assert.equal(Boolean(remounted.queryByTestId('channel-floating-panel')), true)
    assert.equal(remounted.getByTestId('channel-floating-sidebar').getAttribute('data-pinned'), 'true')
  })

  // 再次点击图钉取消固定后收起
  fireEvent.click(remounted.getByTestId('channel-floating-pin'))
  await waitFor(() => {
    assert.equal(Boolean(remounted.queryByTestId('channel-floating-rail')), true)
  })
})

test('ChannelFloatingSidebar manage tab batch-imports members and agents statically from saved views', async () => {
  const memberBatchBodies: Array<Record<string, unknown>> = []
  const listCalls: Array<{ path: string; viewId: string }> = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://test.local')
    if (url.pathname === '/api/db/saved-views') {
      const p = url.searchParams.get('path')
      if (p === '/workspace-members') {
        return new Response(JSON.stringify({ views: [{ id: 'mv-data', name: '数据团队' }] }), { status: 200 })
      }
      if (p === '/agents') {
        return new Response(JSON.stringify({ views: [{ id: 'av-rd', name: '研发助手' }] }), { status: 200 })
      }
      return new Response(JSON.stringify({ views: [] }), { status: 200 })
    }
    if (url.pathname === '/api/db/list') {
      const p = url.searchParams.get('path') ?? ''
      const viewId = url.searchParams.get('view_id') ?? ''
      listCalls.push({ path: p, viewId })
      if (p === '/workspace-members' && viewId === 'mv-data') {
        return new Response(
          JSON.stringify({ items: [{ id: 'acc-lulu' }, { id: 'acc-bob' }, { id: 'acc-carol' }], total: 3 }),
          { status: 200 },
        )
      }
      if (p === '/workspace-members') {
        return new Response(
          JSON.stringify({
            items: [
              { id: 'acc-97', title: '97' },
              { id: 'acc-lulu', title: 'lulu@qq.com' },
              { id: 'acc-bob', title: 'Bob' },
              { id: 'acc-carol', title: 'Carol' },
            ],
          }),
          { status: 200 },
        )
      }
      if (p === '/agents' && viewId === 'av-rd') {
        return new Response(
          JSON.stringify({ items: [{ id: 'ag-1' }, { id: 'ag-2' }, { id: 'ag-other' }], total: 3 }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    }
    if (url.pathname === '/api/channels/ch-1/webhooks') {
      return new Response(JSON.stringify({ webhooks: [] }), { status: 200 })
    }
    if (url.pathname === '/api/channels/ch-1/members' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>
      memberBatchBodies.push(body)
      if (body.memberType === 'account') {
        return new Response(
          JSON.stringify({
            members: MEMBERS,
            addedIds: ['acc-bob', 'acc-carol'],
            skippedExistingIds: ['acc-lulu'],
            skippedForbiddenIds: [],
          }),
          { status: 200 },
        )
      }
      return new Response(
        JSON.stringify({
          members: MEMBERS,
          addedIds: ['ag-2'],
          skippedExistingIds: ['ag-1'],
          skippedForbiddenIds: ['ag-other'],
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({}), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const view = render(
    <ChannelFloatingSidebar
      channelId="ch-1"
      channel={CHANNEL}
      isDm={false}
      members={MEMBERS}
      activities={[]}
      myAccountId="acc-97"
      canManageMembers
      pinnedMessageCount={0}
      activeTab="manage"
      resolveAvatar={() => undefined}
      isOnline={() => false}
      onMention={() => {}}
      onAgentClick={() => {}}
      onOpenDm={() => {}}
      onOpenManageMembers={() => {}}
      onOpenPins={() => {}}
      onOpenSaved={() => {}}
      onSummarize={() => {}}
      onToggleSearch={() => {}}
      onToggleChannelPinned={() => {}}
      onToggleChannelMuted={() => {}}
    />,
  )

  // 展开添加成员面板并点击成员视图「数据团队」一键静态导入
  fireEvent.click(view.getByTestId('channel-open-add-member'))
  const memberViewBtn = await waitFor(() => view.getByTestId('channel-import-member-view-mv-data'))
  fireEvent.click(memberViewBtn)

  await waitFor(() => {
    const notice = view.getByTestId('channel-manage-notice').textContent ?? ''
    assert.ok(notice.includes('静态导入 2 位成员'))
    assert.ok(notice.includes('1 位成员已在群内'))
  })

  // 展开添加 Agent 面板并点击 Agent 视图「研发助手」一键静态导入
  fireEvent.click(view.getByTestId('channel-open-add-agent'))
  const agentViewBtn = await waitFor(() => view.getByTestId('channel-import-agent-view-av-rd'))
  fireEvent.click(agentViewBtn)

  await waitFor(() => {
    const notice = view.getByTestId('channel-manage-notice').textContent ?? ''
    assert.ok(notice.includes('静态导入 1 个 Agent'))
    assert.ok(notice.includes('1 个他人归属已跳过'))
  })

  assert.deepEqual(
    listCalls.filter((c) => c.viewId),
    [
      { path: '/workspace-members', viewId: 'mv-data' },
      { path: '/agents', viewId: 'av-rd' },
    ],
  )
  assert.deepEqual(memberBatchBodies, [
    { memberType: 'account', memberIds: ['acc-lulu', 'acc-bob', 'acc-carol'] },
    { memberType: 'agent', memberIds: ['ag-1', 'ag-2', 'ag-other'] },
  ])
})
