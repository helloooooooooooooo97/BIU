import { render, waitFor } from '@testing-library/react'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { PageHostView } from './page-host-view.tsx'
import { setPageViews } from './page-views.ts'

test('host view paints the default sandbox when the view file is missing', async () => {
  setPageViews('home', [
    { id: 'site1', name: '官网', kind: 'sandbox', file: 'missing-view.jsx', dataFile: 'missing-data.json' },
  ])
  const { getByTestId } = render(<PageHostView record={{ id: 'home', title: '演示页' }} viewId="site1" />)
  await waitFor(() => {
    assert.ok(getByTestId('page-host-view-root'))
  })
  assert.ok(getByTestId('page-host-side-bar'))
  assert.ok(getByTestId('page-host-preview'))
  assert.ok(getByTestId('page-host-code'))
  assert.match(getByTestId('page-host-view-root').textContent ?? '', /本页沙盒/)
  assert.match(getByTestId('page-host-view-root').textContent ?? '', /演示页/)
})
