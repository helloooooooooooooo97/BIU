import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { PickService } from './service.ts'

test('addMany dedupes kind+id and removeLast pops from the tail', () => {
  const ctx = new Context()
  const pick = new PickService(ctx)
  pick.addMany([
    { kind: 'task', id: 't1', label: '甲', route: '/tasks' },
    { kind: 'task', id: 't1', label: '甲', route: '/tasks' },
    { kind: 'session', id: 's1', label: '聊', route: '/' },
  ])
  assert.deepEqual(
    pick.refs.map((item) => item.id),
    ['t1', 's1'],
  )
  pick.removeLast()
  assert.deepEqual(
    pick.refs.map((item) => item.id),
    ['t1'],
  )
  pick.removeLast()
  assert.equal(pick.refs.length, 0)
  pick.removeLast()
  assert.equal(pick.refs.length, 0)
})

test('adding a pick while picking stays in pick mode so you can select again', () => {
  const ctx = new Context()
  const pick = new PickService(ctx)
  pick.enter()
  pick.add({ kind: 'page', id: 'p1', label: '页面', route: '/pages' })
  assert.equal(pick.picking, true)
  pick.add({ kind: 'page', id: 'p2', label: '另一页', route: '/pages' })
  assert.equal(pick.picking, true)
  assert.deepEqual(
    pick.refs.map((item) => item.id),
    ['p1', 'p2'],
  )
  pick.exit()
  assert.equal(pick.picking, false)
  assert.equal(pick.refs.length, 2)
})

test('picking an object opens the chat overlay, including the same object again', () => {
  const ctx = new Context()
  const pick = new PickService(ctx)
  let attached = 0
  const onAttached = () => {
    attached += 1
  }
  window.addEventListener('biu:pick-attached', onAttached)
  pick.add({ kind: 'page', id: 'p1', label: '页面', route: '/pages' })
  assert.equal(attached, 0)
  pick.enter()
  pick.add({ kind: 'page', id: 'p1', label: '页面', route: '/pages' })
  pick.add({ kind: 'page', id: 'p1', label: '页面', route: '/pages' })
  pick.add({ kind: 'page', id: 'p2', label: '另一页', route: '/pages' })
  window.removeEventListener('biu:pick-attached', onAttached)
  assert.equal(attached, 3)
})

test('after overlay closes, picks do not open the chat until pick mode is on again', () => {
  const ctx = new Context()
  const pick = new PickService(ctx)
  let attached = 0
  const onAttached = () => {
    attached += 1
  }
  window.addEventListener('biu:pick-attached', onAttached)
  pick.enter()
  pick.add({ kind: 'page', id: 'p1', label: '页面', route: '/pages' })
  assert.equal(attached, 1)
  window.dispatchEvent(new Event('biu:overlay-closed'))
  assert.equal(pick.picking, false)
  pick.add({ kind: 'page', id: 'p2', label: '另一页', route: '/pages' })
  assert.equal(attached, 1)
  pick.enter()
  pick.add({ kind: 'page', id: 'p1', label: '页面', route: '/pages' })
  window.removeEventListener('biu:pick-attached', onAttached)
  assert.equal(attached, 2)
  assert.equal(pick.refs.length, 2)
})

test('entering pick mode emits pick-mode so the overlay can stay open', () => {
  const ctx = new Context()
  const pick = new PickService(ctx)
  const modes: boolean[] = []
  const onMode = (event: Event) => {
    modes.push(Boolean((event as CustomEvent<{ picking?: boolean }>).detail?.picking))
  }
  window.addEventListener('biu:pick-mode', onMode)
  pick.enter()
  pick.exit()
  window.removeEventListener('biu:pick-mode', onMode)
  assert.deepEqual(modes, [true, false])
})

test('overlay-closed on window exits pick mode and keeps chips', () => {
  const ctx = new Context()
  const pick = new PickService(ctx)
  pick.enter()
  pick.add({ kind: 'page', id: 'p1', label: '页面', route: '/pages' })
  assert.equal(pick.picking, true)
  window.dispatchEvent(new Event('biu:overlay-closed'))
  assert.equal(pick.picking, false)
  assert.equal(pick.refs.length, 1)
})

test('attach opens chat without pick mode and can stash a send draft', () => {
  const ctx = new Context()
  const pick = new PickService(ctx)
  let attached = 0
  const onAttached = () => {
    attached += 1
  }
  window.addEventListener('biu:pick-attached', onAttached)
  pick.attach([{ kind: 'text', id: 'a', label: '选区', route: '/pages' }], { text: '写短一点', send: true })
  window.removeEventListener('biu:pick-attached', onAttached)
  assert.equal(pick.picking, false)
  assert.equal(attached, 1)
  assert.equal(pick.refs[0]?.id, 'a')
  const draft = pick.takeDraft()
  assert.deepEqual(draft, { text: '写短一点', send: true })
  assert.equal(pick.takeDraft(), null)
})
