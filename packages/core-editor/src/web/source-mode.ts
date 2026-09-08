import { useSyncExternalStore } from 'react'

const modes = new Map<string, boolean>()
let seq = 0
const listeners = new Set<() => void>()

function bump() {
  seq += 1
  for (const fn of listeners) fn()
}

export function isPageSourceMode(recordId: string) {
  return Boolean(modes.get(recordId))
}

export function setPageSourceMode(recordId: string, on: boolean) {
  const id = String(recordId ?? '').trim()
  if (!id) return
  const next = Boolean(on)
  if (Boolean(modes.get(id)) === next) return
  modes.set(id, next)
  bump()
}

export function togglePageSourceMode(recordId: string) {
  setPageSourceMode(recordId, !isPageSourceMode(recordId))
}

export function usePageSourceMode(recordId: string) {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => seq,
  )
  return isPageSourceMode(recordId)
}
