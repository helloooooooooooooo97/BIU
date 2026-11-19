import { afterEach, describe, expect, test, vi } from 'vitest'
import { Context } from 'cordis'
import { SessionViewService } from './index.ts'

function createView() {
  const ctx = new Context()
  const view = new SessionViewService(ctx)
  view.replace({
    sessionId: 'sess-1',
    agentStatus: 'running',
    pending: true,
    inbox: [],
    error: undefined,
  })
  return view
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('inbox optimistic queue & 404 unknown inbox item recovery', () => {
  test('inject clears optimistic local item when server already claimed it (no ghost duplicate)', async () => {
    const view = createView()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, inbox: [] }), { status: 200 }),
    )
    await view.send('排查一下bug', 'inject')
    expect(view.value.inbox).toEqual([])
    expect(view.value.error).toBeUndefined()
  })

  test('setInbox deduplicates local optimistic item even when server flips wake/inject kind', () => {
    const view = createView()
    view.replace({
      inbox: [{ id: 'local-abc', kind: 'wake', text: '排查一下bug' }],
    })
    view.setInbox([{ id: 'inb-1', kind: 'inject', text: '排查一下bug' }], 'sess-1')
    expect(view.value.inbox).toEqual([{ id: 'inb-1', kind: 'inject', text: '排查一下bug' }])
  })

  test('dropInboxItem removes local-* items locally without calling server', async () => {
    const view = createView()
    const spy = vi.spyOn(globalThis, 'fetch')
    view.replace({
      inbox: [{ id: 'local-1', kind: 'inject', text: 'ghost' }],
    })
    const ok = await view.dropInboxItem('local-1')
    expect(ok).toBe(true)
    expect(spy).not.toHaveBeenCalled()
    expect(view.value.inbox).toEqual([])
    expect(view.value.error).toBeUndefined()
  })

  test('dropInboxItem handles 404 unknown inbox item silently by resyncing inbox instead of showing error banner', async () => {
    const view = createView()
    view.replace({
      inbox: [
        { id: 'inb-stale', kind: 'inject', text: 'already claimed' },
        { id: 'inb-live', kind: 'wake', text: 'still queued' },
      ],
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'unknown inbox item',
          sessionId: 'sess-1',
          inbox: [{ id: 'inb-live', kind: 'wake', text: 'still queued' }],
        }),
        { status: 404 },
      ),
    )
    const ok = await view.dropInboxItem('inb-stale')
    expect(ok).toBe(false)
    expect(view.value.error).toBeUndefined()
    expect(view.value.inbox).toEqual([{ id: 'inb-live', kind: 'wake', text: 'still queued' }])
  })
})
