import { test } from 'vitest'
import assert from 'node:assert/strict'
import { bindSandboxPickRelay, SANDBOX_PICK_EVENT } from './sandbox-relay.ts'

test('sandbox relay reports the inner stamp without scanning the page', () => {
  const host = document.createElement('div')
  host.setAttribute('data-sandbox', '')
  const inner = document.createElement('p')
  inner.setAttribute('data-sandbox-pick', '')
  inner.setAttribute('data-biu-kind', 'sandbox')
  host.append(inner)
  document.body.append(host)
  document.documentElement.classList.add('pick-mode')
  const stop = bindSandboxPickRelay(host)
  let seen: Event | null = null
  window.addEventListener(SANDBOX_PICK_EVENT, (event) => {
    seen = event
  })
  inner.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, composed: true }))
  assert.ok(seen)
  assert.equal((seen as CustomEvent).detail.el, inner)
  stop()
  host.remove()
  document.documentElement.classList.remove('pick-mode')
})
