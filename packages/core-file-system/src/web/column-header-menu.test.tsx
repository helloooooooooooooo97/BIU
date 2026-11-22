// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ColumnHeaderMenu } from './column-header-menu.tsx'

describe('ColumnHeaderMenu', () => {
  it('uses global HeadlessPopover and global popover CSS tokens', () => {
    const src = readFileSync(resolve(import.meta.dirname, './column-header-menu.tsx'), 'utf8')
    const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')

    expect(src).toContain('HeadlessPopover')
    expect(src).not.toContain('createPortal(')
    expect(src).not.toContain('computeFloatingPosition')
    expect(css).toMatch(
      /\.fsdb-col-menu\{[^}]*--biu-color-bg-hover:var\(--biu-color-bg-popover-hover\)[^}]*border:var\(--biu-stroke-width\) solid var\(--biu-color-border-popover\)[^}]*border-radius:var\(--biu-radius-popover\)[^}]*background:var\(--biu-color-bg-popover\)[^}]*box-shadow:var\(--biu-shadow-popover\)/,
    )
  })

  it('mounts inside HeadlessPopover (.biu-headless-pop) and hands off anchor to pinned header when docked', async () => {
    const main = document.createElement('div')
    main.className = 'fsdb-main'
    const pinnedHost = document.createElement('div')
    pinnedHost.className = 'fsdb-pinned-head-host'
    const table = document.createElement('table')
    table.className = 'tasks-table'
    const thead = document.createElement('thead')
    const tr = document.createElement('tr')
    const th = document.createElement('th')
    th.dataset.colKey = 'status'
    tr.appendChild(th)
    thead.appendChild(tr)
    table.appendChild(thead)
    main.appendChild(pinnedHost)
    main.appendChild(table)
    document.body.appendChild(main)

    const onClose = vi.fn()
    const { unmount } = render(
      <ColumnHeaderMenu
        target={{
          col: { key: 'status', field: { type: 'text', label: '状态' }, kind: 'text' },
          rect: th.getBoundingClientRect(),
          anchorEl: th,
          mode: 'header',
        }}
        collectionPath="/pages"
        activeViewId="v1"
        tagCatalog={[]}
        isTitle={false}
        canHide
        canSort
        canFilter
        canGroup
        activeSortDir={null}
        activeGrouped={false}
        isFrozenEdge={false}
        summaryOp="none"
        onClose={onClose}
        onFilter={vi.fn()}
        onSort={vi.fn()}
        onGroup={vi.fn()}
        onSummary={vi.fn()}
        onChangeColumnView={vi.fn()}
        onToggleFreeze={vi.fn()}
        onHide={vi.fn()}
      />,
    )

    try {
      await waitFor(() => {
        const pop = document.querySelector('.biu-headless-pop')
        expect(pop).not.toBeNull()
        expect(pop?.querySelector('[data-testid="fsdb-col-header-menu"]')).not.toBeNull()
      })

      // Simulate scrolling down so pinned-table-head mounts a docked header
      const pinnedViewport = document.createElement('div')
      pinnedViewport.className = 'fsdb-pinned-head-viewport'
      const pinnedTh = document.createElement('th')
      pinnedTh.dataset.colKey = 'status'
      pinnedViewport.appendChild(pinnedTh)

      await act(async () => {
        pinnedHost.appendChild(pinnedViewport)
        await Promise.resolve()
      })

      // Menu stays open inside the unified HeadlessPopover without closing
      expect(onClose).not.toHaveBeenCalled()
      expect(document.querySelector('.biu-headless-pop [data-testid="fsdb-col-header-menu"]')).not.toBeNull()
    } finally {
      unmount()
      main.remove()
    }
  })
})
