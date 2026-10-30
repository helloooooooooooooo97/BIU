import { test } from 'vitest'
import assert from 'node:assert/strict'
import { render } from '@testing-library/react'
import { pluginsChrome } from './chrome.tsx'

test('plugin actions come from the collection action schema', () => {
  assert.equal(pluginsChrome.Actions, undefined)
})

test('plugin title marks enabled rows so the row icon can turn green', () => {
  const Title = pluginsChrome.Title
  assert.ok(Title)
  const off = render(<Title record={{ id: 'draft' }} label="草稿" />)
  assert.equal(off.container.querySelector('[data-plugin-enabled]'), null)
  const on = render(<Title record={{ id: 'demo', enabled: true }} label="画板" />)
  const mark = on.container.querySelector('[data-plugin-enabled]')
  assert.ok(mark)
  assert.match(mark?.textContent ?? '', /画板/)
  assert.equal(on.container.querySelector('[data-testid="plugin-enabled-dot"]'), null)
})
