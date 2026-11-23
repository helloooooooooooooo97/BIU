/** @vitest-environment jsdom */
import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { GroupQueryMenu, type QueryField } from './query-menus.tsx'
import { applyGroupConfig, type GroupConfig } from './saved-view.ts'

afterEach(() => {
  cleanup()
})

const FIELDS: QueryField[] = [
  { key: 'status', kind: 'select', field: { type: 'select', label: '状态' } },
  { key: 'tag::tag-10::提交时间', kind: 'datetime', field: { type: 'datetime', label: '需求·提交时间' } },
]

test('GroupQueryMenu picks datetime field with ::day default and switches grain via 分组方式', () => {
  const seen: string[] = []
  function Harness() {
    const [groupBy, setGroupBy] = useState('')
    return (
      <GroupQueryMenu
        groupBy={groupBy}
        fields={FIELDS}
        onChange={(next) => {
          seen.push(next)
          setGroupBy(next)
        }}
      />
    )
  }

  render(<Harness />)
  assert.ok(screen.getByTestId('fsdb-group-panel'))

  // Open 分组条件 dropdown and click datetime field -> defaults to ::day
  const fieldRow = screen.getByTestId('fsdb-group-field-row')
  const fieldTrigger = fieldRow.querySelector('button')
  assert.ok(fieldTrigger)
  fireEvent.click(fieldTrigger)
  fireEvent.click(screen.getByText('需求·提交时间'))
  assert.equal(seen.at(-1), 'tag::tag-10::提交时间::day')
  assert.ok(screen.getByTestId('fsdb-group-panel'))
  assert.ok(screen.getByTestId('fsdb-group-grain-row'))

  // Open 分组方式 dropdown and switch to 按月
  const grainRow = screen.getByTestId('fsdb-group-grain-row')
  const trigger = grainRow.querySelector('button')
  assert.ok(trigger)
  fireEvent.click(trigger)
  fireEvent.click(screen.getByText('按月'))
  assert.equal(seen.at(-1), 'tag::tag-10::提交时间::month')

  // Switch to 按年
  fireEvent.click(trigger)
  fireEvent.click(screen.getByText('按年'))
  assert.equal(seen.at(-1), 'tag::tag-10::提交时间::year')

  // Clear grouping -> stays in unified 分组设置 panel with 不分组
  fireEvent.click(screen.getByText('取消分组'))
  assert.equal(seen.at(-1), '')
  assert.ok(screen.getByTestId('fsdb-group-panel'))
  assert.equal(screen.queryByTestId('fsdb-group-grain-row'), null)
})

test('GroupQueryMenu hides 分组方式 for non-datetime fields', () => {
  render(<GroupQueryMenu groupBy="status" fields={FIELDS} onChange={() => undefined} />)
  assert.ok(screen.getByTestId('fsdb-group-panel'))
  assert.equal(screen.queryByTestId('fsdb-group-grain-row'), null)
})

test('GroupQueryMenu supports group sort, hideEmpty switch, and per-group / bulk visibility toggles', () => {
  const sampleGroups = [
    { key: '2026-11-19', label: '2026/11/19', count: 3 },
    { key: '2026-11-20', label: '2026/11/20', count: 2 },
    { key: '', label: '无 提交时间', count: 1 },
  ]
  const seenConfigs: Array<GroupConfig | undefined> = []

  function Harness() {
    const [config, setConfig] = useState<GroupConfig | undefined>(undefined)
    return (
      <GroupQueryMenu
        groupBy="tag::tag-10::提交时间::day"
        groupConfig={config}
        groups={sampleGroups}
        fields={FIELDS}
        onChange={() => undefined}
        onChangeConfig={(next) => {
          seenConfigs.push(next)
          setConfig(next)
        }}
      />
    )
  }

  render(<Harness />)

  // Switch sort from 手动排序 to 降序
  const sortRow = screen.getByTestId('fsdb-group-sort-row')
  const sortBtn = sortRow.querySelector('button')!
  fireEvent.click(sortBtn)
  fireEvent.click(screen.getByText('降序'))
  assert.equal(seenConfigs.at(-1)?.sort, 'desc')

  // Toggle 隐藏无记录分组 switch off
  const hideEmptySwitch = screen.getByRole('switch', { name: '隐藏无记录分组' })
  assert.equal(hideEmptySwitch.getAttribute('aria-checked'), 'true')
  fireEvent.click(hideEmptySwitch)
  assert.equal(seenConfigs.at(-1)?.hideEmpty, false)

  // Hide a single group -> moves to 已隐藏分组
  fireEvent.click(screen.getByRole('button', { name: '隐藏分组 2026/11/19' }))
  assert.deepEqual(seenConfigs.at(-1)?.hidden, ['2026-11-19'])
  assert.ok(screen.getByTestId('fsdb-group-hidden-section'))
  assert.equal(screen.getAllByTestId('fsdb-group-visible-item').length, 2)
  assert.equal(screen.getAllByTestId('fsdb-group-hidden-item').length, 1)

  // Restore it via eye button
  fireEvent.click(screen.getByRole('button', { name: '显示分组 2026/11/19' }))
  assert.equal(seenConfigs.at(-1)?.hidden, undefined)
  assert.equal(screen.queryByTestId('fsdb-group-hidden-section'), null)

  // 全部隐藏 -> 全部显示
  fireEvent.click(screen.getByText('全部隐藏'))
  assert.equal(screen.getAllByTestId('fsdb-group-hidden-item').length, 3)
  fireEvent.click(screen.getAllByText('全部显示')[0]!)
  assert.equal(screen.getAllByTestId('fsdb-group-visible-item').length, 3)
})

