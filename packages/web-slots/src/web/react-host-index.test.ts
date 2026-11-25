import { test } from 'vitest'
import assert from 'node:assert/strict'
import { act } from 'react'
import { Context } from 'cordis'
import * as slots from './index.ts'
import * as appModules from '@biu/web-slots/app-modules'
import * as snapshot from '@biu/web-snapshot'
import * as sessionView from '@biu/web-session-view'
import * as projectView from '@biu/web-slots/project-view'
import * as reactHost from './react-host.ts'
import * as shell from '@biu/web-app-shell'

test('paints the authentication boundary into el', async () => {
  const el = document.createElement('div')
  const ctx = new Context()
  await ctx.plugin(slots)
  await ctx.plugin(appModules)
  await ctx.plugin(sessionView)
  await ctx.plugin(projectView)
  await ctx.plugin(snapshot)
  await act(async () => {
    await ctx.plugin(reactHost, { el })
    await ctx.plugin(shell)
  })
  assert.match(el.innerHTML, /data-testid="auth-gate"/)
  assert.match(el.innerHTML, /登录/)
})
