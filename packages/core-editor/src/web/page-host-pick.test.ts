import { test } from 'vitest'
import assert from 'node:assert/strict'
import { pageHostPickKey, stampPageHostPickSurfaces } from './page-host-pick.ts'

test('stamps page-host preview surfaces without overwriting nested blocks', () => {
  const root = document.createElement('div')
  root.setAttribute('data-sandbox', '')
  root.innerHTML = `
    <div data-testid="page-host-view-root">
      <h1>本页沙盒</h1>
      <button type="button" data-testid="page-host-chip-ab">表格</button>
      <div class="page-block" data-page-block="tag" data-biu-kind="plugin" data-biu-id="page-tag:tag:ab">
        <span data-testid="nested-block-cell">优先级</span>
      </div>
    </div>
  `
  document.body.append(root)
  stampPageHostPickSurfaces(root, pageHostPickKey('home', 'site1'), {
    path: '/pages/home',
    name: 'view-home-site1.jsx',
    title: '沙盒 1',
  })
  assert.equal(root.getAttribute('data-biu-kind'), 'sandbox')
  assert.equal(root.getAttribute('data-sandbox-pick'), '')
  assert.equal(root.getAttribute('data-biu-path'), '/pages/home')
  assert.equal(root.getAttribute('data-biu-name'), 'view-home-site1.jsx')
  const chip = root.querySelector('[data-testid="page-host-chip-ab"]')
  assert.ok(chip)
  assert.equal(chip.getAttribute('data-biu-kind'), 'sandbox')
  assert.equal(chip.getAttribute('data-sandbox-pick'), '')
  assert.equal(chip.getAttribute('data-biu-path'), '/pages/home')
  assert.equal(chip.getAttribute('data-biu-name'), 'view-home-site1.jsx')
  assert.match(chip.getAttribute('data-biu-id') ?? '', /^sandbox:page-host-home-site1:/)
  const nested = root.querySelector('[data-testid="nested-block-cell"]')
  assert.ok(nested)
  assert.equal(nested.hasAttribute('data-sandbox-pick'), false)
  assert.equal(root.querySelector('.page-block')?.getAttribute('data-biu-kind'), 'plugin')
  root.remove()
})
