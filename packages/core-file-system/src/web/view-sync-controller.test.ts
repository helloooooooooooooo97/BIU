import assert from 'node:assert/strict'
import { test } from 'vitest'
import { ViewSyncController } from './view-sync-controller.ts'

test('ViewSyncController prevents stale routeViewId from reverting an explicit same-collection switch', () => {
  const ctrl = new ViewSyncController()

  // User is on view A and clicks view B; router has not propagated routeViewId yet.
  ctrl.markSelect('/pages', 'view-B', 'view-A', true)

  // Stale layout effect fires while routeViewId is still 'view-A' -> skip!
  assert.equal(ctrl.shouldSkipRouteAdopt('/pages', 'view-A', false), true)

  // Background pullSavedViews finishes while routeViewId is still 'view-A' -> keeps 'view-B'!
  assert.equal(ctrl.resolveSyncedViewId('/pages', 'view-B', 'view-A'), 'view-B')

  // Router catches up to 'view-B' -> guard clears and normal adoption resumes.
  assert.equal(ctrl.shouldSkipRouteAdopt('/pages', 'view-B', false), false)
  assert.equal(ctrl.resolveSyncedViewId('/pages', 'view-B', 'view-B'), 'view-B')
})

test('ViewSyncController clears guard on collection switch and respects browser back/forward', () => {
  const ctrl = new ViewSyncController()

  ctrl.markSelect('/pages', 'view-B', 'view-A', true)
  // Switching to another collection clears the previous guard immediately.
  assert.equal(ctrl.shouldSkipRouteAdopt('/tasks', 'tasks-all', true), false)
  assert.equal(ctrl.resolveSyncedViewId('/tasks', null, 'tasks-all'), 'tasks-all')

  // Browser Back/Forward without markSelect adopts the incoming routeViewId directly.
  assert.equal(ctrl.shouldSkipRouteAdopt('/pages', 'view-A', false), false)
})

test('ViewSyncController does not arm guard when already on target routeViewId or without router', () => {
  const ctrl = new ViewSyncController()

  ctrl.markSelect('/pages', 'view-A', 'view-A', true)
  assert.equal(ctrl.shouldSkipRouteAdopt('/pages', 'view-A', false), false)

  ctrl.markSelect('/pages', 'view-B', 'view-A', false)
  assert.equal(ctrl.shouldSkipRouteAdopt('/pages', 'view-A', false), false)
})
