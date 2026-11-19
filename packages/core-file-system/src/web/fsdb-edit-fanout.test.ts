import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  emitFsdbChange,
  fsdbChangeHitsCollection,
  fsdbChangeHitsPane,
  fsdbRecordChangeReloadsList,
  parseFsdbChange,
} from '@biu/type-file-system'

const pages = ['/pages', '/tags', '/plugins', '/agents', '/notes', '/tasks', '/files', '/people']

function countWakeups(paths: string[], emit: () => void) {
  let legacy = 0
  let sameTable = 0
  let listReload = 0
  const stops = paths.map((path) => {
    const onChange = (event: Event) => {
      const change = parseFsdbChange(event)
      if (change.scope === 'content') return
      legacy += 1
      if (fsdbChangeHitsCollection(change, path)) sameTable += 1
      if (change.scope === 'records' && fsdbRecordChangeReloadsList(change, path)) listReload += 1
    }
    window.addEventListener('fsdb:change', onChange)
    return () => window.removeEventListener('fsdb:change', onChange)
  })
  emit()
  for (const stop of stops) stop()
  return { legacy, sameTable, listReload }
}

test('editing one record does not reload other records of the same table', () => {
  const recordIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']
  const openRecords = recordIds.map(() => '/pages')
  const oneRecord = countWakeups(openRecords, () => emitFsdbChange({ scope: 'records', path: '/pages/p1' }))
  assert.deepEqual(oneRecord, { legacy: 8, sameTable: 8, listReload: 0 })

  let panes = 0
  const stops = recordIds.map((id) => {
    const onChange = (event: Event) => {
      if (fsdbChangeHitsPane(parseFsdbChange(event), '/pages', id)) panes += 1
    }
    window.addEventListener('fsdb:change', onChange)
    return () => window.removeEventListener('fsdb:change', onChange)
  })
  emitFsdbChange({ scope: 'records', path: '/pages/p1' })
  for (const stop of stops) stop()
  assert.equal(panes, 1)

  const otherTables = countWakeups(pages, () => emitFsdbChange({ scope: 'records', path: '/pages/p1' }))
  assert.deepEqual(otherTables, { legacy: 8, sameTable: 1, listReload: 0 })

  const createdRow = countWakeups(openRecords, () => emitFsdbChange({ scope: 'records', path: '/pages' }))
  assert.deepEqual(createdRow, { legacy: 8, sameTable: 8, listReload: 8 })
})

test('record edits emit the record path and list reload ignores it', () => {
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  const inspector = readFileSync(resolve(import.meta.dirname, './inspector-database.tsx'), 'utf8')
  assert.match(browser, /fsdbRecordChangeReloadsList\(change, dataPathRef\.current\)/)
  assert.match(browser, /announceListChange\(true, path\)/)
  assert.match(inspector, /fsdbChangeHitsPane\(change, collectionPath, recordId\)/)
  assert.match(inspector, /useViewTick\(tabCollection, tabRecordId \?\? ''\)/)
  assert.match(inspector, /useViewTick\(currentPath, recordId \?\? ''\)/)
})
