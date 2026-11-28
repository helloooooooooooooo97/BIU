/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ShareRoleDetail, ShareScopeDetail } from './share-chain-detail.tsx'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          scope: 'workspace',
          accessMode: 'members',
          memberDefaultRole: 'editor',
          ownerId: 'u1',
          currentAccountId: 'u1',
          canManage: true,
          people: [],
          memberViews: [],
          share: null,
          inheritedShare: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('clicking shareScope or shareRole capsule opens the unified SharePanel instead of legacy explanation popover', () => {
  render(
    <div>
      <ShareScopeDetail collection="/pages" recordId="p1" label="空间" title="测试页" localOnly={false} />
      <ShareRoleDetail collection="/pages" recordId="p1" label="管理" title="测试页" localOnly={false} />
    </div>,
  )

  const scopeBtn = screen.getByTestId('fsdb-scope-tag')
  fireEvent.click(scopeBtn)
  assert.ok(screen.getByTestId('fsdb-share-panel'))
  assert.equal(screen.queryByRole('dialog', { name: '可见范围' }), null)
  assert.equal(screen.getByTestId('fsdb-share-collaboration-tab').getAttribute('aria-selected'), 'true')

  const roleBtn = screen.getByTestId('fsdb-role-tag')
  fireEvent.click(roleBtn)
  assert.equal(screen.getAllByTestId('fsdb-share-panel').length, 1)
  assert.equal(screen.queryByRole('dialog', { name: '我的权限' }), null)
  assert.equal(scopeBtn.getAttribute('aria-expanded'), 'false')
  assert.equal(roleBtn.getAttribute('aria-expanded'), 'true')
})

test('builtin plugin capsules render statically without opening SharePanel', () => {
  render(
    <div>
      <ShareScopeDetail collection="/plugins" recordId="builtin-1" label="共享" builtin localOnly={false} />
      <ShareRoleDetail collection="/plugins" recordId="builtin-1" label="只读" builtin localOnly={false} />
    </div>,
  )

  const scopeEl = screen.getByTestId('fsdb-scope-tag')
  const roleEl = screen.getByTestId('fsdb-role-tag')
  assert.equal(scopeEl.tagName, 'SPAN')
  assert.equal(roleEl.tagName, 'SPAN')
  fireEvent.click(scopeEl)
  fireEvent.click(roleEl)
  assert.equal(screen.queryByTestId('fsdb-share-panel'), null)
})
