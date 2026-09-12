import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CONTENT_JUMP_EVENT } from '@biu/type-file-system'
import { ChatNodeList } from './thread.tsx'
import {
  INSPECTOR_REVEAL_EVENT,
  contentEditLabel,
  revealContentEdit,
  type ContentEditRow,
} from './content-edits-table.tsx'
import type { ChatNode } from '@biu/web-session-view'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function helloPages(): ContentEditRow[] {
  return [1, 2, 3, 4, 5].map((n) => ({
    path: `/pages/p${n}`,
    title: '你好',
    added: 1,
    removed: 0,
    jump_line: 1,
  }))
}

describe('contentEditLabel', () => {
  it('keeps a unique title as-is', () => {
    expect(contentEditLabel({ path: '/pages/home', title: '首页', added: 1, removed: 0, jump_line: 1 }, helloPages().slice(0, 1))).toBe(
      '首页',
    )
  })

  it('disambiguates five pages that all share the title 你好', () => {
    const files = helloPages()
    expect(files.map((file) => contentEditLabel(file, files))).toEqual([
      '你好 · p1',
      '你好 · p2',
      '你好 · p3',
      '你好 · p4',
      '你好 · p5',
    ])
  })
})

describe('revealContentEdit', () => {
  it('opens the record in the right inspector and jumps, without navigating the chat route', () => {
    const seen: Array<{ type: string; detail: unknown }> = []
    const onReveal = (event: Event) => seen.push({ type: event.type, detail: (event as CustomEvent).detail })
    const onJump = (event: Event) => seen.push({ type: event.type, detail: (event as CustomEvent).detail })
    window.addEventListener(INSPECTOR_REVEAL_EVENT, onReveal)
    window.addEventListener(CONTENT_JUMP_EVENT, onJump)
    const href = window.location.href
    revealContentEdit('/pages/p3', 1)
    expect(window.location.href).toBe(href)
    expect(seen).toEqual([
      { type: INSPECTOR_REVEAL_EVENT, detail: { collection: '/pages', recordId: 'p3', unique: true } },
      { type: CONTENT_JUMP_EVENT, detail: { path: '/pages/p3', start_line: 1, end_line: 1, navigate: true } },
    ])
    window.removeEventListener(INSPECTOR_REVEAL_EVENT, onReveal)
    window.removeEventListener(CONTENT_JUMP_EVENT, onJump)
  })
})

describe('ContentEditsTable', () => {
  it('renders under the reply and reverts a single file', () => {
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
        contentEdits: [{ path: '/pages/home', title: '首页', added: 4, removed: 1, jump_line: 8 }],
      },
    ]
    render(<ChatNodeList nodes={nodes} sessionId="sess-1" onInspect={() => undefined} onFork={() => undefined} />)
    expect(screen.getByTestId('content-edits-table')).toBeTruthy()
    expect(screen.getByText('首页')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('撤销 首页'))
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      sessionId: 'sess-1',
      turn: 3,
      path: '/pages/home',
    })
  })

  it('lists all five 你好 pages as separate rows and reveals the clicked one in the inspector', () => {
    const seen: unknown[] = []
    const onReveal = (event: Event) => seen.push((event as CustomEvent).detail)
    window.addEventListener(INSPECTOR_REVEAL_EVENT, onReveal)
    const href = window.location.href
    const nodes: ChatNode[] = [
      { id: 'u-1', kind: 'user', text: '五页都写你好' },
      {
        id: 'r-1',
        kind: 'reply',
        copyText: '写好了',
        turn: 4,
        parts: [{ id: 'a-1', kind: 'assistant', text: '写好了' }],
        contentEdits: helloPages(),
      },
    ]
    render(<ChatNodeList nodes={nodes} sessionId="sess-2" onInspect={() => undefined} onFork={() => undefined} />)
    const table = screen.getByTestId('content-edits-table')
    expect(table.querySelectorAll('li')).toHaveLength(5)
    expect(screen.getByText('你好 · p1')).toBeTruthy()
    expect(screen.getByText('你好 · p5')).toBeTruthy()
    fireEvent.click(screen.getByText('你好 · p4'))
    expect(window.location.href).toBe(href)
    expect(seen).toEqual([{ collection: '/pages', recordId: 'p4', unique: true }])
    window.removeEventListener(INSPECTOR_REVEAL_EVENT, onReveal)
  })
})
