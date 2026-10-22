import type { ReactNode } from 'react'

const menus = new Map<string, ReactNode>()
const listeners = new Set<() => void>()
let version = 0
let dismiss: (() => void) | undefined

function emit() {
  version += 1
  for (const fn of listeners) fn()
}

export function subscribeInspectorPaneMenu(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getInspectorPaneMenuVersion() {
  return version
}

export function getInspectorPaneMenu(id: string) {
  return menus.get(id) ?? null
}

export function reportInspectorPaneMenu(id: string, node: ReactNode | null) {
  const key = String(id ?? '').trim()
  if (!key) return
  if (node == null) {
    if (!menus.has(key)) return
    menus.delete(key)
  } else {
    menus.set(key, node)
  }
  emit()
}

export function bindInspectorPaneMenuDismiss(fn: () => void) {
  dismiss = fn
  return () => {
    if (dismiss === fn) dismiss = undefined
  }
}

export function dismissInspectorPaneMenu() {
  dismiss?.()
}
