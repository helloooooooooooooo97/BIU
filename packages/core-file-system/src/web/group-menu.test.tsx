/** @vitest-environment jsdom */
import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { GroupQueryMenu, type QueryField } from './query-menus.tsx'

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
  assert.ok(screen.getByTestId('fsdb-group-pick'))

  // Click datetime field -> defaults to ::day and opens 分组设置 panel
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

  // Clear grouping
  fireEvent.click(screen.getByText('取消分组'))
  assert.equal(seen.at(-1), '')
  assert.ok(screen.getByTestId('fsdb-group-pick'))
})

test('GroupQueryMenu hides 分组方式 for non-datetime fields', () => {
  render(<GroupQueryMenu groupBy="status" fields={FIELDS} onChange={() => undefined} />)
  assert.ok(screen.getByTestId('fsdb-group-panel'))
  assert.equal(screen.queryByTestId('fsdb-group-grain-row'), null)
})
