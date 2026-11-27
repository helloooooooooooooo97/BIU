import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

describe('access realtime broadcast wiring', () => {
  const accountHostSrc = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
  const sidebarSrc = readFileSync(
    resolve(import.meta.dirname, '../../../core-file-system/src/web/data-sidebar.tsx'),
    'utf8',
  )
  const dbRoutesSrc = readFileSync(
    resolve(import.meta.dirname, '../../../core-file-system/src/host/http-routes.ts'),
    'utf8',
  )

  it('broadcasts workspace-scoped database events on /api/account/access mutations', () => {
    const postBlock = accountHostSrc.slice(
      accountHostSrc.indexOf("authedRoute('POST', '/api/account/access'"),
      accountHostSrc.indexOf("authedRoute('PATCH', '/api/account/access'"),
    )
    const patchBlock = accountHostSrc.slice(
      accountHostSrc.indexOf("authedRoute('PATCH', '/api/account/access'"),
      accountHostSrc.indexOf("authedRoute('DELETE', '/api/account/access'"),
    )
    const deleteBlock = accountHostSrc.slice(
      accountHostSrc.indexOf("authedRoute('DELETE', '/api/account/access'"),
      accountHostSrc.indexOf("authedRoute('POST', '/api/account/access/guest-invite'"),
    )

    assert.match(postBlock, /broadcastAccessChange\(activeWorkspace,\s*'records',\s*collection\)/)
    assert.match(patchBlock, /broadcastAccessChange\(activeWorkspace,\s*'records',\s*collection\)/)
    assert.match(deleteBlock, /broadcastAccessChange\(activeWorkspace,\s*'records',\s*collection\)/)
  })

  it('data-sidebar force-pulls saved views when a path-scoped views change arrives', () => {
    assert.match(
      sidebarSrc,
      /if \(change\.scope === 'views'\)[\s\S]*pullSavedViews\(\[changedPath\],\s*\{\s*force:\s*true\s*\}\)/,
    )
  })

  it('POST /api/db/saved-views broadcasts views database channel event', () => {
    const savedViewsBlock = dbRoutesSrc.slice(
      dbRoutesSrc.indexOf("ctx.http.route('POST', '/api/db/saved-views'"),
      dbRoutesSrc.indexOf('const shareSnapshotOpts'),
    )
    assert.match(
      savedViewsBlock,
      /db\.notifyViewCatalog\(path\)/,
    )
  })
})
