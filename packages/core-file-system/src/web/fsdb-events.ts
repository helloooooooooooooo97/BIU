import {
  BIU_ASSET_CHANGED_EVENT,
  CONTENT_JUMP_EVENT,
  FSDB_CHANGE_EVENT,
} from '@biu/type-file-system'

export {
  BIU_ASSET_CHANGED_EVENT,
  CONTENT_JUMP_EVENT,
  FSDB_CHANGE_EVENT,
}

export const FSDB_SHARES_CHANGE_EVENT = 'fsdb:shares-change' as const
export const FSDB_OPEN_VIEW_SHARE_EVENT = 'fsdb:open-view-share' as const
export const FSDB_CRUMB_LABELS_EVENT = 'fsdb:crumb-labels' as const
export const FSDB_LIST_READY_EVENT = 'fsdb:list-ready' as const
export const FSDB_DETAIL_REFRESH_EVENT = 'fsdb:detail-refresh' as const
export const LISTED_MUTATION_EVENT = 'fsdb:list-mutation' as const
export const SAVED_VIEW_EVENT = 'fsdb:saved-view' as const

export const INSPECTOR_REVEAL_EVENT = 'biu:inspector-reveal' as const
export const INSPECTOR_PANE_CLOSED_EVENT = 'biu:inspector-pane-closed' as const
export const INSPECTOR_OPEN_EVENT = 'biu:inspector-open' as const
export const INSPECTOR_CLOSE_EVENT = 'biu:inspector-close' as const
export const INSPECTOR_TOGGLE_EVENT = 'biu:inspector-toggle' as const
export const INSPECTOR_TAB_EVENT = 'biu:inspector-tab' as const
export const INSPECTOR_CAPTION_EVENT = 'biu:inspector-caption' as const

export const SHELL_LAYOUT_EVENT = 'biu:shell-layout' as const
export const SHELL_SIDEBAR_WIDTH_EVENT = 'biu:shell-sidebar-width' as const
export const TOGGLE_SHELL_SIDEBAR_EVENT = 'biu:toggle-shell-sidebar' as const
export const EXPAND_SHELL_SIDEBAR_EVENT = 'biu:expand-shell-sidebar' as const

export const PICK_MODE_EVENT = 'biu:pick-mode' as const
export const OPEN_SESSION_EVENT = 'biu:open-session' as const
export const ENABLE_PAGE_BLOCK_PLUGIN_EVENT = 'biu:enable-page-block-plugin' as const
export const PAGE_OUTLINE_EVENT = 'biu:page-outline' as const
export const PAGE_PREFS_EVENT = 'biu:page-prefs' as const
export const OPEN_TAG_EVENT = 'biu:open-tag' as const

export const FOCUS_RECORD_TITLE = 'biu:focus-record-title' as const
export const FOCUS_RECORD_CONTENT = 'biu:focus-record-content' as const
export const FOCUS_SHELL_TABLE = 'biu:focus-shell-table' as const
export const CLEAR_SHELL_TABLE_CELL = 'biu:clear-shell-table-cell' as const

export type FsdbEventMap = {
  [FSDB_SHARES_CHANGE_EVENT]: void
  [FSDB_CRUMB_LABELS_EVENT]: void
  [FSDB_LIST_READY_EVENT]: { path?: string } | void
  [FSDB_DETAIL_REFRESH_EVENT]: { path?: string; recordId?: string } | void
  [INSPECTOR_PANE_CLOSED_EVENT]: void
  [INSPECTOR_CLOSE_EVENT]: void
  [INSPECTOR_TOGGLE_EVENT]: void
  [SHELL_LAYOUT_EVENT]: void
  [TOGGLE_SHELL_SIDEBAR_EVENT]: void
  [EXPAND_SHELL_SIDEBAR_EVENT]: void
  [FOCUS_RECORD_TITLE]: void
  [FOCUS_RECORD_CONTENT]: void
  [FOCUS_SHELL_TABLE]: void
  [CLEAR_SHELL_TABLE_CELL]: void
}

/** 类型安全的事件派发：在无 window（如单测/SSR）环境下安全空操作，兼容原生 EventTarget 监听。 */
export function emitFsdbEvent<K extends keyof FsdbEventMap>(
  name: K,
  ...args: FsdbEventMap[K] extends void ? [] : [detail: FsdbEventMap[K]]
) {
  if (typeof window === 'undefined') return
  const detail = args[0]
  window.dispatchEvent(
    detail === undefined ? new Event(name) : new CustomEvent(name, { detail }),
  )
}

/** 类型安全的事件订阅，返回清理函数以防漏掉 removeEventListener。 */
export function onFsdbEvent<K extends keyof FsdbEventMap>(
  name: K,
  handler: (detail: FsdbEventMap[K], event: Event) => void,
): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener: EventListener = (event) => {
    const detail = (event as CustomEvent<FsdbEventMap[K]>).detail
    handler(detail, event)
  }
  window.addEventListener(name, listener)
  return () => {
    window.removeEventListener(name, listener)
  }
}
