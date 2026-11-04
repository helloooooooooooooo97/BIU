import { test } from 'vitest'
import assert from 'node:assert/strict'
import * as React from 'react'

;(globalThis as unknown as { React: typeof React }).React = React

const SOURCE = `export default function App() {
  React.useEffect(() => {
    const onKey = () => {
      const n = Number(document.documentElement.getAttribute('data-sandbox-key-hits') || '0')
      document.documentElement.setAttribute('data-sandbox-key-hits', String(n + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return <div data-testid="sandbox-app">ok</div>
}
`

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

test('sandbox window shortcuts do not fire until the preview is live', async () => {
  const { mountSandbox, unmountSandbox } = await import('./sandbox.ts')
  const { setLivePreview } = await import('./active.ts')
  const host = document.createElement('div')
  host.setAttribute('data-sandbox', '')
  document.body.append(host)
  const root = host.attachShadow({ mode: 'open' })
  document.documentElement.setAttribute('data-sandbox-key-hits', '0')
  mountSandbox(root, SOURCE)
  await flush()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
  assert.equal(document.documentElement.getAttribute('data-sandbox-key-hits'), '0')
  setLivePreview(host)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
  assert.equal(document.documentElement.getAttribute('data-sandbox-key-hits'), '1')
  document.documentElement.classList.add('pick-mode')
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
  assert.equal(document.documentElement.getAttribute('data-sandbox-key-hits'), '1')
  document.documentElement.classList.remove('pick-mode')
  setLivePreview(null)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
  assert.equal(document.documentElement.getAttribute('data-sandbox-key-hits'), '1')
  unmountSandbox(root)
  host.remove()
})
