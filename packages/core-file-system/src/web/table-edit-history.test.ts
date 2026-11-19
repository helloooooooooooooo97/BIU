import { test } from 'vitest'
import assert from 'node:assert/strict'
import { TableEditHistory, tableEditHistoryKey, tableEditHistoryOwned, tableNativeUndoModifier, type TableEditPatch } from './table-edit-history.ts'

function fixture(limit = 100) {
  const history = new TableEditHistory(limit)
  let record: TableEditPatch = { id: 'one', title: 'original', flag: false, tag: { tags: ['a'], values: { a: { lane: 'old' } } } }
  let failed = false
  const writes: TableEditPatch[] = []
  const read = async () => structuredClone(record)
  const write = async (patch: TableEditPatch) => {
    if (failed) throw new Error('network')
    writes.push(structuredClone(patch))
    record = { ...record, ...patch }
    return structuredClone(record)
  }
  return { history, read, write, writes, edit: (patch: TableEditPatch) => history.edit('one', patch, read, write),
    value: () => record, fail: (next: boolean) => { failed = next } }
}

test('text, boolean and nested tag edits undo and redo persisted values', async () => {
  const f = fixture()
  await f.edit({ title: 'new' })
  await f.edit({ flag: true })
  await f.edit({ tag: { tags: ['a', 'b'], values: { a: { lane: 'new' } } } })
  await f.history.undo()
  assert.deepEqual(f.value().tag, { tags: ['a'], values: { a: { lane: 'old' } } })
  await f.history.undo()
  assert.equal(f.value().flag, false)
  await f.history.undo()
  assert.equal(f.value().title, 'original')
  await f.history.redo(); await f.history.redo(); await f.history.redo()
  assert.equal(f.value().title, 'new')
  assert.equal(f.value().flag, true)
  assert.equal(f.writes.length, 9)
})

test('fast consecutive edits and undo are serialized against the latest saved state', async () => {
  const f = fixture()
  const first = f.edit({ title: 'first' })
  const second = f.edit({ title: 'second' })
  assert.equal(f.history.canUndo, true)
  const undo = f.history.undo()
  await Promise.all([first, second, undo])
  assert.equal(f.value().title, 'first')
  await f.history.undo()
  assert.equal(f.value().title, 'original')
  await f.history.redo(); await f.history.redo()
  assert.equal(f.value().title, 'second')
})

test('a failed edit or failed undo preserves history and can be retried', async () => {
  const f = fixture()
  await f.edit({ title: 'saved' })
  f.fail(true)
  await assert.rejects(f.edit({ title: 'failed' }), /network/)
  await assert.rejects(f.history.undo(), /network/)
  assert.equal(f.history.canUndo, true)
  assert.equal(f.history.canRedo, false)
  assert.equal(f.value().title, 'saved')
  f.fail(false)
  await f.history.undo()
  assert.equal(f.value().title, 'original')
  f.fail(true)
  await assert.rejects(f.history.redo(), /network/)
  assert.equal(f.history.canRedo, true)
  f.fail(false)
  await f.history.redo()
  assert.equal(f.value().title, 'saved')
})

test('new successful edits clear redo; no-op writes do not discard redo', async () => {
  const f = fixture()
  await f.edit({ title: 'new' }); await f.history.undo()
  await f.edit({ title: 'original' })
  assert.equal(f.history.canRedo, true)
  await f.edit({ flag: true })
  assert.equal(f.history.canRedo, false)
  await f.history.redo()
  assert.equal(f.value().title, 'original')
})

test('history snapshots clone mutable values and use server-normalized redo values', async () => {
  const f = fixture()
  const patch = { tag: { tags: ['b'] } }
  const edited = f.edit(patch)
  patch.tag.tags.push('mutated')
  await edited; await f.history.undo(); await f.history.redo()
  assert.deepEqual(f.value().tag, { tags: ['b'] })
  let value: TableEditPatch = { title: 'old' }
  const h = new TableEditHistory()
  await h.edit('id', { title: '  new  ' }, async () => value, async patch => {
    value = { title: String(patch.title).trim() }; return value
  })
  await h.undo(); await h.redo()
  assert.equal(value.title, 'new')
})

test('unset fields restore null; deleting a record prunes its edits without restoring it', async () => {
  const f = fixture()
  await f.edit({ extra: 'added' }); await f.history.undo()
  assert.equal(f.value().extra, null)
  await f.history.forget('one')
  assert.equal(f.history.canUndo, false)
  assert.equal(f.history.canRedo, false)
  const count = f.writes.length
  await f.history.undo(); await f.history.redo()
  assert.equal(f.writes.length, count)
})

test('forgetting a pending record edit is ordered after its save and keeps other rows', async () => {
  const f = fixture()
  const pending = f.edit({ title: 'one' })
  const forgotten = f.history.forget('one')
  await Promise.all([pending, forgotten])
  await f.history.edit('two', { flag: true }, f.read, f.write)
  await f.history.forget('one')
  assert.equal(f.history.canUndo, true)
  await f.history.undo()
  assert.equal(f.value().flag, false)
})

test('history is bounded and table instances have independent stacks', async () => {
  const f = fixture(2), other = fixture()
  await f.edit({ title: '1' }); await f.edit({ title: '2' }); await f.edit({ title: '3' })
  await f.history.undo(); await f.history.undo(); await f.history.undo()
  assert.equal(f.value().title, '1')
  assert.equal(other.history.canUndo, false)
})

test('keyboard mapping supports Ctrl/Cmd Z, Y and Shift Z without intercepting composition', () => {
  const event = { key: 'z', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }
  assert.equal(tableEditHistoryKey(event), 'undo')
  assert.equal(tableEditHistoryKey({ ...event, key: 'y' }), 'redo')
  assert.equal(tableEditHistoryKey({ ...event, key: 'Z', shiftKey: true }), 'redo')
  assert.equal(tableEditHistoryKey({ ...event, ctrlKey: false, metaKey: true }), 'undo')
  assert.equal(tableEditHistoryKey({ ...event, ctrlKey: false }), null)
  assert.equal(tableEditHistoryKey({ ...event, altKey: true }), null)
  assert.equal(tableEditHistoryKey({ ...event, isComposing: true }), null)
  assert.equal(tableNativeUndoModifier(event, true), false)
  assert.equal(tableNativeUndoModifier({ ...event, ctrlKey: false, metaKey: true }, true), true)
  assert.equal(tableNativeUndoModifier(event, false), true)
  const idle = { inCellPop: false, cellPopOpen: false, inThisTable: false, foreignPage: false, foreignEditor: false, inDialog: false, nativeField: false, nativeUndoModifier: false, hasCell: false }
  assert.equal(tableEditHistoryOwned({ ...idle, inCellPop: true, cellPopOpen: true, inDialog: true }), true)
  assert.equal(tableEditHistoryOwned({ ...idle, inCellPop: true, cellPopOpen: true, nativeField: true, nativeUndoModifier: true }), false)
  assert.equal(tableEditHistoryOwned({ ...idle, inCellPop: true, cellPopOpen: true, nativeField: true, nativeUndoModifier: false }), true)
  assert.equal(tableEditHistoryOwned({ ...idle, hasCell: true }), true)
  assert.equal(tableEditHistoryOwned({ ...idle, hasCell: true, nativeField: true }), false)
  assert.equal(tableEditHistoryOwned({ ...idle, inThisTable: true }), true)
  assert.equal(tableEditHistoryOwned({ ...idle, inThisTable: false, foreignPage: true, hasCell: true }), false)
})
