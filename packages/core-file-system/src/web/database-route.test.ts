import { test } from 'vitest'
import assert from 'node:assert/strict'
import { builtinAllViewId } from '../catalog-views.ts'
import { DATA_COLLECTION_PATH } from './database-path.ts'
import { databaseCenterHref, parseDatabaseCenter } from './database-route.ts'

test('parseDatabaseCenter reads collection and builtin-all view ids from the URL', () => {
  assert.deepEqual(parseDatabaseCenter('/database'), {
    kind: 'overview',
    collection: DATA_COLLECTION_PATH,
    viewId: builtinAllViewId(DATA_COLLECTION_PATH),
    recordId: null,
  })
  assert.equal(parseDatabaseCenter('/database/skills/view/builtin-all%3A%2Fskills').kind, 'collection')
  assert.equal(parseDatabaseCenter('/database/skills/view/builtin-all%3A%2Fskills').collection, '/skills')
  assert.equal(parseDatabaseCenter('/database/skills/view/builtin-all%3A%2Fskills').viewId, 'builtin-all:/skills')
  assert.equal(parseDatabaseCenter('/database/skills/view/builtin-all:%2Fskills').collection, '/skills')
  assert.equal(parseDatabaseCenter('/database/agents/view/mine').collection, '/agents')
  assert.equal(parseDatabaseCenter('/database/agents/view/mine').viewId, 'mine')
  assert.equal(parseDatabaseCenter('/database/pages/view/board/record/p1').kind, 'record')
  assert.equal(parseDatabaseCenter('/database/pages/view/board/record/p1').recordId, 'p1')
})

test('databaseCenterHref writes the same collection view path the sidebar navigates to', () => {
  assert.equal(
    databaseCenterHref({ collection: '/skills', viewId: builtinAllViewId('/skills') }),
    '/database/skills/view/builtin-all%3A%2Fskills',
  )
  assert.equal(databaseCenterHref({ collection: '/agents', viewId: 'mine' }), '/database/agents/view/mine')
})
