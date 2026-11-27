/**
 * Unified typed frontend event bus singleton over `window` CustomEvents.
 * Preserves full wire-compatibility with `window.dispatchEvent` / `window.addEventListener`
 * while giving every `biu:*` event a single typed registry.
 */
export interface BiuEventMap {
  'biu:account-token': { token?: string; action?: string } | undefined
  'biu:workspace-profile': Record<string, unknown> | undefined
  'biu:workspace-meta': { workspaceId?: string; name?: string; avatar?: string } | undefined
  'biu:chat-config-changed': Record<string, unknown> | undefined
  'biu:inspector-reveal': Record<string, unknown> | undefined
  'biu:inspector-open': Record<string, unknown> | undefined
  'biu:inspector-close': Record<string, unknown> | undefined
  'biu:inspector-tab': Record<string, unknown> | undefined
  'biu:inspector-toggle': Record<string, unknown> | undefined
  'biu:inspector-caption': Record<string, unknown> | undefined
  'biu:inspector-pane-closed': Record<string, unknown> | undefined
  'biu:enable-page-block-plugin': { plugin: string; kind?: string }
  'biu:page-block-plugin-phase': { plugin: string; phase: string }
  'biu:pick-mode': Record<string, unknown> | undefined
  'biu:page-prefs': Record<string, unknown> | undefined
  'biu:composer-focus': Record<string, unknown> | undefined
  'biu:chat-outline-go': Record<string, unknown> | undefined
  'biu:page-outline': Record<string, unknown> | undefined
  'biu:asset-changed': Record<string, unknown> | undefined
  'biu:focus-record-title': Record<string, unknown> | undefined
  'biu:focus-record-content': Record<string, unknown> | undefined
}

export type BiuEventName = keyof BiuEventMap

export function emitAppEvent<K extends BiuEventName>(
  type: K,
  ...args: BiuEventMap[K] extends undefined ? [detail?: BiuEventMap[K]] : [detail: BiuEventMap[K]]
): boolean {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return false
  const detail = args[0]
  return window.dispatchEvent(
    detail === undefined ? new CustomEvent(type) : new CustomEvent(type, { detail }),
  )
}

export function onAppEvent<K extends BiuEventName>(
  type: K,
  handler: (detail: BiuEventMap[K], event: CustomEvent<BiuEventMap[K]>) => void,
): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {}
  }
  const listener = (event: Event) => {
    const custom = event as CustomEvent<BiuEventMap[K]>
    handler(custom.detail, custom)
  }
  window.addEventListener(type, listener)
  return () => window.removeEventListener(type, listener)
}

export function onAppEvents<K extends BiuEventName>(
  types: readonly K[],
  handler: (type: K, detail: BiuEventMap[K], event: CustomEvent<BiuEventMap[K]>) => void,
): () => void {
  const offs = types.map((t) => onAppEvent(t, (detail, event) => handler(t, detail, event)))
  return () => {
    for (const off of offs) off()
  }
}
