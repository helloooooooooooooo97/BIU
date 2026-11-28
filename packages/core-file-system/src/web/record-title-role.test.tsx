/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { isRecordActive, RecordTitle } from './browser-row-title.tsx'

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
  assert.equal(screen.queryByTestId('fsdb-title-scope-icon'), null)
})

for (const [shareScope, expectedTone, expectedText] of [
  ['私人', 'personal', '私人'],
  ['空间', 'workspace', '空间'],
  ['共享', 'shared', '共享'],
] as const) {
  test(`RecordTitle renders ${expectedTone} share scope icon alongside permission icon`, () => {
    const { container } = render(
      <RecordTitle
        row={{ id: 'r-scope', title: '共享文档', shareScope, shareRole: '管理' }}
        label="共享文档"
        treeOn={false}
        collapsed
        onToggleCollapsed={noop}
        pick={{}}
        onOpenSplit={noop}
        onOpenRow={noop}
        onWriteEmoji={noop}
      />,
    )

    const scopeBadge = screen.getByTestId('fsdb-title-scope-icon')
    const roleBadge = screen.getByTestId('fsdb-title-role-icon')
    assert.equal(scopeBadge.getAttribute('data-scope'), expectedTone)
    assert.equal(scopeBadge.getAttribute('aria-label'), `分享范围：${expectedText}`)
    assert.equal(scopeBadge.getAttribute('data-dock-tip'), `分享范围：${expectedText}`)
    assert.ok(scopeBadge.querySelector('svg'))
    const badges = container.querySelector('.fsdb-title-badges')
    assert.ok(badges)
    assert.deepEqual([...badges.children], [scopeBadge, roleBadge])
  })
}

test('RecordTitle renders share scope icon in armed mode with external hint and defines scope ink tones', () => {
  render(
    <RecordTitle
      row={{ id: 'r-ext', title: '公开说明', shareScope: '空间', shareRole: '编辑', hasExternal: true }}
      label="公开说明"
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

  const scopeBadge = screen.getByTestId('fsdb-title-scope-icon')
  assert.equal(scopeBadge.getAttribute('data-scope'), 'workspace')
  assert.equal(scopeBadge.getAttribute('aria-label'), '分享范围：空间（已对外公开或邀请外部访客）')

  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(css, /\.fsdb-title-scope\.is-personal\{--biu-tag:var\(--biu-color-ink-gray\)\}/)
  assert.match(css, /\.fsdb-title-scope\.is-workspace\{--biu-tag:var\(--biu-color-ink-green\)\}/)
  assert.match(css, /\.fsdb-title-scope\.is-shared\{--biu-tag:var\(--biu-color-ink-blue\)\}/)
})

test('RecordTitle marks active MCP, Skill, and Plugin rows in both fast-paint and armed modes', () => {
  assert.equal(isRecordActive({ id: 'p1', running: true }), true)
  assert.equal(isRecordActive({ id: 'm1', enabled: true }), true)
  assert.equal(isRecordActive({ id: 's1', enabled: 'true' }), true)
  assert.equal(isRecordActive({ id: 's2', enabled: false, running: false }), false)

  const { container, rerender } = render(
    <RecordTitle
      row={{ id: 'mcp-1', title: 'Filesystem', enabled: true }}
      label="Filesystem"
      tableIcon="link"
      treeOn={false}
      collapsed
      onToggleCollapsed={noop}
      pick={{}}
      onOpenSplit={noop}
      onOpenRow={noop}
      onWriteEmoji={noop}
    />,
  )
  assert.ok(container.querySelector('.fsdb-title-host[data-record-active]'))

  rerender(
    <RecordTitle
      row={{ id: 'skill-1', title: 'Skill A', enabled: true }}
      label="Skill A"
      tableIcon="academic-cap"
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
  assert.ok(container.querySelector('.fsdb-title-host[data-record-active]'))

  rerender(
    <RecordTitle
      row={{ id: 'plugin-1', title: 'HTML', running: true }}
      label="HTML"
      tableIcon="puzzle-piece"
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
  assert.ok(container.querySelector('.fsdb-title-host[data-record-active]'))

  rerender(
    <RecordTitle
      row={{ id: 'plugin-2', title: 'Draft', running: false, enabled: false }}
      label="Draft"
      tableIcon="puzzle-piece"
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
  assert.equal(container.querySelector('.fsdb-title-host[data-record-active]'), null)

  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(css, /\.fsdb-title-host:is\(\[data-record-active\],:has\(\[data-plugin-enabled\]\)\)[^{]*\{color:var\(--biu-color-emphasis\)\}/)
  assert.match(css, /\.fsdb-detail-title-icon\[data-record-active\][^{]*\{color:var\(--biu-color-emphasis\)\}/)
})
