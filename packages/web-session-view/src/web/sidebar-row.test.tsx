/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SidebarRow } from './sidebar-row.tsx'

afterEach(() => {
  cleanup()
})

test('SidebarRow places more-actions button to the right of star and opens a floating menu for delete', () => {
  let deleted = 0
  let starred = 0
  const { container } = render(
    <SidebarRow
      main={<span>测试会话</span>}
      onStar={() => { starred += 1 }}
      starIcon={<span>★</span>}
      onDelete={() => { deleted += 1 }}
      deleteLabel="删除测试会话"
      deleteIcon={<span>🗑</span>}
    />,
  )

  const row = container.querySelector('.chat-session-row')!
  const buttons = [...row.querySelectorAll('button')]
  assert.equal(buttons.length, 2)
  assert.ok(buttons[0]!.classList.contains('chat-session-row-star'))
  assert.equal(buttons[1]!.getAttribute('data-testid'), 'sidebar-row-more')
  assert.equal(screen.queryByTestId('sidebar-row-menu'), null)

  fireEvent.click(buttons[0]!)
  assert.equal(starred, 1)
  assert.equal(deleted, 0)

  fireEvent.click(buttons[1]!)
  const menu = screen.getByTestId('sidebar-row-menu')
  assert.ok(menu)
  const delItem = screen.getByTestId('sidebar-row-menu-delete')
  assert.equal(delItem.textContent?.includes('删除'), true)

  fireEvent.click(delItem)
  assert.equal(deleted, 1)
  assert.equal(screen.queryByTestId('sidebar-row-menu'), null)
})
