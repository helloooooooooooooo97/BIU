import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as appModules from './app-modules.ts'
import { AppModulesService, moduleIdFromPath } from './app-modules.ts'

test('builtin list is only agent', async () => {
  const ctx = new Context()
  await ctx.plugin(appModules)
  const svc = ctx.appModules as AppModulesService
  assert.deepEqual(
    svc.list().map((item) => item.id),
    ['agent'],
  )
  assert.equal(moduleIdFromPath('/'), 'agent')
  assert.equal(moduleIdFromPath('/agents/abc'), 'agent')
})

test('plugins register routes; shell does not hardcode them', async () => {
  const ctx = new Context()
  await ctx.plugin(appModules)
  const svc = ctx.appModules as AppModulesService
  svc.register({ id: 'tasks', label: 'Tasks', path: '/tasks', order: 20 })
  svc.register({ id: 'extra', label: 'Extra', path: '/extra', order: 80 })
  const plugins = svc.plugins()
  assert.equal(moduleIdFromPath('/tasks', plugins), 'tasks')
  assert.equal(moduleIdFromPath('/extra', plugins), 'extra')
  assert.equal(svc.list().map((item) => item.id).join(','), 'agent,tasks,extra')
  assert.equal(svc.isNavReady(), false)
  svc.markNavReady()
  assert.equal(svc.isNavReady(), true)
})
