import type { ComponentType, ReactNode } from 'react'
import { apiFetch } from '@biu/biu-ui/api-client'
import type { CollectionSchemaPack } from '@biu/type-file-system'

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

export interface ShellDatabaseUi {
  chrome: (collectionPath: string) => {
    actions?: Array<{ id: string; label: string; icon?: string; [key: string]: unknown }>
    [key: string]: unknown
  } | undefined
  [key: string]: unknown
}

export interface ShellDataBridge {
  hydratePagePrefs: () => Promise<unknown>
  getPagePrefs: () => ShellPagePrefs
  subscribePageWidth: (fn: () => void) => () => void
  getWorkspaceProfile: () => Promise<ShellWorkspaceProfile | null>
  resetWorkspaceProfileGet: () => void
  overlayDataRoute: () => string
  getDatabaseUi: () => ShellDatabaseUi | null
  loadTags: (collectionPath?: string) => CollectionSchemaPack[]
  LayoutPrefsMenu: ComponentType<Record<string, unknown>>
  getInspectorDbPath: (paneId?: string) => string | undefined
  isInspectorPaneAbandoned: (paneId: string) => boolean
  restoreInspectorDbPaths: (paths?: Record<string, string>) => void
  reuseInspectorOfferPane: (tabId: string, opened: string[]) => string | null
  snapshotInspectorDbPaths: () => Record<string, string>
  subscribeInspectorDbPath: (fn: () => void) => () => void
  bindInspectorPaneMenuDismiss: (fn: () => void) => () => void
  getInspectorPaneMenu: (id: string) => ReactNode
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
const DEFAULT_PAGE_PREFS: ShellPagePrefs = {}
const EMPTY_TAGS: CollectionSchemaPack[] = []
const EMPTY_PATHS: Record<string, string> = {}

const bridge: ShellDataBridge = {
  hydratePagePrefs: async () => undefined,
  getPagePrefs: () => DEFAULT_PAGE_PREFS,
  subscribePageWidth: () => () => {},
  getWorkspaceProfile: defaultGetWorkspaceProfile,
  resetWorkspaceProfileGet: defaultResetWorkspaceProfileGet,
  overlayDataRoute: () => '/database',
  getDatabaseUi: () => null,
  loadTags: () => EMPTY_TAGS,
  LayoutPrefsMenu: EmptyComponent,
  getInspectorDbPath: () => undefined,
  isInspectorPaneAbandoned: () => false,
  restoreInspectorDbPaths: () => undefined,
  reuseInspectorOfferPane: () => null,
  snapshotInspectorDbPaths: () => EMPTY_PATHS,
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
export const overlayDataRoute: ShellDataBridge['overlayDataRoute'] = () => bridge.overlayDataRoute()
export const getDatabaseUi: ShellDataBridge['getDatabaseUi'] = () => bridge.getDatabaseUi()
export const loadTags: ShellDataBridge['loadTags'] = (collectionPath) => bridge.loadTags(collectionPath)
export function LayoutPrefsMenu(props: Record<string, unknown>) {
  const Impl = bridge.LayoutPrefsMenu
  return Impl(props) as ReactNode
}
export const getInspectorDbPath: ShellDataBridge['getInspectorDbPath'] = (paneId) => bridge.getInspectorDbPath(paneId)
export const isInspectorPaneAbandoned: ShellDataBridge['isInspectorPaneAbandoned'] = (paneId) =>
  bridge.isInspectorPaneAbandoned(paneId)
export const restoreInspectorDbPaths: ShellDataBridge['restoreInspectorDbPaths'] = (paths) =>
  bridge.restoreInspectorDbPaths(paths)
export const reuseInspectorOfferPane: ShellDataBridge['reuseInspectorOfferPane'] = (tabId, opened) =>
  bridge.reuseInspectorOfferPane(tabId, opened)
export const snapshotInspectorDbPaths: ShellDataBridge['snapshotInspectorDbPaths'] = () =>
  bridge.snapshotInspectorDbPaths()
export const subscribeInspectorDbPath: ShellDataBridge['subscribeInspectorDbPath'] = (fn) =>
  bridge.subscribeInspectorDbPath(fn)
export const bindInspectorPaneMenuDismiss: ShellDataBridge['bindInspectorPaneMenuDismiss'] = (fn) =>
  bridge.bindInspectorPaneMenuDismiss(fn)
export const getInspectorPaneMenu: ShellDataBridge['getInspectorPaneMenu'] = (id) =>
  bridge.getInspectorPaneMenu(id)
export const getInspectorPaneMenuVersion: ShellDataBridge['getInspectorPaneMenuVersion'] = () =>
  bridge.getInspectorPaneMenuVersion()
export const subscribeInspectorPaneMenu: ShellDataBridge['subscribeInspectorPaneMenu'] = (fn) =>
  bridge.subscribeInspectorPaneMenu(fn)
