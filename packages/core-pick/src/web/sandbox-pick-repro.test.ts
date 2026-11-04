import { test } from 'vitest'
import assert from 'node:assert/strict'
import * as React from 'react'
import { injectPageBlockPlugin } from '../../../core-editor/src/web/page-block-plugin-host.ts'
import { ignorePickCapture } from './overlay.tsx'
import { resolvePickAtPoint } from './resolve.ts'

;(globalThis as unknown as { React: typeof React }).React = React

const SOURCE = `export default function App() {
  const [n, setN] = React.useState(0)
  return (
    <div data-testid="sandbox-app" style={{ padding: 16 }}>
      <p data-testid="sandbox-copy">用组件写这块</p>
      <button type="button" data-testid="sandbox-count" onClick={() => setN((v) => v + 1)}>
        点过 {n} 次
      </button>
    </div>
  )
}
`

const LIGHT_PICK_MODE_CSS = `html.pick-mode, html.pick-mode * { cursor: crosshair !important; user-select: none !important; }`

function stubBox(el: Element, left: number, top: number, width: number, height: number) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON() {
          return {}
        },
      }) as DOMRect,
  })
}

function layoutTree(host: HTMLElement, inner: HTMLElement) {
  let node: Element | null = host
  while (node && node !== document.documentElement) {
    stubBox(node, 0, 0, 400, 280)
    node = node.parentElement
  }
  stubBox(host, 8, 40, 384, 220)
  for (const el of host.shadowRoot?.querySelectorAll('*') ?? []) {
    stubBox(el, 8, 40, 384, 220)
  }
  stubBox(inner, 24, 120, 80, 24)
}

async function mountLiveSandbox() {
  const { mountSandbox, hostThemeCss, SANDBOX_PICK_MODE_CSS } = await import(
    '../../../../.plugin-dev/page-sandbox/web/sandbox.ts'
  )
  const { stampSandboxPickSurfaces } = await import('../../../../.plugin-dev/page-sandbox/web/stamp-picks.ts')
  const sheet = document.createElement('style')
  sheet.setAttribute('data-testid', 'light-pick-mode-css')
  sheet.textContent = LIGHT_PICK_MODE_CSS
  document.head.append(sheet)
  const editor = document.createElement('div')
  editor.className = 'tiptap page-editor'
  editor.setAttribute('data-testid', 'page-editor')
  const block = document.createElement('div')
  block.className = 'page-block'
  block.setAttribute('data-page-block', 'sandbox')
  block.setAttribute('data-page-block-plugin', 'page-sandbox')
  block.setAttribute('data-biu-plugin', 'page-sandbox')
  block.setAttribute('data-biu-kind', 'plugin')
  block.setAttribute('data-biu-id', 'page-sandbox:ab12cd34')
  const card = document.createElement('div')
  card.setAttribute('data-testid', 'page-sandbox-block')
  const bar = document.createElement('div')
  bar.setAttribute('data-testid', 'sandbox-bar')
  bar.setAttribute('data-biu-ignore', '')
  const pane = document.createElement('div')
  pane.style.overflow = 'auto'
  const host = document.createElement('div')
  host.setAttribute('data-testid', 'page-sandbox-preview')
  host.setAttribute('data-sandbox', '')
  host.setAttribute('data-page-block-capture', '')
  pane.append(host)
  card.append(bar, pane)
  block.append(card)
  editor.append(block)
  document.body.append(editor)
  const root = host.attachShadow({ mode: 'open' })
  const mounted = mountSandbox(root, SOURCE)
  const body = root.querySelector('[data-sandbox-root]')
  if (body instanceof HTMLElement) stampSandboxPickSurfaces(body, '0-live-doc', { plugin: 'page-sandbox', includeRoot: false })
  injectPageBlockPlugin(block, 'page-sandbox')
  return {
    editor,
    block,
    host,
    root,
    bar,
    mounted,
    themeCss: hostThemeCss(),
    pickModeCss: SANDBOX_PICK_MODE_CSS,
    injectedCss: [...root.querySelectorAll('style')].map((el) => el.textContent ?? '').join('\n'),
    bodyHtml: body instanceof HTMLElement ? body.innerHTML : '',
    unmount: async () => {
      const { unmountSandbox } = await import('../../../../.plugin-dev/page-sandbox/web/sandbox.ts')
      unmountSandbox(root)
      sheet.remove()
      editor.remove()
    },
  }
}

