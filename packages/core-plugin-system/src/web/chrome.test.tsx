import { test } from 'vitest'
import assert from 'node:assert/strict'
import { render } from '@testing-library/react'
import { pluginsChrome } from './chrome.tsx'

test('plugin actions come from the collection action schema', () => {
  assert.equal(pluginsChrome.Actions, undefined)
})

test('plugin title puts a green dot left of the name when enabled', () => {
  const Title = pluginsChrome.Title
  assert.ok(Title)
  const off = render(<Title record={{ id: 'draft' }} label="草稿" />)
  assert.equal(off.container.querySelector('[data-testid="plugin-enabled-dot"]'), null)
  const on = render(<Title record={{ id: 'demo', enabled: true }} label="画板" />)
  const dot = on.container.querySelector('[data-testid="plugin-enabled-dot"]')
  assert.ok(dot)
  assert.ok(dot?.nextElementSibling?.textContent?.includes('画板'))
})

test('plugin title shows workbench stage when the plugin has one', () => {
  const Title = pluginsChrome.Title
  assert.ok(Title)
  const view = render(<Title record={{ id: 'draft', stage: 'brief' }} label="草稿" />)
  assert.equal(view.container.querySelector('[data-testid="plugin-workbench-stage"]')?.textContent, '需求')
})
