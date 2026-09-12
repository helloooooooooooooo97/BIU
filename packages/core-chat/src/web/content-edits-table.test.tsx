import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ChatNodeList } from './thread.tsx'
import type { ChatNode } from '@biu/web-session-view'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ContentEditsTable', () => {
  it('renders under the reply and jumps / reverts files', () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, results: [] }) }))
    vi.stubGlobal('fetch', fetchMock)
    const nodes: ChatNode[] = [
      { id: 'u-1', kind: 'user', text: '改首页' },
      {
        id: 'r-1',
        kind: 'reply',
        copyText: '改好了',
        turn: 3,
        parts: [{ id: 'a-1', kind: 'assistant', text: '改好了' }],
        contentEdits: [
          { path: '/pages/home', title: '首页', added: 4, removed: 1, jump_line: 8 },
        ],
      },
    ]
    render(
      <MemoryRouter>
        <ChatNodeList nodes={nodes} sessionId="sess-1" onInspect={() => undefined} onFork={() => undefined} />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('content-edits-table')).toBeTruthy()
    expect(screen.getByText('首页')).toBeTruthy()
    expect(screen.getByText('+4')).toBeTruthy()
    expect(screen.getByText('−1')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('撤销 首页'))
    expect(fetchMock).toHaveBeenCalled()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/db/content-revert')
    expect(JSON.parse(String(init.body))).toEqual({ sessionId: 'sess-1', turn: 3, path: '/pages/home' })
  })
})
