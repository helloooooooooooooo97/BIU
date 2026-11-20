import { test } from 'vitest'
import assert from 'node:assert/strict'
import { computeFloatingPosition } from './floating-position.ts'
import { CHAT_OVERLAY_Z, EXPAND_OVERLAY_Z, OVERLAY_Z, claimOverlayOpen, clampChatOverlayZ, closeAllOverlays, overlayPortalRoot, overlayZ, releaseOverlayOpen } from './overlay-portal.ts'

test('computeFloatingPosition flips bottom-start to top-start near viewport bottom', () => {
  const pos = computeFloatingPosition({
    anchor: { top: 720, bottom: 752, left: 100, right: 220, width: 120, height: 32 },
    floating: { width: 220, height: 240 },
    viewport: { width: 1280, height: 800 },
    placement: 'bottom-start',
    offset: 6,
    padding: 8,
  })
  assert.equal(pos.placement, 'top-start')
  assert.equal(pos.top, 720 - 6 - 240)
  assert.equal(pos.left, 100)
  assert.ok(pos.top >= 8)
})

test('computeFloatingPosition flips top to bottom near viewport top', () => {
  const pos = computeFloatingPosition({
    anchor: { top: 10, bottom: 34, left: 400, right: 480, width: 80, height: 24 },
    floating: { width: 120, height: 32 },
    viewport: { width: 1280, height: 800 },
    placement: 'top',
    offset: 8,
    padding: 8,
  })
  assert.equal(pos.placement, 'bottom')
  assert.equal(pos.top, 42)
})

test('computeFloatingPosition clamps horizontal overflow on left and right edges', () => {
  const rightEdge = computeFloatingPosition({
    anchor: { top: 40, bottom: 70, left: 1240, right: 1276, width: 36, height: 30 },
    floating: { width: 140, height: 28 },
    viewport: { width: 1280, height: 800 },
    placement: 'top',
    offset: 8,
    padding: 8,
  })
  assert.ok(rightEdge.left + 140 <= 1280 - 8)
  assert.ok(rightEdge.left >= 8)

  const leftEdge = computeFloatingPosition({
    anchor: { top: 40, bottom: 70, left: 2, right: 20, width: 18, height: 30 },
    floating: { width: 140, height: 28 },
    viewport: { width: 1280, height: 800 },
    placement: 'top',
    offset: 8,
    padding: 8,
  })
  assert.equal(leftEdge.left, 8)
})

test('computeFloatingPosition flips right-start to left-start near right viewport edge', () => {
  const pos = computeFloatingPosition({
    anchor: { top: 200, bottom: 232, left: 1180, right: 1260, width: 80, height: 32 },
    floating: { width: 220, height: 180 },
    viewport: { width: 1280, height: 800 },
    placement: 'right-start',
    offset: 8,
    padding: 8,
  })
  assert.equal(pos.placement, 'left-start')
  assert.equal(pos.left, 1180 - 8 - 220)
})

test('clampChatOverlayZ never exceeds CHAT_OVERLAY_Z even after hundreds of focus clicks', () => {
  let z: number = OVERLAY_Z.chatOverlayMin
  for (let i = 0; i < 500; i += 1) {
    z = clampChatOverlayZ(z + 1)
    assert.ok(z >= OVERLAY_Z.chatOverlayMin && z <= OVERLAY_Z.chatOverlayMax)
    assert.ok(z < CHAT_OVERLAY_Z)
  }
})

test('overlayPortalRoot escapes expanded isolation host when anchor is inside chat overlay', () => {
  const expanded = document.createElement('div')
  expanded.setAttribute('data-page-host-expanded', '1')
  const expandedBtn = document.createElement('button')
  expanded.append(expandedBtn)
  document.body.append(expanded)

  const chat = document.createElement('div')
  chat.setAttribute('data-testid', 'chat-overlay-panel')
  const chatBtn = document.createElement('button')
  chat.append(chatBtn)
  document.body.append(chat)

  try {
    assert.equal(overlayPortalRoot(chatBtn), document.body)
    assert.equal(overlayPortalRoot(expandedBtn), expanded)
    assert.equal(overlayZ(300, chatBtn), CHAT_OVERLAY_Z)
    assert.equal(overlayZ(180, expandedBtn), CHAT_OVERLAY_Z)
  } finally {
    chat.remove()
    expanded.remove()
  }
  assert.equal(overlayZ(180), 180)
  assert.equal(EXPAND_OVERLAY_Z, 360)
})

test('claimOverlayOpen enforces single open sibling while keeping nested parent open', () => {
  closeAllOverlays()
  let closedA = 0
  let closedB = 0
  let closedChild = 0

  const contentA = document.createElement('div')
  const childTrigger = document.createElement('button')
  contentA.append(childTrigger)
  const triggerB = document.createElement('button')
  document.body.append(contentA, triggerB)

  const idA = Symbol('A')
  const idChild = Symbol('child')
  const idB = Symbol('B')

  try {
    // Open A
    claimOverlayOpen({ id: idA, group: 'popover', close: () => { closedA += 1 }, contentEl: () => contentA }, null)
    // Open child whose trigger is inside A's content -> A must stay open
    claimOverlayOpen({ id: idChild, group: 'popover', close: () => { closedChild += 1 }, contentEl: () => null }, childTrigger)
    assert.equal(closedA, 0)
    assert.equal(closedChild, 0)

    // Open sibling B whose trigger is outside A -> both A and child must close
    claimOverlayOpen({ id: idB, group: 'popover', close: () => { closedB += 1 }, contentEl: () => null }, triggerB)
    assert.equal(closedA, 1)
    assert.equal(closedChild, 1)
    assert.equal(closedB, 0)
  } finally {
    releaseOverlayOpen(idA)
    releaseOverlayOpen(idChild)
    releaseOverlayOpen(idB)
    contentA.remove()
    triggerB.remove()
  }
})
