import { test } from 'vitest'
import assert from 'node:assert/strict'
import { fireEvent, render } from '@testing-library/react'
import { SourceToggle } from './source-toggle.tsx'
import { isPageSourceMode, setPageSourceMode } from './source-mode.ts'

test('source toggle flips markdown source mode for the record', () => {
  setPageSourceMode('home', false)
  const { getByTestId } = render(<SourceToggle record={{ id: 'home' }} />)
  const btn = getByTestId('page-source-toggle')
  assert.equal(btn.getAttribute('aria-pressed'), 'false')
  assert.match(btn.textContent ?? '', /源码模式/)
  fireEvent.click(btn)
  assert.equal(isPageSourceMode('home'), true)
  assert.match(btn.textContent ?? '', /正文模式/)
})
