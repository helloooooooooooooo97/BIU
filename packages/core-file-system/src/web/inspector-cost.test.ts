import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { historyNavigationSubscribers, subscribeHistoryNavigation } from './history-nav.ts'
import { inspectorPaneAcceptsKeys, listReloadInterval } from './inspector-pane-cost.ts'

afterEach(() => {
  while (historyNavigationSubscribers()) {
    // subscribers uninstall themselves; tests below always unsubscribe
    break
  }
})

test('eight open pages: history, keys, and list poll before vs after', () => {
  const pages = 8
  let legacyHistory = 0
  let currentHistory = 0
  const wraps: Array<History['pushState']> = []
  let native = history.pushState
  for (let i = 0; i < pages; i += 1) {
    const orig = history.pushState
    history.pushState = ((...args: Parameters<History['pushState']>) => {
      legacyHistory += 1
      return orig.apply(history, args)
    }) as History['pushState']
    wraps.push(history.pushState)
  }
  history.pushState({}, '', '/pages')
  history.pushState = native

  const stops = Array.from({ length: pages }, () =>
    subscribeHistoryNavigation(() => {
      currentHistory += 1
    }),
  )
  assert.equal(historyNavigationSubscribers(), pages)
  const shared = history.pushState
  history.pushState({}, '', '/pages')
  for (const stop of stops) stop()
  assert.equal(history.pushState, native)
  assert.deepEqual(
    { legacyWrappersRun: legacyHistory, sharedNotify: currentHistory, wrappersInstalled: shared === native ? 0 : 1 },
    { legacyWrappersRun: 8, sharedNotify: 8, wrappersInstalled: 1 },
  )

  const stages = Array.from({ length: pages }, (_, index) => {
    const stage = document.createElement('div')
    stage.className = `inspector-stage-pane${index === 0 ? ' is-active' : ''}`
    const page = document.createElement('div')
    stage.append(page)
    document.body.append(stage)
    return page
  })
  let legacyKeys = 0
  let currentKeys = 0
  const onKey = () => {
    for (const page of stages) {
      legacyKeys += 1
      if (inspectorPaneAcceptsKeys(true, page)) currentKeys += 1
    }
  }
  window.addEventListener('keydown', onKey)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
  window.removeEventListener('keydown', onKey)
  for (const page of stages) page.parentElement?.remove()
  assert.deepEqual({ legacyKeys, currentKeys }, { legacyKeys: 8, currentKeys: 1 })

  const legacyPolls = pages
  const currentPolls = Array.from({ length: pages }, () => listReloadInterval(true)).filter((ms) => ms > 0).length
  assert.deepEqual({ legacyPolls, currentPolls }, { legacyPolls: 8, currentPolls: 0 })
})
