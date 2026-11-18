import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  DEFAULT_RECORD_LAYOUT_ID,
  defaultRecordLayout,
  listedRecordLayouts,
  parseRecordLayouts,
} from '@biu/type-file-system/record-views'

test('record layouts keep a builtin default and skip it from stored custom rows', () => {
  assert.equal(defaultRecordLayout().id, DEFAULT_RECORD_LAYOUT_ID)
  assert.equal(defaultRecordLayout().name, '默认视图')
  assert.equal(defaultRecordLayout().contentViewId, 'doc')
  assert.equal(defaultRecordLayout().propViewId, 'table')
  const parsed = parseRecordLayouts([
    { id: DEFAULT_RECORD_LAYOUT_ID, name: '假默认', contentViewId: 'source' },
    { id: 'need', name: '需求', contentViewId: 'outline', propViewId: 'card1', sort: 'kind', filterKinds: ['heading'] },
    { id: '', name: 'skip' },
  ])
  assert.deepEqual(parsed, [
    {
      id: 'need',
      name: '需求',
      contentViewId: 'outline',
      propViewId: 'card1',
      sort: 'kind',
      filterKinds: ['heading'],
    },
  ])
  assert.equal(listedRecordLayouts(parsed)[0]?.builtin, true)
  assert.equal(listedRecordLayouts(parsed)[1]?.id, 'need')
  const hidden = parseRecordLayouts([{ id: 'quiet', name: '安静', contentViewId: 'hidden', propViewId: 'hidden' }])
  assert.equal(hidden[0]?.contentViewId, 'hidden')
  assert.equal(hidden[0]?.propViewId, 'hidden')
  const leftover = parseRecordLayouts([{ id: 'wide', name: '宽页', kind: 'sandbox', file: 'layout-wide.jsx' }])
  assert.equal(leftover[0]?.id, 'wide')
  assert.equal(leftover[0]?.contentViewId, 'doc')
  assert.equal('kind' in (leftover[0] ?? {}), false)
})
