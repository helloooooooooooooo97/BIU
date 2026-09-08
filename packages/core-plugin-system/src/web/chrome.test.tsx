import { test } from 'vitest'
import assert from 'node:assert/strict'
import { render } from '@testing-library/react'
import type { CollectionActionInfo } from '@biu/type-file-system'
import { pluginsChrome } from './chrome.tsx'

const actions: CollectionActionInfo[] = [
  { id: 'start', label: '运行', when: { installed: true, running: false } },
  { id: 'stop', label: '停止', when: { installed: true, running: true } },
  { id: 'pack', label: '打包', when: { sandbox: true } },
]

test('plugin run toggle stays hidden until the plugin is installed', () => {
  const Actions = pluginsChrome.Actions
  assert.ok(Actions)
  const { container, rerender } = render(
    <Actions actions={actions} record={{ id: 'draft', sandbox: true }} busy={false} place="row" run={() => {}} />,
  )
  assert.equal(container.querySelector('[aria-label="运行"]'), null)
  assert.equal(container.querySelector('[aria-label="停止"]'), null)
  rerender(
    <Actions actions={actions} record={{ id: 'demo', installed: true }} busy={false} place="row" run={() => {}} />,
  )
  assert.ok(container.querySelector('[aria-label="运行"]'))
  assert.equal(container.querySelector('[aria-label="停止"]'), null)
  rerender(
    <Actions
      actions={actions}
      record={{ id: 'demo', installed: true, running: true }}
      busy={false}
      place="row"
      run={() => {}}
    />,
  )
  assert.ok(container.querySelector('[aria-label="停止"]'))
})

test('plugin run toggle hides after uninstall', () => {
  const Actions = pluginsChrome.Actions
  assert.ok(Actions)
  const { container } = render(
    <Actions
      actions={[...actions, { id: 'uninstall', label: '卸载', when: { installed: true } }]}
      record={{ id: 'demo', sandbox: true }}
      busy={false}
      place="row"
      run={() => {}}
    />,
  )
  assert.equal(container.querySelector('[aria-label="运行"]'), null)
  assert.equal(container.querySelector('[aria-label="停止"]'), null)
  assert.equal(container.querySelector('[aria-label="卸载"]'), null)
  assert.ok(container.querySelector('[aria-label="打包"]'))
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
