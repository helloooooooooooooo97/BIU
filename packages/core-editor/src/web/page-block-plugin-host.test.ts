import { test } from 'vitest'
import assert from 'node:assert/strict'
import { injectPageBlockPlugin } from './page-block-plugin-host.ts'

test('page-block host stamps plugin on inner surfaces that plugins did not tag', () => {
  const host = document.createElement('div')
  host.className = 'page-block'
  const title = document.createElement('input')
  title.setAttribute('data-testid', 'page-algorithm-title')
  const html = document.createElement('div')
  html.setAttribute('data-biu-kind', 'html')
  html.setAttribute('data-biu-id', 'html:0/1')
  host.append(title, html)
  document.body.append(host)
  injectPageBlockPlugin(host, 'page-algorithm')
  assert.equal(host.getAttribute('data-biu-plugin'), 'page-algorithm')
  assert.equal(title.getAttribute('data-biu-plugin'), 'page-algorithm')
  assert.equal(title.getAttribute('data-biu-kind'), 'plugin')
  assert.equal(html.getAttribute('data-biu-plugin'), 'page-algorithm')
  assert.equal(html.getAttribute('data-biu-kind'), 'html')
  assert.equal(html.getAttribute('data-biu-id'), 'html:0/1')
  host.remove()
})

test('page-block host does not stamp plugin onto the sandbox shadow host', () => {
  const host = document.createElement('div')
  host.className = 'page-block'
  const box = document.createElement('div')
  const sand = document.createElement('div')
  sand.setAttribute('data-sandbox', '')
  sand.setAttribute('data-testid', 'page-sandbox-preview')
  box.append(sand)
  host.append(box)
  document.body.append(host)
  injectPageBlockPlugin(host, 'page-sandbox')
  assert.equal(sand.hasAttribute('data-biu-kind'), false)
  assert.equal(sand.getAttribute('data-biu-plugin'), null)
  assert.equal(box.getAttribute('data-biu-kind'), null)
  host.remove()
})