test('applyGroupConfig sorts buckets asc/desc/manual, filters empty and hidden groups', () => {
  const buckets = [
    { key: '', label: '无 提交时间', rows: [{}], total: 1 },
    { key: '2026-11-19', label: '2026/11/19', rows: [{}, {}], total: 2 },
    { key: '2026-11-20', label: '2026/11/20', rows: [{}], total: 1 },
    { key: '2026-11-18', label: '2026/11/18', rows: [], total: 0 },
  ]

  // Default hides empty, preserves order
  assert.deepEqual(
    applyGroupConfig(buckets, undefined).map((b) => b.key),
    ['', '2026-11-19', '2026-11-20'],
  )

  // hideEmpty: false keeps empty bucket
  assert.deepEqual(
    applyGroupConfig(buckets, { hideEmpty: false }).map((b) => b.key),
    ['', '2026-11-19', '2026-11-20', '2026-11-18'],
  )

  // sort: desc puts newest first, empty last
  assert.deepEqual(
    applyGroupConfig(buckets, { sort: 'desc' }).map((b) => b.key),
    ['2026-11-20', '2026-11-19', ''],
  )

  // sort: asc puts oldest first, empty last
  assert.deepEqual(
    applyGroupConfig(buckets, { sort: 'asc', hideEmpty: false }).map((b) => b.key),
    ['2026-11-18', '2026-11-19', '2026-11-20', ''],
  )

  // manual order + hidden
  assert.deepEqual(
    applyGroupConfig(buckets, {
      sort: 'manual',
      order: ['2026-11-20', '', '2026-11-19'],
      hidden: ['2026-11-19'],
    }).map((b) => b.key),
    ['2026-11-20', ''],
  )
})

test('GroupQueryMenu toggles grouping on and off while preserving saved field and config', () => {
  const seenGroupBy: string[] = []
  const seenConfigs: Array<GroupConfig | undefined> = []
  const initialConfig: GroupConfig = { sort: 'desc', hideEmpty: false }
  const groups = [
    { key: 'a', label: 'A', total: 2 },
    { key: 'b', label: 'B', total: 1 },
  ]

  function Harness() {
    const [groupBy, setGroupBy] = useState('status')
    const [cfg, setCfg] = useState<GroupConfig | undefined>(initialConfig)
    return (
      <GroupQueryMenu
        groupBy={groupBy}
        groupConfig={cfg}
        groups={groupBy ? groups : []}
        fields={FIELDS}
        onChange={(next) => {
          seenGroupBy.push(next)
          setGroupBy(next)
          if (next !== groupBy) setCfg(undefined)
        }}
        onChangeConfig={(next) => {
          seenConfigs.push(next)
          setCfg(next)
        }}
      />
    )
  }

  render(<Harness />)
  const toggle = screen.getByRole('switch', { name: '启用分组' })
  assert.equal(toggle.getAttribute('aria-checked'), 'true')
  assert.ok(screen.getByText('已生效'))

  // Toggle OFF: clears active groupBy, keeps paused preview visible
  fireEvent.click(toggle)
  assert.equal(seenGroupBy.at(-1), '')
  assert.equal(toggle.getAttribute('aria-checked'), 'false')
  assert.ok(screen.getByText('未生效'))
  assert.equal(screen.getAllByTestId('fsdb-group-visible-item').length, 2)

  // Toggle ON: restores saved groupBy and groupConfig
  fireEvent.click(toggle)
  assert.equal(seenGroupBy.at(-1), 'status')
  assert.deepEqual(seenConfigs.at(-1), initialConfig)
  assert.equal(toggle.getAttribute('aria-checked'), 'true')
  assert.ok(screen.getByText('已生效'))
})
