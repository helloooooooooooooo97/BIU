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

  // 鼠标悬停展开悬浮面板，可见所有成员与 Agent
  fireEvent.mouseEnter(view.getByTestId('channel-floating-sidebar'))
  assert.equal(Boolean(view.queryByTestId('channel-floating-panel')), true)
  assert.equal(Boolean(view.queryByTestId('channel-roster-agent-ag-1')), true)
  assert.equal(Boolean(view.queryByTestId('channel-roster-member-acc-97')), true)
  assert.equal(Boolean(view.queryByTestId('channel-roster-member-acc-lulu')), true)

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
  fireEvent.click(view.getByTestId('channel-quick-search'))
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