function dump(host: HTMLElement, extra: Record<string, unknown> = {}) {
  const root = host.shadowRoot
  const stamps = root ? [...root.querySelectorAll('[data-sandbox-pick]')] : []
  return {
    shadow: Boolean(root),
    sandboxHosts: document.querySelectorAll('[data-sandbox]').length,
    reactRoot: Boolean(root?.querySelector('[data-sandbox-root]')),
    stampCount: stamps.length,
    stampTags: stamps.map((el) => el.tagName),
    buttonStamped: Boolean(root?.querySelector('[data-testid="sandbox-count"]')?.hasAttribute('data-sandbox-pick')),
    buttonKind: root?.querySelector('[data-testid="sandbox-count"]')?.getAttribute('data-biu-kind') ?? null,
    pluginOnPane: host.parentElement?.getAttribute('data-biu-kind') ?? null,
    ...extra,
  }
}

test('live sandbox: mount, stamp, pick the inner button, then re-render', async () => {
  const live = await mountLiveSandbox()
  const themeHasHostContext = /:host-context\(html\.pick-mode\)/.test(live.injectedCss)
  const themeFnHasHostContext = /:host-context\(html\.pick-mode\)/.test(live.themeCss)
  const before = dump(live.host, {
    mounted: live.mounted,
    bodyHtml: live.bodyHtml,
    themeHasHostContext,
    themeFnHasHostContext,
    injectedCss: live.injectedCss,
  })
  const button = live.root.querySelector('[data-testid="sandbox-count"]')
  assert.ok(button instanceof HTMLElement, `button missing ${JSON.stringify(before)}`)
  layoutTree(live.host, button)

  const pickBefore = resolvePickAtPoint(30, 130, '/pages/p1')
  document.documentElement.classList.add('pick-mode')
  const pickCursor = {
    html: getComputedStyle(document.documentElement).cursor,
    host: getComputedStyle(live.host).cursor,
    button: getComputedStyle(button).cursor,
    lightCssInDocument: Boolean(document.querySelector('[data-testid="light-pick-mode-css"]')),
    shadowHasLightSelector: /html\.pick-mode\s+\*/.test(live.injectedCss),
    shadowHasHostContext: themeHasHostContext,
  }
  document.documentElement.classList.remove('pick-mode')

  const composed = {
    target: button,
    composedPath: () => [button, button.parentElement, live.host, live.host.parentElement, live.block, live.editor, document.body].filter(Boolean),
  } as unknown as Event
  const ignored = ignorePickCapture(button, composed)

  button.click()
  const afterClick = dump(live.host)
  layoutTree(live.host, button)
  const pickAfter = resolvePickAtPoint(30, 130, '/pages/p1')

  await live.unmount()

  const report = {
    before,
    pickBefore: pickBefore ? { kind: pickBefore.ref.kind, id: pickBefore.ref.id, label: pickBefore.ref.label } : null,
    pickCursor,
    ignored,
    afterClick,
    pickAfter: pickAfter ? { kind: pickAfter.ref.kind, id: pickAfter.ref.id, label: pickAfter.ref.label } : null,
  }
  assert.equal(before.stampCount > 0, true, `no stamps after mount ${JSON.stringify(report)}`)
  assert.equal(before.buttonStamped, true, `button not stamped ${JSON.stringify(report)}`)
  assert.ok(pickBefore, `pick missed button after mount ${JSON.stringify(report)}`)
  assert.equal(pickBefore?.ref.kind, 'sandbox', JSON.stringify(report))
  assert.match(String(pickBefore?.ref.id), /sandbox:/, JSON.stringify(report))
  assert.equal(ignored, false, `inner sandbox click was treated as ignore ${JSON.stringify(report)}`)
  assert.equal(afterClick.buttonStamped, true, `React re-render wiped pick stamps ${JSON.stringify(report)}`)
  assert.equal(pickAfter?.ref.kind, 'sandbox', `after click pick left the sandbox ${JSON.stringify(report)}`)
  assert.equal(
    themeHasHostContext && themeFnHasHostContext,
    true,
    `pick-mode cursor never enters the sandbox shadow; html.pick-mode * does not pierce. ${JSON.stringify(report)}`,
  )
})
