import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ShellSidePlaces } from './shell-chrome.tsx'
import { ShellStoreDialog, type StoreCategory } from './shell-store-dialog.tsx'
import { useState } from 'react'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('ShellSidePlaces does not render Store button in sidebar', () => {
  const { container } = render(
    <MemoryRouter>
      <ShellSidePlaces
        activeId="agent"
        agentHref="/"
        onSettings={() => undefined}
      />
    </MemoryRouter>,
  )
  const nav = container.querySelector('[data-testid="shell-side-places"]')
  assert.ok(nav)
  assert.equal(nav.querySelector('button[data-testid="chrome-store"]'), null)
  assert.ok(nav.querySelector('button[data-testid="chrome-settings"]'))
})

test('ShellStoreDialog renders MCP/Skills/Plugins/Templates categories and switches scope tabs', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/db/list?path=%2Fmcp')) {
        return new Response(
          JSON.stringify({
            items: [{ id: 'github', title: 'GitHub MCP', description: '代码仓库与 PR 工具', enabled: true }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )

  function Harness() {
    const [tab, setTab] = useState<StoreCategory>('mcp')
    return (
      <MemoryRouter>
        <ShellStoreDialog open tab={tab} onTabChange={setTab} onClose={() => undefined} />
      </MemoryRouter>
    )
  }

  render(<Harness />)
  assert.ok(screen.getByTestId('store-nav-mcp'))
  assert.ok(screen.getByTestId('store-nav-skills'))
  assert.ok(screen.getByTestId('store-nav-plugins'))
  assert.ok(screen.getByTestId('store-nav-templates'))

  await waitFor(() => {
    assert.ok(screen.getByTestId('store-item-github'))
  })

  fireEvent.click(screen.getByTestId('store-scope-marketplace'))
  assert.ok(screen.getByTestId('store-marketplace-pane'))

  fireEvent.click(screen.getByTestId('store-nav-templates'))
  fireEvent.click(screen.getByTestId('store-scope-installed'))
  assert.ok(screen.getByText('还没有已保存的模板'))
})
