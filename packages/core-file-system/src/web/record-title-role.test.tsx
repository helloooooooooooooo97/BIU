/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { RecordTitle } from './browser-row-title.tsx'

afterEach(() => {
  cleanup()
})

function noop() {}

for (const [shareRole, expectedTone, expectedText] of [
  ['管理', 'manage', '管理'],
  ['编辑', 'edit', '编辑'],
  ['评论', 'comment', '评论'],
  ['查看', 'read', '查看'],
] as const) {
  test(`RecordTitle renders ${expectedTone} permission icon at the trailing end of title`, () => {
    render(
      <RecordTitle
        row={{ id: 'r1', title: '金露宝', shareRole }}
        label="金露宝"
        treeOn={false}
        collapsed
        onToggleCollapsed={noop}
        pick={{}}
        onOpenSplit={noop}
        onOpenRow={noop}
        onWriteEmoji={noop}
      />,
    )

    const badge = screen.getByTestId('fsdb-title-role-icon')
    assert.equal(badge.getAttribute('data-role'), expectedTone)
    assert.equal(badge.getAttribute('aria-label'), `我的权限：${expectedText}`)
    assert.equal(badge.getAttribute('data-dock-tip'), `我的权限：${expectedText}`)
    assert.ok(badge.querySelector('svg'))
  })
}

test('RecordTitle renders permission icon in armed mode and omits it when row has no shareRole', () => {
  const { rerender } = render(
    <RecordTitle
      row={{ id: 'r2', title: '代理助手', shareRole: '管理' }}
      label="代理助手"
      treeOn
      kidCount={2}
      collapsed
      onToggleCollapsed={noop}
      pick={{}}
      onOpenSplit={noop}
      onOpenRow={noop}
      onWriteEmoji={noop}
      toolsArmed
    />,
  )

  const badge = screen.getByTestId('fsdb-title-role-icon')
  assert.equal(badge.getAttribute('data-role'), 'manage')
  assert.ok(badge.closest('.fsdb-title-host')?.classList.contains('has-tree-count'))

  rerender(
    <RecordTitle
      row={{ id: 'r3', title: '系统成员' }}
      label="系统成员"
      treeOn={false}
      collapsed
      onToggleCollapsed={noop}
      pick={{}}
      onOpenSplit={noop}
      onOpenRow={noop}
      onWriteEmoji={noop}
      toolsArmed
    />,
  )
  assert.equal(screen.queryByTestId('fsdb-title-role-icon'), null)
})
