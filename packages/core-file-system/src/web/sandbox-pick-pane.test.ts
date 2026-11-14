import { test } from 'vitest'
import assert from 'node:assert/strict'
import { bindSandboxPickPane, recordPropHostPickKey } from './sandbox-pick-pane.ts'

test('property host preview stamps inner sandbox surfaces for pick', () => {
  const root = document.createElement('div')
  root.setAttribute('data-sandbox', '')
  root.innerHTML = `<div data-testid="record-prop-host-root"><h1>属性沙盒</h1><button type="button">标题</button></div>`
  document.body.append(root)
  const stop = bindSandboxPickPane(root, recordPropHostPickKey('/pages', 'home', 'card1'), {
    path: '/pages/home',
    name: 'prop-view-card1.jsx',
    title: '卡片',
  })
  assert.equal(root.getAttribute('data-biu-kind'), 'sandbox')
  assert.equal(root.getAttribute('data-sandbox-pick'), '')
  assert.match(root.getAttribute('data-biu-id') ?? '', /^sandbox:record-prop-host-\/pages-home-card1:/)
  const heading = root.querySelector('h1')
  assert.ok(heading)
  assert.equal(heading.getAttribute('data-sandbox-pick'), '')
  assert.equal(heading.getAttribute('data-biu-kind'), 'sandbox')
  assert.equal(heading.getAttribute('data-biu-path'), '/pages/home')
  const chip = root.querySelector('button')
  assert.ok(chip)
  assert.equal(chip.getAttribute('data-sandbox-pick'), '')
  stop()
  root.remove()
})
