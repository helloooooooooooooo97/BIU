import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('data overview uses the same list chrome as collection tables', () => {
  const overview = readFileSync(resolve(import.meta.dirname, './data-overview.tsx'), 'utf8')
  const page = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  assert.match(overview, /data-testid="fsdb-data-overview"/)
  assert.match(overview, /fsdb-page tasks-root/)
  assert.match(overview, /<DataSidebarShell/)
  assert.match(overview, /tasks-main fsdb-main/)
  assert.match(overview, /fsdb-detail-icon-slot/)
  assert.match(overview, /<div className="tasks-toolbar">/)
  assert.match(overview, /fsdb-workspace/)
  assert.match(overview, /tasks-table is-cols-fixed is-truncate/)
  assert.match(overview, /<FieldGlyph kind=\{col.kind\} \/>/)
  assert.match(overview, /className="fsdb-record-mark is-sm"/)
  assert.match(overview, /is-pin-col/)
  assert.match(page, /<DataOverview/)
})
