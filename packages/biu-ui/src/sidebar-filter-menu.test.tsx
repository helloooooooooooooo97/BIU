/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  SidebarFilterMenu,
  timeBucketForTimestamp,
  useSidebarViewPrefs,
} from './sidebar-filter-menu.tsx'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function DemoHarness() {
  const [prefs, patch, reset] = useSidebarViewPrefs('test.sidebar.demo', {
    groupBy: 'project',
    orderBy: 'updated',
    status: 'all',
    showTime: true,
  })
  return (
    <div>
      <div data-testid="state">{JSON.stringify(prefs)}</div>
      <SidebarFilterMenu
        testId="demo-filter"
        grouping={{
          id: 'groupBy',
          label: '分组',
          value: prefs.groupBy,
          defaultValue: 'project',
          options: [
            { value: 'project', label: '项目' },
            { value: 'updated', label: '更新时间' },
          ],
          onChange: (value) => patch({ groupBy: value }),
        }}
        ordering={{
          id: 'orderBy',
          label: '排序',
          value: prefs.orderBy,
          defaultValue: 'updated',
          options: [
            { value: 'updated', label: '最近活跃' },
            { value: 'name', label: '名称' },
          ],
          onChange: (value) => patch({ orderBy: value }),
        }}
        shows={[
          {
            id: 'showTime',
            label: '显示时间',
            checked: prefs.showTime,
            onChange: (checked) => patch({ showTime: checked }),
          },
        ]}
        filters={[
          {
            id: 'status',
            label: '状态',
            value: prefs.status,
            defaultValue: 'all',
            options: [
              { value: 'all', label: '全部' },
              { value: 'busy', label: '运行中' },
            ],
            onChange: (value) => patch({ status: value }),
          },
        ]}
        onResetFilters={reset}
      />
    </div>
  )
}

test('SidebarFilterMenu updates localStorage-backed prefs and resets cleanly', () => {
  const view = render(<DemoHarness />)
  assert.equal(view.getByTestId('demo-filter-trigger').getAttribute('data-active'), 'false')

  fireEvent.click(view.getByTestId('demo-filter-trigger'))
  assert.ok(view.getByTestId('demo-filter-popover'))

  fireEvent.click(view.getByTestId('demo-filter-row-groupBy'))
  fireEvent.click(view.getByTestId('demo-filter-opt-groupBy-updated'))
  assert.equal(view.getByTestId('demo-filter-trigger').getAttribute('data-active'), 'true')

  fireEvent.click(view.getByTestId('demo-filter-row-status'))
  fireEvent.click(view.getByTestId('demo-filter-opt-status-busy'))

  const saved = JSON.parse(localStorage.getItem('test.sidebar.demo') ?? '{}') as Record<string, unknown>
  assert.equal(saved.groupBy, 'updated')
  assert.equal(saved.status, 'busy')

  // Remounting reads persisted prefs from localStorage
  view.unmount()
  const remounted = render(<DemoHarness />)
  assert.equal(remounted.getByTestId('demo-filter-trigger').getAttribute('data-active'), 'true')

  fireEvent.click(remounted.getByTestId('demo-filter-trigger'))
  fireEvent.click(remounted.getByTestId('demo-filter-reset'))
  assert.equal(remounted.getByTestId('demo-filter-trigger').getAttribute('data-active'), 'false')
})

test('timeBucketForTimestamp classifies timestamps into today / week / month / older', () => {
  const now = new Date(2026, 10, 28, 15, 0, 0).getTime()
  const day = 24 * 60 * 60 * 1000
  assert.equal(timeBucketForTimestamp(now - 60_000, now), 'today')
  assert.equal(timeBucketForTimestamp(now - 3 * day, now), 'week')
  assert.equal(timeBucketForTimestamp(now - 15 * day, now), 'month')
  assert.equal(timeBucketForTimestamp(now - 45 * day, now), 'older')
  assert.equal(timeBucketForTimestamp(0, now), 'older')
})
