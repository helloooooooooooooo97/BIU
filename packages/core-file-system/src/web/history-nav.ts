type HistoryUrl = string | URL | null | undefined
type HistoryListener = (url: HistoryUrl) => void

const listeners = new Set<HistoryListener>()
let originalPush: History['pushState'] | null = null
let originalReplace: History['replaceState'] | null = null
let nativePush: History['pushState'] | null = null
let nativeReplace: History['replaceState'] | null = null

function notify(url: HistoryUrl) {
  for (const listener of listeners) listener(url)
}

function install() {
  if (nativePush || typeof history === 'undefined') return
  originalPush = history.pushState
  originalReplace = history.replaceState
  nativePush = history.pushState.bind(history)
  nativeReplace = history.replaceState.bind(history)
  history.pushState = (data, unused, url) => {
    nativePush!(data, unused, url)
    notify(url)
  }
  history.replaceState = (data, unused, url) => {
    nativeReplace!(data, unused, url)
    notify(url)
  }
}

function uninstall() {
  if (!originalPush || !originalReplace) return
  history.pushState = originalPush
  history.replaceState = originalReplace
  originalPush = null
  originalReplace = null
  nativePush = null
  nativeReplace = null
}

/** 所有表共用一层 history 包装。卸掉其中一个订阅不会把别的订阅一起摘掉。 */
export function subscribeHistoryNavigation(listener: HistoryListener) {
  install()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) uninstall()
  }
}

export function historyNavigationSubscribers() {
  return listeners.size
}
