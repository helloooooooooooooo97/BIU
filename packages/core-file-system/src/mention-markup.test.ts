import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  formatMentionMarkup,
  listMentionRefs,
  projectMentionLabels,
  stripMentionLabels,
  takeMentionMarkup,
} from './mention-markup.ts'

test('mention markup keeps id and drops label on strip', () => {
  const raw = '见 [@ id="page/p053" label="未命名页面"] 和 [@ id="task/t1" label="甲"]。'
  assert.deepEqual(
    listMentionRefs(raw).map((item) => item.id),
    ['page/p053', 'task/t1'],
  )
  assert.equal(stripMentionLabels(raw), '见 [@ id="page/p053"] 和 [@ id="task/t1"]。')
  assert.equal(
    projectMentionLabels(stripMentionLabels(raw), { 'page/p053': '现在的标题', 'task/t1': '任务甲' }),
    '见 [@ id="page/p053" label="现在的标题"] 和 [@ id="task/t1" label="任务甲"]。',
  )
})

test('takeMentionMarkup reads id at the start of a string', () => {
  const taken = takeMentionMarkup('[@ id="page/p1" label="首页"] 后面')
  assert.equal(taken?.id, 'page/p1')
  assert.equal(taken?.label, '首页')
  assert.equal(formatMentionMarkup('page/p1'), '[@ id="page/p1"]')
})
