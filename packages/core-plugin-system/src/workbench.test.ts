import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  advanceWorkbench,
  allocatePluginId,
  applyWorkbenchPatch,
  emptyWorkbench,
  parseTree,
  workbenchBlocksCode,
} from './workbench.ts'

test('tree rejects unknown nodes and oversized graphs', () => {
  assert.equal(parseTree(''), null)
  assert.deepEqual(parseTree({ t: 'btn', label: '存' }), { t: 'btn', label: '存' })
  assert.throws(() => parseTree({ t: 'Card' }), /未知组件/)
  const kids = Array.from({ length: 25 }, (_, i) => ({ t: 'text', label: String(i) }))
  assert.throws(() => parseTree({ t: 'list', kids }), /最多/)
})

test('advance requires the current stage payload', () => {
  assert.throws(() => advanceWorkbench(emptyWorkbench()), /who/)
  const brief = applyWorkbenchPatch(emptyWorkbench(), { who: '我', job: '记事' })
  assert.equal(advanceWorkbench(brief).stage, 'wireframe')
  assert.throws(() => advanceWorkbench(advanceWorkbench(brief)), /tree/)
  const wired = applyWorkbenchPatch(brief, { stage: 'wireframe', tree: { t: 'list', kids: [{ t: 'row', label: '一项' }] } })
  assert.equal(advanceWorkbench(wired).stage, 'palette')
  const painted = applyWorkbenchPatch(wired, { stage: 'palette' })
  assert.equal(advanceWorkbench(painted).stage, 'demo')
  const demo = applyWorkbenchPatch(painted, { stage: 'demo' })
  assert.equal(advanceWorkbench(demo).stage, 'plugin')
  assert.equal(workbenchBlocksCode(demo), true)
  assert.equal(workbenchBlocksCode(advanceWorkbench(demo)), false)
})

test('allocatePluginId slugs a title and avoids collisions', () => {
  assert.equal(allocatePluginId('待办', []), 'plugin')
  assert.equal(allocatePluginId('Hello Box', ['hello-box']), 'hello-box-2')
})
