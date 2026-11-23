import { test } from 'vitest'
import assert from 'node:assert/strict'
import { nextPopoverState, togglePopoverState } from './use-browser-popovers.ts'

test('togglePopoverState enforces mutual exclusion and closes on repeat click', () => {
  let state = togglePopoverState(null, 'filter')
  assert.equal(state, 'filter')

  state = togglePopoverState(state, 'sort')
  assert.equal(state, 'sort')

  state = togglePopoverState(state, 'sort')
  assert.equal(state, null)
})

test('nextPopoverState supports boolean and functional updaters without clobbering other open menus', () => {
  // Opening 'view' sets it active
  let state = nextPopoverState(null, 'view', true)
  assert.equal(state, 'view')

  // Closing an unrelated menu ('bulk') leaves 'view' open
  state = nextPopoverState(state, 'bulk', false)
  assert.equal(state, 'view')

  // Functional toggle on active menu closes it
  state = nextPopoverState(state, 'view', (prev) => !prev)
  assert.equal(state, null)

  // Functional toggle on closed menu opens it
  state = nextPopoverState(state, 'columns', (prev) => !prev)
  assert.equal(state, 'columns')
})
