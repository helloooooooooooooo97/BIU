import type { ComponentType, ReactNode } from 'react'
import { apiFetch } from '@biu/biu-ui/api-client'

/**
 * Dependency-inversion bridge so L2 `web-app-shell` never statically imports
 * L3 business plugins like `@biu/core-file-system`.
 * `core-file-system` registers its concrete implementations at startup via `registerShellDataBridge`.
 */
export interface ShellWorkspaceProfile {
  theme?: string
  [key: string]: unknown
}

export interface ShellPagePrefs {
  pageWidth?: string
  fontSize?: string
  [key: string]: unknown
}

export interface ShellDataBridge {
  hydratePagePrefs: () => Promise<unknown> | void
  getPagePrefs: () => ShellPagePrefs
  subscribePageWidth: (fn: () => void) => () => void
  getWorkspaceProfile: () => Promise<ShellWorkspaceProfile | null>
  resetWorkspaceProfileGet: () => void
  overlayDataRoute: (pathname: string) => unknown
  getDatabaseUi: () => unknown
  loadTags: () => Promise<Array<Record<string, unknown>>>
  LayoutPrefsMenu: ComponentType<Record<string, unknown>>
  getInspectorDbPath: (tabId: string) => string | undefined
  isInspectorPaneAbandoned: (tabId: string) => boolean
  restoreInspectorDbPaths: (paths: Record<string, string>) => void
  reuseInspectorOfferPane: (tabId: string, collection?: string) => boolean
  snapshotInspectorDbPaths: () => Record<string, string>
  subscribeInspectorDbPath: (fn: () => void) => () => void
  bindInspectorPaneMenuDismiss: (tabId: string, dismiss: () => void) => () => void
  getInspectorPaneMenu: (tabId: string) => ReactNode
  getInspectorPaneMenuVersion: () => number
  subscribeInspectorPaneMenu: (fn: () => void) => () => void
}

let defaultProfileInflight: Promise<ShellWorkspaceProfile | null> | null = null

async function defaultGetWorkspaceProfile(): Promise<ShellWorkspaceProfile | null> {
  if (defaultProfileInflight) return defaultProfileInflight
  defaultProfileInflight = (async () => {
    try {
      const res = await apiFetch('/api/profile')
      if (!res.ok) return null
      return (await res.json()) as ShellWorkspaceProfile
    } catch {
      return null
    }
  })()
  return defaultProfileInflight
}

function defaultResetWorkspaceProfileGet() {
  defaultProfileInflight = null
}

const EmptyComponent: ComponentType<Record<string, unknown>> = () => null

const bridge: ShellDataBridge = {
  hydratePagePrefs: () => undefined,
  getPagePrefs: () => ({}),
  subscribePageWidth: () => () => {},
  getWorkspaceProfile: defaultGetWorkspaceProfile,
  resetWorkspaceProfileGet: defaultResetWorkspaceProfileGet,
  overlayDataRoute: () => null,
  getDatabaseUi: () => null,
  loadTags: async () => [],
  LayoutPrefsMenu: EmptyComponent,
  getInspectorDbPath: () => undefined,
  isInspectorPaneAbandoned: () => false,
  restoreInspectorDbPaths: () => undefined,
  reuseInspectorOfferPane: () => false,
  snapshotInspectorDbPaths: () => ({}),
  subscribeInspectorDbPath: () => () => {},
  bindInspectorPaneMenuDismiss: () => () => {},
  getInspectorPaneMenu: () => null,
  getInspectorPaneMenuVersion: () => 0,
  subscribeInspectorPaneMenu: () => () => {},
}

export function registerShellDataBridge(partial: Partial<ShellDataBridge>) {
  Object.assign(bridge, partial)
}

export const hydratePagePrefs: ShellDataBridge['hydratePagePrefs'] = () => bridge.hydratePagePrefs()
export const getPagePrefs: ShellDataBridge['getPagePrefs'] = () => bridge.getPagePrefs()
export const subscribePageWidth: ShellDataBridge['subscribePageWidth'] = (fn) => bridge.subscribePageWidth(fn)
export const getWorkspaceProfile: ShellDataBridge['getWorkspaceProfile'] = () => bridge.getWorkspaceProfile()
export const resetWorkspaceProfileGet: ShellDataBridge['resetWorkspaceProfileGet'] = () => bridge.resetWorkspaceProfileGet()
export const overlayDataRoute: ShellDataBridge['overlayDataRoute'] = (pathname) => bridge.overlayDataRoute(pathname)
export const getDatabaseUi: ShellDataBridge['getDatabaseUi'] = () => bridge.getDatabaseUi()
export const loadTags: ShellDataBridge['loadTags'] = () => bridge.loadTags()
export function LayoutPrefsMenu(props: Record<string, unknown>) {
  const Impl = bridge.LayoutPrefsMenu
  return Impl(props) as ReactNode
}
export const getInspectorDbPath: ShellDataBridge['getInspectorDbPath'] = (tabId) => bridge.getInspectorDbPath(tabId)
export const isInspectorPaneAbandoned: ShellDataBridge['isInspectorPaneAbandoned'] = (tabId) =>
  bridge.isInspectorPaneAbandoned(tabId)
export const restoreInspectorDbPaths: ShellDataBridge['restoreInspectorDbPaths'] = (paths) =>
  bridge.restoreInspectorDbPaths(paths)
export const reuseInspectorOfferPane: ShellDataBridge['reuseInspectorOfferPane'] = (tabId, collection) =>
  bridge.reuseInspectorOfferPane(tabId, collection)
export const snapshotInspectorDbPaths: ShellDataBridge['snapshotInspectorDbPaths'] = () =>
  bridge.snapshotInspectorDbPaths()
export const subscribeInspectorDbPath: ShellDataBridge['subscribeInspectorDbPath'] = (fn) =>
  bridge.subscribeInspectorDbPath(fn)
export const bindInspectorPaneMenuDismiss: ShellDataBridge['bindInspectorPaneMenuDismiss'] = (tabId, dismiss) =>
  bridge.bindInspectorPaneMenuDismiss(tabId, dismiss)
export const getInspectorPaneMenu: ShellDataBridge['getInspectorPaneMenu'] = (tabId) =>
  bridge.getInspectorPaneMenu(tabId)
export const getInspectorPaneMenuVersion: ShellDataBridge['getInspectorPaneMenuVersion'] = () =>
  bridge.getInspectorPaneMenuVersion()
export const subscribeInspectorPaneMenu: ShellDataBridge['subscribeInspectorPaneMenu'] = (fn) =>
  bridge.subscribeInspectorPaneMenu(fn)
